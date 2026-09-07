import { expect, test } from "@playwright/test";

// The gate spec runs anonymous: the middleware redirect and the real UI login.
test.use({ storageState: { cookies: [], origins: [] } });

const EMAIL = process.env.ATELIER_ADMIN_EMAIL ?? "alex@atelier.local";
const PASSWORD = process.env.ATELIER_ADMIN_PASSWORD ?? "atelier-demo";

test("the login gate redirects and the UI sign-in lands on the dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.getByText("Models registered")).toBeVisible();
});
