/*!
 * bus-vfs.js — BusTech virtual filesystem for video feeds + ML readings
 * Adapted from the Sage Playground VFS (in-RAM tree, localStorage-backed,
 * pub/sub). Here it stores:
 *
 *   /feeds/<stopCode>.json   a video-source descriptor for a bus stop
 *   /readings/<stopCode>.json the latest crowd reading the ML produced
 *
 * Feed *descriptors* (url/label/type) and readings persist to localStorage.
 * Uploaded test-clip Blobs live in RAM only (object URLs), keyed separately,
 * because they're too big for localStorage and shouldn't outlive the tab.
 *
 * One shared singleton: window.BusVFS
 *
 * ───────────────────────────────────────────────────────────────────────────
 *  ▼▼▼  ATTACH YOUR VIDEO SOURCE(S) HERE  ▼▼▼
 *  Each bus-stop code maps to a live feed. We expect a streaming **WebM**
 *  (VP8/VP9) URL that a <video> element can play directly, served with CORS
 *  headers (Access-Control-Allow-Origin) so the frame can be read for ML.
 *
 *  The engine grabs ONE frame every config.SAMPLE_INTERVAL_MS (default 30s)
 *  and runs it through TensorFlow.js — see js/monitor-engine.js.
 *
 *  Live processing is OFF by default. Flip config.ENABLED = true to turn it on.
 * ───────────────────────────────────────────────────────────────────────────
 */
