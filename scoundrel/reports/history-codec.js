/* Compact, lossless action histories. Shared by the generator and report. */
(function (root) {
  "use strict";
  const E = root.Scoundrel || (typeof require === "function" ? require("../engine.js") : null);
  const cards = E.makeDeck();
  function encode(line) {
    const bytes = line.map(action => {
      if (action.type === "descend") return 130;
      if (action.type === "flee") return action.direction === "right" ? 129 : 128;
      const index = cards.findIndex(c => c.id === action.id);
      if (index < 0) throw Error("Unknown history card");
      return index | (action.mode === "weapon" ? 64 : 0);
    });
    return typeof btoa === "function" ? btoa(String.fromCharCode(...bytes)) : Buffer.from(bytes).toString("base64");
  }
  function decode(text) {
    if (typeof text !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) throw Error("Invalid history encoding");
    const bytes = typeof atob === "function" ? Array.from(atob(text), c => c.charCodeAt(0)) : [...Buffer.from(text, "base64")];
    return bytes.map(code => {
      if (code === 130) return { type: "descend" };
      if (code === 128 || code === 129) return { type: "flee", direction: code === 129 ? "right" : "left" };
      const card = cards[code & 63];
      if (!card || code >= 128 || (code & 64 && card.type !== "monster")) throw Error("Invalid history action");
      return card.type === "monster" ? { type: "fight", id: card.id, mode: code & 64 ? "weapon" : "bare" } : { type: card.type === "weapon" ? "equip" : "drink", id: card.id };
    });
  }
  const api = { encode, decode };
  root.ScoundrelHistory = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
