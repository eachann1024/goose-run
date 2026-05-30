import { create } from "zustand";

type FontSize = "small" | "medium" | "large";

interface SettingsState {
  fontSize: FontSize;
  autoScroll: boolean;
  confirmDangerous: boolean;
  /** 用登录 shell 运行脚本（-lc，加载 ~/.zprofile 等补全 PATH），默认开 */
  loginShell: boolean;

  setFontSize(size: FontSize): void;
  setAutoScroll(v: boolean): void;
  setConfirmDangerous(v: boolean): void;
  setLoginShell(v: boolean): void;
}

const STORAGE_KEY = "goose-run:settings-ui";

type Persisted = Pick<SettingsState, "fontSize" | "autoScroll" | "confirmDangerous" | "loginShell">;

function loadFromStorage(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: Persisted): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    fontSize: state.fontSize,
    autoScroll: state.autoScroll,
    confirmDangerous: state.confirmDangerous,
    loginShell: state.loginShell,
  }));
}

const saved = loadFromStorage();

export const useSettings = create<SettingsState>((set, get) => ({
  fontSize: saved.fontSize ?? "medium",
  autoScroll: saved.autoScroll ?? true,
  confirmDangerous: saved.confirmDangerous ?? false,
  loginShell: saved.loginShell ?? true,

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

  setLoginShell(v) {
    set({ loginShell: v });
    persist(get());
  },
}));
