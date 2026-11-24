import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_OPTS } from "../src/shared/match";
import { listFiles, searchText } from "../src/server/search";

let tmp: string, repo: string, plain: string;

/** root の下に、相対パス → 中身 のとおりファイルを作る */
async function put(root: string, tree: Record<string, string | Buffer>): Promise<void> {
  for (const [rel, body] of Object.entries(tree)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await fs.writeFile(path.join(root, rel), body);
  }
}

const search = (root: string, q: string, opts = {}) => searchText(root, q, { ...DEFAULT_OPTS, ...opts });
/** 一致した範囲の文字列（from/to が text の添字になっているか） */
const marked = (h: { text: string; from: number; to: number }) => h.text.slice(h.from, h.to);

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cgui-search-")));
  repo = path.join(tmp, "repo");
  plain = path.join(tmp, "plain");

  await put(repo, {
    ".gitignore": "ignored/\n*.log\n",
    "a.txt": "needle one\n",
    "sub/b.md": "needle two\n",
    "gone.txt": "needle gone\n",
    "edited.txt": "needle before\n",
  });
  const run = (...a: string[]) => execFileSync("git", a, { cwd: repo, stdio: "pipe" });
  run("init", "-q", "-b", "main");
  run("config", "user.email", "t@example.com");
  run("config", "user.name", "T");
  run("config", "commit.gpgsign", "false");
  run("add", ".");
  run("commit", "-q", "-m", "first");
  await fs.rm(path.join(repo, "gone.txt"));
  await put(repo, {
    "edited.txt": "needle after\n",
    "untracked.txt": "needle new\n",
    "ignored/x.txt": "needle ignored\n",
    "debug.log": "needle log\n",
  });

  await put(plain, {
    "z.txt": "needle z\n",
    "a/b.txt": "needle ab\n",
    "node_modules/pkg/index.js": "needle module\n",
  });
  await fs.symlink(path.join(plain, "a"), path.join(plain, "dirlink"));
  await fs.symlink(path.join(plain, "z.txt"), path.join(plain, "filelink.txt"));
});
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("listFiles", () => {
  it("git のリポジトリでは、.gitignore の対象と .git を除き、相対パスの昇順で返す", async () => {
    expect(await listFiles(repo)).toEqual({
      files: [".gitignore", "a.txt", "edited.txt", "sub/b.md", "untracked.txt"],
      truncated: false,
    });
  });
  it("コミット済みでも、作業ツリーから消えたファイルは出さない", async () => {
    expect((await listFiles(repo)).files).not.toContain("gone.txt");
  });
  it("プロジェクトがリポジトリの下のフォルダなら、その中だけを、そこからの相対パスで返す", async () => {
    expect((await listFiles(path.join(repo, "sub"))).files).toEqual(["b.md"]);
  });
  it("git でないフォルダでは、node_modules を除いて全部を歩く", async () => {
    expect((await listFiles(plain)).files).toEqual(["a/b.txt", "filelink.txt", "z.txt"]);
  });
  it("フォルダへのリンクには入らない", async () => {
    expect((await listFiles(plain)).files.some((f) => f.startsWith("dirlink"))).toBe(false);
  });
});

