# LARM Brand Guidelines

Minimal visual-identity kit for the LARM project. Use these assets in
slide decks, documentation sites, social cards, and README headers.

---

## 1. Assets

| File | Use |
|---|---|
| [`logo.svg`](./logo.svg) | Horizontal wordmark + tagline, light-mode (slate text on light background). |
| [`logo-dark.svg`](./logo-dark.svg) | Wordmark + tagline, dark-mode (zinc text on dark background, slightly desaturated gradient). |
| [`icon.svg`](./icon.svg) | Square app/favicon icon, 1:1 aspect, colored gradient background + white "L" mark. |

All assets are vector SVG — scale losslessly. Do not rasterize and
re-export as a substitute; always use the source SVG.

For favicons and OS icons, rasterize `icon.svg` at these sizes:

| Size | Use |
|---|---|
| 16×16, 32×32 | Browser favicon (`favicon.ico`) |
| 180×180 | `apple-touch-icon.png` |
| 192×192, 512×512 | Android / PWA manifest icons |
| 1200×630 | `og-image.png` (use `logo.svg` on a solid dark or light background, NOT the icon) |

Suggested one-liner to generate PNGs (requires `rsvg-convert` from
librsvg):

```bash
for size in 16 32 180 192 512; do
  rsvg-convert -w $size -h $size brand/icon.svg -o brand/icon-${size}.png
done
```

---

## 2. Color palette

LARM's visual language is the five-tier R-level gradient. These are the
canonical hex values (matching `spec/LARM-v2.0.md` §2 and the Tailwind
classes used throughout the reference implementation).

### Light-mode (text on light backgrounds)

| R-level | Name | Hex | Tailwind (500) |
|---|---|---|---|
| R0 | Emerald | `#10b981` | `emerald-500` |
| R1 | Sky | `#0ea5e9` | `sky-500` |
| R2 | Amber | `#f59e0b` | `amber-500` |
| R3 | Orange | `#f97316` | `orange-500` |
| R4 | Red | `#ef4444` | `red-500` |

### Dark-mode (text on dark backgrounds; one shade lighter)

| R-level | Name | Hex | Tailwind (400) |
|---|---|---|---|
| R0 | Emerald-400 | `#34d399` | `emerald-400` |
| R1 | Sky-400 | `#38bdf8` | `sky-400` |
| R2 | Amber-400 | `#fbbf24` | `amber-400` |
| R3 | Orange-400 | `#fb923c` | `orange-400` |
| R4 | Red-400 | `#f87171` | `red-400` |

### Neutral text

| Token | Light-mode use | Dark-mode use | Hex |
|---|---|---|---|
| Primary text | Wordmark | — | `#0f172a` (slate-900) |
| Secondary text | Tagline | — | `#475569` (slate-600) |
| Primary text | — | Wordmark | `#fafafa` (zinc-50) |
| Secondary text | — | Tagline | `#a1a1aa` (zinc-400) |

### W-code (weather regime) palette — optional, matches app UI

`W0` emerald · `W1` sky · `W2` yellow · `W3` orange · `W4` orange-deeper · `W5` red

---

## 3. Usage rules

**Do**

- Use the horizontal wordmark (`logo.svg`) as the primary brand mark in
  headers, README files, README badges, and slide cover pages.
- Use `icon.svg` as favicon, social-card avatar, and app icon.
- Combine with "Apache-2.0 licensed" attribution near the logo when
  embedding in third-party materials.
- Match the gradient direction in derivative materials (emerald on the
  left/top, red on the right/bottom).
- Maintain clear-space around the wordmark equal to the height of the
  `M` letterform.

**Don't**

- Don't re-color the wordmark. The gradient bar is the only licensed
  color application of the R-level palette for the logo.
- Don't skew, rotate beyond 0–15°, or apply drop shadows.
- Don't overlay text on top of the icon's gradient background.
- Don't use the LARM wordmark to imply endorsement of a commercial
  product, service, or derivative model without written permission.
- Don't substitute a bitmap raster version where the SVG would work.

---

## 4. Typography

The wordmark is set in **Inter**, weight 800, letter-spacing `-4` units
at 110px. In web contexts, prefer the font-stack:

```css
font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI",
             "Helvetica Neue", Arial, sans-serif;
```

For documentation body text use the same stack at weight 400–500.
Monospace contexts (code, data tables) use `ui-monospace, SFMono-Regular,
"SF Mono", Menlo, Consolas, monospace`.

---

## 5. Naming

- Write **LARM** in all uppercase in prose. Never "Larm" or "larm".
- Expand the initialism as **L**ow **A**ltitude **R**isk **M**odel on
  first mention in any document that doesn't already define it.
- The organization name is `openlarm` (lowercase) for npm scope, GitHub
  org, and domains; the project and model are `LARM`.

See [`OPEN_SOURCE_DECISIONS.md`](../OPEN_SOURCE_DECISIONS.md) §7 for the
full naming rationale.

---

## 6. License

The logo assets in this directory are released under the same
[Apache License 2.0](../LICENSE) as the LARM project. Derivative marks
that could be confused with the official LARM project identity are
restricted by trademark principles even where the license permits
modification — see [Apache Trademark policy](https://www.apache.org/foundation/marks/).
