/* ============================================================
   BusTech · DEMO 01 — Shared UI builders
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});
  const el = BW.el;
  const ui = (BW.ui = {});

  ui.icon = (name, cls) => el("i", { "data-lucide": name, class: cls || "" });

  // load indicator: coloured dot + word (quiet, not a loud chip)
  ui.load = function (load) {
    const m = BW.loadMeta(load);
    return el("span", { class: "load load-" + m.tone }, [el("span", { class: "dot" }), m.short]);
  };
  ui.typeLabel = (t) => ({ SD: "Single deck", DD: "Double deck", BD: "Bendy" }[t] || "Bus");

  // ---- refined flip card for one service ----
  ui.arrivalFlip = function (svc) {
    const n = svc.buses[0] || { mins: 0, load: "SEA", type: "SD", wab: false };
    const eta =
      n.mins <= 0
        ? el("div", { class: "flip-eta" }, [el("span", { class: "eta-arr" }, "Arriving")])
        : el("div", { class: "flip-eta" }, [
            el("span", { class: "eta-n" }, String(n.mins)),
            el("span", { class: "eta-u" }, "min"),
          ]);

    const front = el("div", { class: "flip-face front" }, [
      el("div", { class: "flip-top" }, [el("span", { class: "svc" }, svc.ServiceNo), ui.load(n.load)]),
      el("div", { class: "flip-dest" }, [ui.icon("arrow-right"), svc.dest]),
      eta,
      el("div", { class: "flip-foot" }, [
        el("span", { class: "load-quiet", style: "visibility:hidden" }, ""),
        el("span", { class: "flip-turn" }, [ui.icon("rotate-cw")]),
      ]),
    ]);

    const back = el("div", { class: "flip-face back" }, [
      el("div", { class: "back-h" }, ["Bus " + svc.ServiceNo, ui.icon("bus")]),
      el("div", { class: "back-rows" }, [
        row("Operator", svc.Operator || "—"),
        row("Vehicle", ui.typeLabel(n.type)),
        row("Access", n.wab ? "Wheelchair ♿" : "Standard"),
        row("To", svc.dest),
      ]),
      el("div", { class: "back-next" }, [
        el("div", { class: "back-next-h" }, "Upcoming"),
        el("div", { class: "back-next-row" },
          svc.buses.slice(0, 3).map((b, i) =>
            el("div", { class: "np" }, [
              el("span", { class: "np-k" }, ["Next", "After", "Then"][i] || "+"),
              el("span", { class: "np-v" }, b.mins <= 0 ? "Arr" : b.mins + "m"),
            ]))),
      ]),
    ]);

    const card = el("div", { class: "flip" }, [el("div", { class: "flip-in" }, [front, back])]);
    card.addEventListener("click", () => card.classList.toggle("flipped"));
    return card;
    function row(k, v) {
      return el("div", { class: "back-row" }, [el("span", { class: "k" }, k), el("span", { class: "v" }, v)]);
    }
  };

  // ---- weather widget (Apple-weather feel, animated sky) ----
  ui.weatherCard = function (w, opts) {
    opts = opts || {};
    const gif = BW.wxGif(w.kind);
    const bg = gif ? el("div", { class: "wx-bg", style: `background-image:url('${gif}')` }) : null;
    const scrim = gif ? el("div", { class: "wx-scrim" }) : null;
    const facts = [
      fact(w.humidity + "%", "Humidity"),
      fact("PM2.5 " + w.pm25, BW.pmLabel(w.pm25)),
      fact("UV " + w.uv, BW.uvLabel(w.uv)),
    ];
    if (w.rainfall > 0) facts.unshift(fact(w.rainfall + " mm", "Rain now"));

    const children = [
      bg, scrim,
      el("div", { class: "card-pad" }, [
        el("div", { class: "wx-top" }, [
          el("div", {}, [
            el("div", { class: "eyebrow" }, w.live ? "Now · NEA" : "Forecast"),
            el("div", { class: "wx-temp", html: w.temp + "<sup>°</sup>" }),
            el("div", { class: "wx-cond" }, w.cond),
            el("div", { class: "wx-meta" }, [ui.icon("map-pin"), "Near " + w.area]),
          ]),
          el("div", { class: "wx-glyph" }, [ui.icon(w.icon)]),
        ]),
        el("div", { class: "wx-facts" }, facts),
        opts.tip ? tipLine(opts.tip) : null,
        (w.strip && w.strip.length)
          ? el("div", { class: "wx-strip" }, w.strip.map((s) =>
              el("div", { class: "wstep" }, [el("div", { class: "wt" }, s.t), ui.icon(s.icon)])))
          : null,
      ]),
    ];
    const card = el("div", { class: "card wx" + (gif ? " has-bg" : "") + (opts.reveal ? " reveal" : "") }, children);

    // fade the gif in once decoded (avoids a flash of unstyled bg)
    if (gif && bg) {
      const img = new Image();
      img.onload = () => { if (document.body.contains(card)) bg.classList.add("show"); };
      img.src = gif;
      setTimeout(() => bg.classList.add("show"), 400);
    }
    BW.icons();
    return card;

    function fact(v, l) { return el("div", { class: "wx-fact" }, [el("div", { class: "fv" }, v), el("div", { class: "fl" }, l)]); }
    function tipLine(tp) {
      return el("div", { class: "wx-tip" }, [ui.icon(tp.icon), el("span", {}, tp.text)]);
    }
  };

  // ---- compact nearby stop card ----
  ui.nearbyStop = function (stop, arr) {
    const next = (arr && arr[0] && arr[0].buses[0]) ? arr[0] : null;
    const card = el("div", { class: "card card-tight nstop" }, [
      el("div", { class: "nm" }, stop.Description),
      el("div", { class: "rd" }, stop.RoadName),
      el("div", { class: "meta" }, [
        el("span", { class: "chip" }, [ui.icon("footprints"), stop.dist != null ? BW.fmtDist(stop.dist) : stop.BusStopCode]),
        next ? el("span", { class: "live-tag" }, [
          el("span", { class: "svc", style: "padding:1px 7px;font-size:0.74rem" }, next.ServiceNo),
          (next.buses[0].mins <= 0 ? "now" : next.buses[0].mins + " min"),
        ]) : null,
      ]),
      el("div", { class: "svcs" }, (stop.services || []).slice(0, 5).map((s) => el("span", { class: "s" }, s))),
    ]);
    card.addEventListener("click", () => BW.go("station/" + stop.BusStopCode));
    return card;
  };

  // ---- monitor / crowd gauge ----
  ui.monitor = function (count, opts) {
    opts = opts || {};
    const lvl = BW.crowdLevel(count);
    const ring = el("div", { class: "ring", style: `--pct:${lvl.pct};--col:${lvl.col}` }, [
      el("div", { class: "ring-c" }, [
        el("div", { class: "ring-n" }, String(count)),
        el("div", { class: "ring-l" }, opts.unit || "waiting"),
      ]),
    ]);
    return el("div", { class: "mon" }, [
      ring,
      el("div", { class: "mon-info" }, [
        el("div", { class: "mon-level" }, [el("span", { class: "load load-" + lvl.key }, [el("span", { class: "dot" }), lvl.label])]),
        el("div", { class: "mon-desc" }, lvl.desc),
        el("div", { class: "mon-foot" }, [ui.icon(opts.footIcon || "radio"), opts.foot || "Live platform reading"]),
      ]),
    ]);
  };

  // ---- monitor CARD bound to a feed's VFS reading (idle when none) ----
  // Renders quietly: a reading if the ML has produced one, else "Yet to set
  // up video source". Subscribes so it updates the moment a reading lands.
  ui.monitorCard = function (feedId, opts) {
    opts = opts || {};
    const body = el("div", { class: "mon-slot" });
    const card = el("div", { class: "card mon-card", "data-feed": feedId }, [
      el("div", { class: "card-pad" }, [
        el("div", { class: "mon-head" }, [
          el("h3", { class: "sec-title", style: "margin:0;font-size:0.96rem" }, [ui.icon("scan-line"), "Platform monitor"]),
          el("span", { class: "mon-status live-tag", id: "monst-" + feedId }, []),
        ]),
        body,
        opts.cta !== false
          ? el("button", { class: "btn btn-outline btn-block", style: "margin-top:16px", onClick: () => BW.go("monitor/" + feedId) }, [ui.icon("monitor-play"), "Open live monitor"])
          : null,
      ]),
    ]);

    function paint(reading) {
      body.innerHTML = "";
      const st = card.querySelector("#monst-" + cssEsc(feedId));
      if (reading) {
        body.appendChild(ui.monitor(reading.count, {
          unit: "waiting",
          foot: "Updated " + BW.agoLabel(reading.at) + " · on-device",
          footIcon: "shield-check",
        }));
        if (st) { st.innerHTML = ""; st.append(el("span", { class: "live-dot" }), document.createTextNode("Live")); }
      } else {
        body.appendChild(idleBlock());
        if (st) { st.innerHTML = ""; st.append(el("span", {}, "Standby")); }
      }
      BW.icons();
    }

    function idleBlock() {
      return el("div", { class: "mon-idle" }, [
        el("div", { class: "mon-idle-ic" }, [ui.icon("video-off")]),
        el("div", {}, [
          el("div", { class: "mon-idle-t" }, "Yet to set up video source"),
          el("div", { class: "mon-idle-p" }, "Once a platform feed is connected, the on-device monitor will quietly read how busy it is here."),
        ]),
      ]);
    }

    paint(BW.getReading(feedId));
    const off = BusVFS.onReading(feedId, paint);
    card._off = off; // pages call BW.cleanupWidgets() to unsubscribe
    return card;
  };

  function cssEsc(s) { return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }

  // ---- tip row ----
  ui.tip = function (tp) {
    return el("div", { class: "tip" }, [
      el("div", { class: "tip-ic " + (tp.tone === "warn" ? "warn" : tp.tone === "cool" ? "cool" : "") }, [ui.icon(tp.icon)]),
      el("div", { class: "tip-body" }, [el("div", { class: "tip-t" }, tp.title), el("div", { class: "tip-p" }, tp.text)]),
    ]);
  };
})();
