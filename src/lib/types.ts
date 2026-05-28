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
  ts: number;
  stream: "stdout" | "stderr" | "system";
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
}

export interface TaskLogEvent { taskId: string; stream: "stdout" | "stderr"; text: string; }
export interface TaskStartEvent { taskId: string; startedAt: number; }
export interface TaskExitEvent  { taskId: string; code: number | null; signal: string | null; endedAt: number; }
export interface TaskErrorEvent { taskId: string; message: string; }

export interface PluginEnterDetail {
  code: string;
  type?: string;
  payload?: string;
}