describe("searchText", () => {
  it("空白だけの言葉では、何も探さない", async () => {
    expect(await search(repo, "  ")).toEqual({ hits: [], truncated: false });
  });
  it("一覧に出るファイルだけを探し、path の昇順で返す", async () => {
    const r = await search(repo, "needle");
    expect(r.hits.map((h) => h.path)).toEqual(["a.txt", "edited.txt", "sub/b.md", "untracked.txt"]);
    expect(r.truncated).toBe(false);
  });
  it("作業ツリーの今の中身を探す", async () => {
    expect((await search(repo, "needle after")).hits.map((h) => h.path)).toEqual(["edited.txt"]);
    expect((await search(repo, "needle before")).hits).toEqual([]);
  });
  it("git でないフォルダでは、node_modules の中を探さない", async () => {
    expect((await search(plain, "needle module")).hits).toEqual([]);
  });

  describe("1件の中身", () => {
    let root: string;
    beforeAll(async () => {
      root = path.join(tmp, "hits");
      await put(root, {
        "m.txt": "x\nfoo foo foo\ny\n  indented foo\r\nfoo last",
        "a.txt": "foo\n",
      });
    });
    it("同じファイルの中は line（1 始まり）の昇順で、1行に何度一致しても1件", async () => {
      const r = await search(root, "foo");
      expect(r.hits.map((h) => [h.path, h.line])).toEqual([["a.txt", 1], ["m.txt", 2], ["m.txt", 4], ["m.txt", 5]]);
    });
    it("from/to は、行の最初の一致の範囲", async () => {
      const h = (await search(root, "foo")).hits.find((x) => x.path === "m.txt" && x.line === 2)!;
      expect([h.text, h.from, h.to]).toEqual(["foo foo foo", 0, 3]);
    });
    it("行の先頭の空白と末尾の CR を落とし、from/to をそれに合わせる", async () => {
      const h = (await search(root, "foo")).hits.find((x) => x.line === 4)!;
      expect(h.text).toBe("indented foo");
      expect(marked(h)).toBe("foo");
    });
    it("一致が先頭の空白にかかるときは、行をそのまま返す", async () => {
      const h = (await search(root, "\\s+indented", { regexp: true })).hits[0]!;
      expect(h.text).toBe("  indented foo");
      expect(marked(h)).toBe("  indented");
    });
  });

  describe("長い行", () => {
    let root: string;
    beforeAll(async () => {
      root = path.join(tmp, "long");
      await put(root, {
        "mid.txt": `${"a".repeat(500)}NEEDLE${"b".repeat(500)}`,
        "head.txt": `NEEDLE${"b".repeat(1000)}`,
      });
    });
    it("一致が行の後ろにあれば、一致の手前から切り詰め、先頭に … を付ける", async () => {
      const h = (await search(root, "needle")).hits.find((x) => x.path === "mid.txt")!;
      expect(h.text.startsWith("…")).toBe(true);
      expect(h.text.length).toBeLessThan(300);
      expect(marked(h)).toBe("NEEDLE");
    });
    it("一致が行の頭にあれば、… を付けずに後ろを切り詰める", async () => {
      const h = (await search(root, "needle")).hits.find((x) => x.path === "head.txt")!;
      expect(h.text.startsWith("NEEDLE")).toBe(true);
      expect(h.text.length).toBeLessThan(300);
      expect(marked(h)).toBe("NEEDLE");
    });
  });

  describe("探さないファイル", () => {
    let root: string;
    beforeAll(async () => {
      root = path.join(tmp, "skip");
      await put(root, {
        "bin.dat": Buffer.concat([Buffer.from("needle"), Buffer.from([0, 1, 2])]),
        "big.txt": `needle\n${"x".repeat(2 * 1024 * 1024)}`,
        "ok.txt": "needle\n",
      });
    });
    it("バイナリと 2MB を超えるファイルは飛ばす", async () => {
      expect((await search(root, "needle")).hits.map((h) => h.path)).toEqual(["ok.txt"]);
    });
  });

  describe("件数の上限", () => {
    const lines = (n: number) => Array.from({ length: n }, () => "hit").join("\n");
    beforeAll(async () => {
      await put(path.join(tmp, "cap500"), { "f.txt": lines(500) });
      await put(path.join(tmp, "cap600"), { "f.txt": lines(600) });
    });
    it("ちょうど 500 件なら、全部返して truncated: false", async () => {
      const r = await search(path.join(tmp, "cap500"), "hit");
      expect(r.hits).toHaveLength(500);
      expect(r.truncated).toBe(false);
    });
    it("500 件を超えたら、前から 500 件で打ち切って truncated: true", async () => {
      const r = await search(path.join(tmp, "cap600"), "hit");
      expect(r.hits).toHaveLength(500);
      expect(r.hits.map((h) => h.line)).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
      expect(r.truncated).toBe(true);
    });
  });

  describe("条件", () => {
    let root: string;
    beforeAll(async () => {
      root = path.join(tmp, "opts");
      await put(root, { "f.txt": "Foo\nfoo\nfoobar\nx foo\nfo.o\n" });
    });
    const lines = async (q: string, opts = {}) => (await search(root, q, opts)).hits.map((h) => h.line);

    it("既定では、大文字小文字を区別しない", async () => {
      expect(await lines("foo")).toEqual([1, 2, 3, 4]);
    });
    it("大文字小文字を区別する", async () => {
      expect(await lines("Foo", { caseSensitive: true })).toEqual([1]);
    });
    it("単語単位", async () => {
      expect(await lines("foo", { wholeWord: true })).toEqual([1, 2, 4]);
    });
    it("正規表現を切ると、記号は文字どおり", async () => {
      expect(await lines("fo.o")).toEqual([5]);
    });
    it("正規表現の ^ は、行の頭に一致する", async () => {
      expect(await lines("^foo", { regexp: true, caseSensitive: true })).toEqual([2, 3]);
    });
    it("正しくない正規表現は bad_request で断る", async () => {
      await expect(search(root, "(", { regexp: true })).rejects.toMatchObject({ code: "bad_request" });
    });
  });
});
