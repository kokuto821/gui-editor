import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Files, asFsError } from "../src/server/fs";
import * as git from "../src/server/git";
import { sanitize } from "../src/server/settings";

let tmp: string, home: string, proj: string, files: Files;

beforeAll(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cgui-ops-")));
  home = path.join(tmp, "home");
  proj = path.join(tmp, "proj");
  await fs.mkdir(home);
  await fs.mkdir(proj);
  files = new Files(home);
});
afterAll(() => fs.rm(tmp, { recursive: true, force: true }));

describe("write / rename / delete", () => {
  it("書き込み: 今の mtime を渡せば保存でき、ずれていれば conflict で断る", async () => {
    const f = path.join(proj, "a.md");
    await fs.writeFile(f, "one");
    const st = await fs.stat(f);
    const { mtime } = await files.write(f, "two", st.mtimeMs);
    expect(await fs.readFile(f, "utf8")).toBe("two");
    // 外で書き換えられた（mtime が変わった）
    await fs.utimes(f, new Date(), new Date(Date.now() + 5000));
    await expect(files.write(f, "three", mtime)).rejects.toMatchObject({ code: "conflict" });
    expect(await fs.readFile(f, "utf8")).toBe("two");
  });
  it("ホームの外にも書ける", async () => {
    const out = path.join(tmp, "out.txt");
    await fs.writeFile(out, "x");
    await files.write(out, "y", undefined);
    expect(await fs.readFile(out, "utf8")).toBe("y");
  });
  it("名前変更: 同名があれば断り、不正な名前も断る", async () => {
    await fs.writeFile(path.join(proj, "r1.txt"), "1");
    await fs.writeFile(path.join(proj, "r2.txt"), "2");
    expect((await files.rename(path.join(proj, "r1.txt"), "r3.txt")).path).toBe(path.join(proj, "r3.txt"));
    await expect(files.rename(path.join(proj, "r3.txt"), "r2.txt")).rejects.toMatchObject({ code: "exists" });
    await expect(files.rename(path.join(proj, "r3.txt"), "../x")).rejects.toMatchObject({ code: "bad_request" });
    await expect(files.rename(path.join(proj, "r3.txt"), "..")).rejects.toMatchObject({ code: "bad_request" });
  });
  it("削除: フォルダは中身ごと消え、ホームとその上は消せない", async () => {
    await fs.mkdir(path.join(proj, "d/e"), { recursive: true });
    await fs.writeFile(path.join(proj, "d/e/f.txt"), "x");
    await files.delete(path.join(proj, "d"));
    await expect(fs.stat(path.join(proj, "d"))).rejects.toThrow();
    await expect(files.delete(home)).rejects.toMatchObject({ code: "forbidden" });
    await expect(files.delete(tmp)).rejects.toMatchObject({ code: "forbidden" }); // ホームの親
    await expect(files.rename(home, "h2")).rejects.toMatchObject({ code: "forbidden" });
    await files.delete(path.join(tmp, "out.txt")); // ホームの外のファイルは消せる
  });
  it.skipIf(process.getuid?.() === 0)("OS に断られたら「権限がありません」（forbidden）", async () => {
    const locked = path.join(proj, "locked");
    await fs.mkdir(locked);
    await fs.writeFile(path.join(locked, "a.txt"), "a");
    const ro = path.join(proj, "ro.txt");
    await fs.writeFile(ro, "ro");
    await fs.chmod(ro, 0o444);
    await fs.chmod(locked, 0o000);
    try {
      const forbidden = { code: "forbidden", message: "権限がありません" };
      const call = (f: () => Promise<unknown>) => f().catch((e) => { throw asFsError(e); });
      await expect(call(() => files.list(locked))).rejects.toMatchObject(forbidden);
      await expect(call(() => files.read(path.join(locked, "a.txt")))).rejects.toMatchObject(forbidden);
      await expect(call(() => files.write(ro, "x", undefined))).rejects.toMatchObject(forbidden);
    } finally {
      await fs.chmod(locked, 0o755);
    }
  });
  it("リンクを消しても、リンク先は消えない", async () => {
    const target = path.join(proj, "keep.txt");
    await fs.writeFile(target, "keep");
    await fs.symlink(target, path.join(proj, "ln.txt"));
    await files.delete(path.join(proj, "ln.txt"));
    expect(await fs.readFile(target, "utf8")).toBe("keep");
  });
});

