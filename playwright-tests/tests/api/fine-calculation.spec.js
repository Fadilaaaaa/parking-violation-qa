// tests/api/fine-calculation.spec.js
// Verifies the formula: fine = base_amount × time_multiplier × repeat_multiplier
// These are the highest-risk tests — wrong math = wrong money

const { test, expect } = require('@playwright/test');
const { login, submitViolation, getInvoices, payInvoice, API_BASE } = require('../helpers/api');

// UTC times that map to specific Jakarta local times (UTC+7)
// Jakarta = UTC + 7h, so:
//   10:00 Jakarta = 03:00 UTC  → DAY   multiplier 1.0
//   23:00 Jakarta = 16:00 UTC  → NIGHT multiplier 1.5
//   03:00 Jakarta = 20:00 UTC prev day → NIGHT multiplier 1.5
//   22:30 Jakarta = 15:30 UTC  → NIGHT multiplier 1.5
//   06:00 Jakarta = 23:00 UTC prev day → boundary (undocumented)
//   22:00 Jakarta = 15:00 UTC  → boundary (undocumented)

const TIME = {
  DAY_1000:   '2026-06-01T03:00:00Z',  // 10:00 WIB
  DAY_1400:   '2026-06-01T07:00:00Z',  // 14:00 WIB
  NIGHT_2300: '2026-06-01T16:00:00Z',  // 23:00 WIB
  NIGHT_0300: '2026-06-01T20:00:00Z',  // 03:00 WIB next day
  NIGHT_2230: '2026-06-01T15:30:00Z',  // 22:30 WIB
  BOUNDARY_0600: '2026-06-01T23:00:00Z', // 06:00 WIB — boundary
  BOUNDARY_2200: '2026-06-01T15:00:00Z', // 22:00 WIB — boundary
};

test.describe('Fine Calculation — Time Multiplier (Flow 2)', () => {
  let officerToken;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
  });

  // ── DAY multiplier (1.0) ──────────────────────────────────────────────────

  test('expired_meter at 10:00 Jakarta (day) → fine = 50,000', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      violation_type: 'expired_meter',
      occurred_at: TIME.DAY_1000,
      location: 'Test day multiplier',
    });
    expect(status).toBe(201);
    expect(body.final_amount).toBe(50000);
    expect(body.fine_breakdown.time_multiplier).toBe(1.0);
    expect(body.fine_breakdown.base_amount).toBe(50000);
  });

  test('blocking_hydrant at 14:00 Jakarta (day) → fine = 250,000', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 3456 CDE',
      violation_type: 'blocking_hydrant',
      occurred_at: TIME.DAY_1400,
      location: 'Test day blocking_hydrant',
    });
    expect(status).toBe(201);
    expect(body.final_amount).toBe(250000);
    expect(body.fine_breakdown.time_multiplier).toBe(1.0);
  });

  // ── NIGHT multiplier (1.5) ────────────────────────────────────────────────

  test('[CRITICAL-01] expired_meter at 23:00 Jakarta (night) → fine = 75,000', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 2345 BCD',
      violation_type: 'expired_meter',
      occurred_at: TIME.NIGHT_2300,
      location: 'Test night multiplier',
    });
    expect(status).toBe(201);
    expect(
      body.final_amount,
      `Expected 75000 (50000 × 1.5), got ${body.final_amount}. Night multiplier not applied.`
    ).toBe(75000);
    expect(body.fine_breakdown.time_multiplier).toBe(1.5);
  });

  test('[CRITICAL-01] no_parking_zone at 03:00 Jakarta (night) → fine = 225,000', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 3456 CDE',
      violation_type: 'no_parking_zone',
      occurred_at: TIME.NIGHT_0300,
      location: 'Test night no_parking_zone',
    });
    expect(status).toBe(201);
    expect(
      body.final_amount,
      `Expected 225000 (150000 × 1.5), got ${body.final_amount}`
    ).toBe(225000);
  });

  test('[CRITICAL-01] disabled_spot at 22:30 Jakarta (night) → fine = 750,000', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 4567 DEF',
      violation_type: 'disabled_spot',
      occurred_at: TIME.NIGHT_2230,
      location: 'Test night disabled_spot',
    });
    expect(status).toBe(201);
    expect(
      body.final_amount,
      `Expected 750000 (500000 × 1.5), got ${body.final_amount}`
    ).toBe(750000);
  });

  // ── Boundary conditions (undocumented in spec — document actual behaviour) ──

  test('[BOUNDARY] time multiplier at exactly 06:00 Jakarta — document actual behaviour', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      violation_type: 'expired_meter',
      occurred_at: TIME.BOUNDARY_0600,
      location: 'Test boundary 06:00',
    });
    expect(status).toBe(201);
    // Not asserting a specific value — asserting it's one of the two valid options
    // and logging which one the system chose, so product can confirm/deny
    const multiplier = body.fine_breakdown.time_multiplier;
    expect([1.0, 1.5]).toContain(multiplier);
    console.log(`[BOUNDARY] 06:00 Jakarta uses time_multiplier = ${multiplier}`);
  });

  test('[BOUNDARY] time multiplier at exactly 22:00 Jakarta — document actual behaviour', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 2345 BCD',
      violation_type: 'expired_meter',
      occurred_at: TIME.BOUNDARY_2200,
      location: 'Test boundary 22:00',
    });
    expect(status).toBe(201);
    const multiplier = body.fine_breakdown.time_multiplier;
    expect([1.0, 1.5]).toContain(multiplier);
    console.log(`[BOUNDARY] 22:00 Jakarta uses time_multiplier = ${multiplier}`);
  });
});

