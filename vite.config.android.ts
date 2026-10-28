import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The APK opens this page straight from `file:///android_asset`, where the
 * browser blocks ES modules (opaque origin) and `fetch()`. The build therefore
 * emits a single classic script, and the HTML is rewritten so that the inlined
 * word data is available before the app boots.
 */
function classicShell(): Plugin {
  return {
    name: "word-atlas-classic-shell",
    enforce: "post",
    transformIndexHtml(html) {
      const tag = /<script[^>]*src="[^"]*assets\/app\.js"[^>]*>\s*<\/script>/;
      const match = tag.exec(html);
      if (!match) throw new Error("word-atlas-classic-shell: bundle script not found");
      const bundle = match[0].replace(/\s+type="module"/g, "").replace(/\s+crossorigin(="[^"]*")?/g, "");
      return (
        html
          // The index is inlined in data.js; the preload would hit the network layer.
          .replace(/\s*<link rel="preload" href="[^"]*atlas\/index\.json"[^>]*>/, "")
          .replace(tag, "")
          // A classic script must run after #root exists, and `document.currentScript`
          // (used by the inlined CSS to resolve font URLs) is only set for scripts
          // that are still parsing — so both go at the end of the body.
          .replace(
            "</body>",
            `  <script src="./atlas-embed/data.js" charset="utf-8"></script>\n    ${bundle}\n  </body>`,
          )
      );
    },
  };
}

export default defineConfig({
  base: "./",
  // `public/` goes straight into the APK from scripts/android/build_apk.py;
  // copying 730 MB of media through the bundler would only double the work.
  publicDir: false,
  plugins: [react(), classicShell()],
  build: {
    outDir: "dist-android",
    emptyOutDir: true,
    target: "es2020",
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 20000,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: "iife",
        inlineDynamicImports: true,
        entryFileNames: "assets/app.js",
      },
    },
  },
});
