import { create } from "zustand";
import type { LogLine, RunState } from "../lib/types";
import { getPlatform } from "./useScripts";

interface RunsState {
  runs: Record<string, RunState>;
  taskIdByScript: Record<string, string>;

  startRun(
    scriptId: string,
    opts: {
      script: string;
      cwd?: string;
      env?: Record<string, string>;
      shell?: "bash" | "zsh" | "sh";
    },
  ): Promise<string | null>;
  appendLog(taskId: string, line: LogLine): void;
  finishRun(taskId: string, exitCode: number | null, signal: string | null): void;
  stopRun(taskId: string): Promise<void>;
  clearRun(taskId: string): void;
  getRunByScript(scriptId: string): RunState | null;
}

export const useRuns = create<RunsState>((set, get) => ({
  runs: {},
  taskIdByScript: {},

  async startRun(scriptId, opts) {
    const taskId = crypto.randomUUID();
    const platform = getPlatform();
    const ok = await platform.startTask({ taskId, ...opts });
    if (!ok) return null;

    const runState: RunState = {
      taskId,
      scriptId,
      status: "running",
      startedAt: Date.now(),
      lines: [],
    };

    set((state) => ({
      runs: { ...state.runs, [taskId]: runState },
      taskIdByScript: { ...state.taskIdByScript, [scriptId]: taskId },
    }));

    return taskId;
  },

  appendLog(taskId, line) {
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      return {
        runs: {
          ...state.runs,
          [taskId]: { ...run, lines: [...run.lines, line] },
        },
      };
    });
  },

  finishRun(taskId, exitCode, signal) {
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;

      let status: RunState["status"];
      if (signal === "SIGTERM") {
        status = "stopped";
      } else if (exitCode === 0) {
        status = "success";
      } else {
        status = "failed";
      }

      return {
        runs: {
          ...state.runs,
          [taskId]: { ...run, status, endedAt: Date.now(), exitCode },
        },
      };
    });
  },

  async stopRun(taskId) {
    const platform = getPlatform();
    await platform.stopTask(taskId);
  },

  clearRun(taskId) {
    set((state) => {
      const { [taskId]: _removed, ...remaining } = state.runs;
      // 清理 taskIdByScript 中指向该 taskId 的条目
      const taskIdByScript = Object.fromEntries(
        Object.entries(state.taskIdByScript).filter(([, v]) => v !== taskId),
      );
      return { runs: remaining, taskIdByScript };
    });
  },

  getRunByScript(scriptId) {
    const state = get();
    const activeTaskId = state.taskIdByScript[scriptId];
    if (activeTaskId && state.runs[activeTaskId]) {
      return state.runs[activeTaskId];
    }
    // 找该 scriptId 所有已结束的 run 中 endedAt 最大的
    const finished = Object.values(state.runs)
      .filter((r) => r.scriptId === scriptId && r.endedAt != null)
      .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
    return finished[0] ?? null;
  },
}));
