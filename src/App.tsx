import { useEffect, useRef, useCallback, useState, type ReactNode } from "react";
import { useScripts, getVisibleScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { useAI } from "@/stores/useAI";
import { usePlatform } from "@/platform/context";
import { filterScripts } from "@/lib/search";
import { extractParams } from "@/lib/params";
import { getAIAvailability } from "@/lib/ai-provider";
import { inferRunCommand, dirOf, classifyDroppedFile } from "@/lib/script-import";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { FileDown, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { ScriptList } from "@/components/ScriptList";
import { ScriptDetail } from "@/components/ScriptDetail";
import { ScriptForm } from "@/components/ScriptForm";
import { ParamPanel } from "@/components/ParamPanel";
import { AiAnalysisPanel } from "@/components/AiAnalysisPanel";
import { DetailEmpty } from "@/components/DetailEmpty";
import { EmptyState } from "@/components/EmptyState";

// 左栏宽度持久化（双栏工作台）
const LEFT_WIDTH_KEY = "goose-run:left-width";
const LEFT_MIN = 220;
const LEFT_MAX = 520;
import type {
  PluginEnterDetail,
  TaskLogEvent,
  TaskExitEvent,
  TaskErrorEvent,
  TaskStartEvent,
} from "@/lib/types";

// 去除 ANSI 转义码（颜色/光标/清行/OSC），并处理 \r 覆盖（进度条只保留最后一段）
const ANSI_RE =
  /[][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;
function cleanLogText(s: string): string {
  const afterCR = s.includes("\r") ? s.slice(s.lastIndexOf("\r") + 1) : s;
  return afterCR.replace(ANSI_RE, "");
}

export default function App() {
  const platform = usePlatform();

  const scripts        = useScripts((s) => s.scripts);
  const selectedId     = useScripts((s) => s.selectedId);
  const editingId      = useScripts((s) => s.editingId);
  const isDark         = useScripts((s) => s.isDark);
  const isThemeLocked  = useScripts((s) => s.isThemeLocked);
  const load           = useScripts((s) => s.load);
  const updateLastRun  = useScripts((s) => s.updateLastRun);
  const setSearchQuery = useScripts((s) => s.setSearchQuery);
  const setSelectedId  = useScripts((s) => s.setSelectedId);
  const setCursorId    = useScripts((s) => s.setCursorId);
  const setEditingId   = useScripts((s) => s.setEditingId);
  const syncSystemDark = useScripts((s) => s.syncSystemDark);

  const appendLog  = useRuns((s) => s.appendLog);
  const finishRun  = useRuns((s) => s.finishRun);
  const runs       = useRuns((s) => s.runs);
  const pendingRun = useRuns((s) => s.pendingRun);

  // ── 左栏宽度（可拖拽分隔条 + 持久化）──
  const [leftWidth, setLeftWidth] = useState(() => {
    const saved = Number(localStorage.getItem(LEFT_WIDTH_KEY));
    return saved >= LEFT_MIN && saved <= LEFT_MAX ? saved : 300;
  });
  const leftWidthRef = useRef(leftWidth);
  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(LEFT_MAX, Math.max(LEFT_MIN, ev.clientX));
      leftWidthRef.current = w;
      setLeftWidth(w);
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(LEFT_WIDTH_KEY, String(leftWidthRef.current));
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // 窄窗响应式：视口偏窄时收紧左栏，保证右栏可用宽度（结构性降级，不切单栏）
  const [viewportW, setViewportW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const effectiveLeft =
    viewportW < 720
      ? Math.min(leftWidth, Math.max(180, Math.round(viewportW * 0.42)))
      : leftWidth;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const runsRef = useRef(runs);
  runsRef.current = runs;

  // ── 拖拽文件 + AI 分析 ──
  const [dragOver, setDragOver] = useState(false);
  // AI 可用时拖拽分屏：左=本地上传 / 右=AI 上传；不可用时整块走本地
  const [dragAiReady, setDragAiReady] = useState(false);
  const [dragSide, setDragSide] = useState<"left" | "right">("left");
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<{ path: string; content: string }>({ path: "", content: "" });

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
        appendLog(d.taskId, { ts: Date.now(), stream: d.stream, text: cleanLogText(t) });
      }
    };
    const onStart = (e: Event) => {
      const d = (e as CustomEvent<TaskStartEvent>).detail;
      appendLog(d.taskId, { ts: d.startedAt, stream: "system", text: `▶ 启动于 ${new Date(d.startedAt).toLocaleString()}` });
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
        // 第二参 clickFeatureCode：点击通知唤起 run 面板
        platform.showNotification(ok ? `✓ ${scriptName} 运行成功` : `✗ ${scriptName} 运行失败 (exit ${d.code})`, "run");
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
    const onEnter = async (e: Event) => {
      const d = (e as CustomEvent<PluginEnterDetail>).detail;

      // files-feature：拖文件到 uTools 启动器进入，读内容预填新脚本表单
      if (d.code === "import-file") {
        const items = Array.isArray(d.payload)
          ? (d.payload as Array<{ path?: string; name?: string; isFile?: boolean }>)
          : [];
        const f = items.find((it) => it?.isFile && it.path) ?? items.find((it) => it?.path);
        if (f?.path) {
          const fp = f.path;
          const content = (await platform.readFileText?.(fp)) ?? "";
          const { script, shell } = inferRunCommand(fp, content);
          setEditingId("new");
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("goose-run:prefill-script", {
              detail: { name: f.name || fp.split(/[\\/]/).pop(), script, shell, cwd: dirOf(fp), filePath: fp },
            }));
          }, 100);
        }
        return;
      }

      if (d.code === "quick") {
        // payload 形如 "gr alpha"，剥前缀拿关键字
        const q = String(d.payload ?? "").replace(/^(gr|鹅运)\s+/i, "").trim();
        const { scripts: matched } = filterScripts(useScripts.getState().scripts, q);
        // 唯一命中 + 无危险确认 + 无待填参数 → 直接运行并隐藏窗口；否则退化为过滤
        const only = matched.length === 1 ? matched[0]! : null;
        if (only && !only.confirmBeforeRun && extractParams(only.script).length === 0) {
          useRuns.getState().requestRun(only);
          setSearchQuery("");
          setSelectedId(null);
          setEditingId(null);
          platform.hideWindow?.();
          return;
        }
        setSearchQuery(q);
        // 收起其他视图，回到列表
        setSelectedId(null);
        setEditingId(null);
      } else {
        // code === "run" 默认面板
        setSelectedId(null);
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
  }, [platform, setSearchQuery, setSelectedId, setEditingId]);

  // ── 键盘快捷键 ──
  const handleKey = useCallback((e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    const inField = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || (t as any).isContentEditable);

    if (e.key === "Escape") {
      // 优先级：表单 > 参数 > 取消选中 > 退出搜索 > 退出插件
      const st = useScripts.getState();
      if (st.editingId) {
        setEditingId(null);
      } else if (useRuns.getState().pendingRun) {
        useRuns.getState().cancelRun();
      } else if (st.selectedId) {
        setSelectedId(null);
      } else if (st.searchQuery) {
        setSearchQuery("");
      } else {
        platform.outPlugin?.();
      }
      return;
    }

    // Cmd+1~9：运行可见列表（已排序，与肉眼一致）中对应位置的脚本
    if (e.metaKey && e.key >= "1" && e.key <= "9") {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      const target = getVisibleScripts(useScripts.getState())[idx];
      if (target) { setSelectedId(target.id); useRuns.getState().requestRun(target); }
      return;
    }

    // ↑↓ 在可见列表移动游标，回车运行（抽屉/参数面板打开时不抢键）
    const overlayOpen = () => {
      return useScripts.getState().editingId !== null || useRuns.getState().pendingRun != null;
    };
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (overlayOpen()) return;
      const st = useScripts.getState();
      const visible = getVisibleScripts(st);
      if (!visible.length) return;
      e.preventDefault();
      const curIdx = visible.findIndex((s) => s.id === st.cursorId);
      let next: number;
      if (curIdx === -1) {
        next = e.key === "ArrowDown" ? 0 : visible.length - 1;
      } else {
        next = e.key === "ArrowDown" ? curIdx + 1 : curIdx - 1;
        next = Math.max(0, Math.min(visible.length - 1, next));
      }
      setCursorId(visible[next]!.id);
      return;
    }
    if (e.key === "Enter") {
      if (overlayOpen()) return;
      const st = useScripts.getState();
      const visible = getVisibleScripts(st);
      if (!visible.length) return;
      let target = st.cursorId ? visible.find((s) => s.id === st.cursorId) : null;
      if (!target && st.searchQuery.trim()) target = visible[0] ?? null;
      if (target) {
        e.preventDefault();
        setSelectedId(target.id);
        useRuns.getState().requestRun(target);
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
  }, [platform, setEditingId, setSelectedId, setSearchQuery, setCursorId]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  // ── 拖拽文件处理 ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const aiReady = getAIAvailability(useAI.getState().getSettings()).ok;
    setDragAiReady(aiReady);
    setDragOver(true);
    // 仅在分屏模式下跟随光标高亮左/右落点
    if (aiReady) {
      setDragSide(e.clientX < window.innerWidth / 2 ? "left" : "right");
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }, []);

  const toLocalUpload = useCallback((file: File, content: string, filePath: string) => {
    // 按文件类型生成可运行命令：解释型文件用解释器按路径跑，shell 片段内联
    const { script, shell } = inferRunCommand(filePath, content);
    setEditingId("new");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("goose-run:prefill-script", {
        detail: { name: file.name, script, shell, cwd: dirOf(filePath), filePath },
      }));
    }, 100);
  }, [setEditingId]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0]!;
    const content = await file.text();
    const filePath = (file as File & { path?: string }).path || file.name;

    // 类型分流：二进制直接拒、文本类给逃生口、脚本类正常导入
    const kind = classifyDroppedFile(filePath, content);
    if (kind === "binary") {
      toast.error("不支持的文件类型", {
        description: `${file.name}：鹅的运行只接受可执行脚本`,
      });
      return;
    }

    const aiReady = getAIAvailability(useAI.getState().getSettings()).ok;
    // 用户意图：拖到右半屏想用 AI 解析
    const wantRight = e.clientX >= window.innerWidth / 2;

    if (kind === "ambiguous") {
      toast.warning("这看起来不是脚本", {
        description: `${file.name} 似乎不是可执行脚本，仍要作为命令导入吗？`,
        action: {
          label: "仍导入",
          onClick: () => toLocalUpload(file, content, filePath),
        },
      });
      return;
    }

    // 脚本类：AI 可用且拖右半 → AI 解析；否则本地解析
    if (aiReady && wantRight) {
      setDroppedFile({ path: filePath, content });
      setAiPanelOpen(true);
    } else {
      if (wantRight && !aiReady) {
        toast.info("AI 未配置，已转为本地解析");
      }
      toLocalUpload(file, content, filePath);
    }
  }, [toLocalUpload]);

  // ── 当前选中的脚本（用于 ScriptDetail）──
  const selectedScript = selectedId ? scripts.find((s) => s.id === selectedId) ?? null : null;

  // 右栏内容派生（互斥优先级）：编辑 > 参数填值 > 详情 > 首次空态 > 未选空态
  let rightContent: ReactNode;
  if (editingId !== null) {
    rightContent = <ScriptForm />;
  } else if (pendingRun != null) {
    rightContent = <ParamPanel />;
  } else if (selectedScript) {
    rightContent = <ScriptDetail key={selectedScript.id} script={selectedScript} />;
  } else if (scripts.length === 0) {
    rightContent = (
      <div className="flex h-full items-center justify-center overflow-y-auto">
        <EmptyState />
      </div>
    );
  } else {
    rightContent = <DetailEmpty />;
  }

  return (
    <div
      className="relative flex h-screen w-full flex-col overflow-hidden bg-bg text-fg"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Header ref={searchInputRef} />

      <div className="flex min-h-0 flex-1">
        {/* 左栏：脚本列表 */}
        <aside
          style={{ width: effectiveLeft }}
          className="shrink-0 overflow-y-auto border-r border-border"
        >
          <ScriptList />
        </aside>

        {/* 拖拽分隔条（命中区域比 1px 视觉条宽，便于抓取） */}
        <div
          onMouseDown={startDrag}
          className="relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent"
          aria-hidden
        >
          <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
        </div>

        {/* 右栏：详情 / 编辑 / 参数 / 空态 */}
        <section className="min-w-0 flex-1 overflow-hidden">
          {rightContent}
        </section>
      </div>

      <AiAnalysisPanel
        open={aiPanelOpen}
        onOpenChange={setAiPanelOpen}
        filePath={droppedFile.path}
        fileContent={droppedFile.content}
      />

      <Toaster />

      {dragOver && (
        dragAiReady ? (
          // AI 可用：左右分屏，跟随光标高亮当前落点
          <div className="absolute inset-0 z-50 flex gap-3 p-3 bg-bg/70 backdrop-blur-sm pointer-events-none">
            <DropHalf
              active={dragSide === "left"}
              icon={<FileDown size={26} strokeWidth={1.75} />}
              title="本地上传"
              hint="填入新脚本表单"
            />
            <DropHalf
              active={dragSide === "right"}
              icon={<Sparkles size={26} strokeWidth={1.75} />}
              title="AI 上传"
              hint="AI 分析并生成脚本"
            />
          </div>
        ) : (
          // AI 不可用：整块本地上传
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm border-2 border-dashed border-accent rounded-lg pointer-events-none">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-accent-subtle flex items-center justify-center text-accent">
                <FileDown size={24} strokeWidth={1.75} />
              </div>
              <p className="text-sm font-medium text-fg">拖放文件到此处</p>
              <p className="text-xs text-fg-muted">文件内容将填入新脚本表单</p>
            </div>
          </div>
        )
      )}
    </div>
  );
}

interface DropHalfProps {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  hint: string;
}

function DropHalf({ active, icon, title, hint }: DropHalfProps) {
  return (
    <div
      className={cn(
        "flex-1 flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed transition-all duration-150",
        active
          ? "border-accent bg-accent-subtle scale-[1.01]"
          : "border-border bg-surface/30",
      )}
    >
      <div
        className={cn(
          "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
          active ? "bg-accent/15 text-accent" : "bg-muted text-fg-muted",
        )}
      >
        {icon}
      </div>
      <p className={cn("text-sm font-medium transition-colors", active ? "text-fg" : "text-fg-muted")}>
        {title}
      </p>
      <p className="text-xs text-fg-faint">{hint}</p>
    </div>
  );
}
