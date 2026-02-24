# OpenClaw Client Demo

本项目是 OpenClaw macOS 客户端的前端 Demo（React + Vite），当前已打通“本地 API 服务 -> OpenClaw CLI -> 聊天回显”的最小真实链路。

## 运行方式

1. 启动本地 API 服务

```bash
pnpm api
```

默认监听：`http://localhost:8787`

默认模式：`openclaw_cli`（需要本机已安装 `openclaw` 并可在终端执行）。

工作目录根路径默认：`~/.openclaw-client/workspaces`

`openclaw_cli` 默认单次 turn 超时为 45 秒，可通过环境变量调整：

```bash
OPENCLAW_AGENT_TIMEOUT_SECONDS=30 pnpm api
```

如果你想切到直连模型（OpenAI 兼容）模式：

```bash
MINIMAX_API_KEY="你的key" \
MINIMAX_BASE_URL="https://api.minimaxi.com/v1" \
MINIMAX_MODEL="MiniMax-M2.5" \
OPENCLAW_CHAT_MODE="openai_compat" \
pnpm api
```

说明：
- 设置 `MINIMAX_API_KEY` 后会自动切到 `openai_compat` 模式。
- 也兼容旧变量：`OPENCLAW_MODEL_BASE_URL / OPENCLAW_MODEL_API_KEY / OPENCLAW_MODEL_NAME`。

2. 启动前端

```bash
pnpm dev --host 0.0.0.0 --port 4173
```

默认访问：`http://localhost:4173`

## 已打通的真实链路

- `POST /v1/agents/:agentId/chat`：发送消息并返回回复
- `GET /health`：本地 API 健康检查
- `1 Agent = 1 Gateway`：服务端默认按 agent 维度绑定 gateway
- 聊天模式：
  - `openclaw_cli`（默认）：调用本机 OpenClaw 运行 Agent 回合
  - `mock`：返回回显消息
  - `openai_compat`：调用真实模型接口
- 每个 agent 自动创建独立目录与基础文件：
  - `~/.openclaw-client/workspaces/<agentId>/SOUL.md`
  - `~/.openclaw-client/workspaces/<agentId>/AGENTS.md`
  - `~/.openclaw-client/workspaces/<agentId>/TOOLS.md`
  - `~/.openclaw-client/workspaces/<agentId>/USER.md`
  - `~/.openclaw-client/workspaces/<agentId>/IDENTITY.md`
  - 兼容迁移：若仅存在旧文件 `soul.md/agent.md/tool.md`，会自动复制内容到新文件名（不删除旧文件）
- 网关状态模拟：
  - `POST /v1/gateways/:gatewayId/disconnect`
  - `POST /v1/gateways/:gatewayId/recover`

## 验证命令

```bash
pnpm test
pnpm build
pnpm smoke:e2e
```

一键完整交付验证：

```bash
pnpm verify:delivery
```

执行后会自动进行：
- 单元测试
- 构建检查
- Playwright 端到端冒烟（自动启动 API/前端，如未运行）

产物路径：
- `output/playwright/e2e-chat/report.json`
- `output/playwright/e2e-chat/chat-success-*.png`

## 故障排查（openclaw_cli 模式）

如果聊天报超时或网关不可用，先在终端确认 OpenClaw 本机链路：

```bash
openclaw tui
# 或
openclaw doctor
```

再重新启动 API 与前端。
