import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "LAOP — Low Altitude Operations Platform",
  description: "低空作業決策作業系統 — Mock Prototype",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <body className="antialiased font-sans">{children}</body>
    </html>
  )
}
