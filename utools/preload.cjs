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
    showNotification: (text, clickFeatureCode) => {
      safeCall(utools?.showNotification, text, clickFeatureCode);
    },
    openExternal: (url) => {
      safeCall(utools?.shellOpenExternal, url);
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

    startTask: (taskId, { script, cwd, env, shell, login }) => {
      if (tasks.has(taskId)) return false;
      const sh = shell === "zsh" ? "zsh" : shell === "sh" ? "sh" : "bash";
      const useLogin = login === false ? false : true;
      const shArgs = useLogin ? ["-lc", script] : ["-c", script];
      let proc;
      try {
        proc = spawn(sh, shArgs, {
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
        if (proc._killTimer) {
          clearTimeout(proc._killTimer);
          proc._killTimer = null;
        }
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
        p._killTimer = setTimeout(() => {
          if (!tasks.has(taskId)) return;
          try {
            process.kill(-p.pid, "SIGKILL");
          } catch {
            try {
              p.kill("SIGKILL");
            } catch {}
          }
        }, 3000);
        return true;
      } catch {
        return false;
      }
    },

    listTasks: () => Array.from(tasks.keys()),

    pickDirectory: () => {
      try {
        const paths = utools.showOpenDialog({
          title: "选择工作目录",
          buttonLabel: "选择",
          properties: ["openDirectory"],
        });
        if (!paths || paths.length === 0) return null;
        return paths[0];
      } catch (err) {
        console.error("[goose-run] pickDirectory failed:", err);
        return null;
      }
    },

    readFileText: (path) => {
      try {
        const fs = require("fs");
        return fs.readFileSync(path, "utf-8");
      } catch (err) {
        console.error("[goose-run] readFileText failed:", err);
        return null;
      }
    },

    // 结束占用端口的进程：按 LISTEN 端口定位 pid 并 SIGTERM。
    // 用于「停止/重启」外部启动的服务（无任务句柄，只能按端口杀）。端口本就空闲也算成功。
    killPort: (port) => {
      const p = parseInt(port, 10);
      if (!Number.isInteger(p) || p < 1 || p > 65535) return Promise.resolve(false);
      // macOS BSD xargs 无 -r，空输入会误跑 kill；改用 shell 守卫拿 pid 再杀
      const command = `pids=$(lsof -ti tcp:${p} -sTCP:LISTEN); if [ -n "$pids" ]; then kill $pids; fi`;
      return new Promise((resolve) => {
        let settled = false;
        let child;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            child.kill();
          } catch {}
          resolve(false);
        }, 3000);
        try {
          child = spawn("bash", ["-lc", command], {
            cwd: process.env.HOME,
            env: process.env,
            stdio: ["ignore", "ignore", "ignore"],
          });
          child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(code === 0);
          });
          child.on("error", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(false);
          });
        } catch {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(false);
          }
        }
      });
    },

    // 运行探测：跑一条命令，exit 0 视为「运行中」。带 3s 超时，避免卡死。
    probeRunning: (command) => {
      if (typeof command !== "string" || !command.trim()) {
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        let settled = false;
        let child;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try {
            child.kill();
          } catch {}
          resolve(false);
        }, 3000);
        try {
          child = spawn("bash", ["-lc", command], {
            cwd: process.env.HOME,
            env: process.env,
            stdio: ["ignore", "ignore", "ignore"],
          });
          child.on("close", (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(code === 0);
          });
          child.on("error", () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(false);
          });
        } catch {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(false);
          }
        }
      });
    },
  };

  utools.onPluginEnter(({ code, type, payload }) => {
    window.dispatchEvent(
      new CustomEvent("goose-run:plugin-enter", {
        detail: { code, type, payload },
      }),
    );
  });

  if (typeof utools.onPluginOut === "function") {
    utools.onPluginOut((isKill) => {
      subInputHandler = null;
      if (isKill === true) {
        tasks.forEach((p) => {
          try {
            process.kill(-p.pid, "SIGKILL");
          } catch {
            try {
              p.kill("SIGKILL");
            } catch {}
          }
        });
        tasks.clear();
      }
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
