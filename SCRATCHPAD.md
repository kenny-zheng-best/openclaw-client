# OpenClaw Client - 跨会话记忆

> 每次开新 Claude Code 会话时，先读这个文件。做完任务后更新它。

---

## 当前进行中的任务

（暂无，等待下一个任务启动）

---

## 已完成的任务

### M1 阶段
- [x] 项目脚手架搭建（React + Vite + TypeScript）
- [x] shadcn/ui + Tailwind CSS 集成
- [x] 组件拆分（sidebar, chat-panel, skills-panel, model-config-panel 等）
- [x] 接入 openclaw CLI 主链路（替代 mock）
- [x] 模型配置面板 - 25+ provider 预设，读写 openclaw config
- [x] Skills 管理 - 列表、eligibility 状态、依赖安装
- [x] Agent workspace 脚手架（自动生成 SOUL.md/AGENTS.md/TOOLS.md）
- [x] 多 Agent 管理（新增/切换/独立 workspace）
- [x] Telegram 向导 S5 Token 真校验
- [x] 自动任务（Cron Jobs）CRUD
- [x] MCP 服务器列表 + 导入
- [x] E2E 测试 + CI 流水线

---

## P0 待完成（必须先做）

1. **gateway 自恢复策略**
   - 验收：gateway 不可用时自动尝试恢复；失败时 3 秒内返回可读错误
   - 相关文件：`app/server/local-api.mjs`
   - 备注：openclaw agent 命令在部分场景会长时间等待

2. **统一错误模型**
   - 验收：前端按错误码展示文案（如 GATEWAY_UNAVAILABLE、OPENCLAW_CALL_FAILED）
   - 相关文件：`app/server/local-api.mjs`（定义错误码）、`app/src/api/openclaw.ts`（前端处理）

3. **think 输出清洗**
   - 验收：用户界面不展示 `<think>...</think>` 内容
   - 相关文件：`app/server/local-api.mjs`（响应过滤）

## P1 待完成

1. Telegram 向导剩余步骤执行化
2. 模型 API 连通性测试完善
3. Skills 导入流程
4. MCP 导入流程

## P2 待完成

1. Tauri 桌面壳集成
2. Prevent Sleep 原生接入
3. DMG 打包

---

## 踩过的坑 / 经验

- openclaw agent 命令在部分场景会长时间等待或返回弱诊断信息，adapter 需要更强的超时与日志抽取
- Chat 模式有三种：`openclaw_cli`（默认）、`mock`（开发调试用）、`openai_compat`
- 开发调试时用 `OPENCLAW_CHAT_MODE=mock` 启动 API，不需要真实 openclaw 连接

---

## 架构备忘

- 前端端口：4173（Vite dev）
- API 端口：8787
- Agent workspace 路径：`~/.openclaw-client/workspaces/<agentId>/`
- local-api.mjs 已超过 2800 行，改动需谨慎，注意不要引入回归
