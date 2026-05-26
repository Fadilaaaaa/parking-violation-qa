// tests/violations.spec.js
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { ViolationPage } = require('../pages/ViolationPage');
const { USERS, VIOLATION } = require('../fixtures/users');

// Login sekali sebelum semua test di file ini
test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(USERS.officer.email, USERS.officer.password);
  await expect(page).not.toHaveURL(/login/i);
});

test.describe('Flow 1 — Officer Submit Violation', () => {

  // ── POSITIVE ────────────────────────────────────────────────────────────────

  test('TC-V01 | Submit violation valid (happy path)', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: VIOLATION.validType,
      location: VIOLATION.validLocation,
      occurredAt: VIOLATION.validOccurredAt,
    });

    // Tidak boleh ada error setelah submit
    await expect(page.getByTestId('error')).not.toBeVisible();
  });

  test('TC-V02 | Submit violation tipe expired_meter berhasil', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: 'expired_meter',
      location: 'Jl. Thamrin No. 5',
      occurredAt: VIOLATION.validOccurredAt,
    });

    await expect(page.getByTestId('error')).not.toBeVisible();
  });

  test('TC-V03 | Submit violation tipe blocking_hydrant berhasil', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: 'blocking_hydrant',
      location: 'Jl. Gatot Subroto No. 3',
      occurredAt: VIOLATION.validOccurredAt,
    });

    await expect(page.getByTestId('error')).not.toBeVisible();
  });

  test('TC-V04 | Submit violation tipe disabled_spot berhasil', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: 'disabled_spot',
      location: 'Jl. Imam Bonjol No. 7',
      occurredAt: VIOLATION.validOccurredAt,
    });

    await expect(page.getByTestId('error')).not.toBeVisible();
  });

  test('TC-V05 | Submit violation malam hari (time multiplier 1.5)', async ({ page }) => {
    const v = new ViolationPage(page);

    // 23:00 WIB → multiplier 1.5 → expired_meter = 50,000 × 1.5 = 75,000
    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: 'expired_meter',
      location: 'Jl. Sudirman No. 1',
      occurredAt: VIOLATION.nightOccurredAt,
    });

    await expect(page.getByTestId('error')).not.toBeVisible();
  });

  // ── NEGATIVE ────────────────────────────────────────────────────────────────

  test('TC-V06 | Submit gagal jika location kosong', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: VIOLATION.validType,
      location: '',
      occurredAt: VIOLATION.validOccurredAt,
    });

    // Harus ada validasi error
    await expect(page.getByTestId('error')).toBeVisible();
  });

  test('TC-V07 | Submit gagal jika occurred_at kosong', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: VIOLATION.validType,
      location: VIOLATION.validLocation,
      occurredAt: '',
    });

    await expect(page.getByTestId('error')).toBeVisible();
  });

  test('TC-V08 | Submit gagal jika occurred_at di masa depan', async ({ page }) => {
    const v = new ViolationPage(page);

    await v.submitViolation({
      plate: VIOLATION.validPlate,
      type: VIOLATION.validType,
      location: VIOLATION.validLocation,
      occurredAt: '2099-01-01T00:00', // jauh di masa depan
    });

    await expect(page.getByTestId('error')).toBeVisible();
  });

  test('TC-V09 | Submit gagal jika violation type tidak dipilih', async ({ page }) => {
    const v = new ViolationPage(page);

    // Langsung klik submit tanpa pilih type
    await page.getByTestId('plate').selectOption(VIOLATION.validPlate);
    await page.getByTestId('location').fill(VIOLATION.validLocation);
    await page.getByTestId('occurred-at').fill(VIOLATION.validOccurredAt);
    await page.getByTestId('submit-violation').click();

    await expect(page.getByTestId('error')).toBeVisible();
  });

  test('TC-V10 | Submit gagal jika plate tidak dipilih', async ({ page }) => {
    const v = new ViolationPage(page);

    // Langsung klik submit tanpa pilih plate
    await page.getByTestId('vtype').selectOption(VIOLATION.validType);
    await page.getByTestId('location').fill(VIOLATION.validLocation);
    await page.getByTestId('occurred-at').fill(VIOLATION.validOccurredAt);
    await page.getByTestId('submit-violation').click();

    await expect(page.getByTestId('error')).toBeVisible();
  });

});
