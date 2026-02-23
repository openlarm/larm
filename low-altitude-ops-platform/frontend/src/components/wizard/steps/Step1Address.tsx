"use client"
import { useState } from "react"
import { StepShell } from "../StepShell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, CheckCircle2, AlertTriangle } from "lucide-react"
import { MOCK_ADDRESSES, DEFAULT_ADDRESS_KEY } from "@/lib/mock-data"
import type { Mission, MissionType, AddressResult } from "@/lib/types"

interface Props {
  mission: Partial<Mission>
  update: (p: Partial<Mission>) => void
  next: () => void
  back: () => void
}

// Check if address matches one of the mock demo addresses (for consistent demo flow)
function findMockKey(address: string): string | undefined {
  return Object.keys(MOCK_ADDRESSES).find(k => address.includes(k.slice(0, 6)))
}

export function Step1Address({ mission, update, next }: Props) {
  const [address, setAddress] = useState(mission.address?.raw ?? "")
  const [missionType, setMissionType] = useState<MissionType | "">(mission.mission_type ?? "")
  const [clientName, setClientName] = useState(mission.client_name ?? "")
  const [parsed, setParsed] = useState<AddressResult | null>(mission.address ?? null)
  const [loading, setLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const handleParse = async () => {
    setLoading(true)
    setParseError(null)

    // Demo addresses → use mock data for consistent scenarios
    const mockKey = findMockKey(address)
    if (mockKey) {
      setTimeout(() => {
        setParsed(MOCK_ADDRESSES[mockKey])
        setLoading(false)
      }, 800)
      return
    }

    // Real geocoding via Nominatim (server-side proxy)
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json()
      if (data.status === "success") {
        setParsed(data as AddressResult)
      } else {
        setParseError("地址解析失敗，請確認地址格式或改用 Demo 地址")
        // Fallback to default mock for demo continuity
        setParsed({ ...MOCK_ADDRESSES[DEFAULT_ADDRESS_KEY], raw: address })
      }
    } catch {
      setParseError("網路連線異常，使用 Demo 位置替代")
      setParsed({ ...MOCK_ADDRESSES[DEFAULT_ADDRESS_KEY], raw: address })
    } finally {
      setLoading(false)
    }
  }

  const handleNext = () => {
    if (!parsed || !missionType) return
    update({
      address: parsed,
      mission_type: missionType,
      client_name: clientName || undefined,
    })
    next()
  }

  return (
    <StepShell
      title="Step 1 — Address Input"
      subtitle="輸入作業地址與任務類型"
      onNext={handleNext}
      nextDisabled={!parsed || !missionType}
      hideBack
    >
      {/* Address input */}
      <div className="space-y-2">
        <Label>地址 <span className="text-red-400">*</span></Label>
        <div className="flex gap-2">
          <Input
            value={address}
            onChange={e => { setAddress(e.target.value); setParsed(null); setParseError(null) }}
            placeholder="例：台北市信義區松仁路100號"
            className="bg-zinc-800 border-zinc-700 text-white flex-1"
            onKeyDown={e => e.key === "Enter" && address && handleParse()}
          />
          <button
            onClick={handleParse}
            disabled={!address || loading}
            className="px-4 py-2 rounded-md bg-zinc-700 text-sm text-white hover:bg-zinc-600 disabled:opacity-40 transition-colors shrink-0"
          >
            {loading ? "解析中…" : "解析地址"}
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          支援任意台灣地址（Nominatim 即時解析）．Demo 情境：
          <span className="text-zinc-400 ml-1">台北市信義區</span> /
          <span className="text-zinc-400 ml-1">新北市板橋區</span> /
          <span className="text-zinc-400 ml-1">桃園市大園區</span>
        </p>
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="flex items-center gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {parseError}
        </div>
      )}

      {/* Mission type */}
      <div className="space-y-2">
        <Label>任務類型 <span className="text-red-400">*</span></Label>
        <Select value={missionType} onValueChange={v => setMissionType(v as MissionType)}>
          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
            <SelectValue placeholder="選擇任務類型…" />
          </SelectTrigger>
          <SelectContent className="bg-zinc-800 border-zinc-700">
            {(["Cleaning", "Inspection", "Coating", "Solar", "Other"] as MissionType[]).map(t => (
              <SelectItem key={t} value={t} className="text-white hover:bg-zinc-700">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Client name */}
      <div className="space-y-2">
        <Label>客戶 / 案名 <span className="text-zinc-500">(可選)</span></Label>
        <Input
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          placeholder="例：信義地產股份有限公司"
          className="bg-zinc-800 border-zinc-700 text-white"
        />
      </div>

      {/* Result card */}
      {parsed && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 mt-2">
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">解析成功</span>
              <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400 ml-auto">
                {findMockKey(address) ? "Mock Demo" : "Nominatim OSM"} ✓
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <div className="text-zinc-400">經緯度</div>
              <div className="font-mono text-zinc-200">{parsed.lat.toFixed(4)}, {parsed.lng.toFixed(4)}</div>
              <div className="text-zinc-400">海拔</div>
              <div className="text-zinc-200">{parsed.altitude_m} m</div>
              <div className="text-zinc-400">行政區</div>
              <div className="text-zinc-200">{parsed.city} {parsed.district}</div>
              <div className="text-zinc-400">狀態</div>
              <div className="text-emerald-400 font-medium">Success</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <MapPin className="h-3 w-3" />
              {findMockKey(address) ? "地圖預覽（Mock — 靜態）" : `OSM: ${(parsed as AddressResult & { _display_name?: string })._display_name?.slice(0, 60) ?? "查詢成功"}`}
            </div>
            <div className="h-20 rounded bg-zinc-800 flex items-center justify-center text-zinc-600 text-xs">
              [ Map Preview — {parsed.city} {parsed.district} ({parsed.lat.toFixed(3)}, {parsed.lng.toFixed(3)}) ]
            </div>
          </CardContent>
        </Card>
      )}
    </StepShell>
  )
}
