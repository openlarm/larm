"use client"
import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { StepShell } from "../StepShell"

const QuoteMap = dynamic(
  () => import("@/app/(quote)/quote/components/QuoteMap").then(m => m.QuoteMap),
  { ssr: false }
)
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { MapPin, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react"
import { MOCK_ADDRESSES, DEFAULT_ADDRESS_KEY } from "@/lib/mock-data"
import type { Mission, MissionType, AddressResult, AirspaceResult, AirspaceStatus } from "@/lib/types"

interface Props {
  mission: Partial<Mission>
  update: (p: Partial<Mission>) => void
  next: () => void
  back: () => void
}

// ── DMS / decimal coordinate parser (ported from Quote) ─────────────────────
function parseCoordinates(raw: string): { lat: number; lng: number } | null {
  const s = raw.trim()
  // DMS: 25°02'21.1"N 121°33'45.4"E
  const dms = s.match(
    /(\d+)[°º]\s*(\d+)[''′]\s*([\d.]+)[""″]?\s*([NS])\s+(\d+)[°º]\s*(\d+)[''′]\s*([\d.]+)[""″]?\s*([EW])/i
  )
  if (dms) {
    const lat = (parseInt(dms[1]) + parseInt(dms[2]) / 60 + parseFloat(dms[3]) / 3600)
      * (dms[4].toUpperCase() === "S" ? -1 : 1)
    const lng = (parseInt(dms[5]) + parseInt(dms[6]) / 60 + parseFloat(dms[7]) / 3600)
      * (dms[8].toUpperCase() === "W" ? -1 : 1)
    if (isFinite(lat) && isFinite(lng)) return { lat, lng }
  }
  // Decimal: "25.039194, 121.562611"
  const dec = s.match(/^([-\d.]+)[,\s]+([-\d.]+)$/)
  if (dec) {
    const a = parseFloat(dec[1]), b = parseFloat(dec[2])
    if (isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return { lat: a, lng: b }
    }
  }
  return null
}

// Check if address matches one of the mock demo addresses
function findMockKey(address: string): string | undefined {
  return Object.keys(MOCK_ADDRESSES).find(k => address.includes(k.slice(0, 6)))
}

// Airspace status display helpers
const STATUS_ICON: Record<AirspaceStatus, React.ReactNode> = {
  OK:         <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  NeedPermit: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  NoFly:      <XCircle className="h-4 w-4 text-red-400" />,
}
const STATUS_LABEL: Record<AirspaceStatus, string> = {
  OK: "空域正常", NeedPermit: "需申請許可", NoFly: "禁飛區",
}
const STATUS_COLOR: Record<AirspaceStatus, string> = {
  OK:         "border-emerald-500/30 bg-emerald-500/5",
  NeedPermit: "border-amber-500/30 bg-amber-500/5",
  NoFly:      "border-red-500/30 bg-red-500/5",
}

export function Step1Address({ mission, update, next }: Props) {
  const [address, setAddress] = useState(mission.address?.raw ?? "")
  const [missionType, setMissionType] = useState<MissionType | "">(mission.mission_type ?? "")
  const [clientName, setClientName] = useState(mission.client_name ?? "")
  const [parsed, setParsed] = useState<AddressResult | null>(mission.address ?? null)
  const [airspace, setAirspace] = useState<AirspaceResult | null>(mission.airspace ?? null)
  const [loading, setLoading] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  // Coordinate correction
  const [coordInput, setCoordInput] = useState("")
  const [coordError, setCoordError] = useState("")

  const fetchAirspace = useCallback(async (lat: number, lng: number) => {
    // Mock demo addresses have pre-set airspace
    const mockKey = Object.keys(MOCK_ADDRESSES).find(k =>
      Math.abs(MOCK_ADDRESSES[k].lat - lat) < 0.01 && Math.abs(MOCK_ADDRESSES[k].lng - lng) < 0.01
    )
    if (mockKey) {
      setAirspace(MOCK_ADDRESSES[mockKey].airspace)
      return
    }
    // Try real airspace API
    try {
      const res = await fetch(`/api/airspace/query?lat=${lat}&lng=${lng}`)
      const data = await res.json()
      setAirspace(data)
    } catch {
      setAirspace({ status: "OK", admin_days_added: 0, ruleset_version: "v1.1-static" })
    }
  }, [])

  const handleParse = async () => {
    setLoading(true)
    setParseError(null)
    setAirspace(null)

    // Demo addresses → use mock data
    const mockKey = findMockKey(address)
    if (mockKey) {
      setTimeout(async () => {
        const mockAddr = MOCK_ADDRESSES[mockKey]
        setParsed(mockAddr)
        setAirspace(mockAddr.airspace)
        setLoading(false)
      }, 800)
      return
    }

    // Real geocoding via Nominatim
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json()
      if (data.status === "success") {
        setParsed(data as AddressResult)
        await fetchAirspace(data.lat, data.lng)
      } else {
        setParseError("地址解析失敗，請確認地址格式或改用 Demo 地址")
        const fallback = { ...MOCK_ADDRESSES[DEFAULT_ADDRESS_KEY], raw: address }
        setParsed(fallback)
        setAirspace(MOCK_ADDRESSES[DEFAULT_ADDRESS_KEY].airspace)
      }
    } catch {
      setParseError("網路連線異常，使用 Demo 位置替代")
      const fallback = { ...MOCK_ADDRESSES[DEFAULT_ADDRESS_KEY], raw: address }
      setParsed(fallback)
      setAirspace(MOCK_ADDRESSES[DEFAULT_ADDRESS_KEY].airspace)
    } finally {
      setLoading(false)
    }
  }

  // Manual coordinate correction
  const handleCoordApply = useCallback(async () => {
    setCoordError("")
    const result = parseCoordinates(coordInput)
    if (!result) {
      setCoordError("格式不正確，請輸入「25.039194, 121.562611」或「25°02′21.1″N 121°33′45.4″E」")
      return
    }
    if (result.lat < 21 || result.lat > 26 || result.lng < 118 || result.lng > 123) {
      setCoordError("座標不在台灣範圍內")
      return
    }
    const newParsed: AddressResult = {
      raw: parsed?.raw ?? address,
      lat: result.lat, lng: result.lng,
      altitude_m: parsed?.altitude_m ?? 10,
      district: parsed?.district ?? "", city: parsed?.city ?? "",
      status: "success",
    }
    setParsed(newParsed)
    await fetchAirspace(result.lat, result.lng)
    setCoordInput("")
  }, [coordInput, parsed, address, fetchAirspace])

  const isNoFly = airspace?.status === "NoFly"
  const handleNext = () => {
    if (!parsed || !missionType) return
    update({
      address: parsed,
      mission_type: missionType,
      client_name: clientName || undefined,
      airspace: airspace ?? undefined,
    })
    next()
  }

  return (
    <StepShell
      title="Step 1 — Address & Airspace"
      subtitle="輸入作業地址、空域查詢與任務類型"
      onNext={handleNext}
      nextDisabled={!parsed || !missionType || isNoFly}
      hideBack
    >
      {/* Address input */}
      <div className="space-y-2">
        <Label>地址 <span className="text-red-400">*</span></Label>
        <div className="flex gap-2">
          <Input
            value={address}
            onChange={e => { setAddress(e.target.value); setParsed(null); setParseError(null); setAirspace(null) }}
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

      {/* Result card: address + airspace */}
      {parsed && (
        <Card className={`border mt-2 ${airspace ? STATUS_COLOR[airspace.status] : "border-emerald-500/30 bg-emerald-500/5"}`}>
          <CardContent className="pt-4 space-y-3">
            {/* Address result */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-300">地址解析成功</span>
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
            </div>

            {/* Airspace status (inline) */}
            {airspace && (
              <div className="pt-2 border-t border-zinc-700/50 space-y-2">
                <div className="flex items-center gap-2">
                  {STATUS_ICON[airspace.status]}
                  <span className="text-sm font-medium">{STATUS_LABEL[airspace.status]}</span>
                  {airspace.admin_days_added > 0 && (
                    <span className="text-xs text-zinc-400 ml-2">+{airspace.admin_days_added} 天行政作業</span>
                  )}
                  <span className="font-mono text-xs text-zinc-500 ml-auto">ruleset: {airspace.ruleset_version}</span>
                </div>
                {airspace.reason && (
                  <p className="text-xs text-zinc-400 bg-zinc-800/50 rounded px-3 py-1.5">{airspace.reason}</p>
                )}
              </div>
            )}

            {/* Location label */}
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <MapPin className="h-3 w-3" />
              {parsed.city} {parsed.district} ({parsed.lat.toFixed(3)}, {parsed.lng.toFixed(3)})
            </div>
            {/* Interactive satellite map — drag marker to fine-tune position */}
            <div className="rounded-md overflow-hidden border border-zinc-700">
              <QuoteMap
                lat={parsed.lat}
                lng={parsed.lng}
                airspace={airspace}
                onPositionChange={(lat, lng) =>
                  setParsed(prev => prev ? { ...prev, lat, lng } : prev)
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coordinate correction panel */}
      {parsed && (
        <div className="border border-zinc-700 bg-zinc-800/30 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-zinc-400">位置不正確？手動輸入座標修正</p>
          <div className="flex gap-2">
            <Input
              value={coordInput}
              onChange={e => setCoordInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleCoordApply()}
              placeholder="25.039194, 121.562611 或 25°02′21.1″N 121°33′45.4″E"
              className="bg-zinc-800 border-zinc-700 text-white font-mono flex-1 text-xs"
            />
            <button
              onClick={handleCoordApply}
              disabled={!coordInput.trim()}
              className="px-4 py-2 rounded-md bg-zinc-700 text-sm text-white hover:bg-zinc-600 disabled:opacity-40 transition-colors shrink-0"
            >
              套用
            </button>
          </div>
          {coordError && <p className="text-xs text-red-400">{coordError}</p>}
          <p className="text-[10px] text-zinc-600">支援十進位座標與 DMS 格式。可在 Google 地圖上右鍵複製座標後貼入。</p>
        </div>
      )}

      {/* NoFly block */}
      {isNoFly && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertDescription>此地址位於禁飛區，任務無法生成。請更換地址。</AlertDescription>
        </Alert>
      )}

      {/* NeedPermit warning */}
      {airspace?.status === "NeedPermit" && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            需提前向 CAA 申請飛行許可（LAANC）。行政作業時間已納入排程計算。
          </AlertDescription>
        </Alert>
      )}
    </StepShell>
  )
}
