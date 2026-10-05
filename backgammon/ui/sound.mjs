// SPDX-License-Identifier: GPL-3.0-or-later
import { settings, saveSettings } from "../core/storage.mjs";
import { synthesizeCue, normalizeSound } from "../core/sound.mjs";

let localPreference = null;
export const soundPreferences = () => localPreference || settings().sound;
export function setSoundPreferences(value) {
  const next = normalizeSound({ ...soundPreferences(), ...value });
  try {
    saveSettings({ sound: next });
    localPreference = null;
    return true;
  } catch {
    // Mute must still work when browser storage is unavailable or full.
    localPreference = next;
    return false;
  }
}

// One lazy context per page. A trusted gesture unlocks it; blocked/unsupported
// audio never delays a game action. No sound is queued to play after unlocking.
export class SoundPlayer {
  constructor({
    createContext,
    preferences = soundPreferences,
    visible = () => !document.hidden,
  } = {}) {
    this.createContext =
      createContext ||
      (() => {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        return Audio ? new Audio({ latencyHint: "interactive" }) : null;
      });
    this.preferences = preferences;
    this.visible = visible;
    this.buffers = new Map();
    this.voices = new Set();
    this.last = new Map();
  }
  unlock() {
    if (!this.preferences().enabled || !this.visible()) return;
    try {
      if (!this.context || this.context.state === "closed") {
        this.context = this.createContext();
        if (!this.context) return;
        this.buffers.clear();
        this.master = this.context.createGain();
        this.master.gain.value = this.preferences().volume / 100;
        this.master.connect(this.context.destination);
      }
      this.update();
      if (
        this.context.state === "suspended" ||
        this.context.state === "interrupted"
      )
        return this.context.resume().catch(() => {});
    } catch {
      /* Audio is an optional enhancement. */
    }
  }
  update() {
    const value = this.preferences();
    if (!value.enabled || value.volume === 0 || !this.visible()) this.stop();
    if (this.master) {
      const now = this.context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(
        value.enabled ? value.volume / 100 : 0,
        now,
        0.012,
      );
    }
  }
  play(name) {
    const value = this.preferences(),
      ctx = this.context;
    if (
      !value.enabled ||
      !value.volume ||
      !this.visible() ||
      ctx?.state !== "running"
    )
      return false;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -Infinity) < 0.035) return false;
    let source;
    try {
      let buffer = this.buffers.get(name);
      if (!buffer) {
        const samples = synthesizeCue(name, ctx.sampleRate);
        buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buffer.copyToChannel(samples, 0);
        this.buffers.set(name, buffer);
      }
      if (this.voices.size >= 8)
        this.release(this.voices.values().next().value);
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master);
      source.onended = () => this.release(source);
      this.voices.add(source);
      this.last.set(name, now);
      source.start();
      return true;
    } catch {
      if (source) this.release(source);
      return false;
    }
  }
  release(source) {
    if (!this.voices.delete(source)) return;
    source.onended = null;
    try {
      source.stop();
    } catch {}
    source.disconnect();
  }
  stop() {
    for (const source of [...this.voices]) this.release(source);
    this.last.clear();
  }
  suspend() {
    this.stop();
    this.context?.suspend().catch(() => {});
  }
  destroy() {
    this.stop();
    this.buffers.clear();
    this.context?.close().catch(() => {});
    this.context = null;
  }
}
export const sound = new SoundPlayer();
let installed = false;
export function installSound() {
  if (installed) return;
  installed = true;
  const gesture = (event) => {
    if (event.isTrusted) sound.unlock();
  };
  for (const type of ["pointerdown", "keydown"])
    document.addEventListener(type, gesture, { capture: true, passive: true });
  addEventListener("bg-sound", () => sound.update());
  addEventListener("storage", (event) => {
    if (event.key === "backgammon.v1.settings" || event.key === null) {
      sound.update();
      dispatchEvent(new Event("bg-sound"));
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sound.suspend();
  });
  addEventListener("pagehide", () => sound.suspend());
}
