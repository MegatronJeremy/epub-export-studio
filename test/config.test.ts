import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { HOW_TO_GET_PRO_URL } from "../src/config";

describe("How to get Pro link", () => {
  it("points at the README section, not Gumroad", () => {
    expect(HOW_TO_GET_PRO_URL).toBe("https://github.com/MegatronJeremy/epub-export-studio#buying-and-activating-pro");
    expect(HOW_TO_GET_PRO_URL).not.toMatch(/gumroad/i);
  });
  it("is rendered once in the settings tab with the exact text", () => {
    const src = readFileSync("src/main.ts", "utf8");
    expect(src.match(/How to get Pro/g)?.length).toBe(1);
    expect(src).toContain("href: HOW_TO_GET_PRO_URL");
  });
});
