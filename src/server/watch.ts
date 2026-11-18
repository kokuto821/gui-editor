import watcher, { type AsyncSubscription } from "@parcel/watcher";

import fs from "node:fs";
import path from "node:path";

type Emit = (root: string, paths: string[]) => void;

const IGNORE = ["**/node_modules/**", "**/.git/**"];
const GIT_IGNORE = ["**/objects/**", "**/logs/**", "**/hooks/**", "**/info/**", "**/*.lock"];
const DEBOUNCE_MS = 50;
const GIT_DEBOUNCE_MS = 200;

/** プロジェクトのフォルダごとに監視し、変更を間引いて知らせる。 */
export class Watchers {
  private subs = new Map<string, AsyncSubscription[]>();
  constructor(
    private emit: Emit,
    private emitGit: (root: string) => void,
  ) {}

  async add(root: string): Promise<void> {
    if (this.subs.has(root)) return;
    let pending = new Set<string>();
    let timer: NodeJS.Timeout | null = null;
    const sub = await watcher.subscribe(
      root,
      (err, events) => {
        if (err) return;
        for (const e of events) pending.add(e.path);
        timer ??= setTimeout(() => {
          const paths = [...pending];
          pending = new Set();
          timer = null;
          this.emit(root, paths);
        }, DEBOUNCE_MS);
      },
      { ignore: IGNORE },
    );
    const subs = [sub];
    // コミットやブランチの切替は、.git の中（refs と index）だけが変わる。作業ツリーの監視では気づけない
    const gitDir = path.join(root, ".git");
    if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
      let gtimer: NodeJS.Timeout | null = null;
      subs.push(
        await watcher.subscribe(
          gitDir,
          (err) => {
            if (err) return;
            gtimer ??= setTimeout(() => {
              gtimer = null;
              this.emitGit(root);
            }, GIT_DEBOUNCE_MS);
          },
          { ignore: GIT_IGNORE },
        ),
      );
    }
    this.subs.set(root, subs);
  }

  async remove(root: string): Promise<void> {
    const subs = this.subs.get(root);
    this.subs.delete(root);
    await Promise.all((subs ?? []).map((s) => s.unsubscribe().catch(() => {})));
  }

  async close(): Promise<void> {
    await Promise.all([...this.subs.keys()].map((r) => this.remove(r)));
  }
}
