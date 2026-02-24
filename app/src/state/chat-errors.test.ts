import { describe, expect, it } from 'vitest'
import { OpenClawApiError } from '../api/openclaw'
import { resolveChatSendError } from './chat-errors'

describe('resolveChatSendError', () => {
  it('maps gateway unavailable errors to degraded health', () => {
    const error = new OpenClawApiError('gateway down', 503, 'OPENCLAW_GATEWAY_UNAVAILABLE')
    const result = resolveChatSendError(error)
    expect(result.nextGatewayHealth).toBe('Degraded')
    expect(result.markLocalApiDown).toBe(false)
    expect(result.message).toMatch(/网关不可用/)
  })

  it('maps timeout errors to recovering health', () => {
    const error = new OpenClawApiError('timeout', 504, 'OPENCLAW_TIMEOUT')
    const result = resolveChatSendError(error)
    expect(result.nextGatewayHealth).toBe('Recovering')
    expect(result.markLocalApiDown).toBe(false)
    expect(result.message).toMatch(/超时/)
  })

  it('marks local api down when error is not OpenClawApiError', () => {
    const result = resolveChatSendError(new Error('network down'))
    expect(result.markLocalApiDown).toBe(true)
    expect(result.message).toMatch(/本地 API 不可用/)
  })
})
