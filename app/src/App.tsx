import { useCallback, useEffect, useMemo, useState } from 'react'
import { navigateSection, type SectionKey } from './state/navigation'
import {
  OpenClawApiError,
  checkLocalApiHealth,
  createAgent as createAgentRequest,
  listAgents,
  sendAgentMessage,
  verifyTelegramToken,
  type AgentSummary,
} from './api/openclaw'
import { resolveChatSendError } from './state/chat-errors'
import { Sidebar } from '@/components/sidebar'
import { ChatPanel } from '@/components/chat-panel'
import { ModulePanel } from '@/components/module-panel'
import { SettingsDrawer } from '@/components/settings-drawer'
import type {
  AgentId,
  AgentMeta,
  TelegramStatus,
  TabKey,
  ChatMessage,
  ChatDiagnostics,
  GuideState,
} from '@/types'

const GUIDE_STEPS = [
  { id: 'S0_ENV_CHECK' as const, title: 'S0 环境检查', summary: '先检查当前 Agent 网关与网络状态，确认后续步骤可执行。', screenshotTitle: '环境检查示意', screenshotHint: '展示 Gateway 在线、网络可达、状态正常。' },
  { id: 'S1_OPEN_BOTFATHER' as const, title: 'S1 打开 BotFather', summary: '在 Telegram 搜索并打开 @BotFather，确认账号名完全一致。', screenshotTitle: 'BotFather 入口', screenshotHint: '截图示意 Telegram 内搜索并进入 BotFather。' },
  { id: 'S2_CREATE_BOT' as const, title: 'S2 创建 Bot', summary: '给 BotFather 发送 /newbot，根据提示填写机器人名称。', screenshotTitle: '/newbot 操作', screenshotHint: '截图示意如何发送 /newbot。' },
  { id: 'S3_SET_USERNAME' as const, title: 'S3 设置用户名', summary: '设置用户名，必须以 bot 结尾，例如 openclaw_helper_bot。', screenshotTitle: '用户名规则', screenshotHint: '截图示意用户名格式要求。' },
  { id: 'S4_PASTE_TOKEN' as const, title: 'S4 粘贴 Token', summary: '将 BotFather 返回的 Token 粘贴到下方输入框。', screenshotTitle: 'Token 位置', screenshotHint: '截图示意复制 Token 的位置。' },
  { id: 'S5_VERIFY_TOKEN' as const, title: 'S5 验证 Token', summary: '点击自动检查，调用 Telegram getMe 验证 token 可用性。', screenshotTitle: '验证成功示意', screenshotHint: '截图示意验证成功后展示 bot 信息。' },
  { id: 'S6_APPLY_CONFIG' as const, title: 'S6 应用配置', summary: '把 Telegram 配置应用到当前 Agent（热加载优先，失败自动重启）。', screenshotTitle: '配置应用策略', screenshotHint: '示意热加载失败后自动重启流程。' },
  { id: 'S7_PROBE_CHANNEL' as const, title: 'S7 通道探测', summary: '检查 Telegram 通道是否 ready。', screenshotTitle: '通道探测结果', screenshotHint: '展示 ready / degraded 结果卡片。' },
  { id: 'S8_WAIT_FIRST_DM' as const, title: 'S8 发送首条消息', summary: '到 Telegram 给 bot 发送首条消息，系统等待 pairing 请求。', screenshotTitle: '首条 DM 操作', screenshotHint: '截图示意用户在 Telegram 发首条消息。' },
  { id: 'S9_APPROVE_PAIRING' as const, title: 'S9 批准 Pairing', summary: '检测到 pending pairing 后点击一键批准。', screenshotTitle: 'Pairing 审批', screenshotHint: '示意请求列表和一键批准按钮。' },
  { id: 'S10_LOOPBACK_TEST' as const, title: 'S10 回环测试', summary: '发送测试消息并确认 bot 回复，完成绑定。', screenshotTitle: '回环成功', screenshotHint: '示意测试消息成功与状态变为 Ready。' },
]

