# EPUB Export Studio 0.1.0: test record (public copy)

Build tested (the files that will be attached to the 0.1.0 release):
- main.js sha256 45cb684f0644349c3950f4d995934fee3d08501229504c4c3daf65dc1090358c
- manifest.json sha256 be2b6ad75ba6da54319b0b1455573992a8260e0084d5eeb8a6f4df460149cbd1 (version 0.1.0)

Automated checks (2026-10-04, on this source, with the Pro product id set): typecheck PASS, 19 tests in 5 files PASS (vitest), production build PASS.

EPUB validation: sample books (free and Pro, with cover, footnotes, image, table) report 0 errors and 0 warnings in epubcheck 5.1.0.

REAL OBSIDIAN RUN (2026-10-04, Obsidian 1.13.7 Linux, fresh vault, no other plugins, on the exact hashes above): PASS, no bugs found.
- Plugin loads with no console errors; both commands register.
- Free export (image, footnote, headings, table, callout) works; a free user running the folder export gets the "Pro feature" notice and no file.
- With Pro switched on through settings data (not a real licence key): cover, metadata, folder compile (also with subfolders), custom CSS (remote @import and url() stripped). Missing cover gives a notice and still exports.
- epubcheck 5.1.0 on 7 exported files: 0 fatals, 0 errors, 0 warnings.
- An invalid licence key is rejected by Gumroad ("does not recognise this licence key") and the plugin stays free.
- Network: the plugin contacted only api.gumroad.com, at the Verify click. No traffic during exports.
Caveats: community plugins were enabled through the app API, not the button; Pro was forced, so Verify was tested only with an invalid key; the first Obsidian process died mid-run and steps were finished in a restarted one with the same vault.

Not tested: a valid licence key against live Gumroad (first paying buyers are that test); e-readers and reading apps (Kindle, Kobo, Apple Books, Calibre); the native trust dialog; clicking the context-menu entry and ribbon icon (command path used); Windows, macOS; mobile (plugin is desktop-only); minAppVersion 1.5.0 (only 1.13.7 used); very large books; SVG/remote images.

## Version 0.1.1 (added 2026-10-05)
- Change: two lint errors found by running eslint-plugin-obsidianmd 0.4.2 (recommended config, typescript-eslint type-aware) on 0.1.0 were fixed without changing behaviour: a control-character regex in the XML-safe text filter became a character-code loop, and one unnecessary type assertion was removed. After the fix: 0 errors, 12 warnings (sentence-case wording, settings-search API, `globalThis`).
- Checks on 0.1.1: typecheck and production build pass, 19 automated tests pass (run_product_checks, 2026-10-05).
- Release build 0.1.1: `main.js` sha256 `2c048afe323e306aeaaa8e048afd52a4d9fc59ec258845c8e75003baf5de1da7`; `manifest.json` sha256 `228c7912153fa7d2cd4641550be8545a38196c67b6c45f47213cc4983f1f90b6`.
- Not done: the real-Obsidian run above was on 0.1.0 and was not repeated on 0.1.1; epubcheck was not re-run on 0.1.1 output (the automated sample test passes).

## Version 0.1.2 (added 2026-10-05)
- Change: three Markdown syntax bugs found by porting the DOCX Export Studio regression fixtures to EPUB, fixed in `src/parser.ts`: (1) setext headings (`Title` over `=====` or `-----`) were exported as plain text with the underline; (2) task states `[/]` and `[-]` were left as raw text in the book (now an unchecked box); (3) `<!-- html comments -->` were exported as visible text. The parser had been copied from the DOCX plugin before its 0.1.3 fixes.
- New `test/regression.test.ts`: 15 fixtures (callouts, wikilinks, images, embeds, tables, footnotes, tasks, math, code, highlights/tags/comments/frontmatter, Cyrillic/CJK/RTL/emoji, control characters, empty notes, escaped emphasis, headings/setext/comments). Each exports a book, unzips it, checks the chapter XHTML is well-formed XML and that expected text is present and no raw markdown syntax is left. With the three fixes removed, the tasks and heading/comment fixtures fail; with them, all pass.
- Checks on 0.1.2 (run_product_checks, 2026-10-05): typecheck PASS, 34 tests in 6 files PASS (19 earlier + 15 new), production build PASS.
- epubcheck 5.1.0 re-run on sample-free.epub and sample-pro.epub made by the 0.1.2 code: 0 fatals, 0 errors, 0 warnings on both.
- Release build 0.1.2: `main.js` sha256 `e00c7b00f523cd60d7307d605f62ee43bde6bb4306c0ae7342d56a585f2d297c`; `manifest.json` sha256 `83fa4d7b4e156ba094819f465170d892793171ae6485439b13359b10ae38daa5`.
- Known limits unchanged and not fixed here: math stays as readable source text, `![[note]]` embeds are not expanded (no raw syntax leaks).
- Not done: the real-Obsidian run was on 0.1.0 and was not repeated on 0.1.1 or 0.1.2; not tested in e-readers or reading apps.
