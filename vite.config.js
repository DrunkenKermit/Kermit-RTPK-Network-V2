import { cpSync, readdirSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ROOT = process.cwd();

// Paths (relative to the project root) that are never copied into dist/.
// Only build internals, deploy staging, and the orphaned vendored game store
// are skipped (nothing references stores/ucp-games - Classplay was removed from
// the catalogue, and the only file that ever pointed at it, classplay.json, is
// itself unused). Every real site asset, including the GN-Math thumbnails under
// assets/img/games and the full icon-font sources, is copied so the deployed
// site matches the workspace byte for byte. This is aimed at Vercel, whose
// limits are file-count/build-time based rather than a single small size cap, so
// the heavy game art can ship.
const EXCLUDE = [
  ".git",
  "node_modules",
  "dist",
  ".vly-run",
  "isolate",
  "stores/ucp-games",
];

// Never ship local secret files.
function isSecret(rel) {
  return rel === ".env" || rel.startsWith(".env.");
}

function isExcluded(absPath) {
  const rel = relative(ROOT, absPath).split(sep).join("/");
  if (isSecret(rel)) return true;
  return EXCLUDE.some((ex) => rel === ex || rel.startsWith(ex + "/"));
}

// The site is a hand-written, multi-page static app. Instead of letting Vite
// parse/rewrite the huge HTML/CSS/JS tree, we keep Vite focused on a tiny React
// entry and copy the real site into dist/ verbatim, so it stays byte-identical.
function copyStaticSite() {
  return {
    name: "copy-static-site",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const out = resolve(ROOT, "dist");
      for (const name of readdirSync(ROOT)) {
        const src = resolve(ROOT, name);
        if (isExcluded(src)) continue;
        cpSync(src, resolve(out, name), { recursive: true, filter: (s) => !isExcluded(s) });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyStaticSite()],
  publicDir: false,
  server: {
    host: "0.0.0.0",
    hmr: false,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "wrapper",
    rollupOptions: {
      input: resolve(ROOT, "src/main.jsx"),
      output: {
        entryFileNames: "wrapper/[name].js",
        chunkFileNames: "wrapper/[name].js",
        assetFileNames: "wrapper/[name][extname]",
      },
    },
  },
});
