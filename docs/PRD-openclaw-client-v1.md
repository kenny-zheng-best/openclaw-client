# OpenClaw Client PRD (v1)

## 1. 文档目标
本 PRD 用于统一后续多 agent 协作开发，确保产品方向、功能边界、交互逻辑、技术架构和验收标准一致。

版本：v1.0  
状态：已确认可执行（MVP 优先）  
日期：2026-02-19

---

## 2. 产品背景与问题

### 2.1 为什么做
1. OpenClaw 很火，但安装与配置复杂，普通用户容易失败。  
2. 即使安装成功，使用方式（模型、网关、IM、skills、MCP）依然门槛高。  
3. 目标是做一个普通人可用的客户端：完成必要配置后可直接使用。

### 2.2 当前阶段策略
先做 **“本地已安装 OpenClaw 的套壳客户端”**，验证体验闭环。  
后续再做 **“一键安装 OpenClaw”**（面向未安装用户）。

---

## 3. 目标用户
1. 已安装 OpenClaw、会少量终端操作的早期用户（MVP）。  
2. 不会终端操作、只接受图形化流程的普通用户（后续版本）。

---

## 4. 产品目标与非目标

### 4.1 目标（MVP）
1. macOS 图形化客户端可安装可运行。  
2. 聊天主链路可用：UI -> 本地 API -> 本机 OpenClaw -> 返回回复。  
3. 多 Agent 管理可用（新增/切换/独立 workspace）。  
4. Telegram 绑定提供“无脑跟做”的分步引导（先实现引导闭环，再逐步自动化）。  
5. 稳定性优先：断线可恢复、失败可诊断。

### 4.2 非目标（MVP）
1. 不在 MVP 解决跨平台（先 macOS）。  
2. 不在 MVP 覆盖所有 IM（先 Telegram）。  
3. 不在 MVP 完成 OpenClaw 自动安装（后续阶段）。

---

## 5. 核心产品原则
1. **默认简单**：用户不需要理解复杂概念即可使用。
2. **稳定优先**：失败要可恢复、可定位。
3. **本地优先**：核心能力先本地闭环，减少外部依赖。
4. **渐进增强**：先打通主链路，再扩展 skills/MCP/自动任务。
5. **交互友好**：参考 Codex 的清晰工作台和可解释反馈。
6. **套壳不替代**：所有功能模块优先包装 OpenClaw CLI 原生能力（`openclaw cron`、`openclaw skills`、`openclaw models` 等），local-api 是 CLI 的 HTTP 代理层，不自建替代实现。

---

## 6. 信息架构与交互（已确认）

### 6.1 左侧导航顺序（固定）
1. Agent（默认 agent + 新增 agent）  
2. Skills（参考 Codex）  
3. 自动任务（参考 Codex）  
4. 模型 API（类似 cc switch）  
5. 底部：设置（全局设置，参考 Codex）

### 6.2 Agent 交互
1. Agent 区域可展开/收起。  
2. Agent 标题右侧 `+`：一键创建 agent。  
3. **关键规则**：点击 Skills/自动任务/模型 API 时，不自动收起 Agent 区域。  
4. 点击 agent item 进入该 agent 的聊天页。

### 6.3 IM 设置入口
1. IM 配置不放左侧全局导航。  
2. 放在 agent 聊天窗口右上角“设置”里（符合用户直觉：给这个 agent 配 IM）。

### 6.4 视觉风格
1. “Codex 风格的简洁工作台 + 轻终端感”。  
2. 信息密度高但不杂乱；反馈明确（状态、错误、恢复动作）。

---

## 7. 功能需求（按模块）

## 7.1 Agent 系统

### 需求
1. 默认创建 `main` agent。  
2. 支持新增 agent。  
3. 每个 agent 必须使用**独立 workspace**（避免上下文、记忆、技能覆盖相互串扰）：
   - workspace 根路径：`~/.openclaw-client/workspaces`
   - 每个 agent 路径：`~/.openclaw-client/workspaces/<agentId>`
4. 每个 agent 的 workspace 需要包含 OpenClaw 标准文件（对齐上游命名，避免与文档/社区约定产生歧义）：
   - `SOUL.md`（必需）
   - `AGENTS.md`（必需；上游使用 `AGENTS.md`，不使用 `agent.md`）
   - `TOOLS.md`（必需；上游使用 `TOOLS.md`，不使用 `tool.md`）
   - `USER.md`（推荐）
   - `IDENTITY.md`（推荐）
   - `HEARTBEAT.md`（可选；用于定义心跳/定期检查的最小清单）
   - `MEMORY.md`（可选；长期记忆汇总）
   - `memory/YYYY-MM-DD.md`（可选；按日记忆日志目录与文件）
   - `BOOTSTRAP.md`（仅首次初始化可选；完成一次性引导后可删除）
   - `BOOT.md`（可选；gateway 重启时的启动清单）
5. 默认模式：`1 Agent = 1 Gateway`（用户不需要理解实现细节，只看到结果状态）。

### 验收
1. 新建 agent 后，`~/.openclaw-client/workspaces/<agentId>` 自动生成。  
2. workspace 内至少包含 `SOUL.md`、`AGENTS.md`、`TOOLS.md`（空文件允许，但必须存在）。  
3. 如启用 heartbeat 能力，则 `HEARTBEAT.md` 存在且可被读取。  
4. 不同 agent 切换时上下文与状态不串。

---

