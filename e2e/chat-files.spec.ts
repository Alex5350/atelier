import { expect, test } from "@playwright/test";
import path from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

/**
 * Files in chat, both modes: a document uploads once, rides the message as a
 * chip, persists with history, and in retrieval mode grounds the reply with
 * citation chips naming the file and chunk. The demo model ignores content,
 * so the assertions pin the pipeline (upload, index, retrieve, cite) rather
 * than the model's prose.
 */
/**
 * The demo narrator picks its opening line by prompt hash, so the
 * prompt-agnostic completion signal is the echoed prompt footer plus the
 * DEMO badge on the assistant turn.
 */
async function expectTurnCompletion(page: import("@playwright/test").Page, prompt: string) {
  await expect(page.getByText("Your prompt was:", { exact: false })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("DEMO", { exact: true }).first()).toBeVisible();
  void prompt;
}

test("a document rides the turn as a chip and persists with history", async ({ page }) => {
  await page.goto("/chat/new");
  // Settle hydration before driving the composer: events dispatched before
  // React attaches its listeners are lost, and file inputs are the classic
  // silent casualty.
  await page.waitForLoadState("networkidle");
  const dir = await mkdtemp(path.join(tmpdir(), "atelier-e2e-"));
  const file = path.join(dir, "kiln-notes.md");
  await writeFile(
    file,
    [
      "# Kiln operating notes",
      "",
      "The kiln reaches temperature in three stages, and the zirconia lining",
      "must cool undisturbed for a full hour before the door opens.",
      "Stage two holds at 1140 degrees for twenty minutes.",
      "",
      "Maintenance: replace the thermocouple every two hundred firings.",
    ].join("\n"),
  );

  await page.setInputFiles('input[type="file"]', file);
  await expect(page.getByText("kiln-notes.md", { exact: false })).toBeVisible();
  // Documents index for retrieval by default eligibility: the mode toggle is
  // enabled (chunks were written).
  await expect(page.getByRole("button", { name: "context", exact: true })).toBeEnabled();

  const composer = page.getByPlaceholder("Message the studio...");
  await composer.fill("how long must the zirconia lining cool?");
  await page.keyboard.press("Enter");
  await expectTurnCompletion(page, "how long must the zirconia lining cool?");

  // The sent turn carries the document as a chip.
  await expect(page.getByRole("link", { name: "kiln-notes.md" })).toBeVisible();

  // History replays the same chip after a reload.
  await page.reload();
  await expect(page.getByText("how long must the zirconia lining cool?").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "kiln-notes.md" })).toBeVisible();

  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});

test("retrieval mode cites the file and chunk it answered from", async ({ page }) => {
  await page.goto("/chat/new");
  // Settle hydration before driving the composer: events dispatched before
  // React attaches its listeners are lost, and file inputs are the classic
  // silent casualty.
  await page.waitForLoadState("networkidle");
  const dir = await mkdtemp(path.join(tmpdir(), "atelier-e2e-"));
  const file = path.join(dir, "thermocouple-log.md");
  await writeFile(
    file,
    [
      "# Thermocouple replacement log",
      "",
      "The thermocouple is replaced every two hundred firings; the log",
      "notes each replacement with its firing count and the technician.",
    ].join("\n"),
  );

  await page.setInputFiles('input[type="file"]', file);
  await expect(page.getByText("thermocouple-log.md", { exact: false })).toBeVisible();
  // Flip the document into retrieval mode.
  await page.getByRole("button", { name: "context", exact: true }).click();
  await expect(page.getByRole("button", { name: "retrieve", exact: true })).toBeVisible();

  const composer = page.getByPlaceholder("Message the studio...");
  await composer.fill("when does the thermocouple get replaced?");
  await page.keyboard.press("Enter");
  await expectTurnCompletion(page, "when does the thermocouple get replaced?");

  // The assistant turn carries a citation chip naming file and chunk index,
  // with the hybrid rank provenance that produced it.
  const citation = page.locator("span", { hasText: /^thermocouple-log\.md c\d+$/ }).first();
  await expect(citation).toBeVisible();
  await expect(page.getByText(/fts|cosine|rank/, { exact: false }).first()).toBeVisible();

  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
});
