import type { ScriptData } from "./types";

/**
 * 统一的脚本匹配引擎：lowercase + 多关键字 AND。
 * 命中字段：name、description、script、tags。
 * 空查询返回 true（全量）。
 */
export function matchScript(script: ScriptData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    script.name,
    script.description ?? "",
    script.script,
    (script.tags || []).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function filterScripts(
  scripts: ScriptData[],
  query: string,
): ScriptData[] {
  if (!query.trim()) return scripts;
  return scripts.filter((s) => matchScript(s, query));
}
