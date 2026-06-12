/* ============================================================
   BusTech · DEMO 01 — Contextual suggestions
   Reads the live state (weather, time, arrivals, crowd) and
   writes friendly, useful tips a real bus rider would want.
   Warm tone, light kaomoji. Never robotic.
   ============================================================ */
(function () {
  const BW = (window.BW = window.BW || {});

  // pick the most relevant few, in priority order
  BW.buildTips = function (ctx) {
    const w = ctx.weather || {};
    const tips = [];
    const area = (w.area && w.area !== "Singapore") ? w.area : "your stop";
    const theme = BW.currentTheme();

    // --- weather-driven ---
    if (w.kind === "thunder") {
      tips.push(t("warn", "cloud-lightning", "Thundery showers about",
        `Lightning risk near ${area}. Maybe wait under the shelter for this one ⚡`));
    } else if (w.kind === "rain" || w.rainfall > 0) {
      tips.push(t("info", "umbrella", "Bring an umbrella",
        `${w.cond} near ${area} right now — you'll want cover at the stop ☂`));
    }
    if (w.uv >= 8 && (theme === "morning" || theme === "dawn")) {
      tips.push(t("warn", "sun", "UV is high",
        `It's a strong ${w.uv} out. Grab some shade while you wait ☀`));
    }
    if (w.pm25 > 55) {
      tips.push(t("warn", "wind", "Air's a little hazy",
        `PM2.5 is ${w.pm25} near ${area} — mask up if you're sensitive.`));
    }
    if (w.temp >= 33 && w.kind !== "rain") {
      tips.push(t("warn", "thermometer-sun", "Properly warm today",
        `Around ${w.temp}° — keep some water handy on the ride.`));
    }

    // --- arrivals-driven (the practical "wait for the next one") ---
    if (ctx.arrivals && ctx.arrivals.length) {
      for (const svc of ctx.arrivals) {
        const b0 = svc.buses[0], b1 = svc.buses[1];
        if (b0 && b1 && b0.load === "LSD" && (b1.load === "SEA" || b1.load === "SDA")) {
          tips.push(t("cool", "armchair", `The next ${svc.ServiceNo} looks packed`,
            `The one after (${b1.mins} min) has more room — worth the short wait ☺`));
          break;
        }
      }
      // a comfy option arriving soon
      const comfy = ctx.arrivals.find((s) => s.buses[0] && s.buses[0].load === "SEA" && s.buses[0].mins <= 5);
      if (comfy && tips.length < 3) {
        tips.push(t("cool", "thumbs-up", `${comfy.ServiceNo} has seats`,
          `Arriving in ${comfy.buses[0].mins <= 0 ? "moments" : comfy.buses[0].mins + " min"} with seats free — easy ride ♪`));
      }
    }

    // --- crowd-driven ---
    if (ctx.crowd != null) {
      const lvl = BW.crowdLevel(ctx.crowd);
      if (lvl.key === "full" || lvl.key === "busy") {
        tips.push(t("warn", "users", "Platform's filling up",
          `About ${ctx.crowd} people waiting — give yourself a little extra time.`));
      } else if (lvl.key === "quiet") {
        tips.push(t("cool", "circle-check", "Nice and quiet",
          `Only about ${ctx.crowd} waiting right now — easy, comfy boarding ☺`));
      }
    }

    // --- time-of-day ---
    if (theme === "night") {
      tips.push(t("info", "moon-star", "Running late tonight",
        "Last buses come around soon — double-check the final timing before you head out ☾"));
    } else if (theme === "dawn" && tips.length < 3) {
      tips.push(t("cool", "sunrise", "Early start",
        "Quiet roads this hour — buses tend to run close to schedule ☺"));
    }

    // --- gentle fallback so the section is never empty ---
    if (!tips.length) {
      tips.push(t("cool", "sparkles", "Lovely conditions for a wait",
        `${w.cond || "Calm skies"} near ${area} and buses flowing nicely — you're good to go ☺`));
    }

    return tips.slice(0, 3);
  };

  function t(tone, icon, title, text) {
    return { tone, icon, title, text };
  }
})();
