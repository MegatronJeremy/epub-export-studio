import { describe, expect, it } from "vitest";
import { sanitizeCss, sanitizeLanguage } from "../src/pro";

describe("pro helpers", () => {
  it("strips remote css", () => {
    const out = sanitizeCss('@import url("https://x.test/a.css");\nbody{background:url(https://x.test/b.png);color:red}');
    expect(out).not.toContain("@import");
    expect(out).not.toContain("x.test");
    expect(out).toContain("color:red");
  });
  it("validates language", () => {
    expect(sanitizeLanguage("pt-BR")).toBe("pt-BR");
    expect(sanitizeLanguage("not a lang")).toBe("en");
    expect(sanitizeLanguage(undefined)).toBe("en");
  });
});
