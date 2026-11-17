import watcher, { type AsyncSubscription } from "@parcel/watcher";

type Emit = (root: string, paths: string[]) => void;

const IGNORE = ["**/node_modules/**", "**/.git/**"];
const DEBOUNCE_MS = 50;

/** プロジェクトのフォルダごとに監視し、変更を間引いて知らせる。 */
export class Watchers {
  private subs = new Map<string, AsyncSubscription>();
  constructor(private emit: Emit) {}

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
    this.subs.set(root, sub);
  }

  async close(): Promise<void> {
    await Promise.all([...this.subs.values()].map((s) => s.unsubscribe().catch(() => {})));
    this.subs.clear();
  }
}
