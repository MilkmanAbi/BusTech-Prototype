# BusWatch SG — Research & Design Sheet
**Project type:** Static webapp (GitHub Pages) for BusTech SG comp
**Stack target:** Vanilla HTML/CSS/JS, lean enough for low-end phones, PWA-capable
**Status:** Research only — no code written yet. This doc is the master plan to build off.

---

## 0. TL;DR — Read This First

| Idea | Status | Notes |
|---|---|---|
| Video feed | **Real, not hypothetical.** BusTech organisers are putting up cameras at 1-2 bus stops for the demo. We don't know the exact output format yet (USB feed? network stream?), so build the video pipeline against a **generic, swappable source** (`getUserMedia`, `<img>`/`<video>` for a stream URL, or file upload). Whatever they plug in on demo day, the canvas-grab → TF.js step doesn't change. Keep a looping stock "crowd" clip as a local dev/fallback. | See §4 |
| ML system | **Decided: TensorFlow.js in-browser (coco-ssd).** Zero backend, free forever, fits the GitHub Pages + no-budget setup perfectly. | See §5 |
| Weather | **Decided: data.gov.sg / NEA only.** No key, no quota to babysit, genuinely SG-specific (per-area 2hr forecasts, rainfall, PM2.5, UV). WeatherAPI dropped entirely. | See §3.3 |
| Bus crowdedness | LTA doesn't expose bus-*stop* crowd levels, but the **Bus Arrival API does return a `Load` field per incoming bus** (seats available / standing available / limited standing) — real official crowd data you can show *alongside* your own ML-based platform crowd estimate. | Combine: ML camera reading = "platform/queue crowd", LTA `Load` field = "incoming bus crowd". Strong "real official data + our own ML" story. |
| GitHub Pages, no domain/budget | LTA DataMall still needs a server-side `AccountKey` header and doesn't return CORS headers for `github.io` origins — that part is non-negotiable. | One **Vercel serverless function** (free tier, auto-deploys from GitHub, zero extra config) holds your DataMall key and forwards Bus Arrival/Stops/Services/Routes calls. data.gov.sg/NEA is called directly, no proxy. See §11. |

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     GitHub Pages (static site)                    │
│  index.html / app.js / style.css / sw.js / manifest.json          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐ │
│  │ Video card   │  │ Weather card │  │ Bus arrival / route card │ │
│  │ <video>/<canvas>│ fetch()      │  │ fetch() via proxy        │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘ │
│         │                 │                        │               │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌────────────▼─────────────┐ │
│  │ TF.js crowd  │  │ data.gov.sg /│  │  Vercel serverless fn    │ │
│  │ detection    │  │ NEA (no key) │  │  → LTA DataMall          │ │
│  │ (in-browser) │  │  direct call │  │  (adds AccountKey header)│ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
│                                                                     │
│  Location search → OneMap API (geocode) + local bus-stop dataset  │
│  (haversine to find nearest stops, cached in localStorage)        │
│                                                                     │
│  Notifications → Notification API + Service Worker (local logic)  │
└─────────────────────────────────────────────────────────────────┘
```

Everything in the top box is pure static assets on GitHub Pages. The **only** server-side piece is the Vercel serverless function proxy for LTA DataMall (one file, auto-deploys from the same GitHub repo, free tier handles this easily).

---

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Markup/Styling | Plain HTML5 + CSS3 (custom properties for theming) | No build step, loads instantly, easy for judges to inspect source |
| Interactivity | Vanilla JS (ES modules) | No framework tax. React/Vue add 40-100KB+ for a site that doesn't need it |
| Crowd ML | TensorFlow.js + `coco-ssd` (lite_mobilenet_v2 backbone) | Pure client-side, no backend, ~5-6MB model lazy-loaded only when camera tab is opened |
| Maps | Leaflet.js + OpenStreetMap tiles | Free, no API key, lightweight (~40KB gzipped) |
| Weather | data.gov.sg / NEA (no key) | Free, no quota to manage, genuinely SG-specific (per-area forecasts, rainfall, PM2.5, UV) |
| Bus data | LTA DataMall via Vercel proxy | Only real-time bus arrival source in SG |
| Geocoding/search | OneMap (SLA) `commonapi/search` | Free, SG-specific, CORS-friendly for search endpoint |
| PWA/Notifications | Web App Manifest + Service Worker + Notification API | Installable, works offline-ish, local "smart alerts" |
| Hosting (frontend) | GitHub Pages | Required by brief |
| Hosting (proxy) | Vercel (free tier, auto-deploys from GitHub) | One-file serverless function, no extra CLI setup, env vars in dashboard |

---

## 3. Data Sources & APIs — Detailed

### 3.1 LTA DataMall (the core transport data)

Sign up for a free `AccountKey` at https://datamall.lta.gov.sg/ (instant approval). Base URL: `https://datamall2.mytransport.sg/ltaodataservice/`. Every request needs:

