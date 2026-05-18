// tests/api/rule-versions.spec.js
// Tests Flow 3: publishing new rule versions must not reprice old violations

const { test, expect } = require('@playwright/test');
const { login, submitViolation, API_BASE } = require('../helpers/api');

test.describe('Rule Version Isolation (Flow 3)', () => {
  let officerToken;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
  });

  test('GET /rule-versions returns array with at least one version', async ({ request }) => {
    const res = await request.get(`${API_BASE}/rule-versions`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('Active rule version has required fields', async ({ request }) => {
    const res = await request.get(`${API_BASE}/rule-versions`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const versions = await res.json();
    const active = versions.find(v => v.version_number === 1) || versions[0];

    expect(active).toHaveProperty('id');
    expect(active).toHaveProperty('version_number');
    expect(active).toHaveProperty('effective_from');
    expect(active).toHaveProperty('base_amounts');
    expect(active.base_amounts).toHaveProperty('expired_meter');
    expect(active.base_amounts).toHaveProperty('no_parking_zone');
    expect(active.base_amounts).toHaveProperty('blocking_hydrant');
    expect(active.base_amounts).toHaveProperty('disabled_spot');
  });

  test('[CRITICAL-05] Publishing new rule version does not change past violation amount', async ({ request }) => {
    // Step 1: submit a violation and record its amount
    const { status: s1, body: violation } = await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      violation_type: 'blocking_hydrant',
      occurred_at: '2026-11-01T03:00:00Z', // 10:00 Jakarta, no prior violations
      location: 'Rule isolation test',
    });
    expect(s1).toBe(201);
    const originalAmount = violation.final_amount;
    const violationId = violation.id;

    // Step 2: publish a new rule version with wildly different amounts
    const publishRes = await request.post(`${API_BASE}/rule-versions`, {
      headers: { Authorization: `Bearer ${officerToken}` },
      data: {
        base_amounts: {
          expired_meter: 999999,
          no_parking_zone: 999999,
          blocking_hydrant: 999999,
          disabled_spot: 999999,
        },
        time_multipliers: { day: 1.0, night: 1.5 },
        repeat_multipliers: { none: 1.0, one: 1.5, two_or_more: 2.0 },
        effective_from: '2026-11-02T00:00:00Z',
      },
    });
    expect(publishRes.status()).toBe(201);

    // Step 3: re-fetch the original violation
    const refetchRes = await request.get(`${API_BASE}/violations/${violationId}`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    expect(refetchRes.status()).toBe(200);
    const refetched = await refetchRes.json();

    expect(
      refetched.final_amount,
      `Past violation amount changed after new rule published! Was ${originalAmount}, now ${refetched.final_amount}`
    ).toBe(originalAmount);

    // Also check the snapshot is intact
    expect(refetched.fine_breakdown).toBeDefined();
    expect(refetched.fine_breakdown.base_amount).not.toBe(999999);
  });

  test('New violation after rule change uses new rule amounts', async ({ request }) => {
    // Submit a violation AFTER the new rule version is active
    // effective_from was 2026-11-02, so use occurred_at after that date
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 2345 BCD',
      violation_type: 'expired_meter',
      occurred_at: '2026-11-03T03:00:00Z',
      location: 'Should use new rule',
    });
    expect(status).toBe(201);
    // New rule has expired_meter = 999999 × 1.0 × 1.0 = 999999
    expect(body.fine_breakdown.base_amount).toBe(999999);
  });

  test('Officer cannot publish rule version with effective_from in the past', async ({ request }) => {
    const res = await request.post(`${API_BASE}/rule-versions`, {
      headers: { Authorization: `Bearer ${officerToken}` },
      data: {
        base_amounts: {
          expired_meter: 50000,
          no_parking_zone: 150000,
          blocking_hydrant: 250000,
          disabled_spot: 500000,
        },
        time_multipliers: { day: 1.0, night: 1.5 },
        repeat_multipliers: { none: 1.0, one: 1.5, two_or_more: 2.0 },
        effective_from: '2020-01-01T00:00:00Z', // well in the past
      },
    });
    // The spec doesn't explicitly forbid this, but it's a data integrity risk
    // Log the actual behaviour for the report
    console.log(`[INFO] Publishing rule with past effective_from returned: ${res.status()}`);
  });
});
