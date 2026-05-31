import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Copy, FilePlus2, Check, RotateCw } from "lucide-react";
import { useAI } from "@/stores/useAI";
import { useScripts } from "@/stores/useScripts";
import { runAIStream } from "@/lib/ai-provider";
import { buildDiagnosisMessages, extractFixCommand } from "@/lib/ai-provider/log-context";
import type { ScriptData, RunState } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AiTabProps {
  script: ScriptData;
  run: RunState | null;
  /** 外部触发诊断的信号：每次自增触发一次自动诊断（来自日志区「AI 诊断」按钮） */
  triggerNonce: number;
}

type Phase = "idle" | "streaming" | "done" | "error";

export function AiTab({ script, run, triggerNonce }: AiTabProps) {
  const setEditingId = useScripts((s) => s.setEditingId);
  const enabled = useAI((s) => s.enabled);
  const apiKey = useAI((s) => s.apiKey);
  const model = useAI((s) => s.model);
  const aiAvailable = enabled && apiKey.trim() !== "" && model.trim() !== "";

  const [phase, setPhase] = useState<Phase>("idle");
  const [streamText, setStreamText] = useState("");
  const [fixCommand, setFixCommand] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasLog = (run?.lines.filter((l) => l.stream !== "system").length ?? 0) > 0;

  const diagnose = useCallback(async () => {
    if (!run || !hasLog) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("streaming");
    setStreamText("");
    setFixCommand(null);
    setError("");
    setCopied(false);

    try {
      const result = await runAIStream(
        useAI.getState().getLightSettings(),
        buildDiagnosisMessages(script, run),
        {
          abortSignal: controller.signal,
          onUpdate: (u) => { if (u.text) setStreamText(u.text); },
        },
      );
      setStreamText(result);
      setFixCommand(extractFixCommand(result));
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") { setPhase("idle"); return; }
      setError(e instanceof Error ? e.message : "诊断失败");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }, [script, run, hasLog]);

  // 外部触发（日志区「AI 诊断」）：nonce 变化即诊断一次
  useEffect(() => {
    if (triggerNonce > 0 && aiAvailable && hasLog) {
      diagnose();
    }
    // 仅在 nonce 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNonce]);

  // 切换脚本时复位
  useEffect(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setStreamText("");
    setFixCommand(null);
    setError("");
  }, [script.id]);

  function handleCopy() {
    if (!fixCommand) return;
    navigator.clipboard.writeText(fixCommand);
    setCopied(true);
    toast.success("修复命令已复制");
    setTimeout(() => setCopied(false), 1500);
  }

  // 接受≠执行：把修复命令填入「新建脚本」表单，由用户确认后再运行
  function handleFillNew() {
    if (!fixCommand) return;
    setEditingId("new");
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("goose-run:prefill-script", {
        detail: {
          name: `修复 · ${script.name}`,
          script: fixCommand,
          shell: script.shell,
          cwd: script.cwd,
          filePath: "",
        },
      }));
    }, 100);
  }

  if (!aiAvailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-fg-muted">
          <Sparkles size={24} strokeWidth={1.5} />
        </div>
        <p className="text-sm text-fg-muted">AI 尚未配置</p>
        <p className="max-w-[280px] text-xs text-fg-faint">
          在设置里启用 AI 并填写 API Key、模型后，即可在这里诊断运行失败、解释日志。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {/* 顶部操作行 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm text-fg">
          <Sparkles size={15} strokeWidth={1.75} className="text-accent" />
          日志诊断
        </div>
        {hasLog && (phase === "idle" || phase === "done" || phase === "error") && (
          <Button variant="outline" size="sm" onClick={diagnose} className="gap-1.5">
            {phase === "done" || phase === "error" ? (
              <><RotateCw size={14} strokeWidth={1.75} /> 重新诊断</>
            ) : (
              <><Sparkles size={14} strokeWidth={1.75} /> 诊断这次运行{run?.exitCode != null ? `（exit ${run.exitCode}）` : ""}</>
            )}
          </Button>
        )}
      </div>

      {/* 无日志引导 */}
      {!hasLog && phase === "idle" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-fg-faint">
          <p className="text-sm text-fg-muted">还没有可分析的日志</p>
          <p className="max-w-[300px] text-xs">
            先在「概览」或「日志」里运行脚本；运行失败时这里会自动诊断根因并给出修复命令。
          </p>
          <p className="max-w-[300px] text-xs">也可以把脚本文件拖到窗口右半屏，让 AI 解析生成新脚本。</p>
        </div>
      )}

      {/* 流式中 */}
      {phase === "streaming" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <Loader2 size={14} strokeWidth={1.75} className="animate-spin" /> AI 正在诊断…
          </div>
          {streamText && (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
              {streamText}
            </pre>
          )}
          <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>取消</Button>
        </div>
      )}

      {/* 错误 */}
      {phase === "error" && (
        <div className="space-y-2">
          <p className="text-xs text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={diagnose}>重试</Button>
        </div>
      )}

      {/* 完成：诊断正文 + 修复命令（copy-to-run） */}
      {phase === "done" && (
        <div className="space-y-3">
          {streamText && (
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-surface p-3 font-mono text-xs leading-relaxed">
              {streamText}
            </pre>
          )}
          {fixCommand && (
            <div className="space-y-2 rounded-md border border-accent/40 bg-accent-subtle p-3">
              <p className="text-[11px] font-medium text-accent">建议的修复命令（接受后由你确认运行，不会自动执行）</p>
              <code className="block break-words rounded bg-bg/60 px-2 py-1.5 font-mono text-xs text-fg">
                {fixCommand}
              </code>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
                  {copied ? <><Check size={13} strokeWidth={2} /> 已复制</> : <><Copy size={13} strokeWidth={1.75} /> 复制命令</>}
                </Button>
                <Button variant="outline" size="sm" onClick={handleFillNew} className="gap-1.5">
                  <FilePlus2 size={13} strokeWidth={1.75} /> 填入新脚本
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
