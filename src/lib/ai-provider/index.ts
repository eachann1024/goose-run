export type {
  AIModelOption,
  AISettings,
  AIMessage,
  AITool,
  AIToolCall,
  AIStreamPhase,
  AIStreamUpdate,
} from "./types";

import type { AIModelOption, AISettings, AIMessage, AITool, AIToolCall, AIStreamPhase, AIStreamUpdate } from "./types";
import { handleOpenAIStream } from "./providers/openai";

const MAX_TOOL_ROUNDS = 6;

export async function fetchModels(baseURL: string, apiKey: string): Promise<AIModelOption[]> {
  const url = `${baseURL.replace(/\/+$/, "")}/models`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "x-api-key": apiKey,
    },
  });
  if (!res.ok) {
    let msg = "";
    try {
      const p = await res.json();
      msg = p?.error?.message || p?.error || p?.message || "";
    } catch {}
    throw new Error(msg || `获取模型列表失败 (${res.status})`);
  }
  const payload = await res.json();
  const raw: unknown[] = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const m = item as Record<string, unknown>;
      const id = typeof m.id === "string" ? m.id.trim() : "";
      if (!id) return null;
      const label =
        (typeof m.display_name === "string" && m.display_name.trim()) ||
        (typeof m.name === "string" && m.name.trim()) ||
        id;
      return { id, label: label.trim() };
    })
    .filter((x): x is AIModelOption => x !== null);
}

export function getAIAvailability(settings: AISettings) {
  if (!settings.enabled) {
    return { ok: false as const, reason: "AI 尚未启用" };
  }
  if (!settings.apiKey.trim()) {
    return { ok: false as const, reason: "请先配置 API Key" };
  }
  if (!settings.model.trim()) {
    return { ok: false as const, reason: "请先填写模型名称" };
  }
  return { ok: true as const };
}

export async function runAIStream(
  settings: AISettings,
  messages: AIMessage[],
  options: {
    onUpdate?: (update: AIStreamUpdate) => void;
    abortSignal?: AbortSignal;
    tools?: AITool[];
    executeTool?: (call: AIToolCall) => string | Promise<string>;
  } = {},
) {
  const availability = getAIAvailability(settings);
  if (!availability.ok) throw new Error(availability.reason);

  const abortController = new AbortController();
  const signal = options.abortSignal ?? abortController.signal;

  let currentPhase: AIStreamPhase = "connecting";
  let contentText = "";
  let reasoningText = "";

  const emit = (_phaseMatch: string, contentUpdate: string, isReasoning: boolean) => {
    if (currentPhase === "connecting" || (isReasoning && currentPhase !== "thinking")) {
      currentPhase = isReasoning ? "thinking" : "generating";
    }
    if (!isReasoning && contentUpdate) {
      currentPhase = "generating";
    }
    if (isReasoning) {
      reasoningText += contentUpdate;
    } else {
      contentText += contentUpdate;
    }
    options.onUpdate?.({ phase: currentPhase, text: contentText, reasoningText });
  };

  options.onUpdate?.({ phase: "connecting", text: "", reasoningText: "" });

  // 保留 system/user/assistant/tool 消息：assistant 的 tool_calls 消息 content 可为空，不能被剔除
  const working: AIMessage[] = messages.filter(
    (m) => (typeof m.content === "string" && m.content.trim() !== "") || (m.tool_calls && m.tool_calls.length),
  );

  try {
    for (let round = 0; ; round++) {
      const result = await handleOpenAIStream(settings, working, signal, emit, options.tools);

      // 模型请求调用工具 —— 本地执行后把结果回传，继续下一轮
      if (result.toolCalls.length && options.executeTool && round < MAX_TOOL_ROUNDS) {
        working.push({ role: "assistant", content: result.text || "", tool_calls: result.toolCalls });
        for (const call of result.toolCalls) {
          let output: string;
          try {
            output = await options.executeTool(call);
          } catch (e) {
            output = `工具执行失败: ${e instanceof Error ? e.message : String(e)}`;
          }
          working.push({ role: "tool", tool_call_id: call.id, content: output });
        }
        continue;
      }

      options.onUpdate?.({ phase: "finishing", text: result.text, reasoningText: result.reasoningText });
      return result.text;
    }
  } catch (err: unknown) {
    if (signal.aborted) {
      throw new DOMException("The operation was aborted", "AbortError");
    }
    throw err;
  }
}
