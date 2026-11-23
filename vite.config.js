import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

// PWA: build paytida dist/sw.js ni yaratadi (oldindan keshlanadigan fayllar ro'yxati bilan).
// Qo'shimcha kutubxona kerak emas. Shablon: src/pwa/sw-template.js
function serviceWorkerPlugin() {
  const listPublic = (dir, base = dir) =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? listPublic(full, base) : [relative(base, full).split("\\").join("/")];
    });

  return {
    name: "cafe-pos-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith(".map") && f !== "index.html");
      const fromPublic = listPublic("public");
      const files = ["/", "/index.html", ...[...built, ...fromPublic].sort().map((f) => `/${f}`)];
      const version = createHash("sha256").update(files.join("|")).digest("hex").slice(0, 12);
      const source = readFileSync("src/pwa/sw-template.js", "utf8")
        .replace("const VERSION = '__VERSION__';", `const VERSION = '${version}';`)
        .replace("const PRECACHE = __PRECACHE__;", `const PRECACHE = ${JSON.stringify(files, null, 2)};`);
      if (source.includes("__VERSION__") || source.includes("__PRECACHE__")) {
        this.error("sw.js shabloni to'liq to'ldirilmadi");
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
});
