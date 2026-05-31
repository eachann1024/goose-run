/**
 * AI 智能启动编排 hook。
 *
 * 红线（本次重构核心）：AI 的思考（think）、步骤叙述、回复、以及「操作终端获取到的会话 ID」
 * 全部进 AI 模块（useAiThread），**绝不进运行日志**。运行日志（useRuns 的 run.lines）
 * 只承载 start_service 真正 spawn 后的真实 stdout/stderr。
 *
 * 流程：开 AI 会话(占运行位，按钮显示「AI 启动中」) → 立即给出可见思考(转圈) →
 * 跑工具循环(每步叙述成一行 think) → start_service 拿到终端会话/PID 并真正启动 →
 * 真实输出流进日志 → 模型总结回到 AI 模块。
 */
import { useCallback, useRef } from "react";
import { useRuns } from "@/stores/useRuns";
import { useAI } from "@/stores/useAI";
import { useAiThread } from "@/stores/useAiThread";
import { useSettings } from "@/stores/useSettings";
import { usePlatform } from "@/platform/context";
import { runAIStream } from "@/lib/ai-provider";
import { buildLaunchMessages } from "@/lib/ai-provider/launch-context";
import { LAUNCH_TOOLS, createLaunchToolExecutor } from "@/lib/ai-provider/launch-tools";
import type { ScriptData } from "@/lib/types";

/** 取命令首行（多行命令在气泡里只展示第一行 + 省略号），避免气泡被整段脚本撑爆 */
function commandHead(script: string): string {
  const first = (script.split("\n").find((l) => l.trim()) ?? script).trim();
  const multi = script.split("\n").filter((l) => l.trim()).length > 1;
  const clipped = first.length > 80 ? first.slice(0, 80) + "…" : first;
  return clipped + (multi ? " …" : "");
}

/** 把 UUID taskId 压成一个像终端会话号的短标识：#sh-xxxx */
function sessionLabel(taskId: string): string {
  return "#sh-" + taskId.replace(/[^a-z0-9]/gi, "").slice(0, 4);
}

export function useAiLaunch() {
  const platform = usePlatform();
  const abortRef = useRef<AbortController | null>(null);

  const launch = useCallback(
    async (script: ScriptData) => {
      const runs = useRuns.getState();
      const thread = useAiThread.getState();
      const sid = script.id;

      const aiTaskId = runs.beginAiSession(sid);
      const session = sessionLabel(aiTaskId);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // 每次智能启动重置该脚本的对话，给出一条立即可见的「思考中」反馈（解决等待无反馈的痛点）
      thread.clear(sid);
      const firstThink = thread.push(sid, {
        role: "think",
        text: "读取脚本与最近一次运行记录，准备启动…",
        pending: true,
      });

      let started = false;
      let sawAction = false;

      // 真正启动：复用 aiTaskId 调 startTask，真实日志合流进同一个 run（只进日志，不进对话）
      const startService = async () => {
        const login = useSettings.getState().loginShell !== false;
        const ok = await platform.startTask({
          taskId: aiTaskId,
          script: script.script,
          cwd: script.cwd,
          env: script.env,
          shell: script.shell,
          login,
        });
        if (ok) {
          // 服务已起：run 从 ai 会话「转正」为普通运行（按钮回到「中止」语义，进程 exit 自然收尾）
          useRuns.setState((s) => {
            const r = s.runs[aiTaskId];
            if (!r) return s;
            return { runs: { ...s.runs, [aiTaskId]: { ...r, kind: "script" } } };
          });
          started = true;
          // 拿到真实 PID（start 事件已同步回填）→ 作为「操作终端获取到的 ID」展示在对话里
          const pid = useRuns.getState().runs[aiTaskId]?.pid;
          useAiThread.getState().resolveLastThink(
            sid,
            {
              role: "ai",
              text: `已拿到终端会话 ${session}${pid != null ? `（进程 PID ${pid}）` : ""}，正在它里面执行 \`${commandHead(script.script)}\`。`,
            },
            {
              role: "think",
              text: "执行命令，观察启动输出（实时日志在「日志」标签）…",
              pending: true,
            },
          );
          return { ok: true, message: "服务进程已启动，实时输出正在进入「日志」标签。" };
        }
        return { ok: false, message: "启动失败：该脚本可能已在运行，或启动命令有误。" };
      };

      // 工具每步动作 → 收束上一条思考、新增一行进行中的思考（形成级联步骤）
      const narrate = (t: string) => {
        sawAction = true;
        useAiThread.getState().resolveLastThink(sid, { role: "think", text: t, pending: true });
      };

      const executeTool = createLaunchToolExecutor({
        platform,
        script,
        onNarrate: narrate,
        startService,
      });

      try {
        const result = await runAIStream(
          useAI.getState().getLightSettings(),
          buildLaunchMessages(script, runs.getRunByScript(sid)),
          {
            abortSignal: controller.signal,
            tools: LAUNCH_TOOLS,
            executeTool,
            maxToolRounds: 12,
            // 首个动作之前，把模型的实时推理喂进第一条思考，让漫长等待「看得见在想」
            onUpdate: (u) => {
              if (!sawAction && u.reasoningText) {
                const tail = u.reasoningText.replace(/\s+/g, " ").trim().slice(-90);
                if (tail) useAiThread.getState().update(sid, firstThink, { text: "正在思考：" + tail });
              }
            },
          },
        );

        // 收尾：把最后一条进行中的思考收束，给出模型的总结回复
        useAiThread.getState().resolveLastThink(sid);
        const summary =
          result.trim() ||
          (started
            ? "已经帮你启动，实时输出都在「日志」标签里，有需要随时叫我。"
            : "这次没有真正启动服务，你可以再问我或长按「运行」重试。");
        useAiThread.getState().push(sid, { role: "ai", text: summary });

        if (!started) {
          // 没真正启动（已在运行 / 仅诊断）→ 手动收尾占位会话
          useRuns.getState().endAiSession(aiTaskId, true);
        }
        // started=true 时：进程长驻，run 状态由 exit 事件自然收尾
      } catch (e) {
        useAiThread.getState().resolveLastThink(sid);
        if ((e as Error).name === "AbortError") {
          useAiThread.getState().push(sid, { role: "think", text: "已取消 AI 启动。", pending: false });
        } else {
          useAiThread.getState().push(sid, {
            role: "ai",
            text: "AI 启动中断了：" + (e instanceof Error ? e.message : String(e)),
          });
        }
        if (!started) useRuns.getState().endAiSession(aiTaskId, false);
      } finally {
        abortRef.current = null;
      }
    },
    [platform],
  );

  const abort = useCallback(() => abortRef.current?.abort(), []);

  return { launch, abort };
}
