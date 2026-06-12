/* ============================================================
   BusWatch SG — Mock / seed data + arrival generator
   Real Singapore bus-stop codes & coordinates (LTA DataMall
   schema) so the demo feels authentic. Swapped for live LTA
   data the moment the Vercel proxy is reachable (see busApi.js).
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  // A curated set of real SG stops (BusStopCode / RoadName / Description / lat / lon)
  // Tampines-centric (default) plus a few recognisable interchanges island-wide.
  BW.STOPS = [
    { BusStopCode: "75009", RoadName: "Tampines Ctrl 1", Description: "Tampines Bus Interchange", Latitude: 1.35394, Longitude: 103.94380, services: ["10","12","18","21","27","28","29","65","72"] },
    { BusStopCode: "76059", RoadName: "Tampines Ave 4", Description: "Our Tampines Hub", Latitude: 1.35269, Longitude: 103.94099, services: ["3","8","15","23"] },
    { BusStopCode: "76069", RoadName: "Tampines Ave 5", Description: "Opp Our Tampines Hub", Latitude: 1.35316, Longitude: 103.94170, services: ["3","8","15","23"] },
    { BusStopCode: "75319", RoadName: "Tampines St 11", Description: "Blk 137", Latitude: 1.34637, Longitude: 103.93975, services: ["27","31"] },
    { BusStopCode: "76239", RoadName: "Tampines Ave 7", Description: "Tampines East Stn Exit B", Latitude: 1.35632, Longitude: 103.95475, services: ["18","28"] },
    { BusStopCode: "65009", RoadName: "Tampines Rd", Description: "Bef Hougang Ave 3", Latitude: 1.36889, Longitude: 103.89001, services: ["43","62"] },
    { BusStopCode: "65199", RoadName: "Hougang Ave 4", Description: "Hougang Central Int", Latitude: 1.37170, Longitude: 103.89260, services: ["43","62","74","81"] },
    { BusStopCode: "77009", RoadName: "Pasir Ris Dr 3", Description: "Pasir Ris Bus Interchange", Latitude: 1.37320, Longitude: 103.94920, services: ["3","12","21"] },
    { BusStopCode: "46009", RoadName: "Jurong East Ctrl", Description: "Jurong East Temp Int", Latitude: 1.33340, Longitude: 103.74160, services: ["51","66","78","79"] },
    { BusStopCode: "01012", RoadName: "Victoria St", Description: "Hotel Grand Pacific", Latitude: 1.29770, Longitude: 103.85350, services: ["7","12","32","51","63","80"] },
    { BusStopCode: "01112", RoadName: "Victoria St", Description: "Bugis Stn / Bugis Junction", Latitude: 1.29920, Longitude: 103.85580, services: ["7","12","63","80","145"] },
    { BusStopCode: "09022", RoadName: "Orchard Rd", Description: "Opp Ngee Ann City", Latitude: 1.30360, Longitude: 103.83470, services: ["7","14","16","36","124","174"] },
    { BusStopCode: "83139", RoadName: "Upp Serangoon Rd", Description: "Blk 213", Latitude: 1.36230, Longitude: 103.89230, services: ["43","62","70","81"] },
    { BusStopCode: "53009", RoadName: "Ang Mo Kio Ave 8", Description: "Ang Mo Kio Int", Latitude: 1.36970, Longitude: 103.84840, services: ["22","24","73"] },
  ];

  // Service metadata (operator / type / destination headsign)
  BW.SERVICES = {
    "3":  { op: "SBST", dest: "Pasir Ris Int" },
    "7":  { op: "SBST", dest: "Clementi Int" },
    "8":  { op: "SBST", dest: "Tampines Int" },
    "10": { op: "SBST", dest: "Tampines Int" },
    "12": { op: "SBST", dest: "Pasir Ris Int" },
    "14": { op: "SBST", dest: "Bedok Int" },
    "15": { op: "SBST", dest: "Marine Parade" },
    "16": { op: "SBST", dest: "Bedok Int" },
    "18": { op: "SMRT", dest: "Tampines Ave 5" },
    "21": { op: "SBST", dest: "Bedok Int" },
    "22": { op: "SBST", dest: "Tampines Int" },
    "23": { op: "SBST", dest: "Tampines Ave 5" },
    "24": { op: "SBST", dest: "Marsiling" },
    "27": { op: "SBST", dest: "Hougang Central" },
    "28": { op: "SBST", dest: "Pasir Ris Int" },
    "29": { op: "SBST", dest: "Tampines Int" },
    "31": { op: "SBST", dest: "Tampines Int" },
    "32": { op: "SBST", dest: "Clementi Int" },
    "36": { op: "SBST", dest: "Changi Airport" },
    "43": { op: "SBST", dest: "Marina Centre" },
    "51": { op: "SMRT", dest: "Jurong East" },
    "62": { op: "SBST", dest: "Hougang Central" },
    "63": { op: "SBST", dest: "Eunos Int" },
    "65": { op: "SBST", dest: "Tampines Int" },
    "66": { op: "SBST", dest: "Bedok Int" },
    "70": { op: "SBST", dest: "Shenton Way" },
    "72": { op: "SBST", dest: "Tampines Int" },
    "73": { op: "SBST", dest: "Ang Mo Kio Int" },
    "74": { op: "SBST", dest: "Bukit Merah Int" },
    "78": { op: "SMRT", dest: "Jurong East" },
    "79": { op: "SMRT", dest: "Boon Lay Int" },
    "80": { op: "SBST", dest: "Marine Parade" },
    "81": { op: "SBST", dest: "Eunos Int" },
    "124":{ op: "SBST", dest: "Sentosa / HarbourFront" },
    "145":{ op: "SBST", dest: "Bukit Merah Int" },
    "174":{ op: "SBST", dest: "Boon Lay Int" },
  };

  const LOADS = ["SEA", "SEA", "SEA", "SDA", "SDA", "LSD"]; // weighted toward seats
  const TYPES = ["SD", "SD", "DD", "DD", "BD"];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // Deterministic-ish per stop so reloads feel stable for ~30s, then drift.
  BW.LOAD_META = {
    SEA: { label: "Seats available", short: "Seats", tone: "quiet", icon: "armchair" },
    SDA: { label: "Standing only", short: "Standing", tone: "moderate", icon: "users" },
    LSD: { label: "Limited standing", short: "Packed", tone: "full", icon: "users" },
  };

  // Generate a plausible live arrival board for a stop.
  BW.genArrivals = function (stop) {
    const svcs = (stop.services || []).slice().sort((a, b) => (+a || 999) - (+b || 999));
    return svcs.map((svc) => {
      const meta = BW.SERVICES[svc] || { op: "SBST", dest: "—" };
      const t1 = Math.round(rand(-1, 9));
      const t2 = t1 + Math.round(rand(4, 11));
      const t3 = t2 + Math.round(rand(5, 13));
      const mk = (m) => ({
        mins: m,
        load: pick(LOADS),
        type: pick(TYPES),
        wab: Math.random() > 0.45,
      });
      return {
        ServiceNo: svc,
        Operator: meta.op,
        dest: meta.dest,
        buses: [mk(Math.max(0, t1)), mk(t2), mk(t3)],
      };
    });
  };

  // crowd level mapping for ML person-count
  BW.crowdLevel = function (count) {
    if (count <= 3) return { key: "quiet", label: "Quiet", cls: "chip-quiet", col: "var(--quiet)", pct: Math.min(100, count / 20 * 100),
      desc: "Nice and easy — plenty of room to wait comfortably." };
    if (count <= 8) return { key: "moderate", label: "Moderate", cls: "chip-moderate", col: "var(--moderate)", pct: Math.min(100, count / 20 * 100),
      desc: "A gentle buzz. You'll likely still find a spot to sit or lean." };
    if (count <= 15) return { key: "busy", label: "Busy", cls: "chip-busy", col: "var(--busy)", pct: Math.min(100, count / 20 * 100),
      desc: "Getting lively. Standing room mostly — hold onto your bag." };
    return { key: "full", label: "Crowded", cls: "chip-full", col: "var(--full)", pct: 100,
      desc: "Packed right now. Maybe let the first bus pass for a comfier ride." };
  };

  BW.haversine = function (lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  BW.nearestStops = function (lat, lon, limit = 6) {
    return BW.STOPS.map((s) => ({
      ...s,
      dist: BW.haversine(lat, lon, s.Latitude, s.Longitude),
    }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, limit);
  };

  BW.findStop = function (code) {
    return BW.STOPS.find((s) => s.BusStopCode === code) || BW.STOPS[0];
  };

  BW.DEFAULT_STOP = "75009"; // Tampines Bus Interchange

  // the stop the app is currently centred on (nearest to user, else default)
  BW.featuredStop = function () {
    const loc = BW.userLoc;
    if (loc && loc.lat) { const n = BW.nearestStops(loc.lat, loc.lon, 1)[0]; if (n) return n.BusStopCode; }
    return BW.DEFAULT_STOP;
  };
})();
