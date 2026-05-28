import { create } from "zustand";
import type { PlatformAdapter } from "../platform/types";
import type { ScriptData, NewScriptInput } from "../lib/types";

let platform: PlatformAdapter;

export function initPlatform(adapter: PlatformAdapter): void {
  platform = adapter;
}

export function getPlatform(): PlatformAdapter {
  return platform;
}

interface ScriptsState {
  scripts: ScriptData[];
  searchQuery: string;
  selectedId: string | null;
  editingId: string | null;
  showDetail: boolean;
  isDark: boolean;
  isThemeLocked: boolean;

  // data actions
  load(): Promise<void>;
  addScript(input: NewScriptInput): ScriptData;
  updateScript(id: string, patch: Partial<NewScriptInput>): void;
  removeScript(id: string): void;
  updateLastRun(id: string, lastRun: ScriptData["lastRun"]): void;

  // ui actions
  setSearchQuery(q: string): void;
  setSelectedId(id: string | null): void;
  setEditingId(id: string | null): void;
  setShowDetail(b: boolean): void;

  // theme actions
  toggleDark(): void;
  syncSystemDark(isDark: boolean): void;
  toggleThemeLock(): void;
}

const DARK_KEY = "goose-run-dark";
const LOCK_KEY = "goose-run-dark-locked";

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

export const useScripts = create<ScriptsState>((set, get) => ({
  scripts: [],
  searchQuery: "",
  selectedId: null,
  editingId: null,
  showDetail: false,
  isDark: initDark,
  isThemeLocked: initLocked,

  async load() {
    const scripts = await platform.loadScripts();
    set({ scripts: Array.isArray(scripts) ? scripts : [] });
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

  setEditingId(id) {
    set({ editingId: id });
  },

  setShowDetail(b) {
    set({ showDetail: b });
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
