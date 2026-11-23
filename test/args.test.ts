import { describe, expect, it } from "vitest";
import { DEFAULT_PORT, parseArgs } from "../src/server/args";

describe("parseArgs", () => {
  it("何も無ければ既定のポートで、今のフォルダ", () => {
    expect(parseArgs([], undefined)).toMatchObject({ port: DEFAULT_PORT, rest: [] });
  });

  it("--port N と --port=N を読み、N はフォルダとして扱わない", () => {
    expect(parseArgs(["--port", "4777", "proj"], undefined)).toMatchObject({ port: 4777, rest: ["proj"] });
    expect(parseArgs(["proj", "--port=4777"], undefined)).toMatchObject({ port: 4777, rest: ["proj"] });
  });

  it("CGUI_PORT は --port が無いときだけ使う", () => {
    expect(parseArgs([], "5000").port).toBe(5000);
    expect(parseArgs(["--port", "4777"], "5000").port).toBe(4777);
  });

  it.each([["--port", "abc"], ["--port=0"], ["--port", "70000"], ["--port", "1.5"]])("正しくないポートは投げる: %j", (...args) => {
    expect(() => parseArgs(args, undefined)).toThrow();
  });
});
