// tests/helpers/api.js
// Shared helpers for API tests

const API_BASE = 'http://localhost:8090';

/**
 * Login and return a JWT token
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} email
 * @param {string} password
 */
async function login(request, email, password = 'password') {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  const body = await res.json();
  return body.token;
}

/**
 * Submit a violation as officer and return the response body
 */
async function submitViolation(request, token, overrides = {}) {
  const defaults = {
    plate_number: 'B 1234 ABC',
    violation_type: 'expired_meter',
    location: 'Jl. Test',
    occurred_at: '2026-06-01T03:00:00Z', // 10:00 Jakarta = DAY
  };
  const res = await request.post(`${API_BASE}/violations`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { ...defaults, ...overrides },
  });
  return { status: res.status(), body: await res.json() };
}

/**
 * Get invoices for a member
 */
async function getInvoices(request, token) {
  const res = await request.get(`${API_BASE}/invoices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status(), body: await res.json() };
}

/**
 * Pay an invoice
 */
async function payInvoice(request, token, invoiceId, scenario = 'success') {
  const res = await request.post(`${API_BASE}/invoices/${invoiceId}/pay`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { scenario },
  });
  return { status: res.status(), body: await res.json() };
}

module.exports = { login, submitViolation, getInvoices, payInvoice, API_BASE };
