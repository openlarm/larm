"use client"

import { useEffect, useRef } from "react"
import type { AirspaceResult } from "@/lib/types"

export interface PersistedRect {
  sw: [number, number]
  ne: [number, number]
  label: string
}

interface Props {
  lat: number
  lng: number
  airspace: AirspaceResult | null
  polygon?: { lat: number; lon: number }[] | null
  /** Draw mode active — any drag draws a rectangle */
  drawMode?: boolean
  /** Label shown in dim overlay while drawing (e.g. "棟A") */
  drawLabel?: string
  /** Saved rects to display persistently on the map */
  persistedRects?: PersistedRect[]
  /** Called after a rectangle is successfully drawn (so parent can exit draw mode) */
  onDrawModeEnd?: () => void
  /** width_m, depth_m, sw lat/lng, ne lat/lng */
  onRectDraw?: (width_m: number, depth_m: number, sw: [number, number], ne: [number, number]) => void
  /** When provided the marker becomes draggable and map clicks also reposition it */
  onPositionChange?: (lat: number, lng: number) => void
}

const SATELLITE_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const SATELLITE_ATTR = "Tiles &copy; Esri"

export function QuoteMap({
  lat, lng, airspace, polygon,
  drawMode, drawLabel, persistedRects,
  onDrawModeEnd, onRectDraw, onPositionChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<unknown>(null)
  const drawModeRef = useRef(drawMode ?? false)
  const drawLabelRef = useRef(drawLabel ?? "")
  const persistedLayersRef = useRef<unknown[]>([])

  // ── Main effect: initialise / re-initialise the Leaflet map ─────────────────
  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false

    async function init() {
      const L = await import("leaflet")
      // @ts-expect-error — no type declarations
      await import("leaflet/dist/leaflet.css")
      if (cancelled || !containerRef.current) return

      if (mapInstance.current) {
        (mapInstance.current as L.Map).remove()
        mapInstance.current = null
      }

      const icon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41] as [number, number],
        iconAnchor: [12, 41] as [number, number],
      })

      const map = L.map(containerRef.current, { center: [lat, lng] as [number, number], zoom: 18 })
      L.tileLayer(SATELLITE_TILE, { attribution: SATELLITE_ATTR, maxZoom: 19 }).addTo(map)

      // ── Marker ──────────────────────────────────────────────────────────────
      const marker = L.marker([lat, lng] as [number, number], {
        icon,
        draggable: !!onPositionChange,
      }).addTo(map)

      if (onPositionChange) {
        marker.on("dragend", () => {
          const { lat: newLat, lng: newLng } = marker.getLatLng()
          onPositionChange(newLat, newLng)
        })
        map.on("click", (e: L.LeafletMouseEvent) => {
          if (drawModeRef.current) return
          marker.setLatLng(e.latlng)
          onPositionChange(e.latlng.lat, e.latlng.lng)
        })

        const PinHelp = L.Control.extend({
          onAdd() {
            const div = L.DomUtil.create("div", "")
            div.innerHTML = `<div style="background:white;padding:5px 9px;border-radius:6px;font-size:11px;box-shadow:0 1px 4px rgba(0,0,0,.2)">拖動標記或點選地圖修正位置</div>`
            return div
          },
        })
        new PinHelp({ position: "bottomright" }).addTo(map)
      }

      // ── Building polygon ─────────────────────────────────────────────────────
      if (polygon && polygon.length > 2) {
        const coords: [number, number][] = polygon.map(p => [p.lat, p.lon])
        L.polygon(coords, { color: "#3b82f6", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.2 }).addTo(map)
      }

      // ── Airspace circle ──────────────────────────────────────────────────────
      if (airspace) {
        const color =
          airspace.status === "NoFly" ? "#ef4444" :
          airspace.status === "NeedPermit" ? "#f59e0b" : "#22c55e"
        L.circle([lat, lng] as [number, number], {
          radius: 100, color, weight: 1, fillColor: color, fillOpacity: 0.1,
        }).addTo(map)
      }

      // ── Rectangle draw (Step 2) ──────────────────────────────────────────────
      if (onRectDraw) {
        let drawing = false
        let startLatLng: L.LatLng | null = null
        let rectLayer: L.Rectangle | null = null

        const dimDiv = L.DomUtil.create("div", "")
        dimDiv.style.cssText =
          "display:none;background:rgba(30,30,30,.85);color:#fff;padding:4px 10px;border-radius:6px;" +
          "font-size:12px;font-weight:600;pointer-events:none;white-space:nowrap"
        const DimControl = L.Control.extend({
          onAdd() { return dimDiv },
        })
        new DimControl({ position: "topleft" }).addTo(map)

        map.on("mousedown", (e: L.LeafletMouseEvent) => {
          if (!drawModeRef.current) return
          drawing = true
          startLatLng = e.latlng
          map.dragging.disable()
          L.DomEvent.stop(e)
        })
        map.on("mousemove", (e: L.LeafletMouseEvent) => {
          if (!drawing || !startLatLng) return
          if (rectLayer) map.removeLayer(rectLayer)
          rectLayer = L.rectangle(L.latLngBounds(startLatLng, e.latlng), {
            color: "#2563eb", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.2,
            dashArray: "6 4",
          }).addTo(map)
          const ne = L.latLngBounds(startLatLng, e.latlng).getNorthEast()
          const sw = L.latLngBounds(startLatLng, e.latlng).getSouthWest()
          const w = Math.round(ne.distanceTo(L.latLng(ne.lat, sw.lng)))
          const d = Math.round(ne.distanceTo(L.latLng(sw.lat, ne.lng)))
          const prefix = drawLabelRef.current ? `📐 ${drawLabelRef.current}  ` : "📐 "
          dimDiv.textContent = `${prefix}${w} × ${d} m`
          dimDiv.style.display = "block"
        })
        map.on("mouseup", (e: L.LeafletMouseEvent) => {
          if (!drawing || !startLatLng) return
          drawing = false
          map.dragging.enable()
          const bounds = L.latLngBounds(startLatLng, e.latlng)
          const ne = bounds.getNorthEast(), sw = bounds.getSouthWest()
          const w = Math.round(ne.distanceTo(L.latLng(ne.lat, sw.lng)))
          const d = Math.round(ne.distanceTo(L.latLng(sw.lat, ne.lng)))
          dimDiv.style.display = "none"
          startLatLng = null
          if (w > 2 && d > 2) {
            onRectDraw(w, d, [sw.lat, sw.lng], [ne.lat, ne.lng])
            onDrawModeEnd?.()
          }
        })
      }

      persistedLayersRef.current = []
      mapInstance.current = map
    }

    init()
    return () => {
      cancelled = true
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove()
        mapInstance.current = null
      }
    }
  }, [lat, lng, airspace, polygon, onRectDraw, onPositionChange, onDrawModeEnd]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Secondary: update draw mode ────────────────────────────────────────────
  useEffect(() => {
    drawModeRef.current = drawMode ?? false
    const map = mapInstance.current as (L.Map & { dragging: L.Handler }) | null
    if (!map) return
    if (drawMode) {
      map.dragging.disable()
      ;(map.getContainer() as HTMLElement).style.cursor = "crosshair"
    } else {
      map.dragging.enable()
      ;(map.getContainer() as HTMLElement).style.cursor = ""
    }
  }, [drawMode])

  // ── Secondary: update draw label ref ──────────────────────────────────────
  useEffect(() => { drawLabelRef.current = drawLabel ?? "" }, [drawLabel])

  // ── Secondary: update persisted rect layers ────────────────────────────────
  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    import("leaflet").then(L => {
      const m = map as L.Map
      for (const layer of persistedLayersRef.current) m.removeLayer(layer as L.Layer)
      persistedLayersRef.current = []
      if (!persistedRects?.length) return
      for (const rect of persistedRects) {
        const layer = L.rectangle(
          L.latLngBounds(L.latLng(rect.sw[0], rect.sw[1]), L.latLng(rect.ne[0], rect.ne[1])),
          { color: "#16a34a", weight: 2, fillColor: "#22c55e", fillOpacity: 0.15 },
        ).bindTooltip(rect.label, { permanent: true, direction: "center" }).addTo(m)
        persistedLayersRef.current.push(layer)
      }
    })
  }, [persistedRects])

  return (
    <div ref={containerRef} className="w-full h-[300px] rounded-lg border border-zinc-200 overflow-hidden" />
  )
}
