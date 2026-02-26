import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = path.dirname(__filename)
const appRoot = path.resolve(scriptsDir, '..')
const outputDir = path.join(appRoot, 'output', 'playwright', 'e2e-chat')

const preferredApiPort = Number(process.env.OPENCLAW_SMOKE_API_PORT ?? 18787)
const preferredWebPort = Number(process.env.OPENCLAW_SMOKE_WEB_PORT ?? 14173)
const smokeChatMode = process.env.OPENCLAW_SMOKE_CHAT_MODE ?? 'mock'
const bootTimeoutMs = Number(process.env.OPENCLAW_SMOKE_BOOT_TIMEOUT_MS ?? 45000)
const replyTimeoutMs = Number(process.env.OPENCLAW_SMOKE_REPLY_TIMEOUT_MS ?? 120000)

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const startedServices = []

const nowIso = () => new Date().toISOString()

const canBindPort = (port, host) =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EAFNOSUPPORT') {
        resolve(true)
        return
      }
      resolve(false)
    })
    server.listen({ host, port }, () => {
      server.close(() => resolve(true))
    })
  })

const isPortAvailable = async (port) => {
  const ipv4Available = await canBindPort(port, '127.0.0.1')
  if (!ipv4Available) {
    return false
  }

  const ipv6Available = await canBindPort(port, '::')
  return ipv6Available
}

const resolveAvailablePort = async (preferredPort, occupied = new Set()) => {
  let port = preferredPort
  for (let attempts = 0; attempts < 120; attempts += 1) {
    if (occupied.has(port)) {
      port += 1
      continue
    }
    // eslint-disable-next-line no-await-in-loop
    const available = await isPortAvailable(port)
    if (available) {
      return port
    }
    port += 1
  }

  throw new Error(`No available port found near ${preferredPort}`)
}

const readText = async (response) => {
  try {
    return await response.text()
  } catch {
    return ''
  }
}

const isUrlReady = async (url) => {
  try {
    const response = await fetch(url, { method: 'GET' })
    return response.ok
  } catch {
    return false
  }
}

const waitUrlReady = async (url, timeoutMs, label) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isUrlReady(url)) {
      return
    }
    await sleep(600)
  }
  throw new Error(`${label} timeout after ${timeoutMs}ms: ${url}`)
}

