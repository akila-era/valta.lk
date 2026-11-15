// Builds the single-file production bundle. Run from apps/agent:  npm run bundle   (standard: no browser code)  or  npm run bundle:browser
//
// The flags match how the live bundle was built on 2026-11-13/14 (esbuild, ESM, node24, the same createRequire banner, relative path comments via
// --preserve-symlinks from this directory), so a rebuilt bundle differs from its source only where the source differs.
// Nothing here uploads, installs or runs anything: it writes dist/<name>.mjs and prints its SHA-256.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
process.chdir(root); // path comments in the bundle are relative to the working directory

const require = createRequire(import.meta.url);
const { build } = require("esbuild");

const browser = process.argv.includes("--browser");
const entry = browser ? "src/main-browser.ts" : "src/main.ts";
const outfile = browser ? "dist/agent-browser.mjs" : "dist/agent.mjs";
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: [entry],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  preserveSymlinks: true,
  banner: { js: 'import{createRequire as __cr}from"node:module";const require=__cr(import.meta.url);' },
  // The browser build keeps Playwright out of the file (it is installed on the host); the standard bundle never imports it.
  external: browser ? ["playwright-core"] : [],
  outfile,
  logLevel: "warning",
});

const bytes = readFileSync(outfile);
console.log(JSON.stringify({ entry, outfile, bytes: statSync(outfile).size, sha256: createHash("sha256").update(bytes).digest("hex") }));
