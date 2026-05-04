import { ShieldCheck } from "lucide-react"
import { SYSTEM_VERSIONS } from "@/lib/mock-data"

export function VersionBar() {
  return (
    <div className="hidden sm:flex items-center gap-4 text-[11px] text-zinc-400">
      <span className="font-mono">Ruleset: <span className="text-emerald-400">{SYSTEM_VERSIONS.ruleset}</span></span>
      <span className="text-zinc-600">|</span>
      <span className="font-mono">Pricing: <span className="text-emerald-400">{SYSTEM_VERSIONS.pricing}</span></span>
      <span className="text-zinc-600">|</span>
      <span className="font-mono">Time Model: <span className="text-emerald-400">{SYSTEM_VERSIONS.time_model}</span></span>
      <span className="text-zinc-600">|</span>
      <span className="flex items-center gap-1 text-emerald-400">
        <ShieldCheck className="h-3 w-3" />
        Evidence Saved ✓
      </span>
    </div>
  )
}
