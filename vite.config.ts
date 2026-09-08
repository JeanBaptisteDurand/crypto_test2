import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: "es2020",
    cssMinify: true,
    // Videos never go in dist. They live on R2 (see scripts/assets.sh).
    assetsInlineLimit: 4096,
    // three.js + drei live in the lazily loaded TokenScene chunk (~260 KB gzip). The hero text paints first.
    chunkSizeWarningLimit: 1100,
  },
});
