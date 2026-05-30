import type {
  ScriptData,
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

  copyText(text: string): void | Promise<void>;
  saveToFile(content: string, defaultName: string): boolean | Promise<boolean>;
  readFromFile(): string | null | Promise<string | null>;
  /** 选择一个目录，返回绝对路径；取消/不支持返回 null */
  pickDirectory?(): string | null | Promise<string | null>;
  /** 读取指定路径文件文本内容（uTools files-feature 用），失败返回 null */
  readFileText?(path: string): string | null | Promise<string | null>;
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
