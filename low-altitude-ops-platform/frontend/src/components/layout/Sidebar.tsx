"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Rocket, Building2, Users, Wrench, BookOpen, FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SYSTEM_VERSIONS } from "@/lib/mock-data"

const NAV = [
  { href: "/missions", label: "Missions", sublabel: "任務", icon: Rocket },
  { href: "/buildings", label: "Buildings", sublabel: "建物庫", icon: Building2 },
  { href: "/teams", label: "Teams", sublabel: "人員/認證", icon: Users },
  { href: "/equipment", label: "Equipment", sublabel: "設備履歷", icon: Wrench },
  { href: "/rules", label: "Rules & Versions", sublabel: "規則版本", icon: BookOpen },
  { href: "/documents", label: "Documents", sublabel: "文件中心", icon: FileText },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="fixed inset-y-0 left-0 w-56 flex flex-col bg-zinc-950 border-r border-zinc-800 z-40">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-zinc-800">
        <div className="text-xs font-bold tracking-widest text-zinc-400 uppercase">LAOP</div>
        <div className="text-sm font-semibold text-white mt-0.5">Low Altitude Ops</div>
        <div className="text-[10px] text-zinc-500 mt-0.5">Mock Prototype</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, sublabel, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
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
