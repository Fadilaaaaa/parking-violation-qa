// tests/api/auth.spec.js
const { test, expect } = require('@playwright/test');
const { login, API_BASE } = require('../helpers/api');

test.describe('Authentication', () => {
  test('GET /health returns 200 without token', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('POST /auth/login returns token for valid credentials', async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'officer1@portal.test', password: 'password' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(typeof body.token).toBe('string');
  });

  test('POST /auth/login returns 401 for wrong password', async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'officer1@portal.test', password: 'wrongpassword' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /auth/login returns 401 for unknown email', async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'nobody@portal.test', password: 'password' },
    });
    expect(res.status()).toBe(401);
  });

  test('Protected endpoint returns 401 without token', async ({ request }) => {
    const res = await request.get(`${API_BASE}/violations`);
    expect(res.status()).toBe(401);
  });

  test('Protected endpoint returns 401 with malformed token', async ({ request }) => {
    const res = await request.get(`${API_BASE}/violations`, {
      headers: { Authorization: 'Bearer not_a_real_token' },
    });
    expect(res.status()).toBe(401);
  });
});
