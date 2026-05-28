export interface ParamDef {
  name: string;
  /** 如果有选项列表（如 {{env=prod|staging|dev}}），这里是选项 */
  options?: string[];
  /** 默认值（选项列表的第一个） */
  defaultValue?: string;
}

/**
 * 从脚本模板中提取所有 {{变量名}} 占位符
 */
export function extractParams(script: string): ParamDef[] {
  const regex = /\{\{(\w+)(?:=([^}]+))?\}\}/g;
  const seen = new Set<string>();
  const params: ParamDef[] = [];
  let match;
  while ((match = regex.exec(script)) !== null) {
    const name = match[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    const optionsStr = match[2];
    if (optionsStr) {
      const options = optionsStr.split("|").map(s => s.trim()).filter(Boolean);
      params.push({ name, options, defaultValue: options[0] });
    } else {
      params.push({ name });
    }
  }
  return params;
}

/**
 * 用参数值替换模板占位符
 */
export function applyParams(script: string, values: Record<string, string>): string {
  return script.replace(/\{\{(\w+)(?:=[^}]+)?\}\}/g, (_, name) => values[name] ?? "");
}
