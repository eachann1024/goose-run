import { useEffect, useState } from "react";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { useAI } from "@/stores/useAI";
import { usePlatform } from "@/platform/context";
import { runAIStream } from "@/lib/ai-provider";
import { lsofProbe } from "@/lib/port-detect";
import type { ScriptData } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogPane } from "@/components/LogPane";
import { X, Play, Square, RotateCw, Pencil, Trash2, Globe, Sparkles, Loader2, Check } from "lucide-react";

interface ScriptDetailProps {
  script: ScriptData;
}

export function ScriptDetail({ script }: ScriptDetailProps) {
  const setSelectedId = useScripts((s) => s.setSelectedId);
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
  // 外部进程停止/重启进行中（按钮转圈、防重复点）
  const [externalBusy, setExternalBusy] = useState<null | "stop" | "restart">(null);

  const pluginRunning = run?.status === "running";
  // 探测命令判定在运行，但本插件没有对应进程 → 是外部（终端等）启动的
  const externalRunning = probedRunning && !pluginRunning;
  // 端口：脚本手填优先，其次运行后从日志自动识别
  const port = script.port ?? run?.detectedPort ?? null;
  // AI 兜底前提：AI 可用、当前无端口、且已有日志可分析
  const canAiDetect = aiAvailable && port == null && (run?.lines.length ?? 0) > 0;

  // 端口变化或换脚本时清掉上次复核结果
  useEffect(() => {
    setPortConfirmed(null);
  }, [script.id, port]);

  // 选中渲染期间探测真实运行状态，并每 3s 轮询刷新（仅在有探测命令时）
  useEffect(() => {
    if (!script.probeCommand?.trim()) return;
    probeScript(script.id, script.probeCommand);
    const timer = setInterval(() => {
      probeScript(script.id, script.probeCommand);
    }, 3000);
    return () => clearInterval(timer);
  }, [script.id, script.probeCommand, probeScript]);

  function handleRun() {
    if (pluginRunning) {
      stopRun(run!.taskId);
    } else {
      // 统一入口：危险确认 + 参数填值 + 登录 shell 都在 requestRun 内处理
      requestRun(script);
    }
  }

  // 外部进程没有任务句柄，只能按 LISTEN 端口杀；杀完立即复核真实状态，不等 3s 轮询
  async function killExternal(): Promise<boolean> {
    if (port == null) return false;
    const ok = (await platform.killPort?.(port)) ?? false;
    if (script.probeCommand?.trim()) await probeScript(script.id, script.probeCommand);
    return ok;
  }

  async function handleStopExternal() {
    if (port == null || externalBusy) return;
    setExternalBusy("stop");
    try {
      const ok = await killExternal();
      if (!ok) platform.showNotification(`未能结束 :${port} 上的进程`);
    } finally {
      setExternalBusy(null);
    }
  }

  async function handleRestartExternal() {
    if (port == null || externalBusy) return;
    setExternalBusy("restart");
    try {
      await killExternal();
      // 端口让出后按本插件命令重新拉起，之后走统一入口（危险确认/参数/登录 shell）
      requestRun(script);
    } finally {
      setExternalBusy(null);
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
  }

  function handleClose() {
    setSelectedId(null);
  }

  function handleDelete() {
    if (!confirm(`确认删除脚本「${script.name}」？此操作不可撤销。`)) return;
    removeScript(script.id);
    setSelectedId(null);
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
    <div className="flex h-full flex-col">
      {/* 头部：脚本名 + 描述 + 收起 */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-lg text-fg">{script.name}</h2>
          {script.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-fg-muted">
              {script.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="mt-0.5 shrink-0 rounded p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="收起详情"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* 主体：元信息 → 命令 → 操作 → 日志铺满 */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
          {/* 元信息卡 */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {script.cwd && (
              <span className="flex min-w-0 max-w-full items-center gap-1">
                <span className="shrink-0 opacity-60">目录</span>
                <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 font-mono">
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

          {/* 操作行：主控区靠左、编辑/删除靠右分组 */}
          <div className="flex items-center gap-2">
            {externalRunning ? (
              // 外部启动：保留标识 + 停止（左）/ 重启（右）。无端口则无法定位进程，置灰。
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent-subtle px-2 py-1 text-xs font-medium text-accent"
                  title="该服务由本插件之外（如终端）启动"
                >
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-accent" />
                  </span>
                  外部启动
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStopExternal}
                  disabled={port == null || externalBusy != null}
                  className="gap-1.5 text-destructive hover:text-destructive"
                  title={port == null ? "未知端口，无法定位外部进程" : `结束监听 :${port} 的进程`}
                >
                  {externalBusy === "stop" ? (
                    <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  ) : (
                    <Square size={14} strokeWidth={1.75} />
                  )}
                  停止
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleRestartExternal}
                  disabled={port == null || externalBusy != null}
                  className="gap-1.5"
                  title={port == null ? "未知端口，无法定位外部进程" : `结束 :${port} 后按本脚本重新拉起`}
                >
                  {externalBusy === "restart" ? (
                    <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                  ) : (
                    <RotateCw size={14} strokeWidth={1.75} />
                  )}
                  重启
                </Button>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={handleRun}
                className="min-w-[80px] gap-1.5"
              >
                {pluginRunning ? (
                  <><Square size={14} strokeWidth={1.75} /> 中止</>
                ) : (
                  <><Play size={14} strokeWidth={1.75} /> 运行</>
                )}
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
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
          </div>

          {/* 日志面板 */}
          <LogPane scriptId={script.id} />
      </div>
    </div>
  );
}
