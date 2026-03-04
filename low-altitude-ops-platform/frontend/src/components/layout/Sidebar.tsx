"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Rocket, Building2, BookOpen, FileText, X, CloudSun, SlidersHorizontal,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SYSTEM_VERSIONS } from "@/lib/mock-data"

const NAV = [
  { href: "/missions", label: "Missions", sublabel: "任務", icon: Rocket },
  { href: "/buildings", label: "Buildings", sublabel: "建物庫", icon: Building2 },
  { href: "/rules", label: "Rules & Versions", sublabel: "規則版本", icon: BookOpen },
  { href: "/documents", label: "Documents", sublabel: "文件中心", icon: FileText },
  { href: "/climate", label: "Climate", sublabel: "氣候評估", icon: CloudSun },
  { href: "/admin/params", label: "Model Params", sublabel: "模型參數", icon: SlidersHorizontal },
]

interface SidebarProps {
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  return (
    <aside className={cn(
      "fixed inset-y-0 left-0 w-56 flex flex-col bg-zinc-950 border-r border-zinc-800 z-40",
      "transition-transform duration-300 ease-in-out",
      // Desktop: always visible; Mobile: show/hide based on isOpen
      "lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full",
    )}>
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-800 flex items-start justify-between">
        <div>
          <div className="text-xs font-bold tracking-widest text-zinc-400 uppercase">LAOP</div>
          <div className="text-sm font-semibold text-white mt-0.5">Low Altitude Ops</div>
          <div className="text-[10px] text-zinc-500 mt-0.5">Mock Prototype</div>
        </div>
        {/* Close button — visible on mobile only */}
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-zinc-500 hover:text-white transition-colors"
            aria-label="關閉選單"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, sublabel, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium leading-tight">{label}</div>
                <div className="text-[10px] text-zinc-500 leading-tight">{sublabel}</div>
              </div>
            </Link>
          )
        })}
      </nav>

      {/* Version badges */}
      <div className="px-4 py-4 border-t border-zinc-800 space-y-1">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Active Versions</div>
        {[
          ["Ruleset", SYSTEM_VERSIONS.ruleset],
          ["Pricing", SYSTEM_VERSIONS.pricing],
          ["Time Model", SYSTEM_VERSIONS.time_model],
        ].map(([label, ver]) => (
          <div key={label} className="flex justify-between text-[10px]">
            <span className="text-zinc-500">{label}</span>
            <span className="text-emerald-400 font-mono">{ver}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}
