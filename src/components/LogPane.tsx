import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRuns } from "@/stores/useRuns";
import { cn } from "@/lib/utils";
import type { LogLine, RunState } from "@/lib/types";
import { Check, X, Square } from "lucide-react";

function classify(line: LogLine): string {
  const t = line.text;
  if (line.stream === "system") return "text-[#85b8e0] italic";
  if (line.stream === "stderr") return "text-[#f08080]";
  if (/^[─━]{3,}/.test(t)) return "text-[#706963]";
  if (/✓|^✅|成功|complete/i.test(t)) return "text-[#7ecf8a]";
  if (/^❌|^✗|^Error|^FAIL|失败/i.test(t)) return "text-[#f08080]";
  if (/^▶|^📋|^阶段|^Step/.test(t)) return "text-[#85b8e0] font-medium";
  if (/^⚠|WARN|警告/i.test(t)) return "text-[#e8c865]";
  return "text-[#d8d3cc]";
}

function formatDuration(ms: number): string {
  return (ms / 1000).toFixed(1) + "s";
}

interface StatusBadgeProps {
  run: RunState | undefined;
  elapsed: number;
}

function StatusBadge({ run, elapsed }: StatusBadgeProps) {
  if (!run) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] bg-slate-700 text-slate-400">
        空闲
      </span>
    );
  }

  if (run.status === "running") {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] bg-blue-900/60 text-blue-300">
        运行中 · {elapsed.toFixed(1)}s
      </span>
    );
  }

  const dur = run.endedAt != null
    ? formatDuration(run.endedAt - run.startedAt)
    : "—";

  if (run.status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] bg-green-900/60 text-green-300">
        <Check size={12} strokeWidth={2} /> 完成 · {dur} · exit 0
      </span>
    );
  }

  if (run.status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] bg-red-900/60 text-red-300">
        <X size={12} strokeWidth={2} /> 失败 · {dur} · exit {run.exitCode ?? "?"}
      </span>
    );
  }

  if (run.status === "stopped") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] bg-yellow-900/60 text-yellow-300">
        <Square size={11} strokeWidth={2} /> 已中止 · {dur}
      </span>
    );
  }

  return null;
}

interface LogPaneProps {
  scriptId: string;
}

export function LogPane({ scriptId }: LogPaneProps) {
  const run = useRuns((s) => s.getRunByScript(scriptId));
  const clearRun = useRuns((s) => s.clearRun);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [elapsed, setElapsed] = useState(0);

  // 计时器：running 时每 200ms 更新 elapsed
  useEffect(() => {
    if (run?.status !== "running") {
      setElapsed(0);
      return;
    }
    const startedAt = run.startedAt;
    const id = setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000);
    }, 200);
    return () => clearInterval(id);
  }, [run?.status, run?.startedAt]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  function handleCopy() {
    if (!run) return;
    const text = run.lines.map((l) => l.text).join("\n");
    navigator.clipboard.writeText(text);
  }

  function handleClear() {
    if (!run || run.status === "running") return;
    clearRun(run.taskId);
  }

  const lines = run?.lines ?? [];

  const rowVirtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 19,
    getItemKey: (index) => lines[index]?.id ?? index,
    overscan: 16,
  });

  // 自动滚到底（仅在贴近底部时跟随）
  useEffect(() => {
    if (!isNearBottomRef.current || lines.length === 0) return;
    rowVirtualizer.scrollToIndex(lines.length - 1, { align: "end" });
  }, [lines.length, rowVirtualizer]);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-1.5">
      {/* 状态条 */}
      <div className="flex items-center justify-between">
        <StatusBadge run={run ?? undefined} elapsed={elapsed} />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!run || lines.length === 0}
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            复制日志
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!run || run.status === "running"}
            className="rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            清空日志
          </button>
        </div>
      </div>

      {/* 日志容器 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          "bg-[#1b1815] rounded-md p-3 font-mono text-[12.5px] leading-[1.55]",
          lines.length === 0
            ? "flex items-center justify-center"
            : "overflow-y-auto flex-1 min-h-[120px]",
        )}
      >
        {lines.length === 0 ? (
          <span className="text-[#706963] italic text-[12px]">(暂无日志，点上方按钮运行)</span>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const line = lines[vi.index]!;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  className={cn("whitespace-pre-wrap break-all", classify(line))}
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
                >
                  {line.text || " "}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
