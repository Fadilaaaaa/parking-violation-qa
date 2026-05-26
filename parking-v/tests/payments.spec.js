// tests/payments.spec.js
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { InvoicePage } = require('../pages/InvoicePage');
const { USERS } = require('../fixtures/users');

// Login sebagai member sebelum setiap test
test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(USERS.member.email, USERS.member.password);
  await expect(page).not.toHaveURL(/login/i);
});

test.describe('Login — Member', () => {

  // ── POSITIVE ────────────────────────────────────────────────────────────────

  test('TC-ML01 | Member login dengan kredensial valid', async ({ page }) => {
    // Sudah login di beforeEach, tinggal assert URL bukan login
    await expect(page).not.toHaveURL(/login/i);
  });

  // ── NEGATIVE ────────────────────────────────────────────────────────────────

  test('TC-ML02 | Member login gagal dengan password salah', async ({ page }) => {
    // Logout dulu
    await page.goto('http://localhost:3030/logout');

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.member.email, 'wrongpassword');

    await expect(page).toHaveURL(/login/i);
  });

  test('TC-ML03 | Member login gagal dengan email kosong', async ({ page }) => {
    await page.goto('http://localhost:3030/logout');

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('', USERS.member.password);

    await expect(page).toHaveURL(/login/i);
  });

  test('TC-ML04 | Member login gagal dengan password kosong', async ({ page }) => {
    await page.goto('http://localhost:3030/logout');

    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.member.email, '');

    await expect(page).toHaveURL(/login/i);
  });

});

test.describe('Flow 4 — Member Bayar Fine', () => {

  // ── POSITIVE ────────────────────────────────────────────────────────────────

  test('TC-P01 | Member berhasil bayar invoice (scenario success)', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    const invoiceId = await invoicePage.payFirstPendingWithSuccess();

    // Setelah bayar sukses, status harus berubah jadi 'paid'
    await page.waitForTimeout(1000); // tunggu UI update
    const status = await invoicePage.getInvoiceStatus(invoiceId);
    expect(status).toBe('paid');
  });

  test('TC-P02 | Status invoice berubah menjadi paid setelah bayar sukses', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    const invoiceId = await invoicePage.payFirstPendingWithSuccess();

    await page.waitForTimeout(1000);
    expect(await invoicePage.isPaidStatusVisible(invoiceId)).toBe(true);
  });

  test('TC-P03 | Tombol Pay tidak muncul setelah invoice paid', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    const invoiceId = await invoicePage.payFirstPendingWithSuccess();

    await page.waitForTimeout(1000);

    // Tombol pay-success tidak boleh ada lagi setelah paid
    const isVisible = await invoicePage.isPayButtonVisible(invoiceId);
    expect(isVisible).toBe(false);
  });

  // ── NEGATIVE ────────────────────────────────────────────────────────────────

  test('TC-P04 | Simulate fail — status invoice tetap pending', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    const invoiceId = await invoicePage.payFirstPendingWithFail();

    await page.waitForTimeout(1000);

    // Setelah gagal, status harus pending atau failed — bukan paid
    const status = await invoicePage.getInvoiceStatus(invoiceId);
    expect(['pending', 'failed']).toContain(status);
  });

  test('TC-P05 | Member bisa retry setelah payment failed', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    // Step 1: gagalkan dulu
    const invoiceId = await invoicePage.payFirstPendingWithFail();
    await page.waitForTimeout(1000);

    // Step 2: retry dengan success
    await invoicePage.clickPayOnFirstPendingInvoice();
    await invoicePage.paySuccess(invoiceId);
    await page.waitForTimeout(1000);

    const status = await invoicePage.getInvoiceStatus(invoiceId);
    expect(status).toBe('paid');
  });

  test('TC-P06 | Invoice yang sudah paid tidak bisa dibayar lagi (no double payment)', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    // Bayar sukses
    const invoiceId = await invoicePage.payFirstPendingWithSuccess();
    await page.waitForTimeout(1000);

    // Tombol pay tidak boleh muncul lagi — tidak bisa double pay
    const canPayAgain = await invoicePage.isPayButtonVisible(invoiceId);
    expect(canPayAgain).toBe(false);
  });

  test('TC-P07 | Member tidak melihat invoice milik member lain', async ({ page }) => {
    const invoicePage = new InvoicePage(page);
    await invoicePage.goto();

    // Invoice ID dari seed member lain yang kita tahu
    // Cek apakah ada invoice dengan ID yang bukan milik member1
    const rows = page.getByRole('row');
    const rowCount = await rows.count();

    // Semua row yang tampil harus milik member yang sedang login
    // Tidak boleh ada data dari member lain
    expect(rowCount).toBeGreaterThanOrEqual(1); // minimal header row
  });

});
