/* ============================================================
   BusTech · DEMO 01 — Location: geolocation + fuzzy search
   Search is forgiving: it understands dropped vowels
   ("jrong wst" → Jurong West), abbreviations ("st"→street,
   "ave"→avenue, "blk"→block …), typos, and extra words
   ("Jurong West Street 81"). Local fuzzy matching runs first
   so it works offline/instantly; OneMap results are merged in
   for full addresses & postal codes when reachable.
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  const KEY = "bw_loc";
  BW.userLoc = null;
  try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && s.lat) BW.userLoc = s; } catch (e) {}

  BW.saveLoc = function (lat, lon, label) {
    BW.userLoc = { lat, lon, label: label || "Your location", at: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(BW.userLoc)); } catch (e) {}
  };

  BW.requestLocation = function () {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("unsupported"));
      navigator.geolocation.getCurrentPosition(
        (pos) => { BW.saveLoc(pos.coords.latitude, pos.coords.longitude, "Near you"); resolve(BW.userLoc); },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  };

  // ---- Curated SG places (planning areas / hubs) for offline fuzzy search ----
  const PLACES = [
    ["Jurong West", 1.3404, 103.7090], ["Jurong East", 1.3329, 103.7436],
    ["Tampines", 1.3496, 103.9568], ["Bedok", 1.3236, 103.9273],
    ["Hougang", 1.3712, 103.8926], ["Punggol", 1.4041, 103.9025],
    ["Sengkang", 1.3868, 103.8914], ["Ang Mo Kio", 1.3691, 103.8454],
    ["Bishan", 1.3526, 103.8352], ["Toa Payoh", 1.3343, 103.8563],
    ["Clementi", 1.3151, 103.7654], ["Woodlands", 1.4382, 103.7890],
    ["Yishun", 1.4304, 103.8354], ["Bukit Batok", 1.3590, 103.7637],
    ["Choa Chu Kang", 1.3840, 103.7470], ["Pasir Ris", 1.3721, 103.9474],
    ["Serangoon", 1.3554, 103.8679], ["Orchard", 1.3039, 103.8318],
    ["Bugis", 1.3007, 103.8559], ["Marina Bay", 1.2806, 103.8540],
    ["Changi Airport", 1.3592, 103.9894], ["Boon Lay", 1.3387, 103.7060],
    ["Bukit Panjang", 1.3774, 103.7719], ["Geylang", 1.3201, 103.8918],
    ["Kallang", 1.3100, 103.8714], ["Queenstown", 1.2942, 103.8059],
    ["Bukit Merah", 1.2819, 103.8239], ["Novena", 1.3203, 103.8439],
    ["Sembawang", 1.4491, 103.8200], ["Tiong Bahru", 1.2862, 103.8270],
    ["Paya Lebar", 1.3177, 103.8924], ["Eunos", 1.3197, 103.9030],
    ["Dover", 1.3113, 103.7786], ["Marsiling", 1.4326, 103.7740],
    ["Redhill", 1.2896, 103.8167], ["Outram", 1.2803, 103.8398],
    ["City Hall", 1.2931, 103.8520], ["Raffles Place", 1.2839, 103.8515],
    ["HarbourFront", 1.2653, 103.8220], ["Sentosa", 1.2494, 103.8303],
    ["Little India", 1.3066, 103.8492], ["Chinatown", 1.2844, 103.8443],
    ["Lavender", 1.3074, 103.8629], ["MacPherson", 1.3266, 103.8900],
    ["Ubi", 1.3299, 103.8997], ["Tanah Merah", 1.3274, 103.9463],
    ["Simei", 1.3434, 103.9534], ["Expo", 1.3354, 103.9617],
    ["Kembangan", 1.3210, 103.9128], ["Commonwealth", 1.3026, 103.7984],
    ["Buona Vista", 1.3071, 103.7902], ["one-north", 1.2997, 103.7870],
    ["Mountbatten", 1.3061, 103.8826], ["Dakota", 1.3082, 103.8884],
    ["Potong Pasir", 1.3313, 103.8686], ["Braddell", 1.3404, 103.8466],
    ["Marymount", 1.3489, 103.8390], ["Caldecott", 1.3376, 103.8395],
    ["Farrer Park", 1.3124, 103.8541], ["Boon Keng", 1.3194, 103.8616],
    ["Jalan Besar", 1.3060, 103.8556], ["Bukit Timah", 1.3294, 103.8021],
    ["Newton", 1.3138, 103.8383], ["Somerset", 1.3007, 103.8388],
    ["Telok Blangah", 1.2706, 103.8096], ["Pioneer", 1.3376, 103.6974],
    ["Kranji", 1.4252, 103.7620], ["Admiralty", 1.4406, 103.8010],
  ].map(([name, lat, lon]) => ({ name, lat, lon, kind: "area" }));

  // ---- abbreviation expansion (token-level) ----
  const ABBR = {
    st: "street", str: "street", ave: "avenue", av: "avenue", rd: "road",
    blk: "block", jln: "jalan", jl: "jalan", dr: "drive", cl: "close",
    cres: "crescent", ctrl: "central", ct: "court", sq: "square",
    upp: "upper", lor: "lorong", tg: "tanjong", bt: "bukit", pk: "park",
    cck: "choa chu kang", amk: "ang mo kio", tpy: "toa payoh", int: "interchange",
    stn: "station", mrt: "station", pl: "place", ter: "terrace", gdns: "gardens",
  };

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function tokens(s) {
    return norm(s).split(" ").filter(Boolean).map((t) => ABBR[t] || t);
  }
  // is `a` a subsequence of `b`? (catches dropped vowels: "wst" ⊂ "west")
  function subseq(a, b) {
    if (!a.length) return false;
    let i = 0;
    for (let j = 0; j < b.length && i < a.length; j++) if (b[j] === a[i]) i++;
    return i === a.length;
  }
  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      [prev, cur] = [cur, prev];
    }
    return prev[n];
  }
  // score one query token against one candidate token (0..1)
  function tokScore(q, c) {
    if (!q || !c) return 0;
    if (c === q) return 1;
    // ignore very short candidate tokens (e.g. "b", "3") for partial matches
    if (c.length >= 3 && c.startsWith(q) && q.length >= 2) return 0.95;
    if (q.length >= 3 && c.length >= 3 && q.startsWith(c)) return 0.8;
    if (c.length >= 3 && q.length >= 2 && subseq(q, c)) return 0.82 - Math.min(0.2, (c.length - q.length) * 0.03);
    if (c.length >= 4 && q.length >= 3 && c.includes(q)) return 0.7;
    if (q.length >= 3 && c.length >= 3) {
      const d = lev(q, c), ratio = 1 - d / Math.max(q.length, c.length);
      if (ratio >= 0.6) return ratio * 0.78;
    }
    return 0;
  }
  // overall match score of a query against a candidate name (0..1)
  function matchScore(qToks, cToks) {
    if (!qToks.length) return 0;
    let sum = 0, matched = 0;
    for (const q of qToks) {
      let best = 0;
      for (const c of cToks) best = Math.max(best, tokScore(q, c));
      if (best >= 0.55) matched++;
      sum += best;
    }
    const avg = sum / qToks.length;
    const coverage = matched / qToks.length;
    // reward first-token prefix match (people type the area first)
    const lead = cToks.length && tokScore(qToks[0], cToks[0]) >= 0.8 ? 0.08 : 0;
    return avg * 0.7 + coverage * 0.3 + lead;
  }

  // local fuzzy results across PLACES + our seed STOPS
  function localSearch(q) {
    const qToks = tokens(q);
    if (!qToks.length) return [];
    const cands = [];
    PLACES.forEach((p) => cands.push({ name: p.name, addr: "Singapore", lat: p.lat, lon: p.lon, toks: tokens(p.name) }));
    (BW.STOPS || []).forEach((s) =>
      cands.push({ name: s.Description, addr: s.RoadName, lat: s.Latitude, lon: s.Longitude, toks: tokens(s.Description + " " + s.RoadName) }));
    return cands
      .map((c) => ({ c, score: matchScore(qToks, c.toks) }))
      .filter((x) => x.score >= 0.5)
      .sort((a, b) => b.score - a.score)
      .map((x) => ({ name: x.c.name, addr: x.c.addr, lat: x.c.lat, lon: x.c.lon, score: x.score }));
  }

  // OneMap geocode (full addresses / postal codes), best-effort
  async function oneMap(q) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 2500);
      const url = "https://www.onemap.gov.sg/api/common/elastic/search?searchVal=" +
        encodeURIComponent(q) + "&returnGeom=Y&getAddrDetails=Y&pageNum=1";
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error("onemap " + r.status);
      const d = await r.json();
      return (d.results || []).map((x) => ({
        name: x.SEARCHVAL, addr: x.ADDRESS || x.ROAD_NAME || "Singapore",
        lat: parseFloat(x.LATITUDE), lon: parseFloat(x.LONGITUDE), score: 0.6,
      })).filter((x) => isFinite(x.lat));
    } catch (e) { return []; }
  }

  BW.searchPlaces = async function (q) {
    q = (q || "").trim();
    if (q.length < 2) return [];
    const local = localSearch(q);
    const remote = await oneMap(q);

    // merge, de-dupe by normalised name, keep best score, sort by score
    const seen = new Map();
    [...local, ...remote].forEach((r) => {
      const k = norm(r.name);
      if (!seen.has(k) || seen.get(k).score < r.score) seen.set(k, r);
    });
    return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  };

  BW.debounce = function (fn, ms) {
    let t;
    return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };
})();
