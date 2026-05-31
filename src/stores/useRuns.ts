import { create } from "zustand";
import type { LogLine, RunState, ScriptData } from "../lib/types";
import { extractPort } from "../lib/port-detect";
import { extractParams, applyParams } from "../lib/params";
import { getPlatform } from "./useScripts";
import { useSettings } from "./useSettings";

// 日志行单调 id：作为虚拟列表稳定 key（slice 截断后下标平移，不能用 index）
let _logId = 0;
const nextLogId = () => ++_logId;

// appendLog 节流：mutable push + rAF 批量刷新
let _dirty = false;
function scheduleFlush() {
  if (_dirty) return;
  _dirty = true;
  requestAnimationFrame(() => {
    _dirty = false;
    useRuns.setState((s) => ({ runs: { ...s.runs } }));
  });
}

interface RunsState {
  runs: Record<string, RunState>;
  taskIdByScript: Record<string, string>;
  /** 探测命令结果：scriptId → 系统里是否真实在运行（含本插件外启动的进程） */
  probedRunning: Record<string, boolean>;
  /** 待填参数的脚本：非空时弹出参数面板，填完才真正运行 */
  pendingRun: ScriptData | null;

  /**
   * 统一运行入口（收口）：危险确认 → 已在跑则跳过 → 有 {{参数}} 则弹面板 → 否则直接跑。
   * ScriptList / ScriptDetail / Cmd+1~9 / 快速运行 / 键盘回车都走这里，参数与登录 shell 一致生效。
   */
  requestRun(script: ScriptData): void;
  /** 参数面板确认：用填入值替换 {{}} 后运行 */
  confirmRun(values: Record<string, string>): void;
  /** 取消参数面板 */
  cancelRun(): void;

  startRun(
    scriptId: string,
    opts: {
      script: string;
      cwd?: string;
      env?: Record<string, string>;
      shell?: "bash" | "zsh" | "sh";
      login?: boolean;
    },
  ): Promise<string | null>;
  appendLog(taskId: string, line: Omit<LogLine, "id">): void;
  finishRun(taskId: string, exitCode: number | null, signal: string | null): void;

  /**
   * 开启一段 AI 智能启动会话：本地建一个 kind:"ai" 的 run（不 spawn），占用该脚本当前 run 位。
   * 返回 aiTaskId —— 后续 AI 叙述（aiLog）与真实启动日志都进这个 run；start_service 复用此 id 调 startTask。
   */
  beginAiSession(scriptId: string): string;
  /** 向 AI 会话 run 追加一行小白话叙述（stream:"ai"） */
  aiLog(aiTaskId: string, text: string): void;
  /** 收尾 AI 会话（仅在没有真正 start_service 启动服务、需手动结束时调） */
  endAiSession(aiTaskId: string, ok: boolean): void;
  /** 手动回填检测到的端口（AI 兜底识别后调用） */
  setDetectedPort(taskId: string, port: number): void;
  stopRun(taskId: string): Promise<void>;
  clearRun(taskId: string): void;
  getRunByScript(scriptId: string): RunState | null;
  /** 执行脚本的探测命令并更新 probedRunning。无命令或平台不支持时按未运行处理 */
  probeScript(scriptId: string, command?: string): Promise<void>;
  /** 该脚本是否在运行：本插件启动的 run 在跑，或探测命令判定在运行 */
  isScriptRunning(scriptId: string): boolean;
}

// 用填好的参数值替换 {{}} 后启动；登录 shell 跟随全局设置
function launchScript(script: ScriptData, values: Record<string, string>): void {
  const finalScript = applyParams(script.script, values);
  const login = useSettings.getState().loginShell !== false;
  void useRuns.getState().startRun(script.id, {
    script: finalScript,
    cwd: script.cwd,
    env: script.env,
    shell: script.shell,
    login,
  });
}

