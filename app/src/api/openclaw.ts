export type GatewayHealth = 'Healthy' | 'Recovering' | 'Degraded'

export interface AgentSummary {
  id: string
  name: string
  workspace: string
  isDefault?: boolean
  gateway: {
    id: string
    health: GatewayHealth
  }
}

export interface AgentChatResult {
  agentId: string
  reply: string
  gateway: {
    id: string
    health: GatewayHealth
  }
  createdAt: string
  diagnostics?: {
    chatMode: string
    sessionKey: string | null
    elapsedMs: number
    agentTimeoutSeconds: number
    gatewayCallTimeoutMs: number
  }
}

export interface TelegramTokenVerifyResult {
  agentId: string
  bot: {
    id: string
    username: string
    firstName: string
    canJoinGroups: boolean
    canReadAllGroupMessages: boolean
    supportsInlineQueries: boolean
  }
}

interface ApiEnvelope<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}

export class OpenClawApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code = 'UNKNOWN_ERROR') {
    super(message)
    this.name = 'OpenClawApiError'
    this.status = status
    this.code = code
  }
}

const API_BASE = import.meta.env.VITE_OPENCLAW_API_BASE ?? 'http://localhost:8787'

async function parseApiEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return (await response.json()) as ApiEnvelope<T>
  } catch {
    return null
  }
}

function throwApiError<T>(response: Response, payload: ApiEnvelope<T> | null): never {
  const fallbackMessage = response.ok ? '请求失败，请稍后重试。' : `请求失败（HTTP ${response.status}）`
  throw new OpenClawApiError(
    payload?.error?.message ?? fallbackMessage,
    response.status,
    payload?.error?.code ?? 'API_ERROR',
  )
}

export async function checkLocalApiHealth(): Promise<void> {
  const response = await fetch(`${API_BASE}/health`)
  if (!response.ok) {
    throw new OpenClawApiError('本地 API 不可用', response.status, 'HEALTH_CHECK_FAILED')
  }
}

export async function listAgents(): Promise<AgentSummary[]> {
  const response = await fetch(`${API_BASE}/v1/agents`)
  const payload = await parseApiEnvelope<AgentSummary[]>(response)
  if (!response.ok || !payload?.ok || !payload.data) {
    throwApiError(response, payload)
  }
  return payload.data
}

export async function createAgent(name: string): Promise<AgentSummary> {
  const response = await fetch(`${API_BASE}/v1/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })

  const payload = await parseApiEnvelope<AgentSummary>(response)
  if (!response.ok || !payload?.ok || !payload.data) {
    throwApiError(response, payload)
  }
  return payload.data
}

export async function updateAgent(agentId: string, name: string): Promise<AgentSummary> {
  const response = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(agentId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name }),
  })

  const payload = await parseApiEnvelope<AgentSummary>(response)
  if (!response.ok || !payload?.ok || !payload.data) {
    throwApiError(response, payload)
  }
  return payload.data
}

export async function openLocalPath(targetPath: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/system/open-path`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: targetPath,
    }),
  })

  const payload = await parseApiEnvelope<{ path: string }>(response)
  if (!response.ok || !payload?.ok) {
    throwApiError(response, payload)
  }
}

export async function verifyTelegramToken(agentId: string, token: string): Promise<TelegramTokenVerifyResult> {
  const response = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(agentId)}/telegram/verify-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token,
    }),
  })

  const payload = await parseApiEnvelope<TelegramTokenVerifyResult>(response)
  if (!response.ok || !payload?.ok || !payload.data) {
    throwApiError(response, payload)
  }
  return payload.data
}

export async function sendAgentMessage(agentId: string, message: string): Promise<AgentChatResult> {
  const response = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(agentId)}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
    }),
  })

  const payload = await parseApiEnvelope<AgentChatResult>(response)

  if (!response.ok || !payload?.ok || !payload.data) {
    throwApiError(response, payload)
  }

  return payload.data
}

// --- Model Config API (OpenClaw CLI) ---

export interface OpenClawProviderEntry {
  baseUrl?: string
  apiKey?: string
  api?: string
  region?: string
  models?: Array<{ id: string; name: string; contextWindow?: number }>
}

export interface OpenClawModelConfig {
  fullModel: string
  providers: Record<string, OpenClawProviderEntry>
}

export interface SaveModelConfigPayload {
  fullModel: string
  provider: {
    name: string
    baseUrl?: string
    apiKey?: string
    api?: string
    region?: string
    models?: Array<{ id: string; name: string; contextWindow?: number }>
  }
}

export interface ModelTestResult {
  success: boolean
  latencyMs: number
  modelName: string
  error?: string
}

