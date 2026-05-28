import { useSettings } from "@/stores/useSettings";
import { useScripts } from "@/stores/useScripts";
import { usePlatform } from "@/platform/context";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const platform = usePlatform();
  const fontSize = useSettings((s) => s.fontSize);
  const setFontSize = useSettings((s) => s.setFontSize);
  const autoScroll = useSettings((s) => s.autoScroll);
  const setAutoScroll = useSettings((s) => s.setAutoScroll);
  const isThemeLocked = useScripts((s) => s.isThemeLocked);
  const toggleThemeLock = useScripts((s) => s.toggleThemeLock);
  const scripts = useScripts((s) => s.scripts);
  const addScript = useScripts((s) => s.addScript);

  // 导出
  const handleExport = () => {
    const json = JSON.stringify(scripts, null, 2);
    platform.saveToFile(json, "goose-run-scripts.json");
  };

  // 导入
  const handleImport = async () => {
    const json = await platform.readFromFile();
    if (!json) return;
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        let count = 0;
        imported.forEach((s: any) => {
          if (s.name && s.script) {
            addScript({
              name: s.name,
              script: s.script,
              description: s.description,
              shell: s.shell || "bash",
              cwd: s.cwd,
              env: s.env,
              tags: s.tags,
              confirmBeforeRun: s.confirmBeforeRun,
            });
            count++;
          }
        });
        if (count > 0) platform.showNotification(`已导入 ${count} 个脚本`);
      }
    } catch {
      platform.showNotification("导入失败：文件格式不正确");
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[80vh] overflow-y-auto">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="font-serif text-lg">设置</DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="关闭"
              >
                ✕
              </button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-5">
          {/* 日志字体大小 */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">日志字体大小</p>
            <div className="flex gap-1.5">
              {(["small", "medium", "large"] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-colors ${
                    fontSize === size
                      ? "bg-accent text-accent-fg font-medium"
                      : "bg-surface border border-border text-fg-muted hover:bg-surface-hover"
                  }`}
                >
                  {{ small: "小", medium: "中", large: "大" }[size]}
                </button>
              ))}
            </div>
          </div>

          {/* 自动滚动 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-fg">日志自动滚动</p>
              <p className="text-[11px] text-fg-muted">新日志出现时自动滚到底部</p>
            </div>
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
          </div>

          {/* 主题锁定 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-fg">锁定主题</p>
              <p className="text-[11px] text-fg-muted">开启后不跟随系统深浅色切换</p>
            </div>
            <Switch checked={isThemeLocked} onCheckedChange={() => toggleThemeLock()} />
          </div>

          {/* 分隔线 */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">数据管理</p>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 px-3 py-2 rounded-md text-xs border border-border text-fg-muted transition-colors hover:bg-surface hover:text-fg"
              >
                导出脚本
              </button>
              <button
                onClick={handleImport}
                className="flex-1 px-3 py-2 rounded-md text-xs border border-border text-fg-muted transition-colors hover:bg-surface hover:text-fg"
              >
                导入脚本
              </button>
            </div>
            <p className="text-[11px] text-fg-faint mt-1.5">
              导出为 JSON 文件，可用于备份或迁移到其他设备
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
