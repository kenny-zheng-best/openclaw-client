import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Eye, EyeOff, Loader2, CheckCircle2, XCircle, Wifi } from 'lucide-react'
import {
  getModelConfig,
  saveModelConfig,
  testModelConnectivity,
  type OpenClawModelConfig,
  type OpenClawProviderEntry,
  type ModelTestResult,
  type SaveModelConfigPayload,
} from '@/api/openclaw'

// ---------------------------------------------------------------------------
// Provider presets — each id maps to an OpenClaw provider name
// ---------------------------------------------------------------------------

interface ProviderPreset {
  id: string
  name: string
  group: 'global' | 'china' | 'aggregator' | 'local' | 'cloud'
  api: string
  baseUrl: string
  defaultModel: string
  placeholder?: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  // --- Global ---
  { id: 'openai', name: 'OpenAI', group: 'global', api: 'openai', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o' },
  { id: 'anthropic', name: 'Anthropic', group: 'global', api: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-4-5-20250514' },
  { id: 'google-gemini', name: 'Google Gemini', group: 'global', api: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', defaultModel: 'gemini-2.5-flash' },
  { id: 'bedrock', name: 'AWS Bedrock (亚马逊云)', group: 'cloud', api: 'bedrock', baseUrl: '', defaultModel: '', placeholder: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0' },

  // --- China ---
  { id: 'deepseek', name: 'DeepSeek (深度求索)', group: 'china', api: 'openai', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-chat' },
  { id: 'moonshot', name: 'Moonshot / Kimi (月之暗面)', group: 'china', api: 'openai', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-128k' },
  { id: 'minimax', name: 'MiniMax (OpenAI 格式)', group: 'china', api: 'openai', baseUrl: 'https://api.minimaxi.com/v1', defaultModel: 'MiniMax-M2.5' },
  { id: 'minimax-anthropic', name: 'MiniMax (Anthropic 格式)', group: 'china', api: 'anthropic-messages', baseUrl: 'https://api.minimaxi.com/anthropic', defaultModel: 'MiniMax-M2.1' },
  { id: 'qwen', name: 'Qwen / 通义千问 (阿里)', group: 'china', api: 'openai', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-max' },
  { id: 'zhipu', name: 'Zhipu / GLM (智谱)', group: 'china', api: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4' },
  { id: 'doubao', name: 'Doubao / 豆包 (字节)', group: 'china', api: 'openai', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: '', placeholder: '填入你的推理接入点 ID' },
  { id: 'ernie', name: 'ERNIE / 文心 (百度)', group: 'china', api: 'openai', baseUrl: 'https://qianfan.baidubce.com/v2', defaultModel: 'ernie-4.0-turbo-8k' },
  { id: 'spark', name: 'Spark / 星火 (讯飞)', group: 'china', api: 'openai', baseUrl: 'https://spark-api-open.xf-yun.com/v1', defaultModel: 'generalv3.5' },
  { id: 'stepfun', name: 'StepFun / 阶跃星辰', group: 'china', api: 'openai', baseUrl: 'https://api.stepfun.com/v1', defaultModel: 'step-2-16k' },

  // --- Aggregators ---
  { id: 'openrouter', name: 'OpenRouter', group: 'aggregator', api: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: '', placeholder: '选择你要用的模型' },
  { id: 'together', name: 'Together AI', group: 'aggregator', api: 'openai', baseUrl: 'https://api.together.xyz/v1', defaultModel: '' },
  { id: 'huggingface', name: 'HuggingFace', group: 'aggregator', api: 'openai', baseUrl: 'https://router.huggingface.co/v1', defaultModel: '' },
  { id: 'nvidia', name: 'NVIDIA NIM', group: 'aggregator', api: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: '' },

  // --- Local ---
  { id: 'ollama', name: 'Ollama (本地)', group: 'local', api: 'openai', baseUrl: 'http://127.0.0.1:11434/v1', defaultModel: '', placeholder: '如 llama3, qwen2 等' },
  { id: 'vllm', name: 'vLLM (本地)', group: 'local', api: 'openai', baseUrl: 'http://127.0.0.1:8000/v1', defaultModel: '' },

  // --- Custom ---
  { id: 'custom', name: '自定义 (Custom)', group: 'global', api: 'openai', baseUrl: '', defaultModel: '' },
]

const GROUP_LABELS: Record<string, string> = {
  global: '全球服务商',
  china: '国内服务商',
  cloud: '云平台',
  aggregator: '聚合平台',
  local: '本地部署',
}

const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'ca-central-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2', 'ap-south-1',
  'sa-east-1',
] as const

const API_FORMAT_OPTIONS = [
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'bedrock', label: 'AWS Bedrock' },
] as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Status = 'idle' | 'loading' | 'testing'

export function ModelConfigPanel() {
  const [presetId, setPresetId] = useState('custom')
  const [providerName, setProviderName] = useState('')
  const [modelId, setModelId] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [apiFormat, setApiFormat] = useState('openai')
  const [region, setRegion] = useState('ap-southeast-1')
  const [showKey, setShowKey] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<ModelTestResult | null>(null)
  const [savedProviders, setSavedProviders] = useState<Record<string, OpenClawProviderEntry>>({})

  const applyConfig = useCallback((config: OpenClawModelConfig) => {
    setSavedProviders(config.providers)

    const fm = config.fullModel || ''
    const slashIdx = fm.indexOf('/')
    const pName = slashIdx > 0 ? fm.slice(0, slashIdx) : ''
    const mId = slashIdx > 0 ? fm.slice(slashIdx + 1) : ''

    setProviderName(pName)
    setModelId(mId)

    // Try to match provider name to a preset
    const preset = PROVIDER_PRESETS.find((p) => p.id === pName)
    if (preset) {
      setPresetId(preset.id)
      setApiFormat(preset.api)
      setBaseUrl(preset.baseUrl)
    } else {
      setPresetId('custom')
      const prov = config.providers[pName]
      if (prov) {
        setBaseUrl(prov.baseUrl || '')
        setApiFormat(prov.api || 'openai')
        if (prov.region) setRegion(prov.region)
      }
    }

    // Load API key from provider config
    const prov = config.providers[pName]
    setApiKey(prov?.apiKey || '')
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setLoadError(null)
    getModelConfig()
      .then((config) => {
        if (!cancelled) {
          applyConfig(config)
          setStatus('idle')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : '加载配置失败')
          setStatus('idle')
        }
      })
    return () => { cancelled = true }
  }, [applyConfig])

  const handlePresetChange = (newPresetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === newPresetId)
    if (!preset) return

    setPresetId(newPresetId)
    setTestResult(null)
    setShowKey(false)

    if (newPresetId === 'custom') {
      setProviderName('')
      setBaseUrl('')
      setModelId('')
      setApiFormat('openai')
      setApiKey('')
    } else {
      setProviderName(newPresetId)
      setBaseUrl(preset.baseUrl)
      setApiFormat(preset.api)
      setModelId(preset.defaultModel)

      // Load saved API key for this provider if available
      const saved = savedProviders[newPresetId]
      setApiKey(saved?.apiKey || '')
    }
  }

  const handleTest = async () => {
    setStatus('testing')
    setTestResult(null)
    try {
      const effectiveProvider = presetId === 'custom' ? providerName : presetId
      const fullModel = `${effectiveProvider}/${modelId}`

      const payload: SaveModelConfigPayload = {
        fullModel,
        provider: {
          name: effectiveProvider,
          baseUrl,
          apiKey,
          api: apiFormat,
          ...(apiFormat === 'bedrock' ? { region } : {}),
          models: modelId ? [{ id: modelId, name: modelId, contextWindow: 128000 }] : [],
        },
      }

      const updated = await saveModelConfig(payload)
      setSavedProviders(updated.providers)

      const result = await testModelConnectivity()
      setTestResult(result)
    } catch (err: unknown) {
      setTestResult({
        success: false,
        latencyMs: 0,
        modelName: `${providerName}/${modelId}`,
        error: err instanceof Error ? err.message : '测试请求失败',
      })
    } finally {
      setStatus('idle')
    }
  }

  // --- Loading / Error states ---

  if (status === 'loading' && !providerName) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
        <h2 className="text-lg font-semibold text-foreground">模型配置</h2>
        <p className="mt-1 text-sm text-muted-foreground">配置 OpenClaw 使用的 AI 模型</p>
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">加载配置中...</span>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
        <h2 className="text-lg font-semibold text-foreground">模型配置</h2>
        <p className="mt-1 text-sm text-muted-foreground">配置 OpenClaw 使用的 AI 模型</p>
        <div className="mt-8 flex items-center justify-center gap-2 text-destructive">
          <XCircle className="h-4 w-4" />
          <span className="text-sm">{loadError}</span>
        </div>
      </div>
    )
  }

  // --- Derived values ---

  const isBedrock = apiFormat === 'bedrock'
  const isCustom = presetId === 'custom'
  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === presetId)
  const hasKey = Boolean(savedProviders[isCustom ? providerName : presetId]?.apiKey)
  const groups = ['global', 'china', 'aggregator', 'local', 'cloud'] as const
  const effectiveProvider = isCustom ? providerName : presetId
  const fullModelDisplay = effectiveProvider && modelId ? `${effectiveProvider}/${modelId}` : ''

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
      <h2 className="text-lg font-semibold text-foreground">模型配置</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        配置 OpenClaw 使用的 AI 模型
        {fullModelDisplay && (
          <>
            {' · '}
            <span className="font-mono text-foreground">{fullModelDisplay}</span>
          </>
        )}
      </p>

      <Card className="mt-5 border-border bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">连接配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider preset selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Provider (服务商)</label>
            <select
              value={presetId}
              onChange={(e) => handlePresetChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {groups.map((group) => {
                const items = PROVIDER_PRESETS.filter((p) => p.group === group)
                if (items.length === 0) return null
                return (
                  <optgroup key={group} label={GROUP_LABELS[group]}>
                    {items.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {/* Custom: provider name */}
          {isCustom && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Provider Name (标识)</label>
              <Input
                value={providerName}
                onChange={(e) => setProviderName(e.target.value)}
                placeholder="my-provider"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                用于 openclaw.json 中的 provider 标识，如 &quot;my-provider/gpt-4o&quot;
              </p>
            </div>
          )}

          {/* Custom: API format selector */}
          {isCustom && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">API 格式</label>
              <select
                value={apiFormat}
                onChange={(e) => setApiFormat(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {API_FORMAT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Base URL (non-bedrock only) */}
          {!isBedrock && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Base URL</label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={currentPreset?.baseUrl || 'https://api.example.com/v1'}
                className="font-mono text-xs"
              />
            </div>
          )}

          {/* Bedrock region */}
          {isBedrock && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Region (区域)</label>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {AWS_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}

          {/* Model ID / Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {isBedrock ? 'Model ID (模型 ID)' : 'Model Name (模型名)'}
            </label>
            <Input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={
                currentPreset?.placeholder || currentPreset?.defaultModel || (isBedrock ? 'global.anthropic.claude-sonnet-4-5-20250929-v1:0' : 'model-name')
              }
              className="font-mono text-xs"
            />
            {isBedrock && (
              <p className="text-[11px] text-muted-foreground">
                从 AWS Bedrock 控制台获取的完整模型 ID
              </p>
            )}
          </div>

          {/* API Key / Bearer Token */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {isBedrock ? 'Bearer Token (访问令牌)' : 'API Key'}
              {hasKey && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  已配置
                </Badge>
              )}
            </label>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={isBedrock ? 'ABSKQm...' : 'sk-...'}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showKey ? '隐藏' : '显示'}
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Test button */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleTest}
              disabled={status !== 'idle' || !modelId || (isCustom && !providerName)}
              size="sm"
            >
              {status === 'testing' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              保存并测试连通性
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test result */}
      {testResult && (
        <Card className="mt-3 border-border bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">连通性测试结果</CardTitle>
          </CardHeader>
          <CardContent>
            {testResult.success ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-status-healthy" />
                  <span className="text-sm font-medium text-status-healthy">连接成功</span>
                  <span className="text-xs text-muted-foreground">
                    延迟: {testResult.latencyMs}ms
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  模型: {testResult.modelName}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-status-degraded" />
                  <span className="text-sm font-medium text-status-degraded">连接失败</span>
                  {testResult.latencyMs > 0 && (
                    <span className="text-xs text-muted-foreground">
                      延迟: {testResult.latencyMs}ms
                    </span>
                  )}
                </div>
                {testResult.error && (
                  <p className="text-xs text-destructive">{testResult.error}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
