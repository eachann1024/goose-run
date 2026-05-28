import { Play, Square } from "lucide-react";
import { useRuns } from "@/stores/useRuns";
import type { ScriptData } from "@/lib/types";

interface ScriptCardProps {
  script: ScriptData;
  isSelected: boolean;
  onSelect: () => void;
  onRun: () => void;
  onStop: () => void;
  index: number;
}

function StatusDot({ status }: { status: string | undefined }) {
  if (!status) {
    return (
      <span
        className="shrink-0 rounded-full bg-fg-faint"
        style={{ width: 10, height: 10 }}
      />
    );
  }
  if (status === "running") {
    return (
      <span
        className="shrink-0 rounded-full animate-pulse"
        style={{ width: 10, height: 10, background: "#3b82f6" }}
      />
    );
  }
  if (status === "success") {
    return (
      <span
        className="shrink-0 rounded-full"
        style={{ width: 10, height: 10, background: "#22c55e" }}
      />
    );
  }
  if (status === "failed") {
    return (
      <span
        className="shrink-0 rounded-full"
        style={{ width: 10, height: 10, background: "#ef4444" }}
      />
    );
  }
  // stopped
  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: 10, height: 10, background: "#eab308" }}
    />
  );
}

export function ScriptCard({
  script,
  isSelected,
  onSelect,
  onRun,
  onStop,
  index,
}: ScriptCardProps) {
  const run = useRuns((s) => s.getRunByScript(script.id));

  const isRunning = run?.status === "running";

  const description =
    script.description ??
    (script.script.split("\n")[0] ?? "").slice(0, 60);

  const lastRun = script.lastRun;

  return (
    <div
      className={[
        "cell-enter grid gap-3 items-center p-3 rounded-cell border bg-surface cursor-pointer",
        "hover:bg-surface-hover transition-colors",
        isSelected ? "border-accent bg-accent-subtle" : "border-border",
      ].join(" ")}
      style={{ gridTemplateColumns: "auto 1fr auto", animationDelay: `${index * 30}ms` }}
      onClick={onSelect}
    >
      {/* 状态点 */}
      <StatusDot status={run?.status} />

      {/* 中间信息区 */}
      <div className="min-w-0">
        <p className="font-semibold text-sm text-fg truncate">{script.name}</p>
        <p className="text-xs text-fg-muted font-mono truncate">{description}</p>
        {lastRun && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] text-fg-faint">
              {new Date(lastRun.startedAt).toLocaleString()}
            </span>
            {lastRun.exitCode !== undefined && lastRun.exitCode !== null && (
              <span
                className={[
                  "text-[10px] font-mono px-1 rounded",
                  lastRun.exitCode === 0
                    ? "bg-copied-subtle text-copied"
                    : "bg-timer-low/10 text-timer-low",
                ].join(" ")}
              >
                exit {lastRun.exitCode}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 右侧操作按钮 */}
      {isRunning ? (
        <button
          onClick={(e) => { e.stopPropagation(); onStop(); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-white transition-colors hover:opacity-90 active:scale-95"
          style={{ background: "#eab308" }}
          aria-label="中止运行"
        >
          <Square size={12} strokeWidth={2} />
          中止
        </button>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onRun(); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-accent text-accent-fg transition-colors hover:bg-accent-hover active:scale-95"
          aria-label="运行脚本"
        >
          <Play size={12} strokeWidth={2} />
          运行
        </button>
      )}
    </div>
  );
}
