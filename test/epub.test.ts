import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { DOMParser } from "@xmldom/xmldom";
import { buildEpub } from "../src/epub";
import { FreeGate, UnlockedGate } from "../src/pro";
import { SAMPLE } from "./fixtures-md";

// 1x1 PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const fixed = { uuid: "11111111-2222-4333-8444-555555555555", now: new Date("2026-10-04T12:00:00Z"), resolveImage: async (s: string) => (s === "pic.png" ? PNG : null) };

function wellFormed(name: string, xml: string) {
  const errors: string[] = [];
  new DOMParser({ errorHandler: { warning: () => {}, error: (m: string) => errors.push(m), fatalError: (m: string) => errors.push(m) } }).parseFromString(xml, "application/xml");
  expect(errors, name).toEqual([]);
}

async function open(bytes: Uint8Array) {
  return JSZip.loadAsync(bytes);
}

describe("EPUB structure (free)", () => {
  it("is a valid package skeleton", async () => {
    const bytes = await buildEpub([{ title: "Field Notes", markdown: SAMPLE }], { title: "Field Notes", ...fixed });
    // mimetype must be the first entry, stored, exact content
    const raw = Buffer.from(bytes);
    expect(raw.subarray(30, 30 + 8).toString()).toBe("mimetype");
    expect(raw.readUInt16LE(8)).toBe(0); // compression method STORE
    expect(raw.subarray(38, 38 + 20).toString()).toBe("application/epub+zip");
    const zip = await open(bytes);
    const names = Object.keys(zip.files);
    for (const n of ["META-INF/container.xml", "OEBPS/content.opf", "OEBPS/nav.xhtml", "OEBPS/styles.css", "OEBPS/ch1.xhtml", "OEBPS/images/img1.png"]) expect(names).toContain(n);
    for (const n of names.filter((x) => /\.(xml|opf|xhtml)$/.test(x))) wellFormed(n, await zip.file(n)!.async("string"));
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain("<dc:title>Field Notes</dc:title>");
    expect(opf).toContain("<dc:language>en</dc:language>");
    expect(opf).not.toContain("dc:creator");
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-04T12:00:00Z</meta>');
    // every manifest href exists and every spine idref is in the manifest
    const hrefs = [...opf.matchAll(/<item id="([^"]+)" href="([^"]+)"/g)];
    for (const [, , href] of hrefs) expect(names).toContain("OEBPS/" + href);
    const ids = new Set(hrefs.map((h) => h[1]));
    for (const m of opf.matchAll(/idref="([^"]+)"/g)) expect(ids.has(m[1])).toBe(true);
  });

  it("renders the sample content", async () => {
    const zip = await open(await buildEpub([{ title: "T", markdown: SAMPLE }], { title: "T", ...fixed }));
    const ch = await zip.file("OEBPS/ch1.xhtml")!.async("string");
    expect(ch).toContain("<strong>bold</strong>");
    expect(ch).toContain('<a href="https://example.com">link</a>');
    expect(ch).toContain('epub:type="noteref"');
    expect(ch).toContain("The footnote &amp; more.");
    expect(ch).toContain("<table>");
    expect(ch).toContain("a = 1 &lt; 2 &amp;&amp; &quot;x&quot;");
    expect(ch).toContain('<img src="images/img1.png"');
    expect(ch).toContain("callout-tip");
    expect(ch).toContain("☑ done");
    expect(ch).not.toContain("title: ignored");
    const nav = await zip.file("OEBPS/nav.xhtml")!.async("string");
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain("Field Notes");
    expect(nav).toContain("Lists");
  });

  it("ignores Pro options and extra chapters on the free gate", async () => {
    const zip = await open(
      await buildEpub(
        [
          { title: "A", markdown: "# A\n\ntext" },
          { title: "B", markdown: "# B\n\ntext" },
        ],
        { title: "Book", gate: new FreeGate(), pro: { author: "Zed", language: "de", css: "p{color:red}", cover: PNG }, ...fixed },
      ),
    );
    const names = Object.keys(zip.files);
    expect(names).not.toContain("OEBPS/ch2.xhtml");
    expect(names.some((n) => n.includes("cover"))).toBe(false);
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).not.toContain("Zed");
    expect(opf).toContain("<dc:language>en</dc:language>");
    expect(await zip.file("OEBPS/styles.css")!.async("string")).not.toContain("color:red");
  });

  it("survives control characters and unknown image links", async () => {
    const zip = await open(await buildEpub([{ title: "X", markdown: "Hello \u0001 world ![[missing.png]] [[Other note]]" }], { title: "X\u0002", ...fixed }));
    for (const n of Object.keys(zip.files).filter((x) => /\.(xml|opf|xhtml)$/.test(x))) wellFormed(n, await zip.file(n)!.async("string"));
  });
});

describe("EPUB Pro", () => {
  it("adds cover, metadata, css and compiles chapters in order", async () => {
    const zip = await open(
      await buildEpub(
        [
          { title: "One", markdown: "# One\n\nfirst\n\n## Part\n\nx" },
          { title: "Two", markdown: "second, no heading" },
        ],
        { title: "My Book", gate: new UnlockedGate(), pro: { author: "A. Writer", language: "pt-BR", publisher: "Pub", description: "Blurb", css: "p{color:red} @import url(http://x.test/a.css);", cover: PNG }, ...fixed },
      ),
    );
    const names = Object.keys(zip.files);
    for (const n of ["OEBPS/cover.xhtml", "OEBPS/images/cover.png", "OEBPS/ch1.xhtml", "OEBPS/ch2.xhtml"]) expect(names).toContain(n);
    for (const n of names.filter((x) => /\.(xml|opf|xhtml)$/.test(x))) wellFormed(n, await zip.file(n)!.async("string"));
    const opf = await zip.file("OEBPS/content.opf")!.async("string");
    expect(opf).toContain("<dc:creator>A. Writer</dc:creator>");
    expect(opf).toContain("<dc:language>pt-BR</dc:language>");
    expect(opf).toContain("<dc:publisher>Pub</dc:publisher>");
    expect(opf).toContain("<dc:description>Blurb</dc:description>");
    expect(opf).toContain('properties="cover-image"');
    expect(opf.indexOf('idref="cover"')).toBeLessThan(opf.indexOf('idref="ch1"'));
    expect(opf.indexOf('idref="ch1"')).toBeLessThan(opf.indexOf('idref="ch2"'));
    const css = await zip.file("OEBPS/styles.css")!.async("string");
    expect(css).toContain("p{color:red}");
    expect(css).not.toContain("x.test");
    const nav = await zip.file("OEBPS/nav.xhtml")!.async("string");
    expect(nav.indexOf("One")).toBeLessThan(nav.indexOf("Two"));
    expect(nav).toContain("Part");
  });

  it("ignores an unsupported cover instead of failing", async () => {
    const zip = await open(await buildEpub([{ title: "A", markdown: "x" }], { title: "A", gate: new UnlockedGate(), pro: { cover: new Uint8Array([1, 2, 3]) }, ...fixed }));
    expect(Object.keys(zip.files).some((n) => n.includes("cover"))).toBe(false);
  });
});
