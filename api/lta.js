// ============================================================
// BusWatch SG — LTA DataMall proxy (Vercel serverless function)
// ------------------------------------------------------------
// Why this exists: LTA DataMall requires a private AccountKey
// header and does NOT send CORS headers, so the browser cannot
// call it directly from GitHub Pages. This one tiny function
// holds the key server-side and forwards the request.
//
// Deploy: connect your GitHub repo to Vercel (free Hobby tier).
// Vercel auto-detects the /api folder — every `git push` ships it.
// Your endpoint becomes:  https://<project>.vercel.app/api/lta
// Then set BW.PROXY_URL to that in js/busApi.js.
//
// Usage from the frontend:
//   /api/lta?path=v3/BusArrival&BusStopCode=75009
//   /api/lta?path=BusStops&$skip=0
// ============================================================

// Prefer an env var (Settings → Environment Variables on Vercel).
// The fallback is a school-issued throwaway key that expires after
// the demo — replace it or, better, leave it blank and set the env var.
const LTA_ACCOUNT_KEY =
  process.env.LTA_ACCOUNT_KEY || "e2Jpae+AQT2eamRi1Xot9w==";

const LTA_BASE = "https://datamall2.mytransport.sg/ltaodataservice/";

export default async function handler(req, res) {
  // CORS — open for the demo; lock to your Pages origin for production.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { path, ...query } = req.query;
  if (!path) return res.status(400).json({ error: "Missing ?path param" });

  const params = new URLSearchParams(query).toString();
  const url = `${LTA_BASE}${path}${params ? "?" + params : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: { AccountKey: LTA_ACCOUNT_KEY, accept: "application/json" },
    });
    const text = await upstream.text();
    // pass through JSON (or wrap non-JSON in an error envelope)
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    return res.status(upstream.status).send(text);
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Upstream LTA request failed", detail: String(err) });
  }
}
