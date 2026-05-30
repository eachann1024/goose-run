import type { AISettings, AIStreamPhase, AIMessage, AITool, AIToolCall } from "../types";
import { readSSELines } from "../stream";

export async function handleOpenAIStream(
  settings: AISettings,
  messages: AIMessage[],
  signal: AbortSignal,
  emit: (phase: AIStreamPhase, text: string, isReasoning: boolean) => void,
  tools?: AITool[],
) {
  const baseURL = (settings.baseURL.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      stream: true,
      ...(tools && tools.length ? { tools } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(errText || `请求失败 (${response.status})`);
  }

  let fullText = "";
  let fullReasoning = "";
  const toolAcc: AIToolCall[] = [];

  for await (const line of readSSELines(response, signal)) {
    if (line === "data: [DONE]") break;
    if (line.startsWith("data: ")) {
      try {
        const json = JSON.parse(line.slice(6));
        const delta = json.choices?.[0]?.delta;
        if (delta) {
          if (delta.reasoning_content) {
            fullReasoning += delta.reasoning_content;
            emit("thinking", delta.reasoning_content, true);
          }
          if (delta.content) {
            fullText += delta.content;
            emit("generating", delta.content, false);
          }
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx: number = tc.index ?? 0;
              if (!toolAcc[idx]) {
                toolAcc[idx] = { id: "", type: "function", function: { name: "", arguments: "" } };
              }
              const acc = toolAcc[idx]!;
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.function.name += tc.function.name;
              if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
            }
          }
        }
      } catch {}
    }
  }
  return { text: fullText, reasoningText: fullReasoning, toolCalls: toolAcc.filter(Boolean) };
}
