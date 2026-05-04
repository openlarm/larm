import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "LARM Playground — Interactive Risk Model",
  description:
    "Play with the LARM (Low Altitude Risk Model) inputs and see R-score, decision, and component breakdown update in real time.",
  openGraph: {
    title: "LARM Playground",
    description: "Interactive deterministic drone-operation risk scoring.",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
