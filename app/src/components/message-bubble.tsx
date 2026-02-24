import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types'
import { Bot, User } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex gap-3 max-w-[80%]',
        isUser ? 'message-user self-end flex-row-reverse' : 'message-assistant self-start',
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border',
          isUser ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div
        className={cn(
          'rounded-xl border px-3.5 py-2.5',
          isUser
            ? 'border-primary/20 bg-primary/[0.08] text-foreground'
            : 'border-border bg-card text-secondary-foreground',
        )}
      >
        <p className="text-sm leading-relaxed">{message.text}</p>
      </div>
    </div>
  )
}
