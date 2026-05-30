export interface AIModelOption {
  id: string;
  label: string;
}

export interface AISettings {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
  modelOptions: AIModelOption[];
}

export interface AIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: AIToolCall[];
  tool_call_id?: string;
}

export type AIStreamPhase = "connecting" | "thinking" | "generating" | "finishing";

export interface AIStreamUpdate {
  phase: AIStreamPhase;
  text: string;
  reasoningText: string;
}