export const useRuns = create<RunsState>((set, get) => ({
  runs: {},
  taskIdByScript: {},
  probedRunning: {},
  pendingRun: null,

  requestRun(script) {
    // 危险脚本二次确认（刺眼打断，集中在此处，所有入口统一生效）
    if (script.confirmBeforeRun && !confirm(`确认运行「${script.name}」？此脚本标记为危险操作。`)) {
      return;
    }
    // single 再入去重：本插件已有该脚本在跑，不再并发起第二个
    const existing = get().taskIdByScript[script.id];
    if (existing && get().runs[existing]?.status === "running") return;
    // 含 {{参数}} → 弹面板填值；否则直接跑
    if (extractParams(script.script).length > 0) {
      set({ pendingRun: script });
      return;
    }
    launchScript(script, {});
  },

  confirmRun(values) {
    const script = get().pendingRun;
    set({ pendingRun: null });
    if (script) launchScript(script, values);
  },

  cancelRun() {
    set({ pendingRun: null });
  },

  async startRun(scriptId, opts) {
    const taskId = crypto.randomUUID();
    const platform = getPlatform();

    // 先建 run 再 startTask：startTask 内部会「同步」emit("start") 派发启动横幅，
    // 若 run 尚未入表，appendLog 会因找不到 run 而丢弃这行（启动时间/日期就此消失）。
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

    const ok = await platform.startTask({ taskId, ...opts });
    if (!ok) {
      // 启动失败：撤掉这条占位 run，避免留下空壳
      get().clearRun(taskId);
      return null;
    }

    return taskId;
  },

  appendLog(taskId, line) {
    const run = get().runs[taskId];
    if (!run) return;
    run.lines.push({ ...line, id: nextLogId() });
    if (run.lines.length > 10000) {
      run.lines = run.lines.slice(-8000);
    }
    // 正则优先：首次从日志里识别到端口就记下，后续不再覆盖（AI 叙述行不参与端口识别）
    if (run.detectedPort == null && line.stream !== "system" && line.stream !== "ai") {
      const p = extractPort(line.text);
      if (p != null) run.detectedPort = p;
    }
    scheduleFlush();
  },

  beginAiSession(scriptId) {
    const aiTaskId = crypto.randomUUID();
    const runState: RunState = {
      taskId: aiTaskId,
      scriptId,
      status: "running",
      startedAt: Date.now(),
      lines: [],
      kind: "ai",
    };
    set((state) => ({
      runs: { ...state.runs, [aiTaskId]: runState },
      taskIdByScript: { ...state.taskIdByScript, [scriptId]: aiTaskId },
    }));
    return aiTaskId;
  },

  aiLog(aiTaskId, text) {
    get().appendLog(aiTaskId, { ts: Date.now(), stream: "ai", text });
  },

  endAiSession(aiTaskId, ok) {
    set((state) => {
      const run = state.runs[aiTaskId];
      if (!run || run.status !== "running") return state;
      return {
        runs: {
          ...state.runs,
          [aiTaskId]: { ...run, status: ok ? "success" : "failed", endedAt: Date.now(), exitCode: ok ? 0 : 1 },
        },
      };
    });
  },

  setDetectedPort(taskId, port) {
    set((state) => {
      const run = state.runs[taskId];
      if (!run || run.detectedPort === port) return state;
      return { runs: { ...state.runs, [taskId]: { ...run, detectedPort: port } } };
    });
  },

  finishRun(taskId, exitCode, signal) {
    set((state) => {
      const run = state.runs[taskId];
      if (!run) return state;
      // 幂等：已终止的 run 忽略后到事件（spawn error 与 exit 可能双触发，避免状态被覆写）
      if (run.status !== "running") return state;

      let status: RunState["status"];
      // 主动中止：SIGTERM 或兜底 SIGKILL 都算「已中止」，不能误判为失败
      if (signal === "SIGTERM" || signal === "SIGKILL") {
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

  async probeScript(scriptId, command) {
    const platform = getPlatform();
    let running = false;
    if (command && command.trim() && platform.probeRunning) {
      try {
        running = await platform.probeRunning(command);
      } catch {
        running = false;
      }
    }
    set((state) => {
      if (state.probedRunning[scriptId] === running) return state;
      return { probedRunning: { ...state.probedRunning, [scriptId]: running } };
    });
  },

  isScriptRunning(scriptId) {
    const state = get();
    const activeTaskId = state.taskIdByScript[scriptId];
    if (activeTaskId && state.runs[activeTaskId]?.status === "running") return true;
    return state.probedRunning[scriptId] === true;
  },
}));