describe("git", () => {
  let repo: string;
  const run = (...a: string[]) => execFileSync("git", a, { cwd: repo, stdio: "pipe" });
  beforeAll(async () => {
    repo = path.join(tmp, "repo");
    await fs.mkdir(path.join(repo, "sub"), { recursive: true });
    run("init", "-q", "-b", "main");
    run("config", "user.email", "t@example.com");
    run("config", "user.name", "T");
    run("config", "commit.gpgsign", "false");
    await fs.writeFile(path.join(repo, "a.txt"), "one\ntwo\n");
    await fs.writeFile(path.join(repo, "sub/b.txt"), "b\n");
    run("add", ".");
    run("commit", "-q", "-m", "first commit");
    await fs.writeFile(path.join(repo, "a.txt"), "one\nTWO\nthree\n");
    await fs.writeFile(path.join(repo, "new.txt"), "n\n");
    await fs.rm(path.join(repo, "sub/b.txt"));
  });

  it("リポジトリでないフォルダは isRepo: false", async () => {
    expect(await git.status(home)).toEqual({ isRepo: false, files: [] });
  });
  it("status: 変更・未追跡・削除を、相対パスで返す", async () => {
    const s = await git.status(repo);
    expect(s.isRepo).toBe(true);
    expect(s.files).toEqual([
      { path: "a.txt", status: "M" },
      { path: "new.txt", status: "?" },
      { path: "sub/b.txt", status: "D" },
    ]);
  });
  it("status: プロジェクトが下のフォルダなら、その中だけ", async () => {
    const s = await git.status(path.join(repo, "sub"));
    expect(s.files).toEqual([{ path: "b.txt", status: "D" }]);
  });
  it("log: コミットの一覧", async () => {
    const c = await git.log(repo);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ subject: "first commit", author: "T" });
    expect(c[0]!.hash).toMatch(/^[0-9a-f]{40}$/);
  });
  it("diff: 変更・未追跡・コミット", async () => {
    expect((await git.diff(repo, "a.txt")).patch).toContain("+TWO");
    expect((await git.diff(repo, "new.txt")).patch).toContain("+n");
    const c = (await git.log(repo))[0]!;
    expect((await git.diff(repo, undefined, c.hash)).patch).toContain("+one");
  });
  it("diff: 不正な引数は空", async () => {
    expect((await git.diff(repo, undefined, "--output=/tmp/x")).patch).toBe("");
    expect((await git.diff(repo, "../../etc/passwd")).patch).toBe("");
  });
  it("git の書き込み系は呼ばない（status で index が変わらない）", async () => {
    const before = await fs.stat(path.join(repo, ".git/index"));
    await git.status(repo);
    const after = await fs.stat(path.join(repo, ".git/index"));
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});

describe("settings.sanitize", () => {
  it("知らない項目は捨て、足りない項目は既定値にする", () => {
    const s = sanitize({ projects: [{ path: "/a", bookmarks: ["x", 1] }, { path: "rel" }, null], evil: 1, layout: { listWidth: 99999 } });
    expect(s.projects).toEqual([{ path: "/a", bookmarks: ["x"] }]);
    expect(s.layout.listWidth).toBe(2000);
    expect(s.layout.panels).toEqual({ projectTabs: true, list: true, previewTabs: true, status: true });
    expect(s).not.toHaveProperty("evil");
  });
});
