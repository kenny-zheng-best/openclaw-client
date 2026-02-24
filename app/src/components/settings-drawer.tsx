import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TelegramStatusBadge } from '@/components/status-badge'
import { TelegramGuide } from '@/components/telegram-guide'
import type { AgentMeta, GuideState, GuideStep, TabKey, TelegramStatus } from '@/types'

interface SettingsDrawerProps {
  open: boolean
  onClose: () => void
  scope: 'agent' | 'global'
  agent: AgentMeta
  activeTab: TabKey
  onTabChange: (tab: TabKey) => void
  sleepGuardEnabled: boolean
  telegramStatus: TelegramStatus
  guide: GuideState
  guideSteps: GuideStep[]
  guideCheckPending: boolean
  onOpenGuide: () => void
  onResetGuide: () => void
  onMoveStep: (direction: 'next' | 'prev') => void
  onStepClick: (index: number) => void
  onTokenChange: (value: string) => void
  onRenameAgent: (name: string) => Promise<void>
  onOpenWorkspace: () => Promise<void>
}

export function SettingsDrawer({
  open,
  onClose,
  scope,
  agent,
  activeTab,
  onTabChange,
  sleepGuardEnabled,
  telegramStatus,
  guide,
  guideSteps,
  guideCheckPending,
  onOpenGuide,
  onResetGuide,
  onMoveStep,
  onStepClick,
  onTokenChange,
  onRenameAgent,
  onOpenWorkspace,
}: SettingsDrawerProps) {
  const [nameInput, setNameInput] = useState(agent.name)
  const [renamePending, setRenamePending] = useState(false)
  const [openWorkspacePending, setOpenWorkspacePending] = useState(false)
  const [basicMessage, setBasicMessage] = useState('')
  const [basicError, setBasicError] = useState(false)

  useEffect(() => {
    setNameInput(agent.name)
    setBasicMessage('')
    setBasicError(false)
    setRenamePending(false)
    setOpenWorkspacePending(false)
  }, [agent.id, agent.name, open, scope])

  const saveAgentName = async () => {
    const trimmed = nameInput.trim()
    if (!trimmed) {
      setBasicMessage('Agent 名称不能为空。')
      setBasicError(true)
      return
    }

    if (trimmed === agent.name) {
      setBasicMessage('名称未变化。')
      setBasicError(false)
      return
    }

    setRenamePending(true)
    setBasicMessage('')
    setBasicError(false)
    try {
      await onRenameAgent(trimmed)
      setBasicMessage('Agent 名称已更新。')
    } catch (error) {
      setBasicMessage(error instanceof Error ? error.message : '更新名称失败，请稍后重试。')
      setBasicError(true)
    } finally {
      setRenamePending(false)
    }
  }

  const openWorkspace = async () => {
    setOpenWorkspacePending(true)
    setBasicMessage('')
    setBasicError(false)
    try {
      await onOpenWorkspace()
      setBasicMessage('已在系统中打开 Workspace。')
    } catch (error) {
      setBasicMessage(error instanceof Error ? error.message : '打开 Workspace 失败。')
      setBasicError(true)
    } finally {
      setOpenWorkspacePending(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-[min(960px,90vw)] max-w-none overflow-y-auto border-border bg-[#0b1115] p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-foreground">{scope === 'global' ? '全局设置' : `${agent.name} 设置`}</SheetTitle>
          <SheetDescription>{scope === 'global' ? '应用级偏好与守护选项' : 'IM 配置按当前 Agent 生效'}</SheetDescription>
        </SheetHeader>

        {scope === 'global' ? (
          <div className="space-y-5 p-5">
            <h4 className="text-sm font-semibold">全局偏好</h4>
            <div className="flex max-w-md items-center justify-between rounded-lg border border-border px-4 py-3">
              <span className="text-sm">Prevent Sleep（默认开启）</span>
              <Switch checked={sleepGuardEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">仅阻止系统睡眠，不强制保持屏幕点亮。</p>
            <p className="text-xs text-muted-foreground">Agent 的 Telegram 绑定请在聊天窗口右上角"设置"中操作。</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v) => onTabChange(v as TabKey)} className="flex flex-col">
            <TabsList className="mx-5 mt-4 w-fit bg-muted">
              <TabsTrigger value="basic" className="text-xs">
                基础
              </TabsTrigger>
              <TabsTrigger value="telegram" className="text-xs">
                Telegram
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="p-5">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold">基础信息</h4>

                <div className="space-y-2">
                  <label htmlFor="agent-name-input" className="text-xs text-muted-foreground">
                    Agent 名称
                  </label>
                  <div className="flex max-w-md gap-2">
                    <Input
                      id="agent-name-input"
                      value={nameInput}
                      onChange={(event) => setNameInput(event.target.value)}
                      className="h-9"
                    />
                    <Button size="sm" onClick={() => void saveAgentName()} disabled={renamePending}>
                      {renamePending ? '保存中...' : '保存'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>Workspace：</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{agent.workspace}</code>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => void openWorkspace()}
                      disabled={openWorkspacePending}
                    >
                      {openWorkspacePending ? '打开中...' : '打开文件夹'}
                    </Button>
                  </div>
                  <p>
                    Gateway 状态：<span className="text-foreground">{agent.gatewayHealth}</span>
                  </p>
                  {basicMessage && (
                    <p className={`text-xs ${basicError ? 'text-status-degraded' : 'text-status-ready'}`}>{basicMessage}</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="telegram" className="p-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3">
                  <h4 className="text-sm font-semibold">Telegram 绑定状态</h4>
                  <TelegramStatusBadge status={telegramStatus} />
                </div>

                <div className="flex gap-2">
                  <Button onClick={onOpenGuide} size="sm" className="text-xs">
                    {guide.open ? '继续引导' : '开始绑定引导'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={onResetGuide} className="text-xs">
                    重置引导
                  </Button>
                </div>

                {guide.open && (
                  <TelegramGuide
                    guide={guide}
                    steps={guideSteps}
                    checkPending={guideCheckPending}
                    onMoveStep={onMoveStep}
                    onStepClick={onStepClick}
                    onTokenChange={onTokenChange}
                  />
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}
