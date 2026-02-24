import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listSkills,
  listMcpServers,
  importMcpConfig,
  removeMcpServer,
} from './openclaw'

// --- Skills API Tests ---

describe('listSkills', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed skill list with summary on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            skills: [
              {
                name: 'web-search',
                description: '网络搜索能力',
                emoji: '🔍',
                eligible: true,
                disabled: false,
                blockedByAllowlist: false,
                source: 'openclaw-bundled',
                homepage: 'https://example.com',
                missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
              },
              {
                name: 'docker',
                description: 'Docker 容器管理',
                emoji: '🐳',
                eligible: false,
                disabled: false,
                blockedByAllowlist: false,
                source: 'openclaw-bundled',
                missing: { bins: ['docker'], anyBins: [], env: [], config: [], os: [] },
              },
            ],
            summary: { total: 2, eligible: 1 },
          },
        }),
      }),
    )

    const result = await listSkills()
    expect(result.skills).toHaveLength(2)
    expect(result.summary.total).toBe(2)
    expect(result.summary.eligible).toBe(1)
    expect(result.skills[0].name).toBe('web-search')
    expect(result.skills[0].eligible).toBe(true)
    expect(result.skills[1].missing.bins).toEqual(['docker'])
  })

  it('throws OpenClawApiError when list skills fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error: {
            code: 'SKILLS_LIST_ERROR',
            message: '获取 skills 列表失败',
          },
        }),
      }),
    )

    await expect(listSkills()).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 500,
      code: 'SKILLS_LIST_ERROR',
    })
  })
})

// --- MCP API Tests ---

describe('listMcpServers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed MCP server list on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: [
            {
              id: 'filesystem',
              name: 'filesystem-server',
              transport: 'stdio',
              endpoint: 'npx -y @modelcontextprotocol/server-filesystem /tmp',
              status: 'connected',
            },
          ],
        }),
      }),
    )

    const result = await listMcpServers()
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('filesystem')
    expect(result[0].status).toBe('connected')
  })

  it('throws OpenClawApiError when list MCP servers fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error: {
            code: 'LIST_MCP_FAILED',
            message: '读取 MCP 服务列表失败',
          },
        }),
      }),
    )

    await expect(listMcpServers()).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 500,
      code: 'LIST_MCP_FAILED',
    })
  })
})

describe('importMcpConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts config and returns imported MCP entry', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        ok: true,
        data: {
          id: 'mcp-123',
          name: 'Web Search',
          transport: 'sse',
          endpoint: 'http://localhost:3001/sse',
          status: 'disconnected',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await importMcpConfig({
      name: 'Web Search',
      transport: 'sse',
      endpoint: 'http://localhost:3001/sse',
    })
    expect(result.id).toBe('mcp-123')
    expect(result.transport).toBe('sse')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/mcp/import',
      expect.objectContaining({
        method: 'POST',
      }),
    )
  })

  it('throws OpenClawApiError when import config fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error: {
            code: 'INVALID_MCP_CONFIG',
            message: 'name 和 endpoint 不能为空',
          },
        }),
      }),
    )

    await expect(
      importMcpConfig({ name: '', transport: 'stdio', endpoint: '' }),
    ).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 400,
      code: 'INVALID_MCP_CONFIG',
    })
  })
})

describe('removeMcpServer', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends DELETE request and resolves on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: { removed: true },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(removeMcpServer('filesystem')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/mcp/filesystem',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('throws OpenClawApiError when MCP server not found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          ok: false,
          error: {
            code: 'MCP_NOT_FOUND',
            message: 'MCP 服务 not-exist 不存在',
          },
        }),
      }),
    )

    await expect(removeMcpServer('not-exist')).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 404,
      code: 'MCP_NOT_FOUND',
    })
  })
})
