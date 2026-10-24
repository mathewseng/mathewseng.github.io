// SPDX-License-Identifier: GPL-3.0-or-later
// One page-level <canvas id="skin-canvas"> behind the page (skin-contract.md
// §4): a WebGL1 fragment shader on a fullscreen triangle, paced by
// requestAnimationFrame at the skin's fps, paused while hidden, one still
// frame under reduced motion, removed when WebGL is unavailable. Nothing here
// throws: every failure removes the canvas and the page shows --page.
import { reducedMotion } from "./motion.mjs";

const VERTEX =
  "attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.0,1.0);}";
const UNIFORMS = ["u_time", "u_resolution", "u_pointer", "u_c1", "u_c2", "u_c3", "u_c4", "u_dark"];
const SOFTWARE = /swiftshader|llvmpipe|software/i;
let layer = null;
let warned = false;
const debug = { running: false, frames: 0, fps: 0, renderer: "" };
function publish() {
  if (typeof window !== "undefined")
    window.__bgShader = Object.freeze({ ...debug });
}
publish();

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
function warn(reason) {
  if (warned) return;
  warned = true;
  console.warn(`Skin shader disabled: ${reason}`);
}
function idle(fn) {
  if (typeof requestIdleCallback === "function")
    requestIdleCallback(fn, { timeout: 400 });
  else setTimeout(fn, 50);
}

export function stopShader() {
  if (!layer) return;
  const l = layer;
  layer = null;
  cancelAnimationFrame(l.raf);
  clearTimeout(l.resizeTimer);
  for (const [target, type, fn, options] of l.listeners)
    target.removeEventListener(type, fn, options);
  l.media?.removeEventListener?.("change", l.onMotion);
  try {
    l.gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {}
  l.canvas.remove();
  document.documentElement.classList.remove("skin-shader");
  debug.running = false;
  debug.fps = 0;
  publish();
}

// Starts (or keeps) the layer for a skin with a shader. Returns false when the
// skin has none or the layer could not start.
export function startShader(skin) {
  const shader = skin?.shader;
  if (!shader?.fragment) {
    stopShader();
    return false;
  }
  if (layer && layer.skinId === skin.id && !layer.failed) {
    attach(layer);
    return true;
  }
  stopShader();
  const canvas = document.createElement("canvas");
  canvas.id = "skin-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const coarse = matchMedia("(pointer: coarse)").matches;
  const l = (layer = {
    skinId: skin.id,
    shader,
    dark: skin.scheme === "light" ? 0 : 1,
    canvas,
    gl: null,
    program: null,
    uniforms: {},
    scale: Math.min(devicePixelRatio || 1, coarse ? 1 : 1.5),
    fps: Math.min(shader.fps === 30 || shader.fps === 60 ? shader.fps : 60, coarse ? 30 : 60),
    pointer: [0, 0],
    elapsed: 0,
    lastTick: 0,
    lastFrame: 0,
    raf: 0,
    resizeTimer: 0,
    running: false,
    stillDrawn: false,
    failed: false,
    lost: false,
    ready: false,
    listeners: [],
    media: null,
    onMotion: null,
  });
  attach(l);
  document.documentElement.classList.add("skin-shader");
  // Nothing renders before first paint: the context, program and first frame
  // wait for an idle moment.
  idle(() => {
    if (layer !== l) return;
    if (!createContext(l)) return;
    l.ready = true;
    install(l);
    resize(l);
    schedule(l);
  });
  return true;
}

function attach(l) {
  const body = document.body;
  if (!body) return;
  if (l.canvas.parentNode !== body || body.firstChild !== l.canvas)
    body.prepend(l.canvas);
  if (!document.documentElement.classList.contains("skin-shader"))
    document.documentElement.classList.add("skin-shader");
}

function fail(l, reason) {
  l.failed = true;
  warn(reason);
  if (layer === l) stopShader();
}

function createContext(l) {
  let gl = null;
  try {
    gl = l.canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: false,
    });
  } catch {
    gl = null;
  }
  if (!gl) {
    fail(l, "WebGL is unavailable");
    return false;
  }
  l.gl = gl;
  let renderer = "";
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    renderer = String(
      (info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "",
    );
  } catch {}
  debug.renderer = renderer;
  if (SOFTWARE.test(renderer)) {
    l.scale *= 0.5;
    l.fps = 15;
  }
  return compile(l);
}

