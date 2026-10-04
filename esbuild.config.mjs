import esbuild from "esbuild";
import { builtinModules as builtins } from "node:module";
import fs from "node:fs";

// jszip's setImmediate polyfills probe createElement("script") (IE-era fallbacks).
// Obsidian's review rejects script-element creation, so these dead branches are cut (keeping the setTimeout fallback) at build time.
const SCRIPT_PROBES = [
  [/"document"in \w+&&"onreadystatechange"in \w+\.document\.createElement\("script"\)\?function\(\)\{[^]*?\}:(function\(\)\{setTimeout)/g, "$1"],
  [/\w+&&"onreadystatechange"in \w+\.createElement\("script"\)\?\([^]*?\}\):(function\(\w+\)\{setTimeout)/g, "$1"],
];
const noScriptProbe = {
  name: "no-script-probe",
  setup(build) {
    build.onLoad({ filter: /node_modules[\\/]jszip[\\/]dist[\\/]jszip\.min\.js$/ }, (args) => {
      let code = fs.readFileSync(args.path, "utf8");
      for (const [probe, keep] of SCRIPT_PROBES) {
        if (!new RegExp(probe.source).test(code)) throw new Error("setImmediate polyfill pattern not found in jszip; update esbuild.config.mjs: " + probe);
        code = code.replace(probe, keep);
      }
      // also dead: jszip's setImmediate polyfill evaluates a non-function argument (see below)
      if (!/new Function\(""\+\w+\)/.test(code)) throw new Error("new Function pattern not found in jszip; update esbuild.config.mjs");
      code = code.replace(/new Function\(""\+(\w+)\)/, "function(){}");
      return { contents: code, loader: "js" };
    });
  },
};

// Third-party licence notices travel inside main.js: Obsidian installs only main.js and manifest.json.
const notices = fs.readFileSync("THIRD-PARTY-NOTICES.md", "utf8").replaceAll("*/", "* /");

const production = process.argv[2] === "production";

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  plugins: [noScriptProbe],
  banner: { js: "/*!\n" + notices + "\n*/" },
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2020",
  platform: "browser",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: false, // Obsidian policy: no obfuscation; keep readable
  treeShaking: true,
  outfile: "main.js",
});

if (production) {
  await ctx.rebuild();
  process.exit(0);
} else {
  await ctx.watch();
}
