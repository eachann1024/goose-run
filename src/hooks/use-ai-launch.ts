/**
 * AI 智能启动编排 hook。
 * 串起：开 AI 会话 → 打包上下文 → 跑工具调用循环（边诊断边把小白话推进日志）→ 真正启动服务。
 * 一个 run 贯穿「AI 叙述 + 真实启动日志」：start_service 复用 aiTaskId 调 startTask，
 * 真实 stdout/stderr 经现有事件流天然合流进同一个 run。
 */
import { useCallback, useRef } from "react";
import { useRuns } from "@/stores/useRuns";
import { useAI } from "@/stores/useAI";
import { useSettings } from "@/stores/useSettings";
import { usePlatform } from "@/platform/context";
import { runAIStream } from "@/lib/ai-provider";
import { buildLaunchMessages } from "@/lib/ai-provider/launch-context";
import { LAUNCH_TOOLS, createLaunchToolExecutor } from "@/lib/ai-provider/launch-tools";
import type { ScriptData } from "@/lib/types";

export function useAiLaunch() {
  const platform = usePlatform();
  const abortRef = useRef<AbortController | null>(null);

  const launch = useCallback(
    async (script: ScriptData) => {
      const runs = useRuns.getState();
      const aiTaskId = runs.beginAiSession(script.id);
      const aiLog = (t: string) => useRuns.getState().aiLog(aiTaskId, t);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      aiLog("✨ AI 启动管家来啦，我先直接帮你把它跑起来，遇到问题再排查。");

      let started = false;

      // 真正启动：复用 aiTaskId 调 startTask，让真实日志合流进同一个 run
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
          // 真服务已起：把这个 run 从 ai 会话「转正」为普通运行，状态条/按钮回到「运行中/中止」语义；
          // 进程退出由现有 exit 事件自然收尾（叙述行仍保留在日志里）
          useRuns.setState((s) => {
            const r = s.runs[aiTaskId];
            if (!r) return s;
            return { runs: { ...s.runs, [aiTaskId]: { ...r, kind: "script" } } };
          });
          started = true;
          return { ok: true, message: "服务进程已启动，正在输出运行日志。" };
        }
        return { ok: false, message: "启动失败：该脚本可能已在运行，或启动命令有误。" };
      };

      // 把 AI 流式正文（小白讲解）增量刷进日志：每次工具动作前、以及结束时各 flush 一次
      let fullText = "";
      let flushedLen = 0;
      const flushAssistantText = () => {
        const delta = fullText.slice(flushedLen).trim();
        flushedLen = fullText.length;
        if (delta) aiLog(delta);
      };
      // 工具动作前先把已生成的讲解 flush 出来，再叙述这一步动作 → 讲解与动作自然交错
      const narrate = (t: string) => {
        flushAssistantText();
        aiLog(t);
      };

      const executeTool = createLaunchToolExecutor({
        platform,
        script,
        onNarrate: narrate,
        startService,
      });

      try {
        await runAIStream(useAI.getState().getLightSettings(), buildLaunchMessages(script, runs.getRunByScript(script.id)), {
          abortSignal: controller.signal,
          tools: LAUNCH_TOOLS,
          executeTool,
          maxToolRounds: 12,
          onUpdate: (u) => { fullText = u.text; },
        });
        flushAssistantText(); // 收尾：把最终总结刷出来
        if (!started) {
          // AI 没真正启动服务（如已在运行 / 仅诊断）→ 手动收尾会话
          useRuns.getState().endAiSession(aiTaskId, true);
        }
        // started=true 时：服务进程长驻，run 状态由进程 exit 事件自然收尾，不在此结束
      } catch (e) {
        flushAssistantText();
        if ((e as Error).name === "AbortError") {
          aiLog("⏹️ 已取消 AI 启动。");
        } else {
          aiLog("⚠️ AI 启动中断了：" + (e instanceof Error ? e.message : String(e)));
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
