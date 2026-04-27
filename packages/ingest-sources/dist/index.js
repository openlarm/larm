// src/cwa/aws.ts
import { z } from "zod";

// src/util/qc.ts
var CWA_SENTINEL = -99;
function cleanCwaValue(v) {
  if (v === null || v === void 0) return null;
  if (v === CWA_SENTINEL || v <= -90) return null;
  return v;
}
function isPlausibleWind(kmh) {
  if (kmh === null) return true;
  return kmh >= 0 && kmh <= 200;
}
function isPlausibleTemp(c) {
  if (c === null) return true;
  return c >= -40 && c <= 60;
}

// src/cwa/aws.ts
var CWA_AWS_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001";
var CwaStationSchema = z.object({
  StationId: z.string(),
  StationName: z.string(),
  ObsTime: z.object({ DateTime: z.string() }),
  GeoInfo: z.object({
    Coordinates: z.array(z.object({
      StationLatitude: z.number(),
      StationLongitude: z.number()
    })).min(1)
  }),
  WeatherElement: z.object({
    WindSpeed: z.number().optional(),
    // m/s
    WindDirection: z.number().optional(),
    GustInfo: z.object({ PeakGustSpeed: z.number() }).optional(),
    AirTemperature: z.number().optional(),
    RelativeHumidity: z.number().optional(),
    AirPressure: z.number().optional(),
    Now: z.object({ Precipitation: z.number() }).optional()
  })
});
var CwaResponseSchema = z.object({
  records: z.object({ Station: z.array(CwaStationSchema) })
});
var MS_TO_KMH = 3.6;
async function runCwaAws(deps) {
  const apiKey = process.env.CWA_API_KEY;
  if (!apiKey) throw new Error("CWA_API_KEY required");
  const fetchLog = await deps.db.recordFetchStart("cwa_aws");
  const start = Date.now();
  try {
    const url = new URL(CWA_AWS_URL);
    url.searchParams.set("Authorization", apiKey);
    const res = await fetch(url, { signal: AbortSignal.timeout(3e4) });
    if (!res.ok) throw new Error(`CWA AWS HTTP ${res.status}`);
    const json = await res.json();
    const parsed = CwaResponseSchema.parse(json);
    const accepted = [];
    let rejected = 0;
    for (const stn of parsed.records.Station) {
      const we = stn.WeatherElement;
      const coord = stn.GeoInfo.Coordinates[0];
      const wind_kmh = cleanCwaValue(we.WindSpeed ?? null) !== null ? we.WindSpeed * MS_TO_KMH : null;
      const gust_kmh = we.GustInfo?.PeakGustSpeed != null && cleanCwaValue(we.GustInfo.PeakGustSpeed) !== null ? we.GustInfo.PeakGustSpeed * MS_TO_KMH : null;
      const temp_c = cleanCwaValue(we.AirTemperature ?? null);
      if (!isPlausibleWind(wind_kmh) || !isPlausibleTemp(temp_c)) {
        rejected++;
        continue;
      }
      accepted.push({
        ts: stn.ObsTime.DateTime,
        source: "cwa_aws",
        station_id: stn.StationId,
        lat: coord.StationLatitude,
        lng: coord.StationLongitude,
        wind_kmh,
        wind_dir_deg: cleanCwaValue(we.WindDirection ?? null),
        gust_kmh,
        temp_c,
        rh_pct: cleanCwaValue(we.RelativeHumidity ?? null),
        pressure_hpa: cleanCwaValue(we.AirPressure ?? null),
        rain_mm_10min: we.Now?.Precipitation ?? null,
        qc_flags: { bias_corrected: false, outlier: false }
      });
    }
    const written = await deps.db.upsertObservations(accepted);
    await deps.db.recordFetchEnd(fetchLog.id, "ok", {
      rows_written: written,
      rows_rejected: rejected,
      duration_ms: Date.now() - start
    });
    return { rows_written: written, rows_rejected: rejected, duration_ms: Date.now() - start };
  } catch (err) {
    await deps.db.recordFetchEnd(fetchLog.id, "failed", {
      error_message: String(err),
      duration_ms: Date.now() - start
    });
    throw err;
  }
}
export {
  runCwaAws
};
