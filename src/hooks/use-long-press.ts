/**
 * 长按蓄力手势 hook。
 * 快速点 → 走普通 onClick；按住满 duration（左/右键都接）→ 触发 onLongPress 并吞掉随后的 click。
 * 按住期间 progress 从 0 平滑推进到 1（rAF 驱动），用于渐变充能动画。
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface UseLongPressOptions {
  onLongPress: () => void;
  /** 蓄力满触发的毫秒数，默认 1500 */
  duration?: number;
  /** 长按是否可用；false 时退化为纯点击（不蓄力、不触发） */
  enabled?: boolean;
}

export function useLongPress({ onLongPress, duration = 1500, enabled = true }: UseLongPressOptions) {
  const [charging, setCharging] = useState(false);
  const [progress, setProgress] = useState(0);

  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false); // 本次按压是否已触发长按 → 用于吞掉随后的 click

  const clear = useCallback(() => {
    if (timerRef.current != null) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setCharging(false);
    setProgress(0);
  }, []);

  useEffect(() => clear, [clear]);

  const start = useCallback(() => {
    if (!enabled) return;
    firedRef.current = false;
    setCharging(true);
    const startAt = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - startAt) / duration);
      setProgress(p);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      clear();
      onLongPress();
    }, duration);
  }, [enabled, duration, onLongPress, clear]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      // 左键(0) / 右键(2) 都可蓄力；中键忽略
      if (e.button !== 0 && e.button !== 2) return;
      start();
    },
    onPointerUp: () => clear(),
    onPointerLeave: () => clear(),
    onPointerCancel: () => clear(),
    // 屏蔽右键默认菜单，让右键也能用于蓄力
    onContextMenu: (e: React.MouseEvent) => { if (enabled) e.preventDefault(); },
    // 长按已触发时，吞掉浏览器随后补发的 click，避免又跑了一次普通点击
    onClickCapture: (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        firedRef.current = false;
      }
    },
  };

  return { handlers, charging, progress };
}
