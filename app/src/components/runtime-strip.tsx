import { TelegramStatusBadge } from '@/components/status-badge'
import type { ChatDiagnostics, TelegramStatus } from '@/types'

interface RuntimeStripProps {
  telegramStatus: TelegramStatus
  localApiReady: boolean
  sleepLockActive: boolean
  diagnostics?: ChatDiagnostics
  lastHealthCheckLabel: string
}

export function RuntimeStrip({
  telegramStatus,
  localApiReady,
  sleepLockActive,
  diagnostics,
  lastHealthCheckLabel,
}: RuntimeStripProps) {
  return (
    <div className="border-t border-border">
      <div className="runtime-strip flex flex-wrap items-center gap-x-5 gap-y-1 bg-black/20 px-4 py-2 font-mono text-[0.7rem] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          Telegram: <TelegramStatusBadge status={telegramStatus} />
        </span>
        <span className="inline-flex items-center gap-1.5">
          Local API:{' '}
          <span className={localApiReady ? 'text-status-ready' : 'text-status-degraded'}>
            {localApiReady ? 'Ready' : 'Down'}
          </span>
        </span>
        <span>
          Prevent Sleep: <strong className="text-foreground/70">{sleepLockActive ? 'Active' : 'Idle'}</strong>
        </span>
        <span className="text-muted-foreground/60">Mode: 1 Agent = 1 Gateway</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 bg-black/20 px-4 pb-2.5 font-mono text-[0.68rem] text-muted-foreground/70">
        <span>
          Session: <code className="text-[0.68rem]">{diagnostics?.sessionKey ?? '-'}</code>
        </span>
        <span>
          Roundtrip: {typeof diagnostics?.elapsedMs === 'number' ? `${diagnostics.elapsedMs}ms` : '-'}
        </span>
        <span>Health Check: {lastHealthCheckLabel}</span>
      </div>
    </div>
  )
}
