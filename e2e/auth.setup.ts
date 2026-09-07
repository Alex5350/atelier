import { expect, test } from "@playwright/test";

const EMAIL = process.env.ATELIER_ADMIN_EMAIL ?? "alex@atelier.local";
const PASSWORD = process.env.ATELIER_ADMIN_PASSWORD ?? "atelier-demo";
const BASE = process.env.ATELIER_BASE_URL ?? "http://localhost:3000";

test("prepare authenticated state", async ({ request }) => {
  const response = await request.post(BASE + "/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(response.status()).toBe(200);
  await request.storageState({ path: "e2e/.auth/state.json" });
});
