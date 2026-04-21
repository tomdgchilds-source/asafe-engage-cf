import { test, expect } from '@playwright/test';

/**
 * Smoke test — six steps, one Playwright test.
 *
 * Proves: public landing renders, auth works, /projects renders with the
 * "+ New project" CTA, /products renders, and AddToCartModal opens on the
 * first product card.
 *
 * Bytes-check / PDF generation is explicitly out of scope — this is the
 * green / red heartbeat for the app post-deploy.
 */

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test('public landing, auth, projects, products, add-to-cart modal opens', async ({ page }) => {
  test.skip(!email || !password, 'E2E_EMAIL / E2E_PASSWORD must be set');

  // ─── Step 1: public landing renders with a Sign In CTA. ────────────────
  await page.goto('/');
  const signInButton = page.getByRole('button', { name: /sign in/i }).first()
    .or(page.getByRole('link', { name: /sign in/i }).first());
  await expect(signInButton).toBeVisible({ timeout: 15_000 });

  // ─── Step 2: log in with E2E credentials. ──────────────────────────────
  await signInButton.click();
  // Signin page offers email + password inputs. Use label-agnostic selectors
  // so small UI copy changes don't break the test.
  await page
    .getByLabel(/email/i)
    .or(page.locator('input[type="email"]'))
    .first()
    .fill(email!);
  await page
    .getByLabel(/password/i)
    .or(page.locator('input[type="password"]'))
    .first()
    .fill(password!);
  await page
    .getByRole('button', { name: /^sign in$|^log in$/i })
    .first()
    .click();

  // Wait for the session cookie to land and the client to route to
  // an authenticated page.
  await page.waitForURL(/\/(dashboard|projects|products|$)/, { timeout: 30_000 });

  // ─── Step 3: /projects loads. ──────────────────────────────────────────
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects/);

  // ─── Step 4: "+ New project" button is visible (don't actually create). ─
  const newProjectButton = page
    .getByRole('button', { name: /new project/i })
    .first()
    .or(page.getByRole('link', { name: /new project/i }).first());
  await expect(newProjectButton).toBeVisible({ timeout: 15_000 });

  // ─── Step 5: navigate to /products, open first card's AddToCartModal. ──
  await page.goto('/products');
  await expect(page).toHaveURL(/\/products/);

  // Product cards use a stable data-testid prefix of `button-add-to-cart-`.
  const firstAddToCart = page.locator('[data-testid^="button-add-to-cart-"]').first();
  await expect(firstAddToCart).toBeVisible({ timeout: 30_000 });
  await firstAddToCart.click();

  // Modal uses a `modal-add-to-cart-<productId>` testid.
  const addToCartModal = page.locator('[data-testid^="modal-add-to-cart-"]').first();
  await expect(addToCartModal).toBeVisible({ timeout: 15_000 });

  // ─── Step 6: close the modal; test passes. ─────────────────────────────
  await page.keyboard.press('Escape');
  await expect(addToCartModal).not.toBeVisible({ timeout: 10_000 });
});
