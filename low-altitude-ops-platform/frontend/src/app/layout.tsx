import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/layout/Sidebar"

export const metadata: Metadata = {
  title: "LAOP — Low Altitude Operations Platform",
  description: "低空作業決策作業系統 — Mock Prototype",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className="dark">
      <body className="antialiased bg-zinc-900 text-zinc-100 font-sans">
        <Sidebar />
        <main className="ml-56 min-h-screen">{children}</main>
      </body>
    </html>
  )
}
