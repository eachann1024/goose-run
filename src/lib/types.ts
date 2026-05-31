/**
 * 鹅的运行 · 核心数据契约
 */

export type ShellKind = "bash" | "zsh" | "sh";

export interface ScriptData {
  id: string;
  name: string;
  /** shell 命令体，多行用 \n 分隔 */
  script: string;
  /** 工作目录绝对路径，空 → process.env.HOME */
  cwd?: string;
  /** 额外环境变量 */
  env?: Record<string, string>;
  /** 副标题，短描述 */
  description?: string;
  /** 分类标签 */
  tags?: string[];
  /** 默认 bash */
  shell?: ShellKind;
  /** 危险操作需要二次确认才能跑 */
  confirmBeforeRun?: boolean;
  /**
   * 服务监听端口（可选）。填了即可在详情页一键在浏览器打开 localhost:端口，
   * 并自动据此生成 lsof 探测命令。留空表示该脚本不监听端口或端口待运行后检测。
   */
  port?: number;
  /**
   * 运行探测命令：一条返回 exit 0 = 运行中、非 0 = 未运行的 shell 命令。
   * 用于检测脚本「真实是否在运行」——即使不是通过本插件启动的（如终端里跑的）。
   * 例：服务型 `lsof -iTCP:5182 -sTCP:LISTEN`，进程型 `pgrep -f "server.py"`。
   */
  probeCommand?: string;
  createdAt: number;
  updatedAt: number;
  /** 最近一次运行的摘要（持久化），不含日志正文 */
  lastRun?: LastRunSummary;
}

export interface LastRunSummary {
  startedAt: number;
  endedAt?: number;
  /** null = 还在跑；非空 = 已结束 */
  exitCode?: number | null;
  durationMs?: number;
}

export type NewScriptInput = Omit<ScriptData, "id" | "createdAt" | "updatedAt" | "lastRun">;

/** 单行日志 */
export interface LogLine {
  /** 单调自增 id，作为虚拟列表稳定 key（slice 截断后下标会平移，不能用 index） */
  id: number;
  ts: number;
  /** ai = AI 智能启动管家的小白话叙述行 */
  stream: "stdout" | "stderr" | "system" | "ai";
  text: string;
}

/** 运行态（不持久化，重启清空） */
export interface RunState {
  taskId: string;
  scriptId: string;
  status: "running" | "success" | "failed" | "stopped";
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  lines: LogLine[];
  /** 运行后从日志里自动识别出的监听端口（正则优先，AI 兜底回填） */
  detectedPort?: number;
  /** ai = AI 智能启动会话（叙述+真实启动日志合流）；缺省/script = 普通脚本运行 */
  kind?: "script" | "ai";
}

export interface TaskLogEvent { taskId: string; stream: "stdout" | "stderr"; text: string; }
export interface TaskStartEvent { taskId: string; startedAt: number; }
export interface TaskExitEvent  { taskId: string; code: number | null; signal: string | null; endedAt: number; }
export interface TaskErrorEvent { taskId: string; message: string; }

export interface PluginEnterDetail {
  code: string;
  type?: string;
  /** run/quick 时为字符串关键字；files-feature 时为 uTools 文件描述数组 */
  payload?: unknown;
}
