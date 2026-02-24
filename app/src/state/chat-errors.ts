import { OpenClawApiError, type GatewayHealth } from '../api/openclaw'

export interface ChatErrorResolution {
  message: string
  nextGatewayHealth: GatewayHealth
  markLocalApiDown: boolean
}

const fromApiError = (error: OpenClawApiError): ChatErrorResolution => {
  switch (error.code) {
    case 'GATEWAY_DISCONNECTED':
    case 'OPENCLAW_GATEWAY_UNAVAILABLE':
      return {
        message: '当前 Agent 网关不可用，正在尝试恢复。请先执行 openclaw doctor。',
        nextGatewayHealth: 'Degraded',
        markLocalApiDown: false,
      }
    case 'OPENCLAW_TIMEOUT':
      return {
        message: 'OpenClaw 响应超时，请稍后重试或先在终端确认 openclaw 可正常应答。',
        nextGatewayHealth: 'Recovering',
        markLocalApiDown: false,
      }
    case 'OPENCLAW_BIN_UNAVAILABLE':
      return {
        message: '本机未检测到可用 OpenClaw CLI，请先在终端确认 openclaw 已安装并可执行。',
        nextGatewayHealth: 'Degraded',
        markLocalApiDown: false,
      }
    case 'OPENCLAW_CLI_FAILED':
    case 'OPENCLAW_CALL_FAILED':
      return {
        message: 'OpenClaw 运行失败，请先执行 openclaw doctor 检查。',
        nextGatewayHealth: 'Recovering',
        markLocalApiDown: false,
      }
    case 'OPENCLAW_UPSTREAM_ERROR':
    case 'MODEL_UPSTREAM_ERROR':
      return {
        message: error.message || '上游服务返回错误，请稍后重试。',
        nextGatewayHealth: 'Recovering',
        markLocalApiDown: false,
      }
    case 'MODEL_TIMEOUT':
      return {
        message: '模型请求超时，请稍后重试。',
        nextGatewayHealth: 'Recovering',
        markLocalApiDown: false,
      }
    default:
      return {
        message: error.message || '发送失败，请稍后重试。',
        nextGatewayHealth: error.status === 503 ? 'Degraded' : 'Recovering',
        markLocalApiDown: false,
      }
  }
}

export const resolveChatSendError = (error: unknown): ChatErrorResolution => {
  if (error instanceof OpenClawApiError) {
    return fromApiError(error)
  }

  return {
    message: '本地 API 不可用，请先在终端运行 pnpm api。',
    nextGatewayHealth: 'Recovering',
    markLocalApiDown: true,
  }
}
