# 鹅的运行 · 项目提示词

## 项目定位

- **纯 uTools 插件**，仅在 uTools 环境下运行，不支持独立桌面版
- 不引入 Tauri / Electron 相关依赖
- 本地脚本一键运行 · 实时日志流
- 目标用户：重度 uTools 的工程师，管理日常 shell 脚本

## 运行模式

- **生产环境**：仅通过 uTools 插件加载 `dist-utools/` 运行
- **开发调试**：`bun dev`（Vite dev server, port 6003）提供浏览器降级预览，通过 `src/platform/web.ts` 模拟 uTools API
- 最终验证必须在 uTools 中完成，浏览器预览仅用于 UI 开发

## 技术栈

- React 19 + TypeScript + Vite 8 + Tailwind CSS 4
- 状态管理：Zustand 5
- UI 组件：shadcn/ui（base-ui preset）
- 图标：Lucide React（描边 1.75）
- 构建产物：dist-utools/（uTools 插件包）

## 架构分层

```
React UI → Zustand Store → PlatformAdapter → uTools preload / Web localStorage
```

- `src/platform/utools.ts` — uTools 环境适配器（真实执行，preload 桥接）
- `src/platform/web.ts` — 浏览器降级适配器（模拟执行，用于 dev 调试）
- `src/platform/context.tsx` — React Context 注入适配器

## 验证

- 代码修改后立即执行 `bun run build`（即 `tsc -b && vite build -c vite.config.utools.ts && node utools/scripts/build.js`）
- 查文档使用 context7
- 浏览器验证时先检查是否已 `bun dev`，使用合适的子代理和模型执行

## 组件库

- UI 组件优先使用 shadcn/ui，无覆盖时查 npm 组件库，仍无则手写
- 按钮图标统一用 Lucide，不用 emoji


## 禁止事项

- 不创建 src-tauri/ 目录
- 不在 package.json 中添加 @tauri-apps/* / electron 依赖
- 不在本仓库新增 SwiftUI / AppKit / Xcode 工程（要做原生版另起 `goose-run-mac/`）
