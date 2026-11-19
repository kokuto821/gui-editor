import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Files, looksLikeText } from "../src/server/fs";
import { isInside } from "../src/server/paths";

describe("looksLikeText", () => {
  it("テキストと日本語は通す", () => {
    expect(looksLikeText(Buffer.from("hello\n日本語"))).toBe(true);
  });
  it("NUL バイトがあれば、テキストではない", () => {
    expect(looksLikeText(Buffer.from([0x68, 0x00, 0x69]))).toBe(false);
  });
  it("UTF-8 として読めなければ、テキストではない", () => {
    expect(looksLikeText(Buffer.from([0xff, 0xfe, 0xfd]))).toBe(false);
  });
  it("先頭で途切れたマルチバイト文字は許す", () => {
    expect(looksLikeText(Buffer.from("あ").subarray(0, 2))).toBe(true);
  });
});

describe("isInside", () => {
  it("同じ場所と下は true、外と兄弟は false", () => {
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
  });
});

describe("Files", () => {
  let tmp: string, home: string, proj: string, outside: string, files: Files;
  beforeAll(async () => {
    tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cgui-")));
    home = path.join(tmp, "home");
    proj = path.join(tmp, "proj"); // ホームの外にあるプロジェクト
    outside = path.join(tmp, "outside");
    await Promise.all([home, proj, outside].map((d) => fs.mkdir(d)));
    await fs.mkdir(path.join(proj, "docs"));
    await fs.writeFile(path.join(proj, "b.md"), "# b");
    await fs.writeFile(path.join(proj, "a.ts"), "export {}");
    await fs.writeFile(path.join(proj, "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]));
    await fs.writeFile(path.join(proj, "x.bin"), Buffer.from([1, 2, 0, 3]));
    await fs.writeFile(path.join(outside, "secret.png"), "secret");
    await fs.symlink(path.join(outside, "secret.png"), path.join(proj, "link.png"));
    files = new Files(home);
  });
  afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

  it("一覧はフォルダが先、名前順で、種類を付ける", async () => {
    const { entries } = await files.list(proj);
    expect(entries.map((e) => `${e.name}:${e.kind}`)).toEqual([
      "docs:dir",
      "a.ts:text",
      "b.md:text",
      "link.png:image",
      "pic.png:image",
      "x.bin:binary",
    ]);
  });
  it("ホームの外も読める", async () => {
    expect((await files.list(outside)).entries.map((e) => e.name)).toEqual(["secret.png"]);
    expect(await files.read(path.join(outside, "secret.png"))).toMatchObject({ kind: "image" });
  });
  it("シンボリックリンクは実体のパスで配る", async () => {
    expect((await files.imageFile(path.join(proj, "link.png"))).real).toBe(path.join(outside, "secret.png"));
  });
  it("相対パスは断る", async () => {
    await expect(files.list("../x")).rejects.toMatchObject({ code: "bad_request" });
  });
  it("読み取りの結果: テキスト・画像・非対応", async () => {
    expect(await files.read(path.join(proj, "b.md"))).toMatchObject({ kind: "text", text: "# b" });
    expect(await files.read(path.join(proj, "pic.png"))).toMatchObject({ kind: "image" });
    expect(await files.read(path.join(proj, "x.bin"))).toMatchObject({ kind: "unsupported", reason: "binary" });
  });
});
