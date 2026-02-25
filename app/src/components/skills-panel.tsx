import { useEffect, useState, useMemo, useCallback } from 'react'
import { Loader2, Search, Zap, CheckCircle2, AlertTriangle, Ban, ExternalLink, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listSkills, installDeps, type SkillEntry, type SkillListResponse } from '@/api/openclaw'

type FilterTab = 'all' | 'ready' | 'needs-setup'

export function SkillsPanel() {
  const [data, setData] = useState<SkillListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<FilterTab>('all')
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({})

  const loadSkills = useCallback(() => {
    setLoading(true)
    setError(null)
    listSkills()
      .then((result) => {
        setData(result)
        setLoading(false)
        // Clear errors for skills that are now eligible
        setInstallErrors((prev) => {
          const next = { ...prev }
          for (const s of result.skills) {
            if (s.eligible && next[s.name]) delete next[s.name]
          }
          return next
        })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : '加载 Skills 列表失败')
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  const handleInstall = useCallback(async (skillName: string, packages: string[]) => {
    setInstalling((prev) => new Set(prev).add(skillName))
    setInstallErrors((prev) => { const next = { ...prev }; delete next[skillName]; return next })
    try {
      const result = await installDeps(packages)
      if (!result.success) {
        const msg = result.output
          ? `安装失败: ${result.output.slice(0, 200)}`
          : `安装失败，请在终端手动安装: ${packages.join(', ')}`
        setInstallErrors((prev) => ({ ...prev, [skillName]: msg }))
      }
      loadSkills()
    } catch (err: unknown) {
      setInstallErrors((prev) => ({
        ...prev,
        [skillName]: err instanceof Error ? err.message : '安装失败',
      }))
    } finally {
      setInstalling((prev) => {
        const next = new Set(prev)
        next.delete(skillName)
        return next
      })
    }
  }, [loadSkills])

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.skills

    if (tab === 'ready') {
      list = list.filter((s) => s.eligible && !s.disabled)
    } else if (tab === 'needs-setup') {
      list = list.filter((s) => !s.eligible || s.disabled)
    }

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
    if (!data) return { all: 0, ready: 0, needsSetup: 0 }
    return {
      all: data.skills.length,
      ready: data.skills.filter((s) => s.eligible && !s.disabled).length,
      needsSetup: data.skills.filter((s) => !s.eligible || s.disabled).length,
    }
  }, [data])

  // --- Loading / Error ---

  if (loading && !data) {
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

  if (error && !data) {
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
    { key: 'ready', label: `已就绪 (${tabCounts.ready})` },
    { key: 'needs-setup', label: `待配置 (${tabCounts.needsSetup})` },
  ]

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Skills</h2>
        {data && (
          <span className="text-sm text-muted-foreground">
            {data.summary.eligible}/{data.summary.total} 已就绪
          </span>
        )}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Agent 可使用的能力列表，安装对应工具后自动激活
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
          <SkillCard
            key={skill.name}
            skill={skill}
            installing={installing.has(skill.name)}
            installError={installErrors[skill.name]}
            onInstall={handleInstall}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Human-readable missing dependency hints
// ---------------------------------------------------------------------------

interface MissingHint {
  label: string
  installable: boolean
  packages?: string[]
}

function getMissingHints(skill: SkillEntry): MissingHint[] {
  const hints: MissingHint[] = []

  for (const bin of skill.missing.bins) {
    hints.push({
      label: `需要安装 ${bin}`,
      installable: true,
      packages: [bin],
    })
  }

  if (skill.missing.anyBins.length > 0) {
    const names = skill.missing.anyBins.join(' 或 ')
    hints.push({
      label: `需要安装 ${names} 其中之一`,
      installable: true,
      packages: [skill.missing.anyBins[0]],
    })
  }

  for (const env of skill.missing.env) {
    hints.push({
      label: `需要设置环境变量 ${env}`,
      installable: false,
    })
  }

  for (const cfg of skill.missing.config) {
    hints.push({
      label: `需要在配置文件中添加 ${cfg}`,
      installable: false,
    })
  }

  for (const os of skill.missing.os) {
    const osName = os === 'darwin' ? 'macOS' : os === 'linux' ? 'Linux' : os === 'win32' ? 'Windows' : os
    hints.push({
      label: `仅支持 ${osName}`,
      installable: false,
    })
  }

  return hints
}

function getInstallablePackages(skill: SkillEntry): string[] {
  const pkgs: string[] = [...skill.missing.bins]
  if (skill.missing.anyBins.length > 0) {
    pkgs.push(skill.missing.anyBins[0])
  }
  return pkgs
}

// ---------------------------------------------------------------------------
// Skill Card
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skill: SkillEntry
  installing: boolean
  installError?: string
  onInstall: (skillName: string, packages: string[]) => void
}

function SkillCard({ skill, installing, installError, onInstall }: SkillCardProps) {
  const isReady = skill.eligible && !skill.disabled
  const hints = getMissingHints(skill)
  const installablePackages = getInstallablePackages(skill)
  const canAutoInstall = installablePackages.length > 0

  return (
    <Card className="border-border bg-muted/50">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          {skill.emoji && <span className="text-base flex-shrink-0">{skill.emoji}</span>}
          <CardTitle className="text-sm font-medium truncate">{skill.name}</CardTitle>
        </div>
        <div className="flex-shrink-0">
          {skill.disabled ? (
            <Badge variant="secondary" className="gap-0.5 text-[10px]">
              <Ban className="h-3 w-3" />
              已禁用
            </Badge>
          ) : isReady ? (
            <Badge variant="default" className="gap-0.5 bg-emerald-600 text-[10px] hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              已就绪
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-0.5 text-[10px] text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              待配置
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <p className="text-xs text-muted-foreground line-clamp-2">{skill.description}</p>

        {hints.length > 0 && (
          <div className="mt-2 space-y-1">
            {hints.map((hint) => (
              <div key={hint.label} className="rounded bg-amber-500/10 px-2 py-1.5">
                <p className="text-[11px] text-amber-600">{hint.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2 flex items-center gap-2">
          {canAutoInstall && !isReady && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 text-[11px]"
              disabled={installing}
              onClick={() => onInstall(skill.name, installablePackages)}
            >
              {installing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  安装中...
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  一键安装
                </>
              )}
            </Button>
          )}
          {skill.homepage && (
            <a
              href={skill.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              查看文档
            </a>
          )}
        </div>
        {installError && (
          <p className="mt-1.5 text-[11px] text-destructive">{installError}</p>
        )}
      </CardContent>
    </Card>
  )
}