function compile(l) {
  const gl = l.gl;
  const make = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(log || "shader compile failed");
    }
    return s;
  };
  try {
    const program = gl.createProgram();
    gl.attachShader(program, make(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, make(gl.FRAGMENT_SHADER, l.shader.fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) || "program link failed");
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    l.program = program;
    for (const name of UNIFORMS) l.uniforms[name] = gl.getUniformLocation(program, name);
    const colors = l.shader.colors || [];
    for (let i = 0; i < 4; i++) {
      const u = l.uniforms[`u_c${i + 1}`];
      if (u) gl.uniform3fv(u, hexToRgb(colors[i] || "#000000"));
    }
    if (l.uniforms.u_dark) gl.uniform1f(l.uniforms.u_dark, l.dark);
    return true;
  } catch (error) {
    fail(l, error?.message || "shader compile failed");
    return false;
  }
}

function install(l) {
  const on = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    l.listeners.push([target, type, fn, options]);
  };
  l.onMotion = () => schedule(l);
  on(window, "bg-motion", l.onMotion);
  l.media = matchMedia("(prefers-reduced-motion: reduce)");
  l.media.addEventListener?.("change", l.onMotion);
  on(document, "visibilitychange", () => schedule(l));
  on(window, "resize", () => {
    clearTimeout(l.resizeTimer);
    l.resizeTimer = setTimeout(() => {
      if (layer !== l) return;
      resize(l);
      if (!l.running) drawStill(l);
    }, 150);
  });
  on(
    window,
    "pointermove",
    (e) => {
      if (!l.running) return;
      l.pointer[0] = e.clientX * l.scale;
      l.pointer[1] = l.canvas.height - e.clientY * l.scale;
    },
    { passive: true },
  );
  on(l.canvas, "webglcontextlost", (e) => {
    e.preventDefault();
    l.lost = true;
    stopLoop(l);
  });
  on(l.canvas, "webglcontextrestored", () => {
    l.lost = false;
    l.uniforms = {};
    if (compile(l)) {
      resize(l);
      schedule(l);
    }
  });
}

function resize(l) {
  const w = Math.max(1, Math.round(innerWidth * l.scale)),
    h = Math.max(1, Math.round(innerHeight * l.scale));
  if (l.canvas.width !== w) l.canvas.width = w;
  if (l.canvas.height !== h) l.canvas.height = h;
  l.gl?.viewport(0, 0, w, h);
  l.stillDrawn = false;
}

function draw(l, time) {
  const gl = l.gl;
  if (!gl || l.lost) return;
  gl.useProgram(l.program);
  const u = l.uniforms;
  if (u.u_time) gl.uniform1f(u.u_time, time);
  if (u.u_resolution) gl.uniform2f(u.u_resolution, l.canvas.width, l.canvas.height);
  if (u.u_pointer) gl.uniform2f(u.u_pointer, l.pointer[0], l.pointer[1]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  debug.frames++;
  publish();
}

// Reduced motion: exactly one frame, the moment the skin names, then nothing.
function drawStill(l) {
  if (!l.ready || l.lost || l.stillDrawn) return;
  l.stillDrawn = true;
  attach(l);
  draw(l, (l.shader.stillAt ?? 0) * (l.shader.speed ?? 1));
}

function stopLoop(l) {
  cancelAnimationFrame(l.raf);
  l.raf = 0;
  l.running = false;
  debug.running = false;
  debug.fps = 0;
  publish();
}

function schedule(l) {
  if (layer !== l || !l.ready || l.lost) return;
  if (document.hidden) {
    stopLoop(l);
    return;
  }
  if (reducedMotion()) {
    stopLoop(l);
    drawStill(l);
    return;
  }
  if (l.running) return;
  l.running = true;
  l.stillDrawn = false;
  l.lastTick = performance.now();
  l.lastFrame = 0;
  debug.running = true;
  debug.fps = l.fps;
  publish();
  const interval = 1000 / l.fps;
  const tick = (now) => {
    if (layer !== l || !l.running) return;
    l.raf = requestAnimationFrame(tick);
    l.elapsed += (now - l.lastTick) / 1000;
    l.lastTick = now;
    if (now - l.lastFrame < interval - 1) return;
    l.lastFrame = now;
    attach(l);
    draw(l, l.elapsed * (l.shader.speed ?? 1));
  };
  l.raf = requestAnimationFrame(tick);
}
