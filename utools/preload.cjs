if (typeof window !== "undefined" && typeof utools !== "undefined") {
  window.utools = utools;

  const { spawn } = require("node:child_process");
  const tasks = new Map(); // taskId → child process

  const safeCall = (fn, ...args) => {
    try {
      if (typeof fn === "function") return fn(...args);
    } catch (err) {
      console.error("[goose-run] utools api failed:", err);
    }
    return undefined;
  };

  function emit(type, detail) {
    window.dispatchEvent(new CustomEvent(`goose-run:${type}`, { detail }));
  }

  const loadScripts = () => {
    try {
      if (typeof utools?.dbStorage?.getItem === "function") {
        const raw = utools.dbStorage.getItem("goose-run:scripts");
        if (typeof raw === "string") return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[goose-run] loadScripts failed:", err);
    }
    return [];
  };

  const saveScripts = (arr) => {
    try {
      if (typeof utools?.dbStorage?.setItem === "function") {
        utools.dbStorage.setItem("goose-run:scripts", JSON.stringify(arr));
        return true;
      }
    } catch (err) {
      console.error("[goose-run] saveScripts failed:", err);
    }
    return false;
  };

  const loadSettings = () => {
    try {
      if (typeof utools?.dbStorage?.getItem === "function") {
        const raw = utools.dbStorage.getItem("goose-run:settings");
        if (typeof raw === "string") return JSON.parse(raw);
      }
    } catch (err) {
      console.error("[goose-run] loadSettings failed:", err);
    }
    return {};
  };

  const saveSettings = (obj) => {
    try {
      if (typeof utools?.dbStorage?.setItem === "function") {
        utools.dbStorage.setItem("goose-run:settings", JSON.stringify(obj));
        return true;
      }
    } catch (err) {
      console.error("[goose-run] saveSettings failed:", err);
    }
    return false;
  };

  const saveToFile = (content, defaultName) => {
    try {
      const fs = require("fs");
      const filePath = utools.showSaveDialog({
        title: "导出脚本清单",
        defaultPath: defaultName,
        buttonLabel: "保存",
        filters: [{ name: "JSON 文件", extensions: ["json"] }],
      });
      if (!filePath) return false;
      fs.writeFileSync(filePath, content, "utf-8");
      return true;
    } catch (err) {
      console.error("[goose-run] saveToFile failed:", err);
      return false;
    }
  };

  const readFromFile = () => {
    try {
      const fs = require("fs");
      const paths = utools.showOpenDialog({
        title: "导入脚本清单",
        buttonLabel: "选择",
        filters: [{ name: "备份文件", extensions: ["json", "txt"] }],
        properties: ["openFile"],
      });
      if (!paths || paths.length === 0) return null;
      return fs.readFileSync(paths[0], "utf-8");
    } catch (err) {
      console.error("[goose-run] readFromFile failed:", err);
      return null;
    }
  };

  let subInputHandler = null;

  window.gooseRun = {
    loadScripts,
    saveScripts,
    loadSettings,
    saveSettings,

    copyText: (text) => {
      safeCall(utools?.copyText, text);
    },
    showNotification: (text) => {
      safeCall(utools?.showNotification, text);
    },
    outPlugin: () => {
      safeCall(utools?.outPlugin);
    },
    hideWindow: () => {
      safeCall(utools?.hideMainWindow);
    },
    showWindow: () => {
      safeCall(utools?.showMainWindow);
    },

    saveToFile,
    readFromFile,

    setSubInput: (handler, placeholder, initial) => {
      subInputHandler = typeof handler === "function" ? handler : null;
      const ok = safeCall(
        utools?.setSubInput,
        ({ text }) => {
          if (subInputHandler) subInputHandler(text || "");
        },
        placeholder || "搜索脚本...",
        true,
      );
      if (typeof initial === "string" && initial.length > 0) {
        safeCall(utools?.setSubInputValue, initial);
      }
      return ok === true;
    },
    removeSubInput: () => {
      subInputHandler = null;
      safeCall(utools?.removeSubInput);
    },

    startTask: (taskId, { script, cwd, env, shell }) => {
      if (tasks.has(taskId)) return false;
      const sh = shell === "zsh" ? "zsh" : shell === "sh" ? "sh" : "bash";
      let proc;
      try {
        proc = spawn(sh, ["-c", script], {
          cwd: cwd && cwd.trim() ? cwd : process.env.HOME,
          env: { ...process.env, ...(env || {}) },
          detached: true,
        });
      } catch (e) {
        emit("error", { taskId, message: String((e && e.message) || e) });
        return false;
      }
      tasks.set(taskId, proc);
      emit("start", { taskId, startedAt: Date.now() });
      proc.stdout.on("data", (d) =>
        emit("log", { taskId, stream: "stdout", text: d.toString() }),
      );
      proc.stderr.on("data", (d) =>
        emit("log", { taskId, stream: "stderr", text: d.toString() }),
      );
      proc.on("error", (err) =>
        emit("error", { taskId, message: String((err && err.message) || err) }),
      );
      proc.on("exit", (code, signal) => {
        tasks.delete(taskId);
        emit("exit", { taskId, code, signal, endedAt: Date.now() });
      });
      return true;
    },

    stopTask: (taskId) => {
      const p = tasks.get(taskId);
      if (!p) return false;
      try {
        if (typeof process.kill === "function" && p.pid) {
          try {
            process.kill(-p.pid, "SIGTERM");
          } catch {
            p.kill("SIGTERM");
          }
        } else {
          p.kill("SIGTERM");
        }
        return true;
      } catch {
        return false;
      }
    },

    listTasks: () => Array.from(tasks.keys()),
  };

  utools.onPluginEnter(({ code, type, payload }) => {
    window.dispatchEvent(
      new CustomEvent("goose-run:plugin-enter", {
        detail: { code, type, payload },
      }),
    );
  });

  if (typeof utools.onPluginOut === "function") {
    utools.onPluginOut(() => {
      subInputHandler = null;
      window.dispatchEvent(new CustomEvent("goose-run:plugin-out"));
    });
  }

  try {
    const { nativeTheme } = require("electron");
    if (nativeTheme) {
      nativeTheme.on("updated", () => {
        window.dispatchEvent(
          new CustomEvent("goose-run:theme-changed", {
            detail: { isDark: nativeTheme.shouldUseDarkColors },
          }),
        );
      });
    }
  } catch (err) {
    console.error("[goose-run] nativeTheme listener failed:", err);
  }
}
