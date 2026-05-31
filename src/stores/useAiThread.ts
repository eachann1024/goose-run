/**
 * AI 模块（启动管家）的对话流 —— 每个脚本一条独立线程。
 *
 * 设计红线：AI 的思考（think）、回复（ai）、用户提问（user）全部留在这里，
 * 绝不进运行日志；运行日志（useRuns）只承载真实脚本 stdout/stderr。两者严格分离。
 */
import { create } from "zustand";
import type { AiMessage } from "@/lib/types";

let _mid = 0;
const nextId = () => ++_mid;

interface AiThreadState {
  /** scriptId → 该脚本的对话消息列表 */
  threads: Record<string, AiMessage[]>;

  /** 追加一条消息，返回其 id（供后续流式更新定位） */
  push(scriptId: string, msg: Omit<AiMessage, "id">): number;
  /** 按 id 局部更新一条消息（流式刷新正文 / 标记完成 / 挂修复命令等） */
  update(scriptId: string, id: number, patch: Partial<AiMessage>): void;
  /**
   * 把最后一条 pending 的 think 标记为已完成（转圈→对勾），并可顺带追加若干消息。
   * 用于「上一步思考收束 → 进入下一步」的级联效果。
   */
  resolveLastThink(scriptId: string, ...append: Omit<AiMessage, "id">[]): void;
  /** 清空某脚本的对话（一次新的智能启动会重置线程） */
  clear(scriptId: string): void;
}

export const useAiThread = create<AiThreadState>((set) => ({
  threads: {},

  push(scriptId, msg) {
    const id = nextId();
    set((s) => {
      const arr = s.threads[scriptId] ? [...s.threads[scriptId]] : [];
      arr.push({ ...msg, id });
      return { threads: { ...s.threads, [scriptId]: arr } };
    });
    return id;
  },

  update(scriptId, id, patch) {
    set((s) => {
      const arr = s.threads[scriptId];
      if (!arr) return s;
      const next = arr.map((m) => (m.id === id ? { ...m, ...patch } : m));
      return { threads: { ...s.threads, [scriptId]: next } };
    });
  },

  resolveLastThink(scriptId, ...append) {
    set((s) => {
      const arr = s.threads[scriptId] ? [...s.threads[scriptId]] : [];
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]!.role === "think" && arr[i]!.pending) {
          arr[i] = { ...arr[i]!, pending: false };
          break;
        }
      }
      for (const m of append) arr.push({ ...m, id: nextId() });
      return { threads: { ...s.threads, [scriptId]: arr } };
    });
  },

  clear(scriptId) {
    set((s) => {
      if (!s.threads[scriptId]) return s;
      return { threads: { ...s.threads, [scriptId]: [] } };
    });
  },
}));
