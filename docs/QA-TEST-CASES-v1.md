# OpenClaw Client QA Test Cases (v1)

基线来源：`/Users/kennyzheng/Documents/coding/openclaw client/docs/PRD-openclaw-client-v1.md`  
目标：建立“改完代码 -> 子代理自动验收 -> 人工体验验收”的固定流程。

---

## 1. 执行方式

1. 自动化门禁（每次提交前）：
`cd "/Users/kennyzheng/Documents/coding/openclaw client/app" && pnpm qa:gate`

说明：
`qa:gate` 默认使用 `mock` 聊天模式做稳定门禁，不依赖本机 openclaw 网关状态。  
如需做真实 openclaw 集成验收，可临时执行：  
`OPENCLAW_SMOKE_CHAT_MODE=openclaw_cli pnpm smoke:e2e`

2. 人工体验验收（每个里程碑）：
- 本文第 3 节的手动用例。
- 一次 3-10 分钟，优先验证关键体验而不是全量回归。

---

## 2. 自动化用例（子代理执行）

### A01 - Health 可用
- 目标：本地 API 正常启动。
- 步骤：`GET /health`
- 期望：
1. HTTP 200
2. `ok=true`
3. `service=openclaw-local-api`

### A02 - Agent 列表可读
- 目标：基础 agent 初始化正常。
- 步骤：`GET /v1/agents`
- 期望：
1. HTTP 200
2. 至少 1 个 agent
3. 包含默认 agent（`isDefault=true`）

### A03 - 新建 Agent + Workspace 脚手架
- 目标：满足“1 Agent = 1 Workspace”并生成标准文件。
- 步骤：
1. `POST /v1/agents` 创建 `QA Agent`
2. 读取返回的 `workspace` 目录
- 期望：
1. HTTP 201
2. 目录存在
3. 至少存在 `SOUL.md`、`AGENTS.md`、`TOOLS.md`

### A04 - Telegram Token 格式校验
- 目标：S5 校验逻辑可返回明确错误。
- 步骤：
1. `POST /v1/agents/:id/telegram/verify-token`
2. token 传 `invalid-token`
- 期望：
1. HTTP 400
2. `error.code=INVALID_TELEGRAM_TOKEN`

### A05 - Chat 主链路（mock 模式）
- 目标：保证“发送后有返回”。
- 步骤：`POST /v1/agents/:id/chat` 发送 `qa_ping`
- 期望：
1. HTTP 200
2. `data.reply` 为字符串
3. 回复包含 `qa_ping`

---

## 3. 人工体验验收（你来确认）

### M01 - Agent 区交互不回退
- 步骤：
1. 展开 Agent 区
2. 点击 `Skills/自动任务/模型 API`
- 期望：
1. Agent 区保持展开（不自动收起）

### M02 - 点击 Agent 可进入聊天页
- 步骤：
1. 在左侧点击任意 agent
- 期望：
1. 主区域切换为该 agent 聊天页
2. 头部显示对应 workspace

### M03 - 新建 Agent 可持久化
- 步骤：
1. 点击左侧 `+` 新建 agent
2. 刷新页面
- 期望：
1. 新 agent 仍在列表中
2. 可点击进入其聊天页

### M04 - Telegram 引导 S5 真校验
- 步骤：
1. 进入右上角设置 -> Telegram
2. 在 S5 输入明显错误 token 并点“自动检查”
- 期望：
1. 显示“格式不正确”或“token 无效”明确提示
2. 按钮出现“检查中...”后恢复

### M05 - 错误反馈可读
- 步骤：
1. 触发一次失败（如关掉 API 或断网）
- 期望：
1. UI 有明确错误提示
2. 不是无响应卡死

---

## 4. 通过标准

1. 自动化：`qa:gate` 全绿。  
2. 人工：M01-M03 必过；M04-M05 在当前迭代范围内逐步拉齐。  
3. 任一失败：先修复再进入下一功能开发。
