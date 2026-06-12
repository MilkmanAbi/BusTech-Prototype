/* ============================================================
   BusTech · DEMO 01 — Full-app sky FX (rain + wind)
   Fine grey diagonal streaks from top-right to bottom-left
   (~45°) with gusting wind. Mounted once; activated by
   BW.setSkyFX(kind). Pauses when the tab is hidden.
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  let canvas, ctx, raf, running = false, kind = "none";
  let W = 0, H = 0, dpr = 1, t0 = 0;
  let drops = [], gust = 0, gustTarget = 0, flash = 0, nextFlash = 2600;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function ensure() {
    if (canvas) return;
    const host = document.getElementById("sky-fx");
    if (!host) return;
    canvas = document.createElement("canvas");
    ctx = canvas.getContext("2d");
    host.appendChild(canvas);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    resize();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else if (kind === "rain" || kind === "thunder") start();
    });
  }
  function resize() {
    if (!canvas) return;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function seed(n) {
    drops = [];
    for (let i = 0; i < n; i++) drops.push(mk(true));
  }
  function mk(spread) {
    return {
      x: rnd(-0.2 * W, 1.2 * W),
      y: spread ? rnd(-H, H) : rnd(-H * 0.2, -10),
      len: rnd(14, 30),
      v: rnd(900, 1500),     // px/s downward
      o: rnd(0.10, 0.30),
      w: rnd(0.8, 1.6),
    };
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - t0) / 1000); t0 = now;
    ctx.clearRect(0, 0, W, H);

    // wind gusts drift the angle a little
    gust += (gustTarget - gust) * Math.min(1, dt * 1.5);
    if (Math.random() < 0.01) gustTarget = rnd(0.5, 1.15); // horizontal factor
    const ang = 0.62 + gust * 0.18; // ~45° base, leaning with gusts

    ctx.lineCap = "round";
    for (const d of drops) {
      d.y += d.v * dt;
      d.x -= d.v * dt * ang;          // moves LEFT as it falls → top-right to bottom-left
      if (d.y > H + 30 || d.x < -40) Object.assign(d, mk(false), { x: rnd(0, 1.3 * W) });
      ctx.strokeStyle = `rgba(200,210,225,${d.o})`;
      ctx.lineWidth = d.w;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.len * ang, d.y - d.len);
      ctx.stroke();
    }

    // thunder flash
    if (kind === "thunder") {
      nextFlash -= dt * 1000;
      if (nextFlash <= 0) { flash = 1; nextFlash = rnd(3000, 7000); }
      if (flash > 0) {
        ctx.fillStyle = `rgba(220,228,255,${flash * 0.32})`;
        ctx.fillRect(0, 0, W, H);
        flash -= dt * 2.6; if (flash < 0) flash = 0;
      }
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    running = true; t0 = performance.now(); raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false; cancelAnimationFrame(raf);
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  // public: set the whole-app weather mode
  BW.setSkyFX = function (k) {
    ensure();
    document.documentElement.setAttribute("data-wx", k || "none");
    kind = k || "none";
    if (kind === "rain" || kind === "thunder") {
      const dense = kind === "thunder" ? 260 : 200;
      if (!canvas) return;
      seed(Math.round(dense * Math.max(0.6, Math.min(2, (W * H) / (1280 * 800)))));
      start();
    } else {
      stop();
    }
  };
})();
