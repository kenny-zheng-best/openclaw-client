import { useMemo, useState } from 'react'
import './App.css'
import { navigateSection, type SectionKey } from './state/navigation'

type AgentId = string
type TelegramStatus = 'NotConfigured' | 'InProgress' | 'Ready' | 'Degraded'
type TabKey = 'basic' | 'telegram' | 'advanced'

type GuideStepId =
  | 'S0_ENV_CHECK'
  | 'S1_OPEN_BOTFATHER'
  | 'S2_CREATE_BOT'
  | 'S3_SET_USERNAME'
  | 'S4_PASTE_TOKEN'
  | 'S5_VERIFY_TOKEN'
  | 'S6_APPLY_CONFIG'
  | 'S7_PROBE_CHANNEL'
  | 'S8_WAIT_FIRST_DM'
  | 'S9_APPROVE_PAIRING'
  | 'S10_LOOPBACK_TEST'

interface AgentMeta {
  id: AgentId
  name: string
  workspace: string
  gatewayHealth: 'Healthy' | 'Recovering' | 'Degraded'
  isDefault?: boolean
}

interface GuideStep {
  id: GuideStepId
  title: string
  summary: string
  screenshotTitle: string
  screenshotHint: string
}

interface GuideState {
  open: boolean
  currentStep: number
  checks: boolean[]
  tokenInput: string
  lastCheckMessage: string
}

const INITIAL_AGENTS: AgentMeta[] = [
  {
    id: 'main',
    name: '默认 Agent',
    workspace: '~/.openclaw/workspace-main',
    gatewayHealth: 'Healthy',
    isDefault: true,
  },
  {
    id: 'research',
    name: 'Research Agent',
    workspace: '~/.openclaw/workspace-research',
    gatewayHealth: 'Healthy',
  },
  {
    id: 'ops',
    name: 'Ops Agent',
    workspace: '~/.openclaw/workspace-ops',
    gatewayHealth: 'Recovering',
  },
]

const GUIDE_STEPS: GuideStep[] = [
  {
    id: 'S0_ENV_CHECK',
    title: 'S0 环境检查',
    summary: '先检查当前 Agent 网关与网络状态，确认后续步骤可执行。',
    screenshotTitle: '环境检查示意',
    screenshotHint: '展示 Gateway 在线、网络可达、状态正常。',
  },
  {
    id: 'S1_OPEN_BOTFATHER',
    title: 'S1 打开 BotFather',
    summary: '在 Telegram 搜索并打开 @BotFather，确认账号名完全一致。',
    screenshotTitle: 'BotFather 入口',
    screenshotHint: '截图示意 Telegram 内搜索并进入 BotFather。',
  },
  {
    id: 'S2_CREATE_BOT',
    title: 'S2 创建 Bot',
    summary: '给 BotFather 发送 /newbot，根据提示填写机器人名称。',
    screenshotTitle: '/newbot 操作',
    screenshotHint: '截图示意如何发送 /newbot。',
  },
  {
    id: 'S3_SET_USERNAME',
    title: 'S3 设置用户名',
    summary: '设置用户名，必须以 bot 结尾，例如 openclaw_helper_bot。',
    screenshotTitle: '用户名规则',
    screenshotHint: '截图示意用户名格式要求。',
  },
  {
    id: 'S4_PASTE_TOKEN',
    title: 'S4 粘贴 Token',
    summary: '将 BotFather 返回的 Token 粘贴到下方输入框。',
    screenshotTitle: 'Token 位置',
    screenshotHint: '截图示意复制 Token 的位置。',
  },
  {
    id: 'S5_VERIFY_TOKEN',
    title: 'S5 验证 Token',
    summary: '点击自动检查，模拟调用 Telegram getMe 验证 token 可用性。',
    screenshotTitle: '验证成功示意',
    screenshotHint: '截图示意验证成功后展示 bot 信息。',
  },
  {
    id: 'S6_APPLY_CONFIG',
    title: 'S6 应用配置',
    summary: '把 Telegram 配置应用到当前 Agent（热加载优先，失败自动重启）。',
    screenshotTitle: '配置应用策略',
    screenshotHint: '示意热加载失败后自动重启流程。',
  },
  {
    id: 'S7_PROBE_CHANNEL',
    title: 'S7 通道探测',
    summary: '检查 Telegram 通道是否 ready。',
    screenshotTitle: '通道探测结果',
    screenshotHint: '展示 ready / degraded 结果卡片。',
  },
  {
    id: 'S8_WAIT_FIRST_DM',
    title: 'S8 发送首条消息',
    summary: '到 Telegram 给 bot 发送首条消息，系统等待 pairing 请求。',
    screenshotTitle: '首条 DM 操作',
    screenshotHint: '截图示意用户在 Telegram 发首条消息。',
  },
  {
    id: 'S9_APPROVE_PAIRING',
    title: 'S9 批准 Pairing',
    summary: '检测到 pending pairing 后点击一键批准。',
    screenshotTitle: 'Pairing 审批',
    screenshotHint: '示意请求列表和一键批准按钮。',
  },
  {
    id: 'S10_LOOPBACK_TEST',
    title: 'S10 回环测试',
    summary: '发送测试消息并确认 bot 回复，完成绑定。',
    screenshotTitle: '回环成功',
    screenshotHint: '示意测试消息成功与状态变为 Ready。',
  },
]

