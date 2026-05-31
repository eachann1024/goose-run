/**
 * AI 模块自由问答 / 失败诊断编排。
 * 与智能启动同源：思考、回复全部进 useAiThread（AI 模块），绝不进运行日志。
 *
 * - send(text)：用户在 AI 输入框提问 → 流式回到对话气泡。
 * - diagnose(run)：日志区点「AI 诊断」→ 把这次失败丢给模型，流式回复 + 抽取可一键执行的修复命令。
 * 等待期间先给「思考中…」并把模型实时推理喂进思考行，避免「调用 AI 等好久没反馈」。
 */
import { useCallback, useRef, useState } from "react";
import { useAI } from "@/stores/useAI";
import { useAiThread } from "@/stores/useAiThread";
import { runAIStream } from "@/lib/ai-provider";
import { buildChatMessages } from "@/lib/ai-provider/chat-context";
import { buildDiagnosisMessages, extractFixCommand } from "@/lib/ai-provider/log-context";
import type { RunState, ScriptData } from "@/lib/types";

export function useAiChat(script: ScriptData) {
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);

  // 通用流式：先思考行 → 首个正文出现时收束思考、起一个 ai 气泡 → 持续刷新 → 收尾抽修复命令
  const stream = useCallback(
    async (params: {
      userText: string;
      thinkLabel: string;
      buildMessages: () => ReturnType<typeof buildChatMessages>;
      withFixCommand?: boolean;
    }) => {
      const sid = script.id;
      const t = useAiThread.getState();
      t.push(sid, { role: "user", text: params.userText });
      const thinkId = t.push(sid, { role: "think", text: params.thinkLabel, pending: true });

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      let aiId: number | null = null;
      const ensureBubble = (text: string) => {
        const th = useAiThread.getState();
        if (aiId == null) {
          th.resolveLastThink(sid);
          aiId = th.push(sid, { role: "ai", text, streaming: true });
        } else {
          th.update(sid, aiId, { text });
        }
      };

      try {
        const result = await runAIStream(useAI.getState().getLightSettings(), params.buildMessages(), {
          abortSignal: controller.signal,
          onUpdate: (u) => {
            if (u.text) {
              ensureBubble(u.text);
            } else if (u.reasoningText && aiId == null) {
              const tail = u.reasoningText.replace(/\s+/g, " ").trim().slice(-90);
              if (tail) useAiThread.getState().update(sid, thinkId, { text: "正在思考：" + tail });
            }
          },
        });

        const fix = params.withFixCommand ? extractFixCommand(result) : null;
        const final = result.trim() || "（没有得到回复，请重试）";
        if (aiId == null) {
          useAiThread.getState().resolveLastThink(sid);
          useAiThread.getState().push(sid, { role: "ai", text: final, fixCommand: fix ?? undefined });
        } else {
          useAiThread.getState().update(sid, aiId, { text: final, streaming: false, fixCommand: fix ?? undefined });
        }
      } catch (e) {
        useAiThread.getState().resolveLastThink(sid);
        if ((e as Error).name === "AbortError") {
          useAiThread.getState().push(sid, { role: "think", text: "已取消", pending: false });
        } else {
          useAiThread.getState().push(sid, {
            role: "ai",
            text: "出错了：" + (e instanceof Error ? e.message : String(e)),
          });
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [script],
  );

  const send = useCallback(
    (text: string, run: RunState | null) =>
      stream({
        userText: text,
        thinkLabel: "思考中…",
        buildMessages: () => buildChatMessages(script, run, useAiThread.getState().threads[script.id] ?? [], text),
      }),
    [script, stream],
  );

  const diagnose = useCallback(
    (run: RunState) =>
      stream({
        userText: `诊断这次运行失败${run.exitCode != null ? `（exit ${run.exitCode}）` : ""}`,
        thinkLabel: "读取日志，定位失败根因…",
        buildMessages: () => buildDiagnosisMessages(script, run),
        withFixCommand: true,
      }),
    [script, stream],
  );

  const abort = useCallback(() => abortRef.current?.abort(), []);

  return { send, diagnose, abort, busy };
}
