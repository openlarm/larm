import { LayoutShell } from "@/components/layout/LayoutShell"

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <LayoutShell>{children}</LayoutShell>
}
