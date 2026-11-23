import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadToken, tokenPath } from "../src/server/lock";

let tmp: string;
const prev = process.env.XDG_CACHE_HOME;
const mode = (f: string) => fs.statSync(f).mode & 0o777;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cgui-token-"));
  process.env.XDG_CACHE_HOME = tmp;
});
afterEach(() => {
  if (prev === undefined) delete process.env.XDG_CACHE_HOME;
  else process.env.XDG_CACHE_HOME = prev;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("loadToken", () => {
  it("初回は作って $XDG_CACHE_HOME/cgui/token に 0600 で残し、次からは同じものを返す", () => {
    const t = loadToken();
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    expect(tokenPath()).toBe(path.join(tmp, "cgui", "token"));
    expect(mode(tokenPath())).toBe(0o600);
    expect(loadToken()).toBe(t);
  });

  it.each(["", "not-a-token", "ab".repeat(23), "AB".repeat(24)])("中身が正しくなければ作り直す: %j", (bad) => {
    fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
    fs.writeFileSync(tokenPath(), bad, { mode: 0o600 });
    const t = loadToken();
    expect(t).toMatch(/^[0-9a-f]{48}$/);
    expect(fs.readFileSync(tokenPath(), "utf8")).toBe(t);
    expect(loadToken()).toBe(t);
  });

  it("権限が緩いファイルは、中身を使い回したうえで 0600 に直す", () => {
    const t = loadToken();
    fs.chmodSync(tokenPath(), 0o644);
    expect(loadToken()).toBe(t);
    expect(mode(tokenPath())).toBe(0o600);
  });
});