const CHAT_LOG: Record<AgentId, Array<{ role: 'user' | 'assistant'; text: string }>> = {
  main: [
    { role: 'assistant', text: '你好，我是默认 Agent。你可以在右上角设置里绑定 Telegram。' },
    { role: 'user', text: '我想把你连到 Telegram。' },
    { role: 'assistant', text: '可以，打开设置 -> Telegram，按 11 步引导完成即可。' },
  ],
  research: [
    { role: 'assistant', text: 'Research Agent 已就绪。当前仅提供 Demo 交互。' },
  ],
  ops: [
    { role: 'assistant', text: 'Ops Agent 正在恢复中。你仍然可以继续使用其他 Agent。' },
  ],
}

const createGuideState = (): GuideState => ({
  open: false,
  currentStep: 0,
  checks: GUIDE_STEPS.map(() => false),
  tokenInput: '',
  lastCheckMessage: '',
})

const createInitialGuideRecord = (agents: AgentMeta[]): Record<AgentId, GuideState> =>
  agents.reduce<Record<AgentId, GuideState>>((acc, agent) => {
    acc[agent.id] = createGuideState()
    return acc
  }, {})

const initialTelegramPreset: Record<AgentId, TelegramStatus> = {
  main: 'NotConfigured',
  research: 'NotConfigured',
  ops: 'Degraded',
}

