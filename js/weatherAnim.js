/* ============================================================
   BusWatch SG — Canvas weather animations
   Subtle, GPU-light scenes that sit behind the weather card.
   BW.mountWeatherAnim(container, kind) -> { destroy() }
   kinds: sunny · clear-night · partly · cloudy · rain · thunder · haze
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  BW.mountWeatherAnim = function (container, kind) {
    container.innerHTML = "";
    const canvas = document.createElement("canvas");
    canvas.className = "weather-anim-canvas";
    canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const r = container.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const rnd = (a, b) => a + Math.random() * (b - a);
    let raf, t0 = performance.now(), running = true, flash = 0, nextFlash = rnd(1500, 4000);

    // ---- scene state ----
    const clouds = [];
    const drops = [];
    const stars = [];
    const motes = [];
    function initClouds(n) {
      for (let i = 0; i < n; i++)
        clouds.push({ x: rnd(0, W), y: rnd(H * 0.08, H * 0.5), s: rnd(0.6, 1.4), v: rnd(4, 12), o: rnd(0.1, 0.26) });
    }
    function initDrops(n) {
      for (let i = 0; i < n; i++)
        drops.push({ x: rnd(0, W), y: rnd(0, H), len: rnd(10, 22), v: rnd(380, 620), o: rnd(0.15, 0.4) });
    }
    function initStars(n) {
      for (let i = 0; i < n; i++)
        stars.push({ x: rnd(0, W), y: rnd(0, H * 0.7), r: rnd(0.5, 1.6), tw: rnd(0, 6.28), sp: rnd(1.5, 3.5) });
    }
    function initMotes(n) {
      for (let i = 0; i < n; i++)
        motes.push({ x: rnd(0, W), y: rnd(0, H), r: rnd(14, 46), v: rnd(3, 9), o: rnd(0.03, 0.09) });
    }

    const wet = kind === "rain" || kind === "thunder";
    if (kind === "cloudy" || kind === "partly" || wet) initClouds(kind === "partly" ? 3 : 5);
    if (wet) initDrops(kind === "thunder" ? 150 : 120);
    if (kind === "clear-night") initStars(70);
    if (kind === "haze") initMotes(26);

    function cloud(c) {
      ctx.save();
      ctx.globalAlpha = c.o;
      ctx.fillStyle = "#ffffff";
      const s = c.s, x = c.x, y = c.y;
      [[0, 0, 34], [30, 6, 26], [-30, 6, 26], [14, -12, 24], [-14, -10, 22]].forEach(([dx, dy, r]) => {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, 6.2832);
        ctx.fill();
      });
      ctx.restore();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - t0) / 1000);
      t0 = now;
      ctx.clearRect(0, 0, W, H);

      // sun / moon glow
      if (kind === "sunny" || kind === "partly") {
        const cx = W * 0.8, cy = H * 0.28, R = Math.min(W, H) * 0.5;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, "rgba(255,214,120,0.55)");
        g.addColorStop(0.4, "rgba(255,196,90,0.18)");
        g.addColorStop(1, "rgba(255,196,90,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // rotating rays
        if (kind === "sunny") {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((now / 1000) * 0.12);
          ctx.globalAlpha = 0.16;
          ctx.strokeStyle = "#ffe7a8";
          ctx.lineWidth = 3;
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * 6.2832;
            const r1 = R * 0.42, r2 = R * (0.62 + 0.06 * Math.sin(now / 600 + i));
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
            ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      if (kind === "clear-night") {
        const cx = W * 0.82, cy = H * 0.26, R = Math.min(W, H) * 0.45;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, "rgba(220,228,255,0.4)");
        g.addColorStop(1, "rgba(220,228,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        stars.forEach((s) => {
          s.tw += dt * s.sp;
          ctx.globalAlpha = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin(s.tw));
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.2832); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // clouds drift
      clouds.forEach((c) => {
        c.x += c.v * dt;
        if (c.x - 70 > W) c.x = -70;
        cloud(c);
      });

      // rain
      if (wet) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.4;
        drops.forEach((d) => {
          d.y += d.v * dt;
          d.x += d.v * dt * 0.16;
          if (d.y > H) { d.y = -d.len; d.x = rnd(0, W); }
          ctx.globalAlpha = d.o;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - 2.6, d.y - d.len);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      }

      // thunder flash
      if (kind === "thunder") {
        nextFlash -= dt * 1000;
        if (nextFlash <= 0) { flash = 1; nextFlash = rnd(2500, 6000); }
        if (flash > 0) {
          ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
          ctx.fillRect(0, 0, W, H);
          flash -= dt * 3.2;
          if (flash < 0) flash = 0;
        }
      }

      // haze motes
      if (kind === "haze") {
        motes.forEach((m) => {
          m.x += m.v * dt;
          if (m.x - m.r > W) m.x = -m.r;
          ctx.globalAlpha = m.o;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, 6.2832); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      if (running) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // pause when tab hidden
    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); }
    };
    document.addEventListener("visibilitychange", onVis);

    return {
      destroy() {
        running = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        container.innerHTML = "";
      },
    };
  };
})();
