import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { Check, Loader2, ChevronLeft, ChevronRight, ImageIcon } from 'lucide-react'
import type { GuideStep, GuideState } from '@/types'

interface TelegramGuideProps {
  guide: GuideState
  steps: GuideStep[]
  checkPending: boolean
  onAutoCheck: () => void
  onMoveStep: (direction: 'next' | 'prev') => void
  onStepClick: (index: number) => void
  onTokenChange: (value: string) => void
}

export function TelegramGuide({
  guide,
  steps,
  checkPending,
  onAutoCheck,
  onMoveStep,
  onStepClick,
  onTokenChange,
}: TelegramGuideProps) {
  const currentStep = steps[guide.currentStep]

  return (
    <div className="mt-1 grid min-h-[480px] grid-cols-[220px_1fr_220px] overflow-hidden rounded-xl border border-border bg-card/50 max-[1200px]:grid-cols-[180px_1fr] max-[900px]:grid-cols-1">
      {/* Step List */}
      <ScrollArea className="border-r border-border p-2.5 max-[900px]:max-h-[160px] max-[900px]:border-r-0 max-[900px]:border-b">
        <div className="flex flex-col gap-1">
          {steps.map((step, index) => (
            <button
              key={step.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-left text-xs transition-colors',
                guide.currentStep === index
                  ? 'border-border bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
                guide.checks[index] && 'border-status-ready/30',
              )}
              onClick={() => onStepClick(index)}
              type="button"
            >
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.6rem]',
                  guide.checks[index]
                    ? 'border-status-ready/50 bg-status-ready/10 text-status-ready'
                    : guide.currentStep === index
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground',
                )}
              >
                {guide.checks[index] ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="truncate">{step.title.replace(/^S\d+\s/, '')}</span>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Content */}
      <div className="flex flex-col gap-3 p-4">
        <div>
          <h5 className="text-sm font-semibold text-foreground">{currentStep.title}</h5>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{currentStep.summary}</p>
        </div>

        {(currentStep.id === 'S4_PASTE_TOKEN' || currentStep.id === 'S5_VERIFY_TOKEN') && (
          <div className="space-y-1.5">
            <label htmlFor="telegram-token" className="text-xs font-medium text-muted-foreground">
              Telegram Bot Token
            </label>
            <Input
              id="telegram-token"
              onChange={(e) => onTokenChange(e.target.value)}
              placeholder="例如 123456789:AA..."
              value={guide.tokenInput}
              className="bg-muted/50 font-mono text-xs"
            />
          </div>
        )}

        <div
          className={cn(
            'rounded-lg border border-dashed px-3 py-2.5 text-xs',
            guide.lastCheckMessage
              ? guide.checks[guide.currentStep]
                ? 'border-status-ready/30 bg-status-ready/[0.04] text-status-ready'
                : 'border-status-degraded/30 bg-status-degraded/[0.04] text-status-degraded'
              : 'border-border text-muted-foreground',
          )}
          aria-live="polite"
        >
          {guide.lastCheckMessage || '点击"自动检查"后，检查通过即可继续。'}
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={checkPending}
            onClick={onAutoCheck}
            className="text-xs"
          >
            {checkPending ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
            {checkPending ? '检查中...' : '自动检查'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={guide.currentStep === 0}
            onClick={() => onMoveStep('prev')}
            className="text-xs"
          >
            <ChevronLeft className="mr-1 h-3 w-3" />
            上一步
          </Button>
          <Button
            size="sm"
            onClick={() => onMoveStep('next')}
            className="text-xs"
          >
            {guide.currentStep === steps.length - 1 ? '完成' : '继续'}
            {guide.currentStep < steps.length - 1 && <ChevronRight className="ml-1 h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Screenshot Panel */}
      <div className="border-l border-border p-4 max-[1200px]:col-span-full max-[1200px]:border-l-0 max-[1200px]:border-t">
        <h6 className="mb-2 text-xs font-medium text-foreground">{currentStep.screenshotTitle}</h6>
        <div
          className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border font-mono text-xs text-muted-foreground"
          role="img"
          aria-label={currentStep.screenshotTitle}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground/50">
            <ImageIcon className="h-8 w-8" />
            <span>Screenshot</span>
          </div>
        </div>
        <p className="mt-2 text-[0.7rem] leading-relaxed text-muted-foreground">{currentStep.screenshotHint}</p>
      </div>
    </div>
  )
}
