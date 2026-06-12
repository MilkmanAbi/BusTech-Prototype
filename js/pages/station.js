/* ============================================================
   BusTech · DEMO 01 — Station detail
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});
  const el = BW.el, ui = BW.ui;
  BW.pages = BW.pages || {};

  let refreshTimer = null, mapObj = null;

  BW.pages.station = {
    async render(root, params) {
      clearInterval(refreshTimer);
      mapMounted = false;
      const stop = BW.findStop(params.id || BW.DEFAULT_STOP);
      const view = el("div", { class: "view" });
      root.appendChild(view);

      // ----- header -----
      view.appendChild(el("section", { class: "wrap", style: "padding-top:8px" }, [
        el("a", { class: "back-link", onClick: () => BW.go("home") }, [ui.icon("chevron-left"), "Home"]),
        el("div", { class: "reveal" }, [
          el("div", { class: "stop-head" }, [
            el("div", { style: "flex:1;min-width:200px" }, [
              el("div", { style: "display:flex;gap:9px;align-items:center;margin-bottom:7px" }, [
                el("span", { class: "stop-id" }, "Stop " + stop.BusStopCode),
                el("span", { class: "live-tag" }, [el("span", { class: "live-dot" }), "Live"]),
              ]),
              el("h1", { class: "stop-h1" }, stop.Description),
              el("div", { class: "stop-road" }, [ui.icon("map-pin"), stop.RoadName]),
            ]),
            el("div", { style: "display:flex;gap:8px;align-items:center" }, [
              el("a", { class: "btn btn-outline btn-sm", href: `https://www.google.com/maps/search/?api=1&query=${stop.Latitude},${stop.Longitude}`, target: "_blank", rel: "noopener" }, [ui.icon("navigation"), "Directions"]),
              el("button", { class: "btn btn-sm", onClick: () => BW.go("monitor") }, [ui.icon("monitor-play"), "Monitor"]),
            ]),
          ]),
        ]),
      ]));

      // ----- weather + monitor -----
      const dash = el("div", { class: "wrap grid grid-wide", style: "margin-top:18px" });
      view.appendChild(dash);

      const wxSlot = el("div", { class: "card wx reveal", style: "min-height:250px" }, [el("div", { class: "card-pad" }, [el("div", { class: "skeleton", style: "height:180px" })])]);
      const monCard = ui.monitorCard(stop.BusStopCode);
      monCard.classList.add("reveal");
      monCard.setAttribute("data-delay", "1");
      dash.appendChild(wxSlot);
      dash.appendChild(monCard);

      // ----- arrivals -----
      view.appendChild(el("section", { class: "wrap" }, [
        el("div", { class: "sec-head reveal", style: "display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap" }, [
          el("div", {}, [
            el("h2", { class: "sec-title" }, [ui.icon("bus-front"), "Live arrivals"]),
            el("p", { class: "sec-sub" }, "Tap a card to flip for operator, vehicle & crowd"),
          ]),
          el("span", { id: "arr-status", class: "live-tag" }, [el("span", { class: "live-dot" }), "Updating…"]),
        ]),
      ]));
      const arrGrid = el("div", { class: "wrap arr-grid reveal", "data-delay": "1", id: "arr-grid" });
      view.appendChild(arrGrid);

      // ----- good to know -----
      view.appendChild(el("section", { class: "wrap" }, [
        el("div", { class: "sec-head reveal" }, [el("h2", { class: "sec-title" }, [ui.icon("lightbulb"), "Good to know"])]),
      ]));
      const tipsCard = el("div", { class: "wrap reveal", "data-delay": "1" }, [
        el("div", { class: "card" }, [el("div", { class: "card-pad" }, [el("div", { class: "tips", id: "stn-tips" }, [el("div", { class: "skeleton", style: "height:110px" })])])]),
      ]);
      view.appendChild(tipsCard);

      // ----- map -----
      view.appendChild(el("section", { class: "wrap" }, [
        el("div", { class: "sec-head reveal" }, [el("h2", { class: "sec-title" }, [ui.icon("map"), "On the map"])]),
        el("div", { class: "wrap map-wrap reveal", "data-delay": "1", style: "padding:0" }, [el("div", { id: "leaflet-map" })]),
      ]));
      view.appendChild(el("div", { class: "wrap", style: "height:24px" }));

      BW.icons();
      BW.observeReveals(view);

      // ----- async fills -----
      async function loadArrivals() {
        const data = await BW.getArrivals(stop);
        arrGrid.innerHTML = "";
        data.services.forEach((s) => arrGrid.appendChild(ui.arrivalFlip(s)));
        BW.icons();
        const st = BW.$("#arr-status");
        if (st) { st.innerHTML = ""; st.append(el("span", { class: "live-dot" }), document.createTextNode((data.live ? "LTA DataMall" : "Demo data") + " · " + BW.timeNow())); }
        return data;
      }
      const [weather, arrData] = await Promise.all([
        BW.getWeather(stop.Latitude, stop.Longitude),
        loadArrivals(),
      ]);
      refreshTimer = setInterval(loadArrivals, 20000);

      const tips = BW.buildTips({ weather, arrivals: arrData.services, crowd: (BW.getReading(stop.BusStopCode) || {}).count ?? null });
      BW.applyWeatherMood(weather);
      wxSlot.replaceWith(ui.weatherCard(weather, { tip: tips[0] }));
      const tl = BW.$("#stn-tips");
      if (tl) { tl.innerHTML = ""; tips.forEach((tp) => tl.appendChild(ui.tip(tp))); }
      BW.icons();

      requestAnimationFrame(() => mountMap(stop));
      setTimeout(() => mountMap(stop), 0);
    },

    leave() {
      clearInterval(refreshTimer);
      if (mapObj) { try { mapObj.remove(); } catch (e) {} mapObj = null; }
      BW.cleanupWidgets(document);
    },
  };

  let mapMounted = false;
  function mountMap(stop) {
    const host = BW.$("#leaflet-map");
    if (!host || mapMounted) return;
    const theme = BW.currentTheme();
    const dark = theme === "night" || theme === "dusk";
    if (window.L) {
      try {
        mapMounted = true;
        mapObj = L.map(host, { zoomControl: false, attributionControl: false, scrollWheelZoom: false }).setView([stop.Latitude, stop.Longitude], 16);
        const url = dark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
        L.tileLayer(url, { maxZoom: 19, subdomains: "abcd" }).addTo(mapObj);
        L.marker([stop.Latitude, stop.Longitude], { icon: L.divIcon({ className: "", html: pin(true), iconSize: [28, 28], iconAnchor: [14, 28] }) }).addTo(mapObj);
        BW.nearestStops(stop.Latitude, stop.Longitude, 5).forEach((s) => {
          if (s.BusStopCode === stop.BusStopCode) return;
          L.marker([s.Latitude, s.Longitude], { icon: L.divIcon({ className: "", html: pin(false), iconSize: [16, 16], iconAnchor: [8, 8] }) })
            .addTo(mapObj).on("click", () => BW.go("station/" + s.BusStopCode));
        });
        setTimeout(() => mapObj && mapObj.invalidateSize(), 200);
        return;
      } catch (e) { mapMounted = false; }
    }
    if (host.parentElement) host.parentElement.replaceChild(schematic(stop), host);
  }

  function pin(primary) {
    return primary
      ? `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#0a84ff;box-shadow:0 6px 16px -4px rgba(10,132,255,.7);border:2px solid #fff"></div>`
      : `<div style="width:14px;height:14px;border-radius:50%;background:#fff;border:3px solid #0a84ff;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`;
  }

  function schematic(stop) {
    const near = BW.nearestStops(stop.Latitude, stop.Longitude, 6);
    const xs = near.map((s) => s.Longitude), ys = near.map((s) => s.Latitude);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (lon) => 70 + ((lon - minX) / ((maxX - minX) || 1)) * 660;
    const sy = (lat) => 290 - ((lat - minY) / ((maxY - minY) || 1)) * 220;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 800 360"); svg.setAttribute("class", "schematic");
    const poly = document.createElementNS(NS, "polyline");
    poly.setAttribute("points", near.map((s) => `${sx(s.Longitude)},${sy(s.Latitude)}`).join(" "));
    poly.setAttribute("fill", "none"); poly.setAttribute("stroke", "rgba(10,132,255,.3)");
    poly.setAttribute("stroke-width", "9"); poly.setAttribute("stroke-linecap", "round"); poly.setAttribute("stroke-linejoin", "round");
    svg.appendChild(poly);
    near.forEach((s) => {
      const primary = s.BusStopCode === stop.BusStopCode;
      const g = document.createElementNS(NS, "g"); g.style.cursor = "pointer";
      g.addEventListener("click", () => BW.go("station/" + s.BusStopCode));
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", sx(s.Longitude)); c.setAttribute("cy", sy(s.Latitude)); c.setAttribute("r", primary ? 12 : 7);
      c.setAttribute("fill", primary ? "#0a84ff" : "rgba(255,255,255,.9)"); c.setAttribute("stroke", "#0a84ff"); c.setAttribute("stroke-width", "3");
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", sx(s.Longitude)); t.setAttribute("y", sy(s.Latitude) - (primary ? 19 : 13));
      t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "var(--ink)"); t.setAttribute("font-size", "12.5"); t.setAttribute("font-weight", "650");
      t.textContent = s.Description.length > 22 ? s.Description.slice(0, 21) + "…" : s.Description;
      g.append(c, t); svg.appendChild(g);
    });
    return svg;
  }
})();
