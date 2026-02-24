import { useState } from 'react'
import type { SectionKey } from '@/state/navigation'
import { SkillsPanel } from '@/components/skills-panel'
import { McpPanel } from '@/components/mcp-panel'
import { ModelConfigPanel } from '@/components/model-config-panel'
import { AutomationPanel } from '@/components/automation-panel'

interface ModulePanelProps {
  section: SectionKey
  selectedAgent: string
}

function SkillsAndMcpPanel() {
  const [tab, setTab] = useState<'skills' | 'mcp'>('skills')

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'skills'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('skills')}
          type="button"
        >
          Skills
        </button>
        <button
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'mcp'
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setTab('mcp')}
          type="button"
        >
          MCP
        </button>
      </div>
      {tab === 'skills' ? <SkillsPanel /> : <McpPanel />}
    </div>
  )
}

export function ModulePanel({ section, selectedAgent }: ModulePanelProps) {
  if (section === 'skills') return <SkillsAndMcpPanel />
  if (section === 'models') return <ModelConfigPanel />
  if (section === 'automation') return <AutomationPanel agentId={selectedAgent} />

  return null
}
