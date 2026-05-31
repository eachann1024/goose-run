/**
 * 浏览器降级适配器：localStorage 持久化 + 假执行（用于 npm run dev 调试视觉）
 * 真实跑脚本要在 uTools 环境里。
 */
import type { ScriptData } from "@/lib/types";
import type { PlatformAdapter, StartTaskOptions } from "./types";

const SCRIPTS_KEY = "goose-run:scripts";
const SETTINGS_KEY = "goose-run:settings";

const fakeTasks = new Map<string, ReturnType<typeof setTimeout>>();

function emit(type: string, detail: any) {
  window.dispatchEvent(new CustomEvent(`goose-run:${type}`, { detail }));
}

export function createWebAdapter(): PlatformAdapter {
  return {
    loadScripts(): ScriptData[] {
      try {
        const raw = localStorage.getItem(SCRIPTS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    },

    saveScripts(scripts: ScriptData[]) {
      try { localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts)); }
      catch (e) { console.warn("[goose-run] saveScripts failed:", e); }
    },

    loadSettings() {
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : {};
      } catch { return {}; }
    },

    saveSettings(s) {
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
      catch (e) { console.warn("[goose-run] saveSettings failed:", e); }
    },

    startTask(opts: StartTaskOptions): boolean {
      if (fakeTasks.has(opts.taskId)) return false;
      const startedAt = Date.now();
      emit("start", { taskId: opts.taskId, startedAt });

      const lines = [
        "[web 模拟] 不会真的执行，仅渲染日志样式",
        `[web 模拟] $ ${opts.shell || "bash"} -c '${(opts.script.split("\n")[0] ?? "").slice(0, 60)}...'`,
        "[web 模拟] cwd: " + (opts.cwd || "$HOME"),
        "[web 模拟] 正在跑...",
        "[web 模拟] 仍在跑...",
        "[web 模拟] 完成",
      ];
      let i = 0;
      const tick = () => {
        if (i >= lines.length) {
          fakeTasks.delete(opts.taskId);
          emit("exit", { taskId: opts.taskId, code: 0, signal: null, endedAt: Date.now() });
          return;
        }
        emit("log", { taskId: opts.taskId, stream: "stdout", text: lines[i] + "\n" });
        i++;
        const t = setTimeout(tick, 400);
        fakeTasks.set(opts.taskId, t);
      };
      const t = setTimeout(tick, 200);
      fakeTasks.set(opts.taskId, t);
      return true;
    },

    stopTask(taskId: string): boolean {
      const t = fakeTasks.get(taskId);
      if (!t) return false;
      clearTimeout(t);
      fakeTasks.delete(taskId);
      emit("exit", { taskId, code: null, signal: "SIGTERM", endedAt: Date.now() });
      return true;
    },

    listTasks() { return Array.from(fakeTasks.keys()); },

    // web 降级：无法探测真实进程，正在「假运行」的任务视为运行中，其余未运行
    async probeRunning(): Promise<boolean> {
      return false;
    },

    // web 降级：浏览器无法 kill 真实进程，恒返回 false（dev 仅看视觉）
    async killPort(): Promise<boolean> {
      return false;
    },

    async copyText(text: string) {
      try { await navigator.clipboard.writeText(text); } catch {}
    },

    saveToFile(content: string, defaultName: string): boolean {
      try {
        const blob = new Blob([content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = defaultName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      } catch { return false; }
    },

    readFromFile(): Promise<string | null> {
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = ".json";
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return resolve(null);
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => resolve(null);
          reader.readAsText(f);
        };
        input.click();
      });
    },

    showNotification(text: string) {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("鹅的运行", { body: text });
      } else {
        console.log("[goose-run] " + text);
      }
    },

    // web 降级：浏览器无法可靠选目录/读任意路径文件，返回 null（dev 调试用拖拽兜底）
    pickDirectory(): null {
      return null;
    },
    readFileText(): null {
      return null;
    },

    // web 降级：浏览器无法执行真实命令，返回提示性结果（AI 会据此叙述，UI 流程可验）
    async execCommand({ command }) {
      return {
        exitCode: null,
        stdout: "",
        stderr: `[web 降级] 浏览器无法执行命令：${(command ?? "").slice(0, 80)}（真实启动请在 uTools 内）`,
        timedOut: false,
      };
    },
    // web 降级：浏览器无法写真实文件
    async writeFileText() {
      return { ok: false, error: "[web 降级] 浏览器无法写文件（真实启动请在 uTools 内）" };
    },

    openExternal(url: string) {
      window.open(url, "_blank", "noopener,noreferrer");
    },
  };
}
