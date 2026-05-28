import { useState } from "react";
import { ArrowLeft, Play, Square, Pencil, Trash2 } from "lucide-react";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import type { ScriptData } from "@/lib/types";
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

  const [confirmingRun, setConfirmingRun] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleRun() {
    if (isRunning) {
      stopRun(run!.taskId);
      return;
    }
    if (script.confirmBeforeRun && !confirmingRun) {
      setConfirmingRun(true);
      return;
    }
    setConfirmingRun(false);
    startRun(script.id, {
      script: script.script,
      cwd: script.cwd,
      env: script.env,
      shell: script.shell,
    });
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    removeScript(script.id);
    setShowDetail(false);
  }

  function handleEdit() {
    setEditingId(script.id);
    setShowDetail(false);
  }

  function handleClose() {
    setShowDetail(false);
    setConfirmingRun(false);
    setConfirmingDelete(false);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col slide-in">
      {/* 顶栏 */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={handleClose}
          className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
          aria-label="返回"
        >
          <ArrowLeft size={17} strokeWidth={1.75} />
        </button>
        <h2 className="text-base font-medium truncate flex-1 min-w-0">
          {script.name}
        </h2>
      </header>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {script.description && (
          <p className="text-sm text-fg-muted">{script.description}</p>
        )}

        {/* 元信息 */}
        <div className="flex flex-wrap gap-2 text-xs text-fg-muted">
          {script.cwd && (
            <span className="flex items-center gap-1">
              <span className="opacity-60">目录</span>
              <code className="rounded bg-surface px-1.5 py-0.5 font-mono">
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
          <p className="text-xs font-medium text-fg-muted">命令</p>
          <pre className="bg-surface rounded-md p-3 font-mono text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
            {script.script}
          </pre>
        </div>

        {/* 运行前确认 */}
        {confirmingRun && (
          <div className="rounded-cell border border-accent/30 bg-accent-subtle px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-fg">确认运行「{script.name}」？此脚本标记为危险操作。</span>
            <div className="flex gap-2 shrink-0 ml-3">
              <Button size="sm" variant="default" onClick={handleRun}>
                确认运行
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingRun(false)}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* 删除确认 */}
        {confirmingDelete && (
          <div className="rounded-cell border border-timer-low/20 bg-timer-low/5 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-fg">确认删除「{script.name}」？此操作不可撤销。</span>
            <div className="flex gap-2 shrink-0 ml-3">
              <Button
                size="sm"
                variant="default"
                onClick={handleDelete}
                className="bg-timer-low hover:bg-timer-low/90 text-white"
              >
                确认删除
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* 操作行 */}
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={handleRun}
            className="min-w-[80px]"
          >
            {isRunning ? (
              <><Square size={14} strokeWidth={1.75} className="mr-1" /> 中止</>
            ) : (
              <><Play size={14} strokeWidth={1.75} className="mr-1" /> 运行</>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil size={14} strokeWidth={1.75} className="mr-1" /> 编辑
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 size={14} strokeWidth={1.75} className="mr-1" /> 删除
          </Button>
        </div>

        {/* 日志面板 */}
        <LogPane scriptId={script.id} />
      </div>
    </div>
  );
}
