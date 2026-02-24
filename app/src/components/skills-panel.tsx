import { useEffect, useState, useMemo } from 'react'
import { Loader2, Search, Zap, CheckCircle2, AlertTriangle, Ban, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { listSkills, type SkillEntry, type SkillListResponse } from '@/api/openclaw'

type FilterTab = 'all' | 'eligible' | 'missing'

export function SkillsPanel() {
  const [data, setData] = useState<SkillListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listSkills()
      .then((result) => {
        if (!cancelled) {
          setData(result)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载 Skills 列表失败')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.skills

    // Filter by tab
    if (tab === 'eligible') {
      list = list.filter((s) => s.eligible && !s.disabled)
    } else if (tab === 'missing') {
      list = list.filter((s) => !s.eligible || s.disabled)
    }

    // Filter by search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
    }

    return list
  }, [data, tab, search])

  const tabCounts = useMemo(() => {
    if (!data) return { all: 0, eligible: 0, missing: 0 }
    return {
      all: data.skills.length,
      eligible: data.skills.filter((s) => s.eligible && !s.disabled).length,
      missing: data.skills.filter((s) => !s.eligible || s.disabled).length,
    }
  }, [data])

  // --- Loading / Error ---

  if (loading) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Skills</h2>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">加载 Skills 列表中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Skills</h2>
        </div>
        <div className="mt-8 flex items-center justify-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      </div>
    )
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: `全部 (${tabCounts.all})` },
    { key: 'eligible', label: `可用 (${tabCounts.eligible})` },
    { key: 'missing', label: `缺少依赖 (${tabCounts.missing})` },
  ]

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Skills</h2>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.summary.eligible}/{data.summary.total} 可用
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        OpenClaw 已注册的 Agent Skills（只读）
      </p>

      {/* Search */}
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索 skill 名称或描述..."
          className="pl-9 text-sm"
        />
      </div>

      {/* Tabs */}
      <div className="mt-3 flex gap-1 rounded-lg bg-muted/50 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Skill list */}
      <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {search.trim() ? '没有匹配的 Skill' : '此分类下没有 Skill'}
          </p>
        )}
        {filtered.map((skill) => (
          <SkillCard key={skill.name} skill={skill} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skill Card
// ---------------------------------------------------------------------------

function getMissingItems(skill: SkillEntry): string[] {
  const items: string[] = []
  if (skill.missing.bins.length > 0) items.push(...skill.missing.bins.map((b) => `bin: ${b}`))
  if (skill.missing.anyBins.length > 0) items.push(`需要其一: ${skill.missing.anyBins.join(' | ')}`)
  if (skill.missing.env.length > 0) items.push(...skill.missing.env.map((e) => `env: ${e}`))
  if (skill.missing.config.length > 0) items.push(...skill.missing.config.map((c) => `config: ${c}`))
  if (skill.missing.os.length > 0) items.push(...skill.missing.os.map((o) => `os: ${o}`))
  return items
}

function SkillCard({ skill }: { skill: SkillEntry }) {
  const isEligible = skill.eligible && !skill.disabled
  const missingItems = getMissingItems(skill)
  const hasMissing = missingItems.length > 0

  return (
    <Card className="border-border bg-muted/50">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {skill.emoji && <span className="text-base flex-shrink-0">{skill.emoji}</span>}
          <CardTitle className="text-sm font-medium truncate">{skill.name}</CardTitle>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {skill.source === 'openclaw-bundled' ? (
            <Badge variant="secondary" className="text-[10px]">内置</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">已安装</Badge>
          )}
          {skill.disabled ? (
            <Badge variant="secondary" className="gap-0.5 text-[10px]">
              <Ban className="h-3 w-3" />
              已禁用
            </Badge>
          ) : isEligible ? (
            <Badge variant="default" className="gap-0.5 bg-emerald-600 text-[10px] hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              可用
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-0.5 text-[10px] text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              缺少依赖
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>
        {hasMissing && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {missingItems.map((item) => (
              <span
                key={item}
                className="inline-block rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600"
              >
                {item}
              </span>
            ))}
          </div>
        )}
        {skill.homepage && (
          <a
            href={skill.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            文档
          </a>
        )}
      </CardContent>
    </Card>
  )
}
