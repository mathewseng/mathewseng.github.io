// Test tooling only. Keep real audio scheduling/offline rendering without speaker output.
function muteRealtimeAudio() {
  const RealtimeContext =
    globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!RealtimeContext || !globalThis.AudioNode) return;
  const sinks = new WeakMap();
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  AudioNode.prototype.connect = function (destination, ...ports) {
    if (
      this.context instanceof RealtimeContext &&
      destination === this.context.destination
    ) {
      let sink = sinks.get(this.context);
      if (!sink) {
        sink = this.context.createGain();
        sink.gain.value = 0;
        connect.call(sink, destination);
        sinks.set(this.context, sink);
      }
      connect.call(this, sink, ...ports);
      return destination;
    }
    return connect.call(this, destination, ...ports);
  };
  AudioNode.prototype.disconnect = function (...args) {
    if (args[0] === this.context.destination && sinks.has(this.context))
      args[0] = sinks.get(this.context);
    return disconnect.apply(this, args);
  };
}
async function launchQuietBrowser(type, options = {}) {
  const name = type.name();
  const launch = { ...options, headless: options.headless ?? true };
  if (name === "chromium")
    launch.args = [...new Set([...(options.args || []), "--mute-audio"])];
  if (name === "firefox")
    launch.firefoxUserPrefs = {
      ...options.firefoxUserPrefs,
      "media.volume_scale": "0.0",
    };
  const browser = await type.launch(launch);
  // WebKit has no public Playwright mute flag. Silence only the final real-time
  // output, preserving the actual context, node scheduling and OfflineAudioContext.
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => {
    const context = await newContext(...args);
    await context.addInitScript(muteRealtimeAudio);
    return context;
  };
  return browser;
}
module.exports = { launchQuietBrowser, muteRealtimeAudio };
