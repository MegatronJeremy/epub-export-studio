import type { Block, Inline, InlineStyle, ListItem } from "./ast";

/** Small, dependency-free parser for the Obsidian flavour of Markdown we export. */

export function parseMarkdown(source: string): Block[] {
  let text = source.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  text = text.replace(/^---\n[\s\S]*?\n---[ \t]*(\n|$)/, ""); // frontmatter
  text = text.replace(/%%[\s\S]*?%%/g, ""); // Obsidian comments
  text = text.replace(/<!--[\s\S]*?-->/g, ""); // HTML comments (hidden in Obsidian reading view)
  return parseBlocks(text.split("\n"));
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const ITEM = /^( *)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function isBlank(l: string): boolean {
  return l.trim() === "";
}

function startsTable(lines: string[], i: number): boolean {
  return (
    lines[i].includes("|") &&
    i + 1 < lines.length &&
    lines[i + 1].includes("-") &&
    TABLE_SEP.test(lines[i + 1]) &&
    lines[i + 1].includes("|")
  );
}

function startsBlock(lines: string[], i: number): boolean {
  const l = lines[i];
  return (
    FENCE.test(l) ||
    HEADING.test(l) ||
    HR.test(l) ||
    /^ {0,3}>/.test(l) ||
    ITEM.test(l) ||
    startsTable(lines, i)
  );
}

export function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1];
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) body.push(lines[i++]);
      i++; // closing fence (or EOF)
      blocks.push({ t: "code", lang: fence[2] ?? "", text: body.join("\n") });
      continue;
    }

    const h = line.match(HEADING);
    if (h) {
      blocks.push({ t: "heading", level: h[1].length as 1 | 2 | 3 | 4 | 5 | 6, content: parseInline(h[2]) });
      i++;
      continue;
    }

    if (i + 1 < lines.length && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1]) && !startsBlock(lines, i) && !/^ {0,3}(-|=)/.test(line)) {
      blocks.push({ t: "heading", level: lines[i + 1].trim().startsWith("=") ? 1 : 2, content: parseInline(line.trim()) });
      i += 2;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ t: "hr" });
      i++;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) q.push(lines[i++].replace(/^ {0,3}>\s?/, ""));
      const co = q[0].match(/^\[!([\w-]+)\][+-]?\s*(.*)$/);
      if (co) {
        const kind = co[1].toLowerCase();
        const title = co[2].trim() || kind.charAt(0).toUpperCase() + kind.slice(1);
        blocks.push({ t: "callout", kind, title: parseInline(title), children: parseBlocks(q.slice(1)) });
      } else {
        blocks.push({ t: "quote", children: parseBlocks(q) });
      }
      continue;
    }

    if (startsTable(lines, i)) {
      const header = splitRow(line).map((c) => parseInline(c));
      const align = splitRow(lines[i + 1]).map((c) => {
        const s = c.trim();
        if (s.startsWith(":") && s.endsWith(":")) return "center" as const;
        if (s.endsWith(":")) return "right" as const;
        return "left" as const;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && !isBlank(lines[i]) && lines[i].includes("|")) {
        const cells = splitRow(lines[i]).map((c) => parseInline(c));
        while (cells.length < header.length) cells.push([]);
        rows.push(cells.slice(0, Math.max(header.length, 1)));
        i++;
      }
      blocks.push({ t: "table", header, align, rows });
      continue;
    }

    if (ITEM.test(line)) {
      const items: ListItem[] = [];
      const stack: number[] = [];
      while (i < lines.length) {
        const m = lines[i].match(ITEM);
        if (m) {
          const indent = m[1].length;
          while (stack.length && indent < stack[stack.length - 1]) stack.pop();
          if (!stack.length || indent > stack[stack.length - 1]) stack.push(indent);
          let content = m[3];
          let checked: boolean | undefined;
          const task = content.match(/^\[([ xX\/\-])\]\s+(.*)$/);
          if (task) {
            checked = task[1] === "x" || task[1] === "X";
            content = task[2];
          }
          items.push({ level: Math.min(stack.length - 1, 8), ordered: /\d/.test(m[2]), checked, content: parseInline(content) });
          i++;
        } else if (!isBlank(lines[i]) && /^ +\S/.test(lines[i]) && items.length && !startsBlock(lines, i)) {
          const last = items[items.length - 1];
          last.content = [...last.content, { t: "break" }, ...parseInline(lines[i].trim())];
          i++;
        } else if (isBlank(lines[i]) && i + 1 < lines.length && ITEM.test(lines[i + 1])) {
          i++; // loose list continues
        } else break;
      }
      blocks.push({ t: "list", items });
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) para.push(lines[i++]);
    const content: Inline[] = [];
    para.forEach((p, idx) => {
      if (idx > 0) content.push({ t: "break" });
      content.push(...parseInline(p.trim()));
    });
    blocks.push({ t: "paragraph", content });
  }
  return blocks;
}

