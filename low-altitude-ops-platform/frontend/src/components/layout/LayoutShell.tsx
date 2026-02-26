"use client"

import { useState } from "react"
import { Menu } from "lucide-react"
import { Sidebar } from "./Sidebar"

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="dark min-h-screen bg-zinc-900 text-zinc-100">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile top bar — hidden on lg+ (sidebar always visible) */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 z-20">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-md text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          aria-label="開啟選單"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="ml-3">
          <div className="text-xs font-bold tracking-widest text-zinc-400 uppercase leading-tight">LAOP</div>
          <div className="text-sm font-semibold text-white leading-tight">Low Altitude Ops</div>
        </div>
      </header>

      {/* Main content — offset for sidebar on desktop, offset for top bar on mobile */}
      <main className="lg:ml-56 min-h-screen pt-14 lg:pt-0">
        {children}
      </main>
    </div>
  )
}
