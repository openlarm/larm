import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  title: string
  subtitle?: string
  children: React.ReactNode
  onBack?: () => void
  onNext?: () => void
  nextLabel?: string
  nextDisabled?: boolean
  hideBack?: boolean
  wide?: boolean
}

export function StepShell({
  title, subtitle, children,
  onBack, onNext, nextLabel = "Next →", nextDisabled, hideBack, wide,
}: Props) {
  return (
    <div className={cn("mx-auto w-full", wide ? "max-w-6xl" : "max-w-3xl")}>
      <div className="mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-white">{title}</h2>
        {subtitle && <p className="text-xs sm:text-sm text-zinc-400 mt-1">{subtitle}</p>}
      </div>

      <div className="space-y-4">{children}</div>

      <div className="flex items-center gap-3 mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-zinc-800">
        {!hideBack && onBack && (
          <Button variant="outline" onClick={onBack} className="gap-1 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
        )}
        {onNext && (
          <Button onClick={onNext} disabled={nextDisabled} className="gap-1 ml-auto">
            {nextLabel} <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
