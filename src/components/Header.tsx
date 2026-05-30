import { forwardRef, useState } from "react";
import { Plus, Moon, Sun, Settings } from "lucide-react";
import { useScripts } from "@/stores/useScripts";
import { useRuns } from "@/stores/useRuns";
import { SettingsPanel } from "@/components/SettingsPanel";

export const Header = forwardRef<HTMLInputElement>(function Header(_, ref) {
  const searchQuery = useScripts((s) => s.searchQuery);
  const setSearchQuery = useScripts((s) => s.setSearchQuery);
  const setEditingId = useScripts((s) => s.setEditingId);
  const isDark = useScripts((s) => s.isDark);
  const toggleDark = useScripts((s) => s.toggleDark);
  const runningCount = useRuns((s) => Object.values(s.runs).filter(r => r.status === "running").length);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
    <header className="flex h-12 w-full shrink-0 items-center gap-3 px-4 border-b border-border bg-bg sticky top-0 z-10">
      {/* 左：Logo + 标题 */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        <h1 className="font-serif text-lg font-semibold text-fg">
          鹅的运行
        </h1>
        {runningCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-info/10 text-blue-500">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            {runningCount}
          </span>
        )}
      </div>

      {/* 中：搜索框 */}
      <div className="flex-1 flex justify-center">
        <input
          ref={ref}
          type="text"
          placeholder="搜索脚本..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-72 px-3 py-1.5 text-sm rounded-md bg-input border border-border focus:border-accent focus:outline-none transition-colors"
        />
      </div>

      {/* 右：图标按钮组 */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditingId("new")}
          className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="新增脚本"
        >
          <Plus size={17} strokeWidth={1.75} />
        </button>

        <button
          onClick={toggleDark}
          className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label={isDark ? "切换浅色模式" : "切换深色模式"}
        >
          {isDark ? (
            <Sun size={17} strokeWidth={1.75} />
          ) : (
            <Moon size={17} strokeWidth={1.75} />
          )}
        </button>

        <button
          onClick={() => setShowSettings(true)}
          className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="设置"
        >
          <Settings size={17} strokeWidth={1.75} />
        </button>
      </div>
    </header>
    <SettingsPanel open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
});
