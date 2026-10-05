// SPDX-License-Identifier: GPL-3.0-or-later
// Original, deterministic sound synthesis. No recordings, downloads or game RNG.
export const DEFAULT_SOUND = Object.freeze({ enabled: true, volume: 35 });
export function normalizeSound(value) {
  return {
    enabled:
      typeof value?.enabled === "boolean"
        ? value.enabled
        : DEFAULT_SOUND.enabled,
    volume:
      typeof value?.volume === "number" && Number.isFinite(value.volume)
        ? Math.round(Math.max(0, Math.min(100, value.volume)))
        : DEFAULT_SOUND.volume,
  };
}

// Each contact combines a short filtered noise transient with a damped body.
// Frequencies stay soft; the longest cue is under half a second. Peak amplitude
// is bounded before user volume is applied, including overlapping contacts.
const contact = (at, frequency, level = 1, decay = 0.032) => ({
  at,
  frequency,
  level,
  decay,
});
export const CUES = Object.freeze({
  select: [contact(0, 960, 0.25, 0.012)],
  move: [contact(0, 580, 0.75)],
  hit: [contact(0, 460, 0.9), contact(0.046, 820, 0.48, 0.025)],
  off: [contact(0, 780, 0.65), contact(0.065, 1170, 0.4)],
  undo: [contact(0, 710, 0.48), contact(0.05, 510, 0.36)],
  reset: [
    contact(0, 780, 0.48),
    contact(0.055, 620, 0.4),
    contact(0.11, 470, 0.32),
  ],
  roll: [
    contact(0, 740, 0.65),
    contact(0.042, 520, 0.45),
    contact(0.092, 860, 0.65),
    contact(0.164, 630, 0.48),
    contact(0.235, 460, 0.3),
  ],
  die: [contact(0, 670, 0.7), contact(0.046, 910, 0.3, 0.02)],
  confirm: [contact(0, 760, 0.38), contact(0.06, 1010, 0.32)],
  cube: [contact(0, 400, 0.72), contact(0.075, 600, 0.58)],
  finish: [
    contact(0, 523.25, 0.36, 0.055),
    contact(0.09, 659.25, 0.32, 0.055),
    contact(0.18, 783.99, 0.3, 0.06),
  ],
});

export function synthesizeCue(name, sampleRate) {
  if (!CUES[name]) throw new Error("Unknown sound cue.");
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000)
    throw new Error("Unsupported audio sample rate.");
  const contacts = CUES[name];
  const length = Math.ceil(
    (Math.max(...contacts.map((c) => c.at + c.decay * 5)) + 0.008) * sampleRate,
  );
  const samples = new Float32Array(length);
  let seed = 0x6b8b4567;
  for (const c of contacts) {
    let smooth = 0;
    const start = Math.round(c.at * sampleRate);
    for (let i = 0; i < c.decay * 5 * sampleRate; i++) {
      const t = i / sampleRate;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      smooth += ((seed >>> 0) / 2147483648 - 1 - smooth) * 0.22;
      const attack = Math.min(1, t / 0.0015);
      const body =
        Math.sin(2 * Math.PI * c.frequency * t) * Math.exp(-t / c.decay);
      const tick = smooth * Math.exp(-t / 0.006);
      samples[start + i] += c.level * attack * (body * 0.28 + tick * 0.5);
    }
  }
  // Soft limiting protects against contact overlap. Fade the end to zero.
  const fade = Math.round(sampleRate * 0.008);
  for (let i = 0; i < samples.length; i++)
    samples[i] =
      Math.tanh(samples[i]) * Math.min(1, (samples.length - 1 - i) / fade);
  return samples;
}
