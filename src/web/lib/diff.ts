// unified diff を、表示用の形に読み替える（git diff / git show の出力が対象）

export interface DiffLine {
  t: "ctx" | "add" | "del";
  o?: number; // 変更前の行番号
  n?: number; // 変更後の行番号
  text: string;
}
export interface Hunk {
  /** `@@ -1,3 +1,4 @@ 関数名` の行そのまま */
  header: string;
  lines: DiffLine[];
}
export interface FileDiff {
  path: string;
  kind: "modified" | "added" | "deleted" | "renamed" | "binary";
  oldPath?: string;
  hunks: Hunk[];
  add: number;
  del: number;
}

export function parseDiff(patch: string, nameOverride?: string): FileDiff[] {
  const files: FileDiff[] = [];
  let cur: FileDiff | null = null;
  let hunk: Hunk | null = null;
  let o = 0;
  let n = 0;
  for (const line of patch.split("\n")) {
    const head = /^diff --git a\/(.*?) b\/(.*)$/.exec(line);
    if (head) {
      cur = { path: nameOverride ?? head[2]!, kind: "modified", hunks: [], add: 0, del: 0 };
      files.push(cur);
      hunk = null;
      continue;
    }
    if (!cur) continue;
    const at = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/.exec(line);
    if (at) {
      o = Number(at[1]);
      n = Number(at[2]);
      hunk = { header: line, lines: [] };
      cur.hunks.push(hunk);
      continue;
    }
    if (hunk) {
      const c = line[0];
      if (c === "+") (hunk.lines.push({ t: "add", n: n++, text: line.slice(1) }), cur.add++);
      else if (c === "-") (hunk.lines.push({ t: "del", o: o++, text: line.slice(1) }), cur.del++);
      else if (c === " ") hunk.lines.push({ t: "ctx", o: o++, n: n++, text: line.slice(1) });
      continue; // "\ No newline at end of file" などは出さない
    }
    if (line.startsWith("new file mode")) cur.kind = "added";
    else if (line.startsWith("deleted file mode")) cur.kind = "deleted";
    else if (line.startsWith("rename from ")) (cur.kind = "renamed", (cur.oldPath = line.slice(12)));
    else if (line.startsWith("Binary files") || line.startsWith("GIT binary patch")) cur.kind = "binary";
  }
  return files;
}
