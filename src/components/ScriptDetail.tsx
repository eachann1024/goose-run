import { useEffect, useState } from "react";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { useAI } from "@/stores/useAI";
import { usePlatform } from "@/platform/context";
import { runAIStream } from "@/lib/ai-provider";
import { lsofProbe } from "@/lib/port-detect";
import type { ScriptData } from "@/lib/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogPane } from "@/components/LogPane";
import { cn } from "@/lib/utils";
import { X, Play, Square, Pencil, Trash2, Globe, Sparkles, Loader2, Check } from "lucide-react";

interface ScriptDetailProps {
  script: ScriptData;
}

export function ScriptDetail({ script }: ScriptDetailProps) {
  const showDetail = useScripts((s) => s.showDetail);
  const selectedId = useScripts((s) => s.selectedId);
  const setShowDetail = useScripts((s) => s.setShowDetail);
  const setEditingId = useScripts((s) => s.setEditingId);
  const removeScript = useScripts((s) => s.removeScript);

  const requestRun = useRuns((s) => s.requestRun);
  const stopRun = useRuns((s) => s.stopRun);
  const probeScript = useRuns((s) => s.probeScript);
  const setDetectedPort = useRuns((s) => s.setDetectedPort);
  const run = useRuns((s) => s.getRunByScript(script.id));
  const probedRunning = useRuns((s) => s.probedRunning[script.id] === true);

  const platform = usePlatform();
  const aiEnabled = useAI((s) => s.enabled);
  const aiApiKey = useAI((s) => s.apiKey);
  const aiModel = useAI((s) => s.model);
  const aiAvailable = aiEnabled && aiApiKey.trim() !== "" && aiModel.trim() !== "";
  const [portDetecting, setPortDetecting] = useState(false);
  // 端口 lsof 复核：null=未核 / true=确认在监听 / false=未监听
  const [portConfirmed, setPortConfirmed] = useState<boolean | null>(null);

  const isOpen = showDetail && selectedId === script.id;
  const pluginRunning = run?.status === "running";
  // 探测命令判定在运行，但本插件没有对应进程 → 是外部（终端等）启动的
  const externalRunning = probedRunning && !pluginRunning;
  // 有运行记录（日志/运行中）→ 面板撑到 80vh 让日志填满；空闲无日志 → 收缩，不留白
  const hasOutput = run != null;
  // 端口：脚本手填优先，其次运行后从日志自动识别
  const port = script.port ?? run?.detectedPort ?? null;
  // AI 兜底前提：AI 可用、当前无端口、且已有日志可分析
  const canAiDetect = aiAvailable && port == null && (run?.lines.length ?? 0) > 0;

  // 端口变化或换脚本时清掉上次复核结果
  useEffect(() => {
    setPortConfirmed(null);
  }, [script.id, port]);

  // 打开面板时探测真实运行状态，并每 3s 轮询刷新（仅在有探测命令时）
  useEffect(() => {
    if (!isOpen || !script.probeCommand?.trim()) return;
    probeScript(script.id, script.probeCommand);
    const timer = setInterval(() => {
      probeScript(script.id, script.probeCommand);
    }, 3000);
    return () => clearInterval(timer);
  }, [isOpen, script.id, script.probeCommand, probeScript]);

  function handleRun() {
    if (pluginRunning) {
      stopRun(run!.taskId);
    } else if (externalRunning) {
      // 外部启动的进程，本插件没有句柄，无法中止
      return;
    } else {
      // 统一入口：危险确认 + 参数填值 + 登录 shell 都在 requestRun 内处理
      requestRun(script);
    }
  }

  // lsof 复核：用已知端口确认该端口此刻真在监听（语义正确，不污染全机端口）
  async function handleVerifyPort() {
    if (port == null) return;
    setPortConfirmed(null);
    const ok = (await platform.probeRunning?.(lsofProbe(port))) ?? false;
    setPortConfirmed(ok);
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

  function handleOpenPort() {
    if (port == null) return;
    platform.openExternal?.(`http://localhost:${port}`);
  }

  // AI 兜底：把运行日志交给 AI，识别服务监听端口并回填
  async function handleAiDetectPort() {
    if (!run || portDetecting) return;
    const logText = run.lines
      .filter((l) => l.stream !== "system")
      .map((l) => l.text)
      .join("\n")
      .slice(-4000);
    if (!logText.trim()) {
      platform.showNotification("暂无日志可供分析");
      return;
    }
    setPortDetecting(true);
    try {
      const result = await runAIStream(useAI.getState().getSettings(), [
        {
          role: "system",
          content:
            "你是端口识别助手。用户会给你一段服务运行日志，请找出该服务正在监听的端口号。只返回一个纯数字端口（如 3000）；若日志中没有任何监听端口，只返回 none。不要任何解释或多余文字。",
        },
        { role: "user", content: logText },
      ]);
      const m = result.match(/\b(\d{2,5})\b/);
      const p = m ? Number(m[1]) : null;
      if (p != null && p >= 1 && p <= 65535) {
        setDetectedPort(run.taskId, p);
      } else {
        platform.showNotification("AI 未能从日志识别出端口");
      }
    } catch (e) {
      platform.showNotification("AI 识别端口失败：" + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPortDetecting(false);
    }
  }

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setShowDetail(false);
      }}
    >
      <DrawerContent className={hasOutput ? "h-[80vh]" : undefined}>
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
                <X size={16} strokeWidth={1.75} />
              </button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <DrawerBody className={cn("space-y-4", hasOutput && "flex flex-col overflow-hidden")}>
          {/* 元信息卡 */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
            {/* 端口徽标：点击在浏览器打开 localhost:端口 */}
            {port != null && (
              <button
                type="button"
                onClick={handleOpenPort}
                title={`在浏览器打开 http://localhost:${port}`}
                className="inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent-subtle px-1.5 py-0.5 font-mono text-accent transition-colors hover:border-accent hover:bg-accent/15"
              >
                <Globe size={12} strokeWidth={1.75} />
                :{port}
                {script.port == null && run?.detectedPort != null && (
                  <span className="text-[10px] font-sans text-fg-faint">自动</span>
                )}
              </button>
            )}
            {/* lsof 复核：确认该端口此刻是否真在监听 */}
            {port != null && (
              <button
                type="button"
                onClick={handleVerifyPort}
                title="lsof 复核该端口是否真在监听"
                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 transition-colors hover:text-foreground hover:bg-muted"
              >
                {portConfirmed === true ? (
                  <><Check size={12} strokeWidth={2} className="text-green-500" /> 已确认</>
                ) : portConfirmed === false ? (
                  <span className="text-fg-muted">未监听</span>
                ) : (
                  "复核"
                )}
              </button>
            )}
            {/* AI 兜底：无端口但有日志时，手动触发 AI 识别 */}
            {canAiDetect && (
              <button
                type="button"
                onClick={handleAiDetectPort}
                disabled={portDetecting}
                className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 transition-colors hover:text-foreground hover:bg-muted disabled:opacity-50"
              >
                {portDetecting ? (
                  <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
                ) : (
                  <Sparkles size={12} strokeWidth={1.75} />
                )}
                {portDetecting ? "识别中" : "AI 识别端口"}
              </button>
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
              disabled={externalRunning}
              className="min-w-[80px] gap-1.5"
            >
              {pluginRunning ? (
                <><Square size={14} strokeWidth={1.75} /> 中止</>
              ) : externalRunning ? (
                <><Play size={14} strokeWidth={1.75} /> 运行中</>
              ) : (
                <><Play size={14} strokeWidth={1.75} /> 运行</>
              )}
            </Button>
            {externalRunning && (
              <span className="text-xs text-muted-foreground">外部启动，无法在此中止</span>
            )}
            <Button variant="outline" size="sm" onClick={handleEdit} className="gap-1.5">
              <Pencil size={14} strokeWidth={1.75} /> 编辑
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 size={14} strokeWidth={1.75} /> 删除
            </Button>
          </div>

          {/* 日志面板 */}
          <LogPane scriptId={script.id} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
