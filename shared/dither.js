// The artwork is a cached image. CSS transforms supply optional desktop motion;
// no canvas, animation-frame callbacks, shader compilation or per-frame drawing.
const background = document.querySelector('.dither-background');
const toggle = document.querySelector('.dither-toggle');
const motion = matchMedia('(min-width: 801px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
const connection = navigator.connection;
let paused = connection?.saveData === true;

function update() {
  const canAnimate = motion.matches && !connection?.saveData;
  background?.classList.toggle('is-drifting', canAnimate && !paused && !document.hidden);
  if (!toggle) return;
  toggle.hidden = !canAnimate;
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.textContent = paused ? 'Resume background' : 'Pause background';
}

toggle?.addEventListener('click', () => { paused = !paused; update(); });
motion.addEventListener('change', update);
connection?.addEventListener('change', update);
document.addEventListener('visibilitychange', update);
window.addEventListener('pagehide', () => background?.classList.remove('is-drifting'));
window.addEventListener('pageshow', update);
update();
