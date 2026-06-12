/* ============================================================
   BusWatch SG — Theme engine (time-of-day) + tiny helpers
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  // ---- DOM helpers ----
  BW.el = function (tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") e.className = attrs[k];
        else if (k === "html") e.innerHTML = attrs[k];
        else if (k === "text") e.textContent = attrs[k];
        else if (k.startsWith("on") && typeof attrs[k] === "function")
          e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      }
    }
    if (children != null) {
      (Array.isArray(children) ? children : [children]).forEach((c) => {
        if (c == null) return;
        e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return e;
  };
  BW.$ = (s, r) => (r || document).querySelector(s);
  BW.$$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // refresh lucide icons (idempotent)
  BW.icons = function () {
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons({ attrs: { "stroke-width": 2 } });
    }
  };

  // ---- Time-of-day theme ----
  // dawn 03 (05-08) · morning 02 (08-17) · dusk 01 (17-20) · night 00 (20-05)
  const THEMES = {
    dawn:    { wp: "dawn",    icon: "sunrise",     label: "Dawn",    greet: "Rise and shine" },
    morning: { wp: "morning", icon: "sun",         label: "Morning", greet: "Good morning" },
    dusk:    { wp: "dusk",    icon: "sunset",      label: "Dusk",    greet: "Good evening" },
    night:   { wp: "night",   icon: "moon-star",   label: "Night",   greet: "Good night" },
  };

  BW.themeForHour = function (h) {
    if (h >= 5 && h < 8) return "dawn";
    if (h >= 8 && h < 17) return "morning";
    if (h >= 17 && h < 20) return "dusk";
    return "night";
  };

  let current = null;
  BW.applyTheme = function (force) {
    const h = new Date().getHours();
    const key = force || BW.themeForHour(h);
    if (key === current) return key;
    current = key;
    document.documentElement.setAttribute("data-theme", key);

    // cross-fade wallpaper layers
    BW.$$(".wp-layer").forEach((l) =>
      l.classList.toggle("is-active", l.dataset.wp === THEMES[key].wp)
    );

    // theme pill
    const pill = BW.$("#theme-pill");
    if (pill) {
      pill.innerHTML =
        `<i data-lucide="${THEMES[key].icon}"></i><span class="lbl">${THEMES[key].label}</span>`;
      BW.icons();
    }
    document.dispatchEvent(new CustomEvent("bw:theme", { detail: { key } }));
    return key;
  };

  BW.currentTheme = () => current;
  BW.themeMeta = () => THEMES[current];
  BW.greeting = function () {
    const h = new Date().getHours();
    const key = BW.themeForHour(h);
    return THEMES[key].greet;
  };

  BW.dateLine = function () {
    return new Date().toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "short" });
  };

  // re-evaluate every minute so it shifts naturally across the day
  BW.startThemeClock = function () {
    BW.applyTheme();
    setInterval(() => BW.applyTheme(), 60 * 1000);
  };

  // ---- Toast ----
  let toastTimer;
  BW.toast = function (msg, icon) {
    let t = BW.$("#toast");
    if (!t) {
      t = BW.el("div", { id: "toast" });
      document.body.appendChild(t);
    }
    t.innerHTML = `<i data-lucide="${icon || "info"}"></i><span>${msg}</span>`;
    BW.icons();
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  };

  // ---- format helpers ----
  BW.fmtDist = (km) =>
    km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
  BW.timeNow = () =>
    new Date().toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

  BW.agoLabel = function (ts) {
    const s = Math.max(0, Math.round((Date.now() - (ts || 0)) / 1000));
    if (s < 10) return "just now";
    if (s < 60) return s + "s ago";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    return Math.round(m / 60) + "h ago";
  };

  // unsubscribe any VFS-bound widgets inside a view before it's torn down
  BW.cleanupWidgets = function (root) {
    BW.$$("[data-feed]", root).forEach((n) => { if (typeof n._off === "function") { try { n._off(); } catch (e) {} } });
  };

  // bridge to the VFS reading store (BusVFS may load after theme.js)
  BW.getReading = function (feedId) {
    return (window.BusVFS && BusVFS.getReading) ? BusVFS.getReading(feedId) : null;
  };

  // ---- scroll reveal ----
  BW.observeReveals = function (root) {
    const els = BW.$$(".reveal", root).filter((e) => !e._obs);
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("is-in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((e) => {
      e._obs = true;
      io.observe(e);
    });
  };
})();
