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
}

export interface PlatformAdapter {
  loadScripts(): ScriptData[] | Promise<ScriptData[]>;
  saveScripts(scripts: ScriptData[]): void | Promise<void>;
  loadSettings(): Record<string, unknown> | Promise<Record<string, unknown>>;
  saveSettings(settings: Record<string, unknown>): void | Promise<void>;

  startTask(opts: StartTaskOptions): boolean | Promise<boolean>;
  stopTask(taskId: string): boolean | Promise<boolean>;
  listTasks(): string[];

  copyText(text: string): void | Promise<void>;
  saveToFile(content: string, defaultName: string): boolean | Promise<boolean>;
  readFromFile(): string | null | Promise<string | null>;
  showNotification(text: string): void;
  hideWindow?(): void;
  showWindow?(): void;

  setSubInput?(handler: SubInputHandler, placeholder: string, initial?: string): void;
  removeSubInput?(): void;
  outPlugin?(): void;
}