/** Split a table row on `|`, ignoring pipes inside `[[wikilinks]]`, backticks or escaped. */
export function splitRow(row: string): string[] {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = "";
  let depth = 0;
  let tick = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|";
      i++;
      continue;
    }
    if (c === "`") tick = !tick;
    if (!tick && c === "[" && s[i + 1] === "[") depth++;
    if (!tick && c === "]" && s[i + 1] === "]" && depth > 0) depth--;
    if (c === "|" && depth === 0 && !tick) {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

export function parseInline(src: string, style: InlineStyle = {}): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      out.push({ t: "text", text: buf, ...style });
      buf = "";
    }
  };
  const widthOf = (s: string | undefined): number | undefined => {
    const n = s && /^\d+$/.test(s.trim()) ? parseInt(s.trim(), 10) : undefined;
    return n && n > 0 ? n : undefined;
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const prev = i > 0 ? src[i - 1] : " ";
    let m: RegExpMatchArray | null;

    if (rest[0] === "\\" && rest.length > 1 && /[\\`*_{}[\]()#+\-.!|~=>]/.test(rest[1])) {
      buf += rest[1];
      i += 2;
      continue;
    }
    if ((m = rest.match(/^!\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/))) {
      flush();
      out.push({ t: "image", src: m[1].trim(), alt: m[1].trim(), width: widthOf(m[2]) });
    } else if ((m = rest.match(/^!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/))) {
      flush();
      const [alt, w] = m[1].split("|");
      out.push({ t: "image", src: m[2], alt: alt.trim(), width: widthOf(w) });
    } else if ((m = rest.match(/^\[\^([^\]\s]+)\](?!:)/))) {
      flush();
      out.push({ t: "fnref", id: m[1] });
    } else if ((m = rest.match(/^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]/))) {
      buf += m[2] !== undefined ? m[2] : m[1].replace(/#\^?/g, " > ").replace(/ > $/, "").trim();
    } else if ((m = rest.match(/^\[([^\]]+)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/))) {
      flush();
      out.push({ t: "link", href: m[2], children: parseInline(m[1], style) });
    } else if ((m = rest.match(/^https?:\/\/[^\s<>]+/)) && /\s/.test(prev)) {
      const url = m[0].replace(/[.,;:!?)]+$/, "");
      flush();
      out.push({ t: "link", href: url, children: [{ t: "text", text: url, ...style }] });
      i += url.length;
      continue;
    } else if ((m = rest.match(/^`([^`]+)`/))) {
      flush();
      out.push({ t: "text", text: m[1], ...style, code: true });
    } else if ((m = rest.match(/^\*\*\*(?=\S)([\s\S]+?)(?<=\S)\*\*\*/))) {
      flush();
      out.push(...parseInline(m[1], { ...style, bold: true, italic: true }));
    } else if ((m = rest.match(/^(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\1/))) {
      flush();
      out.push(...parseInline(m[2], { ...style, bold: true }));
    } else if ((m = rest.match(/^~~(?=\S)([\s\S]+?)(?<=\S)~~/))) {
      flush();
      out.push(...parseInline(m[1], { ...style, strike: true }));
    } else if ((m = rest.match(/^==(?=\S)([\s\S]+?)(?<=\S)==/))) {
      flush();
      out.push(...parseInline(m[1], { ...style, highlight: true }));
    } else if ((m = rest.match(/^\*(?=[^\s*])([^*]+?)(?<=\S)\*/))) {
      flush();
      out.push(...parseInline(m[1], { ...style, italic: true }));
    } else if (/[^A-Za-z0-9]/.test(prev) && (m = rest.match(/^_(?=[^\s_])([^_]+?)(?<=\S)_(?![A-Za-z0-9])/))) {
      flush();
      out.push(...parseInline(m[1], { ...style, italic: true }));
    } else if ((m = rest.match(/^<br\s*\/?>/i))) {
      flush();
      out.push({ t: "break" });
    } else {
      buf += rest[0];
      i++;
      continue;
    }
    i += m[0].length;
  }
  flush();
  return out;
}

/**
 * Pull `[^id]: text` definitions (with indented continuation lines) out of the source.
 * Fenced code is left alone. Used only when Pro footnotes are on.
 */
export function extractFootnotes(source: string): { text: string; defs: Map<string, string> } {
  const defs = new Map<string, string>();
  const out: string[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const f = l.match(FENCE);
    if (fence) {
      if (l.trim().startsWith(fence)) fence = null;
      out.push(l);
      continue;
    }
    if (f) {
      fence = f[1];
      out.push(l);
      continue;
    }
    const d = l.match(/^\[\^([^\]\s]+)\]:\s*(.*)$/);
    if (!d) {
      out.push(l);
      continue;
    }
    let body = d[2];
    while (i + 1 < lines.length && /^( {2,}|\t)\S/.test(lines[i + 1])) body += " " + lines[++i].trim();
    if (!defs.has(d[1])) defs.set(d[1], body.trim());
  }
  return { text: out.join("\n"), defs };
}