const createInitialTelegramState = (agents: AgentMeta[]): Record<AgentId, TelegramStatus> =>
  agents.reduce<Record<AgentId, TelegramStatus>>((acc, agent) => {
    acc[agent.id] = initialTelegramPreset[agent.id] ?? 'NotConfigured'
    return acc
  }, {})

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

  const currentAgentMeta = useMemo(
    () => agents.find((a) => a.id === selectedAgent) ?? agents[0],
    [agents, selectedAgent],
  )
  const currentGuide = guides[selectedAgent] ?? createGuideState()
  const currentStep = GUIDE_STEPS[currentGuide.currentStep]

  const sleepLockActive = sleepGuardEnabled && simulateRunning

  const updateGuide = (agentId: AgentId, updater: (prev: GuideState) => GuideState) => {
    setGuides((prev) => ({ ...prev, [agentId]: updater(prev[agentId] ?? createGuideState()) }))
  }

  const openAgentSettings = () => {
    setSettingsScope('agent')
    setDrawerOpen(true)
  }

  const openGlobalSettings = () => {
    setSettingsScope('global')
    setActiveTab('advanced')
    setDrawerOpen(true)
  }

  const navigateToSection = (next: SectionKey) => {
    const nextState = navigateSection(
      {
        section,
        agentExpanded,
      },
      next,
    )
    setSection(nextState.section)
    setAgentExpanded(nextState.agentExpanded)
  }

  const createAgent = () => {
    const nextIndex = agents.length + 1
    const nextId = `agent-${nextIndex}`
    const nextAgent: AgentMeta = {
      id: nextId,
      name: `Agent ${nextIndex}`,
      workspace: `~/.openclaw/workspace-${nextId}`,
      gatewayHealth: 'Healthy',
    }

    setAgents((prev) => [...prev, nextAgent])
    setSelectedAgent(nextId)
    setSection('agent')
    setAgentExpanded(true)
    setTelegramStatus((prev) => ({ ...prev, [nextId]: 'NotConfigured' }))
    setGuides((prev) => ({ ...prev, [nextId]: createGuideState() }))
  }

  const resetGuide = () => {
    updateGuide(selectedAgent, () => ({ ...createGuideState(), open: true }))
    setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: 'NotConfigured' }))
  }

  const openGuide = () => {
    updateGuide(selectedAgent, (prev) => ({ ...prev, open: true }))
    setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: prev[selectedAgent] === 'Ready' ? 'InProgress' : prev[selectedAgent] }))
  }

  const setGuideCheckResult = (ok: boolean, message: string) => {
    updateGuide(selectedAgent, (prev) => {
      const checks = [...prev.checks]
      checks[prev.currentStep] = ok
      return { ...prev, checks, lastCheckMessage: message }
    })
  }

  const tokenPattern = /^\d{6,}:[A-Za-z0-9_-]{20,}$/

  const runAutoCheck = () => {
    let ok = true
    let message = '检查通过，可以进入下一步。'

    switch (currentStep.id) {
      case 'S0_ENV_CHECK':
        message = '网关在线，网络可达。'
        break
      case 'S4_PASTE_TOKEN': {
        ok = tokenPattern.test(currentGuide.tokenInput.trim())
        message = ok ? 'Token 格式正确。' : 'Token 格式不正确，请重新粘贴。'
        break
      }
      case 'S5_VERIFY_TOKEN': {
        ok = tokenPattern.test(currentGuide.tokenInput.trim())
        message = ok ? 'Token 验证成功，已识别 bot: @demo_openclaw_bot。' : 'Token 无效或已失效，请重新生成。'
        break
      }
      case 'S6_APPLY_CONFIG':
        setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: 'InProgress' }))
        message = '已应用配置：热加载成功。'
        break
      case 'S7_PROBE_CHANNEL':
        setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: 'InProgress' }))
        message = '通道探测通过，状态 ready。'
        break
      case 'S8_WAIT_FIRST_DM':
        message = '已检测到首条消息，等待 Pairing 审批。'
        break
      case 'S9_APPROVE_PAIRING':
        message = 'Pairing 已批准。'
        break
      case 'S10_LOOPBACK_TEST':
        setTelegramStatus((prev) => ({ ...prev, [selectedAgent]: 'Ready' }))
        message = '回环测试通过，Telegram 已可用。'
        break
      default:
        break
    }

    setGuideCheckResult(ok, message)
  }

  const moveStep = (direction: 'next' | 'prev') => {
    updateGuide(selectedAgent, (prev) => {
      if (direction === 'prev') {
        return { ...prev, currentStep: Math.max(0, prev.currentStep - 1), lastCheckMessage: '' }
      }

      if (!prev.checks[prev.currentStep]) {
        return { ...prev, lastCheckMessage: '请先点击“自动检查”，检查通过后再继续。' }
      }

      if (prev.currentStep === GUIDE_STEPS.length - 1) {
        return { ...prev, open: false }
      }

      return {
        ...prev,
        currentStep: Math.min(GUIDE_STEPS.length - 1, prev.currentStep + 1),
        lastCheckMessage: '',
      }
    })
  }

  const renderStatusChip = (status: TelegramStatus) => (
    <span className={`status-chip status-${status.toLowerCase()}`}>{status}</span>
  )

  const renderAgentWorkspace = () => {
    if (section !== 'agent') {
      const titleMap: Record<SectionKey, string> = {
        agent: 'Agent',
        skills: 'Skills',
        automation: '自动任务',
        models: '模型 API',
      }
      return (
        <section className="module-panel">
          <h2>{titleMap[section]}</h2>
          <p>这是 {titleMap[section]} 的占位页面，后续会对齐 Codex 的信息密度和交互方式。</p>
          <div className="module-grid">
            <article>
              <h3>当前阶段</h3>
              <p>先聚焦 Telegram 引导体验，避免范围扩散。</p>
            </article>
            <article>
              <h3>下一步</h3>
              <p>确认 Demo 体验后，再接入真实 Gateway API 与恢复机制。</p>
            </article>
          </div>
        </section>
      )
    }

    return (
      <section className="chat-shell">
        <header className="chat-header">
          <div>
            <h2>{currentAgentMeta.name}</h2>
            <p>
              Workspace: <code>{currentAgentMeta.workspace}</code>
            </p>
          </div>
          <div className="chat-header-actions">
            <span className={`gateway-pill gateway-${currentAgentMeta.gatewayHealth.toLowerCase()}`}>
              Gateway · {currentAgentMeta.gatewayHealth}
            </span>
            <button className="ghost-btn" onClick={() => setSimulateRunning((v) => !v)} type="button">
              {simulateRunning ? '停止模拟任务' : '模拟任务运行'}
            </button>
            <button className="primary-btn" onClick={openAgentSettings} type="button">
              设置
            </button>
          </div>
        </header>

        <div className="chat-log" role="log" aria-live="polite">
          {(CHAT_LOG[selectedAgent] ?? [
            { role: 'assistant', text: `${currentAgentMeta.name} 已创建，当前为 Demo 对话。` },
          ]).map((msg, idx) => (
            <div className={`message message-${msg.role}`} key={`${msg.role}-${idx}`}>
              <span className="message-role">{msg.role === 'assistant' ? 'Agent' : 'You'}</span>
              <p>{msg.text}</p>
            </div>
          ))}
        </div>

        <footer className="composer">
          <input aria-label="chat input" placeholder="输入消息（Demo）" />
          <button type="button">发送</button>
        </footer>

        <div className="runtime-strip">
          <span>Telegram: {renderStatusChip(telegramStatus[selectedAgent])}</span>
          <span>
            Prevent Sleep: <strong>{sleepLockActive ? 'Active' : 'Idle'}</strong>
          </span>
          <span>Mode: 1 Agent = 1 Gateway（默认）</span>
        </div>
      </section>
    )
  }

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="sidebar-main">
          <div className="brand">
            <h1>OpenClaw Client</h1>
            <p>Codex-style Workspace</p>
          </div>

          <nav>
            <div className={`agent-nav-header ${section === 'agent' || agentExpanded ? 'active' : ''}`}>
              <button
                className="agent-toggle-btn"
                onClick={() => {
                  if (section !== 'agent') {
                    navigateToSection('agent')
                    return
                  }
                  setAgentExpanded((prev) => !prev)
                }}
                type="button"
              >
                <span>Agent</span>
                <span className={`agent-chevron ${agentExpanded ? 'open' : ''}`}>▾</span>
              </button>
              <button aria-label="新建 Agent" className="agent-add-btn" onClick={createAgent} type="button">
                +
              </button>
            </div>

            {agentExpanded && (
              <div className="agent-block">
                <div className="agent-list">
                  {agents.map((agent) => (
                    <button
                      className={`agent-item ${selectedAgent === agent.id ? 'active' : ''}`}
                      key={agent.id}
                      onClick={() => {
                        setSelectedAgent(agent.id)
                        navigateToSection('agent')
                      }}
                      type="button"
                    >
                      <span>{agent.name}</span>
                      {agent.isDefault && <em>默认</em>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              className={`nav-item ${section === 'skills' ? 'active' : ''}`}
              onClick={() => navigateToSection('skills')}
              type="button"
            >
              Skills
            </button>
            <button
              className={`nav-item ${section === 'automation' ? 'active' : ''}`}
              onClick={() => navigateToSection('automation')}
              type="button"
            >
              自动任务
            </button>
            <button
              className={`nav-item ${section === 'models' ? 'active' : ''}`}
              onClick={() => navigateToSection('models')}
              type="button"
            >
              模型 API
            </button>
          </nav>
        </div>

        <div className="sidebar-footer">
          <button className="sidebar-settings-btn" onClick={openGlobalSettings} type="button">
            设置
          </button>
        </div>
      </aside>

      <main className="main-content">{renderAgentWorkspace()}</main>

      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`settings-drawer ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <header>
          <div>
            <h3>{settingsScope === 'global' ? '全局设置' : `${currentAgentMeta.name} 设置`}</h3>
            <p>{settingsScope === 'global' ? '应用级偏好与守护选项' : 'IM 配置按当前 Agent 生效'}</p>
          </div>
          <button className="ghost-btn" onClick={() => setDrawerOpen(false)} type="button">
            关闭
          </button>
        </header>

        {settingsScope === 'global' ? (
          <section className="drawer-pane">
            <h4>全局偏好（Demo）</h4>
            <label className="switch-row">
              <span>Prevent Sleep（默认开启）</span>
              <input checked={sleepGuardEnabled} readOnly type="checkbox" />
            </label>
            <p className="muted">说明：仅阻止系统睡眠，不强制保持屏幕点亮。</p>
            <p className="muted">Agent 的 Telegram 绑定请在聊天窗口右上角“设置”中操作。</p>
          </section>
        ) : (
          <>
            <div className="tab-row">
              <button
                className={activeTab === 'basic' ? 'active' : ''}
                onClick={() => setActiveTab('basic')}
                type="button"
              >
                基础
              </button>
              <button
                className={activeTab === 'telegram' ? 'active' : ''}
                onClick={() => setActiveTab('telegram')}
                type="button"
              >
                Telegram
              </button>
              <button
                className={activeTab === 'advanced' ? 'active' : ''}
                onClick={() => setActiveTab('advanced')}
                type="button"
              >
                高级
              </button>
            </div>

            {activeTab === 'basic' && (
              <section className="drawer-pane">
                <h4>基础信息</h4>
                <p>Agent 名称：{currentAgentMeta.name}</p>
                <p>
                  Workspace：<code>{currentAgentMeta.workspace}</code>
                </p>
                <p>Gateway 状态：{currentAgentMeta.gatewayHealth}</p>
              </section>
            )}

            {activeTab === 'advanced' && (
              <section className="drawer-pane">
                <h4>高级设置（Demo）</h4>
                <p>默认隐藏 1 Agent = 1 Gateway 细节，仅显示结果状态。</p>
                <label className="switch-row">
                  <span>Prevent Sleep（默认开启）</span>
                  <input checked={sleepGuardEnabled} readOnly type="checkbox" />
                </label>
                <p className="muted">说明：仅阻止系统睡眠，不强制保持屏幕点亮。</p>
              </section>
            )}

            {activeTab === 'telegram' && (
              <section className="drawer-pane telegram-pane">
                <div className="telegram-status-card">
                  <h4>Telegram 绑定状态</h4>
                  {renderStatusChip(telegramStatus[selectedAgent])}
                </div>

                <div className="telegram-actions">
                  <button className="primary-btn" onClick={openGuide} type="button">
                    {currentGuide.open ? '继续引导' : '开始绑定引导'}
                  </button>
                  <button className="ghost-btn" onClick={resetGuide} type="button">
                    重置引导
                  </button>
                </div>

                {currentGuide.open && (
                  <article className="guide-shell">
                    <div className="guide-steps">
                      {GUIDE_STEPS.map((step, index) => (
                        <button
                          className={`step-item ${currentGuide.currentStep === index ? 'active' : ''} ${
                            currentGuide.checks[index] ? 'done' : ''
                          }`}
                          key={step.id}
                          onClick={() =>
                            updateGuide(selectedAgent, (prev) => ({
                              ...prev,
                              currentStep: index,
                              lastCheckMessage: '',
                            }))
                          }
                          type="button"
                        >
                          <span>{step.title}</span>
                        </button>
                      ))}
                    </div>

                    <div className="guide-content">
                      <h5>{currentStep.title}</h5>
                      <p>{currentStep.summary}</p>

                      {(currentStep.id === 'S4_PASTE_TOKEN' || currentStep.id === 'S5_VERIFY_TOKEN') && (
                        <div className="token-input">
                          <label htmlFor="telegram-token">Telegram Bot Token</label>
                          <input
                            id="telegram-token"
                            onChange={(e) =>
                              updateGuide(selectedAgent, (prev) => ({
                                ...prev,
                                tokenInput: e.target.value,
                                checks: prev.checks.map((value, idx) =>
                                  idx === prev.currentStep ? false : value,
                                ),
                                lastCheckMessage: '',
                              }))
                            }
                            placeholder="例如 123456789:AA..."
                            value={currentGuide.tokenInput}
                          />
                        </div>
                      )}

                      <div className="guide-feedback" aria-live="polite">
                        {currentGuide.lastCheckMessage || '点击“自动检查”后，检查通过即可继续。'}
                      </div>

                      <div className="guide-actions">
                        <button className="ghost-btn" onClick={() => runAutoCheck()} type="button">
                          自动检查
                        </button>
                        <button
                          className="ghost-btn"
                          disabled={currentGuide.currentStep === 0}
                          onClick={() => moveStep('prev')}
                          type="button"
                        >
                          返回上一步
                        </button>
                        <button className="primary-btn" onClick={() => moveStep('next')} type="button">
                          {currentGuide.currentStep === GUIDE_STEPS.length - 1 ? '完成' : '我已完成，继续'}
                        </button>
                      </div>
                    </div>

                    <div className="guide-shot">
                      <h6>{currentStep.screenshotTitle}</h6>
                      <div className="shot-placeholder" role="img" aria-label={currentStep.screenshotTitle}>
                        Screenshot Placeholder
                      </div>
                      <p>{currentStep.screenshotHint}</p>
                    </div>
                  </article>
                )}
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  )
}

export default App
