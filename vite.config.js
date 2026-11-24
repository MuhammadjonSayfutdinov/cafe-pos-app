import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

// Dastur versiyasi: kod fayllari mazmunidan olingan qisqa hash. Kod o'zgarmasa, versiya ham
// o'zgarmaydi (qayta deploy qilinsa ham qurilmalar keraksiz yangilanmaydi).
// Ilovaga __APP_BUILD__ bo'lib kiradi, serverda /version.json bo'lib turadi (src/pwa/update.js).
function computeBuildId() {
  const hash = createHash("sha256");
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else hash.update(full.split("\\").join("/")).update(readFileSync(full));
    }
  };
  walk("src");
  walk("public");
  for (const f of ["index.html", "package.json", "package-lock.json", "vite.config.js"]) {
    try {
      hash.update(f).update(readFileSync(f));
    } catch {
      // fayl yo'q
    }
  }
  return hash.digest("hex").slice(0, 10);
}

const BUILD_ID = computeBuildId();
const BUILD_TIME = new Date().toISOString();

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
      const version = createHash("sha256").update(`${BUILD_ID}|${files.join("|")}`).digest("hex").slice(0, 12);
      const source = readFileSync("src/pwa/sw-template.js", "utf8")
        .replace("const VERSION = '__VERSION__';", `const VERSION = '${version}';`)
        .replace("const PRECACHE = __PRECACHE__;", `const PRECACHE = ${JSON.stringify(files, null, 2)};`);
      if (source.includes("__VERSION__") || source.includes("__PRECACHE__")) {
        this.error("sw.js shabloni to'liq to'ldirilmadi");
      }
      this.emitFile({ type: "asset", fileName: "sw.js", source });
      // Qurilmalar shu faylni tekshirib, yangi versiya chiqqanini biladi (keshlanmaydi: vercel.json)
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ build: BUILD_ID, builtAt: BUILD_TIME })
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerPlugin()],
  define: {
    __APP_BUILD__: JSON.stringify(BUILD_ID),
    __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME)
  }
});
