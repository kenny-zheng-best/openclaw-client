import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const PORT = Number(process.env.OPENCLAW_LOCAL_API_PORT ?? 8787)
const OPENCLAW_BIN = process.env.OPENCLAW_BIN ?? 'openclaw'
const OPENCLAW_CLIENT_ROOT = process.env.OPENCLAW_CLIENT_ROOT ?? join(homedir(), '.openclaw-client')
const WORKSPACE_ROOT = process.env.OPENCLAW_WORKSPACE_ROOT ?? join(homedir(), '.openclaw-client', 'workspaces')
const OPENCLAW_CONFIG_PATH = join(homedir(), '.openclaw', 'openclaw.json')
const AGENTS_STATE_FILE = process.env.OPENCLAW_AGENTS_STATE_FILE ?? join(OPENCLAW_CLIENT_ROOT, 'agents.json')
const OPENCLAW_AGENT_TIMEOUT_SECONDS = Number(process.env.OPENCLAW_AGENT_TIMEOUT_SECONDS ?? 45)
const OPENCLAW_GATEWAY_CALL_TIMEOUT_MS = Number(
  process.env.OPENCLAW_GATEWAY_CALL_TIMEOUT_MS ?? Math.max((OPENCLAW_AGENT_TIMEOUT_SECONDS + 30) * 1000, 90000),
)
const OPENCLAW_GATEWAY_BOOT_WAIT_MS = Number(process.env.OPENCLAW_GATEWAY_BOOT_WAIT_MS ?? 2200)
const OPENCLAW_THINKING_LEVEL = process.env.OPENCLAW_THINKING_LEVEL ?? 'minimal'
const TELEGRAM_API_BASE_URL = process.env.OPENCLAW_TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org'
const TELEGRAM_VERIFY_TIMEOUT_MS = Number(process.env.OPENCLAW_TELEGRAM_VERIFY_TIMEOUT_MS ?? 12000)
const TELEGRAM_AGENT_STATE_FILE =
  process.env.OPENCLAW_TELEGRAM_AGENT_STATE_FILE ?? join(OPENCLAW_CLIENT_ROOT, 'telegram-agents.json')

let MODEL_BASE_URL =
  process.env.OPENCLAW_MODEL_BASE_URL ??
  process.env.MINIMAX_BASE_URL ??
  process.env.MINIMAX_MODEL_BASE_URL ??
  'https://api.minimaxi.com/v1'
let MODEL_API_KEY =
  process.env.OPENCLAW_MODEL_API_KEY ??
  process.env.MINIMAX_API_KEY ??
  process.env.MINIMAX_CODING_PLAN_KEY ??
  ''
let MODEL_NAME =
  process.env.OPENCLAW_MODEL_NAME ??
  process.env.MINIMAX_MODEL_NAME ??
  process.env.MINIMAX_MODEL ??
  'MiniMax-M2.5'
const CHAT_MODE = process.env.OPENCLAW_CHAT_MODE ?? 'openclaw_cli'
const MODEL_TIMEOUT_MS = Number(process.env.OPENCLAW_MODEL_TIMEOUT_MS ?? 30000)

// --- Provider routing ---
/** @type {'openai_compat' | 'aws_bedrock'} */
let MODEL_PROVIDER = process.env.OPENCLAW_MODEL_PROVIDER ?? 'openai_compat'

// --- AWS Bedrock config ---
let BEDROCK_REGION = process.env.OPENCLAW_BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1'
let BEDROCK_MODEL_ID = process.env.OPENCLAW_BEDROCK_MODEL_ID ?? process.env.ANTHROPIC_MODEL ?? ''
let BEDROCK_BEARER_TOKEN = process.env.OPENCLAW_BEDROCK_BEARER_TOKEN ?? process.env.AWS_BEARER_TOKEN_BEDROCK ?? ''

/** @typedef {'Healthy' | 'Recovering' | 'Degraded'} GatewayHealth */
/** @typedef {'mock' | 'openai_compat' | 'openclaw_cli'} ChatMode */
/** @typedef {{ id: string, name: string, gatewayId: string, workspace: string, isDefault?: boolean }} AgentRecord */

/** @type {ChatMode} */
const activeChatMode = CHAT_MODE

const workspaceFor = (agentId) => join(WORKSPACE_ROOT, agentId)
const sessionKeyFor = (agentId) => `agent:${agentId}:occlient-${agentId}`

/** @type {AgentRecord[]} */
const DEFAULT_AGENT_RECORDS = [
  { id: 'main', name: '默认 Agent', gatewayId: 'gw-main', workspace: workspaceFor('main'), isDefault: true },
  { id: 'research', name: 'Research Agent', gatewayId: 'gw-research', workspace: workspaceFor('research') },
  { id: 'ops', name: 'Ops Agent', gatewayId: 'gw-ops', workspace: workspaceFor('ops') },
]

/** @type {Map<string, { id: string, health: GatewayHealth }>} */
const gateways = new Map()

/** @type {Map<string, AgentRecord>} */
const agents = new Map()

/** @type {Map<string, { id: string, name: string, transport: string, endpoint: string, status: string, config?: object }>} */
const mcpServers = new Map()

// Demo MCP server
mcpServers.set('filesystem', { id: 'filesystem', name: 'filesystem-server', transport: 'stdio', endpoint: 'npx -y @modelcontextprotocol/server-filesystem /tmp', status: 'connected' })

// --- Automation Tasks ---
const TASKS_STATE_FILE = join(OPENCLAW_CLIENT_ROOT, 'tasks.json')

/** @type {Map<string, { id: string, agentId: string, name: string, prompt: string, intervalValue: number, intervalUnit: string, status: string, createdAt: string, lastRunAt: string|null, lastRunResult: string|null, lastRunSuccess: boolean|null, nextRunAt: string|null }>} */
const automationTasks = new Map()

/** @type {Map<string, NodeJS.Timeout>} */
const taskTimers = new Map()

/** @type {Set<string>} */
const taskExecuting = new Set()

const knownOpenClawAgentIds = new Set()
let gatewayBootPromise = null
let persistAgentsQueue = Promise.resolve()
let persistTelegramStateQueue = Promise.resolve()

/** @type {Map<string, { token: string, bot?: { id: string, username: string, firstName: string, canJoinGroups: boolean, canReadAllGroupMessages: boolean, supportsInlineQueries: boolean }, lastVerifiedAt?: string, lastUpdateId?: number, pendingPairing?: { chatId: string, userId: string, username: string, firstName: string, text: string, detectedAt: string, updateId: number }, approvedPairing?: { chatId: string, userId?: string, username?: string, firstName?: string, approvedAt: string } }>} */
const telegramAgentStates = new Map()

const stripAnsi = (input) => input.replace(/\u001b\[[0-9;]*m/g, '')

const sanitizeAssistantText = (input) => {
  const withoutThinking = input.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  return withoutThinking || '收到。'
}

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
}

const writeJson = (res, statusCode, payload) => {
  setCorsHeaders(res)
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const withTimeout = async (promise, timeoutMs) => {
  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`MODEL_TIMEOUT_${timeoutMs}MS`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const parseJsonFromOutput = (output) => {
  const cleaned = stripAnsi(output).trim()
  if (!cleaned) {
    return null
  }

  try {
    return JSON.parse(cleaned)
  } catch {
    // Ignore and continue
  }

  const lines = cleaned.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trimStart()
    if (!line.startsWith('{') && !line.startsWith('[')) {
      continue
    }

    const candidate = lines.slice(index).join('\n').trim()
    try {
      return JSON.parse(candidate)
    } catch {
      // Ignore and continue
    }
  }

  return null
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

const sanitizeAgentId = (input) =>
  String(input)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 48)

const nextGeneratedAgentId = () => {
  let index = 1
  while (agents.has(`agent-${index}`)) {
    index += 1
  }
  return `agent-${index}`
}

const normalizeAgentRecord = (rawRecord, fallbackIndex = 0) => {
  if (!rawRecord || typeof rawRecord !== 'object') {
    return null
  }

  const rawId = isNonEmptyString(rawRecord.id) ? rawRecord.id.trim() : ''
  const normalizedId = sanitizeAgentId(rawId) || `agent-${fallbackIndex + 1}`
  const gatewayId = isNonEmptyString(rawRecord.gatewayId) ? rawRecord.gatewayId.trim() : `gw-${normalizedId}`
  const workspace = isNonEmptyString(rawRecord.workspace) ? rawRecord.workspace.trim() : workspaceFor(normalizedId)
  const name = isNonEmptyString(rawRecord.name) ? rawRecord.name.trim() : `Agent ${fallbackIndex + 1}`
  const isDefault = rawRecord.isDefault === true || normalizedId === 'main'

  return {
    id: normalizedId,
    name,
    gatewayId,
    workspace,
    isDefault,
  }
}

const applyAgentRecords = (records) => {
  agents.clear()
  gateways.clear()

  for (const [index, raw] of records.entries()) {
    const normalized = normalizeAgentRecord(raw, index)
    if (!normalized) {
      continue
    }
    if (agents.has(normalized.id)) {
      continue
    }

    agents.set(normalized.id, normalized)
    gateways.set(normalized.gatewayId, {
      id: normalized.gatewayId,
      health: normalized.id === 'ops' ? 'Recovering' : 'Healthy',
    })
  }

  if (agents.size === 0) {
    for (const fallback of DEFAULT_AGENT_RECORDS) {
      agents.set(fallback.id, fallback)
      gateways.set(fallback.gatewayId, {
        id: fallback.gatewayId,
        health: fallback.id === 'ops' ? 'Recovering' : 'Healthy',
      })
    }
  }

  if (!Array.from(agents.values()).some((agent) => agent.isDefault)) {
    const main = agents.get('main')
    if (main) {
      main.isDefault = true
    } else {
      const first = agents.values().next().value
      if (first) {
        first.isDefault = true
      }
    }
  }
}

const serializeAgentRecords = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  agents: Array.from(agents.values()).map((agent) => ({
    id: agent.id,
    name: agent.name,
    gatewayId: agent.gatewayId,
    workspace: agent.workspace,
    isDefault: agent.isDefault === true,
  })),
})

