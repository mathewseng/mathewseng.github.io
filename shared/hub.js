// Pointer effects for the hub pages: a light that follows the pointer across each tile,
// and a gentle tilt on the hero cards. Decorative only; the pages work without it.
(() => {
  const finePointer = matchMedia("(pointer: fine)").matches;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!finePointer || reducedMotion) return;

  for (const tile of document.querySelectorAll(".tile")) {
    tile.addEventListener("pointermove", (event) => {
      const box = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
      tile.style.setProperty("--my", `${event.clientY - box.top}px`);
    });
  }

  const fan = document.querySelector(".fan");
  if (!fan) return;
  let frame = 0;
  addEventListener("pointermove", (event) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const box = fan.getBoundingClientRect();
      const x = (event.clientX - (box.left + box.width / 2)) / innerWidth;
      const y = (event.clientY - (box.top + box.height / 2)) / innerHeight;
      fan.style.setProperty("--tx", Math.max(-1, Math.min(1, x * 2)).toFixed(3));
      fan.style.setProperty("--ty", Math.max(-1, Math.min(1, y * 2)).toFixed(3));
    });
  });
})();
