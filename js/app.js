/* ============================================================
   BusTech · DEMO 01 — Bootstrap
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  function boot() {
    // enable entrance animations only now that JS is live
    // (CSS keeps content visible by default if this never runs)
    document.documentElement.classList.add("anim-ready");

    BW.startThemeClock();

    BW.$$(".top-link[data-route]").forEach((l) =>
      l.addEventListener("click", (e) => { e.preventDefault(); BW.go(l.dataset.route); }));
    const brand = BW.$(".brand");
    if (brand) brand.addEventListener("click", () => BW.go("home"));

    BW.icons();
    BW.startRouter();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
