import { Terminal } from "lucide-react";
import { useScripts } from "@/stores/useScripts";
import { usePlatform } from "@/platform/context";

const examples = [
  { name: "Hello World", script: 'echo "你好，鹅的运行"', description: "最小示例", shell: "bash" as const },
  { name: "Git Pull", script: "git pull --rebase", description: "拉取最新代码", shell: "bash" as const },
  { name: "npm Start", script: "npm start", description: "启动开发服务器", shell: "bash" as const },
  { name: "Docker Compose Up", script: "docker compose up -d", description: "启动容器编排", shell: "bash" as const },
];

export function EmptyState() {
  const addScript = useScripts((s) => s.addScript);
  const platform = usePlatform();

  return (
    <div className="text-center py-16 text-fg-muted">
      <div className="flex justify-center mb-4">
        <Terminal size={80} strokeWidth={1} className="opacity-40" />
      </div>

      <h2 className="font-serif text-xl text-fg mb-2">还没有脚本</h2>

      <p className="text-sm leading-relaxed mb-6 max-w-[280px] mx-auto">
        点右上角『+』或按 N 键，把你常用的 shell 脚本加进来。
      </p>

      <div className="grid grid-cols-2 gap-2 max-w-[400px] mx-auto">
        {examples.map((ex) => (
          <button
            key={ex.name}
            onClick={() => addScript(ex)}
            className="text-left p-3 rounded-cell border border-border text-sm transition-colors hover:bg-surface hover:border-accent-line active:scale-[0.98]"
          >
            <p className="font-semibold text-fg text-xs">{ex.name}</p>
            <p className="text-[11px] text-fg-muted font-mono mt-0.5 truncate">{ex.script}</p>
          </button>
        ))}
      </div>

      <button
        onClick={async () => {
          const json = await platform.readFromFile();
          if (json) {
            try {
              const imported = JSON.parse(json);
              if (Array.isArray(imported)) {
                imported.forEach((s: Record<string, unknown>) => {
                  if (typeof s.name === "string" && typeof s.script === "string") {
                    addScript({
                      name: s.name,
                      script: s.script,
                      description: typeof s.description === "string" ? s.description : undefined,
                      shell: (s.shell === "bash" || s.shell === "zsh" || s.shell === "sh") ? s.shell : "bash",
                    });
                  }
                });
              }
            } catch {
              /* ignore parse errors */
            }
          }
        }}
        className="mt-4 px-4 py-2 rounded-cell border border-border text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg"
      >
        从 JSON 导入脚本
      </button>
    </div>
  );
}
