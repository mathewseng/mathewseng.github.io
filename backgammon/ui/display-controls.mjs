// SPDX-License-Identifier: GPL-3.0-or-later
// Safari owns its browser chrome. Never simulate fullscreen by scrolling a
// game or request it on rotation (there is no user activation at that point).
export function installDisplayControls(app, control, showHelp) {
  const life = new AbortController(), options = {signal:life.signal};
  const standalone = matchMedia('(display-mode: standalone)');
  let frame, height;
  const full = () => document.fullscreenElement || document.webkitFullscreenElement;
  const supported = () => (document.fullscreenEnabled && document.documentElement.requestFullscreen) ||
    (document.webkitFullscreenEnabled && document.documentElement.webkitRequestFullscreen);
  const update = () => {
    control.hidden = (standalone.matches || navigator.standalone === true) && !full();
    const label = full() ? 'Exit full screen' : supported() ? 'Full screen' : 'Full-screen help';
    control.title = label;
    control.setAttribute('aria-label', label);
    control.setAttribute('aria-pressed', String(!!full()));
    control.querySelector('path')?.setAttribute('d', full()
      ? 'M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5'
      : 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5');
  };
  const fit = () => {
    frame = undefined;
    const viewport = window.visualViewport;
    if (viewport && Math.abs(viewport.scale - 1) > .01) return;
    const next = Math.round(Math.min(innerHeight, viewport?.height || innerHeight));
    if (next !== height) {
      height = next;
      app.style.setProperty('--play-visible-height', `${height}px`);
    }
  };
  const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(fit); };
  control.addEventListener('click', async () => {
    try {
      if (full()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        await exit.call(document);
      } else if (supported()) {
        const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
        await enter.call(document.documentElement);
      } else showHelp();
    } catch { showHelp(); }
    update();
    schedule();
  }, options);
  for (const event of ['fullscreenchange','webkitfullscreenchange'])
    document.addEventListener(event, () => { update(); schedule(); }, options);
  standalone.addEventListener('change', update, options);
  window.addEventListener('resize', schedule, options);
  window.visualViewport?.addEventListener('resize', schedule, options);
  update(); fit();
  return () => { life.abort(); cancelAnimationFrame(frame); };
}
