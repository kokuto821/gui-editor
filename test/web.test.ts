import { describe, expect, it } from "vitest";
import { renderMd } from "../src/web/md";
import { resolvePath, tilde } from "../src/web/paths";

describe("resolvePath", () => {
  it("相対パスを解決する", () => {
    expect(resolvePath("/a/b", "c/d.md")).toBe("/a/b/c/d.md");
    expect(resolvePath("/a/b", "../x.png")).toBe("/a/x.png");
    expect(resolvePath("/a", "./y")).toBe("/a/y");
  });
  it("ルートより上に出るときは null", () => {
    expect(resolvePath("/a", "../../x")).toBeNull();
  });
});

describe("tilde", () => {
  it("ホームを ~ にする", () => {
    expect(tilde("/home/me", "/home/me")).toBe("~");
    expect(tilde("/home/me/w/x", "/home/me")).toBe("~/w/x");
    expect(tilde("/tmp/x", "/home/me")).toBe("/tmp/x");
  });
});

describe("renderMd", () => {
  const url = (p: string) => `/file?path=${p}`;
  it("HTML は通さない", () => {
    expect(renderMd("<script>alert(1)</script>", "/a/x.md", "/a", url)).not.toContain("<script>");
  });
  it("チェックボックスを出す", () => {
    const html = renderMd("- [x] 済\n- [ ] 未", "/a/x.md", "/a", url);
    expect(html.match(/<input type="checkbox"/g)).toHaveLength(2);
    expect(html.match(/checked/g)).toHaveLength(1);
  });
  it("画像は相対パスだけを、サーバー経由で出す", () => {
    expect(renderMd("![a](p.png)", "/a/x.md", "/a", url)).toContain('src="/file?path=/a/p.png"');
    expect(renderMd("![a](https://e.com/p.png)", "/a/x.md", "/a", url)).not.toContain("<img");
    expect(renderMd("![a](/etc/p.png)", "/a/x.md", "/a", url)).not.toContain("<img");
  });
  it("javascript: のリンクは出さない", () => {
    expect(renderMd("[x](javascript:alert(1))", "/a/x.md", "/a", url)).not.toContain("href");
  });
});