## 7.2 Chat 主链路（MVP 核心）

### 需求
1. 前端发送消息到本地 API。  
2. 本地 API 调本机 OpenClaw（非 mock）并返回结果。  
3. 显示发送中、失败原因、恢复建议。  
4. 过滤不应直接展示给用户的内部推理内容（如 `<think>...</think>`）。

### 验收
1. 用户在聊天框发送后，能在合理时间内得到回复或明确错误。  
2. 失败不是“无响应”，而是可读错误。

---

## 7.3 Gateway 稳定性

### 需求
1. 检测 gateway 可用性。  
2. 失败时自动尝试恢复（启动/重连/重试一次）。  
3. UI 展示 gateway 健康状态（Healthy / Recovering / Degraded）。

### 验收
1. gateway 短暂异常后可自动恢复或给出明确修复路径。  
2. 不出现无提示卡死。

---

## 7.4 Telegram（MVP 仅此 IM）

### 需求
1. 内置分步向导，用户逐步点击“下一步”完成绑定。  
2. 引导流程覆盖：
   - 打开 BotFather
   - 创建 bot
   - 设置 username
   - 粘贴并验证 token
   - 应用配置
   - 首条消息触发 pairing
   - 审批 pairing
   - 回环测试
3. 每一步有明确“当前状态/下一步动作/失败提示”。

### 验收
1. 用户不懂 Telegram API 细节也能按步骤完成。  
2. 任一步失败时有明确提示并可继续。

---

## 7.5 Skills

### 需求
1. Skills 页面可查看已安装。  
2. 支持一键安装推荐 skill。  
3. 支持导入 skill（本地包或配置）。

### 验收
1. 安装/导入后状态可见，且可用于 agent。

---

## 7.6 MCP

### 需求
1. MCP 页面可查看配置列表。  
2. 提供推荐 MCP 模板。  
3. 支持导入 MCP 配置。

### 验收
1. MCP 配置成功后可被 agent 使用并可观察状态。

---

## 7.7 模型 API

### 需求
1. 支持配置主流 API（至少 OpenAI 兼容 + MiniMax）。  
2. 可切换默认模型与 provider。  
3. 提供连通性测试。

### 验收
1. 模型配置错误时给出明确错误。  
2. 配置正确后聊天链路可用。

---

## 7.8 自动任务

### 需求
1. 参考 Codex 的自动任务入口。  
2. 支持创建基础定时任务（后续扩展）。

### 验收
1. 能创建、查看、启停任务（MVP 可简化为基础版本）。

---

## 7.9 Prevent Sleep

### 需求
1. 默认开启。  
2. 默认仅阻止系统睡眠，不强制亮屏。  
3. 在全局设置可见且可开关。

### 验收
1. 运行任务时系统不睡眠。  
2. 用户可以关闭该能力。

---

## 8. 技术架构（阶段性）

## 8.1 当前推荐架构（MVP）
1. 前端：React + Vite（现有）。  
2. 本地 API：Node（现有 `server/local-api.mjs`）。  
3. 执行层：OpenClaw CLI adapter（调用本机 `openclaw`）。  
4. 工作目录：`~/.openclaw-client/workspaces/<agentId>`。

### 数据流
`UI -> local-api -> openclaw cli/gateway -> reply -> UI`

## 8.2 下一阶段
1. 将 Web 包装进 macOS 桌面容器（建议 Tauri）。  
2. 接入系统能力：Prevent Sleep、托盘、开机自启。  
3. 再进入“一键安装 OpenClaw”能力建设。

---

## 9. 里程碑

### M1（正在做）
1. UI 主链路可用。  
2. local-api 对接本地 openclaw。  
3. 多 agent + 独立 workspace 脚手架。

### M2
1. Telegram 绑定从“引导”为主，升级为“引导 + 自动检查 + 自动应用”。  
2. 网关恢复策略稳定化（重试、回退、日志诊断）。

### M3
1. Tauri mac 客户端打包（dmg）。  
2. Prevent Sleep 原生能力接入。  
3. 自动任务、skills、MCP 进入可用版本。

### M4
1. OpenClaw 一键安装（面向零基础用户）。

---

## 10. 验收指标（MVP）
1. 新用户（已安装 openclaw）10 分钟内完成首次对话。  
2. 首次发送成功率 >= 95%（可重试后）。  
3. 失败请求 100% 有可读错误提示。  
4. Agent 工作目录与配置文件创建成功率 100%。

---

## 11. 风险与应对
1. **OpenClaw CLI 行为不稳定/版本差异**  
应对：adapter 做超时、重试、兼容解析；固定最低支持版本。

2. **Gateway 偶发断连**  
应对：预检 + 自动拉起 + 单次重试 + 状态可视化。

3. **不同模型返回格式差异（如 think 泄露）**  
应对：统一输出清洗层，禁止直接展示内部推理片段。

4. **后续安装问题复杂度高**  
应对：当前阶段先不做，单独立项“一键安装器”。

---

## 12. 给后续 Agent 的执行说明（Handoff）
1. 先看本 PRD，再看代码中的 `app/server/local-api.mjs` 与 `app/src/App.tsx`。  
2. 新增功能遵循“小步提交、可回滚、先测后改”。  
3. 不得改变已确认交互：
   - 左侧导航顺序
   - Agent 不随 tab 点击自动收起
   - IM 设置入口在聊天页右上角
4. 优先处理稳定性和错误可见性，再做视觉优化。

