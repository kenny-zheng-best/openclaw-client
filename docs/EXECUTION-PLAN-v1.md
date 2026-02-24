# OpenClaw Client 执行方案（v1）

## 1. 总体策略
先做“本地已安装 OpenClaw 的稳定套壳客户端”，暂不做一键安装。

执行原则：
1. 稳定性优先于功能数量。
2. 主链路优先于视觉完善。
3. 每个阶段必须有可演示成果和验收标准。

---

## 2. 分阶段路线

## Phase A（P0，当前）
目标：让产品“像 OpenClaw”并稳定可用。

交付标准：
1. Chat 调用走本机 OpenClaw（非 mock）。
2. gateway 不可用时自动恢复或明确报错。
3. 每个 agent 独立 workspace 目录自动创建。
4. UI 不再出现“发送后无反馈”。

## Phase B（P1）
目标：补齐高频配置能力。

交付标准：
1. Telegram 绑定向导从演示流升级到可执行流。
2. 模型 API 配置可测试连通性。
3. Skills / MCP 至少支持导入与状态展示。

## Phase C（P2）
目标：桌面化与可分发。

交付标准：
1. 引入 Tauri 壳并能本地打包。
2. Prevent Sleep 接入系统能力（默认开启，仅防系统睡眠）。
3. DMG 安装包内测可安装运行。

---

## 3. Worktree 与 Agent Team 方案

结论：现在适合开 3 条并行线，但只在 Phase A 末尾后扩大并行。

角色与边界：
1. Core Agent（主线，必须先完成）
职责：OpenClaw adapter、gateway 恢复、错误诊断、主链路稳定。

2. UX Agent（并行）
职责：聊天页状态提示、错误反馈、引导文案、设置体验优化。

3. Integration Agent（并行）
职责：Telegram 可执行化、模型 API 测试、skills/mcp 导入骨架。

分支/工作树规范：
1. 分支前缀统一 `codex/`。
2. 每个 worktree 一条职责，不跨模块大改。
3. 合并顺序：Core -> UX -> Integration。

---

## 4. 目录与运行约定

关键目录：
1. 工作区根目录：`~/.openclaw-client/workspaces`
2. 每 agent 基础文件：`SOUL.md`、`AGENTS.md`、`TOOLS.md`（兼容读取旧小写文件名）

本地启动：
1. API：`pnpm api`
2. 前端：`pnpm dev --host 0.0.0.0 --port 4173`
3. 访问：`http://localhost:4173`

验收命令：
1. `pnpm test`
2. `pnpm build`

---

## 5. 本周执行节奏（建议）

Day 1-2：
1. 锁定 openclaw_cli 主链路稳定性。
2. 解决 gateway timeout 与失败反馈。

Day 3-4：
1. Telegram 引导从“演示”升级到“可执行检查”。
2. 模型 API 页面增加连通性测试。

Day 5：
1. 整体验收。
2. 整理 Phase B backlog。

---

## 6. 你需要配合的最小输入

1. OpenClaw CLI 版本升级窗口（是否允许升级到推荐版本）。
2. 你常用的模型 provider 与模型名（用于默认模板）。
3. Telegram 测试账号（仅用于本地联调，不提交仓库）。

---

## 7. 下一步决策（立即执行）

我将按下面顺序推进：
1. 先完成 Core Agent 的 P0 稳定化。
2. 稳定后再正式开 2 个并行 worktree（UX / Integration）。
3. 每完成一个小里程碑给你可体验 URL 与验收点。