test.describe('Fine Calculation — Repeat Multiplier (Flow 2)', () => {
  let officerToken, member4Token;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
    member4Token = await login(request, 'member4@portal.test');
  });

  // Use B 5678 EFG (member4) — submit 3 violations without paying any
  // Each should escalate the multiplier

  test('1st violation (0 prior unpaid) → repeat_multiplier = 1.0', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 5678 EFG',
      violation_type: 'expired_meter',
      occurred_at: '2026-09-01T03:00:00Z',
    });
    expect(status).toBe(201);
    expect(body.fine_breakdown.repeat_multiplier).toBe(1.0);
    expect(body.final_amount).toBe(50000); // 50000 × 1.0 × 1.0
  });

  test('2nd violation (1 prior unpaid) → repeat_multiplier = 1.5', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 5678 EFG',
      violation_type: 'expired_meter',
      occurred_at: '2026-09-02T03:00:00Z',
    });
    expect(status).toBe(201);
    expect(body.fine_breakdown.repeat_multiplier).toBe(1.5);
    expect(body.final_amount).toBe(75000); // 50000 × 1.0 × 1.5
  });

  test('3rd violation (2+ prior unpaid) → repeat_multiplier = 2.0', async ({ request }) => {
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 5678 EFG',
      violation_type: 'expired_meter',
      occurred_at: '2026-09-03T03:00:00Z',
    });
    expect(status).toBe(201);
    expect(body.fine_breakdown.repeat_multiplier).toBe(2.0);
    expect(body.final_amount).toBe(100000); // 50000 × 1.0 × 2.0
  });

  test('[CRITICAL-02] Paid violation should NOT count toward repeat multiplier', async ({ request }) => {
    // Use B 6789 FGH (member5) — pay all existing invoices, then submit new violation
    const member5Token = await login(request, 'member5@portal.test');

    // Pay all pending invoices for member5
    const { body: invoices } = await getInvoices(request, member5Token);
    if (Array.isArray(invoices)) {
      for (const inv of invoices.filter(i => i.status === 'pending')) {
        await payInvoice(request, member5Token, inv.id, 'success');
      }
    }

    // Now submit a new violation — should have 0 unpaid prior → multiplier 1.0
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 6789 FGH',
      violation_type: 'expired_meter',
      occurred_at: '2026-09-10T03:00:00Z',
      location: 'After paying — repeat should be 1.0',
    });
    expect(status).toBe(201);
    expect(
      body.fine_breakdown.repeat_multiplier,
      'After paying all invoices, repeat_multiplier should reset to 1.0'
    ).toBe(1.0);
  });

  test('[BOUNDARY] Violation older than 90 days not counted in repeat multiplier', async ({ request }) => {
    // Submit a violation that occurred > 90 days before the next one
    // First violation: 2026-01-01 (well outside 90-day window of 2026-09-15)
    await submitViolation(request, officerToken, {
      plate_number: 'B 3456 CDE',
      violation_type: 'expired_meter',
      occurred_at: '2026-01-01T03:00:00Z',
      location: 'Old violation outside 90 days',
    });

    // New violation: 2026-09-15 (>90 days later) — should not count old one
    const { status, body } = await submitViolation(request, officerToken, {
      plate_number: 'B 3456 CDE',
      violation_type: 'expired_meter',
      occurred_at: '2026-09-15T03:00:00Z',
      location: 'New violation after 90 day window',
    });
    expect(status).toBe(201);
    expect(
      body.fine_breakdown.repeat_multiplier,
      'Violation > 90 days old should not count as prior unpaid'
    ).toBe(1.0);
  });
});
