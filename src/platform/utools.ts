import type { ScriptData } from "@/lib/types";
import type { PlatformAdapter, SubInputHandler, StartTaskOptions } from "./types";

declare global {
  interface Window {
    gooseRun?: {
      loadScripts(): ScriptData[];
      saveScripts(scripts: ScriptData[]): boolean;
      loadSettings(): Record<string, unknown>;
      saveSettings(s: Record<string, unknown>): boolean;
      startTask(taskId: string, opts: { script: string; cwd?: string; env?: Record<string, string>; shell?: string; login?: boolean }): boolean;
      stopTask(taskId: string): boolean;
      listTasks(): string[];
      probeRunning?(command: string): boolean | Promise<boolean>;
      killPort?(port: number): boolean | Promise<boolean>;
      copyText(text: string): void;
      saveToFile?(content: string, defaultName: string): boolean;
      readFromFile?(): string | null;
      pickDirectory?(): string | null;
      readFileText?(path: string): string | null;
      showNotification(text: string, clickFeatureCode?: string): void;
      openExternal?(url: string): void;
      hideWindow?(): void;
      showWindow?(): void;
      setSubInput?(handler: SubInputHandler, placeholder: string, initial?: string): void;
      removeSubInput?(): void;
      outPlugin?(): void;
    };
    utools?: Record<string, unknown>;
  }
}

export function createUToolsAdapter(): PlatformAdapter {
  const api = window.gooseRun!;

  return {
    loadScripts() { return api.loadScripts(); },
    saveScripts(scripts) { api.saveScripts(scripts); },
    loadSettings() { return api.loadSettings?.() ?? {}; },
    saveSettings(s) { api.saveSettings?.(s); },

    startTask(opts: StartTaskOptions) {
      return api.startTask(opts.taskId, {
        script: opts.script,
        cwd: opts.cwd,
        env: opts.env,
        shell: opts.shell,
        login: opts.login,
      });
    },
    stopTask(taskId) { return api.stopTask(taskId); },
    listTasks() { return api.listTasks?.() ?? []; },
    async probeRunning(command) { return (await api.probeRunning?.(command)) ?? false; },
    async killPort(port) { return (await api.killPort?.(port)) ?? false; },

    copyText(text) { api.copyText(text); },
    saveToFile(content, defaultName) { return api.saveToFile?.(content, defaultName) ?? false; },
    readFromFile() { return api.readFromFile?.() ?? null; },
    pickDirectory() { return api.pickDirectory?.() ?? null; },
    readFileText(path) { return api.readFileText?.(path) ?? null; },
    showNotification(text, clickFeatureCode) { api.showNotification(text, clickFeatureCode); },
    openExternal(url) { api.openExternal?.(url); },
    hideWindow() { api.hideWindow?.(); },
    showWindow() { api.showWindow?.(); },
    setSubInput(handler, placeholder, initial) { api.setSubInput?.(handler, placeholder, initial); },
    removeSubInput() { api.removeSubInput?.(); },
    outPlugin() { api.outPlugin?.(); },
  };
}
