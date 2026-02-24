import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { TelegramStatusBadge } from '@/components/status-badge'
import { TelegramGuide } from '@/components/telegram-guide'
import type { AgentMeta, TelegramStatus, TabKey, GuideStep, GuideState } from '@/types'

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
  onAutoCheck: () => void
  onMoveStep: (direction: 'next' | 'prev') => void
  onStepClick: (index: number) => void
  onTokenChange: (value: string) => void
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
  onAutoCheck,
  onMoveStep,
  onStepClick,
  onTokenChange,
}: SettingsDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <SheetContent
        side="right"
        className="w-[min(960px,90vw)] max-w-none overflow-y-auto border-border bg-[#0b1115] p-0 sm:max-w-none"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-foreground">
            {scope === 'global' ? '全局设置' : `${agent.name} 设置`}
          </SheetTitle>
          <SheetDescription>
            {scope === 'global' ? '应用级偏好与守护选项' : 'IM 配置按当前 Agent 生效'}
          </SheetDescription>
        </SheetHeader>

        {scope === 'global' ? (
          <div className="space-y-5 p-5">
            <h4 className="text-sm font-semibold">全局偏好</h4>
            <div className="flex max-w-md items-center justify-between rounded-lg border border-border px-4 py-3">
              <span className="text-sm">Prevent Sleep（默认开启）</span>
              <Switch checked={sleepGuardEnabled} />
            </div>
            <p className="text-xs text-muted-foreground">
              仅阻止系统睡眠，不强制保持屏幕点亮。
            </p>
            <p className="text-xs text-muted-foreground">
              Agent 的 Telegram 绑定请在聊天窗口右上角"设置"中操作。
            </p>
          </div>
        ) : (
          <Tabs
            value={activeTab}
            onValueChange={(v) => onTabChange(v as TabKey)}
            className="flex flex-col"
          >
            <TabsList className="mx-5 mt-4 w-fit bg-muted">
              <TabsTrigger value="basic" className="text-xs">基础</TabsTrigger>
              <TabsTrigger value="telegram" className="text-xs">Telegram</TabsTrigger>
              <TabsTrigger value="advanced" className="text-xs">高级</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="p-5">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">基础信息</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Agent 名称：<span className="text-foreground">{agent.name}</span></p>
                  <p>
                    Workspace：<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{agent.workspace}</code>
                  </p>
                  <p>Gateway 状态：<span className="text-foreground">{agent.gatewayHealth}</span></p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="p-5">
              <div className="space-y-5">
                <h4 className="text-sm font-semibold">高级设置</h4>
                <p className="text-xs text-muted-foreground">默认隐藏 1 Agent = 1 Gateway 细节，仅显示结果状态。</p>
                <div className="flex max-w-md items-center justify-between rounded-lg border border-border px-4 py-3">
                  <span className="text-sm">Prevent Sleep（默认开启）</span>
                  <Switch checked={sleepGuardEnabled} />
                </div>
                <p className="text-xs text-muted-foreground">
                  仅阻止系统睡眠，不强制保持屏幕点亮。
                </p>
              </div>
            </TabsContent>

            <TabsContent value="telegram" className="p-5">
              <div className="space-y-4">
                {/* Status Card */}
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/50 px-4 py-3">
                  <h4 className="text-sm font-semibold">Telegram 绑定状态</h4>
                  <TelegramStatusBadge status={telegramStatus} />
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button onClick={onOpenGuide} size="sm" className="text-xs">
                    {guide.open ? '继续引导' : '开始绑定引导'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={onResetGuide} className="text-xs">
                    重置引导
                  </Button>
                </div>

                {/* Guide */}
                {guide.open && (
                  <TelegramGuide
                    guide={guide}
                    steps={guideSteps}
                    checkPending={guideCheckPending}
                    onAutoCheck={onAutoCheck}
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
