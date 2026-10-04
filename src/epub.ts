import JSZip from "jszip";
import type { Block, Inline, ListItem } from "./ast";
import { extractFootnotes, parseBlocks, parseInline, parseMarkdown } from "./parser";
import { imageInfo } from "./imagesize";
import { FreeGate, sanitizeCss, sanitizeLanguage, type ProGate } from "./pro";

export interface Chapter {
  /** Used in the table of contents when the chapter has no leading heading. */
  title: string;
  markdown: string;
  /** Vault path of the source note; passed back to resolveImage. */
  path?: string;
}

/** Pro-only options. Ignored unless the gate allows them. */
export interface ProOptions {
  author?: string;
  language?: string;
  publisher?: string;
  description?: string;
  /** Raw bytes of a PNG/JPEG/GIF cover. */
  cover?: Uint8Array;
  css?: string;
}

export interface EpubOptions {
  title: string;
  gate?: ProGate;
  pro?: ProOptions;
  resolveImage?: (src: string, fromPath?: string) => Promise<Uint8Array | null>;
  /** Injected by tests for reproducible output. */
  uuid?: string;
  now?: Date;
}

export const DEFAULT_CSS = `body { font-family: serif; line-height: 1.45; margin: 5%; }
h1, h2, h3, h4, h5, h6 { font-family: sans-serif; line-height: 1.2; page-break-after: avoid; }
p { margin: 0 0 0.8em 0; }
img { max-width: 100%; height: auto; }
pre { white-space: pre-wrap; font-size: 0.85em; background: #f4f4f4; padding: 0.6em; }
code { font-family: monospace; font-size: 0.9em; }
blockquote { margin: 1em 1.5em; padding-left: 0.8em; border-left: 3px solid #bbb; }
table { border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #999; padding: 0.25em 0.5em; }
.callout { border-left: 4px solid #4a7ebb; background: #eef3fa; padding: 0.4em 0.8em; margin: 1em 0; }
.callout-title { font-weight: bold; margin: 0 0 0.3em 0; }
.footnotes { font-size: 0.85em; border-top: 1px solid #999; margin-top: 2em; padding-top: 0.5em; }
.cover { text-align: center; margin: 0; padding: 0; }
.cover img { max-height: 100%; }
`;

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));
}

/** Strip characters XML 1.0 forbids (control chars), which would make the whole book invalid. */
function xmlSafe(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");
}

interface Img {
  href: string; // inside OEBPS
  mime: string;
  data: Uint8Array;
  id: string;
}

interface Heading {
  level: number;
  id: string;
  text: string;
}

class ChapterRenderer {
  headings: Heading[] = [];
  notes: string[] = []; // rendered inline XHTML of footnote bodies
  private defs = new Map<string, string>();
  private noteIndex = new Map<string, number>();

  constructor(
    private n: number,
    private images: Img[],
    private resolve: (src: string) => Promise<Uint8Array | null>,
  ) {}

  async render(markdown: string): Promise<string> {
    const x = extractFootnotes(markdown);
    this.defs = x.defs;
    const blocks = parseMarkdown(x.text);
    const body = await this.blocks(blocks);
    return body + (await this.footnoteSection());
  }

  private plain(nodes: Inline[]): string {
    return nodes
      .map((n) => (n.t === "text" ? n.text : n.t === "link" ? this.plain(n.children) : n.t === "image" ? n.alt : ""))
      .join("")
      .trim();
  }

  async blocks(bs: Block[]): Promise<string> {
    const out: string[] = [];
    for (const b of bs) out.push(await this.block(b));
    return out.join("\n");
  }