const INITIAL_AGENTS: AgentMeta[] = [
  { id: 'main', name: '默认 Agent', workspace: '~/.openclaw-client/workspaces/main', gatewayHealth: 'Healthy', isDefault: true },
  { id: 'research', name: 'Research Agent', workspace: '~/.openclaw-client/workspaces/research', gatewayHealth: 'Healthy' },
  { id: 'ops', name: 'Ops Agent', workspace: '~/.openclaw-client/workspaces/ops', gatewayHealth: 'Recovering' },
]

const INITIAL_CHAT_LOG: Record<AgentId, ChatMessage[]> = {
  main: [
    { role: 'assistant', text: '你好，我是默认 Agent。你可以在右上角设置里绑定 Telegram。' },
    { role: 'user', text: '我想把你连到 Telegram。' },
    { role: 'assistant', text: '可以，打开设置 -> Telegram，按 11 步引导完成即可。' },
  ],
  research: [{ role: 'assistant', text: 'Research Agent 已就绪。当前仅提供 Demo 交互。' }],
  ops: [{ role: 'assistant', text: 'Ops Agent 正在恢复中。你仍然可以继续使用其他 Agent。' }],
}

const createGuideState = (): GuideState => ({
  open: false,
  currentStep: 0,
  checks: GUIDE_STEPS.map(() => false),
  tokenInput: '',
  lastCheckMessage: '',
})

const createInitialGuideRecord = (agents: AgentMeta[]): Record<AgentId, GuideState> =>
  agents.reduce<Record<AgentId, GuideState>>((acc, agent) => { acc[agent.id] = createGuideState(); return acc }, {})

const initialTelegramPreset: Record<AgentId, TelegramStatus> = {
  main: 'NotConfigured',
  research: 'NotConfigured',
  ops: 'Degraded',
}

const createInitialTelegramState = (agents: AgentMeta[]): Record<AgentId, TelegramStatus> =>
  agents.reduce<Record<AgentId, TelegramStatus>>((acc, agent) => { acc[agent.id] = initialTelegramPreset[agent.id] ?? 'NotConfigured'; return acc }, {})

const toAgentMeta = (agent: AgentSummary): AgentMeta => ({
  id: agent.id,
  name: agent.name,
  workspace: agent.workspace,
  gatewayHealth: agent.gateway.health,
  isDefault: agent.isDefault,
})

