import { useScripts, sortScripts } from "@/stores/useScripts";
import type { SortMode } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { filterScripts } from "@/lib/search";
import { ScriptCard } from "./ScriptCard";
import { EmptyState } from "./EmptyState";

export function ScriptList() {
  const scripts = useScripts((s) => s.scripts);
  const searchQuery = useScripts((s) => s.searchQuery);
  const selectedId = useScripts((s) => s.selectedId);
  const setSelectedId = useScripts((s) => s.setSelectedId);
  const setShowDetail = useScripts((s) => s.setShowDetail);
  const sortMode = useScripts((s) => s.sortMode);
  const setSortMode = useScripts((s) => s.setSortMode);

  const startRun = useRuns((s) => s.startRun);
  const stopRun = useRuns((s) => s.stopRun);
  const getRunByScript = useRuns((s) => s.getRunByScript);

  const { scripts: filteredScripts, total } = filterScripts(scripts, searchQuery);
  const sorted = sortScripts(filteredScripts, sortMode);

  if (sorted.length === 0) {
    if (searchQuery.trim().length > 0) {
      return (
        <div className="max-w-[720px] mx-auto py-16 text-center text-sm text-fg-muted">
          无匹配脚本 · 按 Esc 或清空搜索
        </div>
      );
    }
    return (
      <div className="max-w-[720px] mx-auto">
        <EmptyState />
      </div>
    );
  }

  const sortLabels: Record<SortMode, string> = { lastRun: "最近", name: "名称", created: "时间" };

  return (
    <div className="flex flex-col gap-2 max-w-[720px] mx-auto">
      {scripts.length > 0 && (
        <div className="flex items-center justify-between mb-1">
          {searchQuery.trim() ? (
            <span className="text-xs text-fg-muted">
              {filteredScripts.length} / {total} 个脚本
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-1 ml-auto text-[11px] text-fg-muted">
            {(["lastRun", "name", "created"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setSortMode(m)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  sortMode === m
                    ? "bg-accent-subtle text-accent font-medium"
                    : "hover:bg-surface"
                }`}
              >
                {sortLabels[m]}
              </button>
            ))}
          </div>
        </div>
      )}
      {sorted.map((s, index) => {
        const run = getRunByScript(s.id);
        return (
          <ScriptCard
            key={s.id}
            script={s}
            isSelected={selectedId === s.id}
            index={index}
            onSelect={() => {
              setSelectedId(s.id);
              setShowDetail(true);
            }}
            onRun={() => {
              startRun(s.id, {
                script: s.script,
                cwd: s.cwd,
                env: s.env,
                shell: s.shell,
              });
            }}
            onStop={() => {
              if (run?.taskId) {
                stopRun(run.taskId);
              }
            }}
          />
        );
      })}
    </div>
  );
}
