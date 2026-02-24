# OpenClaw Client 任务清单（v1）

状态标记：
- `TODO` 未开始
- `DOING` 进行中
- `DONE` 已完成
- `BLOCKED` 阻塞

---

## P0（必须先完成）

1. `DOING` 接入 openclaw_cli 主链路（替代 mock）
验收：聊天请求确实调用本机 `openclaw` 并返回回复。

2. `TODO` gateway 自恢复策略
验收：gateway 不可用时自动尝试恢复；失败时 3 秒内返回可读错误。

3. `TODO` 统一错误模型
验收：前端按错误码展示文案（如 `GATEWAY_UNAVAILABLE`、`OPENCLAW_CALL_FAILED`）。

4. `TODO` think 输出清洗
验收：用户界面不展示 `<think>...</think>` 内容。

5. `DONE` agent workspace 脚手架稳定化
验收：新建 agent 后自动有 `SOUL.md/AGENTS.md/TOOLS.md`（并兼容旧 `soul.md/agent.md/tool.md`）。

---

## P1（P0 后进入）

1. `DOING` Telegram 向导执行化（已完成 S5 Token 真校验）
验收：每步可检查、可失败提示、可继续。

2. `TODO` 模型 API 连通性测试
验收：支持保存配置 + 一键测试 + 结果提示。

3. `TODO` Skills 导入骨架
验收：可导入并显示安装状态。

4. `TODO` MCP 导入骨架
验收：可导入并显示状态。

---

## P2（桌面化）

1. `TODO` Tauri 壳集成
验收：可本地启动桌面 app。

2. `TODO` Prevent Sleep 原生接入
验收：默认开启，仅阻止系统睡眠，支持开关。

3. `TODO` DMG 打包
验收：可安装并启动。

---

## 协作分工（Agent Team）

1. Core Agent
负责：P0 全部任务，尤其是 openclaw_cli 与 gateway 稳定性。

2. UX Agent
负责：错误状态可视化、交互一致性、引导可理解性。

3. Integration Agent
负责：Telegram / 模型 API / Skills / MCP 的可执行化。

---

## Worktree 命令（准备好后执行）

```bash
cd "/Users/kennyzheng/Documents/coding/openclaw client"

# Core
git worktree add ../openclaw-client-core -b codex/s1-core-runtime

# UX
git worktree add ../openclaw-client-ux -b codex/s1-ux

# Integration
git worktree add ../openclaw-client-integration -b codex/s1-integration
```

说明：
1. 先在主仓完成一次“P0 基线提交”，再开并行 worktree，避免三条线基线不一致。
2. 每条线只改本职责范围，PR 走小步合并。

---

## 当前阻塞

1. openclaw `agent` 命令在部分场景会长时间等待或返回弱诊断信息。
需要在 adapter 增加更强的超时与日志抽取。
