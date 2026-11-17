import { spawn } from "node:child_process";
import fs from "node:fs";

export function isWsl(): boolean {
  if (process.platform !== "linux") return false;
  try {
    return /microsoft/i.test(fs.readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}

const WIN_BROWSERS = [
  "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
  "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
];

function run(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
}

/** 画面を開く。WSL なら Windows 側のブラウザ（Chrome / Edge は専用ウィンドウ）で開く。開けなければ false。 */
export async function openBrowser(url: string): Promise<boolean> {
  const custom = process.env.CGUI_BROWSER;
  if (custom) return run(custom, [url]);
  if (isWsl()) {
    const exe = WIN_BROWSERS.find((p) => fs.existsSync(p));
    if (exe && (await run(exe, [`--app=${url}`]))) return true;
    return (await run("wslview", [url])) || (await run("cmd.exe", ["/c", "start", "", url]));
  }
  if (process.platform === "darwin") return run("open", [url]);
  return run("xdg-open", [url]);
}
