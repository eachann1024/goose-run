import { describe, expect, it } from "vitest";
import type { ScriptData } from "../types";
import { filterScripts, highlightMatch, matchScript } from "../search";

function makeScript(partial: Partial<ScriptData>): ScriptData {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? "",
    script: partial.script ?? "echo hello",
    createdAt: partial.createdAt ?? Date.now(),
    updatedAt: partial.updatedAt ?? Date.now(),
    description: partial.description,
    tags: partial.tags,
    cwd: partial.cwd,
    env: partial.env,
    shell: partial.shell,
    confirmBeforeRun: partial.confirmBeforeRun,
    lastRun: partial.lastRun,
  };
}

describe("matchScript", () => {
  const deploy = makeScript({
    name: "Deploy Prod",
    description: "部署生产环境",
    script: "pnpm build && rsync ...",
    tags: ["deploy", "prod"],
  });
  const test = makeScript({
    name: "Run Tests",
    description: "跑单元测试",
    script: "vitest run",
    tags: ["test"],
  });

  it("空查询匹配全部", () => {
    expect(matchScript(deploy, "")).toBe(true);
    expect(matchScript(test, "   ")).toBe(true);
  });

  it("大小写不敏感", () => {
    expect(matchScript(deploy, "deploy")).toBe(true);
    expect(matchScript(deploy, "DEPLOY")).toBe(true);
    expect(matchScript(deploy, "Deploy")).toBe(true);
  });

  it("匹配 name", () => {
    expect(matchScript(deploy, "prod")).toBe(true);
    expect(matchScript(test, "prod")).toBe(false);
  });

  it("匹配 description", () => {
    expect(matchScript(deploy, "生产")).toBe(true);
    expect(matchScript(test, "单元")).toBe(true);
  });

  it("匹配 script 内容", () => {
    expect(matchScript(deploy, "rsync")).toBe(true);
    expect(matchScript(test, "vitest")).toBe(true);
  });

  it("匹配 tags", () => {
    expect(matchScript(deploy, "prod")).toBe(true);
    expect(matchScript(test, "test")).toBe(true);
  });

  it("多关键字 AND", () => {
    expect(matchScript(deploy, "deploy prod")).toBe(true);
    expect(matchScript(deploy, "deploy vitest")).toBe(false);
  });

  it("不存在的字段返回 false", () => {
    expect(matchScript(deploy, "nope")).toBe(false);
  });

  it("undefined description/tags 不爆炸", () => {
    const bare = makeScript({ name: "bare", script: "ls" });
    expect(matchScript(bare, "bare")).toBe(true);
    expect(matchScript(bare, "missing")).toBe(false);
  });
});

describe("filterScripts", () => {
  const list = [
    makeScript({ name: "Deploy Prod", tags: ["deploy"] }),
    makeScript({ name: "Run Tests", tags: ["test"] }),
    makeScript({ name: "Deploy Staging", tags: ["deploy"] }),
  ];

  it("空查询返回全部", () => {
    const { scripts, total } = filterScripts(list, "");
    expect(scripts).toHaveLength(3);
    expect(total).toBe(3);
  });

  it("子串匹配", () => {
    const { scripts, total } = filterScripts(list, "deploy");
    expect(scripts).toHaveLength(2);
    expect(total).toBe(3);
    expect(scripts.map((s) => s.name)).toEqual(["Deploy Prod", "Deploy Staging"]);
  });
});

describe("highlightMatch", () => {
  it("空 query 返回整段不高亮", () => {
    const result = highlightMatch("hello world", "");
    expect(result).toEqual([{ text: "hello world", highlight: false }]);
  });

  it("单关键字高亮", () => {
    const result = highlightMatch("hello world", "hello");
    const highlighted = result.filter((p) => p.highlight).map((p) => p.text);
    expect(highlighted).toEqual(["hello"]);
    const plain = result.filter((p) => !p.highlight).map((p) => p.text);
    expect(plain).toContain(" world");
  });

  it("多关键字：所有匹配片段均高亮，含同词第二次出现（lastIndex 漂移回归）", () => {
    const result = highlightMatch("ab x cd y ab", "ab cd");
    const highlighted = result.filter((p) => p.highlight).map((p) => p.text);
    // "ab" 出现两次，"cd" 出现一次，全部应高亮
    expect(highlighted).toEqual(["ab", "cd", "ab"]);
    const plain = result.filter((p) => !p.highlight).map((p) => p.text);
    expect(plain).toEqual([" x ", " y "]);
  });

  it("大小写不敏感：query 'Ab'，text 中 ab/AB/Ab 全部高亮", () => {
    const result = highlightMatch("ab AB Ab", "Ab");
    const highlighted = result.filter((p) => p.highlight).map((p) => p.text.toLowerCase());
    expect(highlighted).toEqual(["ab", "ab", "ab"]);
  });

  it("纯 tag: 前缀词不产生高亮", () => {
    const result = highlightMatch("deploy prod", "tag:deploy");
    expect(result).toEqual([{ text: "deploy prod", highlight: false }]);
  });
});
