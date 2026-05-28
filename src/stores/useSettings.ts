import { create } from "zustand";

type FontSize = "small" | "medium" | "large";

interface SettingsState {
  fontSize: FontSize;
  autoScroll: boolean;
  confirmDangerous: boolean;

  setFontSize(size: FontSize): void;
  setAutoScroll(v: boolean): void;
  setConfirmDangerous(v: boolean): void;
}

const STORAGE_KEY = "goose-run:settings-ui";

function loadFromStorage(): Partial<Pick<SettingsState, "fontSize" | "autoScroll" | "confirmDangerous">> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: Pick<SettingsState, "fontSize" | "autoScroll" | "confirmDangerous">): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    fontSize: state.fontSize,
    autoScroll: state.autoScroll,
    confirmDangerous: state.confirmDangerous,
  }));
}

const saved = loadFromStorage();

export const useSettings = create<SettingsState>((set, get) => ({
  fontSize: saved.fontSize ?? "medium",
  autoScroll: saved.autoScroll ?? true,
  confirmDangerous: saved.confirmDangerous ?? false,

  setFontSize(size) {
    set({ fontSize: size });
    persist(get());
  },

  setAutoScroll(v) {
    set({ autoScroll: v });
    persist(get());
  },

  setConfirmDangerous(v) {
    set({ confirmDangerous: v });
    persist(get());
  },
}));
