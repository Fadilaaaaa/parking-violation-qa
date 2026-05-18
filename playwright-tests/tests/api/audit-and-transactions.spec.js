// tests/api/audit-and-transactions.spec.js
// Tests audit trail completeness (Flow 5) and transaction history snapshot correctness

const { test, expect } = require('@playwright/test');
const { login, submitViolation, getInvoices, payInvoice, API_BASE } = require('../helpers/api');

test.describe('Audit Trail (Flow 5)', () => {
  let officerToken, member1Token;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
    member1Token = await login(request, 'member1@portal.test');
  });

  test('violation.created event exists in audit log', async ({ request }) => {
    // Submit a violation to ensure the event exists
    await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      occurred_at: '2026-12-01T03:00:00Z',
      location: 'Audit trail test',
    });

    const res = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    expect(res.status()).toBe(200);
    const events = await res.json();
    const types = events.map(e => e.event_type);
    expect(types).toContain('violation.created');
  });

  test('rule_version.published event exists in audit log', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const events = await res.json();
    const types = events.map(e => e.event_type);
    expect(types).toContain('rule_version.published');
  });

  test('payment.attempted event exists after payment attempt', async ({ request }) => {
    // Get a pending invoice and attempt payment
    const { body: invoices } = await getInvoices(request, member1Token);
    const pending = Array.isArray(invoices) && invoices.find(i => i.status === 'pending');
    test.skip(!pending, 'No pending invoices to test with');

    await payInvoice(request, member1Token, pending.id, 'failed');

    const res = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const events = await res.json();
    const types = events.map(e => e.event_type);
    expect(types).toContain('payment.attempted');
  });

  test('[MAJOR-04] payment.failed event exists after failed payment', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const events = await res.json();
    const types = events.map(e => e.event_type);
    expect(
      types,
      'payment.failed audit event missing — MAJOR-04'
    ).toContain('payment.failed');
  });

  test('invoice.paid event exists after successful payment', async ({ request }) => {
    const { body: invoices } = await getInvoices(request, member1Token);
    const pending = Array.isArray(invoices) && invoices.find(i => i.status === 'pending');
    test.skip(!pending, 'No pending invoices to test with');

    await payInvoice(request, member1Token, pending.id, 'success');

    const res = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const events = await res.json();
    const types = events.map(e => e.event_type);
    expect(types).toContain('invoice.paid');
  });

  test('Audit events are append-only — count never decreases', async ({ request }) => {
    const res1 = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const count1 = (await res1.json()).length;

    // Submit another violation
    await submitViolation(request, officerToken, {
      plate_number: 'B 2345 BCD',
      occurred_at: '2026-12-02T03:00:00Z',
    });

    const res2 = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    const count2 = (await res2.json()).length;

    expect(count2).toBeGreaterThan(count1);
  });
});

test.describe('Transaction History (Flow 5)', () => {
  let officerToken, member1Token;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
    member1Token = await login(request, 'member1@portal.test');
  });

  test('GET /transactions returns array for member', async ({ request }) => {
    const res = await request.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('Each transaction entry has required spec fields', async ({ request }) => {
    const res = await request.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    const txs = await res.json();
    test.skip(txs.length === 0, 'No transactions yet');

    const tx = txs[0];
    expect(tx).toHaveProperty('violation_id');
    expect(tx).toHaveProperty('occurred_at');
    expect(tx).toHaveProperty('violation_type');
    expect(tx).toHaveProperty('fine_breakdown');
    expect(tx).toHaveProperty('rule_version');
    expect(tx).toHaveProperty('invoice_status');
    expect(tx.fine_breakdown).toHaveProperty('base_amount');
    expect(tx.fine_breakdown).toHaveProperty('time_multiplier');
    expect(tx.fine_breakdown).toHaveProperty('repeat_multiplier');
    expect(tx.fine_breakdown).toHaveProperty('final_amount');
    expect(tx.rule_version).toHaveProperty('id');
    expect(tx.rule_version).toHaveProperty('version_number');
  });

  test('[MAJOR-03] Transaction amounts come from snapshot, not current rule version', async ({ request }) => {
    // Submit a violation under the current rule (v1: expired_meter = 50000)
    const { body: violation } = await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      violation_type: 'expired_meter',
      occurred_at: '2026-12-10T03:00:00Z',
      location: 'Snapshot test',
    });
    const originalAmount = violation.final_amount; // should be 50000

    // Publish a new rule with a very different amount
    await request.post(`${API_BASE}/rule-versions`, {
      headers: { Authorization: `Bearer ${officerToken}` },
      data: {
        base_amounts: {
          expired_meter: 888888,
          no_parking_zone: 888888,
          blocking_hydrant: 888888,
          disabled_spot: 888888,
        },
        time_multipliers: { day: 1.0, night: 1.5 },
        repeat_multipliers: { none: 1.0, one: 1.5, two_or_more: 2.0 },
        effective_from: '2026-12-11T00:00:00Z',
      },
    });

    // Check transaction history — amount must match original snapshot
    const res = await request.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    const txs = await res.json();
    const tx = txs.find(t => t.violation_id === violation.id);
    test.skip(!tx, 'Transaction not found for violation');

    expect(
      tx.fine_breakdown.final_amount,
      `Transaction shows ${tx.fine_breakdown.final_amount} but should show original snapshot amount ${originalAmount}`
    ).toBe(originalAmount);
  });

  test('Member only sees their own transactions', async ({ request }) => {
    const member2Token = await login(request, 'member2@portal.test');

    const res1 = await request.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    const res2 = await request.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });

    const txs1 = await res1.json();
    const txs2 = await res2.json();

    // Violation IDs should not overlap
    const ids1 = new Set(txs1.map(t => t.violation_id));
    const ids2 = new Set(txs2.map(t => t.violation_id));
    const overlap = [...ids1].filter(id => ids2.has(id));

    expect(
      overlap.length,
      `Transactions leaked between members: ${overlap.join(', ')}`
    ).toBe(0);
  });
});
