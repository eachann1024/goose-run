import type { ScriptData } from "./types";

/**
 * 统一的脚本匹配引擎：lowercase + 多关键字 AND。
 * 支持 tag:xxx 前缀语法：只匹配 tags 字段。
 * 普通关键字匹配所有字段：name、description、script、tags。
 * 空查询返回 true（全量）。
 */
export function matchScript(script: ScriptData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const tokens = q.split(/\s+/).filter(Boolean);
  const tagTokens = tokens.filter((t) => t.startsWith("tag:")).map((t) => t.slice(4)).filter(Boolean);
  const plainTokens = tokens.filter((t) => !t.startsWith("tag:"));

  const tagsStr = (script.tags || []).join(" ").toLowerCase();

  // tag: 前缀词只匹配 tags 字段
  for (const tt of tagTokens) {
    if (!tagsStr.includes(tt)) return false;
  }

  // 普通词匹配全字段
  if (plainTokens.length > 0) {
    const haystack = [
      script.name,
      script.description ?? "",
      script.script,
      tagsStr,
    ]
      .join(" ")
      .toLowerCase();
    for (const pt of plainTokens) {
      if (!haystack.includes(pt)) return false;
    }
  }

  return true;
}

/**
 * 高亮函数：将文本按查询词拆分为片段数组，标记哪些部分需要高亮。
 * 忽略 tag:xxx 前缀词（它们不参与文本高亮）。
 */
export function highlightMatch(
  text: string,
  query: string,
): { text: string; highlight: boolean }[] {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, highlight: false }];

  const tokens = q
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !t.startsWith("tag:"));

  if (tokens.length === 0) return [{ text, highlight: false }];

  // 构建正则，转义特殊字符
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");

  const parts = text.split(pattern);
  return parts
    .filter((p) => p.length > 0)
    .map((p) => ({
      text: p,
      highlight: tokens.some((t) => p.toLowerCase() === t),
    }));
}

/**
 * 过滤脚本，返回过滤后的列表及过滤前总数。
 */
export function filterScripts(
  scripts: ScriptData[],
  query: string,
): { scripts: ScriptData[]; total: number } {
  const total = scripts.length;
  if (!query.trim()) return { scripts, total };
  return { scripts: scripts.filter((s) => matchScript(s, query)), total };
}
