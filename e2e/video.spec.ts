import { expect, test } from "@playwright/test";

/**
 * The zero-key video surface through the real UI: submit a job on a fresh
 * project, watch the poll land the clip, and see the render in the activity
 * log. In CI this is also the only end-to-end proof of the demo renderer on
 * the linux ffmpeg build.
 */
test("a video job renders, lands, and logs", async ({ page }) => {
  test.setTimeout(150_000);

  await page.goto("/studio");
  await page.waitForLoadState("networkidle");
  const title = `E2E Reel ${Date.now()}`;
  await page.getByPlaceholder("Copper series, brand refresh, ...").fill(title);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("A slow pan across the copper doorway at dusk...").fill(
    "a slow pan across the test bench at dusk",
  );
  await page.getByRole("button", { name: "Render clip" }).click();

  // The demo renderer holds a realistic window (a few seconds) before the
  // clip lands; the card polls until the player replaces the spinner.
  await expect(page.locator("video")).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("video")).toHaveAttribute("src", /\/api\/video\/jobs\/.+\/file$/);

  // The activity log records the render.
  await expect(page.getByText("video.render", { exact: true })).toBeVisible({ timeout: 15_000 });
});
