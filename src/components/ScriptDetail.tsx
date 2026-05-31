import { useEffect, useRef, useState } from "react";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { useAI } from "@/stores/useAI";
import { usePlatform } from "@/platform/context";
import { runAIStream } from "@/lib/ai-provider";
import { useAiLaunch } from "@/hooks/use-ai-launch";
import { useLongPress } from "@/hooks/use-long-press";
import { lsofProbe } from "@/lib/port-detect";
import type { ScriptData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogPane } from "@/components/LogPane";
import { AiTab } from "@/components/AiTab";
import { ChargeFill, chargeGlow } from "@/components/ChargeFill";
import { X, Play, Square, RotateCw, Pencil, Trash2, Globe, Sparkles, Loader2, Check, ChevronRight } from "lucide-react";

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

  // Tab 工作台：概览 / 日志 / AI
  const [activeTab, setActiveTab] = useState<"overview" | "log" | "ai">("overview");
  // 日志区「AI 诊断」触发信号：自增一次 → AiTab 自动诊断一次
  const [explainNonce, setExplainNonce] = useState(0);

  const pluginRunning = run?.status === "running";
  // 探测命令判定在运行，但本插件没有对应进程 → 是外部（终端等）启动的
  const externalRunning = probedRunning && !pluginRunning;
  // 端口：脚本手填优先，其次运行后从日志自动识别
  const port = script.port ?? run?.detectedPort ?? null;
  // AI 兜底前提：AI 可用、当前无端口、且已有日志可分析
  const canAiDetect = aiAvailable && port == null && (run?.lines.length ?? 0) > 0;
  // 日志可诊断：运行失败 + AI 可用
  const canExplain = aiAvailable && run?.status === "failed";

  // 端口变化或换脚本时清掉上次复核结果
  useEffect(() => {
    setPortConfirmed(null);
  }, [script.id, port]);

  // 运行态上升沿：脚本一旦开始运行就自动切 tab——AI 智能启动看「AI」(思考/终端会话)，普通运行看「日志」
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (pluginRunning && !prevRunningRef.current) {
      setActiveTab(run?.kind === "ai" ? "ai" : "log");
    }
    prevRunningRef.current = pluginRunning;
  }, [pluginRunning, run?.kind]);

  // 选中渲染期间探测真实运行状态，并每 3s 轮询刷新（仅在有探测命令时）
  useEffect(() => {
    if (!script.probeCommand?.trim()) return;
    probeScript(script.id, script.probeCommand);
    const timer = setInterval(() => {
      probeScript(script.id, script.probeCommand);
    }, 3000);
    return () => clearInterval(timer);
  }, [script.id, script.probeCommand, probeScript]);

  // AI 智能启动：按住运行按钮 1.5s 触发；切到日志看 AI 一步步排障启动
  const { launch: aiLaunch, abort: aiAbort } = useAiLaunch();

  function handleRun() {
    if (pluginRunning) {
      // 中止：同时取消可能在跑的 AI 启动循环（无则无害）再停掉真实进程
      aiAbort();
      stopRun(run!.taskId);
    } else {
      // 统一入口：危险确认 + 参数填值 + 登录 shell 都在 requestRun 内处理
      requestRun(script);
      // 跑起来就想看输出 → 自动切到日志 Tab（无参数脚本即时生效）
      setActiveTab("log");
    }
  }

  function handleAiLaunch() {
    if (!aiAvailable || pluginRunning) return;
    // AI 智能启动：思考/步骤/终端会话都在 AI 模块呈现，先切到 AI 标签
    setActiveTab("ai");
    aiLaunch(script);
  }
  const longPress = useLongPress({
    onLongPress: handleAiLaunch,
    enabled: aiAvailable && !pluginRunning,
  });

  // 日志区点「AI 诊断」：切到 AI tab 并触发一次诊断
  function handleExplain() {
    setActiveTab("ai");
    setExplainNonce((n) => n + 1);
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
      setActiveTab("log");
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
      const result = await runAIStream(useAI.getState().getLightSettings(), [
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

  // 最近运行摘要文本
  const runSummary = (() => {
    if (!run) return null;
    const dur = run.endedAt != null ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) + "s" : null;
    if (run.status === "running") return { label: "运行中", tone: "text-blue-500" };
    if (run.status === "success") return { label: `成功 · exit 0${dur ? ` · ${dur}` : ""}`, tone: "text-green-500" };
    if (run.status === "failed") return { label: `失败 · exit ${run.exitCode ?? "?"}${dur ? ` · ${dur}` : ""}`, tone: "text-destructive" };
    if (run.status === "stopped") return { label: `已中止${dur ? ` · ${dur}` : ""}`, tone: "text-yellow-500" };
    return null;
  })();

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

      {/* Tab 工作台（手写 tab，互斥显隐 + 全部保活） */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-4 border-b border-border px-5">
          {([
            { k: "overview", label: "概览" },
            { k: "log", label: "日志" },
            { k: "ai", label: "AI" },
          ] as const).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setActiveTab(t.k)}
              className={cn(
                "relative flex h-9 items-center gap-1 text-sm font-medium transition-colors",
                activeTab === t.k ? "text-fg" : "text-fg-muted hover:text-fg",
              )}
            >
              {t.k === "ai" && <Sparkles size={13} strokeWidth={1.75} />}
              {t.label}
              {t.k === "ai" && canExplain && <span className="ml-0.5 size-1.5 rounded-full bg-accent" />}
              {activeTab === t.k && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>

        {/* 概览 */}
        <div className={activeTab === "overview" ? "min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4" : "hidden"}>
          {/* 元信息 */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {script.cwd && (
              <span className="flex min-w-0 max-w-full items-center gap-1">
                <span className="shrink-0 opacity-60">目录</span>
                <code className="min-w-0 break-all rounded bg-muted px-1.5 py-0.5 font-mono">
                  {script.cwd}
                </code>
              </span>
            )}
            {script.shell && <Badge variant="outline">{script.shell}</Badge>}
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
              <Badge key={tag} variant="secondary">{tag}</Badge>
            ))}
          </div>

          {/* 命令体 */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">命令</p>
            <pre className="bg-muted/60 rounded-md p-3 font-mono text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
              {script.script}
            </pre>
          </div>

          {/* 操作行 */}
          <div className="flex items-start gap-2">
            {externalRunning ? (
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
              <div className="flex flex-col gap-1">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleRun}
                  {...(pluginRunning ? {} : longPress.handlers)}
                  style={chargeGlow(longPress.charging, longPress.progress)}
                  className="relative min-w-[80px] gap-1.5 select-none overflow-hidden"
                  title={pluginRunning ? "中止运行" : aiAvailable ? "点击运行 · 按住 1.5s 让 AI 智能启动" : "点击运行"}
                >
                  {/* 蓄力充能：按住时紫色（AI 身份色）从左铺满，隐喻 AI 接管启动 */}
                  <ChargeFill charging={longPress.charging} progress={longPress.progress} />
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {pluginRunning ? (
                      run?.kind === "ai" ? (
                        <><Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> AI 启动中</>
                      ) : (
                        <><Square size={14} strokeWidth={1.75} /> 中止</>
                      )
                    ) : (
                      <><Play size={14} strokeWidth={1.75} /> 运行</>
                    )}
                  </span>
                </Button>

                {/* 藏在运行按钮下方的一截 AI 图标条：默认低调，按住时显现充能 */}
                {!pluginRunning && (
                  aiAvailable ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] leading-none transition-colors",
                        longPress.charging ? "text-ai" : "text-fg-faint",
                      )}
                    >
                      <Sparkles
                        size={10}
                        strokeWidth={1.75}
                        className={longPress.charging ? "animate-pulse" : ""}
                      />
                      {longPress.charging
                        ? `蓄力 ${Math.round(longPress.progress * 100)}% · 松开取消`
                        : "按住 1.5s · AI 帮你智能启动"}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] leading-none text-fg-faint">
                      <Sparkles size={10} strokeWidth={1.75} /> 开启 AI+ 解锁智能启动
                    </span>
                  )
                )}
              </div>
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

          {/* 最近运行摘要 → 点击切到日志 */}
          {runSummary && (
            <button
              type="button"
              onClick={() => setActiveTab("log")}
              className="flex w-full items-center justify-between rounded-md border border-border bg-surface/50 px-3 py-2 text-xs transition-colors hover:bg-surface"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-fg-muted">最近运行</span>
                <span className={runSummary.tone}>{runSummary.label}</span>
              </span>
              <span className="flex items-center gap-0.5 text-fg-faint">
                查看日志 <ChevronRight size={13} strokeWidth={1.75} />
              </span>
            </button>
          )}
        </div>

        {/* 日志（保活：display 隐藏不卸载，保留虚拟列表与计时） */}
        <div className={activeTab === "log" ? "flex min-h-0 flex-1 flex-col px-5 py-4" : "hidden"}>
          <LogPane scriptId={script.id} canExplain={canExplain} onExplain={handleExplain} />
        </div>

        {/* AI 模块（保活：保留对话线程；思考/回复/终端会话只在这里，不进日志） */}
        <div className={activeTab === "ai" ? "flex min-h-0 flex-1 flex-col px-5 py-4" : "hidden"}>
          <AiTab script={script} run={run} triggerNonce={explainNonce} />
        </div>
      </div>
    </div>
  );
}