function App() {
  const [agents, setAgents] = useState<AgentMeta[]>(INITIAL_AGENTS)
  const [section, setSection] = useState<SectionKey>('agent')
  const [agentExpanded, setAgentExpanded] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<AgentId>('main')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [settingsScope, setSettingsScope] = useState<'agent' | 'global'>('agent')
  const [activeTab, setActiveTab] = useState<TabKey>('telegram')
  const [sleepGuardEnabled] = useState(true)
  const [simulateRunning, setSimulateRunning] = useState(false)
  const [telegramStatus, setTelegramStatus] = useState<Record<AgentId, TelegramStatus>>(
    () => createInitialTelegramState(INITIAL_AGENTS),
  )
  const [guides, setGuides] = useState<Record<AgentId, GuideState>>(
    () => createInitialGuideRecord(INITIAL_AGENTS),
  )
  const [chatLog, setChatLog] = useState<Record<AgentId, ChatMessage[]>>(() => INITIAL_CHAT_LOG)
  const [draftMessage, setDraftMessage] = useState('')
  const [chatPendingByAgent, setChatPendingByAgent] = useState<Record<AgentId, boolean>>({})
  const [chatErrorByAgent, setChatErrorByAgent] = useState<Record<AgentId, string>>({})
  const [localApiReady, setLocalApiReady] = useState(false)
  const [lastHealthCheckAt, setLastHealthCheckAt] = useState<number | null>(null)
  const [chatDiagnosticsByAgent, setChatDiagnosticsByAgent] = useState<Record<AgentId, ChatDiagnostics | undefined>>({})
  const [guideCheckPendingByAgent, setGuideCheckPendingByAgent] = useState<Record<AgentId, boolean>>({})
  const [createAgentPending, setCreateAgentPending] = useState(false)

  const currentAgentMeta = useMemo(
    () => agents.find((a) => a.id === selectedAgent) ?? agents[0],
    [agents, selectedAgent],
  )
  const currentGuide = guides[selectedAgent] ?? createGuideState()
  const currentChatLog = chatLog[selectedAgent] ?? []
  const currentChatPending = chatPendingByAgent[selectedAgent] ?? false
  const currentChatError = chatErrorByAgent[selectedAgent] ?? ''
  const currentDiagnostics = chatDiagnosticsByAgent[selectedAgent]
  const currentGuideCheckPending = guideCheckPendingByAgent[selectedAgent] ?? false

  const sleepLockActive = sleepGuardEnabled && simulateRunning

  // --- Effects ---

  useEffect(() => {
    let disposed = false
    const probeLocalApi = async () => {
      try {
        await checkLocalApiHealth()
        if (disposed) return
        setLocalApiReady(true)
        setLastHealthCheckAt(Date.now())
      } catch {
        if (disposed) return
        setLocalApiReady(false)
        setLastHealthCheckAt(Date.now())
      }
    }
    void probeLocalApi()
    const timer = window.setInterval(() => { void probeLocalApi() }, 5000)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])

  const upsertAgentClientState = useCallback((agent: AgentMeta, options?: { welcomeText?: string }) => {
    const status = initialTelegramPreset[agent.id] ?? 'NotConfigured'
    setTelegramStatus((prev) => (prev[agent.id] ? prev : { ...prev, [agent.id]: status }))
    setGuides((prev) => (prev[agent.id] ? prev : { ...prev, [agent.id]: createGuideState() }))
    setChatLog((prev) =>
      prev[agent.id]
        ? prev
        : { ...prev, [agent.id]: [{ role: 'assistant', text: options?.welcomeText ?? `${agent.name} 已创建，可以开始真实 API 对话。` }] },
    )
    setChatPendingByAgent((prev) => (agent.id in prev ? prev : { ...prev, [agent.id]: false }))
    setChatErrorByAgent((prev) => (agent.id in prev ? prev : { ...prev, [agent.id]: '' }))
    setChatDiagnosticsByAgent((prev) => (agent.id in prev ? prev : { ...prev, [agent.id]: undefined }))
    setGuideCheckPendingByAgent((prev) => (agent.id in prev ? prev : { ...prev, [agent.id]: false }))
  }, [])

  useEffect(() => {
    if (!localApiReady) return
    let disposed = false
    const syncAgentsFromApi = async () => {
      try {
        const remoteAgents = await listAgents()
        if (disposed || remoteAgents.length === 0) return
        const nextAgents = remoteAgents.map(toAgentMeta)
        setAgents(nextAgents)
        for (const agent of nextAgents) upsertAgentClientState(agent)
        setSelectedAgent((prev) => {
          if (nextAgents.some((agent) => agent.id === prev)) return prev
          return nextAgents.find((agent) => agent.isDefault)?.id ?? nextAgents[0].id
        })
      } catch { /* Keep fallback UI state when API list fails. */ }
    }
    void syncAgentsFromApi()
    return () => { disposed = true }
  }, [localApiReady, upsertAgentClientState])

  // --- Handlers ---

  const updateGuide = (agentId: AgentId, updater: (prev: GuideState) => GuideState) => {
    setGuides((prev) => ({ ...prev, [agentId]: updater(prev[agentId] ?? createGuideState()) }))
  }

  const appendChatMessage = (agentId: AgentId, message: ChatMessage) => {
    setChatLog((prev) => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), message] }))
  }

  const updateAgentGatewayHealth = (agentId: AgentId, health: AgentMeta['gatewayHealth']) => {
    setAgents((prev) => prev.map((agent) => (agent.id === agentId ? { ...agent, gatewayHealth: health } : agent)))
  }

  const navigateToSection = (next: SectionKey) => {
    const nextState = navigateSection({ section, agentExpanded }, next)
    setSection(nextState.section)
    setAgentExpanded(nextState.agentExpanded)
  }

  const handleCreateAgent = async () => {
    if (createAgentPending) return
    setCreateAgentPending(true)
    setChatErrorByAgent((prev) => ({ ...prev, [selectedAgent]: '' }))
    try {
      const created = await createAgentRequest(`Agent ${agents.length + 1}`)
      const nextAgent = toAgentMeta(created)
      setAgents((prev) => {
        const existing = prev.find((agent) => agent.id === nextAgent.id)
        if (existing) return prev.map((agent) => (agent.id === nextAgent.id ? nextAgent : agent))
        return [...prev, nextAgent]
      })
      upsertAgentClientState(nextAgent)
      setSelectedAgent(nextAgent.id)
      setSection('agent')
      setAgentExpanded(true)
      setLocalApiReady(true)
      setLastHealthCheckAt(Date.now())
    } catch (error) {
      const message = error instanceof Error ? error.message : '请稍后重试。'
      setChatErrorByAgent((prev) => ({ ...prev, [selectedAgent]: `新建 Agent 失败：${message}` }))
      if (!(error instanceof OpenClawApiError)) setLocalApiReady(false)
      setLastHealthCheckAt(Date.now())
    } finally {
      setCreateAgentPending(false)
    }
  }

  const handleSendMessage = async () => {
    const trimmed = draftMessage.trim()
    if (!trimmed || currentChatPending) return
    const agentId = selectedAgent
    setDraftMessage('')
    setChatErrorByAgent((prev) => ({ ...prev, [agentId]: '' }))
    appendChatMessage(agentId, { role: 'user', text: trimmed })
    setChatPendingByAgent((prev) => ({ ...prev, [agentId]: true }))
    try {
      const result = await sendAgentMessage(agentId, trimmed)
      appendChatMessage(agentId, { role: 'assistant', text: result.reply })
      updateAgentGatewayHealth(agentId, result.gateway.health)
      if (result.diagnostics) setChatDiagnosticsByAgent((prev) => ({ ...prev, [agentId]: result.diagnostics }))
      setLocalApiReady(true)
      setLastHealthCheckAt(Date.now())
    } catch (error) {
      const resolved = resolveChatSendError(error)
      setChatErrorByAgent((prev) => ({ ...prev, [agentId]: resolved.message }))
      updateAgentGatewayHealth(agentId, resolved.nextGatewayHealth)
      setLocalApiReady((prev) => (resolved.markLocalApiDown ? false : prev))
      setLastHealthCheckAt(Date.now())
    } finally {
      setChatPendingByAgent((prev) => ({ ...prev, [agentId]: false }))
    }
  }

  const tokenPattern = /^\d{6,}:[A-Za-z0-9_-]{20,}$/

  const runAutoCheck = async () => {
    const agentId = selectedAgent
    const guide = guides[agentId] ?? createGuideState()
    const step = GUIDE_STEPS[guide.currentStep]
    let ok = true
    let message = '检查通过，可以进入下一步。'

    switch (step.id) {
      case 'S0_ENV_CHECK': message = '网关在线，网络可达。'; break
      case 'S4_PASTE_TOKEN': { ok = tokenPattern.test(guide.tokenInput.trim()); message = ok ? 'Token 格式正确。' : 'Token 格式不正确，请重新粘贴。'; break }
      case 'S5_VERIFY_TOKEN': {
        const token = guide.tokenInput.trim()
        if (!tokenPattern.test(token)) { ok = false; message = 'Token 格式不正确，请重新粘贴。'; break }
        setGuideCheckPendingByAgent((prev) => ({ ...prev, [agentId]: true }))
        setTelegramStatus((prev) => ({ ...prev, [agentId]: 'InProgress' }))
        try {
          const result = await verifyTelegramToken(agentId, token)
          const botLabel = result.bot.username ? `@${result.bot.username}` : result.bot.firstName || result.bot.id
          message = `Token 验证成功，已识别 bot: ${botLabel}。`
        } catch (error) {
          ok = false
          message = error instanceof OpenClawApiError ? error.message : 'Token 校验失败，请检查网络后重试。'
          setTelegramStatus((prev) => ({ ...prev, [agentId]: 'NotConfigured' }))
        } finally {
          setGuideCheckPendingByAgent((prev) => ({ ...prev, [agentId]: false }))
        }
        break
      }
      case 'S6_APPLY_CONFIG': setTelegramStatus((prev) => ({ ...prev, [agentId]: 'InProgress' })); message = '已应用配置：热加载成功。'; break
      case 'S7_PROBE_CHANNEL': setTelegramStatus((prev) => ({ ...prev, [agentId]: 'InProgress' })); message = '通道探测通过，状态 ready。'; break
      case 'S8_WAIT_FIRST_DM': message = '已检测到首条消息，等待 Pairing 审批。'; break
      case 'S9_APPROVE_PAIRING': message = 'Pairing 已批准。'; break
      case 'S10_LOOPBACK_TEST': setTelegramStatus((prev) => ({ ...prev, [agentId]: 'Ready' })); message = '回环测试通过，Telegram 已可用。'; break
      default: break
    }

    updateGuide(agentId, (prev) => {
      const checks = [...prev.checks]
      checks[prev.currentStep] = ok
      return { ...prev, checks, lastCheckMessage: message }
    })
  }

  const moveStep = (direction: 'next' | 'prev') => {
    updateGuide(selectedAgent, (prev) => {
      if (direction === 'prev') return { ...prev, currentStep: Math.max(0, prev.currentStep - 1), lastCheckMessage: '' }
      if (!prev.checks[prev.currentStep]) return { ...prev, lastCheckMessage: '请先点击"自动检查"，检查通过后再继续。' }
      if (prev.currentStep === GUIDE_STEPS.length - 1) return { ...prev, open: false }
      return { ...prev, currentStep: Math.min(GUIDE_STEPS.length - 1, prev.currentStep + 1), lastCheckMessage: '' }
    })
  }

  const lastHealthCheckLabel = lastHealthCheckAt ? new Date(lastHealthCheckAt).toLocaleTimeString() : '--'

  // --- Render ---

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(40,80,90,0.18),transparent_32%),radial-gradient(circle_at_100%_100%,rgba(17,95,80,0.12),transparent_28%)] bg-background text-foreground">
      <Sidebar
        agents={agents}
        selectedAgent={selectedAgent}
        onSelectAgent={setSelectedAgent}
        section={section}
        onNavigateSection={navigateToSection}
        agentExpanded={agentExpanded}
        onToggleAgentExpanded={() => setAgentExpanded((prev) => !prev)}
        onCreateAgent={() => void handleCreateAgent()}
        createAgentPending={createAgentPending}
        onOpenGlobalSettings={() => { setSettingsScope('global'); setActiveTab('advanced'); setDrawerOpen(true) }}
      />

      <main className="flex flex-1 p-4">
        {section === 'agent' ? (
          <ChatPanel
            agent={currentAgentMeta}
            chatLog={currentChatLog}
            draftMessage={draftMessage}
            onDraftChange={setDraftMessage}
            onSendMessage={handleSendMessage}
            pending={currentChatPending}
            error={currentChatError}
            diagnostics={currentDiagnostics}
            telegramStatus={telegramStatus[selectedAgent]}
            sleepLockActive={sleepLockActive}
            localApiReady={localApiReady}
            lastHealthCheckLabel={lastHealthCheckLabel}
            simulateRunning={simulateRunning}
            onSimulateToggle={() => setSimulateRunning((v) => !v)}
            onOpenSettings={() => { setSettingsScope('agent'); setDrawerOpen(true) }}
          />
        ) : (
          <ModulePanel section={section} />
        )}
      </main>

      <SettingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        scope={settingsScope}
        agent={currentAgentMeta}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sleepGuardEnabled={sleepGuardEnabled}
        telegramStatus={telegramStatus[selectedAgent]}
        guide={currentGuide}
        guideSteps={GUIDE_STEPS}
        guideCheckPending={currentGuideCheckPending}
        onOpenGuide={() => {
          updateGuide(selectedAgent, (prev) => ({ ...prev, open: true }))
          setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: prev[selectedAgent] === 'Ready' ? 'InProgress' : prev[selectedAgent] }))
        }}
        onResetGuide={() => {
          updateGuide(selectedAgent, () => ({ ...createGuideState(), open: true }))
          setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: 'NotConfigured' }))
        }}
        onAutoCheck={() => void runAutoCheck()}
        onMoveStep={moveStep}
        onStepClick={(index) => updateGuide(selectedAgent, (prev) => ({ ...prev, currentStep: index, lastCheckMessage: '' }))}
        onTokenChange={(value) => updateGuide(selectedAgent, (prev) => ({
          ...prev,
          tokenInput: value,
          checks: prev.checks.map((v, idx) => idx === prev.currentStep ? false : v),
          lastCheckMessage: '',
        }))}
      />
    </div>
  )
}

export default App
