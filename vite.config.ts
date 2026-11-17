import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// 画面は src/web をルートにして dist/web へ出す。サーバー（dist/cli.js）が dist/web を配る。
export default defineConfig({
  root: "src/web",
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
