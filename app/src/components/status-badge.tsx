import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TelegramStatus, AgentMeta } from '@/types'

const telegramStatusStyles: Record<TelegramStatus, string> = {
  NotConfigured: 'border-border text-[#c5d0d8]',
  InProgress: 'border-status-inprogress/40 text-status-inprogress',
  Ready: 'border-status-ready/40 text-status-ready',
  Degraded: 'border-status-degraded/40 text-status-degraded',
}

export function TelegramStatusBadge({ status }: { status: TelegramStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-xs', telegramStatusStyles[status])}
    >
      {status}
    </Badge>
  )
}

const gatewayHealthStyles: Record<AgentMeta['gatewayHealth'], string> = {
  Healthy: 'border-status-healthy/40 text-status-healthy',
  Recovering: 'border-status-recovering/40 text-status-recovering',
  Degraded: 'border-status-degraded/40 text-status-degraded',
}

export function GatewayBadge({ health }: { health: AgentMeta['gatewayHealth'] }) {
  return (
    <Badge
      variant="outline"
      className={cn('font-mono text-xs', gatewayHealthStyles[health])}
    >
      Gateway · {health}
    </Badge>
  )
}
