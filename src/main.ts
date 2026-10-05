import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, normalizePath, requestUrl } from "obsidian";
import { buildEpub, type Chapter } from "./epub";
import { HOW_TO_GET_PRO_URL } from "./config";
import { verifyLicense, type HttpPost } from "./license";
import { FreeGate, PRO_FEATURE_LABELS, UnlockedGate, type ProGate } from "./pro";

interface Settings {
  licenseKey: string;
  /** Result of the last manual check. Pro stays unlocked offline until the user re-checks. */
  proActive: boolean;
  author: string;
  language: string;
  publisher: string;
  description: string;
  /** Vault path of a PNG/JPEG/GIF cover image. */
  coverPath: string;
  css: string;
  includeSubfolders: boolean;
}

const DEFAULTS: Settings = {
  licenseKey: "",
  proActive: false,
  author: "",
  language: "en",
  publisher: "",
  description: "",
  coverPath: "",
  css: "",
  includeSubfolders: false,
};

const MAX_CHAPTERS = 300;

/** Adapt Obsidian's requestUrl (works on desktop and mobile, no CORS) to the fetch-like shape license.ts expects. */
const obsidianPost: HttpPost = async (url, init) => {
  const r = await requestUrl({ url, method: init.method, headers: init.headers, body: init.body, throw: false });
  return { status: r.status, json: async () => r.json as unknown };
};

/**
 * EPUB Export Studio. Free core: exports the active note to an .epub inside the vault.
 * Pro (licence key from Gumroad): cover image, book metadata, folder compile, custom CSS.
 * Network: exactly one call to api.gumroad.com when the user presses Verify/Re-check. No telemetry.
 */
export default class EpubExportStudio extends Plugin {
  settings: Settings = { ...DEFAULTS };

  get gate(): ProGate {
    return this.settings.proActive ? new UnlockedGate() : new FreeGate();
  }

