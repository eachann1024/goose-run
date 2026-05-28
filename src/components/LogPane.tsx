import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRuns } from "@/stores/useRuns";
import type { LogLine, RunState } from "@/lib/types";

function classify(line: LogLine): string {
  const t = line.text;
  if (line.stream === "system") return "text-blue-400 italic";
  if (line.stream === "stderr") return "text-red-300";
  if (/^[─━]{3,}/.test(t)) return "text-slate-500";
  if (/✓|^✅|成功|complete/i.test(t)) return "text-green-300";
  if (/^❌|^✗|^Error|^FAIL|失败/i.test(t)) return "text-red-300";
  if (/^▶|^📋|^阶段|^Step/.test(t)) return "text-blue-300 font-medium";
  if (/^⚠|WARN|警告/i.test(t)) return "text-yellow-300";
  return "text-slate-200";
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
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] bg-green-900/60 text-green-300">
        ✓ 完成 · {dur} · exit 0
      </span>
    );
  }

  if (run.status === "failed") {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] bg-red-900/60 text-red-300">
        ✗ 失败 · {dur} · exit {run.exitCode ?? "?"}
      </span>
    );
  }

  if (run.status === "stopped") {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] bg-yellow-900/60 text-yellow-300">
        ⏹ 已中止 · {dur}
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
    estimateSize: () => 20,
    overscan: 30,
  });

  // 自动滚到底（虚拟滚动版）
  useEffect(() => {
    if (!isNearBottomRef.current || lines.length === 0) return;
    rowVirtualizer.scrollToIndex(lines.length - 1, { align: "end" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length]);

  return (
    <div className="flex flex-col gap-1.5">
      {/* 状态条 */}
      <div className="flex items-center justify-between">
        <StatusBadge run={run ?? undefined} elapsed={elapsed} />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!run || lines.length === 0}
            className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            复制日志
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!run || run.status === "running"}
            className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            清空日志
          </button>
        </div>
      </div>

      {/* 日志容器 */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="bg-[#0f172a] text-[#e2e8f0] rounded-md p-3 font-mono text-[12.5px] leading-[1.55] overflow-y-auto max-h-[280px] min-h-[160px]"
      >
        {lines.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[120px]">
            <span className="text-slate-500 italic text-[12px]">(暂无日志，点上方按钮运行)</span>
          </div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const line = lines[virtualItem.index]!;
              return (
                <div
                  key={virtualItem.index}
                  className={classify(line)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
