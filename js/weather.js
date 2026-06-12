/* ============================================================
   BusWatch SG — Weather (live data.gov.sg / NEA, no key)
   CORS-friendly: called straight from the browser.
   Falls back to a pleasant synthesized reading if offline.
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});
  const BASE = "https://api.data.gov.sg/v1/environment";
  const CACHE_MS = 8 * 60 * 1000;
  let cache = null;
  let cacheAt = 0;

  // Map an NEA forecast string -> { kind (for animation), icon (lucide), label }
  BW.classifyWeather = function (txt) {
    const t = (txt || "").toLowerCase();
    if (/thunder/.test(t)) return { kind: "thunder", icon: "cloud-lightning", label: txt || "Thundery Showers" };
    if (/heavy (rain|shower)/.test(t)) return { kind: "rain", icon: "cloud-rain-wind", label: txt };
    if (/(rain|shower|drizzle)/.test(t)) return { kind: "rain", icon: "cloud-rain", label: txt };
    if (/(hazy|haze|mist|fog)/.test(t)) return { kind: "haze", icon: "cloud-fog", label: txt };
    if (/windy/.test(t)) return { kind: "cloudy", icon: "wind", label: txt };
    if (/partly cloudy/.test(t)) return { kind: "partly", icon: "cloud-sun", label: "Partly Cloudy" };
    if (/cloudy|overcast/.test(t)) return { kind: "cloudy", icon: "cloud", label: "Cloudy" };
    if (/fair|sunny|clear|warm/.test(t)) {
      const night = (BW.currentTheme && BW.currentTheme()) === "night";
      return { kind: night ? "clear-night" : "sunny", icon: night ? "moon" : "sun", label: night ? "Clear" : "Fair" };
    }
    return { kind: "partly", icon: "cloud-sun", label: txt || "Partly Cloudy" };
  };

  function nearest(items, lat, lon, latKey, lonKey) {
    let best = null, bd = Infinity;
    items.forEach((it) => {
      const la = latKey ? it[latKey] : it.label_location.latitude;
      const lo = lonKey ? it[lonKey] : it.label_location.longitude;
      if (la == null || lo == null) return;
      const d = BW.haversine(lat, lon, +la, +lo);
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  }

  async function safeJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("http " + r.status);
    return r.json();
  }

  // Synthesized fallback that feels alive & matches the sky
  function fallback(lat, lon) {
    const theme = (BW.currentTheme && BW.currentTheme()) || "morning";
    const map = {
      dawn:    { cond: "Partly Cloudy", temp: 26 },
      morning: { cond: "Fair", temp: 31 },
      dusk:    { cond: "Passing Showers", temp: 28 },
      night:   { cond: "Cloudy", temp: 27 },
    };
    const m = map[theme] || map.morning;
    const cls = BW.classifyWeather(m.cond);
    return {
      live: false,
      area: "Singapore",
      temp: m.temp,
      humidity: 78,
      cond: cls.label,
      kind: cls.kind,
      icon: cls.icon,
      pm25: 32,
      uv: theme === "morning" ? 8 : theme === "dawn" ? 3 : 1,
      rainfall: m.cond.includes("Shower") ? 0.4 : 0,
      strip: synthStrip(cls),
    };
  }

  function synthStrip(cls) {
    const hours = [];
    const now = new Date();
    for (let i = 1; i <= 4; i++) {
      const d = new Date(now.getTime() + i * 2 * 3600 * 1000);
      hours.push({
        t: d.toLocaleTimeString("en-SG", { hour: "numeric", hour12: true }).replace(":00", ""),
        icon: cls.icon,
        v: "",
      });
    }
    return hours;
  }

  BW.getWeather = async function (lat, lon) {
    lat = lat || 1.35394; lon = lon || 103.9438;
    if (cache && Date.now() - cacheAt < CACHE_MS && cache._lat === lat) return cache;

    try {
      const [fc, temp, hum, pm, uv, rain, fc24] = await Promise.allSettled([
        safeJson(`${BASE}/2-hour-weather-forecast`),
        safeJson(`${BASE}/air-temperature`),
        safeJson(`${BASE}/relative-humidity`),
        safeJson(`${BASE}/pm25`),
        safeJson(`${BASE}/uv-index`),
        safeJson(`${BASE}/rainfall`),
        safeJson(`${BASE}/24-hour-weather-forecast`),
      ]);

      // condition: nearest area
      let area = "Singapore", condTxt = "Fair";
      if (fc.status === "fulfilled" && fc.value.area_metadata) {
        const meta = nearest(fc.value.area_metadata, lat, lon);
        const farr = fc.value.items?.[0]?.forecasts || [];
        if (meta) {
          area = meta.name;
          const found = farr.find((f) => f.area === meta.name);
          if (found) condTxt = found.forecast;
        }
      }
      const cls = BW.classifyWeather(condTxt);

      // temperature: nearest station reading
      let t = 30;
      if (temp.status === "fulfilled") {
        const st = temp.value.metadata?.stations || [];
        const rd = temp.value.items?.[0]?.readings || [];
        const ns = nearest(st.map(s => ({ ...s, lat: s.location.latitude, lon: s.location.longitude })), lat, lon, "lat", "lon");
        if (ns) { const r = rd.find((x) => x.station_id === ns.id); if (r) t = r.value; }
        else if (rd.length) t = rd.reduce((a, b) => a + b.value, 0) / rd.length;
      }

      // humidity
      let humidity = 78;
      if (hum.status === "fulfilled") {
        const rd = hum.value.items?.[0]?.readings || [];
        if (rd.length) humidity = Math.round(rd.reduce((a, b) => a + b.value, 0) / rd.length);
      }
      // pm2.5 (regional avg)
      let pm25 = 28;
      if (pm.status === "fulfilled") {
        const rr = pm.value.items?.[0]?.readings?.pm25_one_hourly;
        if (rr) { const vals = Object.values(rr); pm25 = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length); }
      }
      // uv (latest)
      let uvv = 0;
      if (uv.status === "fulfilled") {
        const idx = uv.value.items?.[0]?.index;
        if (idx && idx.length) uvv = idx[0].value;
      }
      // rainfall nearest
      let rainfall = 0;
      if (rain.status === "fulfilled") {
        const st = rain.value.metadata?.stations || [];
        const rd = rain.value.items?.[0]?.readings || [];
        const ns = nearest(st.map(s => ({ ...s, lat: s.location.latitude, lon: s.location.longitude })), lat, lon, "lat", "lon");
        if (ns) { const r = rd.find((x) => x.station_id === ns.id); if (r) rainfall = r.value; }
      }

      // strip from 24h forecast periods
      let strip = synthStrip(cls);
      if (fc24.status === "fulfilled") {
        const periods = fc24.value.items?.[0]?.periods || [];
        if (periods.length) {
          strip = periods.slice(0, 4).map((p) => {
            const c = BW.classifyWeather(p.regions?.central || p.regions?.east || "");
            const start = new Date(p.time.start);
            return {
              t: start.toLocaleTimeString("en-SG", { hour: "numeric", hour12: true }).replace(":00", ""),
              icon: c.icon,
              v: "",
            };
          });
        }
      }

      cache = {
        _lat: lat,
        live: true,
        area,
        temp: Math.round(t),
        humidity,
        cond: cls.label,
        kind: cls.kind,
        icon: cls.icon,
        pm25,
        uv: uvv,
        rainfall,
        strip,
      };
      cacheAt = Date.now();
      return cache;
    } catch (e) {
      const f = fallback(lat, lon);
      f._lat = lat;
      return f;
    }
  };

  BW.pmLabel = (v) => (v <= 55 ? "Good" : v <= 150 ? "Moderate" : "Unhealthy");
  BW.uvLabel = (v) => (v <= 2 ? "Low" : v <= 5 ? "Moderate" : v <= 7 ? "High" : v <= 10 ? "Very High" : "Extreme");

  // map a weather kind -> the looping GIF used as the widget background
  BW.wxGif = function (kind) {
    if (kind === "rain" || kind === "thunder") return "assets/weather/rainy.gif";
    if (kind === "sunny" || kind === "partly") return "assets/weather/sunny.gif";
    if (kind === "cloudy" || kind === "haze") return "assets/weather/cloudy.gif";
    if (kind === "clear-night") return null; // keep the night wallpaper showing through
    return "assets/weather/cloudy.gif";
  };

  // apply the full-app atmosphere for a weather reading (rain dims + streaks)
  BW.applyWeatherMood = function (w) {
    if (!w || !BW.setSkyFX) return;
    BW.setSkyFX(w.kind === "thunder" ? "thunder" : w.kind === "rain" ? "rain" : w.kind === "haze" ? "haze" : "none");
  };
})();
