import { Terminal } from "lucide-react";

/** 右栏空态：未选中脚本时的引导，对齐键盘优先的肌肉记忆 */
export function DetailEmpty() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <Terminal size={56} strokeWidth={1} className="text-fg-faint opacity-50" />
      <p className="text-sm text-fg-muted">从左侧选择一个脚本，查看命令与实时日志</p>
      <p className="font-mono text-[11px] text-fg-faint">
        ↑↓ 选择 · 回车运行 · ⌘1–9 快速运行
      </p>
    </div>
  );
}
