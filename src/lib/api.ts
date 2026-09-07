/**
 * Shared helpers for route handlers: every POST that parses a JSON body goes
 * through readJsonBody so a malformed payload is a typed 400 instead of an
 * unhandled 500 (this is also the edge a cross-site form POST hits, since
 * forms cannot send a JSON content type).
 */
export type JsonBody<T> = { ok: true; body: T } | { ok: false; response: Response };

export async function readJsonBody<T>(request: Request): Promise<JsonBody<T>> {
  try {
    return { ok: true, body: (await request.json()) as T };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "invalid-json" }, { status: 400 }),
    };
  }
}
