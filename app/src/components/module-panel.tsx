import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SectionKey } from '@/state/navigation'

const titleMap: Record<SectionKey, string> = {
  agent: 'Agent',
  skills: 'Skills',
  automation: '自动任务',
  models: '模型 API',
}

interface ModulePanelProps {
  section: SectionKey
}

export function ModulePanel({ section }: ModulePanelProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
      <h2 className="text-lg font-semibold text-foreground">{titleMap[section]}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        这是 {titleMap[section]} 的占位页面，后续会对齐 Codex 的信息密度和交互方式。
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Card className="border-border bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">当前阶段</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">先聚焦 Telegram 引导体验，避免范围扩散。</p>
          </CardContent>
        </Card>
        <Card className="border-border bg-muted/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">下一步</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">确认 Demo 体验后，再接入真实 Gateway API 与恢复机制。</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
