# BusWatch SG (˶ᵔ ᵕ ᵔ˶)

A calm web app for Singapore bus stops. Real-time arrivals, how packed each bus is, neighbourhood weather, and an on-device AI read of how busy the platform looks. Frosted-glass cards over hand-painted wave wallpapers that drift dawn -> morning -> dusk -> night with the actual time of day.

Built for BusTech SG in plain HTML / CSS / JS, no framework, so it stays fast on an old phone.

---

## Features

- **Time-of-day skies** - four wallpapers cross-fade by the clock.
- **Live arrivals as flip cards** - tap to flip for operator, vehicle type, accessibility, and the next few buses. LTA's Load field shows seats / standing / packed.
- **On-device crowd AI** - TensorFlow.js + COCO-SSD count people on the live camera, all in your browser. No frame leaves the device.
- **Neighbourhood weather** - live data.gov.sg / NEA forecasts, rainfall, PM2.5 and UV, with canvas animations (sun rays, drifting clouds, rain, thunder, starfields).
- **Search and nearby** - OneMap place search + geolocation -> nearest stops.
- **Responsive** - one column on a phone, a dashboard on a wide screen.

---

## Architecture

```
Static frontend (GitHub Pages, the whole app)
 ├─ TensorFlow.js      in-browser person detection     no backend
 ├─ data.gov.sg / NEA  weather                          direct, no key
 ├─ OneMap             place search                     direct, no key
 └─ Vercel function    api/lta.js  ──► LTA DataMall     the one server piece
                                       (adds AccountKey header)
```

Everything's static except `api/lta.js`, a tiny serverless proxy holding the LTA key. DataMall requires it and it can't sit in the browser.

---

## Running it

### Frontend (local)

Serve the folder with any static server (`fetch` needs http):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:8080`. Works immediately - arrivals use a local generator until you wire up the live proxy. Weather, search and the crowd cam are already live.

### Live LTA bus data (Vercel proxy)

1. Push the repo to GitHub.
2. Import it at vercel.com (free Hobby plan, GitHub sign-in). It auto-detects `/api/lta.js`.
3. Add env var `LTA_ACCOUNT_KEY` with your key from datamall.lta.gov.sg (free signup).
4. Set your deployment URL in `js/busApi.js`:
   ```js
   BW.PROXY_URL = "https://<your-project>.vercel.app/api/lta";
   ```
5. Push. Pages serves the frontend, Vercel serves the proxy, same repo, no conflict.

### Crowd camera

The Crowd cam page opens on a simulated feed so it's alive in any preview. Hit **Use my camera** for real detection (lazy-loads a ~5 MB model first time), or **Upload a clip** to run it on your own video.

---

## Structure

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
  busApi.js           LTA proxy helper (+ mock fallback)   set PROXY_URL here
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

## Privacy

Camera frames are processed only in your browser, never stored or sent. No trackers. The one server piece (`api/lta.js`) just forwards public bus-arrival requests.

---

## Data and credits

- **LTA DataMall** - real-time arrivals + the official Load field
- **data.gov.sg / NEA** - weather, rainfall, PM2.5, UV
- **OneMap (SLA)** - place search + geocoding
- **TensorFlow.js / COCO-SSD** - in-browser person detection

Wallpapers: "Lile Waves Dynamic" set, used as time-of-day backgrounds.
