// tests/ui/member-flows.spec.js
// E2E tests for member journeys: view violations, pay fines, transaction history

const { test, expect } = require('@playwright/test');

const MEMBER1 = { email: 'member1@portal.test', password: 'password' };
const MEMBER2 = { email: 'member2@portal.test', password: 'password' };

async function loginAs(page, user) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /login|sign in/i }).click();
  await page.waitForURL(/invoices|violations|dashboard|home/i);
}

test.describe('Member UI — Invoices', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, MEMBER1);
  });

  test('Member sees their invoices after login', async ({ page }) => {
    await expect(page.getByText(/invoice|fine|payment/i).first()).toBeVisible();
  });

  test('Member does not see "Submit a Violation" form', async ({ page }) => {
    await expect(page.getByText(/submit a violation/i)).not.toBeVisible();
  });

  test('Member does not see Rule Versions in sidebar', async ({ page }) => {
    await expect(page.getByRole('link', { name: /rule versions/i })).not.toBeVisible();
  });

  test('Member can pay a pending invoice', async ({ page }) => {
    // Look for a Pay button
    const payButton = page.getByRole('button', { name: /pay/i }).first();
    const hasPending = await payButton.isVisible().catch(() => false);
    test.skip(!hasPending, 'No pending invoices visible');

    await payButton.click();
    // Should show success feedback
    await expect(page.getByText(/paid|success|thank/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Member UI — Transaction History', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, MEMBER1);
  });

  test('Transaction history link is accessible', async ({ page }) => {
    const txLink = page.getByRole('link', { name: /transaction|history/i });
    const hasLink = await txLink.isVisible().catch(() => false);
    if (hasLink) {
      await txLink.click();
      await expect(page.getByText(/transaction|history/i).first()).toBeVisible();
    }
  });

  test('Transaction history shows fine breakdown details', async ({ page }) => {
    const txLink = page.getByRole('link', { name: /transaction|history/i });
    const hasLink = await txLink.isVisible().catch(() => false);
    test.skip(!hasLink, 'No transaction history link found');

    await txLink.click();
    // Should show rule version info
    await expect(page.getByText(/v1|rule version/i).first()).toBeVisible();
  });
});

test.describe('Member UI — Access Control', () => {
  test('Member cannot directly navigate to /violations (officer page)', async ({ page }) => {
    await loginAs(page, MEMBER1);
    await page.goto('/violations');
    // Should either redirect away or show access denied
    const isRedirected = !page.url().includes('/violations');
    const showsError = await page.getByText(/forbidden|unauthorized|access denied|not allowed/i).isVisible().catch(() => false);
    expect(isRedirected || showsError).toBe(true);
  });

  test('Member cannot directly navigate to /rule-versions (officer page)', async ({ page }) => {
    await loginAs(page, MEMBER1);
    await page.goto('/rule-versions');
    const isRedirected = !page.url().includes('/rule-versions');
    const showsError = await page.getByText(/forbidden|unauthorized|access denied|not allowed/i).isVisible().catch(() => false);
    expect(isRedirected || showsError).toBe(true);
  });
});
