export const DEFAULT_PORT = 27182; // 他のツールと被りにくく、Linux の一時ポート（32768〜）より下の番号

export interface CliArgs {
  port: number;
  open: boolean;
  rest: string[];
}

export function parseArgs(args: string[], envPort = process.env.CGUI_PORT): CliArgs {
  const i = args.findIndex((a) => a === "--port" || a.startsWith("--port="));
  const raw = i < 0 ? envPort : args[i]!.includes("=") ? args[i]!.split("=")[1] : args[i + 1];
  let port = DEFAULT_PORT;
  if (raw !== undefined && raw !== "") {
    port = Number(raw);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`ポートの指定が正しくありません: ${raw}`);
  }
  return {
    port,
    open: args.includes("--open"),
    rest: args.filter((a, j) => !a.startsWith("-") && !(args[i] === "--port" && j === i + 1)),
  };
}
