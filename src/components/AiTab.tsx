import { useEffect, useRef, useState } from "react";
import { Sparkles, Loader2, Check, ArrowUp, Copy, FilePlus2, Play } from "lucide-react";
import { useAI } from "@/stores/useAI";
import { useAiThread } from "@/stores/useAiThread";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { useSettings } from "@/stores/useSettings";
import { useAiChat } from "@/hooks/use-ai-chat";
import type { AiMessage, RunState, ScriptData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AiTabProps {
  script: ScriptData;
  run: RunState | null;
  /** 外部触发诊断的信号：每次自增触发一次失败诊断（来自日志区「AI 诊断」按钮） */
  triggerNonce: number;
}

const EMPTY: AiMessage[] = [];

/**
 * AI 回复正文安全高亮：把 `code`、#sh-终端会话号、:端口 渲染成对应样式。
 * 纯文本切片渲染（非 HTML 注入），可安全用于模型输出。
 */
function AiText({ text }: { text: string }) {
  // 先按行内反引号代码切分
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
          return (
            <code
              key={i}
              className="rounded bg-surface-hover px-1.5 py-px font-mono text-[12px] text-fg"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        // 非代码片段里再高亮终端会话号与端口
        const sub = part.split(/(#sh-[0-9a-z]+|(?<![\d.]):\d{2,5}\b)/gi);
        return sub.map((s, j) => {
          if (/^#sh-[0-9a-z]+$/i.test(s)) {
            return (
              <span
                key={`${i}-${j}`}
                className="rounded bg-ai-subtle px-1.5 py-px font-mono text-[12px] text-ai"
              >
                {s}
              </span>
            );
          }
          if (/^:\d{2,5}$/.test(s)) {
            return (
              <span
                key={`${i}-${j}`}
                className="rounded bg-accent-subtle px-1 py-px font-mono text-[12px] text-accent"
              >
                {s}
              </span>
            );
          }
          return <span key={`${i}-${j}`}>{s}</span>;
        });
      })}
    </>
  );
}

function ThinkRow({ m }: { m: AiMessage }) {
  return (
    <div
      className={cn(
        "flex items-start gap-1.5 pl-0.5 text-[12.5px] leading-relaxed",
        m.pending ? "text-ai italic" : "text-fg-faint",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {m.pending ? (
          <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <Check size={12} strokeWidth={1.75} className="opacity-70" />
        )}
      </span>
      <span className="min-w-0 break-words">{m.text}</span>
    </div>
  );
}

function FixCommand({ script, command }: { script: ScriptData; command: string }) {
  const setEditingId = useScripts((s) => s.setEditingId);
  const startRun = useRuns((s) => s.startRun);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success("修复命令已复制");
    setTimeout(() => setCopied(false), 1500);
  }

  // 你同意后直接执行：confirm 二次确认 → 真实跑这条命令，输出进「日志」标签（运行态上升沿自动切过去）
  async function handleRun() {
    if (!confirm(`确认运行此修复命令？将在「${script.name}」的环境下真实执行：\n\n${command}`)) return;
    const login = useSettings.getState().loginShell !== false;
    const taskId = await startRun(script.id, {
      script: command,
      cwd: script.cwd,
      env: script.env,
      shell: script.shell,
      login,
    });
    if (taskId) toast.success("已运行修复命令，输出进入「日志」");
    else toast.error("启动失败：该脚本可能已在运行");
  }

  // 接受≠执行：把修复命令填入「新建脚本」表单，由用户确认后再运行
  function handleFillNew() {
    setEditingId("new");
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("goose-run:prefill-script", {
          detail: {
            name: `修复 · ${script.name}`,
            script: command,
            shell: script.shell,
            cwd: script.cwd,
            filePath: "",
          },
        }),
      );
    }, 100);
  }

  return (
    <div className="mt-2 space-y-2 rounded-md border border-accent/40 bg-accent-subtle p-2.5">
      <p className="text-[11px] font-medium text-accent">建议的修复命令（接受后由你确认运行，不会自动执行）</p>
      <code className="block break-words rounded bg-bg/60 px-2 py-1.5 font-mono text-[12px] text-fg">
        {command}
      </code>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleRun}
          className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90"
        >
          <Play size={12} strokeWidth={2} /> 运行命令
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
          {copied ? "已复制" : "复制命令"}
        </button>
        <button
          type="button"
          onClick={handleFillNew}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <FilePlus2 size={12} strokeWidth={1.75} /> 填入新脚本
        </button>
      </div>
    </div>
  );
}

