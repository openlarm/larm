# CWA Lightning Data Feed — Verification Memo

> Resolves open question #1 in `data-expansion-v2.1.md`.
> Status: fact-finding. Cited sources only. 2026-05-05.

## TL;DR

**(a) The free CWA route is sufficient.** Dataset `O-A0039-001`
("閃電落雷系統即時觀測資料" / "Lightning and thunderstorm system
real-time observation data") is publicly available on
`opendata.cwa.gov.tw`, refreshes every 5 minutes, covers both CG
and IC strikes with point-level lat/lon, is licensed under the Open
Government Data License v1.0 (commercial use permitted with
attribution; CC BY 4.0 compatible), and is reachable through the
existing `CWA_API_KEY` already wired into `.env.local`. Effort for
v2.1's `lightning_strikes_30min_5km` field stays **S**; no
commercial vendor contract is required to ship.

Two minor open items (KMZ placemark schema confirmation, rate-limit
documentation) need a one-off engineering spike (fetch one live KMZ,
inspect the XML), not a CWA phone call.

## What we looked for

The schema-shape required by v2.1's proposed
`lightning_strikes_30min_5km` field: a publicly accessible feed
returning **per-strike records with latitude, longitude, timestamp,
and (preferably) a CG/IC discriminator**, refreshing at least every
~10 minutes, with commercial-use rights and Taiwan + nearshore-ocean
spatial coverage.

## Findings — CWA opendata

### Dataset `O-A0039-001` (primary match)

| Property | Value |
|---|---|
| Chinese name | 閃電落雷系統即時觀測資料 |
| English name | Lightning and thunderstorm system real-time observation data |
| Publisher | Central Weather Administration (CWA), MOTC |
| Data type | Observation (point strikes) |
| Refresh cadence | Every 5 minutes |
| Format | KMZ (zipped KML) |
| Endpoint | `https://opendata.cwa.gov.tw/fileapi/v1/opendataapi/O-A0039-001` |
| Strike types | Both **CG** (plus-sign markers) and **IC** (circle markers); confirmed via the public visualisation legend |
| Spatial coverage | Taiwan + surrounding seas (the cwa.gov.tw real-time map shows the same coverage; precise lat/lon bounds not documented on the public catalogue page — see Open items) |
| Time window per file | Past 1 hour by default; the visualisation supports 3/6/9/12 h playback, suggesting historical files are retained for at least 12 h |
| Licence | Open Government Data License v1.0 (Taiwan) — `OGDL-Taiwan-1.0`. Commercial use permitted, attribution required, CC BY 4.0 compatible |
| Auth | Free public access. Same `CWA_API_KEY` membership flow as `F-D0047-091` / `O-A0003-001` already wired in `.env.local` covers any large-download path |
| Rate limit | Not documented on the catalogue page. Polite default: poll once per 5-min publication cadence |

### Adjacent CWA datasets reviewed (not a match)

| ID | Why not used |
|---|---|
| `F-C0032-001` (county forecast, "Wx" element) | Already wired. Provides the boolean **forecast** `thunder_risk`, not observed strikes. Complement, not substitute. |
| `F-D0047-091` (township forecast, WS/WD/PoP12h) | Already wired. No lightning content. |
| `O-A0003-001` (real-time station obs) | Already wired. No lightning content; thunderstorm phenomenon flag is not in the standard element set. |
| `rdcap.cwa.gov.tw/data_access/thunderstorm` (Asia-Pacific Radar Data Center) | Research-grade radar / thunderstorm products. Coverage is broader (regional) but the documented access path is heavier (registered research use); for a production drone-ops feed, `O-A0039-001` is the right tool. |

## Findings — Public substitutes (fallback only; not needed)

- **Blitzortung.org** — community VLF network, ~1800 stations, free
  raw-data access for station operators, processed maps via
  LightningMaps.org. **East Asia coverage is patchy** (the
  Atmosphere journal study of Blitzortung in Japan and the project's
  own "Cover Your Area" guidance show that detection efficiency in
  East Asia is materially lower than in Europe / the contiguous US).
  Useful as a *cross-check*, not a primary feed for Taiwan.
- **WWLLN (World Wide Lightning Location Network)** — global VLF
  network operated by the University of Washington. Public
  visualisation; commercial / research data licensing available
  through the WWLLN consortium. Sparse East Asia receiver coverage
  (the maps showing only Chofu/Tokyo as a regional receiver imply
  weaker low-amplitude detection over Taiwan) makes it inferior to
  the CWA local network for our use case.
- **NOAA aviation-weather METAR (RCTP / RCSS)** — METAR phenomenon
  group includes `TS` (thunderstorm) flags which are observed, not
  forecast. Free, ~30-minute cadence + SPECI on threshold crossings,
  US-government source. **Two airport points only**, so it does not
  meet "within 5 km of mission site" for inland sites; useful as
  Taipei-area sanity check.

## Findings — Commercial vendors (informational; not needed)

| Vendor | Product | Notes |
|---|---|---|
| Vaisala | GLD360 / Real-Time Lightning Data Feed | Global, ~1 km median accuracy, sub-second latency, IC + CG. Subscription. **No public Taiwan-specific quote** — vendor requires direct contact. Industry context for similar global feeds: low-thousands USD/month tier. |
| Earth Networks | ENTLN (Total Lightning Network) | 1600+ wideband sensors across 40+ countries; IC + CG. Subscription. No public Taiwan-specific quote. |
| Xweather (DTN) | Xweather Lightning Network (formerly AerisWeather) | Repackages Vaisala feeds; tiered subscription. |
| Tomorrow.io | Aviation API | Includes lightning observations among aviation fields; tiered subscription. |

For LARM v2.1's purpose, none of these are needed: CWA's free
`O-A0039-001` already gives Taiwan-local point strikes at 5-min
cadence with commercial-use rights. A commercial vendor would only
become relevant if (i) the LARM core ships outside Taiwan and needs
a region-agnostic feed, or (ii) sub-minute latency becomes a hard
requirement, neither of which is on the v2.1 roadmap.

## Recommendation

**(a) Free CWA route exists and is sufficient. Proceed with the
v2.1 RFC at effort estimate S.**

Concrete next steps once Model Governance approves the data
expansion:

1. Add an `O-A0039-001` wrapper alongside the existing
   `F-C0032-001` / `F-D0047-091` / `O-A0003-001` wrappers in
   `low-altitude-ops-platform/frontend/src/app/api/weather/`.
2. Server-side: fetch the KMZ, unzip, parse the KML, filter
   placemarks to the last 30 min and within 5 km haversine of the
   mission lat/lon, return the count.
3. Surface as `lightning_strikes_30min_5km` on `WeatherTodayInput`,
   per the v2.1 plan doc.
4. Add the OGDL-Taiwan-1.0 attribution line to the project's data
   attributions (alongside the existing CC BY 4.0 attribution to
   Open-Meteo).

## Open items (do not block the RFC)

These can be resolved by an engineer fetching one live `O-A0039-001`
KMZ and inspecting it; no CWA phone call is required.

1. **Confirm KMZ placemark schema** — specifically that each
   `<Placemark>` carries `<Point><coordinates>lon,lat[,alt]</coordinates></Point>`,
   a `<TimeStamp>` or `<when>`, and a CG-vs-IC discriminator (most
   likely encoded in the `<styleUrl>` referencing the same legend
   icons — plus-sign vs circle — used on the public visualisation).
2. **Confirm rate limit** — polling the endpoint at the 5-min
   publication cadence is the natural floor; we should verify the
   endpoint does not throttle below that.
3. **Confirm spatial bounds** — the public visualisation shows
   Taiwan + nearshore Pacific / Taiwan Strait; precise bounds are
   not on the catalogue page. Practically, any strike outside the
   bounds simply will not appear in the file, so the radius filter
   in step 2 of the recommendation is self-correcting.
4. **(Lower priority) confirm IC/CG balance** — Operationally, IC
   strikes are usually less hazardous to UAS than CG, so we may
   want to expose the count split (`cg_count` and `ic_count`)
   rather than a single total. This is a v2.1 schema-shape detail,
   not a feed-availability question.

## References

- CWA dataset catalogue page (catalogue & API endpoint, refresh
  cadence, format, license):
  https://opendata.cwa.gov.tw/dataset/observation/O-A0039-001
- data.gov.tw mirror (English title, publisher, dataset id 30372):
  https://data.gov.tw/en/datasets/30372
- CWA real-time lightning visualisation (legend confirms IC=circles,
  CG=plus signs; 1-hour default window, 3/6/9/12 h playback):
  https://www.cwa.gov.tw/V8/C/W/OBS_Lightning.html
- Open Government Data License v1.0 (Taiwan), SPDX page (commercial
  use, attribution, CC BY 4.0 compatibility):
  https://spdx.org/licenses/OGDL-Taiwan-1.0.html
- data.gov.tw open-data licence summary:
  https://data.gov.tw/en/license
- CWA opendata Swagger (existing wired datasets):
  https://opendata.cwa.gov.tw/dist/opendata-swagger.html
- Asia-Pacific Radar Data Center (research-grade alternative,
  considered and not used):
  https://rdcap.cwa.gov.tw/data_access/thunderstorm
- Blitzortung — coverage and detection efficiency in East Asia
  (fallback evaluation):
  https://www.blitzortung.org/en/cover_your_area.php ;
  https://docs.lightningmaps.org/faq/ ;
  https://www.mdpi.com/2073-4433/14/10/1507
- Vaisala GLD360 (commercial fallback):
  https://www.vaisala.com/en/products/systems/lightning/gld360
- Vaisala Real-Time Lightning Data Feed (commercial fallback):
  https://www.vaisala.com/en/products/systems/lightning/real-time-data-feed
- NOAA Aviation Weather Center Data API (METAR fallback for
  RCTP/RCSS):
  https://aviationweather.gov/data/api/
