import { describe, expect, test } from "bun:test";
import { navItems } from "./nav";

describe("the studio's navigation", () => {
  test("exposes the four surfaces", () => {
    expect(navItems.map((item) => item.title)).toEqual(["Chat", "Studio", "Usage", "Admin"]);
  });

  test("every item has a unique href and an icon", () => {
    const hrefs = new Set(navItems.map((item) => item.href));
    expect(hrefs.size).toBe(navItems.length);
    for (const item of navItems) {
      expect(item.icon).toBeDefined();
    }
  });
});