const startService = (name, args, extraEnv = {}, { cmd } = {}) => {
  const command = cmd ?? pnpmCmd
  const proc = spawn(command, args, {
    cwd: appRoot,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const logs = []
  proc.stdout.on('data', (chunk) => {
    logs.push(String(chunk))
  })
  proc.stderr.on('data', (chunk) => {
    logs.push(String(chunk))
  })

  startedServices.push({ name, proc, logs })
  return { proc, logs }
}

const stopStartedServices = async () => {
  for (const service of [...startedServices].reverse()) {
    if (service.proc.killed) {
      continue
    }
    service.proc.kill('SIGTERM')
    await sleep(500)
    if (service.proc.exitCode === null) {
      service.proc.kill('SIGKILL')
      await sleep(200)
    }
  }
}

const runSmoke = async () => {
  await mkdir(outputDir, { recursive: true })
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openclaw-smoke-'))
  const smokeWorkspaceRoot = path.join(sandboxRoot, 'workspaces')
  const smokeAgentsStateFile = path.join(sandboxRoot, 'agents.json')

  const report = {
    startedAt: nowIso(),
    appRoot,
    sandboxRoot,
    smokeChatMode,
    apiHealthUrl: '',
    webUrl: '',
    smokeApiPort: 0,
    smokeWebPort: 0,
    status: 'running',
    startedApiByScript: false,
    startedDevByScript: false,
    localApiReady: false,
    beforeAgentCount: 0,
    afterAgentCount: 0,
    afterReloadAgentCount: 0,
    createAgentStatusCode: 0,
    createAgentResponse: '',
    createdAgentName: '',
    beforeAssistantCount: 0,
    afterAssistantCount: 0,
    sentMessage: '',
    lastAssistantMessage: '',
    screenshot: '',
    error: '',
  }

  const reportPath = path.join(outputDir, 'report.json')

  try {
    const smokeApiPort = await resolveAvailablePort(preferredApiPort)
    const smokeWebPort = await resolveAvailablePort(preferredWebPort, new Set([smokeApiPort]))
    const apiBaseUrl = `http://127.0.0.1:${smokeApiPort}`
    const apiHealthUrl = `${apiBaseUrl}/health`
    const webUrl = `http://127.0.0.1:${smokeWebPort}`

    report.smokeApiPort = smokeApiPort
    report.smokeWebPort = smokeWebPort
    report.apiHealthUrl = apiHealthUrl
    report.webUrl = webUrl

    report.startedApiByScript = true
    report.startedDevByScript = true
    startService('api', [path.join(appRoot, 'server', 'local-api.mjs')], {
      OPENCLAW_LOCAL_API_PORT: String(smokeApiPort),
      OPENCLAW_CHAT_MODE: smokeChatMode,
      OPENCLAW_CLIENT_ROOT: sandboxRoot,
      OPENCLAW_WORKSPACE_ROOT: smokeWorkspaceRoot,
      OPENCLAW_AGENTS_STATE_FILE: smokeAgentsStateFile,
    }, { cmd: 'node' })
    await waitUrlReady(apiHealthUrl, bootTimeoutMs, 'Local API')

    startService('dev', ['dev:ui', '--host', '127.0.0.1', '--port', String(smokeWebPort), '--strictPort'], {
      VITE_OPENCLAW_API_BASE: apiBaseUrl,
    })
    await waitUrlReady(webUrl, bootTimeoutMs, 'Frontend')

    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 1728, height: 1117 } })

    try {
      const homepage = await page.goto(webUrl, {
        waitUntil: 'domcontentloaded',
        timeout: bootTimeoutMs,
      })
      if (!homepage || !homepage.ok()) {
        const body = homepage ? await readText(homepage) : ''
        throw new Error(`Page load failed: ${homepage?.status() ?? 'NO_RESPONSE'} ${body.slice(0, 300)}`)
      }

      await page.waitForFunction(() => {
        const strips = Array.from(document.querySelectorAll('.runtime-strip'))
        return strips.some((strip) => strip.textContent?.includes('Local API: Ready'))
      }, { timeout: bootTimeoutMs })
      report.localApiReady = true

      const agentItems = page.locator('.agent-list .agent-item')
      report.beforeAgentCount = await agentItems.count()

      const createResponsePromise = page.waitForResponse(
        (response) => response.url().endsWith('/v1/agents') && response.request().method() === 'POST',
        { timeout: Math.min(replyTimeoutMs, 30000) },
      )
      await page.locator('.agent-add-btn').click()
      const createResponse = await createResponsePromise
      report.createAgentStatusCode = createResponse.status()
      report.createAgentResponse = (await createResponse.text().catch(() => '')).slice(0, 800)
      if (!createResponse.ok()) {
        throw new Error(`Create agent request failed with status ${createResponse.status()}`)
      }

      await page.waitForFunction((beforeCount) => {
        const current = document.querySelectorAll('.agent-list .agent-item').length
        return current > beforeCount
      }, report.beforeAgentCount, { timeout: Math.min(replyTimeoutMs, 30000) })
      report.afterAgentCount = await agentItems.count()
      report.createdAgentName = (await page.locator('.agent-list .agent-item.active span').first().innerText()).trim()

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => {
        const strips = Array.from(document.querySelectorAll('.runtime-strip'))
        return strips.some((strip) => strip.textContent?.includes('Local API: Ready'))
      }, { timeout: bootTimeoutMs })
      report.afterReloadAgentCount = await page.locator('.agent-list .agent-item').count()
      if (report.afterReloadAgentCount < report.afterAgentCount) {
        throw new Error(
          `Agent list was not persisted after reload: before=${report.beforeAgentCount}, afterCreate=${report.afterAgentCount}, afterReload=${report.afterReloadAgentCount}`,
        )
      }

      const assistantMessages = page.locator('.message-assistant')
      report.beforeAssistantCount = await assistantMessages.count()

      const uniqueMessage = `playwright_smoke_${Date.now()}`
      report.sentMessage = uniqueMessage

      const input = page.locator('.composer input')
      const sendButton = page.locator('.composer button')
      await input.fill(uniqueMessage)
      await sendButton.click()

      await page.waitForFunction((beforeCount) => {
        const current = document.querySelectorAll('.message-assistant').length
        return current > beforeCount
      }, report.beforeAssistantCount, { timeout: replyTimeoutMs })

      report.afterAssistantCount = await assistantMessages.count()
      report.lastAssistantMessage = (await page.locator('.message-assistant p').last().innerText()).trim()

      const screenshotPath = path.join(outputDir, `chat-success-${Date.now()}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      report.screenshot = screenshotPath
      report.status = 'pass'
    } finally {
      await browser.close()
    }
  } catch (error) {
    report.status = 'fail'
    report.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    report.finishedAt = nowIso()
    report.serviceLogs = startedServices.map((service) => ({
      name: service.name,
      tail: service.logs.join('').slice(-2000),
    }))
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
    await stopStartedServices()
  }
}

runSmoke()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`[smoke-e2e] PASS: ${path.join(outputDir, 'report.json')}`)
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[smoke-e2e] FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