const persistAgentsState = async () => {
  await mkdir(dirname(AGENTS_STATE_FILE), { recursive: true })
  await writeFile(AGENTS_STATE_FILE, JSON.stringify(serializeAgentRecords(), null, 2), 'utf8')
}

const queuePersistAgentsState = async () => {
  persistAgentsQueue = persistAgentsQueue.catch(() => {}).then(async () => {
    await persistAgentsState()
  })
  return persistAgentsQueue
}

const loadPersistedAgentRecords = async () => {
  const raw = await readFileIfExists(AGENTS_STATE_FILE)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    const rawAgents = Array.isArray(parsed?.agents) ? parsed.agents : null
    if (!rawAgents || rawAgents.length === 0) {
      return null
    }
    return rawAgents
  } catch {
    return null
  }
}

const initializeAgentState = async () => {
  const persisted = await loadPersistedAgentRecords()
  if (persisted && persisted.length > 0) {
    applyAgentRecords(persisted)
    return
  }

  applyAgentRecords(DEFAULT_AGENT_RECORDS)
  await persistAgentsState()
}

const maskTelegramToken = (token) => {
  if (!isNonEmptyString(token)) {
    return ''
  }
  const trimmed = token.trim()
  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 3)}***`
  }
  return `${trimmed.slice(0, 6)}***${trimmed.slice(-4)}`
}

const normalizeTelegramAgentState = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return null
  }

  const token = isNonEmptyString(raw.token) ? raw.token.trim() : ''
  if (!token) {
    return null
  }

  const normalized = {
    token,
  }

  if (raw.bot && typeof raw.bot === 'object') {
    normalized.bot = {
      id: String(raw.bot.id ?? ''),
      username: typeof raw.bot.username === 'string' ? raw.bot.username : '',
      firstName: typeof raw.bot.firstName === 'string' ? raw.bot.firstName : '',
      canJoinGroups: raw.bot.canJoinGroups === true,
      canReadAllGroupMessages: raw.bot.canReadAllGroupMessages === true,
      supportsInlineQueries: raw.bot.supportsInlineQueries === true,
    }
  }

  if (isNonEmptyString(raw.lastVerifiedAt)) {
    normalized.lastVerifiedAt = raw.lastVerifiedAt.trim()
  }
  if (typeof raw.lastUpdateId === 'number' && Number.isFinite(raw.lastUpdateId)) {
    normalized.lastUpdateId = raw.lastUpdateId
  }

  if (raw.pendingPairing && typeof raw.pendingPairing === 'object') {
    normalized.pendingPairing = {
      chatId: String(raw.pendingPairing.chatId ?? ''),
      userId: String(raw.pendingPairing.userId ?? ''),
      username: typeof raw.pendingPairing.username === 'string' ? raw.pendingPairing.username : '',
      firstName: typeof raw.pendingPairing.firstName === 'string' ? raw.pendingPairing.firstName : '',
      text: typeof raw.pendingPairing.text === 'string' ? raw.pendingPairing.text : '',
      detectedAt: typeof raw.pendingPairing.detectedAt === 'string' ? raw.pendingPairing.detectedAt : '',
      updateId: typeof raw.pendingPairing.updateId === 'number' ? raw.pendingPairing.updateId : 0,
    }
  }

  if (raw.approvedPairing && typeof raw.approvedPairing === 'object') {
    normalized.approvedPairing = {
      chatId: String(raw.approvedPairing.chatId ?? ''),
      userId: typeof raw.approvedPairing.userId === 'string' ? raw.approvedPairing.userId : undefined,
      username: typeof raw.approvedPairing.username === 'string' ? raw.approvedPairing.username : undefined,
      firstName: typeof raw.approvedPairing.firstName === 'string' ? raw.approvedPairing.firstName : undefined,
      approvedAt: typeof raw.approvedPairing.approvedAt === 'string' ? raw.approvedPairing.approvedAt : '',
    }
  }

  return normalized
}

const serializeTelegramAgentStates = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  agents: Object.fromEntries(
    Array.from(telegramAgentStates.entries()).map(([agentId, state]) => [agentId, state]),
  ),
})

const persistTelegramAgentStates = async () => {
  await mkdir(dirname(TELEGRAM_AGENT_STATE_FILE), { recursive: true })
  await writeFile(TELEGRAM_AGENT_STATE_FILE, JSON.stringify(serializeTelegramAgentStates(), null, 2), 'utf8')
}

const queuePersistTelegramAgentStates = async () => {
  persistTelegramStateQueue = persistTelegramStateQueue.catch(() => {}).then(async () => {
    await persistTelegramAgentStates()
  })
  return persistTelegramStateQueue
}

const loadPersistedTelegramAgentStates = async () => {
  const raw = await readFileIfExists(TELEGRAM_AGENT_STATE_FILE)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw)
    const rawAgents = parsed?.agents
    if (!rawAgents || typeof rawAgents !== 'object') {
      return null
    }
    return rawAgents
  } catch {
    return null
  }
}

const initializeTelegramAgentState = async () => {
  telegramAgentStates.clear()
  const persisted = await loadPersistedTelegramAgentStates()
  if (!persisted) {
    return
  }

  for (const [agentId, rawState] of Object.entries(persisted)) {
    const normalized = normalizeTelegramAgentState(rawState)
    if (!normalized) {
      continue
    }
    telegramAgentStates.set(agentId, normalized)
  }
}

// --- Automation Tasks: persistence & execution engine ---

const serializeTaskRecords = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  tasks: Array.from(automationTasks.values()),
})

const persistTasksState = async () => {
  await mkdir(dirname(TASKS_STATE_FILE), { recursive: true })
  await writeFile(TASKS_STATE_FILE, JSON.stringify(serializeTaskRecords(), null, 2), 'utf8')
}

let persistTasksQueue = Promise.resolve()
const queuePersistTasksState = () => {
  persistTasksQueue = persistTasksQueue.catch(() => {}).then(() => persistTasksState())
  return persistTasksQueue
}

const loadPersistedTaskRecords = async () => {
  const raw = await readFileIfExists(TASKS_STATE_FILE)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.tasks) ? parsed.tasks : null
  } catch {
    return null
  }
}

const computeIntervalMs = (task) => {
  const multiplier = task.intervalUnit === 'hours' ? 3600000 : 60000
  return task.intervalValue * multiplier
}

const computeNextRunAt = (task) => new Date(Date.now() + computeIntervalMs(task)).toISOString()

const clearTaskTimer = (taskId) => {
  const existing = taskTimers.get(taskId)
  if (existing) {
    clearInterval(existing)
    taskTimers.delete(taskId)
  }
}

// Forward-declared; real implementation needs fetchOpenClawReply etc. which are defined later
let executeTaskImpl = null

const scheduleTaskExecution = (task) => {
  clearTaskTimer(task.id)
  if (task.status !== 'running') return

  const intervalMs = computeIntervalMs(task)
  const timerId = setInterval(() => {
    if (executeTaskImpl) void executeTaskImpl(task)
  }, intervalMs)
  taskTimers.set(task.id, timerId)

  // Execute immediately on first schedule
  if (executeTaskImpl) void executeTaskImpl(task)
}

const initializeTaskState = async () => {
  const persisted = await loadPersistedTaskRecords()
  if (!persisted || persisted.length === 0) return

  for (const task of persisted) {
    automationTasks.set(task.id, task)
  }
  // Defer scheduling running tasks until executeTaskImpl is wired up
}

const resumeRunningTasks = () => {
  for (const task of automationTasks.values()) {
    if (task.status === 'running') {
      scheduleTaskExecution(task)
    }
  }
}

const runOpenClawCli = (args, timeoutMs, options = {}) =>
  new Promise((resolve, reject) => {
    const allowNonZeroExit = options.allowNonZeroExit === true
    const resolveOnJson = options.resolveOnJson === true
    const child = spawn(OPENCLAW_BIN, args, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let finished = false
    let parsedPayload = null
    let timedOut = false

    const timer = setTimeout(() => {
      if (finished) {
        return
      }
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 1200)
    }, timeoutMs)

    const tryResolveOnJson = () => {
      if (!resolveOnJson || finished || parsedPayload !== null) {
        return
      }

      const combined = [stdout, stderr].filter(Boolean).join('\n').trim()
      const parsed = parseJsonFromOutput(combined)
      if (parsed === null) {
        return
      }

      parsedPayload = parsed
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 600)
    }

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
      tryResolveOnJson()
    })

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
      tryResolveOnJson()
    })

    child.on('error', (error) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)
      reject(new Error(`OPENCLAW_CLI_EXEC_ERROR:${error.message}`))
    })

    child.on('close', (code, signal) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timer)

      const combined = [stdout, stderr].filter(Boolean).join('\n').trim()
      const hasParsedJson = parsedPayload !== null
      if (timedOut && !hasParsedJson) {
        reject(new Error(`OPENCLAW_CLI_TIMEOUT_${timeoutMs}:${combined.slice(-1200)}`))
        return
      }

      if (signal && !hasParsedJson) {
        reject(new Error(`OPENCLAW_CLI_SIGNAL_${signal}:${combined.slice(-1200)}`))
        return
      }

      if (code !== 0 && !allowNonZeroExit && !hasParsedJson) {
        reject(new Error(`OPENCLAW_CLI_EXIT_${code}:${combined.slice(-1200)}`))
        return
      }

      resolve({ stdout, stderr, combined, code, parsed: parsedPayload })
    })
  })

// --- OpenClaw Cron CLI wrappers ---

const CRON_CLI_TIMEOUT_MS = 15000

const parseCronJsonOutput = (combined) => {
  // Strip ANSI/box-drawing decoration lines before JSON
  const lines = combined.split('\n')
  let jsonStart = -1
  let braceDepth = 0
  let jsonEnd = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (jsonStart === -1) {
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        jsonStart = i
        braceDepth += (trimmed.match(/[{[]/g) || []).length - (trimmed.match(/[}\]]/g) || []).length
        if (braceDepth <= 0) { jsonEnd = i; break }
      }
    } else {
      braceDepth += (trimmed.match(/[{[]/g) || []).length - (trimmed.match(/[}\]]/g) || []).length
      if (braceDepth <= 0) { jsonEnd = i; break }
    }
  }
  if (jsonStart === -1) return null
  const jsonStr = lines.slice(jsonStart, jsonEnd !== -1 ? jsonEnd + 1 : undefined).join('\n')
  try { return JSON.parse(jsonStr) } catch { return null }
}

const fetchCronJobs = async () => {
  const result = await runOpenClawCli(
    ['--no-color', 'cron', 'list', '--all', '--json'],
    CRON_CLI_TIMEOUT_MS,
    { allowNonZeroExit: true },
  )
  const parsed = parseCronJsonOutput(result.combined)
  return parsed?.jobs ?? []
}

const createCronJob = async (opts) => {
  const args = ['--no-color', 'cron', 'add', '--json', '--session', 'isolated']
  if (opts.name) { args.push('--name', opts.name) }
  if (opts.description) { args.push('--description', opts.description) }
  if (opts.agent) { args.push('--agent', opts.agent) }
  if (opts.message) { args.push('--message', opts.message) }
  if (opts.every) { args.push('--every', opts.every) }
  if (opts.cron) { args.push('--cron', opts.cron) }
  if (opts.disabled) { args.push('--disabled') }
  const result = await runOpenClawCli(args, CRON_CLI_TIMEOUT_MS, { allowNonZeroExit: true })
  const parsed = parseCronJsonOutput(result.combined)
  if (!parsed || !parsed.id) throw new Error(`创建 Cron 任务失败: ${result.combined.slice(-300)}`)
  return parsed
}

const enableCronJob = async (jobId) => {
  await runOpenClawCli(
    ['--no-color', 'cron', 'enable', jobId],
    CRON_CLI_TIMEOUT_MS,
    { allowNonZeroExit: true },
  )
}

const disableCronJob = async (jobId) => {
  await runOpenClawCli(
    ['--no-color', 'cron', 'disable', jobId],
    CRON_CLI_TIMEOUT_MS,
    { allowNonZeroExit: true },
  )
}

const removeCronJob = async (jobId) => {
  const result = await runOpenClawCli(
    ['--no-color', 'cron', 'rm', jobId, '--json'],
    CRON_CLI_TIMEOUT_MS,
    { allowNonZeroExit: true },
  )
  const parsed = parseCronJsonOutput(result.combined)
  if (!parsed?.ok && !parsed?.removed) throw new Error(`删除 Cron 任务失败: ${result.combined.slice(-300)}`)
  return parsed
}

const fetchCronRuns = async (jobId, limit = 20) => {
  const result = await runOpenClawCli(
    ['--no-color', 'cron', 'runs', '--id', jobId, '--limit', String(limit)],
    CRON_CLI_TIMEOUT_MS,
    { allowNonZeroExit: true },
  )
  const parsed = parseCronJsonOutput(result.combined)
  return parsed?.runs ?? parsed ?? []
}

const hasBedrockConfig = () => !!BEDROCK_REGION && !!BEDROCK_BEARER_TOKEN && !!BEDROCK_MODEL_ID

const hasModelConfig = () => {
  if (activeChatMode !== 'openai_compat') return false
  if (MODEL_PROVIDER === 'aws_bedrock') return hasBedrockConfig()
  return !!MODEL_BASE_URL && !!MODEL_API_KEY && !!MODEL_NAME
}

// --- OpenClaw JSON Config Helpers ---

async function readOpenClawJsonConfig() {
  try {
    const raw = await readFile(OPENCLAW_CONFIG_PATH, 'utf8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeOpenClawJsonConfig(config) {
  await writeFile(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

function buildModelConfigResponse(config) {
  return {
    fullModel: config?.agents?.defaults?.model?.primary || '',
    providers: config?.models?.providers || {},
  }
}

const buildMockReply = (agent, message) => `(${agent.id} via ${agent.gatewayId}) 已收到：${message}`

const fetchModelReply = async (agent, message) => {
  if (!hasModelConfig()) {
    throw new Error('MODEL_CONFIG_MISSING')
  }

  const normalizedBase = MODEL_BASE_URL.replace(/\/+$/, '')
  const url = normalizedBase.endsWith('/v1')
    ? `${normalizedBase}/chat/completions`
    : `${normalizedBase}/v1/chat/completions`

  const requestBody = {
    model: MODEL_NAME,
    messages: [
      {
        role: 'system',
        content: `You are ${agent.name}. Keep responses concise and practical.`,
      },
      {
        role: 'user',
        content: message,
      },
    ],
    temperature: 0.3,
  }

  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MODEL_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    }),
    MODEL_TIMEOUT_MS,
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = payload?.error?.message ?? `HTTP_${response.status}`
    throw new Error(`MODEL_UPSTREAM_ERROR:${detail}`)
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('MODEL_EMPTY_RESPONSE')
  }

  return sanitizeAssistantText(content)
}

const fetchBedrockReply = async (agent, message) => {
  if (!hasBedrockConfig()) {
    throw new Error('MODEL_CONFIG_MISSING')
  }

  const encodedModelId = encodeURIComponent(BEDROCK_MODEL_ID)
  const url = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${encodedModelId}/converse`

  const requestBody = {
    messages: [
      { role: 'user', content: [{ text: message }] },
    ],
    system: [
      { text: `You are ${agent.name}. Keep responses concise and practical.` },
    ],
    inferenceConfig: {
      temperature: 0.3,
      maxTokens: 1024,
    },
  }

  const response = await withTimeout(
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BEDROCK_BEARER_TOKEN}`,
      },
      body: JSON.stringify(requestBody),
    }),
    MODEL_TIMEOUT_MS,
  )

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = payload?.message ?? payload?.error?.message ?? `HTTP_${response.status}`
    throw new Error(`MODEL_UPSTREAM_ERROR:${detail}`)
  }

  const content = payload?.output?.message?.content?.[0]?.text
  if (!content || typeof content !== 'string') {
    throw new Error('MODEL_EMPTY_RESPONSE')
  }

  return sanitizeAssistantText(content)
}

const ensureFileIfMissing = async (filePath, fallbackContent) => {
  try {
    await readFile(filePath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      await writeFile(filePath, fallbackContent, 'utf8')
      return
    }
    throw error
  }
}

const readFileIfExists = async (filePath) => {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

const ensureFileWithLegacyFallback = async ({ primaryPath, legacyPath, fallbackContent }) => {
  const existingPrimary = await readFileIfExists(primaryPath)
  if (existingPrimary !== null) {
    return
  }

  const legacyContent = legacyPath ? await readFileIfExists(legacyPath) : null
  await writeFile(primaryPath, legacyContent ?? fallbackContent, 'utf8')
}

const ensureWorkspaceScaffold = async (agent) => {
  await mkdir(agent.workspace, { recursive: true })

  await ensureFileWithLegacyFallback({
    primaryPath: join(agent.workspace, 'SOUL.md'),
    legacyPath: join(agent.workspace, 'soul.md'),
    fallbackContent: `# SOUL\n\n- Agent: ${agent.name}\n- 角色：稳健、可靠、可恢复\n- 原则：优先完成任务，必要时解释原因\n`,
  })
  await ensureFileWithLegacyFallback({
    primaryPath: join(agent.workspace, 'AGENTS.md'),
    legacyPath: join(agent.workspace, 'agent.md'),
    fallbackContent:
      `# AGENTS\n\n## Identity\n- id: ${agent.id}\n- workspace: ${agent.workspace}\n\n## Working style\n- 先确认约束，再执行\n- 输出简洁、可落地\n`,
  })
  await ensureFileWithLegacyFallback({
    primaryPath: join(agent.workspace, 'TOOLS.md'),
    legacyPath: join(agent.workspace, 'tool.md'),
    fallbackContent:
      '# TOOLS\n\n## enabled\n- terminal\n- file_read\n- file_write\n\n## notes\n- 优先使用小步修改与可回滚操作\n',
  })
  await ensureFileIfMissing(
    join(agent.workspace, 'USER.md'),
    `# USER\n\n- 记录该 agent 的用户偏好。\n- 例如：语言、输出格式、禁忌项。\n`,
  )
  await ensureFileIfMissing(
    join(agent.workspace, 'IDENTITY.md'),
    `# IDENTITY\n\n- name: ${agent.name}\n- id: ${agent.id}\n- workspace: ${agent.workspace}\n`,
  )
}

