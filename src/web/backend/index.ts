import { WsBackend } from "./ws";

/** 画面全体で使う窓口。将来 Tauri にするときは、ここを差し替える。 */
export const backend = new WsBackend();
