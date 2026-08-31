import { describe, expect, test } from "bun:test";
import { ASPECT_SIZES, sizeForAspect } from "./queries";

describe("aspect to size mapping", () => {
  test("known aspects map to their pixel sizes", () => {
    expect(sizeForAspect("square")).toBe("1024x1024");
    expect(sizeForAspect("landscape")).toBe("1280x768");
    expect(sizeForAspect("portrait")).toBe("768x1280");
  });

  test("unknown or missing aspects fall back to square", () => {
    expect(sizeForAspect(undefined)).toBe("1024x1024");
    expect(sizeForAspect("cinemascope")).toBe(ASPECT_SIZES.square);
  });
});
