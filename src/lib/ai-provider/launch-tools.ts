/**
 * AI 智能启动工具集。
 * 给「项目启动管家」一组可实际操作用户电脑的工具：查运行状态 / 跑命令 / 读文件 / 改配置 / 启动服务。
 * 红线：write_config 带路径护栏，只允许改配置类文件，绝不碰业务源码；外送内容统一脱敏。
 */
import type { AITool, AIToolCall } from "./types";
import type { PlatformAdapter } from "@/platform/types";
import type { ScriptData } from "@/lib/types";
import { redactSecrets } from "./redact";

export const LAUNCH_TOOLS: AITool[] = [
  {
    type: "function",
    function: {
      name: "check_running",
      description: "执行一条探测命令判断服务是否已经在运行（exit 0 视为在运行）。启动前先用它确认，避免重复启动。",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "一条返回 exit 0=在运行、非 0=未运行的探测命令，如 lsof -iTCP:3000 -sTCP:LISTEN 或 pgrep -f server.py" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "执行一条 shell 命令并返回退出码与输出。既可用于查看（node -v、cat、ls、lsof 等），也可用于修复（npm install、pip install、chmod 等）。带超时，输出会截断。",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "要执行的 shell 命令" },
          purpose: { type: "string", description: "用一句小白能懂的大白话说明这条命令是干什么的、为什么要跑" },
        },
        required: ["command", "purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取一个文件的文本内容（如配置文件、package.json），用于判断问题。内容里的密钥会被自动脱敏。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "文件的绝对路径" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_config",
      description: "写入/修改一个【配置类】文件（端口、接口地址、环境变量、依赖配置等）。会自动备份原文件为 .bak。严禁用它修改业务逻辑源代码。content 必须是文件的完整新内容。",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "配置文件的绝对路径" },
          content: { type: "string", description: "文件的完整新内容（不是 diff）" },
          reason: { type: "string", description: "用一句小白能懂的大白话说明为什么要改、改了什么" },
        },
        required: ["path", "content", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_service",
      description: "用脚本本来的命令真正把服务启动起来。诊断与必要修复都做完后，调用它完成启动。无需参数。",
      parameters: { type: "object", properties: {} },
    },
  },
];

export interface LaunchToolCtx {
  platform: PlatformAdapter;
  script: ScriptData;
  /** 把一行小白话叙述推进日志 */
  onNarrate: (text: string) => void;
  /** 真正启动服务（由编排层用 startTask 复用 aiTaskId 实现）；返回结果文本回给模型，并在成功时由编排层标记会话「转正」 */
  startService: () => Promise<{ ok: boolean; message: string }>;
}

const READ_MAX = 6000;

// 配置类文件白名单：扩展名 / 文件名命中即视为配置，可被 write_config 修改。
// 业务源码（.js/.ts/.py/.go 里的逻辑代码）一律拒绝，除非文件名明确是 *.config.* 这类配置文件。
function isConfigPath(rawPath: string): boolean {
  const path = rawPath.toLowerCase();
  const base = path.split(/[\\/]/).pop() ?? "";

  // 1) .env / .env.local / .npmrc / .babelrc 等点开头配置
  if (/^\.[a-z0-9_.-]*$/.test(base) && /env|rc$|config|properties/.test(base)) return true;
  if (/^\.env(\.|$)/.test(base)) return true;

  // 2) 纯配置扩展名
  if (/\.(json|jsonc|json5|ya?ml|toml|ini|conf|cfg|properties|env|plist|xml)$/.test(base)) return true;

  // 3) 文件名含 config 的脚本式配置（vite.config.ts / next.config.js / tailwind.config.cjs 等）
  if (/\.config\.[a-z0-9]+$/.test(base)) return true;
  if (/(^|\.)config\.[a-z0-9]+$/.test(base)) return true;

  return false;
}

