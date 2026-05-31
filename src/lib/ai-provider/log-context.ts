/**
 * 日志诊断上下文打包器。
 * 抄 Warp Active AI 的上下文字段集（命令 + cwd + shell + 退出码 + stderr 尾部），
 * 不糊整屏日志（省 token、诊断更准），发送前统一脱敏。
 */
import type { AIMessage } from "./types";
import type { RunState, ScriptData } from "@/lib/types";
import { redactSecrets } from "./redact";

const TAIL_LINES = 60;
const TAIL_CHARS = 4000;

export const DIAGNOSIS_SYSTEM_PROMPT =
  `你是终端报错诊断专家。用户会给你一段脚本运行的命令、退出码和日志尾部。请：
1. 用 1-2 句中文说清失败的**根因**（不要复述日志原文）。
2. 给出**一条可直接执行的修复命令**（若确实无需命令则说明手动步骤）。
严格按以下格式输出，不要多余内容：

原因：<一两句根因>

修复命令：
\`\`\`bash
<可直接运行的命令；从报错里回填端口/文件名等具体参数，不要写占位符>
\`\`\`

若无法给出可靠修复命令，则省略「修复命令」整段，只给原因与排查方向。`;

interface RuleHint {
  test: RegExp;
  hint: string;
}

// 规则路由（免模型分类器）：命中关键字给更精准的引导
const RULE_HINTS: RuleHint[] = [
  { test: /EADDRINUSE|address already in use|端口.*(占用|被占)|already in use/i, hint: "疑似端口被占用：优先给出释放该端口（lsof + kill）或改用其它端口的命令。" },
  { test: /command not found|: not found|未找到命令/i, hint: "疑似命令/可执行文件缺失：给出安装该工具或修正 PATH 的命令。" },
  { test: /permission denied|EACCES|权限不足/i, hint: "疑似权限问题：给出 chmod/sudo 或更换可写目录的命令。" },
  { test: /no such file or directory|ENOENT|没有那个文件/i, hint: "疑似路径或文件缺失：核对 cwd 与文件路径。" },
  { test: /未(检测|监测)到端口|timed? ?out|超时|not ready/i, hint: "疑似服务未在预期端口就绪：检查启动命令、端口与等待逻辑。" },
  { test: /module not found|cannot find module| modulenotfound|importerror/i, hint: "疑似依赖未安装：给出安装依赖的命令（npm/pip 等）。" },
];

/** 取日志尾部：优先 stderr，不足时补 stdout，脱敏后返回 */
function tailLog(run: RunState): { text: string; hasErr: boolean } {
  const meaningful = run.lines.filter((l) => l.stream !== "system");
  const errLines = meaningful.filter((l) => l.stream === "stderr");
  const source = errLines.length > 0 ? meaningful : meaningful; // 保留时序，stderr 内嵌在其中
  const tail = source.slice(-TAIL_LINES).map((l) => l.text).join("\n").slice(-TAIL_CHARS);
  return { text: redactSecrets(tail), hasErr: errLines.length > 0 };
}

/** 构造日志诊断消息（system + user） */
export function buildDiagnosisMessages(script: ScriptData, run: RunState): AIMessage[] {
  const { text: logTail } = tailLog(run);
  const hints = RULE_HINTS.filter((r) => r.test.test(logTail)).map((r) => r.hint);

  const userParts = [
    `命令（${script.shell ?? "bash"}）：`,
    "```",
    redactSecrets(script.script),
    "```",
    script.cwd ? `工作目录：${script.cwd}` : "工作目录：默认 $HOME",
    `退出码：${run.exitCode ?? "未知"}（状态 ${run.status}）`,
    "",
    "日志尾部：",
    "```",
    logTail || "(无输出)",
    "```",
  ];
  if (hints.length) {
    userParts.push("", "诊断提示：" + hints.join(" "));
  }

  return [
    { role: "system", content: DIAGNOSIS_SYSTEM_PROMPT },
    { role: "user", content: userParts.join("\n") },
  ];
}

/** 从 AI 回复里提取首个 ```bash/sh 代码块作为可回填的修复命令 */
export function extractFixCommand(text: string): string | null {
  const m = text.match(/```(?:bash|sh|zsh|shell)?\s*\n([\s\S]*?)```/);
  const cmd = m?.[1]?.trim();
  return cmd && cmd.length > 0 ? cmd : null;
}
