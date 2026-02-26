import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Props {
  steps: string[]
  current: number
}

export function WizardStepper({ steps, current }: Props) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {steps.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} className="flex items-center">
            {/* Circle */}
            <div className={cn(
              "flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold shrink-0 border",
              done  ? "bg-emerald-500 border-emerald-500 text-white" :
              active ? "bg-zinc-800 border-zinc-400 text-white" :
                       "bg-zinc-900 border-zinc-700 text-zinc-500"
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {/* Label — on mobile only active step label is visible */}
            <div className={cn(
              "ml-1.5 text-xs whitespace-nowrap",
              active ? "text-white font-medium" : done ? "text-emerald-400" : "text-zinc-500",
              !active && "hidden sm:block",
            )}>
              {label}
            </div>
            {/* Connector */}
            {i < steps.length - 1 && (
              <div className={cn("mx-1 sm:mx-2 h-px w-4 sm:w-8 shrink-0", i < current ? "bg-emerald-500" : "bg-zinc-700")} />
            )}
          </div>
        )
      })}
    </div>
  )
}
