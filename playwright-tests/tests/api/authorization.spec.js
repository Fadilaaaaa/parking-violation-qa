// tests/api/authorization.spec.js
// Tests every endpoint with wrong-role and wrong-owner tokens
// Any failure here = security defect

const { test, expect } = require('@playwright/test');
const { login, submitViolation, getInvoices, API_BASE } = require('../helpers/api');

test.describe('Authorization Matrix', () => {
  let officerToken, member1Token, member2Token;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
    member1Token = await login(request, 'member1@portal.test');
    member2Token = await login(request, 'member2@portal.test');
  });

  // ── Officer-only endpoints ────────────────────────────────────────────────

  test('Member cannot GET /violations (officer-only) → 403', async ({ request }) => {
    const res = await request.get(`${API_BASE}/violations`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Member cannot POST /violations (officer-only) → 403', async ({ request }) => {
    const res = await request.post(`${API_BASE}/violations`, {
      headers: { Authorization: `Bearer ${member1Token}` },
      data: {
        plate_number: 'B 1234 ABC',
        violation_type: 'expired_meter',
        location: 'Jl. Test',
        occurred_at: '2026-06-01T03:00:00Z',
      },
    });
    expect(res.status()).toBe(403);
  });

  test('Member cannot POST /rule-versions (officer-only) → 403', async ({ request }) => {
    const res = await request.post(`${API_BASE}/rule-versions`, {
      headers: { Authorization: `Bearer ${member1Token}` },
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test('Member cannot GET /audit/events (officer-only) → 403', async ({ request }) => {
    const res = await request.get(`${API_BASE}/audit/events`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    expect(res.status()).toBe(403);
  });

  // ── Member-only endpoints ─────────────────────────────────────────────────

  test('Officer cannot GET /invoices (member-only) → 403', async ({ request }) => {
    const res = await request.get(`${API_BASE}/invoices`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('Officer cannot GET /transactions (member-only) → 403', async ({ request }) => {
    const res = await request.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${officerToken}` },
    });
    expect(res.status()).toBe(403);
  });

  // ── Cross-member ownership isolation ─────────────────────────────────────
  // CRITICAL-03: member2 must not access member1's data

  test('[CRITICAL-03] Member2 cannot GET member1 invoice → 403', async ({ request }) => {
    // Get an invoice that belongs to member1
    const { body: invoices } = await getInvoices(request, member1Token);
    const invoice = Array.isArray(invoices) && invoices[0];
    test.skip(!invoice, 'No invoices found for member1');

    const res = await request.get(`${API_BASE}/invoices/${invoice.id}`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    expect(
      res.status(),
      'member2 should not be able to read member1 invoice'
    ).toBe(403);
  });

  test('[CRITICAL-03] Member2 cannot PAY member1 invoice → 403', async ({ request }) => {
    const { body: invoices } = await getInvoices(request, member1Token);
    const pending = Array.isArray(invoices) && invoices.find(i => i.status === 'pending');
    test.skip(!pending, 'No pending invoices found for member1');

    const res = await request.post(`${API_BASE}/invoices/${pending.id}/pay`, {
      headers: { Authorization: `Bearer ${member2Token}` },
      data: { scenario: 'success' },
    });
    expect(
      res.status(),
      'member2 should not be able to pay member1 invoice'
    ).toBe(403);
  });

  test('[CRITICAL-03] Member2 cannot GET member1 violation → 403', async ({ request }) => {
    // Submit a violation for member1's plate, then try to read it as member2
    const { body: violation } = await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      occurred_at: '2026-08-01T03:00:00Z',
    });
    test.skip(!violation?.id, 'Could not create test violation');

    const res = await request.get(`${API_BASE}/violations/${violation.id}`, {
      headers: { Authorization: `Bearer ${member2Token}` },
    });
    expect(
      res.status(),
      'member2 should not be able to read violation belonging to member1 plate'
    ).toBe(403);
  });
});
