/* ============================================================
   BusTech · DEMO 01 — Hash router
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});
  let main = null, currentPage = null;

  const routes = {
    home: { page: "home", nav: "home" },
    station: { page: "station", nav: "home" },
    monitor: { page: "monitor", nav: "monitor" },
  };

  function parse() {
    let h = location.hash.replace(/^#\/?/, "").trim();
    if (!h) return { name: "home", params: {} };
    const parts = h.split("/");
    if (parts[0] === "station") return { name: "station", params: { id: parts[1] } };
    if (parts[0] === "monitor") return { name: "monitor", params: { id: parts[1] } };
    if (routes[parts[0]]) return { name: parts[0], params: {} };
    return { name: "home", params: {} };
  }

  BW.go = function (path) {
    const target = "#/" + path;
    if (location.hash === target) render();
    else location.hash = target;
  };

  function setNav(navKey) {
    BW.$$(".top-link[data-nav]").forEach((l) => l.classList.toggle("is-active", l.dataset.nav === navKey));
  }

  function render() {
    const route = parse();
    const def = routes[route.name] || routes.home;
    if (currentPage && BW.pages[currentPage] && BW.pages[currentPage].leave) {
      try { BW.pages[currentPage].leave(); } catch (e) {}
    }
    // leaving a non-station page clears the weather mood so it doesn't stick on Monitor
    if (def.page === "monitor") BW.setSkyFX && BW.setSkyFX("none");
    main.innerHTML = "";
    window.scrollTo({ top: 0, behavior: "auto" });
    currentPage = def.page;
    setNav(def.nav);
    BW.pages[def.page].render(main, route.params);
  }

  BW.startRouter = function () {
    main = BW.$("#main");
    window.addEventListener("hashchange", render);
    render();
  };
})();
