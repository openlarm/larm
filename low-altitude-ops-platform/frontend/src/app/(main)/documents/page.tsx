import { VersionBar } from "@/components/layout/VersionBar"
import { FileText, Download } from "lucide-react"

const DOCS = [
  { id: "DOC-20260220-001", mission: "M-20260220-001", type: "Mission Plan", format: "PDF", size: "248 KB", date: "2026-02-20 11:02", status: "valid" },
  { id: "DOC-20260220-002", mission: "M-20260220-001", type: "Permit Package", format: "ZIP", size: "1.2 MB", date: "2026-02-20 11:02", status: "valid" },
  { id: "DOC-20260219-001", mission: "M-20260219-002", type: "Risk Attachment", format: "PDF", size: "92 KB", date: "2026-02-19 15:30", status: "pending_review" },
  { id: "DOC-20260218-001", mission: "M-20260218-003", type: "Mission Plan", format: "PDF", size: "231 KB", date: "2026-02-18 10:14", status: "archived" },
]

const STATUS_STYLE: Record<string, string> = {
  valid:          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  pending_review: "bg-amber-500/10  text-amber-400  border-amber-500/20",
  archived:       "bg-zinc-700/50   text-zinc-400   border-zinc-600",
}

export default function DocumentsPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-zinc-400 mt-0.5">文件中心</p>
        </div>
        <VersionBar />
      </div>

      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-zinc-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Document ID</th>
              <th className="px-4 py-3 text-left font-medium">Mission</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Format</th>
              <th className="px-4 py-3 text-left font-medium">Size</th>
              <th className="px-4 py-3 text-left font-medium">Generated</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {DOCS.map(doc => (
              <tr key={doc.id} className="hover:bg-zinc-800/20">
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{doc.id}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-400">{doc.mission}</td>
                <td className="px-4 py-3 text-zinc-300">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-zinc-500" />
                    {doc.type}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">{doc.format}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{doc.size}</td>
                <td className="px-4 py-3 text-zinc-500 text-xs font-mono">{doc.date}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${STATUS_STYLE[doc.status]}`}>
                    {doc.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    title="Download (mock)"
                    className="text-zinc-600 hover:text-zinc-300 transition-colors cursor-not-allowed"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-zinc-600 text-center">
        所有文件均為唯讀 / append-only。下載功能為 mock（不產生實際檔案）。
      </p>
    </div>
  )
}
