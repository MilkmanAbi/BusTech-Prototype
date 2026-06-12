/* ============================================================
   BusTech · DEMO 01 — Monitor engine
   Plays a configured WebM feed and, once every
   config.SAMPLE_INTERVAL_MS (30s), grabs a single frame and
   runs it through TensorFlow.js (COCO-SSD) to count people.
   It draws NO boxes — the rider just sees the plain feed while
   the model quietly decides quiet ↔ crowded. Each reading is
   published to BusVFS so every widget can react.

   TF.js + COCO-SSD are lazy-loaded the first time a frame is
   actually processed (keeps the rest of the app light).
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  // --- lazy library + model loading ---
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-bw="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src; s.async = true; s.dataset.bw = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }
  let libsPromise = null;
  function ensureLibs() {
    if (libsPromise) return libsPromise;
    libsPromise = (async () => {
      if (!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
      if (!window.cocoSsd) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
    })();
    return libsPromise;
  }
  let modelPromise = null;
  function loadModel() {
    if (modelPromise) return modelPromise;
    modelPromise = (async () => {
      await ensureLibs();
      if (!window.cocoSsd) throw new Error("coco-ssd unavailable");
      return window.cocoSsd.load({ base: BusVFS.config.MODEL_BASE });
    })();
    return modelPromise;
  }

  // Create a monitor bound to a stage element + a stop/feed id.
  // opts: { stage, feedId, label, onReading(reading), onStatus(state,msg) }
  BW.createMonitor = function (opts) {
    const stage = opts.stage;
    const feedId = opts.feedId;
    const onReading = opts.onReading || function () {};
    const onStatus = opts.onStatus || function () {};

    let video = null, model = null, timer = null, destroyed = false, processing = false;

    function buildVideo(url, isBlob) {
      const v = document.createElement("video");
      v.muted = true; v.playsInline = true; v.autoplay = true; v.loop = true;
      if (!isBlob) v.crossOrigin = "anonymous"; // needed to read frames for ML
      v.src = url;
      return v;
    }

    async function sampleOnce() {
      if (destroyed || processing || !video) return;
      if (video.readyState < 2) return; // not enough data yet
      processing = true;
      try {
        if (!model) { onStatus("loading", "Loading detection model…"); model = await loadModel(); }
        const preds = await model.detect(video, 20);
        const n = preds.filter((p) => p.class === "person" && p.score >= BusVFS.config.PERSON_MIN_SCORE).length;
        const lvl = BW.crowdLevel(n);
        const reading = { count: n, levelKey: lvl.key, at: Date.now(), source: "ml" };
        BusVFS.publishReading(feedId, reading);
        onReading(reading);
        onStatus("live", "Live · " + lvl.label);
      } catch (e) {
        onStatus("error", "Couldn't read this frame (CORS or codec). See console.");
        // eslint-disable-next-line no-console
        console.warn("[BusTech monitor] frame read failed:", e);
      } finally {
        processing = false;
      }
    }

    function startLoop() {
      clearInterval(timer);
      // first read shortly after playback begins, then every interval
      setTimeout(sampleOnce, 1200);
      timer = setInterval(sampleOnce, BusVFS.config.SAMPLE_INTERVAL_MS);
    }

    function mountVideo(url, isBlob) {
      teardownVideo();
      video = buildVideo(url, isBlob);
      stage.insertBefore(video, stage.firstChild);
      video.addEventListener("playing", startLoop, { once: true });
      video.play().catch(() => { /* autoplay may need the loop to retry */ startLoop(); });
    }
    function teardownVideo() {
      clearInterval(timer);
      if (video) { try { video.pause(); } catch (e) {} video.remove(); video = null; }
    }

    const api = {
      // resolve a configured/blob source and (if allowed) start processing
      startConfigured() {
        const resolved = BusVFS.resolveFeed(feedId);
        if (!resolved) { onStatus("idle", "Yet to set up video source"); return false; }
        const isBlob = resolved.descriptor && resolved.descriptor.kind === "blob";
        // live URL feeds are gated by the master switch; test clips always run
        if (!isBlob && !BusVFS.config.ENABLED) {
          onStatus("paused", "Source linked · live processing is off in config");
          return false;
        }
        onStatus("connecting", "Connecting to feed…");
        mountVideo(resolved.url, isBlob);
        return true;
      },
      // attach an uploaded test clip and process it now
      attachTestClip(file) {
        BusVFS.mountFeedBlob(feedId, file);
        onStatus("connecting", "Reading test clip…");
        mountVideo(BusVFS.resolveFeed(feedId).url, true);
      },
      hasSource() { return BusVFS.hasFeed(feedId); },
      stop() { teardownVideo(); },
      destroy() { destroyed = true; teardownVideo(); },
    };
    return api;
  };
})();