const checkOpenClawBinary = async () => {
  try {
    await runOpenClawCli(['--no-color', '--version'], 4000)
    return true
  } catch {
    return false
  }
}

const bootGatewayDetached = async () => {
  if (gatewayBootPromise) {
    await gatewayBootPromise
    return
  }

  gatewayBootPromise = (async () => {
    const daemon = spawn(OPENCLAW_BIN, ['--no-color', 'gateway', '--force', '--compact', '--allow-unconfigured'], {
      env: process.env,
      stdio: 'ignore',
      detached: true,
    })
    daemon.unref()
    await sleep(OPENCLAW_GATEWAY_BOOT_WAIT_MS)
  })()

  try {
    await gatewayBootPromise
  } finally {
    gatewayBootPromise = null
  }
}

const shouldRetryAfterGatewayBoot = (reason) =>
  /gateway closed|1006|Gateway target|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|EAI_AGAIN/i.test(
    reason,
  )

const tokenPattern = /^\d{6,}:[A-Za-z0-9_-]{20,}$/

const classifyOpenClawFailure = (reason) => {
  if (/OPENCLAW_CLI_TIMEOUT_/i.test(reason) || /gateway timeout after/i.test(reason)) {
    return {
      code: 'OPENCLAW_TIMEOUT',
      message: 'OpenClaw 响应超时，请先在终端确认 openclaw 可正常应答',
      status: 504,
      gatewayHealth: 'Recovering',
    }
  }

  if (/GATEWAY_UNAVAILABLE/i.test(reason) || /Gateway target:/i.test(reason) || shouldRetryAfterGatewayBoot(reason)) {
    return {
      code: 'OPENCLAW_GATEWAY_UNAVAILABLE',
      message: 'OpenClaw Gateway 不可用，请先在终端执行 openclaw doctor',
      status: 503,
      gatewayHealth: 'Degraded',
    }
  }

  if (/OPENCLAW_GATEWAY_AGENT_ERROR:/i.test(reason)) {
    const detail = reason.split('OPENCLAW_GATEWAY_AGENT_ERROR:').slice(1).join(':').trim()
    return {
      code: 'OPENCLAW_UPSTREAM_ERROR',
      message: detail ? `OpenClaw 返回错误: ${detail.slice(0, 180)}` : 'OpenClaw 返回错误，请稍后重试',
      status: 502,
      gatewayHealth: 'Recovering',
    }
  }

  if (/OPENCLAW_CLI_EXEC_ERROR:/i.test(reason)) {
    return {
      code: 'OPENCLAW_BIN_UNAVAILABLE',
      message: '未检测到可用 OpenClaw CLI，请先在终端确认 openclaw 可执行',
      status: 503,
      gatewayHealth: 'Degraded',
    }
  }

  if (/OPENCLAW_CLI_EXIT_/i.test(reason) || /OPENCLAW_CLI_SIGNAL_/i.test(reason)) {
    return {
      code: 'OPENCLAW_CLI_FAILED',
      message: 'OpenClaw 运行失败，请先在终端执行 openclaw doctor',
      status: 502,
      gatewayHealth: 'Recovering',
    }
  }

  return {
    code: 'OPENCLAW_CALL_FAILED',
    message: `调用失败: ${toUserFacingReason(reason)}`,
    status: 502,
    gatewayHealth: 'Recovering',
  }
}

