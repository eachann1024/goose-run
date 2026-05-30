import { useEffect, useMemo, useState } from "react";
import { useRuns } from "@/stores/useRuns";
import { extractParams } from "@/lib/params";
import { Play, X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * 运行参数填值面板。脚本含 {{占位符}} 时由 requestRun 收口弹出，
 * 填完才用 applyParams 替换并真正运行。所有运行入口（卡片/详情/Cmd 数字/回车/快速运行）统一经此。
 */
export function ParamPanel() {
  const pendingRun = useRuns((s) => s.pendingRun);
  const confirmRun = useRuns((s) => s.confirmRun);
  const cancelRun = useRuns((s) => s.cancelRun);

  const params = useMemo(
    () => (pendingRun ? extractParams(pendingRun.script) : []),
    [pendingRun],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // 打开/切换脚本时用选项默认值初始化
  useEffect(() => {
    if (!pendingRun) return;
    const init: Record<string, string> = {};
    for (const p of params) init[p.name] = p.defaultValue ?? "";
    setValues(init);
    setErrors({});
  }, [pendingRun, params]);

  function handleConfirm() {
    const errs: Record<string, boolean> = {};
    for (const p of params) {
      if (!(values[p.name] ?? "").trim()) errs[p.name] = true;
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    confirmRun(values);
  }

  function set(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (value.trim()) setErrors((prev) => ({ ...prev, [name]: false }));
  }

  return (
    <Drawer open={pendingRun != null} onOpenChange={(v) => { if (!v) cancelRun(); }}>
      <DrawerContent>
        <DrawerHeader className="pb-2">
          <div className="flex items-center justify-between">
            <DrawerTitle className="font-serif text-lg truncate">
              填写参数 · {pendingRun?.name}
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
          <p className="text-[11px] text-fg-faint">
            填入后将替换命令中的 <code className="text-accent">{"{{占位符}}"}</code> 再运行 · 回车确认 · Esc 取消
          </p>

          {params.map((p, i) => (
            <div key={p.name} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                <code className="text-accent">{p.name}</code>
                <span className="text-destructive"> *</span>
              </label>
              {p.options ? (
                <Select value={values[p.name] ?? ""} onValueChange={(v) => set(p.name, v ?? "")}>
                  <SelectTrigger className="w-full" aria-invalid={errors[p.name]}>
                    <SelectValue placeholder="选择一项" />
                  </SelectTrigger>
                  <SelectContent>
                    {p.options.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  autoFocus={i === 0}
                  value={values[p.name] ?? ""}
                  onChange={(e) => set(p.name, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleConfirm(); } }}
                  placeholder={`填入 ${p.name}`}
                  className="font-mono text-xs"
                  aria-invalid={errors[p.name]}
                />
              )}
              {errors[p.name] && <p className="text-[11px] text-destructive">不能为空</p>}
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Button variant="default" size="sm" onClick={handleConfirm} className="gap-1.5">
              <Play size={14} strokeWidth={1.75} /> 运行
            </Button>
            <Button variant="outline" size="sm" onClick={cancelRun}>
              取消
            </Button>
          </div>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
