import { create } from "zustand";
import type { AIModelOption, AISettings } from "@/lib/ai-provider/types";

interface AIState extends AISettings {
  setEnabled(enabled: boolean): void;
  setBaseURL(url: string): void;
  setApiKey(key: string): void;
  setModel(model: string): void;
  setModelOptions(options: AIModelOption[]): void;
  getSettings(): AISettings;
}

const STORAGE_KEY = "goose-run:ai";

function loadFromStorage(): Partial<AISettings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: AISettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    enabled: state.enabled,
    baseURL: state.baseURL,
    apiKey: state.apiKey,
    model: state.model,
    modelOptions: state.modelOptions,
  }));
}

const saved = loadFromStorage();

export const useAI = create<AIState>((set, get) => ({
  enabled: saved.enabled ?? false,
  baseURL: saved.baseURL ?? "",
  apiKey: saved.apiKey ?? "",
  model: saved.model ?? "",
  modelOptions: saved.modelOptions ?? [],

  setEnabled(enabled) {
    set({ enabled });
    persist(get());
  },

  setBaseURL(url) {
    set({ baseURL: url });
    persist(get());
  },

  setApiKey(key) {
    set({ apiKey: key });
    persist(get());
  },

  setModel(model) {
    set({ model });
    persist(get());
  },

  setModelOptions(options) {
    set({ modelOptions: options });
    persist(get());
  },

  getSettings() {
    const s = get();
    return {
      enabled: s.enabled,
      baseURL: s.baseURL,
      apiKey: s.apiKey,
      model: s.model,
      modelOptions: s.modelOptions,
    };
  },
}));
