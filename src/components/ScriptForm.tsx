import { useState, useEffect } from "react";
import { useScripts } from "@/stores/useScripts";
import { usePlatform } from "@/platform/context";
import type { ShellKind } from "@/lib/types";
import { extractParams } from "@/lib/params";
import { lsofProbe, isAutoLsof } from "@/lib/port-detect";
import { X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormState {
  name: string;
  description: string;
  shell: ShellKind;
  cwd: string;
  port: string;
  script: string;
  tags: string;
  confirmBeforeRun: boolean;
  probeCommand: string;
}

const defaultForm: FormState = {
  name: "",
  description: "",
  shell: "bash",
  cwd: "",
  port: "",
  script: "",
  tags: "",
  confirmBeforeRun: false,
  probeCommand: "",
};

export function ScriptForm() {
  const editingId = useScripts((s) => s.editingId);
  const setEditingId = useScripts((s) => s.setEditingId);
  const addScript = useScripts((s) => s.addScript);
  const updateScript = useScripts((s) => s.updateScript);
  const scripts = useScripts((s) => s.scripts);
  const platform = usePlatform();

  const [form, setForm] = useState<FormState>(defaultForm);
  const [errors, setErrors] = useState<{ name?: string; script?: string }>({});
  const params = extractParams(form.script);

  const isNew = editingId === "new";
  const title = isNew ? "新增脚本" : "编辑脚本";

  // 编辑模式：加载已有数据
  useEffect(() => {
    if (!editingId || editingId === "new") {
      setForm(defaultForm);
      setErrors({});
      return;
    }
    const existing = scripts.find((s) => s.id === editingId);
    if (existing) {
      setForm({
        name: existing.name,
        description: existing.description ?? "",
        shell: existing.shell ?? "bash",
        cwd: existing.cwd ?? "",
        port: existing.port != null ? String(existing.port) : "",
        script: existing.script,
        tags: existing.tags?.join(", ") ?? "",
        confirmBeforeRun: existing.confirmBeforeRun ?? false,
        probeCommand: existing.probeCommand ?? "",
      });
      setErrors({});
    }
  }, [editingId]);

  // 拖入文件时预填充脚本内容
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name: string; script: string; filePath: string; shell?: ShellKind; cwd?: string; probeCommand?: string; port?: number }>).detail;
      if (detail) {
        setForm((prev) => ({
          ...prev,
          name: detail.name || prev.name,
          script: detail.script || prev.script,
          shell: detail.shell || prev.shell,
          cwd: detail.cwd || prev.cwd,
          port: detail.port != null ? String(detail.port) : prev.port,
          probeCommand: detail.probeCommand || prev.probeCommand,
        }));
      }
    };
    window.addEventListener("goose-run:prefill-script", handler);
    return () => window.removeEventListener("goose-run:prefill-script", handler);
  }, []);

  function handleClose() {
    setEditingId(null);
  }

  async function handlePickDir() {
    const dir = await platform.pickDirectory?.();
    if (dir) set("cwd", dir);
  }

  function validate(): boolean {
    const errs: { name?: string; script?: string } = {};
    if (!form.name.trim()) errs.name = "名称不能为空";
    if (!form.script.trim()) errs.script = "命令不能为空";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const tags = form.tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const portNum = form.port.trim() ? Number(form.port.trim()) : undefined;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      shell: form.shell,
      cwd: form.cwd.trim() || undefined,
      port: portNum != null && Number.isFinite(portNum) ? portNum : undefined,
      script: form.script.trim(),
      tags: tags.length > 0 ? tags : undefined,
      confirmBeforeRun: form.confirmBeforeRun,
      probeCommand: form.probeCommand.trim() || undefined,
    };

    if (isNew) {
      addScript(payload);
    } else if (editingId) {
      updateScript(editingId, payload);
    }
    setEditingId(null);
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "name" || key === "script") {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  // 端口 → 探测命令联动：探测命令为空或仍是自动生成的 lsof 时，跟随端口刷新；
  // 用户一旦手写过探测命令就不再覆盖。
  function setPort(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    setForm((prev) => {
      const next = { ...prev, port: digits };
      if (!prev.probeCommand.trim() || isAutoLsof(prev.probeCommand)) {
        next.probeCommand = digits ? lsofProbe(digits) : "";
      }
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
        <h2 className="font-serif text-lg text-fg">{title}</h2>
        <button
          type="button"
          onClick={handleClose}
          className="rounded p-1 text-fg-muted transition-colors hover:bg-surface hover:text-fg"
          aria-label="关闭"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {/* 名称 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              名称 <span className="text-destructive">*</span>
            </label>
            <Input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="脚本名称"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-[11px] text-destructive">{errors.name}</p>
            )}
          </div>

          {/* 描述 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">描述</label>
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="可选，简要说明用途"
            />
          </div>

          {/* Shell + 端口 + 工作目录（同行） */}
          <div className="flex gap-3">
            <div className="space-y-1 w-24 shrink-0">
              <label className="text-xs font-medium text-muted-foreground">Shell</label>
              <Select
                value={form.shell}
                onValueChange={(v) => set("shell", v as ShellKind)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bash">bash</SelectItem>
                  <SelectItem value="zsh">zsh</SelectItem>
                  <SelectItem value="sh">sh</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 w-24 shrink-0">
              <label className="text-xs font-medium text-muted-foreground">端口</label>
              <Input
                value={form.port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="留空"
                inputMode="numeric"
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <label className="text-xs font-medium text-muted-foreground">工作目录</label>
              <div className="flex gap-1.5">
                <Input
                  value={form.cwd}
                  onChange={(e) => set("cwd", e.target.value)}
                  placeholder="$HOME"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handlePickDir}
                  className="shrink-0"
                  aria-label="选择工作目录"
                  title="选择工作目录"
                >
                  <FolderOpen size={15} strokeWidth={1.75} />
                </Button>
              </div>
            </div>
          </div>

          {/* 命令 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              命令 <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={form.script}
              onChange={(e) => set("script", e.target.value)}
              rows={8}
              placeholder="#!/usr/bin/env bash&#10;echo hello"
              className="font-mono text-xs resize-none"
              aria-invalid={!!errors.script}
            />
            {errors.script && (
              <p className="text-[11px] text-destructive">{errors.script}</p>
            )}
            {params.length > 0 && (
              <div className="rounded-md bg-surface border border-border p-3 space-y-1.5">
                <p className="text-[11px] font-medium text-fg-muted">
                  检测到 {params.length} 个参数（运行时填入）
                </p>
                {params.map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <code className="text-accent">{"{{" + p.name + "}}"}</code>
                    {p.options && (
                      <span className="text-fg-faint">可选：{p.options.join(" / ")}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 运行探测命令 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">运行探测命令</label>
            <Input
              value={form.probeCommand}
              onChange={(e) => set("probeCommand", e.target.value)}
              placeholder={`如：lsof -iTCP:5182 -sTCP:LISTEN  或  pgrep -f "server.py"`}
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-fg-faint">
              可选。返回成功（exit 0）即视为运行中，用于检测在终端等外部启动的进程。填了上方端口会自动生成 lsof 探测命令，手写后不再覆盖。
            </p>
          </div>

          {/* 标签 */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">标签</label>
            <Input
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="用逗号或空格分隔，如：部署, 清理"
            />
          </div>

          {/* 运行前确认 */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="confirm-before-run"
              checked={form.confirmBeforeRun}
              onCheckedChange={(checked) =>
                set("confirmBeforeRun", checked === true)
              }
            />
            <label
              htmlFor="confirm-before-run"
              className="text-sm text-muted-foreground cursor-pointer select-none"
            >
              运行前确认（危险脚本）
            </label>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-1">
            <Button variant="default" size="sm" onClick={handleSubmit}>
              保存
            </Button>
            <Button variant="outline" size="sm" onClick={handleClose}>
              取消
            </Button>
          </div>
      </div>
    </div>
  );
}
