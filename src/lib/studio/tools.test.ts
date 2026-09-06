import { describe, expect, test } from "bun:test";
import { padMetrics } from "./tools";

describe("pad geometry", () => {
  test("right extension grows the width only", () => {
    const metrics = padMetrics("right", 50, 1000, 600);
    expect(metrics).toEqual({ left: 0, top: 0, width: 1500, height: 600 });
  });

  test("left extension offsets the origin and grows the width", () => {
    const metrics = padMetrics("left", 25, 1000, 600);
    expect(metrics.left).toBe(250);
    expect(metrics.width).toBe(1250);
    expect(metrics.height).toBe(600);
  });

  test("down and up grow the height only", () => {
    expect(padMetrics("down", 50, 1000, 600)).toEqual({ left: 0, top: 0, width: 1000, height: 900 });
    expect(padMetrics("up", 50, 1000, 600).top).toBe(300);
  });

  test("percent clamps into the 10 to 100 band", () => {
    expect(padMetrics("right", 5, 1000, 600).width).toBe(1100);
    expect(padMetrics("right", 500, 1000, 600).width).toBe(2000);
  });
});
