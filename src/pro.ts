/**
 * Pro gate. Every Pro feature asks `gate.has(feature)` before it runs. The free build uses
 * `FreeGate` (always false); after a successful licence check (src/license.ts) the plugin
 * uses `UnlockedGate`. No Pro code touches the network.
 */
export type ProFeature = "cover" | "metadata" | "compile" | "css";

export interface ProGate {
  has(feature: ProFeature): boolean;
}

export class FreeGate implements ProGate {
  has(_feature: ProFeature): boolean {
    return false;
  }
}

export class UnlockedGate implements ProGate {
  has(_feature: ProFeature): boolean {
    return true;
  }
}

export const PRO_FEATURE_LABELS: Record<ProFeature, string> = {
  cover: "Cover image",
  metadata: "Book metadata (title, author, language, publisher, description)",
  compile: "Book compile: a whole folder as one EPUB with a chapter per note",
  css: "Custom CSS",
};

/** Maximum custom CSS accepted, in characters. */
export const MAX_CSS = 50_000;

/**
 * Make user CSS safe for an offline e-book: no @import and no remote url() (EPUB readers block
 * remote resources and epubcheck rejects them). Returns the cleaned text.
 */
export function sanitizeCss(css: string): string {
  return css
    .slice(0, MAX_CSS)
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*['"]?\s*(?:https?:)?\/\/[^)]*\)/gi, "none")
    .replace(/<\/?style[^>]*>/gi, "");
}

/** A BCP-47-ish language tag (en, en-GB, zh-Hant-TW); anything else falls back to "en". */
export function sanitizeLanguage(v: string | undefined): string {
  const t = (v ?? "").trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/.test(t) ? t : "en";
}
