import type { AgentChatResult } from './api/openclaw'

export type AgentId = string
export type TelegramStatus = 'NotConfigured' | 'InProgress' | 'Ready' | 'Degraded'
export type TabKey = 'basic' | 'telegram' | 'advanced'
export type ChatMessage = { role: 'user' | 'assistant'; text: string }
export type ChatDiagnostics = NonNullable<AgentChatResult['diagnostics']>

export type GuideStepId =
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

export interface AgentMeta {
  id: AgentId
  name: string
  workspace: string
  gatewayHealth: 'Healthy' | 'Recovering' | 'Degraded'
  isDefault?: boolean
}

export interface GuideStep {
  id: GuideStepId
  title: string
  summary: string
  screenshotTitle: string
  screenshotHint: string
}

export interface GuideState {
  open: boolean
  currentStep: number
  checks: boolean[]
  tokenInput: string
  lastCheckMessage: string
}
