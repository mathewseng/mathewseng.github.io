import test from "node:test";
import assert from "node:assert/strict";
import {
  CUES,
  synthesizeCue,
  normalizeSound,
  DEFAULT_SOUND,
} from "../core/sound.mjs";
import { SoundPlayer } from "../ui/sound.mjs";
import { checkerFlight } from "../ui/motion.mjs";

test("sound preferences migrate safely and bound volume without accepting truthy strings", () => {
  for (const value of [
    null,
    undefined,
    [],
    {},
    "yes",
    { enabled: "true", volume: Infinity },
  ])
    assert.deepEqual(normalizeSound(value), DEFAULT_SOUND);
  assert.deepEqual(normalizeSound({ enabled: false, volume: 120 }), {
    enabled: false,
    volume: 100,
  });
  assert.deepEqual(normalizeSound({ enabled: true, volume: -4 }), {
    enabled: true,
    volume: 0,
  });
  assert.equal(normalizeSound({ volume: 38.8 }).volume, 39);
});
test("every original cue is deterministic, finite, non-silent, bounded and fades to zero", () => {
  const fingerprints = new Set();
  for (const sampleRate of [22050, 44100, 48000, 96000]) {
    for (const name of Object.keys(CUES)) {
      const a = synthesizeCue(name, sampleRate);
      assert.deepEqual(a, synthesizeCue(name, sampleRate));
      assert.ok(a.length / sampleRate < 0.5, name);
      let energy = 0,
        peak = 0;
      for (const value of a) {
        assert.ok(Number.isFinite(value), name);
        energy += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      assert.ok(peak > 0.025 && peak < 0.8, name);
      assert.ok(energy / a.length > 0.00001, name);
      assert.equal(a[0], 0);
      assert.equal(a.at(-1), 0);
      if (sampleRate === 44100) fingerprints.add(`${a.length}:${energy}`);
    }
  }
  assert.equal(fingerprints.size, Object.keys(CUES).length);
  assert.throws(() => synthesizeCue("unknown", 44100));
  for (const rate of [0, NaN, Infinity, -1, 200000])
    assert.throws(() => synthesizeCue("move", rate));
});
function context() {
  const sources = [];
  return {
    state: "suspended",
    currentTime: 1,
    sampleRate: 44100,
    destination: {},
    sources,
    createGain: () => ({
      gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} },
      connect() {},
    }),
    createBuffer: () => ({ copyToChannel() {} }),
    createBufferSource() {
      const source = {
        connect() {},
        start() {
          this.started = true;
        },
        stop() {
          this.stopped = true;
        },
        disconnect() {
          this.disconnected = true;
        },
      };
      sources.push(source);
      return source;
    },
    async resume() {
      this.state = "running";
    },
    async suspend() {
      this.state = "suspended";
    },
    async close() {
      this.state = "closed";
    },
  };
}
test("audio is lazy, never queues blocked cues and releases bounded voices on mute/background", async () => {
  const ctx = context();
  let created = 0,
    visible = true,
    pref = { ...DEFAULT_SOUND };
  const player = new SoundPlayer({
    createContext: () => {
      created++;
      return ctx;
    },
    preferences: () => pref,
    visible: () => visible,
  });
  assert.equal(player.play("roll"), false);
  assert.equal(created, 0);
  await player.unlock();
  assert.equal(created, 1);
  assert.equal(ctx.sources.length, 0, "Unlock must not replay earlier calls");
  assert.equal(player.play("move"), true);
  assert.equal(
    player.play("move"),
    false,
    "Duplicate contact inside 35ms is suppressed",
  );
  for (const name of Object.keys(CUES)) {
    ctx.currentTime += 0.05;
    player.play(name);
  }
  assert.equal(player.voices.size, 8);
  assert.ok(ctx.sources[0].stopped && ctx.sources[0].disconnected);
  pref.enabled = false;
  player.update();
  assert.equal(player.voices.size, 0);
  assert.ok(ctx.sources.every((source) => source.disconnected));
  assert.equal(player.play("roll"), false);
  pref.enabled = true;
  pref.volume = 0;
  assert.equal(player.play("roll"), false);
  pref.volume = 35;
  player.play("roll");
  visible = false;
  player.suspend();
  assert.equal(player.voices.size, 0);
  assert.equal(player.play("roll"), false);
  visible = true;
  assert.equal(
    player.play("roll"),
    false,
    "Returning to foreground does not resume on its own",
  );
  await player.unlock();
  assert.equal(player.play("roll"), true);
  player.destroy();
  assert.equal(player.buffers.size, 0);
  assert.equal(player.voices.size, 0);
  assert.equal(ctx.state, "closed");
});
test("unsupported/blocked Web Audio is silent and never breaks game actions", async () => {
  for (const createContext of [
    () => null,
    () => {
      throw new Error("Unavailable");
    },
  ]) {
    const player = new SoundPlayer({
      createContext,
      preferences: () => DEFAULT_SOUND,
      visible: () => true,
    });
    await player.unlock();
    assert.equal(player.play("move"), false);
  }
  const ctx = context();
  ctx.resume = async () => {
    throw new Error("Gesture needed");
  };
  const player = new SoundPlayer({
    createContext: () => ctx,
    preferences: () => DEFAULT_SOUND,
    visible: () => true,
  });
  await player.unlock();
  assert.equal(player.play("move"), false);
});
test("checker flight contacts every route waypoint, ends exactly, and stays bounded for doubles", () => {
  const points = [
    { x: 80, y: 595 },
    { x: 200, y: 548 },
    { x: 320, y: 65 },
    { x: 560, y: 112 },
    { x: 680, y: 159 },
  ];
  for (let n = 2; n <= 5; n++) {
    const route = points.slice(0, n),
      path = checkerFlight(route);
    assert.ok(path.duration >= 200 && path.duration <= 640);
    assert.equal(path.landings.length, route.length - 1);
    assert.equal(path.frames[0].offset, 0);
    assert.equal(path.frames.at(-1).offset, 1);
    assert.equal(
      path.frames.at(-1).transform,
      `translate(${route.at(-1).x}px, ${route.at(-1).y}px) scale(1)`,
    );
    for (let i = 1; i < path.frames.length; i++)
      assert.ok(path.frames[i].offset > path.frames[i - 1].offset);
    for (const point of route)
      assert.ok(
        path.frames.some(
          (frame) =>
            frame.transform ===
            `translate(${point.x}px, ${point.y}px) scale(1)`,
        ),
      );
  }
});
