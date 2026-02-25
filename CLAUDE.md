# OpenClaw Client

## 这是什么
OpenClaw CLI 的 GUI 套壳客户端，让普通用户也能用上 OpenClaw。
local-api 是 CLI 的 HTTP 代理层，**不是独立后端**。
数据流：`UI → local-api (port 8787) → openclaw CLI/Gateway → 返回 → UI`

## 技术栈
- 前端：React 19 + Vite + TypeScript + Tailwind CSS 4 + shadcn/ui
- 后端：Node.js ESM (`app/server/local-api.mjs`)，端口 8787
- 测试：Vitest（单测） + Playwright（E2E）
- 包管理：pnpm
- 所有代码在 `app/` 目录下

## 关键命令
```bash
cd app && pnpm dev              # 启动开发环境（API + 前端）
cd app && pnpm test             # 单测
cd app && pnpm build            # 构建
cd app && pnpm smoke:e2e        # E2E 烟雾测试
cd app && pnpm verify:delivery  # 完整验证（test + build + e2e）
cd app && pnpm qa:gate          # QA 门禁（verify + qa:subagent）
```

## 架构核心原则（必须遵守）
- **套壳不替代**：所有功能优先包装 openclaw CLI 原生能力，不自建替代实现
- 实现新功能前先跑 `openclaw --help` 和对应子命令 `--help`，确认 CLI 是否已支持
- local-api 只做 CLI 调用 + JSON 转发，前端只做展示和操作
- 不要在 local-api 里自建状态存储、执行引擎、定时器来替代 OpenClaw 已有功能

## 代码约定
- 用**中文**回复，像教小白一样简单易懂
- 改完 UI/API 后必须跑 `pnpm verify:delivery`，通过才算完成
- 验收时**自动启动服务**让用户浏览器看效果，不要列步骤让用户自己启动
- 启动前检测 8787 端口是否被占用，如是则 kill 后重启

## 功能完成标准（Definition of Done）
1. `pnpm test` 通过
2. `pnpm build` 通过
3. `pnpm smoke:e2e` 通过
4. UI 变更必须截图放在 PR 描述里
5. 自动启动服务，用户浏览器验收通过

## 项目结构（关键文件）
- `app/src/App.tsx` — 主组件，多 Agent 状态管理
- `app/src/api/openclaw.ts` — API 客户端
- `app/src/components/` — React 组件（chat-panel, sidebar, skills-panel 等）
- `app/src/components/ui/` — shadcn/ui 基础组件
- `app/server/local-api.mjs` — 后端 HTTP 代理层（2800+ 行，改动需谨慎）
- `docs/PRD-openclaw-client-v1.md` — 产品需求文档
- `docs/TASKS-v1.md` — 任务清单和优先级
- `SCRATCHPAD.md` — 跨会话记忆，每次开新会话先读这个

## 当前状态
- 分支：`ui/shadcn-redesign`
- 阶段：M1（主链路可用）→ M2 过渡中
- P0 剩余：gateway 自恢复、统一错误模型、think 输出清洗
- P1 进行中：Telegram 向导、模型连通性测试、Skills/MCP 导入

## 模型选择建议
- 架构决策 / Plan Mode → Opus（深度推理）
- 后端 local-api 逻辑 → Opus
- React 组件 / UI 调整 → Sonnet（快速执行）
- 重复性重构 → Sonnet
