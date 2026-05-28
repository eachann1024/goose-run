import { Terminal } from "lucide-react";
import { useScripts } from "@/stores/useScripts";

export function EmptyState() {
  const addScript = useScripts((s) => s.addScript);

  const handleAddExample = () => {
    addScript({
      name: "Hello World",
      script: 'echo "你好，鹅的运行"',
      description: "最小示例",
      shell: "bash",
    });
  };

  return (
    <div className="text-center py-16 text-fg-muted">
      <div className="flex justify-center mb-4">
        <Terminal size={80} strokeWidth={1} className="opacity-40" />
      </div>

      <h2 className="font-serif text-xl text-fg mb-2">还没有脚本</h2>

      <p className="text-sm leading-relaxed mb-6 max-w-[280px] mx-auto">
        点右上角『+』或按 N 键，把你常用的 shell 脚本加进来。
      </p>

      <button
        onClick={handleAddExample}
        className="px-4 py-2 rounded-cell border border-border text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg active:scale-95"
      >
        试试加一个示例脚本
      </button>
    </div>
  );
}
