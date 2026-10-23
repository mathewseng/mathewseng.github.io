import { createShader } from './dither-shader.js?v=20261023';

const background = document.querySelector('.dither-background');
const canvas = background?.querySelector('canvas');
const toggle = document.querySelector('.dither-toggle');
let shader;
let paused = navigator.connection?.saveData === true;

function start() {
  if (!canvas || shader) return;
  try {
    shader = createShader(canvas, {
      background: { dark: getComputedStyle(document.documentElement).getPropertyValue('--page').trim() },
      paused,
      onRender: () => background.classList.add('is-active'),
      onError: stop,
    });
    if (toggle) {
      toggle.hidden = false;
      updateToggle();
    }
  } catch {
    // The CSS dither field also works without JavaScript or GPU support.
    stop();
  }
}

function stop() {
  shader?.destroy();
  shader = undefined;
  background?.classList.remove('is-active');
  if (toggle) toggle.hidden = true;
}

function updateToggle() {
  toggle.setAttribute('aria-pressed', String(paused));
  toggle.textContent = paused ? 'Resume background' : 'Pause background';
}

toggle?.addEventListener('click', () => {
  paused = !paused;
  shader?.setPaused(paused);
  updateToggle();
});
canvas?.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); });
canvas?.addEventListener('webglcontextrestored', start);
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', start);
start();