/** 构造 AI 智能启动的工具执行器（executeTool） */
export function createLaunchToolExecutor(ctx: LaunchToolCtx) {
  const { platform, script, onNarrate, startService } = ctx;

  return async function executeTool(call: AIToolCall): Promise<string> {
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      return "工具参数解析失败：arguments 不是合法 JSON。";
    }

    switch (name) {
      case "check_running": {
        const command = String(args.command ?? "").trim();
        if (!command) return "缺少 command 参数。";
        onNarrate(`🔍 我先看看这个服务是不是已经在运行了。`);
        const running = (await platform.probeRunning?.(command)) ?? false;
        return running ? "服务已经在运行中（探测命令返回 exit 0）。" : "服务当前未运行。";
      }

      case "run_command": {
        const command = String(args.command ?? "").trim();
        const purpose = String(args.purpose ?? "").trim();
        if (!command) return "缺少 command 参数。";
        if (purpose) onNarrate(`🛠️ ${purpose}`);
        if (!platform.execCommand) return "当前环境不支持执行命令。";
        const r = await platform.execCommand({ command, cwd: script.cwd, shell: script.shell });
        const out = redactSecrets([r.stdout, r.stderr].filter(Boolean).join("\n").trim());
        const head = r.timedOut
          ? "命令执行超时被终止。"
          : `命令结束，退出码 ${r.exitCode ?? "未知"}。`;
        return `${head}\n输出：\n${out || "(无输出)"}`;
      }

      case "read_file": {
        const path = String(args.path ?? "").trim();
        if (!path) return "缺少 path 参数。";
        onNarrate(`📄 我打开 ${path.split(/[\\/]/).pop()} 看看里面写了什么。`);
        const content = await platform.readFileText?.(path);
        if (content == null) return `读取失败：找不到或无法读取 ${path}。`;
        const redacted = redactSecrets(content);
        const clipped = redacted.length > READ_MAX ? redacted.slice(0, READ_MAX) + "\n…（内容过长已截断）" : redacted;
        return `文件 ${path} 内容：\n\`\`\`\n${clipped}\n\`\`\``;
      }

      case "write_config": {
        const path = String(args.path ?? "").trim();
        const content = String(args.content ?? "");
        const reason = String(args.reason ?? "").trim();
        if (!path) return "缺少 path 参数。";
        // 护栏一：只改配置类文件，业务源码一律拒绝
        if (!isConfigPath(path)) {
          onNarrate(`✋ ${path.split(/[\\/]/).pop()} 看起来像业务代码，按规矩我不能动它，换个办法。`);
          return `拒绝写入：${path} 不属于配置类文件，按红线不允许修改业务源代码。请改用配置文件，或用 run_command 解决。`;
        }
        // 护栏二：不允许把脱敏占位符写回文件（防覆盖真实密钥）
        if (/\[REDACTED/i.test(content)) {
          onNarrate(`✋ 这次改动里带了被隐藏的密钥占位符，为保护你的密钥我没有写入。`);
          return "拒绝写入：内容包含 [REDACTED] 脱敏占位符，写回会破坏真实密钥。请不要改动含密钥的行。";
        }
        if (reason) onNarrate(`📝 ${reason}`);
        if (!platform.writeFileText) return "当前环境不支持写文件。";
        const r = await platform.writeFileText(path, content);
        if (!r.ok) return `写入失败：${r.error ?? "未知错误"}。`;
        if (r.backupPath) {
          onNarrate(`✅ 已修改 ${path.split(/[\\/]/).pop()}，原文件已备份到 ${r.backupPath.split(/[\\/]/).pop()}，改坏了能还原。`);
        } else {
          onNarrate(`✅ 已写入 ${path.split(/[\\/]/).pop()}。`);
        }
        return `写入成功${r.backupPath ? `（原文件已备份为 ${r.backupPath}）` : ""}。`;
      }

      case "start_service": {
        onNarrate(`🚀 准备工作做完了，现在帮你把服务启动起来。`);
        const r = await startService();
        return r.message;
      }

      default:
        return `未知工具：${name}`;
    }
  };
}
