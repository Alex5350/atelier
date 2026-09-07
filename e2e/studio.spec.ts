import { expect, test } from "@playwright/test";

/**
 * The studio's flagship loop through the real UI: a project, a generate pass
 * on the demo sketchpad, the review gate (the picker refuses to offer
 * pending assets, the API refusal quotes the database trigger, and the run
 * button stays disabled without a base), approval, a tool pass on the
 * approved base, export through the activity log, and the append-only
 * regenerate.
 */
test("generate, gate, approve, tool, export, regenerate", async ({ page }) => {
  test.setTimeout(150_000);

  // A fresh project keeps this spec independent of any seeded data.
  await page.goto("/studio");
  await page.waitForLoadState("networkidle");
  const title = `E2E Studio ${Date.now()}`;
  await page.getByPlaceholder("Copper series, brand refresh, ...").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  // The first generate pass rides the composer defaults (demo sketchpad,
  // batch of two): two assets, both pending.
  await page.getByPlaceholder("A weathered copper doorway, evening light, painterly...").fill(
    "test banners for the gate flow, cool palette",
  );
  await page.getByRole("button", { name: "Run pass" }).click();

  const firstTile = () =>
    page.locator('img[alt^="Pass 1 asset"]').first().locator("xpath=ancestor::div[contains(@class,'group')][1]");
  await expect(page.locator('img[alt^="Pass 1 asset"]').first()).toBeVisible({ timeout: 60_000 });
  // Completed passes grow a Regenerate button; one card means one completion.
  await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(1, { timeout: 30_000 });

  // Gate 1 (UI): with no approved assets there is no base to pick, and the
  // run button for tool passes stays disabled.
  await page.getByRole("button", { name: "Upscale" }).click();
  await expect(page.getByRole("button", { name: "Run pass" })).toBeDisabled();

  // Gate 2 (API): citing a pending asset is refused by the database trigger,
  // and the refusal quotes the trigger's own words.
  const assetSrc = await page.locator('img[alt^="Pass 1 asset"]').first().getAttribute("src");
  const assetId = assetSrc?.split("/").pop() ?? "";
  expect(assetId).toMatch(/.+/);
  const pageUrl = new URL(page.url());
  const gated = await page.request.post(`/api/passes`, {
    data: {
      projectId: pageUrl.pathname.split("/").pop(),
      kind: "upscale",
      references: [{ assetId, role: "base" }],
    },
  });
  expect(gated.status()).toBe(409);
  const gateDetail = await gated.json();
  expect(String(gateDetail.message)).toContain("is not approved for referencing");

  // Approve the first asset: the picker opens up and the tile says so.
  await firstTile().hover();
  await page.locator('[title="Approve (makes this asset referenceable)"]').first().click();
  await expect(firstTile().getByText("approved", { exact: true })).toBeVisible({ timeout: 15_000 });

  // Same tool pass, now on the approved base: it completes deterministically.
  await page.getByLabel("Base reference").click();
  await page.getByRole("option", { name: /^pass 1/ }).click();
  await page.getByRole("button", { name: "Run pass" }).click();
  await expect(page.getByRole("button", { name: "Regenerate" })).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByText("Pass 2", { exact: true })).toBeVisible();

  // Export the approved asset: the export log gains a PNG chip.
  await firstTile().hover();
  await page.locator('[title="Export as PNG"]').first().click();
  await expect(page.getByText("Exported as PNG", { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("png ·", { exact: false }).first()).toBeVisible({ timeout: 15_000 });

  // Regenerate is append-only: the first batch folds into the superseded
  // history instead of disappearing.
  await page.getByRole("button", { name: "Regenerate" }).first().click();
  await expect(page.getByText("superseded by earlier runs", { exact: false })).toBeVisible({
    timeout: 60_000,
  });
});
