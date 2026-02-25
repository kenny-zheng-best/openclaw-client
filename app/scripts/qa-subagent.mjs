import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const scriptsDir = path.dirname(__filename)
const appRoot = path.resolve(scriptsDir, '..')
const outputDir = path.join(appRoot, 'output', 'qa-subagent')
const reportPath = path.join(outputDir, 'report.json')

const qaPort = Number(process.env.OPENCLAW_QA_API_PORT ?? 18888)
const qaBaseUrl = `http://127.0.0.1:${qaPort}`
const bootTimeoutMs = Number(process.env.OPENCLAW_QA_BOOT_TIMEOUT_MS ?? 20000)
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

const nowIso = () => new Date().toISOString()

const createAssertion = (name) => ({
  name,
  ok: false,
  detail: '',
})

const waitApiReady = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // continue polling
    }
    await sleep(300)
  }
  throw new Error(`Local API boot timeout after ${timeoutMs}ms: ${url}`)
}

const ensureWorkspaceScaffold = async (workspace) => {
  const requiredFiles = ['SOUL.md', 'AGENTS.md', 'TOOLS.md']
  for (const fileName of requiredFiles) {
    const fullPath = path.join(workspace, fileName)
    await readFile(fullPath, 'utf8')
  }
}

const run = async () => {
  await mkdir(outputDir, { recursive: true })
  const sandboxRoot = await mkdtemp(path.join(tmpdir(), 'openclaw-qa-'))
  const workspaceRoot = path.join(sandboxRoot, 'workspaces')
  const agentsStateFile = path.join(sandboxRoot, 'agents.json')

  const report = {
    startedAt: nowIso(),
    status: 'running',
    qaBaseUrl,
    sandboxRoot,
    assertions: [],
    error: '',
    apiLogTail: '',
  }

  const apiProcess = spawn(pnpmCmd, ['api'], {
    cwd: appRoot,
    env: {
      ...process.env,
      OPENCLAW_CHAT_MODE: 'mock',
      OPENCLAW_LOCAL_API_PORT: String(qaPort),
      OPENCLAW_CLIENT_ROOT: sandboxRoot,
      OPENCLAW_WORKSPACE_ROOT: workspaceRoot,
      OPENCLAW_AGENTS_STATE_FILE: agentsStateFile,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const apiLogs = []
  apiProcess.stdout.on('data', (chunk) => apiLogs.push(String(chunk)))
  apiProcess.stderr.on('data', (chunk) => apiLogs.push(String(chunk)))

  try {
    await waitApiReady(`${qaBaseUrl}/health`, bootTimeoutMs)

    const healthAssertion = createAssertion('health endpoint responds')
    {
      const response = await fetch(`${qaBaseUrl}/health`)
      const payload = await response.json()
      healthAssertion.ok = response.ok && payload?.ok === true && payload?.service === 'openclaw-local-api'
      healthAssertion.detail = JSON.stringify({
        status: response.status,
        service: payload?.service,
        chatMode: payload?.chatMode,
      })
      report.assertions.push(healthAssertion)
      if (!healthAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${healthAssertion.name}`)
      }
    }

    const listAgentsAssertion = createAssertion('list agents returns defaults')
    let defaultAgentId = 'main'
    {
      const response = await fetch(`${qaBaseUrl}/v1/agents`)
      const payload = await response.json()
      const agentCount = Array.isArray(payload?.data) ? payload.data.length : 0
      defaultAgentId = payload?.data?.find?.((agent) => agent?.isDefault)?.id ?? 'main'
      listAgentsAssertion.ok = response.ok && payload?.ok === true && agentCount >= 1
      listAgentsAssertion.detail = JSON.stringify({
        status: response.status,
        agentCount,
        defaultAgentId,
      })
      report.assertions.push(listAgentsAssertion)
      if (!listAgentsAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${listAgentsAssertion.name}`)
      }
    }

    const createAgentAssertion = createAssertion('create agent persists with workspace scaffold')
    {
      const response = await fetch(`${qaBaseUrl}/v1/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'QA Agent',
        }),
      })
      const payload = await response.json()
      const createdWorkspace = payload?.data?.workspace
      const createdAgentId = payload?.data?.id
      if (response.ok && createdWorkspace) {
        await ensureWorkspaceScaffold(createdWorkspace)
      }
      createAgentAssertion.ok =
        response.status === 201 &&
        payload?.ok === true &&
        typeof createdAgentId === 'string' &&
        typeof createdWorkspace === 'string'
      createAgentAssertion.detail = JSON.stringify({
        status: response.status,
        createdAgentId,
        createdWorkspace,
      })
      report.assertions.push(createAgentAssertion)
      if (!createAgentAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${createAgentAssertion.name}`)
      }
    }

    const verifyTokenAssertion = createAssertion('telegram verify rejects invalid token format')
    {
      const response = await fetch(`${qaBaseUrl}/v1/agents/${encodeURIComponent(defaultAgentId)}/telegram/verify-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: 'invalid-token',
        }),
      })
      const payload = await response.json()
      verifyTokenAssertion.ok =
        response.status === 400 &&
        payload?.ok === false &&
        payload?.error?.code === 'INVALID_TELEGRAM_TOKEN'
      verifyTokenAssertion.detail = JSON.stringify({
        status: response.status,
        code: payload?.error?.code,
      })
      report.assertions.push(verifyTokenAssertion)
      if (!verifyTokenAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${verifyTokenAssertion.name}`)
      }
    }

    const chatAssertion = createAssertion('chat works in mock mode')
    {
      const response = await fetch(`${qaBaseUrl}/v1/agents/${encodeURIComponent(defaultAgentId)}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'qa_ping',
        }),
      })
      const payload = await response.json()
      const reply = payload?.data?.reply
      chatAssertion.ok =
        response.ok &&
        payload?.ok === true &&
        typeof reply === 'string' &&
        reply.includes('qa_ping')
      chatAssertion.detail = JSON.stringify({
        status: response.status,
        gateway: payload?.data?.gateway?.id,
        replyPreview: typeof reply === 'string' ? reply.slice(0, 80) : '',
      })
      report.assertions.push(chatAssertion)
      if (!chatAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${chatAssertion.name}`)
      }
    }

    const skillsAssertion = createAssertion('skills list returns array')
    {
      const response = await fetch(`${qaBaseUrl}/v1/skills`)
      const payload = await response.json()
      const skills = payload?.data?.skills
      const summary = payload?.data?.summary
      skillsAssertion.ok =
        response.ok &&
        payload?.ok === true &&
        Array.isArray(skills) &&
        typeof summary?.total === 'number' &&
        typeof summary?.eligible === 'number'
      skillsAssertion.detail = JSON.stringify({
        status: response.status,
        total: summary?.total,
        eligible: summary?.eligible,
        sampleName: skills?.[0]?.name ?? '',
      })
      report.assertions.push(skillsAssertion)
      if (!skillsAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${skillsAssertion.name}`)
      }
    }

    const installDepsValidationAssertion = createAssertion('install-deps rejects empty packages')
    {
      const response = await fetch(`${qaBaseUrl}/v1/system/install-deps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: [] }),
      })
      const payload = await response.json()
      installDepsValidationAssertion.ok =
        response.status === 400 &&
        payload?.ok === false &&
        payload?.error?.code === 'INVALID_PACKAGES'
      installDepsValidationAssertion.detail = JSON.stringify({
        status: response.status,
        code: payload?.error?.code,
      })
      report.assertions.push(installDepsValidationAssertion)
      if (!installDepsValidationAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${installDepsValidationAssertion.name}`)
      }
    }

    const installDepsNameAssertion = createAssertion('install-deps rejects invalid package name')
    {
      const response = await fetch(`${qaBaseUrl}/v1/system/install-deps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: ['$(rm -rf /)'] }),
      })
      const payload = await response.json()
      installDepsNameAssertion.ok =
        response.status === 400 &&
        payload?.ok === false &&
        payload?.error?.code === 'INVALID_PACKAGE_NAME'
      installDepsNameAssertion.detail = JSON.stringify({
        status: response.status,
        code: payload?.error?.code,
      })
      report.assertions.push(installDepsNameAssertion)
      if (!installDepsNameAssertion.ok) {
        throw new Error(`QA_ASSERT_FAIL: ${installDepsNameAssertion.name}`)
      }
    }

    report.status = 'pass'
  } catch (error) {
    report.status = 'fail'
    report.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    if (!apiProcess.killed) {
      apiProcess.kill('SIGTERM')
      await sleep(300)
      if (apiProcess.exitCode === null) {
        apiProcess.kill('SIGKILL')
      }
    }
    report.finishedAt = nowIso()
    report.apiLogTail = apiLogs.join('').slice(-3000)
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8')
  }
}

run()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`[qa-subagent] PASS: ${reportPath}`)
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[qa-subagent] FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
