import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyTelegramConfig,
  approveTelegramPairing,
  createAgent,
  listAgents,
  openLocalPath,
  probeTelegramChannel,
  probeTelegramFirstDm,
  runTelegramLoopbackTest,
  sendAgentMessage,
  stripThinkTags,
  updateAgent,
  verifyTelegramToken,
} from './openclaw'

describe('listAgents', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed agent list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: [
            {
              id: 'main',
              name: '默认 Agent',
              workspace: '~/.openclaw-client/workspaces/main',
              isDefault: true,
              gateway: {
                id: 'gw-main',
                health: 'Healthy',
              },
            },
          ],
        }),
      }),
    )

    const result = await listAgents()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('main')
    expect(result[0].isDefault).toBe(true)
  })

  it('throws OpenClawApiError when list api fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error: {
            code: 'LIST_AGENTS_FAILED',
            message: '读取 Agent 列表失败',
          },
        }),
      }),
    )

    await expect(listAgents()).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 500,
      code: 'LIST_AGENTS_FAILED',
    })
  })
})

describe('createAgent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts payload and returns created agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        data: {
          id: 'agent-1',
          name: 'Agent 1',
          workspace: '~/.openclaw-client/workspaces/agent-1',
          gateway: {
            id: 'gw-agent-1',
            health: 'Healthy',
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createAgent('Agent 1')
    expect(result.id).toBe('agent-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/agents',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})

describe('updateAgent', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('patches name and returns updated agent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          id: 'main',
          name: '新的默认 Agent',
          workspace: '~/.openclaw-client/workspaces/main',
          isDefault: true,
          gateway: {
            id: 'gw-main',
            health: 'Healthy',
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await updateAgent('main', '新的默认 Agent')
    expect(result.name).toBe('新的默认 Agent')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/agents/main',
      expect.objectContaining({
        method: 'PATCH',
      }),
    )
  })
})

describe('openLocalPath', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts path to open endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          path: '/tmp/demo',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(openLocalPath('/tmp/demo')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/system/open-path',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })
})

describe('verifyTelegramToken', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns verified telegram bot metadata on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            bot: {
              id: '123456',
              username: 'demo_openclaw_bot',
              firstName: 'Demo Bot',
              canJoinGroups: true,
              canReadAllGroupMessages: false,
              supportsInlineQueries: false,
            },
          },
        }),
      }),
    )

    const result = await verifyTelegramToken('main', '123456:AAABBBCCCDDDEEEFFF111222333')
    expect(result.bot.username).toBe('demo_openclaw_bot')
  })

  it('throws OpenClawApiError when token verify fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error: {
            code: 'TELEGRAM_TOKEN_INVALID',
            message: 'Token 无效或已失效，请重新在 BotFather 生成',
          },
        }),
      }),
    )

    await expect(verifyTelegramToken('main', 'bad-token')).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 400,
      code: 'TELEGRAM_TOKEN_INVALID',
    })
  })
})

describe('sendAgentMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed chat result on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            reply: 'ok',
            gateway: {
              id: 'gw-main',
              health: 'Healthy',
            },
            createdAt: '2026-02-19T00:00:00.000Z',
          },
        }),
      }),
    )

    const result = await sendAgentMessage('main', 'hello')
    expect(result.reply).toBe('ok')
    expect(result.gateway.id).toBe('gw-main')
  })

  it('throws OpenClawApiError when server returns failure payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          ok: false,
          error: {
            code: 'GATEWAY_DISCONNECTED',
            message: 'gw-main 当前不可用',
          },
        }),
      }),
    )

    await expect(sendAgentMessage('main', 'hello')).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 503,
      code: 'GATEWAY_DISCONNECTED',
    })
  })
})

describe('telegram execution apis', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('applies telegram config', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            tokenMasked: '123456***ABCD',
            strategy: 'stored_local',
            appliedAt: '2026-02-25T00:00:00.000Z',
            bot: {
              id: '1',
              username: 'demo_bot',
              firstName: 'Demo',
              canJoinGroups: true,
              canReadAllGroupMessages: false,
              supportsInlineQueries: false,
            },
          },
        }),
      }),
    )

    const result = await applyTelegramConfig('main', '123456:AAABBBCCCDDDEEEFFF111222333')
    expect(result.agentId).toBe('main')
    expect(result.tokenMasked).toContain('***')
  })

  it('probes telegram channel', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            status: 'waiting_pairing',
            message: 'Telegram 通道可用，等待首条 DM 触发 pairing。',
          },
        }),
      }),
    )

    const result = await probeTelegramChannel('main')
    expect(result.status).toBe('waiting_pairing')
  })

  it('probes first dm and returns candidate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            found: true,
            message: '检测到首条私信。',
            pendingPairing: {
              chatId: '10001',
              userId: '20001',
              username: 'demo_user',
              firstName: 'Demo',
              text: 'hi',
              detectedAt: '2026-02-25T00:00:00.000Z',
              updateId: 123,
            },
          },
        }),
      }),
    )

    const result = await probeTelegramFirstDm('main')
    expect(result.found).toBe(true)
    expect(result.pendingPairing?.chatId).toBe('10001')
  })

  it('approves pairing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            message: 'Pairing 已批准。',
            noticeSent: true,
            approvedPairing: {
              chatId: '10001',
              approvedAt: '2026-02-25T00:00:00.000Z',
            },
          },
        }),
      }),
    )

    const result = await approveTelegramPairing('main')
    expect(result.noticeSent).toBe(true)
    expect(result.approvedPairing.chatId).toBe('10001')
  })

  it('runs loopback test', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            agentId: 'main',
            chatId: '10001',
            messageId: '999',
            deliveredAt: '2026-02-25T00:00:00.000Z',
            message: '回环测试消息已发送。',
          },
        }),
      }),
    )

    const result = await runTelegramLoopbackTest('main')
    expect(result.messageId).toBe('999')
  })
})

describe('stripThinkTags', () => {
  it('removes closed <think> tags', () => {
    expect(stripThinkTags('<think>internal reasoning</think>Hello!')).toBe('Hello!')
  })

  it('removes closed <thinking> tags', () => {
    expect(stripThinkTags('<thinking>step by step</thinking>Result here')).toBe('Result here')
  })

  it('removes unclosed <think> tag at end', () => {
    expect(stripThinkTags('Hello!<think>still thinking...')).toBe('Hello!')
  })

  it('removes unclosed <thinking> tag at end', () => {
    expect(stripThinkTags('Answer<thinking>reasoning without close')).toBe('Answer')
  })

  it('returns text as-is when no think tags', () => {
    expect(stripThinkTags('Just normal text')).toBe('Just normal text')
  })

  it('returns fallback when entire content is think tags', () => {
    expect(stripThinkTags('<think>only internal reasoning</think>')).toBe('收到。')
  })

  it('preserves content before and after think tags', () => {
    expect(stripThinkTags('Before<think>hidden</think>After')).toBe('BeforeAfter')
  })

  it('handles multiple think blocks', () => {
    expect(stripThinkTags('<think>a</think>Hello<thinking>b</thinking> world')).toBe('Hello world')
  })

  it('is case-insensitive', () => {
    expect(stripThinkTags('<THINK>loud</THINK>Quiet')).toBe('Quiet')
  })
})