(function (global) {
  "use strict";

  var STORAGE_KEY = "bustech-vfs-v1";

  // ── path helpers (from Sage VFS) ───────────────────────────────────────────
  function normalize(p) {
    if (!p || p === "/") return "/";
    var parts = String(p).split("/"), out = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === "" || seg === ".") continue;
      if (seg === "..") { out.pop(); continue; }
      out.push(seg);
    }
    return "/" + out.join("/");
  }
  function parentOf(p) { p = normalize(p); if (p === "/") return "/"; var i = p.lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); }
  function baseName(p) { p = normalize(p); if (p === "/") return "/"; return p.slice(p.lastIndexOf("/") + 1); }

  // ── VFS core ────────────────────────────────────────────────────────────────
  function VFS() {
    this.nodes = Object.create(null);   // path -> {type, content, mtime}
    this.blobs = Object.create(null);   // stopCode -> { url, name } (RAM only)
    this.listeners = [];                // global change listeners
    this.readingSubs = Object.create(null); // stopCode -> [cb]
    this._saveTimer = null;
    if (!this._load()) this._seed();
  }

  VFS.prototype._emit = function () {
    for (var i = 0; i < this.listeners.length; i++) { try { this.listeners[i](); } catch (e) {} }
  };
  VFS.prototype.on = function (cb) {
    this.listeners.push(cb); var self = this;
    return function off() { var i = self.listeners.indexOf(cb); if (i >= 0) self.listeners.splice(i, 1); };
  };
  VFS.prototype._touch = function () { this._scheduleSave(); this._emit(); };
  VFS.prototype._scheduleSave = function () {
    var self = this;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(function () { self._save(); }, 350);
  };
  VFS.prototype._save = function () {
    try { if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.nodes)); }
    catch (e) {}
  };
  VFS.prototype._load = function () {
    try {
      if (!global.localStorage) return false;
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return false;
      this.nodes = parsed;
      this._ensureDir("/"); this._ensureDir("/feeds"); this._ensureDir("/readings");
      return true;
    } catch (e) { return false; }
  };
  VFS.prototype._ensureDir = function (path) {
    path = normalize(path);
    this.nodes["/"] = this.nodes["/"] || { type: "dir", mtime: Date.now() };
    if (path === "/") return;
    var segs = path.split("/").filter(Boolean), cur = "";
    for (var i = 0; i < segs.length; i++) {
      cur += "/" + segs[i];
      if (!this.nodes[cur]) this.nodes[cur] = { type: "dir", mtime: Date.now() };
    }
  };
  VFS.prototype._seed = function () {
    this.nodes = Object.create(null);
    this._ensureDir("/"); this._ensureDir("/feeds"); this._ensureDir("/readings");

    // Seed any feeds declared in BusVFS.SOURCES (see bottom of file).
    this._save();
  };

  // generic read/write (JSON nodes)
  VFS.prototype.exists = function (p) { return !!this.nodes[normalize(p)]; };
  VFS.prototype.readJSON = function (p) {
    var n = this.nodes[normalize(p)];
    if (!n || n.type !== "file") return null;
    try { return JSON.parse(n.content); } catch (e) { return null; }
  };
  VFS.prototype.writeJSON = function (p, obj) {
    p = normalize(p);
    this._ensureDir(parentOf(p));
    this.nodes[p] = { type: "file", content: JSON.stringify(obj), mtime: Date.now() };
    this._touch();
    return p;
  };
  VFS.prototype.rm = function (p) {
    p = normalize(p);
    if (!this.nodes[p]) return false;
    var prefix = p + "/", keys = Object.keys(this.nodes);
    for (var i = 0; i < keys.length; i++) if (keys[i] === p || keys[i].indexOf(prefix) === 0) delete this.nodes[keys[i]];
    this._touch(); return true;
  };
  VFS.prototype.ls = function (p) {
    p = normalize(p);
    if (!this.nodes[p] || this.nodes[p].type !== "dir") return [];
    var prefix = p === "/" ? "/" : p + "/", out = [], seen = Object.create(null), keys = Object.keys(this.nodes);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i]; if (k === p || k.indexOf(prefix) !== 0) continue;
      var rest = k.slice(prefix.length), name = rest.indexOf("/") === -1 ? rest : rest.slice(0, rest.indexOf("/"));
      if (!name || seen[name]) continue; seen[name] = true;
      out.push(prefix === "/" ? "/" + name : prefix + name);
    }
    return out;
  };

  // ── FEEDS API ───────────────────────────────────────────────────────────────
  // descriptor: { type:'webm', url:'…', label:'…', kind:'url'|'blob' }
  VFS.prototype.feedPath = function (stopCode) { return "/feeds/" + stopCode + ".json"; };

  VFS.prototype.mountFeed = function (stopCode, descriptor) {
    descriptor = descriptor || {};
    descriptor.type = descriptor.type || "webm";
    descriptor.kind = descriptor.kind || "url";
    descriptor.mountedAt = Date.now();
    this.writeJSON(this.feedPath(stopCode), descriptor);
    return descriptor;
  };

  // attach an uploaded test clip (Blob/File) — RAM only, not persisted
  VFS.prototype.mountFeedBlob = function (stopCode, file) {
    if (this.blobs[stopCode] && this.blobs[stopCode].url) {
      try { URL.revokeObjectURL(this.blobs[stopCode].url); } catch (e) {}
    }
    var url = URL.createObjectURL(file);
    this.blobs[stopCode] = { url: url, name: file.name || "test-clip" };
    this.mountFeed(stopCode, { type: "webm", kind: "blob", label: file.name || "Test clip" });
    return url;
  };

  // resolve a playable source for a stop: returns { url, descriptor } or null
  VFS.prototype.resolveFeed = function (stopCode) {
    var desc = this.readJSON(this.feedPath(stopCode));
    // a runtime test-clip blob takes precedence
    if (this.blobs[stopCode] && this.blobs[stopCode].url)
      return { url: this.blobs[stopCode].url, descriptor: desc || { type: "webm", kind: "blob", label: this.blobs[stopCode].name } };
    if (desc && desc.kind === "url" && desc.url) return { url: desc.url, descriptor: desc };
    // declared in the static SOURCES map?
    var s = BusVFS.SOURCES && BusVFS.SOURCES[stopCode];
    if (s && s.url) return { url: s.url, descriptor: s };
    return null;
  };
  VFS.prototype.hasFeed = function (stopCode) { return !!this.resolveFeed(stopCode); };
  VFS.prototype.unmountFeed = function (stopCode) {
    if (this.blobs[stopCode] && this.blobs[stopCode].url) { try { URL.revokeObjectURL(this.blobs[stopCode].url); } catch (e) {} }
    delete this.blobs[stopCode];
    this.rm(this.feedPath(stopCode));
  };

  // ── READINGS API (the ML output, interlinks all widgets) ─────────────────────
  // reading: { count, levelKey, at }
  VFS.prototype.readingPath = function (stopCode) { return "/readings/" + stopCode + ".json"; };
  VFS.prototype.publishReading = function (stopCode, reading) {
    reading = reading || {}; reading.at = reading.at || Date.now();
    this.writeJSON(this.readingPath(stopCode), reading);
    var subs = this.readingSubs[stopCode] || [];
    for (var i = 0; i < subs.length; i++) { try { subs[i](reading); } catch (e) {} }
    var any = this.readingSubs["*"] || [];
    for (var j = 0; j < any.length; j++) { try { any[j](stopCode, reading); } catch (e) {} }
    return reading;
  };
  VFS.prototype.getReading = function (stopCode) {
    var r = this.readJSON(this.readingPath(stopCode));
    if (!r) return null;
    // readings older than the freshness window are treated as stale
    if (BusVFS.config.READING_TTL_MS && Date.now() - (r.at || 0) > BusVFS.config.READING_TTL_MS) return null;
    return r;
  };
  VFS.prototype.onReading = function (stopCode, cb) {
    var key = stopCode || "*";
    (this.readingSubs[key] = this.readingSubs[key] || []).push(cb);
    var self = this;
    return function off() { var a = self.readingSubs[key], i = a ? a.indexOf(cb) : -1; if (i >= 0) a.splice(i, 1); };
  };

  VFS.prototype.normalize = normalize;

  // ── singleton + CONFIG ────────────────────────────────────────────────────────
  var BusVFS = new VFS();

  /* ╔══════════════════════════════════════════════════════════════════════╗
     ║  CONFIG — the one place to flip live ML processing on/off & tune it.   ║
     ╚══════════════════════════════════════════════════════════════════════╝ */
  BusVFS.config = {
    // ▶ Master switch for live processing of CONFIGURED feed URLs (SOURCES).
    //   Left OFF for now, as requested. Flip to true once a real WebM feed
    //   is wired up. (Uploaded test clips still process so you can verify.)
    ENABLED: false,

    // ▶ How often a frame is grabbed and run through TensorFlow.js.
    SAMPLE_INTERVAL_MS: 30000,          // 1 frame / 30 seconds

    // ▶ COCO-SSD model size — 'lite_mobilenet_v2' is fastest/smallest.
    MODEL_BASE: "lite_mobilenet_v2",

    // ▶ Minimum detection confidence to count a "person".
    PERSON_MIN_SCORE: 0.5,

    // ▶ A reading older than this is considered stale (widgets show idle).
    READING_TTL_MS: 10 * 60 * 1000,
  };

  /* ╔══════════════════════════════════════════════════════════════════════╗
     ║  SOURCES — map a bus-stop code to its live WebM feed.                  ║
     ║  Add entries like:                                                     ║
     ║    "75009": { type:"webm", kind:"url",                                 ║
     ║               url:"https://your-cdn.example/tampines-int.webm",        ║
     ║               label:"Tampines Int · Berth B3" }                        ║
     ║  Then set config.ENABLED = true above.                                 ║
     ╚══════════════════════════════════════════════════════════════════════╝ */
  BusVFS.SOURCES = {
    // (none configured yet — the monitor will say "Yet to set up video source")
  };

  global.BusVFS = BusVFS;
  global.BusVFS_class = VFS;
})(typeof window !== "undefined" ? window : globalThis);