  private async block(b: Block): Promise<string> {
    switch (b.t) {
      case "heading": {
        const id = `c${this.n}-h${this.headings.length + 1}`;
        this.headings.push({ level: b.level, id, text: this.plain(b.content) || "Untitled" });
        return `<h${b.level} id="${id}">${await this.inlines(b.content)}</h${b.level}>`;
      }
      case "paragraph":
        return `<p>${await this.inlines(b.content)}</p>`;
      case "code":
        return `<pre><code>${esc(xmlSafe(b.text))}</code></pre>`;
      case "hr":
        return "<hr/>";
      case "quote":
        return `<blockquote>\n${await this.blocks(b.children)}\n</blockquote>`;
      case "callout":
        return `<div class="callout callout-${esc(b.kind.replace(/[^\w-]/g, ""))}"><p class="callout-title">${await this.inlines(b.title)}</p>\n${await this.blocks(b.children)}\n</div>`;
      case "list":
        return this.list(b.items);
      case "table": {
        const cell = async (tag: string, c: Inline[], a: string) =>
          `<${tag}${a === "left" ? "" : ` style="text-align:${a}"`}>${await this.inlines(c)}</${tag}>`;
        const head = (await Promise.all(b.header.map((c, i) => cell("th", c, b.align[i] ?? "left")))).join("");
        const rows: string[] = [];
        for (const r of b.rows) rows.push(`<tr>${(await Promise.all(r.map((c, i) => cell("td", c, b.align[i] ?? "left")))).join("")}</tr>`);
        return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table>`;
      }
    }
  }

  private async list(items: ListItem[]): Promise<string> {
    let html = "";
    const stack: { tag: string; level: number }[] = [];
    const closeTo = (level: number) => {
      while (stack.length && stack[stack.length - 1].level > level) {
        html += `</li></${stack.pop()!.tag}>`;
      }
    };
    for (const it of items) {
      const tag = it.ordered ? "ol" : "ul";
      closeTo(it.level);
      const top = stack[stack.length - 1];
      if (top && top.level === it.level) {
        html += "</li>\n";
      } else {
        html += `<${tag}>`;
        stack.push({ tag, level: it.level });
      }
      const box = it.checked === undefined ? "" : it.checked ? "☑ " : "☐ ";
      html += `<li>${box}${await this.inlines(it.content)}`;
    }
    closeTo(-1);
    return html;
  }

  async inlines(nodes: Inline[]): Promise<string> {
    let out = "";
    for (const n of nodes) {
      switch (n.t) {
        case "break":
          out += "<br/>";
          break;
        case "text": {
          let s = esc(xmlSafe(n.text));
          if (n.code) s = `<code>${s}</code>`;
          if (n.highlight) s = `<mark>${s}</mark>`;
          if (n.strike) s = `<del>${s}</del>`;
          if (n.italic) s = `<em>${s}</em>`;
          if (n.bold) s = `<strong>${s}</strong>`;
          out += s;
          break;
        }
        case "link": {
          const inner = await this.inlines(n.children);
          out += /^(https?:|mailto:)/i.test(n.href) ? `<a href="${esc(n.href)}">${inner}</a>` : inner;
          break;
        }
        case "fnref": {
          const body = this.defs.get(n.id);
          if (body === undefined) {
            out += esc(`[^${n.id}]`);
            break;
          }
          let num = this.noteIndex.get(n.id);
          if (!num) {
            num = this.noteIndex.size + 1;
            this.noteIndex.set(n.id, num);
            const clean = parseInline(body).map((m) => (m.t === "fnref" ? ({ t: "text", text: `[^${m.id}]` } as Inline) : m));
            this.notes.push(await this.inlines(clean));
          }
          out += `<a epub:type="noteref" id="c${this.n}-r${num}" href="#c${this.n}-n${num}"><sup>${num}</sup></a>`;
          break;
        }
        case "image": {
          const img = /^https?:/i.test(n.src) ? null : await this.addImage(n.src);
          out += img ? `<img src="${esc(img.href)}" alt="${esc(xmlSafe(n.alt))}"${n.width ? ` width="${n.width}"` : ""}/>` : esc(xmlSafe(n.alt));
          break;
        }
      }
    }
    return out;
  }

  private async addImage(src: string): Promise<Img | null> {
    const data = await this.resolve(src);
    if (!data) return null;
    const info = imageInfo(data);
    if (!info || info.kind === "bmp") return null; // EPUB core image types: png, jpeg, gif
    const existing = this.images.find((i) => i.data.length === data.length && sameBytes(i.data, data));
    if (existing) return existing;
    const idx = this.images.length + 1;
    const ext = info.kind === "jpg" ? "jpg" : info.kind;
    const img: Img = { href: `images/img${idx}.${ext}`, mime: info.kind === "jpg" ? "image/jpeg" : `image/${info.kind}`, data, id: `img${idx}` };
    this.images.push(img);
    return img;
  }

  private async footnoteSection(): Promise<string> {
    if (!this.notes.length) return "";
    const items = this.notes
      .map((html, i) => `<li id="c${this.n}-n${i + 1}" epub:type="footnote">${html} <a href="#c${this.n}-r${i + 1}">↩</a></li>`)
      .join("\n");
    return `\n<aside class="footnotes" epub:type="footnotes"><ol>\n${items}\n</ol></aside>`;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function xhtml(title: string, lang: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${esc(lang)}" xml:lang="${esc(lang)}">
<head>
<meta charset="utf-8"/>
<title>${esc(xmlSafe(title))}</title>
<link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${body}
</body>
</html>
`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function isoNoMillis(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

function newUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const h = "0123456789abcdef";
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => h[Math.floor(Math.random() * 16)]);
}

/** Build an EPUB 3 file (as bytes) from one or more chapters. */
export async function buildEpub(chapters: Chapter[], opts: EpubOptions): Promise<Uint8Array> {
  const gate = opts.gate ?? new FreeGate();
  const pro = opts.pro ?? {};
  const compile = gate.has("compile");
  const used = compile ? chapters : chapters.slice(0, 1);
  if (!used.length) throw new Error("Nothing to export.");

  const meta = gate.has("metadata");
  const lang = meta ? sanitizeLanguage(pro.language) : "en";
  const author = meta ? (pro.author ?? "").trim() : "";
  const publisher = meta ? (pro.publisher ?? "").trim() : "";
  const description = meta ? (pro.description ?? "").trim() : "";
  const title = xmlSafe(opts.title.trim() || used[0].title || "Untitled");
  const css = DEFAULT_CSS + (gate.has("css") && pro.css ? "\n" + sanitizeCss(pro.css) + "\n" : "");

  const images: Img[] = [];
  const files: { id: string; href: string; title: string; headings: Heading[]; xml: string }[] = [];
  let n = 0;
  for (const ch of used) {
    n++;
    const r = new ChapterRenderer(n, images, async (src) => (opts.resolveImage ? opts.resolveImage(src, ch.path) : null));
    const body = await r.render(ch.markdown);
    const first = r.headings[0];
    const chTitle = (first && first.level === 1 ? first.text : ch.title) || `Chapter ${n}`;
    const html = body.trim() ? body : `<h1 id="c${n}-h0">${esc(xmlSafe(chTitle))}</h1>`;
    files.push({ id: `ch${n}`, href: `ch${n}.xhtml`, title: chTitle, headings: r.headings, xml: xhtml(chTitle, lang, html) });
  }

  let cover: { href: string; mime: string; data: Uint8Array } | null = null;
  if (gate.has("cover") && pro.cover) {
    const info = imageInfo(pro.cover);
    if (info && info.kind !== "bmp") {
      const ext = info.kind === "jpg" ? "jpg" : info.kind;
      cover = { href: `images/cover.${ext}`, mime: info.kind === "jpg" ? "image/jpeg" : `image/${info.kind}`, data: pro.cover };
    }
  }

  // Table of contents: one entry per chapter; h2/h3 (and later h1s) nest below it.
  const toc = files
    .map((f) => {
      const subs = f.headings.filter((h, i) => !(i === 0 && h.level === 1) && h.level <= 3);
      let html = `<li><a href="${f.href}">${esc(xmlSafe(f.title))}</a>`;
      if (subs.length) {
        html += "\n<ol>\n" + subs.map((h) => `<li><a href="${f.href}#${h.id}">${esc(xmlSafe(h.text))}</a></li>`).join("\n") + "\n</ol>\n";
      }
      return html + "</li>";
    })
    .join("\n");
  const nav = xhtml(
    title,
    lang,
    `<nav epub:type="toc" id="toc"><h1>Contents</h1>\n<ol>\n${toc}\n</ol>\n</nav>`,
  );

  const uuid = opts.uuid ?? newUuid();
  const modified = isoNoMillis(opts.now ?? new Date());
  const manifest = [
    `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="css" href="styles.css" media-type="text/css"/>`,
    ...(cover ? [`<item id="cover-image" href="${cover.href}" media-type="${cover.mime}" properties="cover-image"/>`, `<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>`] : []),
    ...files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`),
    ...images.map((i) => `<item id="${i.id}" href="${i.href}" media-type="${i.mime}"/>`),
  ];
  const spine = [...(cover ? [`<itemref idref="cover"/>`] : []), ...files.map((f) => `<itemref idref="${f.id}"/>`)];
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${esc(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="pub-id">urn:uuid:${uuid}</dc:identifier>
<dc:title>${esc(title)}</dc:title>
<dc:language>${esc(lang)}</dc:language>
${author ? `<dc:creator>${esc(xmlSafe(author))}</dc:creator>\n` : ""}${publisher ? `<dc:publisher>${esc(xmlSafe(publisher))}</dc:publisher>\n` : ""}${description ? `<dc:description>${esc(xmlSafe(description))}</dc:description>\n` : ""}<meta property="dcterms:modified">${modified}</meta>
${cover ? `<meta name="cover" content="cover-image"/>\n` : ""}</metadata>
<manifest>
${manifest.join("\n")}
</manifest>
<spine>
${spine.join("\n")}
</spine>
</package>
`;

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
  );
  zip.file("OEBPS/content.opf", opf);
  zip.file("OEBPS/nav.xhtml", nav);
  zip.file("OEBPS/styles.css", css);
  if (cover) {
    zip.file(`OEBPS/${cover.href}`, cover.data);
    zip.file("OEBPS/cover.xhtml", xhtml(title, lang, `<div class="cover"><img src="${cover.href}" alt="Cover"/></div>`));
  }
  for (const f of files) zip.file(`OEBPS/${f.href}`, f.xml);
  for (const i of images) zip.file(`OEBPS/${i.href}`, i.data);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", mimeType: "application/epub+zip" });
}

/** Re-export so main.ts and tests share one import. */
export { parseBlocks };
