// ブラウザ側のパス操作（posix のみ。WSL / macOS が対象）

export const joinPath = (dir: string, name: string) => (dir === "/" ? `/${name}` : `${dir}/${name}`);
export const dirOf = (p: string) => (p.lastIndexOf("/") <= 0 ? "/" : p.slice(0, p.lastIndexOf("/")));
export const baseOf = (p: string) => p.slice(p.lastIndexOf("/") + 1);
export const isInside = (parent: string, child: string) =>
  child === parent || child.startsWith(parent === "/" ? "/" : parent + "/");

/** 相対パスを dir を基準に解決する。`..` で `/` より上に出るなら null。 */
export function resolvePath(dir: string, rel: string): string | null {
  const out = dir.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (!out.length) return null;
      out.pop();
    } else out.push(seg);
  }
  return "/" + out.join("/");
}

export function tilde(p: string, home: string): string {
  return p === home ? "~" : isInside(home, p) ? "~" + p.slice(home.length) : p;
}

export function fmtSize(n: number): string {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}
