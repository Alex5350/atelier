import { afterAll, describe, expect, test } from "bun:test";
import { createServer, type Server } from "node:http";
import { fetchWithTimeout } from "./fetch-with-timeout";

/**
 * A provider endpoint that never responds must fail in bounded time with a
 * message that names the timeout, not hang the poll forever.
 */
describe("fetch with a hard timeout", () => {
  let hanging: Server;
  let url: string;

  afterAll(() => {
    hanging?.close();
    hanging?.closeAllConnections();
  });

  test("a server that never responds rejects with a timeout error", async () => {
    hanging = createServer(() => {
      // Intentionally never respond.
    });
    await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
    const address = hanging.address();
    if (typeof address === "string" || !address) {
      throw new Error("no port");
    }
    url = `http://127.0.0.1:${address.port}/videos`;

    const started = Date.now();
    let message = "";
    try {
      await fetchWithTimeout(url, { method: "POST" }, 150);
      throw new Error("expected the fetch to time out");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("timed out after 150ms");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("a prompt response passes through untouched", async () => {
    const server = createServer((request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (typeof address === "string" || !address) {
      throw new Error("no port");
    }
    const response = await fetchWithTimeout(
      `http://127.0.0.1:${address.port}/health`,
      {},
      2_000,
    );
    expect(response.status).toBe(200);
    server.close();
    server.closeAllConnections();
  });
});
