import { useScripts } from "@/stores/useScripts";
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

  const startRun = useRuns((s) => s.startRun);
  const stopRun = useRuns((s) => s.stopRun);
  const getRunByScript = useRuns((s) => s.getRunByScript);

  const filteredScripts = filterScripts(scripts, searchQuery);

  if (filteredScripts.length === 0) {
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

  return (
    <div className="flex flex-col gap-2 max-w-[720px] mx-auto">
      {filteredScripts.map((s, index) => {
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
