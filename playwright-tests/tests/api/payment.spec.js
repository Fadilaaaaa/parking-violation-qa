// tests/api/payment.spec.js
// Tests Flow 4: payment success, failure, retry, and idempotency

const { test, expect } = require('@playwright/test');
const { login, submitViolation, getInvoices, payInvoice, API_BASE } = require('../helpers/api');

test.describe('Payment Flow (Flow 4)', () => {
  let officerToken, member1Token, member2Token;
  let pendingInvoiceId;

  test.beforeAll(async ({ request }) => {
    officerToken = await login(request, 'officer1@portal.test');
    member1Token = await login(request, 'member1@portal.test');
    member2Token = await login(request, 'member2@portal.test');

    // Submit a fresh violation to get a clean pending invoice
    const { body: violation } = await submitViolation(request, officerToken, {
      plate_number: 'B 1234 ABC',
      violation_type: 'expired_meter',
      occurred_at: '2026-10-01T03:00:00Z',
      location: 'Payment test violation',
    });

    // Get the invoice for this violation
    const { body: invoices } = await getInvoices(request, member1Token);
    const invoice = Array.isArray(invoices)
      ? invoices.find(i => i.violation_id === violation.id && i.status === 'pending')
      : null;

    if (invoice) pendingInvoiceId = invoice.id;
  });

  test('Invoice is created as pending after violation submitted', async ({ request }) => {
    const { body: invoices } = await getInvoices(request, member1Token);
    expect(Array.isArray(invoices)).toBe(true);
    const pending = invoices.filter(i => i.status === 'pending');
    expect(pending.length).toBeGreaterThan(0);
  });

  test('Failed payment leaves invoice as pending (can retry)', async ({ request }) => {
    test.skip(!pendingInvoiceId, 'No pending invoice available');

    const { status, body } = await payInvoice(request, member1Token, pendingInvoiceId, 'failed');
    expect(status).toBe(200);

    // Invoice should still be pending
    const res = await request.get(`${API_BASE}/invoices/${pendingInvoiceId}`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    const invoice = await res.json();
    expect(invoice.status).toBe('pending');
  });

  test('Retry after failed payment succeeds', async ({ request }) => {
    test.skip(!pendingInvoiceId, 'No pending invoice available');

    const { status, body } = await payInvoice(request, member1Token, pendingInvoiceId, 'success');
    expect(status).toBe(200);
    expect(body.status).toBe('paid');
  });

  test('[CRITICAL-04] Paying already-paid invoice returns 409', async ({ request }) => {
    test.skip(!pendingInvoiceId, 'No pending invoice available');

    // Invoice was just paid in previous test — try again
    const { status } = await payInvoice(request, member1Token, pendingInvoiceId, 'success');
    expect(
      status,
      'Second payment on paid invoice must return 409 Conflict, not 200'
    ).toBe(409);
  });

  test('[CRITICAL-04] Paid invoice status does not change after second pay attempt', async ({ request }) => {
    test.skip(!pendingInvoiceId, 'No pending invoice available');

    // Attempt a second payment
    await payInvoice(request, member1Token, pendingInvoiceId, 'success');

    // Status must still be paid (not changed to something else)
    const res = await request.get(`${API_BASE}/invoices/${pendingInvoiceId}`, {
      headers: { Authorization: `Bearer ${member1Token}` },
    });
    const invoice = await res.json();
    expect(invoice.status).toBe('paid');
  });

  test('Member cannot pay invoice with unknown ID → 404', async ({ request }) => {
    const res = await request.post(`${API_BASE}/invoices/nonexistent-id/pay`, {
      headers: { Authorization: `Bearer ${member1Token}` },
      data: { scenario: 'success' },
    });
    expect(res.status()).toBe(404);
  });

  test('Pay endpoint rejects invalid scenario value', async ({ request }) => {
    test.skip(!pendingInvoiceId, 'No pending invoice available');
    const res = await request.post(`${API_BASE}/invoices/${pendingInvoiceId}/pay`, {
      headers: { Authorization: `Bearer ${member1Token}` },
      data: { scenario: 'invalid_scenario' },
    });
    expect(res.status()).toBe(400);
  });
});
