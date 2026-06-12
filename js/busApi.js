/* ============================================================
   BusWatch SG — LTA DataMall bus API helper
   Routes every call through the Vercel serverless proxy
   (api/lta.js) which injects the AccountKey header.
   If the proxy isn't configured / reachable, we transparently
   fall back to the realistic local generator so the UI is
   always alive (great for the GitHub Pages demo without keys).
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  // 👉 After deploying api/lta.js to Vercel, put your URL here:
  //    e.g. "https://buswatch-sg.vercel.app/api/lta"
  // Leave null to run purely on the local generator.
  BW.PROXY_URL = null;

  let proxyOk = !!BW.PROXY_URL;

  async function ltaFetch(path, params = {}) {
    if (!BW.PROXY_URL) throw new Error("no-proxy");
    const qs = new URLSearchParams({ path, ...params }).toString();
    const res = await fetch(`${BW.PROXY_URL}?${qs}`, { cache: "no-store" });
    if (!res.ok) throw new Error("proxy " + res.status);
    return res.json();
  }

  // Normalise an LTA v3/BusArrival response -> our arrivals shape
  function normalise(stop, raw) {
    const services = raw.Services || raw.services || [];
    const minsTo = (iso) => {
      if (!iso) return null;
      const m = Math.round((new Date(iso) - Date.now()) / 60000);
      return m;
    };
    const mapBus = (b) =>
      b && b.EstimatedArrival
        ? {
            mins: Math.max(0, minsTo(b.EstimatedArrival)),
            load: b.Load || "SEA",
            type: b.Type || "SD",
            wab: b.Feature === "WAB",
          }
        : null;
    return services
      .map((s) => {
        const meta = BW.SERVICES[s.ServiceNo] || { dest: "—" };
        return {
          ServiceNo: s.ServiceNo,
          Operator: s.Operator,
          dest: meta.dest,
          buses: [mapBus(s.NextBus), mapBus(s.NextBus2), mapBus(s.NextBus3)].filter(Boolean),
        };
      })
      .filter((s) => s.buses.length);
  }

  // Public: get arrivals for a stop. Always resolves (falls back to mock).
  BW.getArrivals = async function (stop) {
    if (BW.PROXY_URL) {
      try {
        const raw = await ltaFetch("v3/BusArrival", { BusStopCode: stop.BusStopCode });
        const norm = normalise(stop, raw);
        if (norm.length) { proxyOk = true; return { live: true, services: norm }; }
      } catch (e) {
        proxyOk = false;
      }
    }
    // fallback — realistic generator
    return { live: false, services: BW.genArrivals(stop) };
  };

  BW.proxyConfigured = () => !!BW.PROXY_URL;
  BW.proxyHealthy = () => proxyOk;

  BW.loadMeta = function (load) {
    return BW.LOAD_META[load] || BW.LOAD_META.SEA;
  };
})();
