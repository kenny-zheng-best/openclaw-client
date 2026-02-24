# OpenClaw Client Agent Rules

## Delivery Gate (Mandatory)
- Before claiming any UI/API fix is done, run:
  - `cd app && pnpm verify:delivery`
- Do not ask the user to perform basic smoke checks that can be automated locally.
- If verification fails, fix first, then rerun until pass.

## Evidence Required In Response
- Include the latest verification status (`pass`/`fail`).
- Include artifact paths:
  - `app/output/playwright/e2e-chat/report.json`
  - `app/output/playwright/e2e-chat/chat-success-*.png`

## Scope
- This rule applies to all frontend/backend chat-path changes in this repo.

## 验收流程 (Mandatory)
- 每次功能开发完成后，必须**自动启动服务**让用户直接在浏览器验收，不要只列步骤让用户自己启动。
- 具体做法：
  1. 先跑完自测（`pnpm test` + `pnpm build`）。
  2. 检测 8787 端口是否被旧进程占用，如是则 kill 后重启。
  3. 用 `OPENCLAW_CHAT_MODE=mock` 启动 API server（后台）。
  4. 启动 Vite dev server（后台）。
  5. 告诉用户浏览器打开哪个地址、点哪里看新功能。
- 不要让用户手动执行启动命令。

## 架构核心原则：套壳 OpenClaw，不自建替代

本项目是 OpenClaw 的 GUI 套壳客户端。`local-api` 是 OpenClaw CLI 的 HTTP 代理层，**不是独立后端**。

- **所有功能模块优先包装 OpenClaw CLI 原生能力，不自建替代实现。**
- 实现新功能前，先运行 `openclaw --help` 和对应子命令的 `--help`，确认 OpenClaw 是否已原生支持。
- 如果 OpenClaw 已有对应能力（如 `cron`、`skills`、`models`、`agents`），则 local-api 只做 CLI 调用 + JSON 转发，前端只做展示和操作。
- 不要在 local-api 里自建状态存储、执行引擎、定时器等来"替代" OpenClaw 已有的功能。
- 数据流始终是：`UI -> local-api -> openclaw CLI/Gateway -> 返回 -> UI`

## 我是谁 + 基本要求
- 我是小白，没有代码经验。
- 所有解释都用**中文** + **超级简单的话**，像教 5 岁小孩一样。