export async function getModelConfig(): Promise<OpenClawModelConfig> {
  const response = await fetch(`${API_BASE}/v1/system/model-config`)
  const payload = await parseApiEnvelope<OpenClawModelConfig>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function saveModelConfig(config: SaveModelConfigPayload): Promise<OpenClawModelConfig> {
  const response = await fetch(`${API_BASE}/v1/system/model-config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  const payload = await parseApiEnvelope<OpenClawModelConfig>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function testModelConnectivity(): Promise<ModelTestResult> {
  const response = await fetch(`${API_BASE}/v1/system/model-test`, { method: 'POST' })
  const payload = await parseApiEnvelope<ModelTestResult>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

// --- Skills API ---

export interface SkillEntry {
  name: string
  description: string
  emoji?: string
  eligible: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  source: string
  homepage?: string
  missing: {
    bins: string[]
    anyBins: string[]
    env: string[]
    config: string[]
    os: string[]
  }
}

export interface SkillListResponse {
  skills: SkillEntry[]
  summary: { total: number; eligible: number }
}

export async function listSkills(): Promise<SkillListResponse> {
  const response = await fetch(`${API_BASE}/v1/skills`)
  const payload = await parseApiEnvelope<SkillListResponse>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

// --- MCP API ---

export interface McpEntry {
  id: string
  name: string
  transport: string
  endpoint: string
  status: 'connected' | 'disconnected' | 'error'
  config?: Record<string, unknown>
}

export async function listMcpServers(): Promise<McpEntry[]> {
  const response = await fetch(`${API_BASE}/v1/mcp`)
  const payload = await parseApiEnvelope<McpEntry[]>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function importMcpConfig(config: { name: string; transport: string; endpoint: string; config?: Record<string, unknown> }): Promise<McpEntry> {
  const response = await fetch(`${API_BASE}/v1/mcp/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  const payload = await parseApiEnvelope<McpEntry>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function removeMcpServer(mcpId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/mcp/${encodeURIComponent(mcpId)}`, { method: 'DELETE' })
  const payload = await parseApiEnvelope<{ removed: boolean }>(response)
  if (!response.ok || !payload?.ok) { throwApiError(response, payload) }
}

// --- Automation Tasks API ---

export interface AutomationTaskEntry {
  id: string
  agentId: string
  name: string
  prompt: string
  intervalValue: number
  intervalUnit: 'minutes' | 'hours'
  status: 'running' | 'paused' | 'stopped'
  createdAt: string
  lastRunAt: string | null
  lastRunResult: string | null
  lastRunSuccess: boolean | null
  nextRunAt: string | null
}

export async function listTasks(agentId: string): Promise<AutomationTaskEntry[]> {
  const response = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(agentId)}/tasks`)
  const payload = await parseApiEnvelope<AutomationTaskEntry[]>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function createTask(
  agentId: string,
  task: { name: string; prompt: string; intervalValue: number; intervalUnit: 'minutes' | 'hours' },
): Promise<AutomationTaskEntry> {
  const response = await fetch(`${API_BASE}/v1/agents/${encodeURIComponent(agentId)}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  })
  const payload = await parseApiEnvelope<AutomationTaskEntry>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function updateTaskStatus(
  agentId: string,
  taskId: string,
  status: 'running' | 'paused' | 'stopped',
): Promise<AutomationTaskEntry> {
  const response = await fetch(
    `${API_BASE}/v1/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    },
  )
  const payload = await parseApiEnvelope<AutomationTaskEntry>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function removeTask(agentId: string, taskId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE}/v1/agents/${encodeURIComponent(agentId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: 'DELETE' },
  )
  const payload = await parseApiEnvelope<{ removed: boolean }>(response)
  if (!response.ok || !payload?.ok) { throwApiError(response, payload) }
}

// --- Native Cron Jobs API (OpenClaw Gateway) ---

export interface CronJobSchedule {
  kind: 'every' | 'cron' | 'at'
  everyMs?: number
  cron?: string
  atMs?: number
  tz?: string
}

export interface CronJobPayload {
  kind: 'agentTurn' | 'systemEvent'
  message?: string
  systemEvent?: string
  channel?: string
}

export interface CronJobState {
  lastRunAtMs?: number
  nextRunAtMs?: number
  lastRunOk?: boolean
  lastRunError?: string
  runCount?: number
}

export interface CronJobEntry {
  id: string
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun: boolean
  createdAtMs: number
  updatedAtMs: number
  schedule: CronJobSchedule
  sessionTarget: 'main' | 'isolated'
  wakeMode: 'now' | 'next-heartbeat'
  agentId?: string
  payload: CronJobPayload
  isolation?: {
    postToMainPrefix?: string
    postToMainMode?: string
    postToMainMaxChars?: number
  }
  state: CronJobState
}

export async function listCronJobs(): Promise<CronJobEntry[]> {
  const response = await fetch(`${API_BASE}/v1/cron/jobs`)
  const payload = await parseApiEnvelope<CronJobEntry[]>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function createCronJob(opts: {
  name: string
  message: string
  every?: string
  cron?: string
  agent?: string
  description?: string
  disabled?: boolean
}): Promise<CronJobEntry> {
  const response = await fetch(`${API_BASE}/v1/cron/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  const payload = await parseApiEnvelope<CronJobEntry>(response)
  if (!response.ok || !payload?.ok || !payload.data) { throwApiError(response, payload) }
  return payload.data
}

export async function enableCronJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/cron/jobs/${encodeURIComponent(jobId)}/enable`, { method: 'POST' })
  const payload = await parseApiEnvelope<{ enabled: boolean }>(response)
  if (!response.ok || !payload?.ok) { throwApiError(response, payload) }
}

export async function disableCronJob(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/cron/jobs/${encodeURIComponent(jobId)}/disable`, { method: 'POST' })
  const payload = await parseApiEnvelope<{ disabled: boolean }>(response)
  if (!response.ok || !payload?.ok) { throwApiError(response, payload) }
}

export async function removeCronJobApi(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/v1/cron/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
  const payload = await parseApiEnvelope<{ removed: boolean }>(response)
  if (!response.ok || !payload?.ok) { throwApiError(response, payload) }
}
