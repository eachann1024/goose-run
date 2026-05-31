export interface AIModelOption {
  id: string;
  label: string;
}

export interface AISettings {
  enabled: boolean;
  baseURL: string;
  apiKey: string;
  model: string;
  /** 轻量模型：日志诊断/分类等高频小任务用；留空回退主模型 */
  lightModel: string;
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
