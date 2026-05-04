"use client"
import { useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { StepShell } from "../StepShell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { MapPin, CheckCircle2, AlertTriangle, XCircle, Loader2, Building2 } from "lucide-react"
import type { Mission, MissionType, AddressResult, AirspaceResult, AirspaceStatus } from "@/lib/types"

const QuoteMap = dynamic(
  () => import("@/app/(quote)/quote/components/QuoteMap").then(m => m.QuoteMap),
  { ssr: false }
)

interface Props {
  mission: Partial<Mission>
  update: (p: Partial<Mission>) => void
  next: () => void
  back: () => void
}

// ── DMS / decimal coordinate parser ─────────────────────────────────────────
function parseCoordinates(raw: string): { lat: number; lng: number } | null {
  const s = raw.trim()
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
  const dec = s.match(/^([-\d.]+)[,\s]+([-\d.]+)$/)
  if (dec) {
    const a = parseFloat(dec[1]), b = parseFloat(dec[2])
    if (isFinite(a) && isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      return { lat: a, lng: b }
    }
  }
  return null
}

// ── Airspace status display helpers ─────────────────────────────────────────
const STATUS_ICON: Record<AirspaceStatus, React.ReactNode> = {
  OK:         <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  NeedPermit: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  NoFly:      <XCircle className="h-4 w-4 text-red-400" />,
}
const STATUS_LABEL: Record<AirspaceStatus, string> = {
  OK: "空域正常，可直接作業",
  NeedPermit: "需申請空域許可",
  NoFly: "禁飛區 — 無法作業",
}
const STATUS_BORDER: Record<AirspaceStatus, string> = {
  OK:         "border-emerald-500/30 bg-emerald-500/5",
  NeedPermit: "border-amber-500/30 bg-amber-500/5",
  NoFly:      "border-red-500/30 bg-red-500/5",
}

export function Step1Address({ mission, update, next }: Props) {
  const [searchInput, setSearchInput] = useState(mission.address?.raw ?? "")
  const [searchMode, setSearchMode] = useState<"address" | "name">("address")
  const [missionType, setMissionType] = useState<MissionType | "">(mission.mission_type ?? "")
  const [clientName, setClientName] = useState(mission.client_name ?? "")

  const [parsed, setParsed]   = useState<AddressResult | null>(mission.address ?? null)
  const [airspace, setAirspace] = useState<AirspaceResult | null>(mission.airspace ?? null)
  const [buildingName, setBuildingName] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [posUpdating, setPosUpdating] = useState(false)
  const [geocodeError, setGeocodeError] = useState("")

  // Coordinate correction
  const [coordInput, setCoordInput] = useState("")
  const [coordError, setCoordError]  = useState("")

  // ── Fetch airspace + Overpass for any lat/lng ─────────────────────────────
  const refetchForPosition = useCallback(async (lat: number, lng: number) => {
    setPosUpdating(true)
    try {
      const [airRes, ovRes] = await Promise.all([
        fetch(`/api/airspace/query?lat=${lat}&lng=${lng}`),
        fetch(`/api/overpass?lat=${lat}&lng=${lng}`),
      ])
      const airData: AirspaceResult = await airRes.json()
      setAirspace(airData)

      const ov = await ovRes.json()
      if (ov.status === "found" && ov.name) setBuildingName(ov.name)
      else setBuildingName(null)
    } catch { /* non-critical */ }
    finally { setPosUpdating(false) }
  }, [])

  // ── Draggable marker / map click handler ──────────────────────────────────
  const handlePositionChange = useCallback((lat: number, lng: number) => {
    setParsed(prev => prev ? { ...prev, lat, lng } : null)
    refetchForPosition(lat, lng)
  }, [refetchForPosition])

  // ── Geocode: address or building name ─────────────────────────────────────
  const handleGeocode = useCallback(async () => {
    const q = searchInput.trim()
    if (q.length < 2) return
    setLoading(true)
    setGeocodeError("")
    setAirspace(null)
    setBuildingName(null)

    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}&mode=${searchMode}`)
      const geo = await res.json()
      if (geo.status !== "success") {
        setGeocodeError(
          geo.reason ??
          (searchMode === "address"
            ? "找不到此地址，請確認格式為「縣市＋區＋路名＋門牌號」"
            : "找不到此建案名稱，請嘗試更完整的名稱或改用地址搜尋")
        )
        setLoading(false)
        return
      }

      const addr: AddressResult = {
        raw:         q,
        lat:         geo.lat,
        lng:         geo.lng,
        altitude_m:  geo.altitude_m ?? 10,
        district:    geo.district   ?? "",
        city:        geo.city       ?? "",
        status:      "success",
      }
      setParsed(addr)
      if (geo.displayName) setBuildingName(geo.displayName)

      // Fetch airspace + overpass in parallel
      await refetchForPosition(geo.lat, geo.lng)
    } catch {
      setGeocodeError("網路錯誤，請稍後再試")
    } finally {
      setLoading(false)
    }
  }, [searchInput, searchMode, refetchForPosition])

  // ── Manual coordinate correction ──────────────────────────────────────────
  const handleCoordApply = useCallback(() => {
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
    setParsed(prev => prev
      ? { ...prev, lat: result.lat, lng: result.lng }
      : { raw: coordInput, lat: result.lat, lng: result.lng, altitude_m: 10, district: "", city: "", status: "success" }
    )
    refetchForPosition(result.lat, result.lng)
    setCoordInput("")
  }, [coordInput, refetchForPosition])

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
      {/* ── Client name ─────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <Label>客戶 / 案名 <span className="text-zinc-500">(可選)</span></Label>
        <Input
          value={clientName}
          onChange={e => setClientName(e.target.value)}
          placeholder="例：信義地產股份有限公司"
          className="bg-zinc-800 border-zinc-700 text-white"
        />
      </div>

      {/* ── Search mode tabs + input ─────────────────────────────────────── */}
      <div className="space-y-2">
        {/* Mode tabs */}
        <div className="flex gap-1">
          {(["address", "name"] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => { setSearchMode(mode); setSearchInput(""); setGeocodeError("") }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                searchMode === mode
                  ? "bg-sky-600 text-white"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              }`}
            >
              {mode === "address" ? "地址搜尋" : "建案名稱"}
            </button>
          ))}
        </div>

        <Label>
          {searchMode === "address" ? "建物地址" : "建案 / 建物名稱"}
          <span className="text-red-400 ml-1">*</span>
        </Label>
        <div className="flex gap-2">
          <Input
            value={searchInput}
            onChange={e => { setSearchInput(e.target.value); setGeocodeError("") }}
            onKeyDown={e => e.key === "Enter" && !loading && searchInput.trim().length >= 2 && handleGeocode()}
            placeholder={
              searchMode === "address"
                ? "例：台北市信義區松仁路100號"
                : "例：台北101、信義之星、遠雄二代宅"
            }
            className="bg-zinc-800 border-zinc-700 text-white flex-1"
          />
          <button
            onClick={handleGeocode}
            disabled={loading || searchInput.trim().length < 2}
            className="px-4 py-2 rounded-md bg-sky-600 text-sm text-white hover:bg-sky-700 disabled:opacity-40 transition-colors shrink-0 flex items-center gap-1.5"
          >
            {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />定位中</> : "定位"}
          </button>
        </div>
        {geocodeError && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
            <XCircle className="h-4 w-4 shrink-0" />
            {geocodeError}
          </div>
        )}
      </div>

      {/* ── Mission type ─────────────────────────────────────────────────── */}
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

      {/* ── Located result + map ─────────────────────────────────────────── */}
      {parsed && (
        <div className="space-y-3">
          {/* Position status */}
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="text-emerald-300">已定位：</span>
            <span className="font-mono text-zinc-200 text-xs">
              {parsed.lat.toFixed(5)}, {parsed.lng.toFixed(5)}
            </span>
            {posUpdating && (
              <span className="text-xs text-zinc-500 flex items-center gap-1 ml-1">
                <Loader2 className="h-3 w-3 animate-spin" />重新查詢
              </span>
            )}
          </div>
          {buildingName && (
            <div className="flex items-center gap-2 text-sm text-sky-300">
              <Building2 className="h-4 w-4 shrink-0" />
              <span>識別建物：{buildingName}</span>
            </div>
          )}
          {(parsed.city || parsed.district) && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <MapPin className="h-3 w-3" />
              {parsed.city} {parsed.district}
            </div>
          )}

          {/* Airspace status */}
          {airspace && (
            <div className={`border rounded-lg px-4 py-3 space-y-1.5 ${STATUS_BORDER[airspace.status]}`}>
              <div className="flex items-center gap-2">
                {STATUS_ICON[airspace.status]}
                <span className="text-sm font-medium">{STATUS_LABEL[airspace.status]}</span>
                {airspace.admin_days_added > 0 && (
                  <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400 ml-auto">
                    +{airspace.admin_days_added} 天行政
                  </Badge>
                )}
              </div>
              {airspace.reason && (
                <p className="text-xs text-zinc-400">{airspace.reason}</p>
              )}
            </div>
          )}

          {/* Satellite map */}
          <div className="rounded-md overflow-hidden border border-zinc-700">
            <QuoteMap
              lat={parsed.lat}
              lng={parsed.lng}
              airspace={airspace}
              onPositionChange={handlePositionChange}
            />
          </div>

          {/* Position correction panel */}
          <div className="border border-zinc-700 bg-zinc-800/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-300">位置不正確？</span>
              {posUpdating && (
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />重新查詢
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-zinc-400">
              <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-3 space-y-1">
                <p className="font-medium text-zinc-300">方法 1 — 在地圖上修正</p>
                <p>在上方地圖上<strong className="text-zinc-200">點選正確位置</strong>，或<strong className="text-zinc-200">拖動標記</strong>至建物正確位置</p>
              </div>
              <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-3 space-y-1">
                <p className="font-medium text-zinc-300">方法 2 — 貼上 Google 地圖座標</p>
                <ol className="space-y-0.5 list-decimal list-inside">
                  <li>Google 地圖搜尋建物地址</li>
                  <li>在建物上<strong className="text-zinc-200">右鍵</strong>點選</li>
                  <li>點擊跳出的<strong className="text-zinc-200">座標數字</strong>複製</li>
                  <li>貼入下方欄位後按「套用」</li>
                </ol>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={coordInput}
                onChange={e => setCoordInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCoordApply()}
                placeholder="25.039194, 121.562611 ｜ 或 DMS：25°02′21.1″N 121°33′45.4″E"
                className="bg-zinc-800 border-zinc-700 text-white font-mono flex-1 text-xs"
              />
              <button
                onClick={handleCoordApply}
                disabled={!coordInput.trim()}
                className="px-4 py-2 rounded-md bg-zinc-700 text-sm text-white hover:bg-zinc-600 disabled:opacity-40 transition-colors shrink-0"
              >
                套用座標
              </button>
            </div>
            {coordError && <p className="text-xs text-red-400">{coordError}</p>}
          </div>
        </div>
      )}

      {/* ── NoFly / NeedPermit alerts ────────────────────────────────────── */}
      {isNoFly && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertDescription>此地址位於禁飛區，任務無法生成。請更換地址。</AlertDescription>
        </Alert>
      )}
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
