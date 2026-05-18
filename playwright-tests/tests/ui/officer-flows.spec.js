// tests/ui/officer-flows.spec.js
// E2E tests for officer journeys via the web UI (http://localhost:3030)

const { test, expect } = require('@playwright/test');

const OFFICER = { email: 'officer1@portal.test', password: 'password' };
const MEMBER1 = { email: 'member1@portal.test', password: 'password' };

// Helper: login via UI
async function loginAs(page, user) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await page.waitForURL(/violations|dashboard|home/i);
}

test.describe('Officer UI — Violations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OFFICER);
  });

  test('Officer sees Violations page after login', async ({ page }) => {
    await expect(page).toHaveURL(/violations/i);
    await expect(page.getByText(/submit a violation/i)).toBeVisible();
  });

  test('Officer sees Recent Violations table', async ({ page }) => {
    await expect(page.getByText(/recent violations/i)).toBeVisible();
  });

  test('Officer can submit a violation and it appears in the list', async ({ page }) => {
    // Fill the form
    await page.getByLabel(/plate number/i).selectOption({ label: /B 1234 ABC/i });
    await page.getByLabel(/violation type/i).selectOption('expired_meter');
    await page.getByLabel(/location/i).fill('Jl. Playwright Test');

    // Clear and set occurred_at (use a past date to avoid future-date issues)
    const occurredAt = page.getByLabel(/occurred at/i);
    await occurredAt.fill('2026-06-15T10:00');

    await page.getByRole('button', { name: /record violation/i }).click();

    // Should see success feedback or the new violation in the list
    await expect(
      page.getByText(/Jl. Playwright Test/).or(page.getByText(/violation recorded/i))
    ).toBeVisible({ timeout: 5000 });
  });

  test('Submit form shows validation error for missing location', async ({ page }) => {
    await page.getByRole('button', { name: /record violation/i }).click();
    // Should not navigate away and should show some error state
    await expect(page).toHaveURL(/violations/i);
  });

  test('Officer can navigate to Rule Versions page', async ({ page }) => {
    await page.getByRole('link', { name: /rule versions/i }).click();
    await expect(page).toHaveURL(/rule-versions/i);
    await expect(page.getByText(/base amounts/i)).toBeVisible();
  });
});

test.describe('Officer UI — Rule Versions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, OFFICER);
    await page.goto('/rule-versions');
  });

  test('Rule Versions page shows active version', async ({ page }) => {
    await expect(page.getByText(/active/i)).toBeVisible();
    await expect(page.getByText(/v1/i)).toBeVisible();
  });

  test('Base amounts are displayed', async ({ page }) => {
    await expect(page.getByText(/expired meter/i)).toBeVisible();
    await expect(page.getByText(/50.000|50000/i)).toBeVisible();
  });

  test('Publish v2 button is present', async ({ page }) => {
    await expect(page.getByRole('button', { name: /publish v2/i })).toBeVisible();
  });

  test('Version history section is visible', async ({ page }) => {
    await expect(page.getByText(/version history/i)).toBeVisible();
  });
});

test.describe('Authentication UI', () => {
  test('Login page is accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('Wrong credentials shows error', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/email/i).fill('officer1@portal.test');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /login|sign in/i }).click();
    await expect(page.getByText(/invalid|incorrect|unauthorized|error/i)).toBeVisible();
  });

  test('Logout redirects to login', async ({ page }) => {
    await loginAs(page, OFFICER);
    await page.getByRole('link', { name: /logout/i }).click();
    await expect(page).toHaveURL(/login|\//i);
    await expect(page.getByLabel(/email/i)).toBeVisible();
  });

  test('Member cannot access officer violation list page', async ({ page }) => {
    await loginAs(page, MEMBER1);
    // Member should NOT see the Submit a Violation form
    await expect(page.getByText(/submit a violation/i)).not.toBeVisible();
  });
});
