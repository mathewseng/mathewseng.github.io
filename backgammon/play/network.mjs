// SPDX-License-Identifier: GPL-3.0-or-later
import {
  session,
  validateSession,
  envelope,
  accept,
  recover,
  checkpoint,
  verifyHistory,
} from "../core/protocol.mjs";
import { cryptoDice } from "../core/rules.mjs";
import { saveMatchHistory } from "../core/storage.mjs";
const KEY = "backgammon.v1.room.";
function script(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () =>
      reject(
        new Error(
          "Connection library failed to load. Check your network and retry.",
        ),
      );
    document.head.append(s);
  });
}
export class Online {
  constructor({
    onChange = () => {},
    onStatus = () => {},
    onError = () => {},
  } = {}) {
    Object.assign(this, { onChange, onStatus, onError });
    this.model = null;
    this.roster = [];
    this.pending = false;
    this.localCheckpoint = null;
  }
  async init() {
    if (this.room) return;
    if (!window.Peer)
      await script("https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js");
    if (!window.PeerRoom) await script("/shared/peer-room.js");
    this.room = new window.PeerRoom({
      namespace: "backgammon-v1",
      maxPlayers: 2,
      storageKey: KEY + "session",
    });
    const r = this.room;
    r.onStatus = (status, message) => {
      this.onStatus(status, message);
      this.onChange();
    };
    r.onError = (e) => {
      this.pending = false;
      this.onError(e);
      this.onChange();
    };
    r.onState = (s) => {
      try {
        validateSession(s);
        if (
          this.model?.id === s.id &&
          (s.epoch < this.model.epoch ||
            (s.epoch === this.model.epoch &&
              s.revision < this.model.revision))
        )
          return;
        if (this.model?.recovery && !s.recovery)
          this.onStatus(
            "connected",
            "Match recovered · both players confirmed the saved state.",
          );
        this.model = s;
        this.pending = false;
        clearTimeout(this.pendingTimer);
        this.persist();
        this.onChange();
      } catch (e) {
        this.onError(e);
      }
    };
    r.onRoster = (roster) => {
      this.roster = roster;
      if (r.isHost && this.model && !this.model.started) {
        this.model.players = roster
          .slice(0, 2)
          .map((p) => ({ id: p.id, name: p.name }));
        this.publish();
      }
      this.onChange();
    };
    r.onAction = (id, command) => {
      try {
        this.model = accept(this.model, id, command, {
          hostId: r.clientId,
          connected: this.roster
            .filter((p) => p.connected)
            .map((p) => p.id),
          dice: cryptoDice,
          newId: () => crypto.randomUUID(),
        });
        this.publish();
      } catch (e) {
        r.broadcastEvent({ type: "error", target: id, message: e.message });
      }
    };
    r.onEvent = (_, event) => {
      if (event?.type === "error" && event.target === r.clientId) {
        this.pending = false;
        clearTimeout(this.pendingTimer);
        this.onError(new Error(String(event.message).slice(0, 500)));
        this.onChange();
      }
    };
    r.onBecomeHost = (s) => {
      try {
        if (!s)
          throw new Error(
            "Recovery data is missing. Reconnect or export your saved match.",
          );
        verifyHistory(s);
        this.localCheckpoint = checkpoint(s);
        this.model = recover(s, r.clientId);
        this.publish();
        this.onStatus(
          "paused",
          "Host changed. Match paused until both original players confirm the same saved state.",
        );
      } catch (e) {
        this.onError(e);
      }
    };
  }
  async create(name, options) {
    await this.init();
    await this.room.create(name);
    this.roster = this.room.snapshot().players;
    this.model = session(this.roster, options, crypto.randomUUID());
    this.publish();
  }
  async join(code, name) {
    await this.init();
    this.model = null;
    await this.room.join(code, name);
  }
  async resume() {
    await this.init();
    const saved = this.room.savedSession();
    if (!saved) throw new Error("No saved room found.");
    const stored = JSON.parse(
      localStorage.getItem(KEY + saved.roomCode) || "null",
    );
    if (stored) {
      validateSession(stored);
      this.localCheckpoint = checkpoint(stored);
    }
    await this.room.resume();
    this.roster = this.room.snapshot().players;
    if (this.room.isHost) {
      if (!stored)
        throw new Error(
          "The room snapshot is missing. The old match cannot safely resume.",
        );
      verifyHistory(stored);
      this.model = recover(stored, this.room.clientId);
      this.publish();
    }
  }
  persist() {
    if (this.model?.started)
      saveMatchHistory(
        this.model,
        this.model.players.map((p) => p.name),
        "online",
      ).catch(this.onError);
    try {
      localStorage.setItem(
        KEY + this.room.roomCode,
        JSON.stringify(this.model),
      );
    } catch {
      this.onError(
        new Error(
          "Room recovery could not be saved. Export the match history.",
        ),
      );
    }
  }
  publish() {
    validateSession(this.model);
    this.persist();
    this.room.publishState(this.model);
  }
  send(action) {
    if (this.pending) throw new Error("Waiting for the previous action.");
    if (!this.model) throw new Error("Room not ready.");
    this.pending = true;
    this.pendingTimer = setTimeout(() => {
      this.pending = false;
      this.onError(
        new Error(
          "No acknowledgement received. Reconnect before trying again.",
        ),
      );
      this.onChange();
    }, 8000);
    this.room.sendAction(
      envelope(this.model, this.room.clientId, action, crypto.randomUUID()),
    );
    this.onChange();
  }
  confirmRecovery() {
    this.send({
      type: "recover",
      checkpoint: this.localCheckpoint || this.model.recovery,
    });
  }
  get seat() {
    return (
      this.model?.players.findIndex((p) => p.id === this.room?.clientId) ??
      -1
    );
  }
  get ready() {
    return (
      this.room?.connected &&
      !this.model?.recovery &&
      this.model?.players.length === 2 &&
      this.model.players.every((p) =>
        this.roster.some((r) => r.id === p.id && r.connected),
      )
    );
  }
  leave() {
    this.room?.leave();
    this.model = null;
    this.pending = false;
    clearTimeout(this.pendingTimer);
    this.onChange();
  }
}