function MessageRow({ m, script }: { m: AiMessage; script: ScriptData }) {
  if (m.role === "think") return <ThinkRow m={m} />;

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-[13px_13px_4px_13px] bg-accent-subtle px-3 py-2 text-[13.5px] leading-relaxed text-fg">
          {m.text}
        </div>
      </div>
    );
  }

  // ai
  return (
    <div className="flex gap-2.5 text-[13.5px] leading-relaxed">
      <span className="mt-0.5 grid size-[23px] shrink-0 place-items-center rounded-[7px] bg-ai-subtle text-ai">
        <Sparkles size={13} strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 pt-px text-fg">
        <span className="whitespace-pre-wrap break-words">
          <AiText text={m.text} />
          {m.streaming && <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-ai align-middle" />}
        </span>
        {m.fixCommand && <FixCommand script={script} command={m.fixCommand} />}
      </div>
    </div>
  );
}

export function AiTab({ script, run, triggerNonce }: AiTabProps) {
  const enabled = useAI((s) => s.enabled);
  const apiKey = useAI((s) => s.apiKey);
  const model = useAI((s) => s.model);
  const aiAvailable = enabled && apiKey.trim() !== "" && model.trim() !== "";

  const messages = useAiThread((s) => s.threads[script.id]) ?? EMPTY;
  const { send, diagnose, busy } = useAiChat(script);

  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新消息 / 流式刷新时滚到底
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 日志区「AI 诊断」：nonce 变化即把这次失败丢给模型诊断一次
  useEffect(() => {
    if (triggerNonce > 0 && aiAvailable && run && run.status === "failed") {
      diagnose(run);
    }
    // 仅在 nonce 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerNonce]);

  function handleSend() {
    const t = draft.trim();
    if (!t || busy) return;
    send(t, run);
    setDraft("");
  }

  if (!aiAvailable) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Sparkles size={36} strokeWidth={1.5} className="text-ai opacity-60" />
        <p className="max-w-[280px] text-sm leading-relaxed text-fg-muted">
          在设置里开启 <b className="text-ai">AI+</b>，即可让启动管家智能启动脚本、排查失败、识别端口。
        </p>
      </div>
    );
  }

  return (
    <div className="selectable flex h-full min-h-0 flex-col">
      {/* AI 内容流：思考 / 用户 / 管家回复，全部留在这里，不进日志 */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-0.5 pb-3.5">
        {messages.length === 0 ? (
          <div className="m-auto flex max-w-[290px] flex-col items-center gap-2.5 px-6 text-center text-[13px] leading-relaxed text-fg-muted">
            <Sparkles size={30} strokeWidth={1.5} className="text-ai" />
            <span>
              长按「运行」让 <b className="text-ai">启动管家</b> 接管，或直接在下面问我关于「{script.name}」的任何问题。AI
              的思考与回复都只出现在这里，不会混进日志。
            </span>
          </div>
        ) : (
          messages.map((m) => <MessageRow key={m.id} m={m} script={script} />)
        )}
      </div>

      {/* AI 输入框：钉在最底部（图 2） */}
      <div className="flex shrink-0 items-end gap-2 border-t border-border pt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          placeholder="问问启动管家…（Enter 发送）"
          className="max-h-[120px] min-h-[42px] flex-1 resize-none rounded-md border border-border bg-input px-3 py-2.5 text-[13.5px] leading-snug text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-ai"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim() || busy}
          aria-label="发送"
          className="grid size-[42px] shrink-0 place-items-center rounded-md bg-ai text-white transition-opacity disabled:cursor-default disabled:opacity-40"
        >
          {busy ? <Loader2 size={18} strokeWidth={2} className="animate-spin" /> : <ArrowUp size={18} strokeWidth={2} />}
        </button>
      </div>
    </div>
  );
}