```
AccountKey: <your_key>
accept: application/json
```

#### Bus Arrival v3 (real-time, the bread and butter)

```
GET /v3/BusArrival?BusStopCode=83139&ServiceNo=10
```

`ServiceNo` is optional — omit it to get **all** services arriving at that stop. This endpoint retrieves the estimated arrival time of buses at a specified bus stop. Key response fields per service:

```json
{
  "ServiceNo": "10",
  "Operator": "SBST",
  "NextBus": {
    "OriginCode": "77009",
    "DestinationCode": "77009",
    "EstimatedArrival": "2026-06-12T18:32:00+08:00",
    "Latitude": "1.29...",
    "Longitude": "103.78...",
    "Load": "SEA",          // SEA=Seats Available, SDA=Standing Available, LSD=Limited Standing
    "Type": "SD",           // SD=Single Deck, DD=Double Deck, BD=Bendy
    "Feature": "WAB"        // Wheelchair Accessible Bus
  },
  "NextBus2": { ... },
  "NextBus3": { ... }
}
```

**This `Load` field is your free, official "crowd level" data for incoming buses.** SEA → green, SDA → amber, LSD → red. Show this as a chip next to each upcoming bus.

Edge cases LTA explicitly calls out: arrival data may be available even when bus services are supposedly not in operation, e.g. just before the first bus leaves the depot or when the last bus is running late — display the ETA in those cases rather than "Not Operating".

#### Bus Stops (static-ish, ~5,200 records)

```
GET /BusStops?$skip=0
```

Max 50 records per call — to retrieve more records you append `$skip=X` to the URL, e.g. `$skip=150` for the 151st-200th record. Fields: `BusStopCode`, `RoadName`, `Description`, `Latitude`, `Longitude`.

