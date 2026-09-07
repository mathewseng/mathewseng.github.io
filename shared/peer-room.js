(function (root) {
  "use strict";

  const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  class PeerRoom {
    constructor(options = {}) {
      this.namespace = options.namespace || "table";
      this.maxPlayers = options.maxPlayers || 3;
      this.storageKey = options.storageKey || `${this.namespace}.session.v1`;
      this.peer = null;
      this.hostConnection = null;
      this.connections = new Map();
      this.connectionClients = new Map();
      this.roster = new Map();
      this.playerOrder = [];
      this.roomCode = "";
      this.clientId = this.loadClientId();
      this.name = "Player";
      this.hostClientId = null;
      this.isHost = false;
      this.connected = false;
      this.lastFullState = null;
      this.lastRevision = 0;
      this.migrationTimer = null;
      this.reconnectTimer = null;
      this.healthTimer = null;
      this.lastHostResponse = 0;
      this.intentionalClose = false;
      this.onRoster = null;
      this.onState = null;
      this.onAction = null;
      this.onEvent = null;
      this.onStatus = null;
      this.onError = null;
      this.onBecomeHost = null;
    }

    async create(name, requestedCode = "") {
      this.resetRuntime();
      this.name = cleanName(name);
      this.roomCode = cleanCode(requestedCode) || randomCode();
      this.isHost = true;
      this.hostClientId = this.clientId;
      await this.openPeer(this.hostPeerId());
      this.connected = true;
      this.roster.set(this.clientId, this.playerRecord(true));
      this.playerOrder = [this.clientId];
      this.saveSession();
      this.emitRoster();
      this.emitStatus("connected", `Room ${this.roomCode} created`);
      return this.snapshot();
    }

    async join(code, name, options = {}) {
      this.resetRuntime();
      this.name = cleanName(name);
      this.roomCode = cleanCode(code);
      if (!this.roomCode) throw new Error("Enter a valid room code.");
      this.isHost = false;
      await this.openPeer();
      await this.connectToHost(Boolean(options.reconnecting));
      return this.snapshot();
    }

    async resume() {
      const session = this.savedSession();
      if (!session) throw new Error("No saved table is available.");
      this.clientId = session.clientId || this.clientId;
      this.name = session.name;
      this.roomCode = session.roomCode;
      return session.isHost ? this.create(this.name, this.roomCode) : this.join(this.roomCode, this.name, { reconnecting: true });
    }

    savedSession() {
      try {
        const value = JSON.parse(localStorage.getItem(this.storageKey) || "null");
        if (!value || Date.now() - Number(value.savedAt) > 12 * 60 * 60 * 1000) return null;
        return value;
      } catch (error) {
        return null;
      }
    }

    sendAction(action) {
      if (!this.connected) throw new Error("Connect to a table first.");
      if (this.isHost) {
        if (this.onAction) this.onAction(this.clientId, clone(action));
        return;
      }
      this.sendHost({ type: "action", action: clone(action) });
    }

    sendEvent(event) {
      const message = { type: "event", event: clone(event) };
      if (this.isHost) {
        this.broadcast(message);
        if (this.onEvent) this.onEvent(this.clientId, message.event);
      } else {
        this.sendHost(message);
      }
    }

    publishState(fullState, viewForClient) {
      if (!this.isHost) return;
      this.lastFullState = clone(fullState);
      this.lastRevision += 1;
      this.connections.forEach((connection, clientId) => {
        if (!connection.open) return;
        const view = typeof viewForClient === "function" ? viewForClient(fullState, clientId) : fullState;
        connection.send({ type: "state", revision: this.lastRevision, state: clone(view) });
        connection.send({ type: "recovery", revision: this.lastRevision, state: this.lastFullState });
      });
      const localView = typeof viewForClient === "function" ? viewForClient(fullState, this.clientId) : fullState;
      if (this.onState) this.onState(clone(localView), this.lastRevision);
    }

    broadcastEvent(event) {
      if (!this.isHost) return;
      this.broadcast({ type: "event", event: clone(event) });
      if (this.onEvent) this.onEvent(this.clientId, clone(event));
    }

    leave() {
      this.intentionalClose = true;
      if (!this.isHost) this.sendHost({ type: "leave" });
      if (this.isHost) this.broadcast({ type: "room_closed" });
      this.clearTimers();
      this.closeConnections();
      if (this.peer) this.peer.destroy();
      this.peer = null;
      this.connected = false;
      localStorage.removeItem(this.storageKey);
      this.emitStatus("disconnected", "Left table");
    }

    snapshot() {
      return {
        clientId: this.clientId,
        roomCode: this.roomCode,
        isHost: this.isHost,
        connected: this.connected,
        hostClientId: this.hostClientId,
        players: this.playerOrder.map((id) => this.roster.get(id)).filter(Boolean),
      };
    }

    hostPeerId() {
      return `${this.namespace}-${this.roomCode}`;
    }

    playerRecord(host = false) {
      return { id: this.clientId, name: this.name, host, connected: true };
    }

    loadClientId() {
      const key = `${this.storageKey}.clientId`;
      let value = localStorage.getItem(key);
      if (!value) {
        value = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(key, value);
      }
      return value;
    }

    saveSession() {
      localStorage.setItem(this.storageKey, JSON.stringify({
        clientId: this.clientId,
        name: this.name,
        roomCode: this.roomCode,
        isHost: this.isHost,
        savedAt: Date.now(),
      }));
    }

    openPeer(id) {
      return new Promise((resolve, reject) => {
        if (typeof root.Peer !== "function") {
          reject(new Error("The peer connection library did not load."));
          return;
        }
        const peer = new root.Peer(id, { debug: 0 });
        let settled = false;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          peer.destroy();
          reject(new Error("Peer connection timed out."));
        }, 12000);
        peer.on("open", () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          this.peer = peer;
          this.bindPeer(peer);
          resolve(peer.id);
        });
        peer.on("error", (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          peer.destroy();
          reject(peerError(error));
        });
      });
    }

    bindPeer(peer) {
      peer.on("connection", (connection) => this.acceptConnection(connection));
      peer.on("disconnected", () => {
        if (!this.intentionalClose) {
          try { peer.reconnect(); } catch (error) { this.emitError(error); }
        }
      });
      peer.on("error", (error) => this.emitError(peerError(error)));
    }

    connectToHost(reconnecting = false) {
      return new Promise((resolve, reject) => {
        const connection = this.peer.connect(this.hostPeerId(), { reliable: true, serialization: "json" });
        const timeout = setTimeout(() => reject(new Error("Room not found or connection timed out.")), 12000);
        connection.on("open", () => {
          clearTimeout(timeout);
          this.hostConnection = connection;
          this.connected = true;
          this.bindHostConnection(connection);
          connection.send({ type: "hello", clientId: this.clientId, name: this.name, reconnecting });
          this.startHealthMonitor();
          this.saveSession();
          this.emitStatus("connected", `Connected to ${this.roomCode}`);
          resolve();
        });
        connection.on("error", (error) => {
          clearTimeout(timeout);
          reject(peerError(error));
        });
      });
    }

    bindHostConnection(connection) {
      connection.on("data", (message) => this.handleClientMessage(message));
      connection.on("close", () => {
        if (this.intentionalClose) return;
        this.connected = false;
        this.emitStatus("reconnecting", "Host disconnected; recovering table");
        this.scheduleMigration();
      });
      connection.on("error", (error) => this.emitError(peerError(error)));
    }

    acceptConnection(connection) {
      if (!this.isHost) {
        connection.close();
        return;
      }
      let clientId = null;
      connection.on("data", (message) => {
        if (!message || typeof message !== "object") return;
        if (!clientId) {
          if (message.type !== "hello") return;
          clientId = String(message.clientId || "");
          if (!clientId || (!this.roster.has(clientId) && this.roster.size >= this.maxPlayers)) {
            connection.send({ type: "error", message: "This table is full." });
            connection.close();
            return;
          }
          this.connectionClients.set(connection.peer, clientId);
          this.connections.get(clientId)?.close();
          this.connections.set(clientId, connection);
          const existing = this.roster.get(clientId);
          this.roster.set(clientId, { id: clientId, name: cleanName(message.name || existing?.name), host: false, connected: true });
          if (!this.playerOrder.includes(clientId)) this.playerOrder.push(clientId);
          connection.send({
            type: "welcome",
            clientId,
            roomCode: this.roomCode,
            hostClientId: this.clientId,
            roster: this.rosterPayload(),
            playerOrder: this.playerOrder.slice(),
          });
          this.broadcastRoster();
          if (this.lastFullState) {
            connection.send({ type: "recovery", revision: this.lastRevision, state: this.lastFullState });
          }
          this.emitRoster();
          return;
        }
        this.handleHostMessage(clientId, message);
      });
      connection.on("close", () => {
        if (!clientId) return;
        this.connections.delete(clientId);
        const player = this.roster.get(clientId);
        if (player) this.roster.set(clientId, { ...player, connected: false });
        this.broadcastRoster();
        this.emitRoster();
      });
      connection.on("error", (error) => this.emitError(peerError(error)));
    }

    handleHostMessage(clientId, message) {
      if (message.type === "ping") {
        const connection = this.connections.get(clientId);
        if (connection?.open) connection.send({ type: "pong", sentAt: message.sentAt });
        return;
      }
      if (message.type === "action" && this.onAction) this.onAction(clientId, clone(message.action));
      if (message.type === "event") {
        this.broadcast({ type: "event", clientId, event: clone(message.event) }, clientId);
        if (this.onEvent) this.onEvent(clientId, clone(message.event));
      }
      if (message.type === "leave") {
        this.connections.get(clientId)?.close();
        this.connections.delete(clientId);
        this.roster.delete(clientId);
        this.playerOrder = this.playerOrder.filter((id) => id !== clientId);
        this.broadcastRoster();
        this.emitRoster();
      }
    }

    handleClientMessage(message) {
      if (!message || typeof message !== "object") return;
      this.lastHostResponse = Date.now();
      if (message.type === "pong") return;
      if (message.type === "welcome" || message.type === "roster") {
        this.hostClientId = message.hostClientId;
        this.playerOrder = Array.isArray(message.playerOrder) ? message.playerOrder.slice() : this.playerOrder;
        this.roster = new Map((message.roster || []).map((player) => [player.id, player]));
        this.emitRoster();
      }
      if (message.type === "state" && Number(message.revision) >= this.lastRevision) {
        this.lastRevision = Number(message.revision);
        if (this.onState) this.onState(clone(message.state), this.lastRevision);
      }
      if (message.type === "recovery" && Number(message.revision) >= this.lastRevision) {
        this.lastRevision = Number(message.revision);
        this.lastFullState = clone(message.state);
      }
      if (message.type === "event" && this.onEvent) this.onEvent(message.clientId || this.hostClientId, clone(message.event));
      if (message.type === "room_closed") this.emitError(new Error("The host closed this room."));
      if (message.type === "error") this.emitError(new Error(message.message || "Table error"));
    }

    broadcastRoster() {
      this.broadcast({
        type: "roster",
        hostClientId: this.clientId,
        roster: this.rosterPayload(),
        playerOrder: this.playerOrder.slice(),
      });
    }

    rosterPayload() {
      return this.playerOrder.map((id) => this.roster.get(id)).filter(Boolean);
    }

    broadcast(message, exceptClientId = null) {
      this.connections.forEach((connection, clientId) => {
        if (clientId !== exceptClientId && connection.open) connection.send(message);
      });
    }

    sendHost(message) {
      if (!this.hostConnection?.open) throw new Error("The host connection is not ready.");
      this.hostConnection.send(message);
    }

    scheduleMigration() {
      if (this.migrationTimer) return;
      this.clearTimers();
      const oldHost = this.hostClientId;
      const candidates = this.playerOrder.filter((id) => id !== oldHost);
      const rank = candidates.indexOf(this.clientId);
      if (rank < 0) {
        this.emitError(new Error("No eligible host remains."));
        return;
      }
      const delay = 1800 + rank * 3200;
      this.migrationTimer = setTimeout(() => {
        if (rank === 0) this.claimHost();
        else this.reconnectToMigratedHost();
      }, delay);
    }

    async claimHost(attempt = 0) {
      try {
        this.migrationTimer = null;
        const oldHostId = this.hostClientId;
        this.intentionalClose = true;
        this.hostConnection?.close();
        if (this.peer) this.peer.destroy();
        this.peer = null;
        this.intentionalClose = false;
        await this.openPeer(this.hostPeerId());
        this.isHost = true;
        this.connected = true;
        this.hostClientId = this.clientId;
        this.roster.delete(oldHostId);
        this.playerOrder = this.playerOrder.filter((id) => this.roster.has(id));
        if (!this.roster.has(this.clientId)) this.roster.set(this.clientId, this.playerRecord(true));
        this.roster.set(this.clientId, { ...this.roster.get(this.clientId), host: true, connected: true });
        this.saveSession();
        this.emitRoster();
        this.emitStatus("connected", "You are now the host");
        if (this.onBecomeHost) this.onBecomeHost(clone(this.lastFullState));
      } catch (error) {
        if (error?.code === "unavailable-id" && attempt < 10) {
          this.emitStatus("reconnecting", "Waiting to reclaim the table");
          this.migrationTimer = setTimeout(() => this.claimHost(attempt + 1), 1200 + attempt * 350);
          return;
        }
        this.emitError(peerError(error));
        this.reopenAsClient();
      }
    }

    async reopenAsClient() {
      try {
        if (!this.peer || this.peer.destroyed) await this.openPeer();
        this.isHost = false;
        await this.connectToHost(true);
      } catch (error) {
        this.reconnectToMigratedHost();
      }
    }

    reconnectToMigratedHost() {
      let attempts = 0;
      const attempt = async () => {
        attempts += 1;
        try {
          await this.connectToHost(true);
          clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        } catch (error) {
          if (attempts >= 12) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
            this.emitError(new Error("Table recovery failed. Use the room code to reconnect."));
          }
        }
      };
      attempt();
      this.reconnectTimer = setInterval(attempt, 1800);
    }

    startHealthMonitor() {
      clearInterval(this.healthTimer);
      this.lastHostResponse = Date.now();
      this.healthTimer = setInterval(() => {
        if (this.isHost || !this.connected) return;
        if (Date.now() - this.lastHostResponse > 9000) {
          this.connected = false;
          this.hostConnection?.close();
          this.emitStatus("reconnecting", "Host stopped responding; recovering table");
          this.scheduleMigration();
          return;
        }
        try {
          this.sendHost({ type: "ping", sentAt: Date.now() });
        } catch (error) {
          this.connected = false;
          this.emitStatus("reconnecting", "Host disconnected; recovering table");
          this.scheduleMigration();
        }
      }, 2500);
    }

    emitRoster() {
      if (this.onRoster) this.onRoster(this.rosterPayload(), this.snapshot());
    }

    emitStatus(status, message) {
      if (this.onStatus) this.onStatus(status, message);
    }

    emitError(error) {
      if (this.onError) this.onError(error instanceof Error ? error : new Error(String(error)));
    }

    clearTimers() {
      clearTimeout(this.migrationTimer);
      clearInterval(this.reconnectTimer);
      clearInterval(this.healthTimer);
      this.migrationTimer = null;
      this.reconnectTimer = null;
      this.healthTimer = null;
    }

    closeConnections() {
      this.hostConnection?.close();
      this.hostConnection = null;
      this.connections.forEach((connection) => connection.close());
      this.connections.clear();
      this.connectionClients.clear();
    }

    resetRuntime() {
      this.intentionalClose = true;
      this.clearTimers();
      this.closeConnections();
      if (this.peer) this.peer.destroy();
      this.peer = null;
      this.intentionalClose = false;
      this.connected = false;
      this.isHost = false;
      this.hostClientId = null;
      this.roster.clear();
      this.playerOrder = [];
      this.lastFullState = null;
      this.lastRevision = 0;
    }
  }

  function cleanName(value) {
    return String(value || "Player").trim().replace(/\s+/g, " ").slice(0, 24) || "Player";
  }

  function cleanCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
  }

  function randomCode() {
    const bytes = new Uint8Array(6);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
    else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
    return Array.from(bytes, (value) => CODE_ALPHABET[value % CODE_ALPHABET.length]).join("");
  }

  function peerError(error) {
    if (error?.type === "unavailable-id") return codedError("That room code is already in use.", "unavailable-id");
    if (error?.type === "peer-unavailable") return codedError("Room not found. Check the code and try again.", "peer-unavailable");
    return error instanceof Error ? error : new Error(error?.message || "Peer connection failed.");
  }

  function codedError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function clone(value) {
    if (value === undefined) return undefined;
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  root.PeerRoom = PeerRoom;
  if (typeof module !== "undefined" && module.exports) module.exports = { PeerRoom, cleanCode, cleanName };
})(typeof window !== "undefined" ? window : globalThis);
