import { create } from "zustand";
import type { PlatformAdapter } from "../platform/types";
import type { ScriptData, NewScriptInput } from "../lib/types";
import { filterScripts } from "../lib/search";

let platform: PlatformAdapter;

export function initPlatform(adapter: PlatformAdapter): void {
  platform = adapter;
}

export function getPlatform(): PlatformAdapter {
  return platform;
}

export type SortMode = "lastRun" | "name" | "created";

interface ScriptsState {
  scripts: ScriptData[];
  searchQuery: string;
  selectedId: string | null;
  /** 键盘上下键导航的游标（与 selectedId/打开详情解耦） */
  cursorId: string | null;
  editingId: string | null;
  isDark: boolean;
  isThemeLocked: boolean;
  sortMode: SortMode;

  // data actions
  load(): Promise<void>;
  addScript(input: NewScriptInput): ScriptData;
  updateScript(id: string, patch: Partial<NewScriptInput>): void;
  removeScript(id: string): void;
  updateLastRun(id: string, lastRun: ScriptData["lastRun"]): void;

  // ui actions
  setSearchQuery(q: string): void;
  setSelectedId(id: string | null): void;
  setCursorId(id: string | null): void;
  setEditingId(id: string | null): void;
  setSortMode(mode: SortMode): void;

  // theme actions
  toggleDark(): void;
  syncSystemDark(isDark: boolean): void;
  toggleThemeLock(): void;
}

const DARK_KEY = "goose-run-dark";
const LOCK_KEY = "goose-run-dark-locked";
const SORT_KEY = "goose-run:sort-mode";
const SEEDED_KEY = "goose-run:seeded";

/**
 * 首次使用时自动配一个初始化脚本，避免一进来空荡荡看着怪。
 * 只在「从没种过」且「当前确实没有任何脚本」时种一次；用户清空脚本后不会再种回来。
 */
const SEED_SCRIPT: NewScriptInput = {
  name: "初始化",
  description: "第一个示例脚本，点运行试试看",
  script: [
    'echo "你好，鹅的运行 🦢"',
    'echo "当前目录：$(pwd)"',
    'echo "Shell：$SHELL"',
    'echo "时间：$(date \'+%Y-%m-%d %H:%M:%S\')"',
  ].join("\n"),
  shell: "bash",
};

/**
 * 排序工具函数，可在组件中直接 import 使用。
 */
export function sortScripts(scripts: ScriptData[], mode: SortMode): ScriptData[] {
  const arr = [...scripts];
  if (mode === "name") {
    return arr.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  }
  if (mode === "created") {
    return arr.sort((a, b) => b.createdAt - a.createdAt);
  }
  // lastRun: 有 lastRun 的按 startedAt 降序，无 lastRun 的按 updatedAt 降序排在后面
  return arr.sort((a, b) => {
    const aTime = a.lastRun?.startedAt ?? null;
    const bTime = b.lastRun?.startedAt ?? null;
    if (aTime !== null && bTime !== null) return bTime - aTime;
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

/**
 * 屏幕上「可见且有序」的脚本列表 —— 列表渲染、Cmd+1~9、上下键导航共用同一来源，
 * 避免快捷键取到的顺序与肉眼看到的不一致。
 */
export function getVisibleScripts(
  state: Pick<ScriptsState, "scripts" | "searchQuery" | "sortMode">,
): ScriptData[] {
  return sortScripts(filterScripts(state.scripts, state.searchQuery).scripts, state.sortMode);
}

function loadSortMode(): SortMode {
  const saved = localStorage.getItem(SORT_KEY);
  if (saved === "lastRun" || saved === "name" || saved === "created") return saved;
  return "lastRun";
}

function loadDarkPrefs(): { isDark: boolean; isThemeLocked: boolean } {
  const locked = localStorage.getItem(LOCK_KEY) === "1";
  if (locked) {
    return { isDark: localStorage.getItem(DARK_KEY) === "1", isThemeLocked: true };
  }
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return { isDark: prefersDark, isThemeLocked: false };
}

function applyDark(isDark: boolean): void {
  document.documentElement.classList.toggle("dark", isDark);
}

const { isDark: initDark, isThemeLocked: initLocked } = loadDarkPrefs();
applyDark(initDark);
const initSortMode = loadSortMode();

export const useScripts = create<ScriptsState>((set, get) => ({
  scripts: [],
  searchQuery: "",
  selectedId: null,
  cursorId: null,
  editingId: null,
  isDark: initDark,
  isThemeLocked: initLocked,
  sortMode: initSortMode,

  async load() {
    const loaded = await platform.loadScripts();
    let scripts = Array.isArray(loaded) ? loaded : [];
    if (scripts.length === 0) {
      if (localStorage.getItem(SEEDED_KEY) === "1") {
        // 已种过且仍为空 —— 可能是并发的另一次 load 刚种上，复读一次拿最新，避免用陈旧空值覆盖
        const fresh = await platform.loadScripts();
        scripts = Array.isArray(fresh) ? fresh : [];
      } else {
        // 首次使用 → 种一个初始化脚本（只种一次，用户清空后不复种）
        const now = Date.now();
        scripts = [{ ...SEED_SCRIPT, id: crypto.randomUUID(), createdAt: now, updatedAt: now }];
        platform.saveScripts(scripts);
        localStorage.setItem(SEEDED_KEY, "1");
      }
    }
    set({ scripts });
  },

  addScript(input) {
    const now = Date.now();
    const newScript: ScriptData = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    const scripts = [...get().scripts, newScript];
    set({ scripts });
    platform.saveScripts(scripts);
    return newScript;
  },

  updateScript(id, patch) {
    const scripts = get().scripts.map((s) =>
      s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s,
    );
    set({ scripts });
    platform.saveScripts(scripts);
  },

  removeScript(id) {
    const scripts = get().scripts.filter((s) => s.id !== id);
    set({ scripts });
    platform.saveScripts(scripts);
  },

  updateLastRun(id, lastRun) {
    const scripts = get().scripts.map((s) =>
      s.id === id ? { ...s, lastRun } : s,
    );
    set({ scripts });
    platform.saveScripts(scripts);
  },

  setSearchQuery(q) {
    set({ searchQuery: q });
  },

  setSelectedId(id) {
    set({ selectedId: id });
  },

  setCursorId(id) {
    set({ cursorId: id });
  },

  setEditingId(id) {
    set({ editingId: id });
  },

  setSortMode(mode) {
    set({ sortMode: mode });
    localStorage.setItem(SORT_KEY, mode);
  },

  toggleDark() {
    const next = !get().isDark;
    set({ isDark: next });
    applyDark(next);
    if (get().isThemeLocked) {
      localStorage.setItem(DARK_KEY, next ? "1" : "0");
    }
  },

  syncSystemDark(isDark) {
    if (get().isThemeLocked) return;
    set({ isDark });
    applyDark(isDark);
  },

  toggleThemeLock() {
    const locked = !get().isThemeLocked;
    set({ isThemeLocked: locked });
    if (locked) {
      localStorage.setItem(LOCK_KEY, "1");
      localStorage.setItem(DARK_KEY, get().isDark ? "1" : "0");
    } else {
      localStorage.removeItem(LOCK_KEY);
      localStorage.removeItem(DARK_KEY);
    }
  },
}));
