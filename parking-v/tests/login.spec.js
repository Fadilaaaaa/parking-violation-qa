// tests/login.spec.js
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { USERS } = require('../fixtures/users');

test.describe('Login — Officer', () => {

  // ── POSITIVE ────────────────────────────────────────────────────────────────

  test('TC-L01 | Officer login dengan kredensial valid', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.officer.email, USERS.officer.password);

    // Harus redirect keluar dari halaman login
    await expect(page).not.toHaveURL(/login/i);
  });

  // ── NEGATIVE ────────────────────────────────────────────────────────────────

  test('TC-L02 | Login gagal dengan password salah', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.officer.email, 'wrongpassword');

    // Harus tetap di halaman login
    await expect(page).toHaveURL(/login/i);
  });

  test('TC-L03 | Login gagal dengan email tidak terdaftar', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('tidakterdaftar@portal.test', USERS.officer.password);

    await expect(page).toHaveURL(/login/i);
  });

  test('TC-L04 | Login gagal dengan email kosong', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('', USERS.officer.password);

    await expect(page).toHaveURL(/login/i);
  });

  test('TC-L05 | Login gagal dengan password kosong', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.officer.email, '');

    await expect(page).toHaveURL(/login/i);
  });

  test('TC-L06 | Login gagal dengan email dan password kosong', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('', '');

    await expect(page).toHaveURL(/login/i);
  });

});
