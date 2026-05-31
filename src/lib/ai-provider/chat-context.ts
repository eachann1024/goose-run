/**
 * AI 模块自由问答上下文打包器。
 * 用户在 AI 输入框直接提问时用：带上脚本元信息 + 最近运行摘要/日志尾部 + 近几轮对话，
 * 让「启动管家」围绕这个脚本作答。所有外送内容统一脱敏。
 */
import type { AIMessage } from "./types";
import type { AiMessage, RunState, ScriptData } from "@/lib/types";
import { redactSecrets } from "./redact";

const TAIL_LINES = 40;
const TAIL_CHARS = 2400;
const HISTORY_TURNS = 8;

export const CHAT_SYSTEM_PROMPT = `你是「启动管家」，帮用户管理并跑通他电脑上的一个 shell 脚本。

# 风格
- 简体中文，简洁亲切，结论先行。面对的可能是不太懂技术的人，必要术语顺带一句人话解释。
- 不要长篇大论，2-5 句话说清楚即可。
- 涉及命令时用反引号包裹（如 \`npm run dev\`、\`lsof -i:3000\`）。

# 能力
你可以解答关于这个脚本的问题：它做什么、怎么跑、为什么失败、端口/依赖/环境问题怎么排查。
若用户想真正启动，告诉他「长按『运行』按钮 1.5 秒」即可把启动交给你接管。
当你给出一条可直接执行的修复/操作命令时，请单独用代码块写出：
\`\`\`bash
<命令>
\`\`\`
这样用户可以一键复制或填入新脚本。`;

function tailLog(run: RunState | null): string {
  if (!run) return "";
  const meaningful = run.lines.filter((l) => l.stream !== "system" && l.stream !== "ai");
  const tail = meaningful.slice(-TAIL_LINES).map((l) => l.text).join("\n").slice(-TAIL_CHARS);
  return redactSecrets(tail);
}

/** 构造自由问答消息：system + 脚本上下文 + 近几轮对话 + 本次提问 */
export function buildChatMessages(
  script: ScriptData,
  run: RunState | null,
  history: AiMessage[],
  userText: string,
): AIMessage[] {
  const ctx = [
    "【当前脚本】",
    `名称：${script.name}`,
    `Shell：${script.shell ?? "bash"}`,
    script.cwd ? `工作目录：${script.cwd}` : "工作目录：默认 $HOME",
    script.port != null ? `端口：${script.port}` : "",
    "命令：",
    "```",
    redactSecrets(script.script),
    "```",
  ].filter(Boolean);

  if (run) {
    ctx.push(
      "",
      `最近一次运行：状态 ${run.status}${run.exitCode != null ? ` · 退出码 ${run.exitCode}` : ""}`,
    );
    const logTail = tailLog(run);
    if (logTail) ctx.push("最近运行日志尾部：", "```", logTail, "```");
  }

  const messages: AIMessage[] = [
    { role: "system", content: `${CHAT_SYSTEM_PROMPT}\n\n${ctx.join("\n")}` },
  ];

  // 近几轮对话（只取 user / ai，think 思考行不入历史）
  const turns = history
    .filter((m) => m.role === "user" || m.role === "ai")
    .slice(-HISTORY_TURNS);
  for (const m of turns) {
    messages.push({ role: m.role === "user" ? "user" : "assistant", content: m.text });
  }

  messages.push({ role: "user", content: userText });
  return messages;
}
