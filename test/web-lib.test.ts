import { describe, expect, it } from "vitest";
import { parseDiff } from "../src/web/lib/diff";
import { relTime } from "../src/web/lib/time";
import { renderMd } from "../src/web/md";
import { DEFAULT_SETTINGS, bookmarksOf, withBookmark, withMovedPaths } from "../src/web/lib/settings-ops";

const PATCH = `diff --git a/a.txt b/a.txt
index 111..222 100644
--- a/a.txt
+++ b/a.txt
@@ -1,3 +1,4 @@ function f()
 one
-two
+TWO
+three
 four
diff --git a/new.txt b/new.txt
new file mode 100644
--- /dev/null
+++ b/new.txt
@@ -0,0 +1 @@
+n
diff --git a/img.png b/img.png
Binary files a/img.png and b/img.png differ
diff --git a/old.txt b/moved.txt
similarity index 100%
rename from old.txt
rename to moved.txt
`;

describe("parseDiff", () => {
  const f = parseDiff(PATCH);
  it("ファイルごとに分け、種類を読む", () => {
    expect(f.map((x) => [x.path, x.kind])).toEqual([["a.txt", "modified"], ["new.txt", "added"], ["img.png", "binary"], ["moved.txt", "renamed"]]);
    expect(f[3]!.oldPath).toBe("old.txt");
  });
  it("追加・削除の行数と、行番号を数える", () => {
    expect([f[0]!.add, f[0]!.del]).toEqual([2, 1]);
    const lines = f[0]!.hunks[0]!.lines;
    expect(lines.map((l) => `${l.t}:${l.o ?? "-"}:${l.n ?? "-"}:${l.text}`)).toEqual(["ctx:1:1:one", "del:2:-:two", "add:-:2:TWO", "add:-:3:three", "ctx:3:4:four"]);
    expect(f[0]!.hunks[0]!.header).toContain("function f()");
  });
  it("表示名を上書きできる（未追跡ファイルの差分は、絶対パスで出るため）", () => {
    expect(parseDiff("diff --git a/tmp/x/y.txt b/tmp/x/y.txt\nnew file mode 100644\n@@ -0,0 +1 @@\n+a\n", "y.txt")[0]!.path).toBe("y.txt");
  });
  it("空の入力は空", () => {
    expect(parseDiff("")).toEqual([]);
  });
});

describe("relTime", () => {
  const now = 1_000_000 * 1000;
  it("短い言い方にする", () => {
    expect(relTime(1_000_000 - 5, now)).toBe("たった今");
    expect(relTime(1_000_000 - 300, now)).toBe("5分前");
    expect(relTime(1_000_000 - 7200, now)).toBe("2時間前");
    expect(relTime(1_000_000 - 86400 * 3, now)).toBe("3日前");
  });
});

describe("ブックマークの設定", () => {
  const s0 = { ...DEFAULT_SETTINGS };
  it("追加・削除は、プロジェクトからの相対パスで持つ", () => {
    const s1 = withBookmark(s0, "/p", "/p/docs/a.md", true);
    expect(s1.projects).toEqual([{ path: "/p", bookmarks: ["docs/a.md"] }]);
    expect(bookmarksOf(s1, "/p")).toEqual(["/p/docs/a.md"]);
    expect(withBookmark(s1, "/p", "/p/docs/a.md", true).projects[0]!.bookmarks).toHaveLength(1); // 重複しない
    expect(bookmarksOf(withBookmark(s1, "/p", "/p/docs/a.md", false), "/p")).toEqual([]);
  });
  it("プロジェクトの外のパスは入れない", () => {
    expect(withBookmark(s0, "/p", "/q/a.md", true)).toBe(s0);
  });
  it("名前変更・削除に合わせて、パスを直す", () => {
    const s: typeof s0 = { ...s0, projects: [{ path: "/p", bookmarks: ["docs/a.md", "b.md"] }], favoriteProjects: ["/p/docs", "/z"] };
    const r = withMovedPaths(s, "/p/docs", "/p/doc2");
    expect(r.projects[0]!.bookmarks).toEqual(["doc2/a.md", "b.md"]);
    expect(r.favoriteProjects).toEqual(["/p/doc2", "/z"]);
    const d = withMovedPaths(s, "/p/docs", null);
    expect(d.projects[0]!.bookmarks).toEqual(["b.md"]);
    expect(d.favoriteProjects).toEqual(["/z"]);
  });
});

describe("renderMd の拡張", () => {
  const url = (p: string) => `/f?${p}`;
  it("チェックボックスは、ソースの行番号を持つ", () => {
    const html = renderMd("# t\n\n- [x] 済\n- [ ] 未", "/p/PLAN.md", "/p", url);
    expect(html).toContain('data-line="2"');
    expect(html).toContain('data-line="3"');
    expect(html).not.toContain("disabled");
  });
  it("[[リンク]] は、プロジェクトからの相対パスで解決する", () => {
    expect(renderMd("[[docs/a.md]]", "/p/sub/x.md", "/p", url)).toContain('data-goto="/p/docs/a.md"');
    expect(renderMd("[[../../x]]", "/p/x.md", "/p", url)).not.toContain("data-goto=\"/p");
  });
  it("mermaid のコードブロックは、図の入れ物にする", () => {
    const html = renderMd("```mermaid\nflowchart LR\n  A-->B\n```", "/p/x.md", "/p", url);
    expect(html).toContain('class="mmd"');
    expect(html).toContain("flowchart LR");
    expect(renderMd("```js\nlet a\n```", "/p/x.md", "/p", url)).not.toContain('class="mmd"');
  });
  it("図のソースに HTML があっても、そのまま出さない", () => {
    expect(renderMd("```mermaid\n<script>alert(1)</script>\n```", "/p/x.md", "/p", url)).not.toContain("<script>");
  });
});