const classifyModelFailure = (reason) => {
  if (/MODEL_TIMEOUT_/i.test(reason)) {
    return {
      code: 'MODEL_TIMEOUT',
      message: '模型请求超时，请稍后重试',
      status: 504,
      gatewayHealth: 'Recovering',
    }
  }

  if (/MODEL_UPSTREAM_ERROR:/i.test(reason)) {
    return {
      code: 'MODEL_UPSTREAM_ERROR',
      message: reason.split('MODEL_UPSTREAM_ERROR:').slice(1).join(':').trim().slice(0, 180),
      status: 502,
      gatewayHealth: 'Recovering',
    }
  }

  return {
    code: 'MODEL_CALL_FAILED',
    message: `模型调用失败: ${toUserFacingReason(reason)}`,
    status: 502,
    gatewayHealth: 'Recovering',
  }
}

const classifyTelegramFailure = (reason) => {
  if (/TELEGRAM_TOKEN_NOT_CONFIGURED/i.test(reason)) {
    return {
      code: 'TELEGRAM_NOT_CONFIGURED',
      message: '请先在 S4/S5 完成 Token 填写与验证',
      status: 400,
    }
  }

  if (/TELEGRAM_PENDING_PAIRING_NOT_FOUND/i.test(reason)) {
    return {
      code: 'TELEGRAM_PENDING_PAIRING_NOT_FOUND',
      message: '尚未检测到待审批的 pairing，请先在 Telegram 给 bot 发送首条消息',
      status: 400,
    }
  }

  if (/TELEGRAM_APPROVED_PAIRING_NOT_FOUND/i.test(reason)) {
    return {
      code: 'TELEGRAM_APPROVED_PAIRING_NOT_FOUND',
      message: '尚未完成 pairing 审批，请先完成 S9',
      status: 400,
    }
  }

  if (/TELEGRAM_TOKEN_FORMAT_INVALID/i.test(reason)) {
    return {
      code: 'INVALID_TELEGRAM_TOKEN',
      message: 'Token 格式不正确，请粘贴 BotFather 返回的完整 token',
      status: 400,
    }
  }

  if (/TELEGRAM_VERIFY_TIMEOUT/i.test(reason)) {
    return {
      code: 'TELEGRAM_VERIFY_TIMEOUT',
      message: 'Telegram 校验超时，请稍后重试',
      status: 504,
    }
  }

  if (/TELEGRAM_HTTP_ERROR:/i.test(reason) || /TELEGRAM_API_ERROR:/i.test(reason)) {
    const detail = reason.split(':').slice(1).join(':').trim()
    if (/unauthorized|invalid token|not found/i.test(detail)) {
      return {
        code: 'TELEGRAM_TOKEN_INVALID',
        message: 'Token 无效或已失效，请重新在 BotFather 生成',
        status: 400,
      }
    }

    return {
      code: 'TELEGRAM_VERIFY_FAILED',
      message: detail ? `Telegram 校验失败: ${detail.slice(0, 160)}` : 'Telegram 校验失败，请稍后重试',
      status: 502,
    }
  }

  if (/fetch failed|ENOTFOUND|EHOSTUNREACH|ECONNREFUSED|EAI_AGAIN/i.test(reason)) {
    return {
      code: 'TELEGRAM_NETWORK_ERROR',
      message: '无法连接 Telegram，请检查网络或代理设置',
      status: 502,
    }
  }

  return {
    code: 'TELEGRAM_VERIFY_FAILED',
    message: 'Telegram 校验失败，请稍后重试',
    status: 502,
  }
}

