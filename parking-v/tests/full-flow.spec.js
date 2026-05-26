// tests/full-flow.spec.js
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { ViolationPage } = require('../pages/ViolationPage');
const { InvoicePage } = require('../pages/InvoicePage');
const { USERS, VIOLATION } = require('../fixtures/users');

test('Full Flow — Officer submit violation, Member bayar fine', async ({ page }) => {

  // ── STEP 1: Login sebagai Officer ─────────────────────────────────────────
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(USERS.officer.email, USERS.officer.password);
  await expect(page).not.toHaveURL(/login/i);

  // ── STEP 2: Officer submit violation ──────────────────────────────────────
  const violationPage = new ViolationPage(page);
  await violationPage.submitViolation({
    plate: VIOLATION.validPlate,
    type: VIOLATION.validType,
    location: VIOLATION.validLocation,
    occurredAt: VIOLATION.validOccurredAt,
  });

  // Pastikan tidak ada error setelah submit
  await expect(page.getByTestId('error')).not.toBeVisible();

  // ── STEP 3: Logout Officer ─────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/login/i);

  // ── STEP 4: Login sebagai Member ───────────────────────────────────────────
  await loginPage.goto();
  await loginPage.login(USERS.member.email, USERS.member.password);
  await expect(page).not.toHaveURL(/login/i);

  // ── STEP 5: Member bayar invoice ───────────────────────────────────────────
  const invoicePage = new InvoicePage(page);
  await invoicePage.goto();

  const invoiceId = await invoicePage.payFirstPendingWithSuccess();

  // ── STEP 6: Verifikasi status jadi paid ────────────────────────────────────
  await page.waitForTimeout(1000);
  const status = await invoicePage.getInvoiceStatus(invoiceId);
  expect(status).toBe('paid');

});
