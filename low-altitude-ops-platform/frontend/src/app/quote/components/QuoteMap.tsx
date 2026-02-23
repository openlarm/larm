"use client"

import { useEffect, useRef } from "react"
import type { AirspaceResult } from "@/lib/types"

interface Props {
  lat: number
  lng: number
  airspace: AirspaceResult | null
  polygon?: { lat: number; lon: number }[] | null
  onRectDraw?: (width_m: number, depth_m: number) => void
}

// ESRI satellite tiles (free, no API key)
const SATELLITE_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const SATELLITE_ATTR = "Tiles &copy; Esri"

export function QuoteMap({ lat, lng, airspace, polygon, onRectDraw }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<unknown>(null)

  useEffect(() => {
    if (!mapRef.current) return

    let cancelled = false

    async function init() {
      // Dynamic import — Leaflet requires `window`
      const L = await import("leaflet")
      // @ts-expect-error — CSS import has no type declarations
      await import("leaflet/dist/leaflet.css")

      if (cancelled || !mapRef.current) return

      // Clean up any previous instance
      if (mapInstance.current) {
        (mapInstance.current as L.Map).remove()
        mapInstance.current = null
      }

      const defaultIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41] as [number, number],
        iconAnchor: [12, 41] as [number, number],
      })

      const map = L.map(mapRef.current, {
        center: [lat, lng] as [number, number],
        zoom: 18,
        zoomControl: true,
      })

      L.tileLayer(SATELLITE_TILE, {
        attribution: SATELLITE_ATTR,
        maxZoom: 19,
      }).addTo(map)

      L.marker([lat, lng] as [number, number], { icon: defaultIcon }).addTo(map)

      // Show building polygon if available
      if (polygon && polygon.length > 2) {
        const coords: [number, number][] = polygon.map(p => [p.lat, p.lon])
        L.polygon(coords, {
          color: "#3b82f6",
          weight: 2,
          fillColor: "#3b82f6",
          fillOpacity: 0.2,
        }).addTo(map)
      }

      // Airspace status overlay
      if (airspace) {
        const color =
          airspace.status === "NoFly" ? "#ef4444" :
          airspace.status === "NeedPermit" ? "#f59e0b" : "#22c55e"

        L.circle([lat, lng] as [number, number], {
          radius: 100,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.1,
        }).addTo(map)
      }

      // Rectangle draw for manual area estimation
      if (onRectDraw) {
        let drawing = false
        let startLatLng: L.LatLng | null = null
        let rectLayer: L.Rectangle | null = null

        const InstructionControl = L.Control.extend({
          onAdd() {
            const div = L.DomUtil.create("div", "")
            div.innerHTML = `<div style="background:white;padding:6px 10px;border-radius:6px;font-size:12px;box-shadow:0 1px 4px rgba(0,0,0,.2)">
              按住 Shift + 拖拉 框選建物範圍
            </div>`
            return div
          },
        })
        new InstructionControl({ position: "bottomleft" }).addTo(map)

        map.on("mousedown", (e: L.LeafletMouseEvent) => {
          if (!e.originalEvent.shiftKey) return
          drawing = true
          startLatLng = e.latlng
          map.dragging.disable()
        })

        map.on("mousemove", (e: L.LeafletMouseEvent) => {
          if (!drawing || !startLatLng) return
          if (rectLayer) map.removeLayer(rectLayer)
          rectLayer = L.rectangle(L.latLngBounds(startLatLng, e.latlng), {
            color: "#3b82f6",
            weight: 2,
            fillOpacity: 0.15,
          }).addTo(map)
        })

        map.on("mouseup", (e: L.LeafletMouseEvent) => {
          if (!drawing || !startLatLng) return
          drawing = false
          map.dragging.enable()

          const bounds = L.latLngBounds(startLatLng, e.latlng)
          const ne = bounds.getNorthEast()
          const sw = bounds.getSouthWest()

          const width = ne.distanceTo(L.latLng(ne.lat, sw.lng))
          const depth = ne.distanceTo(L.latLng(sw.lat, ne.lng))

          if (width > 2 && depth > 2) {
            onRectDraw(Math.round(width), Math.round(depth))
          }
          startLatLng = null
        })
      }

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
  }, [lat, lng, airspace, polygon, onRectDraw])

  return (
    <div
      ref={mapRef}
      className="w-full h-[300px] rounded-lg border border-zinc-200 overflow-hidden"
    />
  )
}
