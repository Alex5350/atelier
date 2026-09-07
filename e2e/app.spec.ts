import { expect, test } from "@playwright/test";

// Every test here runs authenticated via the storageState produced by the
// setup project (e2e/auth.setup.ts); the anonymous gate has its own spec.

test("chat streams a deterministic demo reply and persists the turn", async ({ page }) => {
  await page.goto("/chat/new");
  const composer = page.getByPlaceholder("Message the studio...");
  await composer.fill("what does zero-key demo mode mean?");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Here in the demo studio, no keys were harmed", { exact: false }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("DEMO", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("what does zero-key demo mode mean?").first()).toBeVisible();
});

test("the studio lists projects and the registry table renders its roster", async ({ page }) => {
  await page.goto("/studio");
  await expect(page.getByText("New project", { exact: false }).first()).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText("Atelier Muse (demo)")).toBeVisible();
  await expect(page.getByText("Registered models").first()).toBeVisible();
});

test("usage shows the ledger story and the budget editor", async ({ page }) => {
  await page.goto("/usage");
  await expect(page.getByText("Spent today", { exact: true })).toBeVisible();
  await expect(page.getByText("Daily budget")).toBeVisible();
});