  async onload() {
    const saved = (await this.loadData()) as Partial<Settings> | null;
    this.settings = { ...DEFAULTS, ...saved };
    this.addSettingTab(new ExportSettingTab(this.app, this));

    this.addCommand({
      id: "export-current-note-epub",
      name: "Export current note to EPUB",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.exportNote(file);
        return true;
      },
    });
    this.addCommand({
      id: "export-folder-epub",
      name: "Export folder as one EPUB book (Pro)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.parent) return false;
        if (!checking) void this.exportFolder(file.parent);
        return true;
      },
    });
    this.addRibbonIcon("book-open", "Export current note to EPUB", () => {
      const file = this.app.workspace.getActiveFile();
      if (file && file.extension === "md") void this.exportNote(file);
      else new Notice("Open a Markdown note first.");
    });
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, f) => {
        if (f instanceof TFile && f.extension === "md")
          menu.addItem((i) => i.setTitle("Export to EPUB").setIcon("book-open").onClick(() => void this.exportNote(f)));
        if (f instanceof TFolder)
          menu.addItem((i) => i.setTitle("Export folder as one EPUB book (Pro)").setIcon("book-open").onClick(() => void this.exportFolder(f)));
      }),
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, _editor, view) => {
        const f = view.file;
        if (f && f.extension === "md")
          menu.addItem((i) => i.setTitle("Export to EPUB").setIcon("book-open").onClick(() => void this.exportNote(f)));
      }),
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private async exportNote(file: TFile) {
    try {
      const path = await this.write([await this.chapter(file)], file.basename, file.parent);
      new Notice(`Exported to ${path}`);
    } catch (e) {
      console.error("EPUB Export Studio:", e);
      new Notice("EPUB export failed. See the developer console for details.");
    }
  }

  private async exportFolder(folder: TFolder) {
    if (!this.gate.has("compile")) {
      new Notice("Book compile is a Pro feature. Enter your licence key in the plugin settings.");
      return;
    }
    const files: TFile[] = [];
    const walk = (f: TFolder) => {
      const kids = [...f.children].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
      for (const c of kids) {
        if (c instanceof TFile && c.extension === "md") files.push(c);
        else if (c instanceof TFolder && this.settings.includeSubfolders) walk(c);
      }
    };
    walk(folder);
    if (!files.length) {
      new Notice("No Markdown notes in this folder.");
      return;
    }
    try {
      const batch = files.slice(0, MAX_CHAPTERS);
      const chapters: Chapter[] = [];
      for (const f of batch) chapters.push(await this.chapter(f));
      const name = folder.name || this.app.vault.getName();
      const path = await this.write(chapters, name, folder.parent);
      const capped = files.length > MAX_CHAPTERS ? ` (first ${MAX_CHAPTERS} of ${files.length} notes)` : "";
      new Notice(`Exported ${batch.length} note(s) to ${path}${capped}`);
    } catch (e) {
      console.error("EPUB Export Studio:", e);
      new Notice("EPUB export failed. See the developer console for details.");
    }
  }

  private async chapter(file: TFile): Promise<Chapter> {
    return { title: file.basename, markdown: await this.app.vault.cachedRead(file), path: file.path };
  }

  private async readCover(): Promise<Uint8Array | undefined> {
    const p = this.settings.coverPath.trim();
    if (!p) return undefined;
    const f = this.app.vault.getAbstractFileByPath(normalizePath(p));
    if (!(f instanceof TFile)) {
      new Notice("Cover image not found in the vault; exporting without a cover.");
      return undefined;
    }
    return new Uint8Array(await this.app.vault.readBinary(f));
  }

  /** Build the book and save it next to the source; returns the new path. */
  private async write(chapters: Chapter[], name: string, parent: TFolder | null): Promise<string> {
    const s = this.settings;
    const bytes = await buildEpub(chapters, {
      title: name,
      gate: this.gate,
      pro: {
        author: s.author,
        language: s.language,
        publisher: s.publisher,
        description: s.description,
        css: s.css,
        cover: this.gate.has("cover") ? await this.readCover() : undefined,
      },
      resolveImage: async (src, fromPath) => {
        const link = decodeURIComponent(src.split("#")[0]);
        const target = this.app.metadataCache.getFirstLinkpathDest(link, fromPath ?? "");
        return target ? new Uint8Array(await this.app.vault.readBinary(target)) : null;
      },
    });
    const folder = parent && parent.path !== "/" ? parent.path + "/" : "";
    let path = normalizePath(`${folder}${name}.epub`);
    let n = 1;
    while (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${folder}${name} (${n++}).epub`);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    await this.app.vault.createBinary(path, ab);
    return path;
  }
}

class ExportSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: EpubExportStudio) {
    super(app, plugin);
  }

  display() {
    const { containerEl: el } = this;
    const s = this.plugin.settings;
    el.empty();

    new Setting(el).setName("Pro upgrade").setHeading();
    el.createEl("p", {
      text:
        "Optional paid upgrade (one-time purchase on Gumroad). Pro unlocks: " +
        Object.values(PRO_FEATURE_LABELS).join("; ") +
        ". The free export always works. Network use: pressing Verify sends your licence key and the product id to api.gumroad.com, once per press. Nothing else is ever sent. No telemetry.",
    });
    el.createEl("p", { text: s.proActive ? "Status: Pro active." : "Status: free version." });
    const how = el.createEl("p");
    how.createEl("a", { text: "How to get Pro", href: HOW_TO_GET_PRO_URL });
    let key = s.licenseKey;
    new Setting(el)
      .setName("Licence key")
      .addText((t) => t.setPlaceholder("Paste your key").setValue(key).onChange((v) => (key = v)))
      .addButton((b) =>
        b.setButtonText(s.proActive ? "Re-check" : "Verify").onClick(() => void (async () => {
          b.setDisabled(true);
          const r = await verifyLicense(key, obsidianPost);
          s.proActive = r.status === "valid";
          s.licenseKey = r.status === "valid" || r.status === "refunded" ? key.trim() : s.licenseKey;
          await this.plugin.saveSettings();
          new Notice(r.message);
          this.display();
        })()),
      );

    if (!s.proActive) return;

    const text = (name: string, desc: string, get: () => string, set: (v: string) => void) =>
      new Setting(el).setName(name).setDesc(desc).addText((t) =>
        t.setValue(get()).onChange(async (v) => {
          set(v);
          await this.plugin.saveSettings();
        }),
      );

    new Setting(el).setName("Pro features").setHeading();
    text("Author", "Written to the book metadata.", () => s.author, (v) => (s.author = v));
    text("Language", "Language code such as en, de, fr or pt-BR.", () => s.language, (v) => (s.language = v));
    text("Publisher", "Optional.", () => s.publisher, (v) => (s.publisher = v));
    text("Description", "Optional blurb stored in the metadata.", () => s.description, (v) => (s.description = v));
    text("Cover image", "Vault path of a PNG, JPEG or GIF, for example Attachments/cover.png.", () => s.coverPath, (v) => (s.coverPath = v));
    new Setting(el).setName("Folder export includes subfolders").addToggle((t) =>
      t.setValue(s.includeSubfolders).onChange(async (v) => {
        s.includeSubfolders = v;
        await this.plugin.saveSettings();
      }),
    );
    new Setting(el)
      .setName("Custom CSS")
      .setDesc("Added after the default stylesheet. Remote @import and url() are removed.")
      .addTextArea((t) =>
        t.setValue(s.css).onChange(async (v) => {
          s.css = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
