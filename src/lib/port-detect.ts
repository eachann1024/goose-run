/**
 * 端口工具：从运行日志里识别服务监听的端口，以及由端口生成 lsof 探测命令。
 * 纯函数，无副作用，App / ScriptForm / AI 兜底共用。
 */

// 按优先级匹配：明确的 host:port → http URL → "port 3000" 字样
const PORT_PATTERNS: RegExp[] = [
  /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|::1):(\d{2,5})/i,
  /https?:\/\/[^\s/]*?:(\d{2,5})/i,
  /\bport[\s:=]+(\d{2,5})\b/i,
  /listening (?:on|at)[\s:]+.*?:(\d{2,5})/i,
];

/** 从一段文本里提取首个合法端口号（1–65535），找不到返回 null */
export function extractPort(text: string): number | null {
  if (!text) return null;
  for (const re of PORT_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const p = Number(m[1]);
      if (p >= 1 && p <= 65535) return p;
    }
  }
  return null;
}

/** 由端口生成标准 lsof 探测命令（exit 0 = 该端口正在监听） */
export function lsofProbe(port: number | string): string {
  return `lsof -nP -iTCP:${port} -sTCP:LISTEN`;
}

/** 判断一条 probeCommand 是否是「由端口自动生成的 lsof」——用于安全覆盖，不动用户手写的命令 */
export function isAutoLsof(cmd: string): boolean {
  return /^lsof -nP -iTCP:\d+ -sTCP:LISTEN$/.test(cmd.trim());
}
