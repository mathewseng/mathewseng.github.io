/* Load dependencies with bounded waits, including script/network failures. */
(() => {
  "use strict";
  const loading = document.getElementById("loading"), retry = document.getElementById("retry-report");
  retry.addEventListener("click", () => location.reload());
  async function script(path, ready) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await new Promise((resolve, reject) => {
          const el = document.createElement("script");
          const timer = setTimeout(() => finish(Error("Script request timed out")), 10000);
          function finish(error) {
            clearTimeout(timer); el.onload = el.onerror = null;
            if (error) { el.remove(); reject(error); } else resolve();
          }
          el.onload = () => finish(ready() ? null : Error("Script did not initialize"));
          el.onerror = () => finish(Error("Script could not be downloaded"));
          el.src = path + "?v=20261028-3" + (attempt ? "&retry=" + Date.now() : "");
          document.head.append(el);
        });
        return;
      } catch (error) { if (attempt) throw error; }
    }
  }
  Promise.all([
    script("../engine.js", () => !!window.Scoundrel).then(() => script("history-codec.js", () => !!window.ScoundrelHistory)),
    script("../catalog.js", () => !!window.ScoundrelCatalog),
    script("statistics.js", () => !!window.ScoundrelStatistics),
  ]).then(() => script("app.js", () => !!window.ScoundrelReportStarted)).catch(() => {
    loading.hidden = false;
    loading.textContent = "The report scripts could not load. Check your connection and retry.";
    retry.hidden = false;
  });
})();
