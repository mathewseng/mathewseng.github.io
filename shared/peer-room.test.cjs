const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PeerRoom } = require("./peer-room.js");

class Connection extends EventEmitter {
  constructor(peer) { super(); this.peer = peer; this.open = true; this.messages = []; }
  send(message) { this.messages.push(message); }
  close() { this.open = false; this.emit("close"); }
}

const host = new PeerRoom({ maxPlayers: 2 });
const anotherTab = new PeerRoom();
assert.notEqual(host.clientId, anotherTab.clientId);
host.isHost = true;
host.roster.set(host.clientId, { id: host.clientId, host: true, name: "Host" });
host.playerOrder = [host.clientId];
const actions = [];
host.onAction = (id, action) => actions.push({ id, action });
host.publishState({ public: "board", secret: "deck" }, (state, id) => ({ public: state.public, viewer: id }));
const guest = new Connection("guest-peer");
host.acceptConnection(guest);
guest.emit("data", { type: "hello", clientId: "guest", name: "Guest" });
assert.equal(host.roster.size, 2);
assert.deepEqual(guest.messages.find((m) => m.type === "state").state, { public: "board", viewer: "guest" });
guest.emit("data", { type: "action", action: { type: "place" } });
assert.equal(actions.length, 1);

for (const id of [host.clientId, "guest", "overflow"]) {
  const rejected = new Connection("rejected-" + id);
  host.acceptConnection(rejected);
  rejected.emit("data", { type: "hello", clientId: id });
  assert.ok(rejected.messages.some((m) => m.type === "error"));
  rejected.emit("data", { type: "action", action: { type: "place" } });
  rejected.close();
  assert.equal(actions.length, 1, "a rejected connection cannot send game actions");
  assert.equal(host.roster.get("guest").connected, true);
}
guest.close();
assert.equal(host.roster.get("guest").connected, false);
const resumed = new Connection("resumed-peer");
host.acceptConnection(resumed);
resumed.emit("data", { type: "hello", clientId: "guest", reconnecting: true });
assert.equal(host.roster.size, 2);
assert.equal(host.roster.get("guest").connected, true);
assert.ok(resumed.messages.some((m) => m.type === "state"));
guest.emit("close");
assert.equal(host.connections.get("guest"), resumed, "stale close must not remove a new connection");
console.log("Peer room identity, rejection, authorization, filtered state, and reconnect tests passed.");
