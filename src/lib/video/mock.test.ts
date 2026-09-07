import { describe, expect, test } from "bun:test";
import { MockVideoProvider } from "./mock";

/**
 * The demo video provider renders original clips with the bundled ffmpeg; its
 * job lifecycle is the same one real providers ride.
 */
describe("the mock video provider", () => {
  test("a job runs briefly then completes with real MP4 bytes", async () => {
    const provider = new MockVideoProvider();
    const { externalId } = await provider.submit({
      prompt: "copper light across water",
      seconds: 3,
      modelId: "mock/atelier-reel",
    });

    let poll = await provider.poll(externalId);
    expect(["running", "completed"]).toContain(poll.status);
    // Wait past the render window.
    await new Promise((resolve) => setTimeout(resolve, 2_700));
    poll = await provider.poll(externalId);
    expect(poll.status).toBe("completed");
    const bytes = poll.video!;
    // MP4 container magic: 'ftyp' box early in the file.
    expect(bytes[4]).toBe(0x66);
    expect(bytes[5]).toBe(0x74);
    expect(bytes[6]).toBe(0x79);
    expect(bytes.length).toBeGreaterThan(2_000);
    expect(poll.usageSeconds).toBe(3);
  });

  test("polling an unknown job fails honestly", async () => {
    const provider = new MockVideoProvider();
    const poll = await provider.poll("nope");
    expect(poll.status).toBe("failed");
  });
});
