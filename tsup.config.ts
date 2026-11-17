import { defineConfig } from "tsup";

// サーバーを dist/cli.js 1つにまとめる。ネイティブの @parcel/watcher と ws は外に置く。
export default defineConfig({
  entry: { cli: "src/server/cli.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: false,
  sourcemap: false,
  external: ["@parcel/watcher", "ws"],
});
