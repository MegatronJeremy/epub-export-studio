import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import { buildEpub } from "../src/epub";

const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
);

/** Export one note, unzip, check XHTML is well-formed, return the chapter XHTML and its visible text. */
async function run(md: string) {
  const bytes = await buildEpub([{ title: "T", markdown: md }], {
    title: "T",
    uuid: "11111111-2222-4333-8444-555555555555",
    now: new Date("2026-10-05T12:00:00Z"),
    resolveImage: async (s) => (s === "pic.png" || s === "My Pic.png" ? PNG : null),
  });
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("OEBPS/ch1.xhtml")!.async("string");
  const errors: string[] = [];
  const handler = { warning: () => {}, error: (m: string) => errors.push(m), fatalError: (m: string) => errors.push(m) };
  new DOMParser({ errorHandler: handler }).parseFromString(xml, "application/xml");
  expect(errors).toEqual([]);
  const body = xml.slice(xml.indexOf("<body"));
  const text = body
    .replace(/<[^>]+>/g, "|")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return { xml, text };
}

describe("real-world Obsidian syntax (EPUB)", () => {
  it("callouts: nested and foldable", async () => {
    const { text } = await run("> [!note]- Folded title\n> body one\n> > [!tip] Inner\n> > inner body\n\n> [!faq]+ Open\n> open body\n");
    for (const s of ["Folded title", "body one", "Inner", "inner body", "open body"]) expect(text).toContain(s);
    expect(text).not.toContain("[!");
  });

  it("wikilinks with alias and heading", async () => {
    const { text } = await run("See [[Note#Heading|shown]], [[Note#Sec]], [[Plain]], [[folder/Deep Note]] and [[Note^blockid]].");
    expect(text).toContain("shown");
    expect(text).not.toContain("[[");
    expect(text).not.toContain("]]");
    expect(text).not.toContain("|shown");
    expect(text).toContain("Plain");
  });

  it("images: local, spaced, sized, remote, missing", async () => {
    const { xml, text } = await run("![[pic.png]]\n\n![[pic.png|200]]\n\n![alt](pic.png)\n\n![[My Pic.png]]\n\n![remote](https://example.com/a.png)\n\n![[missing.png]]\n");
    expect((xml.match(/<img /g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain("![");
  });

  it("note embeds do not leak raw syntax", async () => {
    const { text } = await run("Before\n\n![[Other note]]\n\n![[Other note#Heading]]\n\nAfter");
    expect(text).not.toContain("![[");
    expect(text).not.toContain("]]");
    expect(text).toContain("After");
  });

  it("tables: alignment and inline formatting", async () => {
    const { xml, text } = await run("| A | B | C |\n|:--|:-:|--:|\n| **bold** | *it* | `code` |\n| [[W|alias]] | ==hl== | a \\| b |\n");
    expect(xml).toContain("<table>");
    expect(text).toContain("bold");
    expect(text).toContain("alias");
    for (const s of ["**", "==", "[["]) expect(text).not.toContain(s);
    expect(text).toContain("a | b");
  });

  it("footnotes stay readable in the free build", async () => {
    const { text } = await run("Claim[^1] and inline^[inline fn text].\n\n[^1]: First note.\n");
    expect(text).toContain("Claim");
  });

  it("task lists with variants", async () => {
    const { text } = await run("- [ ] open\n- [x] done\n- [X] done caps\n- [/] partial\n- [-] cancelled\n1. [ ] numbered task\n");
    for (const s of ["open", "done caps", "partial", "cancelled"]) expect(text).toContain(s);
    expect(text).not.toMatch(/\[[ xX/-]\]/);
  });

  it("math inline and block remains readable", async () => {
    const { text } = await run("Inline $E=mc^2$ here, price is $5 and $6 ok.\n\n$$\n\\frac{a}{b} = c\n$$\n\nAfter math");
    expect(text).toContain("E=mc^2");
    expect(text).toContain("\\frac{a}{b} = c");
    expect(text).toContain("After math");
    expect(text).toContain("$5");
  });

  it("code blocks with language and special chars", async () => {
    const { xml, text } = await run("```python\ndef f(x):\n    return x < 3 && y > 2 # \"q\" & 'a'\n```\n\n~~~\ntilde fence\n~~~\n");
    expect(xml).toContain("<pre");
    expect(text).toContain("def f(x):");
    expect(text).toContain("tilde fence");
    expect(text).not.toContain("```");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&amp;");
  });

  it("highlights, tags, comments, frontmatter", async () => {
    const { xml, text } = await run("---\ntitle: X\naliases: [a]\n---\nA ==marked text== and #tag and #nested/tag.\n\n%% hidden %%\n\n%%\nmulti\nline\n%%\n\nEnd");
    expect(xml).toContain("<mark");
    expect(text).not.toContain("==");
    expect(text).not.toContain("title: X");
    expect(text).not.toContain("hidden");
    expect(text).not.toContain("multi");
    expect(text).toContain("#tag");
    expect(text).toContain("End");
  });

  it("non-Latin text: Cyrillic, CJK, RTL, emoji", async () => {
    const { text } = await run("# Привет мир\n\nЭто **жирный** текст.\n\n日本語のテキスト と 中文内容。\n\nمرحبا بالعالم **غامق**\n\nשלום עולם 🎉\n\n- пункт один\n");
    for (const s of ["Привет мир", "жирный", "日本語のテキスト", "中文内容", "مرحبا بالعالم", "غامق", "שלום עולם", "🎉", "пункт один"]) expect(text).toContain(s);
    expect(text).not.toContain("**");
  });

  it("control characters and odd input do not break XML", async () => {
    const { text } = await run("A\u0000B \u0008 vertical\u000Btab & <b>html</b> \"q\"\r\n\r\nLine two\r\n");
    expect(text).toContain("Line two");
  });

  it("empty and frontmatter-only notes still produce a valid file", async () => {
    await run("x");
    await run("---\na: 1\n---\nx");
  });

  it("escaped markdown chars and nested emphasis", async () => {
    const { text } = await run("\\*not bold\\* and **bold with *nested italic* inside** and snake_case_word and 2*3*4");
    expect(text).toContain("*not bold*");
    expect(text).toContain("snake_case_word");
    expect(text).not.toContain("**");
  });

  it("headings with trailing hashes, setext, hr, html comments", async () => {
    const { xml, text } = await run("Title\n=====\n\n## Sub ##\n\n***\n\n<!-- html comment -->\n\ntext");
    expect(xml).toContain("<h1");
    expect(text).toContain("Sub");
    expect(text).not.toContain("##");
    expect(text).not.toContain("=====");
    expect(text).not.toContain("html comment");
  });
});
