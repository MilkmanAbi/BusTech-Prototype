/* ============================================================
   BusTech · DEMO 01 — Live platform monitor
   Plain video feed + a quiet on-device crowd read (no boxes).
   Route: #/monitor or #/monitor/<stopCode>
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});
  const el = BW.el, ui = BW.ui;
  BW.pages = BW.pages || {};

  let mon = null, offReading = null;

  BW.pages.monitor = {
    async render(root, params) {
      const stop = BW.findStop((params && params.id) || BW.featuredStop());
      const feedId = stop.BusStopCode;
      const view = el("div", { class: "view" });
      root.appendChild(view);

      const stage = el("div", { class: "cam-stage" });
      const badge = el("div", { class: "cam-badge" }, [el("span", { id: "cam-src" }, stop.Description)]);
      const status = el("div", { class: "cam-count" }, [el("span", { class: "live-dot" }), el("span", { id: "cam-lvl" }, "Standby")]);
      const loading = el("div", { class: "cam-loading", id: "cam-loading" }, [
        el("div", {}, [el("div", { class: "lring bw-spin" }), el("div", { id: "cam-load-txt" }, "Loading…")]),
      ]);
      const empty = el("div", { class: "cam-empty", id: "cam-empty" }, [
        ui.icon("video-off"),
        el("h3", {}, "Yet to set up video source"),
        el("p", {}, "Connect a platform feed for " + stop.Description + " to see it live. You can also try a test clip below — it's read entirely on this device."),
      ]);
      stage.append(badge, status, loading, empty);

      // test-clip input (always processes, so you can verify the pipeline now)
      const fileInput = el("input", { type: "file", accept: "video/webm,video/*", style: "display:none" });
      fileInput.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) { hideEmpty(); mon.attachTestClip(f); } });

      // reading card (mirrors the published VFS reading)
      const readingCard = ui.monitorCard(feedId, { cta: false });

      view.appendChild(el("section", { class: "wrap", style: "padding-top:8px" }, [
        el("a", { class: "back-link", onClick: () => BW.go("station/" + feedId) }, [ui.icon("chevron-left"), stop.Description]),
        el("div", { class: "reveal" }, [
          el("h1", { class: "stop-h1", style: "font-size:clamp(1.6rem,4vw,2.2rem)" }, "Live platform monitor"),
          el("p", { class: "sec-sub", style: "max-width:58ch" }, "On-device machine learning samples one frame every 30 seconds and quietly reads how busy the platform is. The feed and the reading stay on your device."),
        ]),
        el("div", { class: "grid grid-wide reveal", "data-delay": "1", style: "margin-top:16px" }, [
          el("div", {}, [
            stage,
            el("div", { class: "mon-actions", style: "margin-top:14px" }, [
              el("button", { class: "btn", onClick: () => fileInput.click() }, [ui.icon("upload"), "Try a test clip"]),
              el("button", { class: "btn btn-outline", onClick: () => { mon.stop(); BW.toast("Monitor paused", "pause"); setStatus("paused", "Paused"); } }, [ui.icon("pause"), "Pause"]),
              fileInput,
            ]),
            buildConfigNote(),
          ]),
          el("div", {}, [readingCard]),
        ]),
      ]));
      view.appendChild(el("div", { class: "wrap", style: "height:30px" }));

      BW.icons();
      BW.observeReveals(view);

      // build the engine for this feed
      mon = BW.createMonitor({
        stage, feedId, label: stop.Description,
        onStatus: (state, msg) => {
          const l = BW.$("#cam-loading"), txt = BW.$("#cam-load-txt");
          if (state === "loading") { if (l) l.classList.add("show"); if (txt) txt.textContent = msg; }
          else if (l) l.classList.remove("show");
          setStatus(state, msg);
          if (state === "idle") showEmpty();
          if (state === "error") BW.toast(msg, "alert-triangle");
        },
        onReading: () => {}, // the card subscribes to the VFS directly
      });

      // try to start from a configured source (will go idle if none / gated)
      setTimeout(() => { if (!mon.startConfigured()) { /* idle/paused handled by status */ } }, 0);

      function setStatus(state, msg) {
        const lvl = BW.$("#cam-lvl");
        if (lvl) lvl.textContent = (state === "live" && msg) ? msg.replace("Live · ", "") : (msg || state);
      }
      function hideEmpty() { const e = BW.$("#cam-empty"); if (e) e.style.display = "none"; }
      function showEmpty() { const e = BW.$("#cam-empty"); if (e) e.style.display = "grid"; }
    },

    leave() {
      if (mon) { mon.destroy(); mon = null; }
      if (offReading) { offReading(); offReading = null; }
      BW.cleanupWidgets(document);
    },
  };

  function buildConfigNote() {
    return el("div", { class: "cfg-note reveal", "data-delay": "2" }, [
      ui.icon("code"),
      el("div", {}, [
        el("span", { class: "cfg-t" }, "Wiring a real feed"),
        el("span", { class: "cfg-p" }, [
          "Add the stop's WebM URL to ",
          el("code", {}, "BusVFS.SOURCES"),
          " and flip ",
          el("code", {}, "BusVFS.config.ENABLED"),
          " in ", el("code", {}, "js/vfs.js"), ". One frame is processed every 30s.",
        ]),
      ]),
    ]);
  }
})();