const toUserFacingReason = (reason) => {
  if (/OPENCLAW_CLI_TIMEOUT_/i.test(reason)) {
    return 'OpenClaw 响应超时，请先在终端确认 openclaw 可正常应答'
  }

  if (/OPENCLAW_GATEWAY_AGENT_ERROR:/i.test(reason)) {
    const detail = reason.split('OPENCLAW_GATEWAY_AGENT_ERROR:').slice(1).join(':').trim()
    if (detail) {
      return `OpenClaw 返回错误: ${detail.slice(0, 160)}`
    }
    return 'OpenClaw 调用失败，请先在终端执行 openclaw doctor'
  }

  if (/GATEWAY_UNAVAILABLE/i.test(reason)) {
    return 'OpenClaw Gateway 不可用，请先在终端执行 openclaw doctor'
  }

  if (/OPENCLAW_CLI_EXIT_/i.test(reason)) {
    return 'OpenClaw 运行失败，请先在终端执行 openclaw doctor'
  }

  if (/MODEL_TIMEOUT_/i.test(reason)) {
    return '模型请求超时，请稍后重试'
  }

  return reason.split('\n')[0].slice(0, 200)
}

const verifyTelegramToken = async (token) => {
  const trimmedToken = typeof token === 'string' ? token.trim() : ''
  if (!tokenPattern.test(trimmedToken)) {
    throw new Error('TELEGRAM_TOKEN_FORMAT_INVALID')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_VERIFY_TIMEOUT_MS)

  try {
    const url = `${TELEGRAM_API_BASE_URL.replace(/\/+$/, '')}/bot${trimmedToken}/getMe`
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const detail = typeof payload?.description === 'string' ? payload.description : `HTTP_${response.status}`
      throw new Error(`TELEGRAM_HTTP_ERROR:${detail}`)
    }

    if (!payload || payload.ok !== true || typeof payload.result !== 'object' || payload.result === null) {
      const detail = typeof payload?.description === 'string' ? payload.description : 'UNKNOWN_TELEGRAM_ERROR'
      throw new Error(`TELEGRAM_API_ERROR:${detail}`)
    }

    const bot = payload.result
    return {
      id: String(bot.id ?? ''),
      username: typeof bot.username === 'string' ? bot.username : '',
      firstName: typeof bot.first_name === 'string' ? bot.first_name : '',
      canJoinGroups: bot.can_join_groups === true,
      canReadAllGroupMessages: bot.can_read_all_group_messages === true,
      supportsInlineQueries: bot.supports_inline_queries === true,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('TELEGRAM_VERIFY_TIMEOUT')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

const ensureOpenClawAgentRegistered = async (agent) => {
  if (knownOpenClawAgentIds.has(agent.id)) {
    return
  }

  if (agent.id === 'main') {
    knownOpenClawAgentIds.add(agent.id)
    return
  }

  await runOpenClawCli(
    [
      '--no-color',
      'agents',
      'add',
      agent.id,
      '--workspace',
      agent.workspace,
      '--non-interactive',
      '--json',
    ],
    25000,
    {
      allowNonZeroExit: true,
      resolveOnJson: true,
    },
  )

  knownOpenClawAgentIds.add(agent.id)
}

const extractReplyFromGatewayPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const buckets = [payload?.result?.payloads, payload?.payloads, payload?.result?.messages]
  for (const entries of buckets) {
    if (!Array.isArray(entries)) {
      continue
    }
    const textParts = []
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const content =
        typeof entry.text === 'string'
          ? entry.text
          : typeof entry.content === 'string'
            ? entry.content
            : typeof entry.message === 'string'
              ? entry.message
              : ''
      const trimmed = content.trim()
      if (trimmed) {
        textParts.push(trimmed)
      }
    }
    if (textParts.length > 0) {
      return textParts.join('\n\n')
    }
  }

  return null
}

const extractReplyFromAgentPayload = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const directCandidates = [
    payload.reply,
    payload.text,
    payload.message,
    payload.output,
    payload.content,
    payload?.result?.reply,
    payload?.result?.text,
    payload?.data?.reply,
    payload?.data?.text,
    payload?.assistant?.reply,
    payload?.assistant?.text,
  ]

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }

  const messageArrays = [payload.messages, payload.events, payload.items]
  for (const entries of messageArrays) {
    if (!Array.isArray(entries)) {
      continue
    }
    for (let idx = entries.length - 1; idx >= 0; idx -= 1) {
      const item = entries[idx]
      if (!item || typeof item !== 'object') {
        continue
      }
      if (item.role === 'assistant' && typeof item.content === 'string' && item.content.trim()) {
        return item.content.trim()
      }
      if (typeof item.text === 'string' && item.text.trim()) {
        return item.text.trim()
      }
    }
  }

  return null
}

const extractReplyFromText = (rawOutput) => {
  const cleaned = stripAnsi(rawOutput)
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return ''
  }

  return lines[lines.length - 1]
}

const fetchOpenClawReply = async (agent, message) => {
  await ensureWorkspaceScaffold(agent)
  await ensureOpenClawAgentRegistered(agent)

  const sessionKey = sessionKeyFor(agent.id)
  const runTurn = () => {
    const params = {
      message,
      agentId: agent.id,
      sessionKey,
      thinking: OPENCLAW_THINKING_LEVEL,
      deliver: false,
      timeout: OPENCLAW_AGENT_TIMEOUT_SECONDS,
      idempotencyKey: randomUUID(),
    }

    return runOpenClawCli(
      [
        '--no-color',
        'gateway',
        'call',
        'agent',
        '--params',
        JSON.stringify(params),
        '--expect-final',
        '--json',
        '--timeout',
        String(OPENCLAW_GATEWAY_CALL_TIMEOUT_MS),
      ],
      OPENCLAW_GATEWAY_CALL_TIMEOUT_MS + 2500,
      { allowNonZeroExit: true, resolveOnJson: true },
    )
  }

  let result = null
  try {
    result = await runTurn()
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'OPENCLAW_TURN_FAILED'
    if (!shouldRetryAfterGatewayBoot(reason)) {
      throw error
    }
    await bootGatewayDetached()
    result = await runTurn()
  }

  const payload = result.parsed ?? parseJsonFromOutput(result.combined)
  if (payload && typeof payload === 'object' && payload.status && payload.status !== 'ok') {
    const summary =
      typeof payload.summary === 'string'
        ? payload.summary
        : typeof payload?.error?.message === 'string'
          ? payload.error.message
          : String(payload.status)
    throw new Error(`OPENCLAW_GATEWAY_AGENT_ERROR:${summary}`)
  }

  const reply =
    extractReplyFromGatewayPayload(payload) ??
    extractReplyFromAgentPayload(payload?.result ?? payload) ??
    extractReplyFromText(result.combined)

  const exitFailedWithoutJson = result.code !== 0 && payload === null
  if (!reply || exitFailedWithoutJson) {
    const reason = exitFailedWithoutJson ? `OPENCLAW_CLI_EXIT_${result.code}` : 'OPENCLAW_EMPTY_REPLY'
    throw new Error(`${reason}:${result.combined.slice(-1200)}`)
  }
  return sanitizeAssistantText(reply)
}

// Wire up the task execution implementation now that all reply functions are defined
executeTaskImpl = async (task) => {
  const record = automationTasks.get(task.id)
  if (!record || record.status !== 'running') return
  if (taskExecuting.has(record.id)) return // prevent overlapping execution
  taskExecuting.add(record.id)

  const agent = agents.get(record.agentId)
  if (!agent) {
    record.lastRunAt = new Date().toISOString()
    record.lastRunSuccess = false
    record.lastRunResult = `Agent ${record.agentId} 不存在`
    record.nextRunAt = computeNextRunAt(record)
    taskExecuting.delete(record.id)
    void queuePersistTasksState()
    return
  }

  const gateway = gateways.get(agent.gatewayId)

  try {
    let reply = ''
    if (activeChatMode === 'openclaw_cli') {
      reply = await fetchOpenClawReply(agent, record.prompt)
    } else if (activeChatMode === 'openai_compat') {
      reply = MODEL_PROVIDER === 'aws_bedrock'
        ? await fetchBedrockReply(agent, record.prompt)
        : await fetchModelReply(agent, record.prompt)
    } else {
      reply = buildMockReply(agent, record.prompt)
    }

    record.lastRunAt = new Date().toISOString()
    record.lastRunSuccess = true
    record.lastRunResult = reply.slice(0, 500)
    record.nextRunAt = computeNextRunAt(record)
    if (gateway) gateway.health = 'Healthy'
  } catch (error) {
    record.lastRunAt = new Date().toISOString()
    record.lastRunSuccess = false
    record.lastRunResult = (error instanceof Error ? error.message : 'UNKNOWN_ERROR').slice(0, 500)
    record.nextRunAt = computeNextRunAt(record)
  } finally {
    taskExecuting.delete(record.id)
  }

  void queuePersistTasksState()
}

const readJsonBody = async (req) => {
  let raw = ''
  for await (const chunk of req) {
    raw += chunk
  }

  if (!raw.trim()) {
    return {}
  }

  return JSON.parse(raw)
}

const ensureAgent = async (agentId) => {
  const known = agents.get(agentId)
  if (known) {
    return known
  }

  const gatewayId = `gw-${agentId}`
  if (!gateways.has(gatewayId)) {
    gateways.set(gatewayId, { id: gatewayId, health: 'Healthy' })
  }

  const created = {
    id: agentId,
    name: `Agent ${agentId}`,
    gatewayId,
    workspace: workspaceFor(agentId),
  }

  agents.set(agentId, created)
  await queuePersistAgentsState()
  return created
}

