import { expect, test, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/**
 * Guardrails that are cheap to prove continuously: typed errors at the HTTP
 * boundary (malformed bodies, missing keys), per-user rate limiting on the
 * cost-bearing chat endpoint (exercised under a throwaway user so the main
 * suite's requests never share the window), and security headers. One shared
 * API context signs in exactly once; hammering the limiter is isolated to
 * this throwaway account.
 */
const EMAIL = `guardrail-${Date.now()}@atelier.local`;
const PASSWORD = "guardrail-password-123";
const BASE = process.env.ATELIER_BASE_URL ?? "http://localhost:3000";

let api: APIRequestContext;

test.beforeAll(async () => {
  // better-auth refuses sign-up POSTs without an Origin header; API contexts
  // do not send one unless told to.
  api = await playwrightRequest.newContext({
    baseURL: BASE,
    extraHTTPHeaders: { origin: BASE },
  });
  const created = await api.post("/api/auth/sign-up/email", {
    data: { name: "Guardrail", email: EMAIL, password: PASSWORD },
  });
  expect([200, 201, 202, 409]).toContain(created.status());
  const signedIn = await api.post("/api/auth/sign-in/email", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(signedIn.status()).toBe(200);
});

test.afterAll(async () => {
  await api?.dispose();
});

test("malformed JSON bodies are a typed 400, never a 500", async () => {
  const response = await api.post("/api/chat", {
    headers: { "content-type": "text/plain" },
    data: "this is not json",
  });
  expect(response.status()).toBe(400);
  const detail = await response.json();
  expect(detail.error).toBe("invalid-json");
});

test("a priced model without its provider key refuses with needs-key", async () => {
  const response = await api.post("/api/chat", {
    data: {
      modelId: "openai/gpt-5.6",
      conversationId: "pending",
      messages: [{ id: "g1", role: "user", parts: [{ type: "text", text: "hello" }] }],
    },
  });
  expect(response.status()).toBe(409);
  const detail = await response.json();
  expect(detail.error).toBe("needs-key");
});

test("hammering the chat endpoint lands on a typed 429", async () => {
  let sawRateLimit = false;
  for (let i = 0; i < 35 && !sawRateLimit; i++) {
    const response = await api.post("/api/chat", {
      headers: { "content-type": "text/plain" },
      data: "still not json",
    });
    if (response.status() === 429) {
      sawRateLimit = true;
      const retryAfter = Number(response.headers()["retry-after"] ?? 0);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(60);
      const detail = await response.json();
      expect(detail.error).toBe("rate-limited");
    } else {
      expect(response.status()).toBe(400);
    }
  }
  expect(sawRateLimit).toBe(true);
});

test("security headers ride every response", async () => {
  const response = await api.get("/login");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});
