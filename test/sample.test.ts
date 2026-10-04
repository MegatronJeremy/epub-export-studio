import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { buildEpub } from "../src/epub";
import { UnlockedGate } from "../src/pro";
import { SAMPLE } from "./fixtures-md";

// Writes sample books to qa/ so epubcheck can be run on exactly what the code produces.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const resolveImage = async (s: string) => (s === "pic.png" ? PNG : null);

it("writes qa/sample-free.epub and qa/sample-pro.epub", async () => {
  mkdirSync("qa", { recursive: true });
  writeFileSync("qa/sample-free.epub", await buildEpub([{ title: "Field Notes", markdown: SAMPLE }], { title: "Field Notes", resolveImage }));
  writeFileSync(
    "qa/sample-pro.epub",
    await buildEpub(
      [
        { title: "Field Notes", markdown: SAMPLE },
        { title: "Second", markdown: "# Second chapter\n\nText.\n\n## Sub\n\nMore." },
        { title: "No heading", markdown: "Just text." },
      ],
      { title: "My Book", gate: new UnlockedGate(), pro: { author: "A. Writer", language: "en-GB", publisher: "P", description: "D", css: "p{color:#333}", cover: PNG }, resolveImage },
    ),
  );
});
