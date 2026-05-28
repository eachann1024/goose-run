import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import type { ScriptData } from "@/lib/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogPane } from "@/components/LogPane";

interface ScriptDetailProps {
  script: ScriptData;
}

export function ScriptDetail({ script }: ScriptDetailProps) {
  const showDetail = useScripts((s) => s.showDetail);
  const selectedId = useScripts((s) => s.selectedId);
  const setShowDetail = useScripts((s) => s.setShowDetail);
  const setEditingId = useScripts((s) => s.setEditingId);
  const removeScript = useScripts((s) => s.removeScript);

  const startRun = useRuns((s) => s.startRun);
  const stopRun = useRuns((s) => s.stopRun);
  const run = useRuns((s) => s.getRunByScript(script.id));

  const isOpen = showDetail && selectedId === script.id;
  const isRunning = run?.status === "running";

  function handleRun() {
    if (isRunning) {
      stopRun(run!.taskId);
    } else {
      startRun(script.id, {
        script: script.script,
        cwd: script.cwd,
        env: script.env,
        shell: script.shell,
      });
    }
  }

  function handleEdit() {
    setEditingId(script.id);
    setShowDetail(false);
  }

  function handleDelete() {
    if (!confirm(`确认删除脚本「${script.name}」？此操作不可撤销。`)) return;
    removeScript(script.id);
    setShowDetail(false);
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setShowDetail(false);
      }}
    >
      <DrawerContent className="max-h-[80vh] overflow-y-auto">
        <DrawerHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <DrawerTitle className="font-serif text-lg truncate">
                {script.name}
              </DrawerTitle>
              {script.description && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                  {script.description}
                </p>
              )}
            </div>
            <DrawerClose asChild>
              <button
                type="button"
                className="ml-2 mt-0.5 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="关闭"
              >
                ✕
              </button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-4">
          {/* 元信息卡 */}
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {script.cwd && (
              <span className="flex items-center gap-1">
                <span className="opacity-60">目录</span>
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                  {script.cwd}
                </code>
              </span>
            )}
            {script.shell && (
              <Badge variant="outline">{script.shell}</Badge>
            )}
            {script.tags?.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>

          {/* 命令体 */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">命令</p>
            <pre className="bg-muted/60 rounded-md p-3 font-mono text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
              {script.script}
            </pre>
          </div>

          {/* 操作行 */}
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleRun}
              className="min-w-[80px]"
            >
              {isRunning ? "⏹ 中止" : "▶ 运行"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleEdit}>
              ✎ 编辑
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
            >
              🗑 删除
            </Button>
          </div>

          {/* 日志面板 */}
          <LogPane scriptId={script.id} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
