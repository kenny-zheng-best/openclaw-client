import { afterEach, describe, expect, it, vi } from 'vitest'
import { getModelConfig, saveModelConfig, testModelConnectivity } from './openclaw'

describe('getModelConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns parsed model config from openclaw.json', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            fullModel: 'cherry-minimax/MiniMax-M2.1',
            providers: {
              'cherry-minimax': {
                baseUrl: 'https://api.minimaxi.com/anthropic',
                apiKey: 'sk-api-test123',
                api: 'anthropic-messages',
                models: [{ id: 'MiniMax-M2.1', name: 'MiniMax M2.1', contextWindow: 128000 }],
              },
            },
          },
        }),
      }),
    )

    const result = await getModelConfig()
    expect(result.fullModel).toBe('cherry-minimax/MiniMax-M2.1')
    expect(result.providers['cherry-minimax'].apiKey).toBe('sk-api-test123')
    expect(result.providers['cherry-minimax'].api).toBe('anthropic-messages')
  })

  it('throws OpenClawApiError when get config fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error: {
            code: 'CONFIG_READ_ERROR',
            message: '读取配置失败',
          },
        }),
      }),
    )

    await expect(getModelConfig()).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 500,
      code: 'CONFIG_READ_ERROR',
    })
  })
})

describe('saveModelConfig', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends PUT request and returns updated config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          fullModel: 'deepseek/deepseek-chat',
          providers: {
            deepseek: {
              baseUrl: 'https://api.deepseek.com',
              apiKey: 'sk-deepseek-123',
              api: 'openai',
              models: [{ id: 'deepseek-chat', name: 'deepseek-chat', contextWindow: 128000 }],
            },
          },
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await saveModelConfig({
      fullModel: 'deepseek/deepseek-chat',
      provider: {
        name: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-deepseek-123',
        api: 'openai',
        models: [{ id: 'deepseek-chat', name: 'deepseek-chat', contextWindow: 128000 }],
      },
    })

    expect(result.fullModel).toBe('deepseek/deepseek-chat')
    expect(result.providers.deepseek.apiKey).toBe('sk-deepseek-123')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/system/model-config',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  })

  it('throws OpenClawApiError when save fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          ok: false,
          error: {
            code: 'CONFIG_WRITE_ERROR',
            message: '保存配置失败',
          },
        }),
      }),
    )

    await expect(
      saveModelConfig({
        fullModel: 'test/model',
        provider: { name: 'test', baseUrl: '', api: 'openai' },
      }),
    ).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 500,
      code: 'CONFIG_WRITE_ERROR',
    })
  })
})

describe('testModelConnectivity', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns successful test result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            success: true,
            latencyMs: 245,
            modelName: 'cherry-minimax/MiniMax-M2.1',
          },
        }),
      }),
    )

    const result = await testModelConnectivity()
    expect(result.success).toBe(true)
    expect(result.latencyMs).toBe(245)
    expect(result.modelName).toBe('cherry-minimax/MiniMax-M2.1')
    expect(result.error).toBeUndefined()
  })

  it('returns failed test result with error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          data: {
            success: false,
            latencyMs: 1200,
            modelName: 'cherry-minimax/MiniMax-M2.1',
            error: '连接超时',
          },
        }),
      }),
    )

    const result = await testModelConnectivity()
    expect(result.success).toBe(false)
    expect(result.error).toBe('连接超时')
    expect(result.latencyMs).toBe(1200)
  })

  it('throws OpenClawApiError when API key is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          ok: false,
          error: {
            code: 'MODEL_KEY_MISSING',
            message: 'Provider "test" 未配置 API Key',
          },
        }),
      }),
    )

    await expect(testModelConnectivity()).rejects.toMatchObject({
      name: 'OpenClawApiError',
      status: 400,
      code: 'MODEL_KEY_MISSING',
    })
  })

  it('sends POST request to correct endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        data: {
          success: true,
          latencyMs: 100,
          modelName: 'test/model',
        },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await testModelConnectivity()
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8787/v1/system/model-test',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
