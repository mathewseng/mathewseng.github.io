import test from "node:test";
import assert from "node:assert/strict";
import {
  CUES,
  synthesizeCue,
  normalizeSound,
  DEFAULT_SOUND,
} from "../core/sound.mjs";
import { SoundPlayer } from "../ui/sound.mjs";
import { checkerFlight, checkerDrop } from "../ui/motion.mjs";

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
    clock = 1000,
    visible = true,
    pref = { ...DEFAULT_SOUND };
  const player = new SoundPlayer({
    createContext: () => {
      created++;
      return ctx;
    },
    preferences: () => pref,
    visible: () => visible,
    now: () => clock,
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
    clock += 50;
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
test("opening die cues recover after 35 ms even when the audio sample clock stalls", async () => {
  const ctx = context();
  let clock = 0;
  const player = new SoundPlayer({createContext:()=>ctx,preferences:()=>DEFAULT_SOUND,visible:()=>true,now:()=>clock});
  await player.unlock();
  assert.equal(player.play("die"),true);
  clock = 20;
  assert.equal(player.play("die"),false);
  clock = 350;
  assert.equal(ctx.currentTime,1,"Audio sample time has not advanced");
  assert.equal(player.play("die"),true);
  assert.equal(ctx.sources.length,2);
  player.destroy();
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
    assert.ok(path.duration >= 460 && path.duration <= 1080);
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


test("checker flight has continuous progress through the middle and gentle departure/arrival", () => {
  const flight = checkerFlight([{x:0,y:100},{x:300,y:100}]);
  const positions = flight.frames.map(f => Number(f.transform.match(/translate\(([^p]+)px/)[1]));
  const speeds = positions.slice(1).map((x,i) => x-positions[i]);
  assert.ok(flight.frames.length >= 24, "enough samples for a smooth sub-20ms cadence");
  assert.ok(speeds.every(v => v > 0), "never stop/reverse midway");
  const peak = Math.max(...speeds);
  assert.ok(speeds[0] < peak*.05 && speeds.at(-1) < peak*.05, "gentle endpoints");
  const middle = Math.floor(speeds.length/2);
  assert.ok(speeds[middle] > peak*.95, "no artificial stop at the apex");
  assert.equal(flight.landings[0],flight.duration,"sound and contact align with visual landing");
});


test("drag release lowers smoothly from the exact held pose without a second hop", () => {
  const origin={x:100,y:200,scale:1.1},dest={x:250,y:400};
  const flight=checkerDrop(origin,dest);
  assert.ok(flight.duration>=150 && flight.duration<=300);
  assert.equal(flight.frames[0].transform,'translate(100px, 200px) scale(1.1)');
  assert.equal(flight.frames.at(-1).transform,'translate(250px, 400px) scale(1)');
  const values=flight.frames.map(f=>f.transform.match(/[-\d.]+/g).map(Number));
  for(let i=1;i<values.length;i++) {
    assert.ok(values[i][0]>=values[i-1][0]); assert.ok(values[i][1]>=values[i-1][1]);
    assert.ok(values[i][2]<=values[i-1][2]);
    assert.ok(Math.abs((values[i][0]-100)/150-(values[i][1]-200)/200)<1e-10);
  }
});
