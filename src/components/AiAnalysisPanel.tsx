import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, X, Check, FileText } from "lucide-react";
import { useAI } from "@/stores/useAI";
import { useScripts } from "@/stores/useScripts";
import { runAIStream } from "@/lib/ai-provider";
import type { AIStreamUpdate } from "@/lib/ai-provider";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";

interface AiAnalysisPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
  fileContent: string;
}

type Phase = "idle" | "streaming" | "done" | "error";

interface ParsedScript {
  name: string;
  description: string;
  script: string;
  shell: "bash" | "zsh" | "sh";
  cwd: string;
  port?: number;
  probeCommand?: string;
}

function tryParseScript(text: string): ParsedScript | null {
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.name && parsed.script) return parsed;
    }

    const parsed = JSON.parse(text);
    if (parsed.name && parsed.script) return parsed;
  } catch {}

  const codeMatch = text.match(/```(?:bash|sh|zsh)?\s*\n([\s\S]*?)```/);
  if (codeMatch) {
    const fileName = text.match(/文件名[：:]\s*(.+)/)?.[1]?.trim()
      || text.match(/名称[：:]\s*(.+)/)?.[1]?.trim();
    return {
      name: fileName || "AI 生成脚本",
      description: "",
      script: codeMatch[1]!.trim(),
      shell: "bash",
      cwd: "",
      probeCommand: "",
    };
  }

  return null;
}

const SYSTEM_PROMPT = `你是一个脚本分析助手。用户会直接给你脚本文件的路径和完整内容，请基于内容分析。

分析完成后返回一个 JSON 对象，格式如下：
\`\`\`json
{
  "name": "脚本名称（简短描述用途）",
  "description": "脚本功能的简要说明",
  "script": "脚本内容（原文或优化后的版本）",
  "shell": "bash 或 zsh 或 sh",
  "cwd": "建议的工作目录（可为空字符串）",
  "port": 该脚本启动的服务监听的端口号（数字；非服务型脚本或无法判断时省略此字段或设为 null）,
  "probeCommand": "一条用于检测该脚本是否正在运行的 shell 命令（可为空字符串）"
}
\`\`\`

关于 port（监听端口）：
- 若脚本启动的是监听端口的服务（web/dev server 等），从脚本里推断端口号填入（如 vite 6003、spring 8080）。
- 非服务型或无法判断时，省略该字段或设为 null。

关于 probeCommand（运行探测命令）：
- 目的：检测该脚本对应的进程/服务此刻是否真的在系统里运行，**即使它不是通过本工具启动的**（比如用户在终端里直接跑起来的）。
- 要求：返回的命令在「运行中」时 exit code 为 0，「未运行」时为非 0。优先用最稳妥的判据：
  - 监听端口的服务（如 web/dev server）：用 \`lsof -iTCP:<端口> -sTCP:LISTEN\`，端口从脚本里推断（如 vite 6003、spring 8080）。
  - 常驻进程：用 \`pgrep -f "<能唯一标识该进程的关键字>"\`，关键字取脚本启动的可执行文件名或独特参数（如 \`pgrep -f "manage.py runserver"\`）。
  - 一次性脚本（跑完就退出、无常驻进程）：留空字符串。
- 不确定时宁可留空，不要给出会误判的命令。

只返回 JSON，不要其他内容。如果脚本内容不是有效的 shell 脚本，也尽量提取可执行部分。`;

