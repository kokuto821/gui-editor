import { create } from "zustand";

export type MenuState =
  | { kind: "row"; path: string; isDir: boolean; anchor: DOMRect }
  | { kind: "proj"; anchor: DOMRect }
  | { kind: "layout"; anchor: DOMRect }
  | null;

export interface DialogButton {
  id: string;
  label: string;
  primary?: boolean;
}
interface Dialog {
  message: string;
  buttons: DialogButton[];
  resolve: (id: string) => void;
}

interface UiState {
  menu: MenuState;
  /** 名前を変えている行（絶対パス） */
  renaming: string | null;
  dialog: Dialog | null;
  /** 画面の隅に出す短い知らせ */
  toast: string | null;
  openMenu(m: Exclude<MenuState, null>): void;
  closeMenu(): void;
  setRenaming(p: string | null): void;
  ask(message: string, buttons: DialogButton[]): Promise<string>;
  say(message: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useUi = create<UiState>()((set, get) => ({
  menu: null,
  renaming: null,
  dialog: null,
  toast: null,
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: null }),
  setRenaming: (renaming) => set({ renaming }),
  ask(message, buttons) {
    return new Promise<string>((resolve) => {
      const prev = get().dialog;
      prev?.resolve("cancel");
      set({ menu: null, dialog: { message, buttons, resolve: (id) => (set({ dialog: null }), resolve(id)) } });
    });
  },
  say(message) {
    set({ toast: message });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 2500);
  },
}));
