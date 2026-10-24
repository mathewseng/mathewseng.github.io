// SPDX-License-Identifier: GPL-3.0-or-later
// Applies a skin to the document (skin-contract.md §5): html[data-skin], the
// inline token properties, color-scheme, <meta name="theme-color">,
// <style id="skin-style">, <svg id="skin-board-definitions">, the shader layer
// and the pre-paint boot cache. DOM only; nothing under core/ imports it.
import { skinById, DEFAULT_SKIN } from "../skins/index.mjs";
import { settings, saveSettings } from "../core/storage.mjs";
import { applyBoardTheme } from "../core/appearance.mjs";
import { startShader, stopShader } from "./shader-layer.mjs";
import { applyMotionSettings } from "./motion.mjs";

export const BOOT_KEY = "backgammon.v1.skin-boot";
// Token keys whose CSS custom property is not simply --<key>.
const TOKEN_PROPERTIES = {
  surface2: "--surface-2",
  surface3: "--surface-3",
  lineStrong: "--line-strong",
  lineOpaque: "--line-opaque",
  controlBorder: "--control-border",
  onAccent: "--on-accent",
  accent2: "--accent-2",
  accentSoft: "--accent-soft",
  goodSoft: "--good-soft",
  badSoft: "--bad-soft",
  warnSoft: "--warn-soft",
  infoSoft: "--info-soft",
  radiusSm: "--r-sm",
  radiusMd: "--r-md",
  radiusLg: "--r-lg",
  radiusPill: "--r-pill",
  shadowTile: "--shadow-tile",
  shadowRaised: "--shadow-raised",
  shadowSheet: "--shadow-sheet",
  fontSans: "--font-sans",
  fontMono: "--font-mono",
};
export const tokenProperty = (key) => TOKEN_PROPERTIES[key] || `--${key}`;
let appliedProperties = new Set();

function styleNode() {
  let node = document.getElementById("skin-style");
  if (!node) {
    node = document.createElement("style");
    node.id = "skin-style";
    document.head.append(node);
  }
  return node;
}
// Separate from #board-pattern-definitions, which applyBoardTheme rebuilds.
// Re-appended when a page rebuilds <body> (ui/shell.mjs shell()).
function defsNode() {
  let node = document.getElementById("skin-board-definitions");
  if (!node) {
    node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    node.id = "skin-board-definitions";
    node.setAttribute("width", "0");
    node.setAttribute("height", "0");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    node.setAttribute("style", "position:absolute;pointer-events:none");
  }
  if (node.parentNode !== document.body) document.body.append(node);
  return node;
}

// Idempotent. Unknown ids apply the default skin. Returns the skin applied.
export function applySkin(id) {
  const skin = skinById(id) || skinById(DEFAULT_SKIN);
  const html = document.documentElement;
  // The hub, opening guide and docs also use the saved presentation speed.
  const motion = settings();
  if (html.dataset.motionScale !== String(motion.motionScale) ||
      html.dataset.motion !== (motion.motionScale === 0 ? "reduce" : motion.motion))
    applyMotionSettings(motion);
  html.dataset.skin = skin.id;
  const next = new Set();
  for (const [key, value] of Object.entries(skin.tokens || {})) {
    const property = tokenProperty(key);
    html.style.setProperty(property, value);
    next.add(property);
  }
  for (const property of appliedProperties)
    if (!next.has(property)) html.style.removeProperty(property);
  appliedProperties = next;
  html.style.colorScheme = skin.scheme === "light" ? "light" : "dark";
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = skin.tokens.page;
  const style = styleNode();
  if (style.textContent !== skin.css) style.textContent = skin.css || "";
  const defs = defsNode();
  if (defs.dataset.skin !== skin.id) {
    defs.innerHTML = skin.defs ? `<defs>${skin.defs}</defs>` : "";
    defs.dataset.skin = skin.id;
  }
  if (skin.shader) startShader(skin);
  else stopShader();
  try {
    localStorage.setItem(
      BOOT_KEY,
      JSON.stringify({
        id: skin.id,
        page: skin.tokens.page,
        surface: skin.tokens.surface,
        ink: skin.tokens.ink,
        muted: skin.tokens.muted,
        scheme: skin.scheme === "light" ? "light" : "dark",
      }),
    );
  } catch {}
  return skin;
}

// Saves the skin and its board palette, applies both and announces bg-skin.
// Individual board colours and patterns may be edited afterwards; the skin
// keeps its chrome.
export function selectSkin(id) {
  const skin = skinById(id) || skinById(DEFAULT_SKIN);
  saveSettings({
    skin: skin.id,
    boardTheme: {
      version: 1,
      preset: skin.id === "classic" ? "slate" : skin.id,
      colors: {},
      ...(skin.patterns && Object.keys(skin.patterns).length ? { patterns: skin.patterns } : {}),
    },
  });
  applySkin(skin.id);
  applyBoardTheme(settings().boardTheme);
  dispatchEvent(new CustomEvent("bg-skin", { detail: { id: skin.id } }));
  return skin;
}

// Applies the saved skin once a page's modules run (the inline head script
// only paints data-skin and --page before that).
export function bootSkin() {
  return applySkin(settings().skin);
}