const createAgent = async (nameHint = '') => {
  const trimmedName = typeof nameHint === 'string' ? nameHint.trim() : ''
  const id = nextGeneratedAgentId()
  const gatewayId = `gw-${id}`
  const agent = {
    id,
    name: trimmedName || `Agent ${agents.size + 1}`,
    gatewayId,
    workspace: workspaceFor(id),
    isDefault: false,
  }

  agents.set(agent.id, agent)
  gateways.set(agent.gatewayId, { id: agent.gatewayId, health: 'Healthy' })
  await queuePersistAgentsState()
  return agent
}

const updateAgentName = async (agentId, name) => {
  const known = agents.get(agentId)
  if (!known) {
    return null
  }

  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (!trimmed) {
    throw new Error('INVALID_AGENT_NAME')
  }

  known.name = trimmed
  await queuePersistAgentsState()
  return known
}

const openPathInSystem = async (targetPath) => {
  const trimmed = typeof targetPath === 'string' ? targetPath.trim() : ''
  if (!trimmed) {
    throw new Error('OPEN_PATH_INVALID')
  }

  const resolvedPath = trimmed.startsWith('~/') ? join(homedir(), trimmed.slice(2)) : trimmed
  await stat(resolvedPath)

  const platform = process.platform
  let command = ''
  let args = []

  if (platform === 'darwin') {
    command = 'open'
    args = [resolvedPath]
  } else if (platform === 'win32') {
    command = 'cmd'
    args = ['/c', 'start', '', resolvedPath]
  } else {
    command = 'xdg-open'
    args = [resolvedPath]
  }

  const child = spawn(command, args, {
    stdio: 'ignore',
    detached: true,
  })
  child.unref()
}

const buildChatDiagnostics = (agent, elapsedMs) => ({
  chatMode: activeChatMode,
  sessionKey: activeChatMode === 'openclaw_cli' ? sessionKeyFor(agent.id) : null,
  elapsedMs,
  agentTimeoutSeconds: OPENCLAW_AGENT_TIMEOUT_SECONDS,
  gatewayCallTimeoutMs: OPENCLAW_GATEWAY_CALL_TIMEOUT_MS,
})

const routeError = (res, code, message, status = 400) => {
  writeJson(res, status, {
    ok: false,
    error: {
      code,
      message,
    },
  })
}

const parseAgentChatPath = (pathname) => {
  const match = pathname.match(/^\/v1\/agents\/([^/]+)\/chat$/)
  return match ? decodeURIComponent(match[1]) : null
}