export function AiAnalysisPanel({ open, onOpenChange, filePath, fileContent }: AiAnalysisPanelProps) {
  const addScript = useScripts((s) => s.addScript);

  const [phase, setPhase] = useState<Phase>("idle");
  const [streamText, setStreamText] = useState("");
  const [error, setError] = useState("");
  const [parsedScript, setParsedScript] = useState<ParsedScript | null>(null);
  const [created, setCreated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const startAnalysis = useCallback(async () => {
    if (!fileContent.trim()) return;

    setPhase("streaming");
    setStreamText("");
    setError("");
    setParsedScript(null);
    setCreated(false);

    const controller = new AbortController();
    abortRef.current = controller;

    const fileName = filePath.split("/").pop() || "未知文件";

    try {
      const result = await runAIStream(
        useAI.getState().getSettings(),
        [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `请分析这个脚本文件并按要求返回 JSON。\n文件路径: ${filePath}\n文件名: ${fileName}\n\n文件内容：\n\`\`\`\n${fileContent}\n\`\`\``,
          },
        ],
        {
          abortSignal: controller.signal,
          onUpdate: (update: AIStreamUpdate) => {
            if (update.text) {
              setStreamText(update.text);
            }
          },
        },
      );

      const parsed = tryParseScript(result);
      setParsedScript(parsed);
      setPhase("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : "分析失败");
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }, [filePath, fileContent]);

  useEffect(() => {
    if (open && fileContent && phase === "idle") {
      startAnalysis();
    }
  }, [open, fileContent, phase, startAnalysis]);

  const handleClose = () => {
    abortRef.current?.abort();
    setPhase("idle");
    onOpenChange(false);
  };

  const handleCreateScript = () => {
    if (!parsedScript) return;
    const port =
      typeof parsedScript.port === "number" && Number.isFinite(parsedScript.port)
        ? parsedScript.port
        : undefined;
    addScript({
      name: parsedScript.name,
      description: parsedScript.description || undefined,
      script: parsedScript.script,
      shell: parsedScript.shell || "bash",
      cwd: parsedScript.cwd || undefined,
      port,
      probeCommand: parsedScript.probeCommand?.trim() || undefined,
    });
    setCreated(true);
  };

  return (
    <Drawer open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DrawerContent>
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="font-serif text-lg flex items-center gap-2">
              <FileText size={18} strokeWidth={1.75} className="text-accent" />
              AI 分析
            </DrawerTitle>
            <DrawerClose asChild>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="关闭"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <DrawerBody className="space-y-3">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <FileText size={14} strokeWidth={1.75} />
            <span className="font-mono truncate">{filePath.split("/").pop()}</span>
          </div>

          {phase === "streaming" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-fg-muted">
                <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
                <span>AI 正在分析...</span>
              </div>
              {streamText && (
                <pre className="text-xs font-mono bg-surface border border-border rounded-md p-3 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                  {streamText}
                </pre>
              )}
              <Button variant="outline" size="sm" onClick={() => abortRef.current?.abort()}>
                取消
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-2">
              <p className="text-xs text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => { setPhase("idle"); startAnalysis(); }}>
                重试
              </Button>
            </div>
          )}

          {phase === "done" && parsedScript && (
            <div className="space-y-3">
              <div className="bg-surface border border-border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-fg">{parsedScript.name}</p>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {typeof parsedScript.port === "number" && (
                      <span className="text-[10px] font-mono text-accent px-1.5 py-0.5 rounded bg-accent-subtle">
                        :{parsedScript.port}
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-fg-faint px-1.5 py-0.5 rounded bg-surface-hover">
                      {parsedScript.shell || "bash"}
                    </span>
                  </div>
                </div>
                {parsedScript.description && (
                  <p className="text-xs text-fg-muted">{parsedScript.description}</p>
                )}
                <pre className="text-xs font-mono bg-bg border border-border rounded p-2 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {parsedScript.script}
                </pre>
                {parsedScript.probeCommand?.trim() && (
                  <div className="space-y-1">
                    <p className="text-[11px] text-fg-faint">运行探测命令</p>
                    <code className="block text-xs font-mono text-fg-muted bg-bg border border-border rounded px-2 py-1 break-words">
                      {parsedScript.probeCommand}
                    </code>
                  </div>
                )}
              </div>

              {created ? (
                <div className="flex items-center gap-2 text-xs text-copied">
                  <Check size={14} strokeWidth={1.75} />
                  <span>已添加到脚本列表</span>
                </div>
              ) : (
                <Button variant="default" size="sm" onClick={handleCreateScript}>
                  添加为脚本
                </Button>
              )}
            </div>
          )}

          {phase === "done" && !parsedScript && (
            <div className="space-y-2">
              <p className="text-xs text-fg-muted">AI 返回的内容无法解析为脚本格式</p>
              {streamText && (
                <pre className="text-xs font-mono bg-surface border border-border rounded-md p-3 whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                  {streamText}
                </pre>
              )}
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
