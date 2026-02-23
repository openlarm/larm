import { Sidebar } from "@/components/layout/Sidebar"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-zinc-900 text-zinc-100">
      <Sidebar />
      <main className="ml-56 min-h-screen">{children}</main>
    </div>
  )
}