const parseAgentRootPath = (pathname) => {
  const match = pathname.match(/^\/v1\/agents\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

const parseAgentTelegramVerifyPath = (pathname) => {
  const match = pathname.match(/^\/v1\/agents\/([^/]+)\/telegram\/verify-token$/)
  return match ? decodeURIComponent(match[1]) : null
}

const parseGatewayActionPath = (pathname) => {
  const match = pathname.match(/^\/v1\/gateways\/([^/]+)\/(disconnect|recover)$/)
  return match
    ? {
        gatewayId: decodeURIComponent(match[1]),
        action: match[2],
      }
    : null
}

const parseAgentTasksPath = (pathname) => {
  const match = pathname.match(/^\/v1\/agents\/([^/]+)\/tasks$/)
  return match ? decodeURIComponent(match[1]) : null
}

const parseAgentTaskStatusPath = (pathname) => {
  const match = pathname.match(/^\/v1\/agents\/([^/]+)\/tasks\/([^/]+)\/status$/)
  return match ? { agentId: decodeURIComponent(match[1]), taskId: decodeURIComponent(match[2]) } : null
}

const parseAgentTaskPath = (pathname) => {
  const match = pathname.match(/^\/v1\/agents\/([^/]+)\/tasks\/([^/]+)$/)
  return match ? { agentId: decodeURIComponent(match[1]), taskId: decodeURIComponent(match[2]) } : null
}

const parseCronJobActionPath = (pathname) => {
  const match = pathname.match(/^\/v1\/cron\/jobs\/([^/]+)\/(enable|disable|runs)$/)
  return match ? { jobId: decodeURIComponent(match[1]), action: match[2] } : null
}

const parseCronJobPath = (pathname) => {
  const match = pathname.match(/^\/v1\/cron\/jobs\/([^/]+)$/)
  return match ? decodeURIComponent(match[1]) : null
}

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'OPTIONS') {
    setCorsHeaders(res)
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/health') {
    const openclawBinaryReady = activeChatMode === 'openclaw_cli' ? await checkOpenClawBinary() : null

    writeJson(res, 200, {
      ok: true,
      service: 'openclaw-local-api',
      time: new Date().toISOString(),
      agentCount: agents.size,
      chatMode: activeChatMode,
      modelReady: hasModelConfig(),
      openclawBinaryReady,
      workspaceRoot: WORKSPACE_ROOT,
    })
    return
  }

  if (req.method === 'GET' && requestUrl.pathname === '/v1/agents') {
    const data = Array.from(agents.values()).map((agent) => {
      const gateway = gateways.get(agent.gatewayId)
      return {
        id: agent.id,
        name: agent.name,
        workspace: agent.workspace,
        isDefault: agent.isDefault === true,
        gateway: {
          id: agent.gatewayId,
          health: gateway?.health ?? 'Degraded',
        },
      }
    })

    writeJson(res, 200, {
      ok: true,
      data,
    })
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/v1/agents') {
    try {
      const body = await readJsonBody(req)
      const nameHint = typeof body.name === 'string' ? body.name : ''
      const created = await createAgent(nameHint)

      try {
        await ensureWorkspaceScaffold(created)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        routeError(res, 'WORKSPACE_INIT_FAILED', `初始化 Agent workspace 失败: ${detail.slice(0, 180)}`, 500)
        return
      }

      writeJson(res, 201, {
        ok: true,
        data: {
          id: created.id,
          name: created.name,
          workspace: created.workspace,
          isDefault: created.isDefault === true,
          gateway: {
            id: created.gatewayId,
            health: gateways.get(created.gatewayId)?.health ?? 'Healthy',
          },
        },
      })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  const agentRootId = parseAgentRootPath(requestUrl.pathname)
  if (req.method === 'PATCH' && agentRootId) {
    try {
      const body = await readJsonBody(req)
      const name = typeof body.name === 'string' ? body.name : ''
      let updated = null
      try {
        updated = await updateAgentName(agentRootId, name)
      } catch (error) {
        if (error instanceof Error && error.message === 'INVALID_AGENT_NAME') {
          routeError(res, 'INVALID_AGENT_NAME', 'Agent 名称不能为空')
          return
        }
        throw error
      }

      if (!updated) {
        routeError(res, 'AGENT_NOT_FOUND', `agent ${agentRootId} 不存在`, 404)
        return
      }

      const gateway = gateways.get(updated.gatewayId)
      writeJson(res, 200, {
        ok: true,
        data: {
          id: updated.id,
          name: updated.name,
          workspace: updated.workspace,
          isDefault: updated.isDefault === true,
          gateway: {
            id: updated.gatewayId,
            health: gateway?.health ?? 'Degraded',
          },
        },
      })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  if (req.method === 'POST' && requestUrl.pathname === '/v1/system/open-path') {
    try {
      const body = await readJsonBody(req)
      const targetPath = typeof body.path === 'string' ? body.path : ''
      try {
        await openPathInSystem(targetPath)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        if (reason === 'OPEN_PATH_INVALID') {
          routeError(res, 'INVALID_PATH', 'path 不能为空')
          return
        }
        routeError(res, 'OPEN_PATH_FAILED', `打开路径失败: ${reason.slice(0, 180)}`, 500)
        return
      }

      writeJson(res, 200, {
        ok: true,
        data: {
          path: targetPath,
        },
      })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  const telegramVerifyAgentId = parseAgentTelegramVerifyPath(requestUrl.pathname)
  if (req.method === 'POST' && telegramVerifyAgentId) {
    try {
      const body = await readJsonBody(req)
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      if (!token) {
        routeError(res, 'INVALID_TELEGRAM_TOKEN', 'token 不能为空')
        return
      }

      const agent = await ensureAgent(telegramVerifyAgentId)
      let bot = null

      try {
        bot = await verifyTelegramToken(token)
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'TELEGRAM_VERIFY_FAILED'
        const mapped = classifyTelegramFailure(reason)
        routeError(res, mapped.code, mapped.message, mapped.status)
        return
      }

      writeJson(res, 200, {
        ok: true,
        data: {
          agentId: agent.id,
          bot,
        },
      })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  const agentId = parseAgentChatPath(requestUrl.pathname)
  if (req.method === 'POST' && agentId) {
    try {
      const requestStartedAt = Date.now()
      const body = await readJsonBody(req)
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (!message) {
        routeError(res, 'INVALID_MESSAGE', 'message 不能为空')
        return
      }

      const agent = await ensureAgent(agentId)
      const gateway = gateways.get(agent.gatewayId)

      if (!gateway || gateway.health === 'Degraded') {
        routeError(res, 'GATEWAY_DISCONNECTED', `${agent.gatewayId} 当前不可用`, 503)
        return
      }

      if (gateway.health === 'Recovering') {
        gateway.health = 'Healthy'
      }

      try {
        await ensureWorkspaceScaffold(agent)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        routeError(res, 'WORKSPACE_INIT_FAILED', `初始化 Agent workspace 失败: ${detail.slice(0, 180)}`, 500)
        return
      }

      let reply = ''
      try {
        if (activeChatMode === 'openclaw_cli') {
          reply = await fetchOpenClawReply(agent, message)
        } else if (activeChatMode === 'openai_compat') {
          reply = MODEL_PROVIDER === 'aws_bedrock'
            ? await fetchBedrockReply(agent, message)
            : await fetchModelReply(agent, message)
        } else {
          reply = buildMockReply(agent, message)
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'UNKNOWN_CHAT_ERROR'
        const mapped =
          activeChatMode === 'openclaw_cli' ? classifyOpenClawFailure(reason) : classifyModelFailure(reason)
        gateway.health = mapped.gatewayHealth
        routeError(res, mapped.code, mapped.message, mapped.status)
        return
      }

      gateway.health = 'Healthy'
      const elapsedMs = Date.now() - requestStartedAt
      writeJson(res, 200, {
        ok: true,
        data: {
          agentId: agent.id,
          reply,
          workspace: agent.workspace,
          gateway: {
            id: agent.gatewayId,
            health: gateway.health,
          },
          createdAt: new Date().toISOString(),
          diagnostics: buildChatDiagnostics(agent, elapsedMs),
        },
      })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  const gatewayAction = parseGatewayActionPath(requestUrl.pathname)
  if (req.method === 'POST' && gatewayAction) {
    const gateway = gateways.get(gatewayAction.gatewayId)
    if (!gateway) {
      routeError(res, 'GATEWAY_NOT_FOUND', `gateway ${gatewayAction.gatewayId} 不存在`, 404)
      return
    }

    gateway.health = gatewayAction.action === 'recover' ? 'Healthy' : 'Degraded'

    writeJson(res, 200, {
      ok: true,
      data: {
        id: gateway.id,
        health: gateway.health,
      },
    })
    return
  }

  // --- Model Config Routes (reads/writes ~/.openclaw/openclaw.json) ---

  if (req.method === 'GET' && requestUrl.pathname === '/v1/system/model-config') {
    try {
      const config = await readOpenClawJsonConfig()
      writeJson(res, 200, { ok: true, data: buildModelConfigResponse(config) })
    } catch (err) {
      routeError(res, 'CONFIG_READ_ERROR', err instanceof Error ? err.message : '读取配置失败')
    }
    return
  }

  if (req.method === 'PUT' && requestUrl.pathname === '/v1/system/model-config') {
    try {
      const body = await readJsonBody(req)
      const config = await readOpenClawJsonConfig()

      // Update active model (format: "providerName/modelId")
      if (typeof body.fullModel === 'string' && body.fullModel.includes('/')) {
        if (!config.agents) config.agents = {}
        if (!config.agents.defaults) config.agents.defaults = {}
        if (!config.agents.defaults.model) config.agents.defaults.model = {}
        config.agents.defaults.model.primary = body.fullModel
      }

      // Update provider config in models.providers
      if (body.provider && typeof body.provider.name === 'string' && body.provider.name.trim()) {
        if (!config.models) config.models = { mode: 'merge' }
        if (!config.models.providers) config.models.providers = {}

        const name = body.provider.name.trim()
        const existing = config.models.providers[name] || {}

        if (typeof body.provider.baseUrl === 'string') existing.baseUrl = body.provider.baseUrl
        if (typeof body.provider.apiKey === 'string' && body.provider.apiKey) existing.apiKey = body.provider.apiKey
        if (typeof body.provider.api === 'string') existing.api = body.provider.api
        if (typeof body.provider.region === 'string') existing.region = body.provider.region
        if (Array.isArray(body.provider.models)) existing.models = body.provider.models

        config.models.providers[name] = existing
      }

      await writeOpenClawJsonConfig(config)
      writeJson(res, 200, { ok: true, data: buildModelConfigResponse(config) })
    } catch (err) {
      routeError(res, 'CONFIG_WRITE_ERROR', err instanceof Error ? err.message : '保存配置失败')
    }
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/v1/system/model-test') {
    const startMs = Date.now()
    let fullModel = ''
    try {
      const config = await readOpenClawJsonConfig()
      fullModel = config?.agents?.defaults?.model?.primary || ''
      const slashIdx = fullModel.indexOf('/')
      if (slashIdx < 1) {
        routeError(res, 'MODEL_NOT_SET', '未配置模型，请先选择 Provider 和 Model', 400)
        return
      }
      const providerName = fullModel.slice(0, slashIdx)
      const modelId = fullModel.slice(slashIdx + 1)
      const prov = config?.models?.providers?.[providerName]

      if (!prov || !prov.apiKey) {
        routeError(res, 'MODEL_KEY_MISSING', `Provider "${providerName}" 未配置 API Key`, 400)
        return
      }

      const api = prov.api || 'openai'
      const baseUrl = (prov.baseUrl || '').replace(/\/+$/, '')
      let testResponse

      if (api === 'bedrock') {
        // AWS Bedrock Converse API
        const region = prov.region || 'us-east-1'
        const encodedModelId = encodeURIComponent(modelId)
        const testUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodedModelId}/converse`
        testResponse = await withTimeout(
          fetch(testUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${prov.apiKey}`,
            },
            body: JSON.stringify({
              messages: [{ role: 'user', content: [{ text: 'ping' }] }],
              inferenceConfig: { maxTokens: 1 },
            }),
          }),
          MODEL_TIMEOUT_MS,
        )
      } else if (api === 'anthropic-messages') {
        // Anthropic Messages API
        const url = baseUrl ? (baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`) : 'https://api.anthropic.com/v1/messages'
        testResponse = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': prov.apiKey,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
          }),
          MODEL_TIMEOUT_MS,
        )
      } else {
        // OpenAI-compatible (default)
        const url = baseUrl.endsWith('/v1')
          ? `${baseUrl}/chat/completions`
          : baseUrl ? `${baseUrl}/v1/chat/completions` : 'https://api.openai.com/v1/chat/completions'
        testResponse = await withTimeout(
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${prov.apiKey}`,
            },
            body: JSON.stringify({
              model: modelId,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
          }),
          MODEL_TIMEOUT_MS,
        )
      }

      const latencyMs = Date.now() - startMs

      if (!testResponse.ok) {
        let detail = `HTTP ${testResponse.status}`
        try {
          const respBody = await testResponse.json()
          detail = respBody?.error?.message || respBody?.message || detail
        } catch { /* ignore parse errors */ }
        writeJson(res, 200, {
          ok: true,
          data: { success: false, latencyMs, modelName: fullModel, error: `API 返回错误: ${detail}` },
        })
        return
      }

      writeJson(res, 200, {
        ok: true,
        data: { success: true, latencyMs, modelName: fullModel },
      })
      return
    } catch (error) {
      const latencyMs = Date.now() - startMs
      const reason = error instanceof Error ? error.message : String(error)
      writeJson(res, 200, {
        ok: true,
        data: {
          success: false,
          latencyMs,
          modelName: fullModel,
          error: reason.includes('TIMEOUT') ? '连接超时' : `连接失败: ${reason.slice(0, 120)}`,
        },
      })
      return
    }
  }

  // --- Skills Routes ---
  if (req.method === 'GET' && requestUrl.pathname === '/v1/skills') {
    try {
      const result = await runOpenClawCli(
        ['--no-color', 'skills', 'list', '--json'],
        15000,
        { allowNonZeroExit: true },
      )
      const parsed = parseCronJsonOutput(result.combined)
      if (!parsed) {
        routeError(res, 'SKILLS_PARSE_ERROR', '无法解析 skills list 输出')
        return
      }
      const skills = Array.isArray(parsed.skills) ? parsed.skills : Array.isArray(parsed) ? parsed : []
      const eligible = skills.filter((s) => s.eligible === true).length
      writeJson(res, 200, {
        ok: true,
        data: {
          skills,
          summary: { total: skills.length, eligible },
        },
      })
    } catch (err) {
      routeError(res, 'SKILLS_LIST_ERROR', `获取 skills 列表失败: ${err.message}`)
    }
    return
  }

  // --- MCP Routes ---
  if (req.method === 'GET' && requestUrl.pathname === '/v1/mcp') {
    writeJson(res, 200, { ok: true, data: Array.from(mcpServers.values()) })
    return
  }

  if (req.method === 'POST' && requestUrl.pathname === '/v1/mcp/import') {
    try {
      const body = await readJsonBody(req)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const transport = typeof body.transport === 'string' ? body.transport.trim() : 'stdio'
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : ''
      if (!name || !endpoint) {
        routeError(res, 'INVALID_MCP_CONFIG', 'name 和 endpoint 不能为空')
        return
      }
      const id = `mcp-${Date.now()}`
      const entry = { id, name, transport, endpoint, status: 'disconnected', config: body.config || undefined }
      mcpServers.set(id, entry)
      writeJson(res, 201, { ok: true, data: entry })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  const mcpDeleteMatch = requestUrl.pathname.match(/^\/v1\/mcp\/([^/]+)$/)
  if (req.method === 'DELETE' && mcpDeleteMatch) {
    const mcpId = decodeURIComponent(mcpDeleteMatch[1])
    if (!mcpServers.has(mcpId)) {
      routeError(res, 'MCP_NOT_FOUND', `MCP 服务 ${mcpId} 不存在`, 404)
      return
    }
    mcpServers.delete(mcpId)
    writeJson(res, 200, { ok: true, data: { removed: true } })
    return
  }

  // --- Automation Tasks routes ---

  // PATCH /v1/agents/:agentId/tasks/:taskId/status — must be checked before the generic task path
  const taskStatusParams = parseAgentTaskStatusPath(requestUrl.pathname)
  if (req.method === 'PATCH' && taskStatusParams) {
    try {
      const body = await readJsonBody(req)
      const newStatus = body.status
      if (!['running', 'paused', 'stopped'].includes(newStatus)) {
        routeError(res, 'INVALID_STATUS', '状态必须为 running、paused 或 stopped')
        return
      }

      const task = automationTasks.get(taskStatusParams.taskId)
      if (!task || task.agentId !== taskStatusParams.agentId) {
        routeError(res, 'TASK_NOT_FOUND', `任务 ${taskStatusParams.taskId} 不存在`, 404)
        return
      }

      task.status = newStatus

      if (newStatus === 'running') {
        task.nextRunAt = computeNextRunAt(task)
        scheduleTaskExecution(task)
      } else {
        clearTaskTimer(task.id)
        task.nextRunAt = null
      }

      void queuePersistTasksState()
      writeJson(res, 200, { ok: true, data: task })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  // DELETE /v1/agents/:agentId/tasks/:taskId
  const taskDeleteParams = parseAgentTaskPath(requestUrl.pathname)
  if (req.method === 'DELETE' && taskDeleteParams) {
    const task = automationTasks.get(taskDeleteParams.taskId)
    if (!task || task.agentId !== taskDeleteParams.agentId) {
      routeError(res, 'TASK_NOT_FOUND', `任务 ${taskDeleteParams.taskId} 不存在`, 404)
      return
    }
    clearTaskTimer(task.id)
    automationTasks.delete(task.id)
    void queuePersistTasksState()
    writeJson(res, 200, { ok: true, data: { removed: true } })
    return
  }

  // GET /v1/agents/:agentId/tasks — list tasks
  const tasksListAgentId = parseAgentTasksPath(requestUrl.pathname)
  if (req.method === 'GET' && tasksListAgentId) {
    const agentTasks = Array.from(automationTasks.values())
      .filter((t) => t.agentId === tasksListAgentId)
    writeJson(res, 200, { ok: true, data: agentTasks })
    return
  }

  // POST /v1/agents/:agentId/tasks — create task
  const tasksCreateAgentId = parseAgentTasksPath(requestUrl.pathname)
  if (req.method === 'POST' && tasksCreateAgentId) {
    try {
      const body = await readJsonBody(req)
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
      const intervalValue = typeof body.intervalValue === 'number' ? body.intervalValue : 0
      const intervalUnit = body.intervalUnit === 'hours' ? 'hours' : 'minutes'

      if (!name) { routeError(res, 'INVALID_TASK_NAME', '任务名称不能为空'); return }
      if (!prompt) { routeError(res, 'INVALID_TASK_PROMPT', '任务指令不能为空'); return }
      if (intervalValue < 1 || intervalValue > 1440) {
        routeError(res, 'INVALID_INTERVAL', '间隔时间需在 1-1440 之间')
        return
      }

      if (!agents.has(tasksCreateAgentId)) {
        routeError(res, 'AGENT_NOT_FOUND', `Agent ${tasksCreateAgentId} 不存在`, 404)
        return
      }

      const id = `task-${Date.now()}-${randomUUID().slice(0, 8)}`
      const task = {
        id,
        agentId: tasksCreateAgentId,
        name,
        prompt,
        intervalValue,
        intervalUnit,
        status: 'paused',
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        lastRunResult: null,
        lastRunSuccess: null,
        nextRunAt: null,
      }
      automationTasks.set(id, task)
      void queuePersistTasksState()
      writeJson(res, 201, { ok: true, data: task })
      return
    } catch {
      routeError(res, 'INVALID_JSON', '请求体 JSON 格式错误')
      return
    }
  }

  // --- OpenClaw Native Cron Routes ---

  // POST /v1/cron/jobs/:id/enable  or  /disable  or  GET /runs
  const cronJobAction = parseCronJobActionPath(requestUrl.pathname)
  if (cronJobAction) {
    if (activeChatMode !== 'openclaw_cli') {
      routeError(res, 'CRON_NOT_AVAILABLE', 'Cron 调度仅在 openclaw_cli 模式下可用')
      return
    }
    if (cronJobAction.action === 'enable' && req.method === 'POST') {
      try {
        await enableCronJob(cronJobAction.jobId)
        writeJson(res, 200, { ok: true, data: { enabled: true } })
      } catch (error) {
        routeError(res, 'CRON_ENABLE_FAILED', error instanceof Error ? error.message : '启用 Cron 任务失败', 500)
      }
      return
    }
    if (cronJobAction.action === 'disable' && req.method === 'POST') {
      try {
        await disableCronJob(cronJobAction.jobId)
        writeJson(res, 200, { ok: true, data: { disabled: true } })
      } catch (error) {
        routeError(res, 'CRON_DISABLE_FAILED', error instanceof Error ? error.message : '禁用 Cron 任务失败', 500)
      }
      return
    }
    if (cronJobAction.action === 'runs' && req.method === 'GET') {
      try {
        const runs = await fetchCronRuns(cronJobAction.jobId)
        writeJson(res, 200, { ok: true, data: runs })
      } catch (error) {
        routeError(res, 'CRON_RUNS_FAILED', error instanceof Error ? error.message : '获取执行记录失败', 500)
      }
      return
    }
  }

  // DELETE /v1/cron/jobs/:id
  const cronJobId = parseCronJobPath(requestUrl.pathname)
  if (req.method === 'DELETE' && cronJobId) {
    if (activeChatMode !== 'openclaw_cli') {
      routeError(res, 'CRON_NOT_AVAILABLE', 'Cron 调度仅在 openclaw_cli 模式下可用')
      return
    }
    try {
      await removeCronJob(cronJobId)
      writeJson(res, 200, { ok: true, data: { removed: true } })
    } catch (error) {
      routeError(res, 'CRON_REMOVE_FAILED', error instanceof Error ? error.message : '删除 Cron 任务失败', 500)
    }
    return
  }

  // GET /v1/cron/jobs — list all native cron jobs
  if (req.method === 'GET' && requestUrl.pathname === '/v1/cron/jobs') {
    if (activeChatMode !== 'openclaw_cli') {
      writeJson(res, 200, { ok: true, data: [] })
      return
    }
    try {
      const jobs = await fetchCronJobs()
      writeJson(res, 200, { ok: true, data: jobs })
    } catch (error) {
      routeError(res, 'CRON_LIST_FAILED', error instanceof Error ? error.message : '获取 Cron 任务列表失败', 500)
    }
    return
  }

  // POST /v1/cron/jobs — create a native cron job
  if (req.method === 'POST' && requestUrl.pathname === '/v1/cron/jobs') {
    if (activeChatMode !== 'openclaw_cli') {
      routeError(res, 'CRON_NOT_AVAILABLE', 'Cron 调度仅在 openclaw_cli 模式下可用')
      return
    }
    try {
      const body = await readJsonBody(req)
      const job = await createCronJob(body)
      writeJson(res, 201, { ok: true, data: job })
    } catch (error) {
      routeError(res, 'CRON_CREATE_FAILED', error instanceof Error ? error.message : '创建 Cron 任务失败', 500)
    }
    return
  }

  routeError(res, 'NOT_FOUND', `未找到路由: ${req.method} ${requestUrl.pathname}`, 404)
})

try {
  await initializeAgentState()
  await initializeTaskState()
  resumeRunningTasks()
} catch (error) {
  // eslint-disable-next-line no-console
  console.error(`[openclaw-local-api] failed to initialize state: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[openclaw-local-api] listening on http://localhost:${PORT} (chatMode=${activeChatMode}, workspaceRoot=${WORKSPACE_ROOT}, agentsState=${AGENTS_STATE_FILE})`,
  )
})
