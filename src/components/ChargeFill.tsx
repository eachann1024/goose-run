/**
 * 长按蓄力的紫色充能特效。
 * 用 AI 身份紫（--color-ai）从左向右填充覆盖按钮原色，
 * 视觉隐喻「按住 → AI 正在接管这次启动」；前沿有发光竖条随进度推进。
 * 宿主按钮需 relative + overflow-hidden，文字层 z-10 盖在其上。
 */
import type { CSSProperties } from "react";

interface ChargeFillProps {
  charging: boolean;
  /** 0→1 蓄力进度 */
  progress: number;
}

export function ChargeFill({ charging, progress }: ChargeFillProps) {
  if (!charging) return null;
  const pct = progress * 100;
  return (
    <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* 紫色充能填充：从左铺开 */}
      <span
        className="absolute inset-y-0 left-0"
        style={{
          width: `${pct}%`,
          background:
            "linear-gradient(90deg, color-mix(in srgb, var(--color-ai) 45%, transparent), var(--color-ai) 72%, var(--color-ai-bright))",
        }}
      />
      {/* 发光前沿：随进度推进的亮紫竖条 */}
      <span
        className="absolute inset-y-0 w-[3px]"
        style={{
          left: `calc(${pct}% - 2px)`,
          background: "var(--color-ai-bright)",
          opacity: 0.55 + progress * 0.45,
          boxShadow: "0 0 10px 2px var(--color-ai-bright)",
        }}
      />
    </span>
  );
}

/** 宿主按钮的外发光：随进度增强的紫色光晕（box-shadow 不被 overflow 裁剪，作用在按钮本体上） */
export function chargeGlow(charging: boolean, progress: number): CSSProperties | undefined {
  if (!charging) return undefined;
  return {
    boxShadow: `0 0 ${6 + progress * 22}px color-mix(in srgb, var(--color-ai) ${28 + progress * 52}%, transparent)`,
  };
}
