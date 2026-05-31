import type {
  ScriptData,
  ShellKind,
  PluginEnterDetail,
} from "@/lib/types";

export type SubInputHandler = (text: string) => void;
export type { PluginEnterDetail };

export interface StartTaskOptions {
  taskId: string;
  script: string;
  cwd?: string;
  env?: Record<string, string>;
  shell?: "bash" | "zsh" | "sh";
  /** true/缺省 → 登录 shell（-lc，加载完整 PATH）；false → 非登录（-c） */
  login?: boolean;
}

export interface PlatformAdapter {
  loadScripts(): ScriptData[] | Promise<ScriptData[]>;
  saveScripts(scripts: ScriptData[]): void | Promise<void>;
  loadSettings(): Record<string, unknown> | Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): void | Promise<void>;

  startTask(opts: StartTaskOptions): boolean | Promise<boolean>;
  stopTask(taskId: string): boolean | Promise<boolean>;
  listTasks(): string[];
  /**
   * 运行探测：执行 probeCommand，exit 0 → true（运行中），否则 false。
   * 用于检测脚本在系统里的真实运行状态（含本插件外启动的进程）。
   */
  probeRunning?(command: string): Promise<boolean>;
  /**
   * 结束占用指定端口（LISTEN）的进程。
   * 用于「停止/重启」本插件外部启动的服务——外部进程没有任务句柄，只能按端口定位。
   * 成功（含端口本就空闲）返回 true。
   */
  killPort?(port: number): Promise<boolean>;

  copyText(text: string): void | Promise<void>;
  saveToFile(content: string, defaultName: string): boolean | Promise<boolean>;
  readFromFile(): string | null | Promise<string | null>;
  /** 选择一个目录，返回绝对路径；取消/不支持返回 null */
  pickDirectory?(): string | null | Promise<string | null>;
  /** 读取指定路径文件文本内容（uTools files-feature 用），失败返回 null */
  readFileText?(path: string): string | null | Promise<string | null>;
  /**
   * 一次性执行命令并抓取 stdout/stderr（AI 智能启动诊断/修复用）。
   * 带超时（默认 15s，超时 kill 并置 timedOut）与输出截断，避免卡死/撑爆。
   * 与 startTask 不同：startTask 是长驻流式服务，这里是跑完即回的一次性命令。
   */
  execCommand?(opts: {
    command: string;
    cwd?: string;
    shell?: ShellKind;
    timeoutMs?: number;
  }): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }>;
  /**
   * 写入文件文本（AI 智能启动修配置用）。
   * 写前对原文件做一次性 .bak 备份（已存在 .bak 则不覆盖），便于回滚。
   */
  writeFileText?(
    path: string,
    content: string,
  ): Promise<{ ok: boolean; backupPath?: string; error?: string }>;
  /** clickFeatureCode：点击通知后唤起的 feature code（如 "run"） */
  showNotification(text: string, clickFeatureCode?: string): void;
  /** 在系统默认浏览器打开 URL（如 http://localhost:端口） */
  openExternal?(url: string): void;
  hideWindow?(): void;
  showWindow?(): void;

  setSubInput?(handler: SubInputHandler, placeholder: string, initial?: string): void;
  removeSubInput?(): void;
  outPlugin?(): void;
}
