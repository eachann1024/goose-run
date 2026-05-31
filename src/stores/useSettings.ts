import { create } from "zustand";

interface SettingsState {
  autoScroll: boolean;
  confirmDangerous: boolean;
  /** 用登录 shell 运行脚本（-lc，加载 ~/.zprofile 等补全 PATH），默认开 */
  loginShell: boolean;

  setAutoScroll(v: boolean): void;
  setConfirmDangerous(v: boolean): void;
  setLoginShell(v: boolean): void;
}

const STORAGE_KEY = "goose-run:settings-ui";

type Persisted = Pick<SettingsState, "autoScroll" | "confirmDangerous" | "loginShell">;

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
    autoScroll: state.autoScroll,
    confirmDangerous: state.confirmDangerous,
    loginShell: state.loginShell,
  }));
}

const saved = loadFromStorage();

export const useSettings = create<SettingsState>((set, get) => ({
  autoScroll: saved.autoScroll ?? true,
  confirmDangerous: saved.confirmDangerous ?? false,
  loginShell: saved.loginShell ?? true,

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
