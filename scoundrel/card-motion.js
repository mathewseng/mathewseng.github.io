/* Pointer-driven card depth, shared by the dungeon and collection. */
(() => {
  "use strict";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"), fine = matchMedia("(hover: hover) and (pointer: fine)");
  const controllers = new Set();
  const properties = ["--tilt-x", "--tilt-y", "--tilt-z", "--shine-x", "--shine-y", "--shadow-x", "--shadow-y"];
  function attach(root, { selector, enabled = () => true }) {
    let active = null, bounds = null, point = null, frame = 0;
    const inside = event => bounds && event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    function reset() {
      cancelAnimationFrame(frame); frame = 0; point = null;
      if (active) { active.classList.remove("is-tilting"); for (const property of properties) active.style.removeProperty(property); }
      active = bounds = null;
    }
    root.addEventListener("pointermove", event => {
      if (reduced.matches || !fine.matches || !enabled() || event.pointerType === "touch") { reset(); return; }
      // Keep the original hit area stable while the visible card rotates away.
      const card = event.target.closest(selector) || (active && inside(event) ? active : null);
      if (!card || !root.contains(card) || card.disabled) { reset(); return; }
      if (active !== card) { reset(); active = card; bounds = card.getBoundingClientRect(); card.classList.add("is-tilting"); }
      point = { x: event.clientX, y: event.clientY };
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0; if (!active?.isConnected || !point) { reset(); return; }
        const x = Math.max(0, Math.min(1, (point.x - bounds.left) / bounds.width)), y = Math.max(0, Math.min(1, (point.y - bounds.top) / bounds.height));
        active.style.setProperty("--tilt-x", ((.5 - y) * 24).toFixed(2) + "deg");
        active.style.setProperty("--tilt-y", ((x - .5) * 28).toFixed(2) + "deg");
        active.style.setProperty("--tilt-z", ((x - .5) * 3).toFixed(2) + "deg");
        active.style.setProperty("--shine-x", (x * 100).toFixed(1) + "%");
        active.style.setProperty("--shine-y", (y * 100).toFixed(1) + "%");
        active.style.setProperty("--shadow-x", ((.5 - x) * 24).toFixed(1) + "px");
        active.style.setProperty("--shadow-y", (12 + y * 18).toFixed(1) + "px");
      });
    });
    root.addEventListener("pointerout", event => { if (active && active.contains(event.target) && !active.contains(event.relatedTarget) && !inside(event)) reset(); });
    root.addEventListener("pointerleave", reset);
    root.addEventListener("pointercancel", reset);
    reduced.addEventListener("change", reset); fine.addEventListener("change", reset);
    window.addEventListener("blur", reset); window.addEventListener("resize", reset);
    document.addEventListener("scroll", reset, { passive: true, capture: true });
    const controller = { reset }; controllers.add(controller); return controller;
  }
  window.ScoundrelCardMotion = { attach, resetAll: () => controllers.forEach(controller => controller.reset()) };
})();
