/**
 * fetch with a hard timeout, shared by the video adapters so a hung provider
 * endpoint fails in bounded time instead of hanging the poll forever. Pure
 * module (no server-only) so the timeout behavior is unit-testable against a
 * local server that never responds.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error ? error.name : String(error);
    if (reason === "TimeoutError" || reason === "AbortError") {
      throw new Error(`request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  }
}