**Plan:** write a tiny one-time script (Node or even browser console) that loops `$skip` 0→5200 in steps of 50, dumps the result to a single `bus-stops.json` (~1-2MB), and commit that file to the repo. The live site reads this static JSON — no API calls needed for the stop directory, instant search, works offline. Refresh it manually every few months (bus stops don't move often).

#### Bus Services & Bus Routes (static-ish)

```
GET /BusServices?$skip=0   → ServiceNo, Operator, Direction, Category, OriginCode, DestinationCode, AM/PM Peak Freq
GET /BusRoutes?$skip=0     → ServiceNo, Direction, StopSequence, BusStopCode, Distance, WD_FirstBus, WD_LastBus, SAT_FirstBus...
```

Same `$skip` pagination story. Bundle these as static JSON too, refreshed occasionally. Together with `BusStops`, this is enough to build a full "which buses stop here and where do they go" view — i.e. a mini busrouter.sg.

#### Traffic Images (use with caution)

Traffic image links are only valid for 5 minutes, and as of 30 June 2026 only Woodlands/Tuas Checkpoint and Sentosa Gateway cameras remain operational. Not useful for "bus station crowd" — but could power a small "live checkpoint traffic" widget if you want a bonus "real CCTV" feature elsewhere in the app (separate from the bus-stop crowd card, clearly labelled).

### 3.2 OneMap (Singapore Land Authority) — search & geocoding

No auth needed for basic search:

```
GET https://www.onemap.gov.sg/api/common/elastic/search?searchVal=Tampines%20Bus%20Interchange&returnGeom=Y&getAddrDetails=Y&pageNum=1
```

Returns `LATITUDE`/`LONGITUDE` plus address details for buildings, locations, or postal codes — perfect for your "search a location to see nearby bus stations" feature. Routing endpoints need an auth token via `/api/auth/post/getToken` (free email/password signup) — only needed if you want turn-by-turn directions later; skip for v1.

**Flow:** user types "Tampines Mall" → OneMap search → get lat/lon → haversine against your local `bus-stops.json` → show nearest 3-5 stops as cards, each with live arrivals + crowd level.

### 3.3 Weather — data.gov.sg / NEA (no key needed)

All data.gov.sg APIs are public and can be accessed without an API key for testing purposes, and are CORS-friendly for direct browser calls — call these straight from the static site, no proxy needed.

| Endpoint | What it gives |
|---|---|
| `/v1/environment/2-hour-weather-forecast` | 2-hour forecast retrieved half-hourly from NEA, broken down by ~47 areas across Singapore — "Cloudy near Tampines, Sunny near Jurong" granularity |
| `/v1/environment/24-hour-weather-forecast` | General day outlook + regional breakdown |
| `/v1/environment/4-day-weather-forecast` | Multi-day outlook |
| `/v1/environment/rainfall` | 5-minute rainfall readings from NEA stations — "is it raining at this bus stop *right now*" |
| `/v1/environment/pm25` | PM2.5 readings, hourly from NEA — air quality chip |
| `/v1/environment/uv-index` | UV index, hourly between 7AM-7PM |

Example call:

```js
const res = await fetch('https://api.data.gov.sg/v1/environment/2-hour-weather-forecast');
const data = await res.json();
const areas = data.area_metadata;          // [{ name, label_location: {latitude, longitude} }, ...]
const forecasts = data.items[0].forecasts; // [{ area, forecast }, ...]
```

**Matching a bus stop to an NEA area:** take the bus stop's lat/lon (from `bus-stops.json`) → haversine against `area_metadata[].label_location` → nearest area name → look that name up in `forecasts[]`. Same haversine helper as §7.1, reused.

**Display ideas:** forecast text + your own small icon mapping (NEA's forecast strings are things like "Partly Cloudy", "Light Rain", "Thundery Showers" — map these to a tiny emoji/SVG set, no icon CDN needed), current rainfall reading, PM2.5/UV as secondary chips.

**Caching:** these update on NEA's own schedule (half-hourly for 2hr forecast, 5-min for rainfall) — cache client-side for 5-10 min, no point re-fetching every render.

### 3.4 MRT/LRT crowd density (future expansion, not bus)

LTA also publishes real-time and forecasted station crowdedness levels for MRT/LRT stations via the Station Crowd Density APIs. Not bus-relevant now, but if BusWatch ever expands to "first/last mile" journeys (bus → MRT), this is the dataset to revisit.

---

## 4. Video Feed Strategy

The competition organisers are setting up real cameras at 1-2 bus stops for the demo, so this is an actual live-feed problem, not a hypothetical. You won't know the exact camera/output format until you're at the venue, so build for the lowest common denominator and keep the source swappable:

| Source | Use case | How |
|---|---|---|
| **USB webcam / laptop camera** | Most likely setup — organiser camera plugged into (or is) the demo laptop | `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` straight into a `<video>` element |
| **IP camera / MJPEG stream** | If the organiser's camera exposes a network stream (common for "demo CCTV" rigs) | `<img src="http://<camera-ip>/stream">` for MJPEG, or a `<video>` element if it's HLS/RTSP-over-HTTP. Either way, the next step is the same: draw the current frame to a `<canvas>`. |
| **Pre-recorded clip (dev/local fallback)** | Building/testing before you're at the venue, or the online GitHub Pages version when no camera is present | `<video>` element with a royalty-free "people queueing/crowd" clip (Pexels/Pixabay, check licence), looping |
| **Uploaded file** | Lets your overseer/judges drop in their own test clip on the spot | `<input type="file" accept="video/*">` → `URL.createObjectURL()` → feed into `<video>` |

Whatever the source, the pipeline downstream is identical: frames get drawn to a `<canvas>`, and that canvas is what TF.js reads (§5). Build a small "source switcher" in the UI (webcam / file upload / sample clip) — that's your demo-day insurance policy if the venue setup isn't what you expected.

**Practical tip:** ask the organisers ahead of time what their camera actually *outputs* (USB feed into your laptop? a network stream URL? something else?) — that one answer tells you which row above to build and test first.

---

## 5. ML Crowd Detection System

### 5.1 The plan: client-side TF.js + COCO-SSD

COCO-SSD is a TensorFlow.js port of the Single Shot MultiBox Detection model trained on COCO, capable of detecting 80 object classes including "person", and is designed as a lightweight solution for real-time object detection in browser-based applications without requiring ML knowledge.

```html
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd"></script>
```

```js
let model;
async function initModel() {
  model = await cocoSsd.load({ base: 'lite_mobilenet_v2' }); // smallest/fastest variant
}

async function analyzeFrame(videoEl) {
  const predictions = await model.detect(videoEl);
  const people = predictions.filter(p => p.class === 'person' && p.score > 0.5);
  return people.length;
}

function crowdLevel(count) {
  if (count <= 3)  return { label: 'Quiet',    color: '#4ade80' };
  if (count <= 8)  return { label: 'Moderate', color: '#facc15' };
  if (count <= 15) return { label: 'Busy',     color: '#fb923c' };
  return                  { label: 'Crowded',  color: '#f87171' };
}
```

**Important tuning notes:**
- These thresholds are illustrative — calibrate against your actual camera's field of view at the demo (a tight close-up vs a wide platform shot will count very differently for the "same" crowd).
- Run inference every **1-2 seconds**, not every frame — `setInterval` or `requestAnimationFrame` with a frame-skip counter. Saves battery and CPU on phones.
- **Smooth the result**: keep a rolling average of the last 5 readings before changing the displayed crowd level, so it doesn't flicker between "Moderate" and "Busy" every second.
- COCO-SSD provides bounding boxes only (not pixel-level masks) and real-time inference can still be slow on very low-end hardware like old smartphones — downscale the canvas to something like 320×240 before feeding it to the model; accuracy loss is minor for a "count roughly how many people" use case.
- The model itself is several MB — **lazy-load it only when the user opens the camera/crowd tab**, not on initial page load. Show a small "loading model…" skeleton during this.

### 5.2 Future option: server-side custom model

If BusWatch ever grows beyond this competition and you want a custom-trained model (e.g. fine-tuned YOLOv8n on real bus-stop imagery) for better accuracy in occlusion-heavy scenes, that's a separate project — a small FastAPI/Flask endpoint hosted on Hugging Face Spaces (free CPU tier) or Render (free tier), POSTed a frame, returns `{ count, level }`. Not needed for this build; see §15.

---

## 6. UI/UX Design System

### 6.1 Visual direction

"Clean af cards" = generous whitespace, soft shadows, rounded corners (12-16px), one accent colour per data type, system font stack (zero font-loading cost):

```css
:root {
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

  --bg: #f5f7fa;
  --card: #ffffff;
  --text: #1a1d23;
  --text-muted: #6b7280;

  --accent-bus: #2563eb;     /* blue — bus/transport info */
  --accent-weather: #f59e0b; /* amber — weather */
  --accent-crowd-quiet: #4ade80;
  --accent-crowd-moderate: #facc15;
  --accent-crowd-busy: #fb923c;
  --accent-crowd-full: #f87171;

  --radius: 14px;
  --shadow: 0 2px 12px rgba(0,0,0,0.06);
  --transition: 200ms ease;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --card: #1a1d23;
    --text: #f3f4f6;
    --text-muted: #9ca3af;
    --shadow: 0 2px 12px rgba(0,0,0,0.4);
  }
}
```

Dark mode via `prefers-color-scheme` is free accessibility + battery savings + "feels premium" for ~10 lines of CSS.

### 6.2 Card components (suggested set)

1. **Station header card** — name, road, "X stops nearby" toggle, live/offline badge.
2. **Crowd status card** — big colour-coded chip ("Moderate"), small `<canvas>` preview of the feed (optional, can be hidden on slow connections), people count, "last updated Xs ago".
3. **Weather card** — current temp, condition icon (animated, see below), humidity, "chance of rain" bar, hourly strip (horizontal scroll on mobile).
4. **Bus arrivals card** — list of services, each row: service number badge, ETA ("3 min" / "Arr"), crowd `Load` chip (SEA/SDA/LSD → colour), wheelchair icon if `WAB`.
5. **Map/location card** — Leaflet mini-map centred on the stop, marker, "Get directions" link to Google/Apple Maps (deep link, no API needed).
6. **Search bar** — sticky top, OneMap-powered autocomplete, recent searches (localStorage).

### 6.3 Animations (CSS-only where possible — cheap on low-end devices)

```css
/* Card entrance */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.card { animation: fadeSlideUp 300ms ease both; }

/* Live indicator pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.85); }
}
.live-dot { animation: pulse 1.6s ease-in-out infinite; }

/* Crowd level colour transition */
.crowd-chip { transition: background-color 400ms ease, color 400ms ease; }

/* Skeleton loading shimmer */
@keyframes shimmer { to { background-position: -200% 0; } }
.skeleton {
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

/* Respect reduced-motion users */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

Use `transform`/`opacity` only for animated properties — these are GPU-composited and won't jank on cheap phones, unlike animating `width`/`top`/`box-shadow`.

### 6.4 Layout

Mobile-first, single-column card stack; `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` for tablet/desktop so the same markup reflows into a multi-column dashboard without media query gymnastics.

---

## 7. Location, Search & Map

### 7.1 Geolocation → nearest stops

```js
navigator.geolocation.getCurrentPosition(pos => {
  const { latitude, longitude } = pos.coords;
  const nearest = findNearestStops(latitude, longitude, busStopsData, 5);
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function findNearestStops(lat, lon, stops, limit = 5) {
  return stops
    .map(s => ({ ...s, dist: haversine(lat, lon, s.Latitude, s.Longitude) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit);
}
```

### 7.2 Text search → OneMap → nearest stops

Same `findNearestStops`, just feed it the lat/lon returned by OneMap's search instead of `navigator.geolocation`. Debounce the input (300ms) so you're not hitting OneMap on every keystroke.

### 7.3 Map

Leaflet + OSM tiles, zero config:

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
```

```js
const map = L.map('map').setView([stop.Latitude, stop.Longitude], 16);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap contributors',
  maxZoom: 19
}).addTo(map);
L.marker([stop.Latitude, stop.Longitude]).addTo(map);
```

---

## 8. Notification System

Two tiers, build the easy one first:

### 8.1 Local/foreground notifications (no backend needed)

While the PWA tab/app is open, poll bus arrivals + crowd levels and fire local notifications via the Notification API:

```js
async function checkAndNotify(stop) {
  const arrivals = await getBusArrivals(stop.BusStopCode);
  const crowd = getCurrentCrowdLevel();

  arrivals.forEach(bus => {
    const mins = minutesUntil(bus.NextBus.EstimatedArrival);
    if (mins <= 2 && !notified.has(bus.ServiceNo)) {
      new Notification(`Bus ${bus.ServiceNo} arriving`, {
        body: `Arriving in ~${mins} min · ${loadLabel(bus.NextBus.Load)}`,
        icon: '/assets/icons/icon-192.png'
      });
      notified.add(bus.ServiceNo);
    }
  });

  if (crowd.label === 'Crowded' && !crowdAlertShown) {
    new Notification('Station getting crowded', { body: `${stop.Description} is currently Crowded.` });
    crowdAlertShown = true;
  }
}
```

Request permission **after** a user action (e.g. tapping a "🔔 Notify me" toggle on a station card), never on page load — browsers throttle/penalise sites that ask immediately.

### 8.2 True push notifications (works when app is closed) — future work

Requires a backend that holds subscriptions and pushes via the Web Push protocol with VAPID keys. For a v1, either:
- Skip this entirely and clearly scope it as "future work" in your pitch, or
- Use a free no-backend push provider like **OneSignal** (free tier, drop-in SDK + their own service worker snippet) if you want the "closed-app notification" demo without writing push server code yourself.

---

## 9. Performance — "Grandma Phone" Checklist

- **No frameworks.** Vanilla JS ES modules; total non-ML JS should be a few tens of KB.
- **Lazy-load the ML model** only when the crowd/camera card is opened — don't block first paint with a 5-6MB download.
- **Throttle inference** to 1 detection per 1-2 seconds, downscale frames to ~320×240 before feeding the model.
- **Debounce** search input and resize handlers (250-300ms).
- **Cache API responses**: weather 5-10 min, bus arrivals 15-30s (LTA data doesn't update faster than that anyway), bus stop directory = static file, basically infinite cache (versioned filename if you update it).
- **`loading="lazy"`** on any images; avoid large hero images entirely.
- **Animate only `transform`/`opacity`** (see §6.3).
- **`IntersectionObserver`**: pause the video element and ML loop when its card scrolls out of view.
- **System fonts only** — zero font download.
- **Service worker app-shell caching** so repeat visits load instantly even on flaky mobile data (see §10).
- Test on an actual old/cheap Android (or Chrome DevTools' "Slow 3G" + 4x CPU throttling) before the demo, not just your dev laptop.

---

## 10. PWA Setup

### `manifest.json`

```json
{
  "name": "BusWatch SG",
  "short_name": "BusWatch",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "background_color": "#f5f7fa",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### `sw.js` (basic app-shell cache)

```js
const CACHE = 'buswatch-v1';
const ASSETS = [
  './', './index.html', './css/styles.css', './js/app.js',
  './manifest.json', './assets/icons/icon-192.png', './data/bus-stops.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

Bump `CACHE` version string whenever you change cached assets, to force refresh.

> Note on GitHub Pages: since the repo is served from `https://<user>.github.io/<repo>/`, all paths (manifest, service worker, fetch URLs for local JSON) should be **relative** (`./`), not root-absolute (`/`), or they'll 404 under the repo subpath.

---

## 11. CORS / Backend Proxy (the one server piece)

LTA DataMall needs a custom `AccountKey` header and won't allow direct browser calls from a `github.io` origin. The solution is a single Vercel serverless function — **one file, no CLI required, auto-deploys from your existing GitHub repo, free tier is more than enough** (~100k function invocations/day on Hobby plan).

### Setup (no extra CLI steps needed)

1. Connect your GitHub repo to Vercel at https://vercel.com (free Hobby account, sign in with GitHub).
2. Create the proxy function file below. Vercel auto-detects the `api/` folder and deploys it as a serverless function — push to GitHub and it's live.

> **Note:** The key below (`e2Jpae+AQT2eamRi1Xot9w==`) is a school-issued throwaway key that deactivates after the demo. It's hardcoded here intentionally for convenience. When it expires, swap in a new key or move it to a Vercel env var (`process.env.LTA_ACCOUNT_KEY`) for any long-lived deployment.

### `api/lta.js`

```js
// Demo key — school-issued, expires post-demo. Replace or move to env var afterwards.
const LTA_ACCOUNT_KEY = 'e2Jpae+AQT2eamRi1Xot9w==';

export default async function handler(req, res) {
  // Allow CORS from your GitHub Pages origin (or * for dev convenience)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path, ...query } = req.query;
  if (!path) return res.status(400).json({ error: 'Missing path param' });

  const params = new URLSearchParams(query).toString();
  const ltaUrl = `https://datamall2.mytransport.sg/ltaodataservice/${path}${params ? '?' + params : ''}`;

  try {
    const upstream = await fetch(ltaUrl, {
      headers: {
        'AccountKey': LTA_ACCOUNT_KEY,
        'accept': 'application/json'
      }
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'Upstream LTA request failed', detail: err.message });
  }
}
```

### Frontend usage

```js
// busApi.js — all LTA calls go through this helper
const PROXY = 'https://your-project.vercel.app/api/lta';

async function ltaFetch(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params }).toString();
  const res = await fetch(`${PROXY}?${qs}`);
  if (!res.ok) throw new Error(`LTA proxy error ${res.status}`);
  return res.json();
}

// Examples:
const arrivals = await ltaFetch('v3/BusArrival', { BusStopCode: '83139' });
const stops    = await ltaFetch('BusStops', { $skip: '0' });
```

### What Vercel gives you for free

| | Vercel Hobby (free) |
|---|---|
| Function invocations | 100,000 / day |
| Bandwidth | 100 GB / month |
| Regions | Edge network (fast from SG) |
| Custom domain | Not needed — `your-project.vercel.app` works fine |
| Auto-deploy | Every `git push` to `main` |

data.gov.sg/NEA endpoints can still be called **directly from the browser** — no proxy needed for those.

---

## 12. Suggested Repo / File Structure

```
buswatch-sg/
├── index.html
├── manifest.json
├── sw.js
├── vercel.json               # optional: only needed for custom rewrites
├── api/
│   └── lta.js                # Vercel serverless proxy for LTA DataMall
├── css/
│   ├── reset.css
│   ├── variables.css          # design tokens (colors, spacing, etc.)
│   ├── components.css         # card, chip, button styles
│   └── animations.css
├── js/
│   ├── app.js                 # entry point, wires everything up
│   ├── weather.js             # data.gov.sg / NEA calls
│   ├── busApi.js              # LTA proxy calls (arrivals, services, routes)
│   ├── crowdDetection.js      # TF.js loader + inference loop
│   ├── location.js            # geolocation, OneMap search, haversine
│   ├── notifications.js       # local notification logic
│   └── map.js                 # Leaflet setup
├── data/
│   ├── bus-stops.json         # pre-fetched LTA BusStops dump
│   ├── bus-services.json      # pre-fetched LTA BusServices dump
│   └── bus-routes.json        # pre-fetched LTA BusRoutes dump
├── assets/
│   ├── icons/                 # PWA icons, favicons
│   └── demo-video/            # fallback "crowd" clip for online demo
├── scripts/
│   └── fetch-static-data.js   # one-off Node script to regenerate data/*.json from LTA
└── README.md
```

> **Note on GitHub Pages + Vercel coexisting:** GitHub Pages serves your static frontend from the repo root. Vercel serves just the `api/` folder as serverless functions. Both point at the same repo — no conflict.

---

## 13. Development Roadmap

| Phase | Goal | Key deliverables |
|---|---|---|
| **0** | Research (this doc) | ✅ done |
| **1 — MVP shell** | Static layout, design system, fake data | HTML/CSS card layout, design tokens, dummy JSON, dark mode, responsive grid |
| **2 — Weather** | Live weather card | data.gov.sg / NEA wired up, caching, hourly strip, animated icons |
| **3 — Bus data** | Live arrivals + search | Vercel proxy deployed (`api/lta.js`), `BusArrival` integration, `Load` crowd chips, OneMap search + haversine nearest-stops, static `bus-stops.json` |
| **4 — Crowd ML** | Camera/video → crowd level | `getUserMedia`/video upload, TF.js + coco-ssd, smoothing, crowd card UI, demo fallback clip |
| **5 — PWA + notifications** | Installable, alerts | manifest + service worker, local notification logic, offline app-shell |
| **6 — Polish** | Demo-ready | Animations pass, accessibility check (contrast, `prefers-reduced-motion`, focus states), low-end device testing, README + architecture diagram for judges |
| **7 — Future (post-comp)** | Stretch goals | See §15 |

---

## 14. Security & API Key Notes (brief)

- **LTA AccountKey**: hardcoded directly in `api/lta.js` for this demo — it's a school-issued throwaway key that deactivates a couple of days after the competition, so there's no real risk. For any future deployment with a real long-lived key, move it to a Vercel env var (`process.env.LTA_ACCOUNT_KEY`) and remove it from the source.
- **OneMap**: search endpoint needs no auth; skip the token flow entirely unless you build routing later.
- General good habit for future projects: anything that's *yours* and *rate-limited* → keep in env vars, not source. Demo expedience is fine when the key has a built-in expiry.  

---

## 15. Future Expansion Ideas

- **Crowd forecasting**: log your ML crowd readings over time + correlate with weather/time-of-day → simple regression/lookup table predicting "likely crowd level at 5pm on a rainy Tuesday".
- **Multi-camera / multi-stop dashboard**: grid of live crowd statuses across several stops, for an "operations centre" framing.
- **Accessibility mode**: high-contrast theme, screen-reader-optimised announcements ("Bus 10 arriving in 3 minutes, moderately crowded"), larger tap targets.
- **Multi-language**: EN/中文/Melayu/தமிழ் toggle — high relevance for an SG transport tool, and a nice "inclusive design" talking point for judges.
- **MRT/LRT integration**: pull in LTA's Station Crowd Density APIs (§3.4) for first/last-mile journey planning.
- **Real CCTV partnership**: if the competition can broker access to an actual bus interchange camera (via LTA/SBS Transit/SMRT/Tower Transit), swap the demo video source for a real RTSP/HLS stream — the architecture (§4) already supports this as a drop-in.
- **Custom-trained crowd model** (§5.2): move from generic person-detection to a model fine-tuned on actual bus-stop imagery for better accuracy in occlusion-heavy scenes.
- **Historical analytics page**: simple charts (e.g. Chart.js) of crowd levels over a day/week, stored via a lightweight backend (or even just `localStorage`/IndexedDB for a personal-device demo).
- **"Plan my trip"**: combine current crowd level + bus arrival ETA + weather to suggest "wait 5 more minutes, the 10:15 bus has more seats and it'll stop raining by then".
- **True push notifications** (§8.2): Web Push with VAPID keys via a lightweight backend, or drop-in via OneSignal free tier.

---

## 16. Reference Links

- LTA DataMall sign-up & docs: https://datamall.lta.gov.sg/
- LTA DataMall API User Guide (PDF): https://datamall.lta.gov.sg/content/dam/datamall/datasets/LTA_DataMall_API_User_Guide.pdf
- OneMap APIs: https://www.onemap.gov.sg/apidocs/
- data.gov.sg API overview: https://guide.data.gov.sg/developer-guide/api-overview
- TF.js coco-ssd: https://github.com/tensorflow/tfjs-models/tree/master/coco-ssd
- Leaflet: https://leafletjs.com/
- Vercel serverless functions docs: https://vercel.com/docs/functions
- Vercel environment variables: https://vercel.com/docs/projects/environment-variables
- Hugging Face Spaces (free CPU tier, for future custom ML): https://huggingface.co/docs/hub/spaces-overview
- busrouter.sg (open source, great reference for SG bus UI patterns): https://github.com/cheeaun/busrouter-sg

---

*End of research sheet. Next step when you're ready: Phase 1 (static layout + design system) — say go and we'll start scaffolding `index.html` + CSS tokens.*
