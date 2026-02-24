import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  Plus,
  Zap,
  Clock,
  Cpu,
  Settings,
} from 'lucide-react'
import type { AgentMeta, AgentId } from '@/types'
import type { SectionKey } from '@/state/navigation'

interface SidebarProps {
  agents: AgentMeta[]
  selectedAgent: AgentId
  onSelectAgent: (id: AgentId) => void
  section: SectionKey
  onNavigateSection: (section: SectionKey) => void
  agentExpanded: boolean
  onToggleAgentExpanded: () => void
  onCreateAgent: () => void
  createAgentPending: boolean
  onOpenGlobalSettings: () => void
}

const navItems: { key: SectionKey; label: string; icon: typeof Zap }[] = [
  { key: 'skills', label: 'Skills', icon: Zap },
  { key: 'automation', label: '自动任务', icon: Clock },
  { key: 'models', label: '模型 API', icon: Cpu },
]

export function Sidebar({
  agents,
  selectedAgent,
  onSelectAgent,
  section,
  onNavigateSection,
  agentExpanded,
  onToggleAgentExpanded,
  onCreateAgent,
  createAgentPending,
  onOpenGlobalSettings,
}: SidebarProps) {
  return (
    <aside className="flex w-[280px] flex-col border-r border-border bg-sidebar/80 backdrop-blur-md">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4">
        <h1 className="text-sm font-semibold tracking-wide text-foreground">OpenClaw Client</h1>
        <p className="mt-1 text-xs text-muted-foreground">Codex-style Workspace</p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-2.5">
        {/* Agent Section Header */}
        <div
          className={cn(
            'flex items-center gap-1 rounded-lg border border-transparent p-0.5 transition-colors',
            (section === 'agent' || agentExpanded) && 'border-border bg-accent',
          )}
        >
          <button
            className="flex flex-1 items-center justify-between rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
            onClick={() => {
              if (section !== 'agent') {
                onNavigateSection('agent')
                return
              }
              onToggleAgentExpanded()
            }}
            type="button"
          >
            <span>Agent</span>
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform duration-150',
                agentExpanded ? 'rotate-0' : '-rotate-90',
              )}
            />
          </button>
          <Button
            aria-label="新建 Agent"
            variant="ghost"
            size="icon"
            className="agent-add-btn h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            disabled={createAgentPending}
            onClick={onCreateAgent}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Agent List */}
        {agentExpanded && (
          <ScrollArea className="max-h-[240px]">
            <div className="agent-list flex flex-col gap-0.5 pb-1 pl-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  className={cn(
                    'agent-item flex items-center justify-between rounded-lg border border-transparent px-2.5 py-2 text-sm text-sidebar-foreground transition-colors',
                    selectedAgent === agent.id
                      ? 'active border-border bg-muted text-foreground'
                      : 'hover:bg-white/[0.04] hover:text-foreground',
                  )}
                  onClick={() => {
                    onSelectAgent(agent.id)
                    onNavigateSection('agent')
                  }}
                  type="button"
                >
                  <span className="truncate">{agent.name}</span>
                  {agent.isDefault && (
                    <span className="ml-2 shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.65rem] text-muted-foreground">
                      默认
                    </span>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Other Nav Items */}
        {navItems.map((item) => (
          <button
            key={item.key}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors',
              section === item.key
                ? 'border-border bg-accent text-foreground'
                : 'hover:bg-white/[0.04] hover:text-foreground',
            )}
            onClick={() => onNavigateSection(item.key)}
            type="button"
          >
            <item.icon className="h-4 w-4 text-muted-foreground" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-2.5 pb-3">
        <Separator className="mb-3 bg-border" />
        <Button
          variant="outline"
          className="w-full justify-start gap-2.5 border-border bg-white/[0.02] text-sm text-sidebar-foreground hover:text-foreground"
          onClick={onOpenGlobalSettings}
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          设置
        </Button>
      </div>
    </aside>
  )
}
