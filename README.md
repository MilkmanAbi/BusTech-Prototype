# BusWatch SG 🚌

A calm, comfy web app for Singapore bus stops — real-time arrivals, how packed each
bus is, neighbourhood weather, and an **on-device AI read** of how busy the platform
looks. Frosted-glass cards float over hand-painted wave wallpapers that drift from
dawn → morning → dusk → night with the real time of day.

Built for **BusTech SG** with plain HTML / CSS / JS (no framework), so it stays fast
even on an old phone.

---

## ✨ Features

- **Time-of-day skies** — four wallpapers cross-fade automatically by the clock.
- **Live arrivals as flip cards** — tap to flip for operator, vehicle type, accessibility
  and the next few buses. The official LTA **Load** field shows seats / standing / packed.
- **On-device crowd AI** — TensorFlow.js + COCO-SSD count people on the live camera,
  entirely in your browser. No frame is ever uploaded.
- **Neighbourhood weather** — live `data.gov.sg` / NEA forecasts, rainfall, PM2.5 & UV,
  with canvas weather animations (sun rays, drifting clouds, rain, thunder, starfields).
- **Search & nearby** — OneMap place search + browser geolocation → nearest stops.
- **Responsive** — one column on a phone, a dashboard on a wide screen.

---

## 🏗 Architecture

```
Static frontend (GitHub Pages, this whole app)
 ├─ TensorFlow.js  (in-browser person detection)      ← no backend
 ├─ data.gov.sg / NEA  (weather)                       ← direct, no key
 ├─ OneMap  (place search)                             ← direct, no key
 └─ Vercel function  api/lta.js  ──► LTA DataMall      ← the ONE server piece
                                       (adds AccountKey header)
```

Everything is a static file **except** `api/lta.js`, a tiny serverless proxy that
holds the LTA key (which DataMall requires and which can't be exposed in the browser).

---

## 🚀 Running it

### Frontend (local)
Just serve the folder with any static server (modules aren't used, but `fetch` needs http):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`. The app works **immediately** — bus arrivals use a
realistic local generator until you connect the live proxy (below). Weather, search
and the crowd camera are already live.

### Live LTA bus data (Vercel proxy)
1. Push this repo to GitHub.
2. Import it at [vercel.com](https://vercel.com) (free Hobby plan, sign in with GitHub).
   Vercel auto-detects `/api/lta.js`.
3. (Recommended) Add an environment variable `LTA_ACCOUNT_KEY` with your key from
   [datamall.lta.gov.sg](https://datamall.lta.gov.sg/) — instant free sign-up.
4. Copy your deployment URL and set it in **`js/busApi.js`**:
   ```js
   BW.PROXY_URL = "https://<your-project>.vercel.app/api/lta";
   ```
5. Push — GitHub Pages serves the frontend, Vercel serves the proxy, both from the
   same repo with no conflict.

### Crowd camera
The **Crowd cam** page starts on a built-in *simulated* platform feed so it's alive
in any preview. Click **Use my camera** for real TensorFlow.js detection (it lazy-loads
a ~5 MB model the first time), or **Upload a clip** to run detection on your own video.

---

## 📁 Structure

```
index.html            app shell + script wiring
css/
  tokens.css          design tokens + 4 time-of-day themes
  app.css             layout, nav, glass surfaces, controls
  components.css      flip cards, crowd meter, weather, camera, map
  animations.css      keyframes + scroll-reveal
js/
  theme.js            time-of-day engine, DOM helpers, toast, reveals
  data.js             seed SG stops/services + arrival generator
  ui.js               shared component builders
  weather.js          live data.gov.sg / NEA
  weatherAnim.js      canvas weather scenes
  busApi.js           LTA proxy helper (+ mock fallback)  ← set PROXY_URL here
  location.js         geolocation + OneMap search
  crowd.js            TensorFlow.js COCO-SSD engine
  pages/{home,station,camera,about}.js
  router.js           hash router + view transitions
  app.js              bootstrap
api/lta.js            Vercel serverless proxy for LTA DataMall
vercel.json           function config
assets/wallpapers/    dawn / morning / dusk / night
```

---

## 🔒 Privacy

Camera frames are processed **only** in your browser and never stored or transmitted.
The app ships no trackers. The single server component (`api/lta.js`) only forwards
public bus-arrival requests.

---

## 📊 Data & credits

- **LTA DataMall** — real-time bus arrivals & the official Load field
- **data.gov.sg / NEA** — weather, rainfall, PM2.5, UV
- **OneMap (SLA)** — place search & geocoding
- **TensorFlow.js · COCO-SSD** — in-browser person detection

Wallpapers: "Lile Waves Dynamic" set, used as time-of-day backgrounds.
