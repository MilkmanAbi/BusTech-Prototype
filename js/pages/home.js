/* ============================================================
   BusTech · DEMO 01 — Home
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});
  const el = BW.el, ui = BW.ui;
  BW.pages = BW.pages || {};

  BW.pages.home = {
    async render(root) {
      const view = el("div", { class: "view" });
      root.appendChild(view);

      const loc = BW.userLoc || { lat: 1.35394, lon: 103.9438, label: "Tampines" };
      const nearest = BW.nearestStops(loc.lat, loc.lon, 7);
      const stop = nearest[0] || BW.findStop(BW.DEFAULT_STOP);

      // ---------- greeter + location ----------
      const search = buildSearch();
      view.appendChild(
        el("section", { class: "wrap greet-wrap" }, [
          el("div", { class: "reveal" }, [
            el("div", { class: "eyebrow" }, BW.dateLine()),
            el("h1", { class: "greet" }, [BW.greeting() + " ", el("span", { class: "soft" }, kao())]),
            el("p", { class: "greet-sub" }, "Here's what's moving around " +
              (BW.userLoc ? "you" : stop.Description) + " right now."),
          ]),
          el("div", { class: "loc-row reveal", "data-delay": "1" }, [
            el("div", { class: "loc-search" }, [search.node]),
            el("button", { class: "btn", onClick: useLocation }, [ui.icon("locate-fixed"), el("span", { class: "lbl" }, "Use my location")]),
          ]),
        ])
      );

      // ---------- hero: weather + monitor ----------
      const hero = el("section", { class: "wrap grid grid-wide", style: "margin-top:22px" }, []);
      view.appendChild(hero);

      const wxSlot = el("div", { class: "card wx reveal", style: "min-height:250px" }, [
        el("div", { class: "card-pad" }, [el("div", { class: "skeleton", style: "height:180px" })]),
      ]);
      const monCard = ui.monitorCard(stop.BusStopCode);
      monCard.classList.add("reveal");
      hero.appendChild(wxSlot);
      hero.appendChild(monCard);

      // ---------- next buses ----------
      view.appendChild(el("section", { class: "wrap" }, [
        el("div", { class: "sec-head reveal", style: "display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap" }, [
          el("div", {}, [
            el("h2", { class: "sec-title" }, [ui.icon("bus-front"), "Next buses"]),
            el("p", { class: "sec-sub" }, stop.Description + " · tap a card to flip for details"),
          ]),
          el("button", { class: "btn btn-text", onClick: () => BW.go("station/" + stop.BusStopCode) }, ["All arrivals →"]),
        ]),
      ]));
      const arrGrid = el("div", { class: "wrap arr-grid reveal", "data-delay": "1" }, [
        skel(), skel(), skel(), skel(),
      ]);
      view.appendChild(arrGrid);

      // ---------- good to know ----------
      view.appendChild(el("section", { class: "wrap" }, [
        el("div", { class: "sec-head reveal" }, [
          el("h2", { class: "sec-title" }, [ui.icon("lightbulb"), "Good to know"]),
        ]),
      ]));
      const tipsCard = el("div", { class: "wrap reveal", "data-delay": "1" }, [
        el("div", { class: "card" }, [el("div", { class: "card-pad" }, [el("div", { class: "tips", id: "home-tips" }, [el("div", { class: "skeleton", style: "height:120px" })])])]),
      ]);
      view.appendChild(tipsCard);

      // ---------- nearby ----------
      view.appendChild(el("section", { class: "wrap" }, [
        el("div", { class: "sec-head reveal" }, [
          el("h2", { class: "sec-title" }, [ui.icon("map-pin"), "Other stops nearby"]),
        ]),
      ]));
      const near = el("div", { class: "wrap hscroll reveal", "data-delay": "1" });
      nearest.slice(1, 7).forEach((s) => near.appendChild(ui.nearbyStop(s, BW.genArrivals(s))));
      view.appendChild(near);

      view.appendChild(buildFooter());

      BW.icons();
      BW.observeReveals(view);

      // ---------- async fills ----------
      const [weather, arrData] = await Promise.all([
        BW.getWeather(stop.Latitude, stop.Longitude),
        BW.getArrivals(stop),
      ]);
      const reading = BW.getReading(stop.BusStopCode); // real ML reading, or null

      const tips = BW.buildTips({ weather, arrivals: arrData.services, crowd: reading ? reading.count : null });
      BW.applyWeatherMood(weather);

      // weather card with the top tip inside
      const wc = ui.weatherCard(weather, { reveal: false, tip: tips[0] });
      wxSlot.replaceWith(wc);

      // arrivals
      arrGrid.innerHTML = "";
      arrData.services.slice(0, 8).forEach((s) => arrGrid.appendChild(ui.arrivalFlip(s)));

      // tips
      const tl = BW.$("#home-tips");
      if (tl) { tl.innerHTML = ""; tips.forEach((tp) => tl.appendChild(ui.tip(tp))); }

      BW.icons();
    },

    leave() { BW.cleanupWidgets(document); },
  };

  function kao() { const k = ["☺", "♪", "☀", "✦"]; const h = new Date().getHours(); return h >= 20 || h < 6 ? "☾" : k[0]; }
  function skel() { return el("div", { class: "skeleton", style: "height:142px;border-radius:20px" }); }

  // ---- search ----
  function buildSearch() {
    const input = el("input", { type: "text", placeholder: "Search a place, stop or postal code…", autocomplete: "off" });
    const ac = el("div", { class: "ac" });
    const node = el("div", { class: "search" }, [ui.icon("search", "search-ic"), input, ac]);

    const run = BW.debounce(async (q) => {
      if (q.trim().length < 2) { ac.classList.remove("show"); return; }
      const res = await BW.searchPlaces(q);
      ac.innerHTML = "";
      if (!res.length) { ac.classList.remove("show"); return; }
      res.forEach((r) => {
        const near = BW.nearestStops(r.lat, r.lon, 1)[0];
        const item = el("div", { class: "ac-item" }, [
          ui.icon("map-pin"),
          el("div", {}, [el("div", { class: "ac-main" }, r.name), el("div", { class: "ac-sub" }, r.addr || "Singapore")]),
          near ? el("div", { class: "ac-dist" }, near.Description) : null,
        ]);
        item.addEventListener("click", () => {
          BW.saveLoc(r.lat, r.lon, r.name);
          BW.toast("Stops near " + r.name, "map-pin");
          BW.go("home");
        });
        ac.appendChild(item);
      });
      BW.icons();
      ac.classList.add("show");
    }, 280);

    input.addEventListener("input", (e) => run(e.target.value));
    input.addEventListener("blur", () => setTimeout(() => ac.classList.remove("show"), 180));
    input.addEventListener("focus", (e) => { if (e.target.value.trim().length >= 2) run(e.target.value); });
    return { node };
  }

  async function useLocation() {
    BW.toast("Finding your location…", "locate-fixed");
    try {
      await BW.requestLocation();
      const n = BW.nearestStops(BW.userLoc.lat, BW.userLoc.lon, 1)[0];
      BW.toast("Found you — nearest is " + (n ? n.Description : "—") + " ☺", "check-circle-2");
      BW.go("home");
    } catch (e) {
      BW.toast("Couldn't get a location fix — showing Tampines", "info");
    }
  }

  function buildFooter() {
    return el("footer", { class: "wrap foot reveal" }, [
      el("span", {}, "BusTech · Demo 01"),
      el("span", { class: "dotsep" }),
      el("span", {}, "LTA DataMall · data.gov.sg / NEA · OneMap"),
      el("span", { class: "dotsep" }),
      el("span", {}, "Crowd reading runs on-device"),
    ]);
  }
})();
