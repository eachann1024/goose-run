/**
 * 拖入脚本文件 → 生成可运行的命令。
 *
 * 解释型语言（.py/.js/.rb…）必须用对应解释器「按真实路径」运行，
 * 不能把源码内联进 bash —— 否则像 alpha.py 里的 `__file__` / `import` 会被 bash 当命令执行而报错。
 * 纯 shell 片段（.sh/.bash/.zsh 或无扩展）保持内联，方便直接查看与编辑。
 */
import type { ShellKind } from "./types";

// 扩展名 → 解释器
const EXT_INTERPRETER: Record<string, string> = {
  py: "python3",
  js: "node",
  mjs: "node",
  cjs: "node",
  ts: "npx tsx",
  rb: "ruby",
  pl: "perl",
  php: "php",
  lua: "lua",
  r: "Rscript",
  go: "go run",
};

const SHELL_EXT = new Set(["sh", "bash", "zsh"]);

function quote(p: string): string {
  // 路径含空格/特殊字符时加双引号；本身含双引号的极少见，原样保留
  return /[\s'"&|;()<>$`\\]/.test(p) ? `"${p}"` : p;
}

/** 从 shebang 行推断 shell；无法判断返回 null */
function shellFromShebang(firstLine: string): ShellKind | null {
  if (!firstLine.startsWith("#!")) return null;
  if (/\bzsh\b/.test(firstLine)) return "zsh";
  if (/\bbash\b/.test(firstLine)) return "bash";
  if (/\bsh\b/.test(firstLine)) return "sh";
  return null;
}

export interface ImportedScript {
  script: string;
  shell: ShellKind;
}

/**
 * 由拖入文件的路径 + 内容推断运行命令。
 * - 有真实路径 + 已知解释型扩展 → `<解释器> "<路径>"`
 * - 有真实路径 + shell 扩展 → 内联内容（保持可编辑），shell 跟随扩展
 * - shebang 指明解释器且有真实路径 → 按 shebang 运行
 * - 其余（纯片段 / 浏览器无路径）→ 内联内容，bash
 */
export function inferRunCommand(filePath: string, content: string): ImportedScript {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  // 有目录分隔符才算真实磁盘路径（浏览器降级时往往只有文件名）
  const hasRealPath = /[\\/]/.test(filePath);
  const q = quote(filePath);

  const firstLine = (content.split("\n", 1)[0] || "").trim();

  if (hasRealPath && ext && EXT_INTERPRETER[ext]) {
    return { script: `${EXT_INTERPRETER[ext]} ${q}`, shell: "bash" };
  }

  if (SHELL_EXT.has(ext)) {
    // 优先看 shebang，扩展名兜底：.zsh→zsh，其余（含 .sh）默认 bash 更稳，避免 bash 语法被 sh 跑挂
    const shell: ShellKind = shellFromShebang(firstLine) ?? (ext === "zsh" ? "zsh" : "bash");
    return { script: content, shell };
  }

  if (hasRealPath && firstLine.startsWith("#!")) {
    if (/python/.test(firstLine)) return { script: `python3 ${q}`, shell: "bash" };
    if (/node/.test(firstLine)) return { script: `node ${q}`, shell: "bash" };
    const shell = shellFromShebang(firstLine);
    if (shell) return { script: content, shell };
  }

  return { script: content, shell: "bash" };
}

/** 取文件所在目录作为工作目录（无真实路径时返回空） */
export function dirOf(filePath: string): string {
  if (!/[\\/]/.test(filePath)) return "";
  return filePath.replace(/[\\/][^\\/]*$/, "");
}
