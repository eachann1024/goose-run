import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAI } from "@/stores/useAI";
import { fetchModels } from "@/lib/ai-provider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SettingsAI() {
  const enabled = useAI((s) => s.enabled);
  const setEnabled = useAI((s) => s.setEnabled);
  const baseURL = useAI((s) => s.baseURL);
  const setBaseURL = useAI((s) => s.setBaseURL);
  const apiKey = useAI((s) => s.apiKey);
  const setApiKey = useAI((s) => s.setApiKey);
  const model = useAI((s) => s.model);
  const setModel = useAI((s) => s.setModel);
  const modelOptions = useAI((s) => s.modelOptions);
  const setModelOptions = useAI((s) => s.setModelOptions);

  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetchModels = async () => {
    const key = apiKey.trim();
    if (!key) {
      setError("请先填写 API Key");
      return;
    }
    setFetching(true);
    setError(null);
    try {
      const url = baseURL.trim() || "https://api.openai.com/v1";
      const models = await fetchModels(url, key);
      if (models.length === 0) {
        setError("未获取到可用模型");
        return;
      }
      setModelOptions(models);
      if (!model || !models.some((m) => m.id === model)) {
        setModel(models[0]!.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "获取失败");
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">AI 助手</p>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-fg">启用 AI</p>
          <p className="text-[11px] text-fg-muted">拖入文件时自动让 AI 分析并生成脚本</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Base URL</label>
            <Input
              value={baseURL}
              onChange={(e) => { setBaseURL(e.target.value); setError(null); }}
              placeholder="https://api.openai.com/v1"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError(null); }}
              placeholder="sk-..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">模型</label>
            <div className="flex gap-2">
              <Select
                value={model}
                onValueChange={(v) => { if (v) setModel(v); }}
                disabled={modelOptions.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={modelOptions.length === 0 ? "点右侧获取模型列表" : "选择模型"} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleFetchModels}
                disabled={fetching || !apiKey.trim()}
                className="shrink-0"
                aria-label="获取模型列表"
              >
                <RefreshCw size={15} strokeWidth={1.75} className={fetching ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-[11px] text-destructive">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
