import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const STATE = "e2e/.auth/state.json";
const OUT = "docs/screenshots";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  deviceScaleFactor: 2,
  storageState: STATE,
});
const page = await context.newPage();

// login (anonymous, fresh context)
const anon = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const anonPage = await anon.newPage();
await anonPage.goto(BASE + "/login");
await anonPage.waitForLoadState("networkidle");
await anonPage.screenshot({ path: OUT + "/login.png" });
await anon.close();

// dashboard
await page.goto(BASE + "/");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: OUT + "/dashboard.png" });

// chat with a streamed demo reply
await page.goto(BASE + "/chat/new");
await page.getByPlaceholder("Message the studio...").fill("help me plan a copper-toned brand refresh");
await page.keyboard.press("Enter");
await page.getByText("no keys were harmed", { exact: false }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "/chat.png" });

// studio project (assets, tools, lineage, video): navigate via the studio
// list's first project link
await page.goto(BASE + "/studio");
await page.waitForLoadState("networkidle");
const firstProject = page.locator('a[href^="/studio/"]').first();
if (await firstProject.count() > 0) {
  await firstProject.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "/studio.png", fullPage: false });
}

// usage + admin
await page.goto(BASE + "/usage");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: OUT + "/usage.png" });
await page.goto(BASE + "/admin");
await page.waitForLoadState("networkidle");
await page.screenshot({ path: OUT + "/admin.png" });

await browser.close();
console.log("shots captured");
