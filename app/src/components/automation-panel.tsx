import { useCallback, useEffect, useState } from 'react'
import { Timer, Plus, Trash2, Play, Pause, Clock, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  listCronJobs,
  createCronJob,
  enableCronJob,
  disableCronJob,
  removeCronJobApi,
  type CronJobEntry,
} from '@/api/openclaw'

interface AutomationPanelProps {
  agentId: string
}

// --- Display helpers ---

function formatSchedule(schedule: CronJobEntry['schedule']): string {
  if (schedule.kind === 'every' && schedule.everyMs) {
    const totalMinutes = schedule.everyMs / 60000
    if (totalMinutes >= 60) {
      const hours = Math.floor(totalMinutes / 60)
      const mins = Math.round(totalMinutes % 60)
      return mins > 0 ? `每 ${hours} 小时 ${mins} 分钟` : `每 ${hours} 小时`
    }
    return `每 ${Math.round(totalMinutes)} 分钟`
  }
  if (schedule.kind === 'cron' && schedule.cron) {
    return `Cron: ${schedule.cron}`
  }
  if (schedule.kind === 'at' && schedule.atMs) {
    return `定时: ${new Date(schedule.atMs).toLocaleString()}`
  }
  return '未知调度'
}

function formatPayload(payload: CronJobEntry['payload']): string {
  if (payload.kind === 'agentTurn' && payload.message) {
    return payload.message
  }
  if (payload.kind === 'systemEvent' && payload.systemEvent) {
    return `[系统事件] ${payload.systemEvent}`
  }
  return ''
}

export function AutomationPanel({ agentId }: AutomationPanelProps) {
  const [jobs, setJobs] = useState<CronJobEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // --- Create form state ---
  const [createOpen, setCreateOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formMessage, setFormMessage] = useState('')
  const [formIntervalValue, setFormIntervalValue] = useState(30)
  const [formIntervalUnit, setFormIntervalUnit] = useState<'m' | 'h'>('m')
  const [creating, setCreating] = useState(false)

  const loadJobs = useCallback(async () => {
    try {
      const data = await listCronJobs()
      setJobs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载定时任务失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setJobs([])
    void loadJobs()
  }, [loadJobs])

  // Poll every 15s
  useEffect(() => {
    const timer = window.setInterval(() => { void loadJobs() }, 15000)
    return () => window.clearInterval(timer)
  }, [loadJobs])

  const handleCreate = async () => {
    if (!formName.trim() || !formMessage.trim()) return
    setCreating(true)
    setError(null)
    try {
      const every = `${formIntervalValue}${formIntervalUnit}`
      const job = await createCronJob({
        name: formName.trim(),
        message: formMessage.trim(),
        every,
        agent: agentId,
        disabled: true,
      })
      setJobs((prev) => [...prev, job])
      setFormName('')
      setFormMessage('')
      setFormIntervalValue(30)
      setFormIntervalUnit('m')
      setCreateOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败')
    } finally {
      setCreating(false)
    }
  }

  const handleToggle = async (job: CronJobEntry) => {
    setError(null)
    try {
      if (job.enabled) {
        await disableCronJob(job.id)
      } else {
        await enableCronJob(job.id)
      }
      setCronEnabled(job.id, !job.enabled)
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换状态失败')
    }
  }

  const setCronEnabled = (jobId: string, enabled: boolean) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, enabled } : j)))
  }

  const handleRemove = async (jobId: string) => {
    setError(null)
    try {
      await removeCronJobApi(jobId)
      setJobs((prev) => prev.filter((j) => j.id !== jobId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除任务失败')
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-soft p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">自动任务</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(!createOpen)}>
          <Plus className="h-4 w-4" />
          新建任务
        </Button>
      </div>

      {createOpen && (
        <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">任务名称</label>
            <Input
              placeholder="例如：每日状态报告"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">执行指令</label>
            <textarea
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Agent 将执行的 prompt 指令"
              rows={3}
              value={formMessage}
              onChange={(e) => setFormMessage(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">每隔</span>
            <Input
              type="number"
              min={1}
              max={1440}
              className="w-20"
              value={formIntervalValue}
              onChange={(e) => setFormIntervalValue(Math.max(1, Number(e.target.value) || 1))}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={formIntervalUnit === 'm' ? 'default' : 'outline'}
                onClick={() => setFormIntervalUnit('m')}
              >
                分钟
              </Button>
              <Button
                size="sm"
                variant={formIntervalUnit === 'h' ? 'default' : 'outline'}
                onClick={() => setFormIntervalUnit('h')}
              >
                小时
              </Button>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={creating || !formName.trim() || !formMessage.trim()}
          >
            {creating ? '创建中...' : '确认创建'}
          </Button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-5 flex-1 overflow-y-auto">
        {loading && <p className="text-sm text-muted-foreground">加载中...</p>}

        {!loading && jobs.length === 0 && !error && (
          <Card className="border-border bg-muted/50">
            <CardContent className="flex flex-col items-center justify-center py-8">
              <Clock className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">暂无定时任务</p>
              <p className="mt-1 text-xs text-muted-foreground">
                可在聊天中让 Agent 创建，或点击上方「新建任务」手动创建
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && jobs.length > 0 && (
          <div className="grid gap-3">
            {jobs.map((job) => (
              <Card key={job.id} className="border-border bg-muted/50">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">
                    {job.name || job.id.slice(0, 8)}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={job.enabled ? 'default' : 'secondary'}>
                      {job.enabled ? '已启用' : '已禁用'}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => void handleToggle(job)}
                      title={job.enabled ? '禁用' : '启用'}
                    >
                      {job.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => void handleRemove(job.id)}
                      title="删除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {formatPayload(job.payload) && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {formatPayload(job.payload)}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>{formatSchedule(job.schedule)}</span>
                    {job.agentId && <span>Agent: {job.agentId}</span>}
                    {job.state.lastRunAtMs && (
                      <span>上次: {new Date(job.state.lastRunAtMs).toLocaleString()}</span>
                    )}
                    {job.state.lastRunOk === false && (
                      <span className="flex items-center gap-1 text-destructive">
                        <AlertCircle className="h-3 w-3" /> 执行失败
                      </span>
                    )}
                    {job.state.nextRunAtMs && job.enabled && (
                      <span>下次: {new Date(job.state.nextRunAtMs).toLocaleString()}</span>
                    )}
                  </div>
                  {job.description && (
                    <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-1">
                      {job.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
