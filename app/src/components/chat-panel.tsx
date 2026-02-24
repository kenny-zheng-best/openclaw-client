import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GatewayBadge } from '@/components/status-badge'
import { MessageBubble } from '@/components/message-bubble'
import { RuntimeStrip } from '@/components/runtime-strip'
import { Settings, Play, Square, SendHorizonal, Loader2 } from 'lucide-react'
import type { AgentMeta, ChatMessage, ChatDiagnostics, TelegramStatus } from '@/types'

interface ChatPanelProps {
  agent: AgentMeta
  chatLog: ChatMessage[]
  draftMessage: string
  onDraftChange: (text: string) => void
  onSendMessage: () => Promise<void>
  pending: boolean
  error: string
  diagnostics?: ChatDiagnostics
  telegramStatus: TelegramStatus
  sleepLockActive: boolean
  localApiReady: boolean
  lastHealthCheckLabel: string
  simulateRunning: boolean
  onSimulateToggle: () => void
  onOpenSettings: () => void
}

export function ChatPanel({
  agent,
  chatLog,
  draftMessage,
  onDraftChange,
  onSendMessage,
  pending,
  error,
  diagnostics,
  telegramStatus,
  sleepLockActive,
  localApiReady,
  lastHealthCheckLabel,
  simulateRunning,
  onSimulateToggle,
  onOpenSettings,
}: ChatPanelProps) {
  const messages = chatLog.length > 0
    ? chatLog
    : [{ role: 'assistant' as const, text: `${agent.name} 已创建，当前为 Demo 对话。` }]

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface-soft">
      {/* Header */}
      <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{agent.name}</h2>
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {agent.workspace}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <GatewayBadge health={agent.gatewayHealth} />
          <Button variant="ghost" size="sm" onClick={onSimulateToggle} className="text-xs">
            {simulateRunning ? <Square className="mr-1.5 h-3 w-3" /> : <Play className="mr-1.5 h-3 w-3" />}
            {simulateRunning ? '停止模拟' : '模拟任务'}
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenSettings} className="text-xs">
            <Settings className="mr-1.5 h-3 w-3" />
            设置
          </Button>
        </div>
      </header>

      {/* Chat Log */}
      <ScrollArea className="flex-1 px-5 py-4">
        <div className="flex flex-col gap-3" role="log" aria-live="polite">
          {messages.map((msg, idx) => (
            <MessageBubble message={msg} key={`${msg.role}-${idx}`} />
          ))}
          {pending && (
            <div className="flex items-center gap-2 self-start text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在思考...
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Composer */}
      <div className="composer border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <Input
            aria-label="chat input"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void onSendMessage()
              }
            }}
            placeholder={localApiReady ? '输入消息，调用本地 API...' : '本地 API 不可用，请先启动服务'}
            value={draftMessage}
            className="bg-muted/50 border-border"
          />
          <Button
            disabled={pending || !draftMessage.trim()}
            onClick={() => void onSendMessage()}
            size="default"
            className="shrink-0"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizonal className="h-4 w-4" />
            )}
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        )}
      </div>

      {/* Runtime Strip */}
      <RuntimeStrip
        telegramStatus={telegramStatus}
        localApiReady={localApiReady}
        sleepLockActive={sleepLockActive}
        diagnostics={diagnostics}
        lastHealthCheckLabel={lastHealthCheckLabel}
      />
    </div>
  )
}
