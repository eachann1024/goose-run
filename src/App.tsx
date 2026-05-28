import { useEffect, useRef, useCallback } from "react";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { usePlatform } from "@/platform/context";
import { filterScripts } from "@/lib/search";
import { Header } from "@/components/Header";
import { ScriptList } from "@/components/ScriptList";
import { ScriptDetail } from "@/components/ScriptDetail";
import { ScriptForm } from "@/components/ScriptForm";
import type {
  PluginEnterDetail,
  TaskLogEvent,
  TaskExitEvent,
  TaskErrorEvent,
  TaskStartEvent,
} from "@/lib/types";

export default function App() {
  const platform = usePlatform();

  const scripts        = useScripts((s) => s.scripts);
  const selectedId     = useScripts((s) => s.selectedId);
  const editingId      = useScripts((s) => s.editingId);
  const showDetail     = useScripts((s) => s.showDetail);
  const isDark         = useScripts((s) => s.isDark);
  const isThemeLocked  = useScripts((s) => s.isThemeLocked);
  const load           = useScripts((s) => s.load);
  const updateLastRun  = useScripts((s) => s.updateLastRun);
  const setSearchQuery = useScripts((s) => s.setSearchQuery);
  const setSelectedId  = useScripts((s) => s.setSelectedId);
  const setEditingId   = useScripts((s) => s.setEditingId);
  const setShowDetail  = useScripts((s) => s.setShowDetail);
  const syncSystemDark = useScripts((s) => s.syncSystemDark);

  const appendLog  = useRuns((s) => s.appendLog);
  const finishRun  = useRuns((s) => s.finishRun);
  const startRun   = useRuns((s) => s.startRun);
  const runs       = useRuns((s) => s.runs);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  // ── 启动加载 ──
  useEffect(() => {
    load();
  }, [load]);

  // ── 主题 class 同步到 <html> ──
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // ── 系统主题变化（仅在未锁定时跟随）──
  useEffect(() => {
    if (isThemeLocked) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => syncSystemDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [isThemeLocked, syncSystemDark]);

  // ── preload 主题事件桥接 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ isDark: boolean }>).detail;
      if (!useScripts.getState().isThemeLocked) syncSystemDark(detail.isDark);
    };
    window.addEventListener("goose-run:theme-changed", handler);
    return () => window.removeEventListener("goose-run:theme-changed", handler);
  }, [syncSystemDark]);

  // ── 任务事件订阅（log / start / exit / error）──
  useEffect(() => {
    const onLog = (e: Event) => {
      const d = (e as CustomEvent<TaskLogEvent>).detail;
      const text = d.text;
      // 按换行拆，每行一个 LogLine
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i] ?? "";
        if (i === lines.length - 1 && t === "") break; // 末尾换行忽略
        appendLog(d.taskId, { ts: Date.now(), stream: d.stream, text: t });
      }
    };
    const onStart = (e: Event) => {
      const d = (e as CustomEvent<TaskStartEvent>).detail;
      appendLog(d.taskId, { ts: d.startedAt, stream: "system", text: `▶ 启动于 ${new Date(d.startedAt).toLocaleTimeString()}` });
    };
    const onExit = (e: Event) => {
      const d = (e as CustomEvent<TaskExitEvent>).detail;
      finishRun(d.taskId, d.code, d.signal);
      // 同步到 scripts 的 lastRun（不动 updatedAt）
      const run = runsRef.current[d.taskId];
      if (run) {
        updateLastRun(run.scriptId, {
          startedAt: run.startedAt,
          endedAt: d.endedAt,
          exitCode: d.code,
          durationMs: d.endedAt - run.startedAt,
        });
        // 运行完成通知
        const scriptName = useScripts.getState().scripts.find((s) => s.id === run.scriptId)?.name ?? "脚本";
        const ok = d.code === 0;
        platform.showNotification(ok ? `✓ ${scriptName} 运行成功` : `✗ ${scriptName} 运行失败 (exit ${d.code})`);
      }
    };
    const onError = (e: Event) => {
      const d = (e as CustomEvent<TaskErrorEvent>).detail;
      appendLog(d.taskId, { ts: Date.now(), stream: "system", text: `✗ 错误: ${d.message}` });
      finishRun(d.taskId, -1, null);
    };

    window.addEventListener("goose-run:log",   onLog);
    window.addEventListener("goose-run:start", onStart);
    window.addEventListener("goose-run:exit",  onExit);
    window.addEventListener("goose-run:error", onError);
    return () => {
      window.removeEventListener("goose-run:log",   onLog);
      window.removeEventListener("goose-run:start", onStart);
      window.removeEventListener("goose-run:exit",  onExit);
      window.removeEventListener("goose-run:error", onError);
    };
  }, [appendLog, finishRun, updateLastRun]);

  // ── uTools 插件进入路由 ──
  useEffect(() => {
    const onEnter = (e: Event) => {
      const d = (e as CustomEvent<PluginEnterDetail>).detail;
      if (d.code === "quick") {
        // payload 形如 "gr alpha"，剥前缀拿关键字
        const q = (d.payload || "").replace(/^(gr|鹅运)\s+/i, "").trim();
        setSearchQuery(q);
        // 收起其他视图，回到列表
        setSelectedId(null);
        setShowDetail(false);
        setEditingId(null);
      } else {
        // code === "run" 默认面板
        setSelectedId(null);
        setShowDetail(false);
        setEditingId(null);
      }
    };
    const onOut = () => {
      // 插件被挪出，清掉搜索词以便下次重新进入是干净状态
      setSearchQuery("");
    };
    window.addEventListener("goose-run:plugin-enter", onEnter);
    window.addEventListener("goose-run:plugin-out", onOut);
    return () => {
      window.removeEventListener("goose-run:plugin-enter", onEnter);
      window.removeEventListener("goose-run:plugin-out", onOut);
    };
  }, [setSearchQuery, setSelectedId, setShowDetail, setEditingId]);

  // ── 键盘快捷键 ──
  const handleKey = useCallback((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);

    if (e.key === "Escape") {
      // 优先级：表单 > 详情 > 退出搜索 > 退出插件
      if (useScripts.getState().editingId) {
        setEditingId(null);
      } else if (useScripts.getState().showDetail) {
        setShowDetail(false);
      } else if (useScripts.getState().searchQuery) {
        setSearchQuery("");
      } else {
        platform.outPlugin?.();
      }
      return;
    }

    // Cmd+1~9：运行过滤后列表中对应位置的脚本
    if (e.metaKey && e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      const state = useScripts.getState();
      const filteredResult = filterScripts(state.scripts, state.searchQuery);
      const target = filteredResult.scripts[idx];
      if (target) {
        if (target.confirmBeforeRun && !confirm(`确认运行「${target.name}」？此脚本标记为危险操作。`)) return;
        startRun(target.id, { script: target.script, cwd: target.cwd, env: target.env, shell: target.shell });
      }
      return;
    }

    if (inField) return;

    if (e.key === "/" || (e.key === "f" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      searchInputRef.current?.focus();
    } else if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) {
      setEditingId("new");
    }
  }, [platform, startRun, setEditingId, setShowDetail, setSearchQuery]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── 当前选中的脚本（用于 ScriptDetail）──
  const selectedScript = selectedId ? scripts.find((s) => s.id === selectedId) ?? null : null;

  return (
    <div className="min-h-screen w-full bg-bg text-fg flex flex-col">
      <Header ref={searchInputRef} />
      <main className="flex-1 w-full px-4 py-6 overflow-y-auto">
        <ScriptList />
      </main>

      {selectedScript && showDetail && (
        <ScriptDetail script={selectedScript} />
      )}

      {editingId !== null && (
        <ScriptForm />
      )}
    </div>
  );
}
