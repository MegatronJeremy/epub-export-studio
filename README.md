# EPUB Export Studio

Export an Obsidian note to an `.epub` e-book without Pandoc. Free for single notes; an optional Pro licence adds a cover, book metadata, folder-as-one-book compile and custom CSS.

> **AI-assisted.** This plugin and this README were written with AI assistance (Claude) by Quillfern (AI-assisted), a small AI-assisted studio, and checked by automated tests. The code is open source under the MIT licence.

> **Payment is required for full access.** Exporting a note to EPUB is free and not time-limited. Cover image, book metadata, folder compile and custom CSS need **EPUB Export Studio Pro**, a separate one-time purchase on Gumroad (US$9, 30-day refund): https://xparhyx.gumroad.com/l/pdefav

## Free version

Run **Export current note to EPUB** from the command palette, the ribbon icon, or the file menu. The `.epub` is saved next to the note (an existing file is never overwritten; a number is added).

- EPUB 3 package with a navigation table of contents built from your headings (h1 to h3).
- Headings, bold, italic, strike, highlight, inline code, links, bullet/numbered/task lists, tables, code blocks, quotes and callouts.
- Footnotes `[^1]` become numbered notes at the end of the chapter, linked both ways.
- Local PNG, JPEG and GIF images are embedded. Other image types and remote images are replaced by their alt text.
- Frontmatter, `%%comments%%` and links to other notes are not exported as content (wikilinks become plain text).
- Language is set to English; no author and no cover.

## Pro version (optional, paid)

- **Cover image** (PNG, JPEG or GIF from your vault).
- **Book metadata**: title is the note or folder name; author, language, publisher and description are set in settings.
- **Book compile**: right-click a folder, or run **Export folder as one EPUB book (Pro)**. One chapter per note, in file-name order (natural sort, so `2 …` comes before `10 …`), optionally including subfolders; up to 300 notes per run.
- **Custom CSS**, added after the default stylesheet. Remote `@import` and `url(http…)` are removed.

### Buying and activating Pro

1. Buy EPUB Export Studio Pro on Gumroad: https://xparhyx.gumroad.com/l/pdefav (US$9, one-time).
2. Gumroad emails you a licence key.
3. In Obsidian: Settings → Community plugins → EPUB Export Studio → paste the key → **Verify**.

If Pro doesn't work for you, or isn't what you expected, reply to your Gumroad receipt email within 30 days and we will refund you in full. Keys from refunded or charged-back purchases fail verification. Pro stays active offline until you press **Re-check**; the plugin never re-checks by itself.

## Other free EPUB exporters

You do not have to buy anything to get an EPUB out of Obsidian. Other free community plugins also export EPUB, some with covers and metadata (for example Document Exporter, EPUB Exporter, Inkbound, Manuscript Export, Manuscript Compiler). Compare them with this one before buying anything. Like several of them, this plugin needs no Pandoc; its Pro upgrade bundles cover, metadata, folder compile and CSS in one paid add-on.

## Network use, privacy and data

- **One network call, only when you press Verify / Re-check**: the plugin sends your licence key and the Pro product id to `https://api.gumroad.com/v2/licenses/verify`. It does not increase the licence's use count. Nothing else is sent.
- **No network call at startup, in the background, or during export.** Exporting works fully offline.
- **No telemetry, analytics, ads or tracking.** No server of ours is involved.
- Your licence key and settings are stored locally in the plugin's `data.json` inside your vault. Your notes never leave your computer.
- The plugin reads the notes and images you export, and writes the `.epub` into your vault.

## Install

- **From the community directory**: not listed yet. This line will change only after the directory accepts the plugin.
- **Manually**: download `main.js` and `manifest.json` from the latest GitHub release into `<your vault>/.obsidian/plugins/epub-export-studio/`, then enable the plugin under Community plugins. Desktop only.

## Known limits (honest status)

- Tested: automated tests (see TESTED.md) and the EPUB validator epubcheck 5.1.0 on sample books made by the code (free and Pro, on version 0.1.0; no errors, no warnings).
- **Tested in the real Obsidian app (1.13.7, Linux) on 2026-10-04 on version 0.1.0; version 0.1.1 (two lint fixes, no behaviour change) was not re-run in Obsidian, see TESTED.md. Not tested in e-readers or reading apps** (Kindle, Kobo, Apple Books, Calibre), nor on Windows, macOS or mobile. Passing the validator does not guarantee how every reader displays the book.
- Math, Mermaid, embedded notes (`![[note]]`), PDFs and audio are not exported.
- Page-level design (fonts, drop caps, etc.) is up to the reader app and your CSS; the default stylesheet is plain.
- A valid licence key has not been verified against the live Gumroad service yet; the first buyers are that test.

## Credits and licences

Built on [JSZip](https://github.com/Stuk/jszip) (MIT or GPL-3.0, used under MIT). Notices are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md). This plugin is MIT licensed (see `LICENSE`).

## Support

Report problems on the GitHub issues page of this repository. Made by Quillfern (AI-assisted).

"Obsidian", "Kindle", "Kobo" and "Apple Books" are trademarks of their respective owners. Not affiliated with them.
