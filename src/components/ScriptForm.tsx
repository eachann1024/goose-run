import { useState, useEffect } from "react";
import { useScripts } from "@/stores/useScripts";
import type { ShellKind } from "@/lib/types";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
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
  script: string;
  tags: string;
  confirmBeforeRun: boolean;
}

const defaultForm: FormState = {
  name: "",
  description: "",
  shell: "bash",
  cwd: "",
  script: "",
  tags: "",
  confirmBeforeRun: false,
};

export function ScriptForm() {
  const editingId = useScripts((s) => s.editingId);
  const setEditingId = useScripts((s) => s.setEditingId);
  const addScript = useScripts((s) => s.addScript);
  const updateScript = useScripts((s) => s.updateScript);
  const scripts = useScripts((s) => s.scripts);

  const [form, setForm] = useState<FormState>(defaultForm);
  const [errors, setErrors] = useState<{ name?: string; script?: string }>({});

  const isNew = editingId === "new";
  const isOpen = editingId !== null;
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
        script: existing.script,
        tags: existing.tags?.join(", ") ?? "",
        confirmBeforeRun: existing.confirmBeforeRun ?? false,
      });
      setErrors({});
    }
  }, [editingId]);

  function handleClose() {
    setEditingId(null);
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
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      shell: form.shell,
      cwd: form.cwd.trim() || undefined,
      script: form.script.trim(),
      tags: tags.length > 0 ? tags : undefined,
      confirmBeforeRun: form.confirmBeforeRun,
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

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DrawerContent className="max-h-[80vh] overflow-y-auto">
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="font-serif text-lg">{title}</DrawerTitle>
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

        <div className="px-4 pb-4 space-y-3">
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

          {/* Shell + 工作目录（同行） */}
          <div className="flex gap-3">
            <div className="space-y-1 w-28 shrink-0">
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
            <div className="space-y-1 flex-1 min-w-0">
              <label className="text-xs font-medium text-muted-foreground">工作目录</label>
              <Input
                value={form.cwd}
                onChange={(e) => set("cwd", e.target.value)}
                placeholder="$HOME"
                className="font-mono text-xs"
              />
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
      </DrawerContent>
    </Drawer>
  );
}
