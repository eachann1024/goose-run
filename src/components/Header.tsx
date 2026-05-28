import { forwardRef } from "react";
import { Plus, Moon, Sun, Settings } from "lucide-react";
import { useScripts } from "@/stores/useScripts";

export const Header = forwardRef<HTMLInputElement>(function Header(_, ref) {
  const searchQuery = useScripts((s) => s.searchQuery);
  const setSearchQuery = useScripts((s) => s.setSearchQuery);
  const setEditingId = useScripts((s) => s.setEditingId);
  const isDark = useScripts((s) => s.isDark);
  const toggleDark = useScripts((s) => s.toggleDark);

  return (
    <header className="flex h-12 w-full shrink-0 items-center gap-3 px-4 border-b border-border bg-bg/95 backdrop-blur sticky top-0 z-10">
      {/* 左：Logo + 标题 */}
      <h1 className="font-serif text-lg font-semibold text-fg whitespace-nowrap">
        鹅的运行
      </h1>

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
          onClick={() => console.log("settings")}
          className="rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="设置"
        >
          <Settings size={17} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
});
