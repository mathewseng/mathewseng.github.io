const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {
  launchQuietBrowser,
  muteRealtimeAudio,
} = require("../quiet-browser.cjs");

test("quiet launch preserves options and installs output muting in every context", async () => {
  for (const name of ["chromium", "firefox", "webkit"]) {
    let launched;
    const scripts = [];
    const type = {
      name: () => name,
      async launch(options) {
        launched = options;
        return {
          async newContext() {
            return {
              async addInitScript(fn) {
                scripts.push(fn);
              },
            };
          },
        };
      },
    };
    const options = { args: ["--test"], firefoxUserPrefs: { existing: true } };
    const browser = await launchQuietBrowser(type, options);
    await browser.newContext();
    await browser.newContext();
    assert.equal(launched.headless, true);
    assert.deepEqual(options.args, ["--test"]);
    assert.equal(scripts.length, 2);
    if (name === "chromium") assert.ok(launched.args.includes("--mute-audio"));
    if (name === "firefox")
      assert.deepEqual(launched.firefoxUserPrefs, {
        existing: true,
        "media.volume_scale": "0.0",
      });
  }
});

test("real-time output is silent; connect/disconnect semantics and offline rendering survive", () => {
  const world = vm.createContext({ assert });
  vm.runInContext(
    `
    class AudioNode {
      constructor(context) { this.context = context; this.connections = []; }
      connect(node, ...ports) { this.connections.push([node, ...ports]); return node; }
      disconnect(node) { this.disconnected = node; }
    }
    class Base {
      constructor() { this.destination = new AudioNode(this); this.gains = []; }
      createGain() { const node = new AudioNode(this); node.gain = {value: 1}; this.gains.push(node); return node; }
    }
    class AudioContext extends Base {}
    class OfflineAudioContext extends Base {}
    globalThis.AudioNode = AudioNode;
    globalThis.AudioContext = AudioContext;
    (${muteRealtimeAudio.toString()})();
    const live = new AudioContext(), a = new AudioNode(live), b = new AudioNode(live);
    assert.equal(a.connect(live.destination), live.destination);
    b.connect(live.destination);
    assert.equal(live.gains.length, 1);
    assert.equal(live.gains[0].gain.value, 0);
    assert.equal(a.connections[0][0], live.gains[0]);
    assert.equal(live.gains[0].connections[0][0], live.destination);
    a.disconnect(live.destination);
    assert.equal(a.disconnected, live.gains[0]);
    const offline = new OfflineAudioContext(), source = new AudioNode(offline);
    source.connect(offline.destination);
    assert.equal(source.connections[0][0], offline.destination);
    assert.equal(offline.gains.length, 0);
  `,
    world,
  );
});
