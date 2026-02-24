import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAgent, listAgents, openLocalPath, sendAgentMessage, updateAgent, verifyTelegramToken } from './openclaw'

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
