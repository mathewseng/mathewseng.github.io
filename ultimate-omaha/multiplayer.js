/**
 * Ultimate Omaha - Multiplayer System using PeerJS
 * Handles peer-to-peer connections, room management, and state sync
 */

class MultiplayerManager {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> connection
        this.players = new Map(); // peerId -> player info
        this.isHost = false;
        this.hostId = null;
        this.hostConnection = null;
        this.myId = null;
        this.myName = '';
        this.roomCode = '';
        this.disconnectedPlayers = new Map(); // peerId -> player info (for reconnection)
        
        // Host migration
        this.lastFullGameState = null; // Clients store full game state for migration
        this.hostReconnectTimeout = null;
        this.hostReconnectInterval = null;
        this.playerOrder = []; // Track join order for host election
        
        this.onPlayerJoin = null;
        this.onPlayerLeave = null;
        this.onGameStateUpdate = null;
        this.onMessage = null;
        this.onError = null;
        this.onConnected = null;
        this.onReconnected = null;
        this.onBecomeHost = null; // Called when this client becomes the new host
    }

    // ============ SESSION PERSISTENCE ============

    /**
     * Save session to sessionStorage for reconnection after refresh
     */
    saveSession() {
        const session = {
            peerId: this.myId,
            roomCode: this.roomCode,
            playerName: this.myName,
            isHost: this.isHost,
            gameInProgress: this.gameInProgress || false,
            timestamp: Date.now()
        };
        sessionStorage.setItem('ultimateomaha_session', JSON.stringify(session));
        console.log('Session saved:', session);
    }

    /**
     * Load session from sessionStorage
     */
    loadSession() {
        const sessionData = sessionStorage.getItem('ultimateomaha_session');
        if (!sessionData) return null;
        
        try {
            const session = JSON.parse(sessionData);
            // Session expires after 1 hour
            if (Date.now() - session.timestamp > 60 * 60 * 1000) {
                this.clearSession();
                return null;
            }
            return session;
        } catch (e) {
            this.clearSession();
            return null;
        }
    }

    /**
     * Clear stored session
     */
    clearSession() {
        sessionStorage.removeItem('ultimateomaha_session');
    }

    /**
     * Check if there's a valid session to reconnect to
     */
    hasSession() {
        return this.loadSession() !== null;
    }

    /**
     * Attempt to reconnect using stored session
     */
    async reconnect() {
        const session = this.loadSession();
        if (!session) {
            throw new Error('No session to reconnect to');
        }

        this.myName = session.playerName;
        this.roomCode = session.roomCode;
        this.isHost = session.isHost;

        return new Promise((resolve, reject) => {
            if (session.isHost) {
                // Host reconnects with same room code peer ID
                this.peer = new Peer('ultimateomaha-' + session.roomCode, {
                    debug: 1
                });
            } else {
                // Client reconnects with same peer ID to be recognized
                this.peer = new Peer(session.peerId, {
                    debug: 1
                });
            }

            const timeout = setTimeout(() => {
                reject(new Error('Reconnection timeout'));
            }, 10000);

            this.peer.on('open', async (id) => {
                clearTimeout(timeout);
                console.log('Reconnected with ID:', id);
                this.myId = id;

                if (session.isHost) {
                    this.hostId = id;
                    this.players.set(id, {
                        id,
                        name: this.myName,
                        isHost: true
                    });
                    // Restore playerOrder with host first
                    this.playerOrder = [id];
                    // Restore gameInProgress from session
                    this.gameInProgress = session.gameInProgress || false;
                    // Host is reconnected, will receive incoming connections
                    this.saveSession();
                    resolve({ peerId: id, roomCode: this.roomCode, isHost: true });
                } else {
                    // Client needs to reconnect to host
                    try {
                        await this.connectToRoom(true); // true = reconnecting
                        this.saveSession();
                        resolve({ peerId: id, roomCode: this.roomCode, isHost: false });
                    } catch (err) {
                        reject(err);
                    }
                }
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Reconnect error:', err);
                if (err.type === 'unavailable-id') {
                    // Someone else has this ID, session is invalid
                    this.clearSession();
                    reject(new Error('Session expired. Please rejoin the room.'));
                } else {
                    reject(err);
                }
            });

            this.peer.on('disconnected', () => {
                console.log('Peer disconnected, attempting reconnect...');
                this.peer.reconnect();
            });
        });
    }

    /**
     * Generate a random room code
     */
    generateRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    /**
     * Initialize PeerJS connection
     */
    async initPeer(isHost, roomCode = null) {
        return new Promise((resolve, reject) => {
            this.isHost = isHost;
            
            if (isHost) {
                this.roomCode = this.generateRoomCode();
                // Host uses room code as peer ID
                this.peer = new Peer('ultimateomaha-' + this.roomCode, {
                    debug: 1
                });
            } else {
                this.roomCode = roomCode.toUpperCase();
                // Client uses random ID
                this.peer = new Peer(undefined, {
                    debug: 1
                });
            }

            this.peer.on('open', (id) => {
                console.log('Peer connected with ID:', id);
                this.myId = id;
                
                if (isHost) {
                    this.hostId = id;
                    this.players.set(id, {
                        id,
                        name: this.myName,
                        isHost: true
                    });
                    // Add host to playerOrder first
                    this.playerOrder = [id];
                }
                
                // Save session for reconnection
                this.saveSession();
                
                resolve({
                    peerId: id,
                    roomCode: this.roomCode
                });
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('Peer error:', err);
                if (err.type === 'peer-unavailable') {
                    reject(new Error('Room not found. Check the room code and try again.'));
                } else if (err.type === 'unavailable-id') {
                    reject(new Error('Room code already in use. Try creating a new room.'));
                } else {
                    reject(err);
                }
            });

            this.peer.on('disconnected', () => {
                console.log('Peer disconnected, attempting reconnect...');
                this.peer.reconnect();
            });
        });
    }

    /**
     * Handle incoming connection (host only)
     */
    handleIncomingConnection(conn) {
        console.log('Incoming connection from:', conn.peer);
        
        conn.on('open', () => {
            console.log('Connection opened:', conn.peer);
            this.connections.set(conn.peer, conn);
            
            // Set up message handler
            conn.on('data', (data) => {
                this.handleMessage(conn.peer, data);
            });
            
            conn.on('close', () => {
                this.handleDisconnection(conn.peer);
            });
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
        });
    }

    /**
     * Connect to a room as a client
     * @param {boolean} isReconnecting - Whether this is a reconnection attempt
     */
    async connectToRoom(isReconnecting = false) {
        return new Promise((resolve, reject) => {
            const hostPeerId = 'ultimateomaha-' + this.roomCode;
            console.log('Connecting to host:', hostPeerId, isReconnecting ? '(reconnecting)' : '');
            
            const conn = this.peer.connect(hostPeerId, {
                reliable: true
            });

            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout. The room may no longer exist.'));
            }, 10000);

            conn.on('open', () => {
                clearTimeout(timeout);
                console.log('Connected to host');
                this.hostConnection = conn;
                this.hostId = hostPeerId;
                
                // Send join request (with reconnecting flag and game state backup)
                const joinMessage = {
                    type: 'join',
                    name: this.myName,
                    peerId: this.myId,
                    reconnecting: isReconnecting
                };
                
                // Include game state backup if reconnecting
                if (isReconnecting && this.lastFullGameState) {
                    joinMessage.gameStateBackup = this.lastFullGameState;
                    joinMessage.playerOrder = this.playerOrder;
                }
                
                this.sendToHost(joinMessage);
                
                // Save session after successful connection
                this.saveSession();
                
                // Set up message handler
                conn.on('data', (data) => {
                    this.handleMessage(hostPeerId, data);
                });
                
                conn.on('close', () => {
                    console.log('Connection to host lost');
                    this.handleHostDisconnection();
                });
                
                resolve();
            });

            conn.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Connection error:', err);
                reject(new Error('Failed to connect to room'));
            });
        });
    }

    /**
     * Handle messages from peers
     */
    handleMessage(fromPeerId, data) {
        console.log('Message from', fromPeerId, ':', data.type);
        
        switch (data.type) {
            case 'join':
                // Host receives join request
                if (this.isHost) {
                    this.handleJoinRequest(fromPeerId, data);
                }
                break;
                
            case 'join_accepted':
                // Client receives acceptance
                if (this.onConnected) {
                    this.onConnected(data);
                }
                break;
                
            case 'player_list':
                // Update player list and player order
                this.players = new Map(data.players.map(p => [p.id, p]));
                if (data.playerOrder) {
                    this.playerOrder = data.playerOrder;
                }
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(Array.from(this.players.values()));
                }
                break;
                
            case 'player_joined':
                this.players.set(data.player.id, data.player);
                if (data.playerOrder) {
                    this.playerOrder = data.playerOrder;
                }
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(Array.from(this.players.values()));
                }
                break;
                
            case 'player_left':
                this.players.delete(data.playerId);
                if (this.onPlayerLeave) {
                    this.onPlayerLeave(data.playerId, false);
                }
                break;
                
            case 'player_disconnected':
                // Player disconnected but may reconnect
                this.players.delete(data.playerId);
                if (this.onPlayerLeave) {
                    this.onPlayerLeave(data.playerId, data.mayReconnect);
                }
                break;
                
            case 'player_reconnected':
                this.players.set(data.player.id, data.player);
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(Array.from(this.players.values()));
                }
                break;
                
            case 'game_state':
                if (this.onGameStateUpdate) {
                    this.onGameStateUpdate(data.state);
                }
                break;
            
            case 'full_game_state_backup':
                // Store full game state for potential host migration
                this.lastFullGameState = data.state;
                this.playerOrder = data.playerOrder || [];
                break;
                
            case 'new_host_announcement':
                // A new host has been elected
                this.handleNewHostAnnouncement(data);
                break;
                
            case 'request_connection':
                // New host is asking us to connect
                this.handleNewHostConnectionRequest(data);
                break;
                
            case 'action':
                // Host receives player action
                if (this.isHost && this.onMessage) {
                    this.onMessage(fromPeerId, data);
                }
                break;
                
            case 'start_game':
                if (this.onMessage) {
                    this.onMessage(fromPeerId, data);
                }
                break;
                
            case 'chat':
                if (this.onMessage) {
                    this.onMessage(fromPeerId, data);
                }
                break;
                
            case 'error':
                if (this.onError) {
                    this.onError(data.message);
                }
                break;
                
            default:
                if (this.onMessage) {
                    this.onMessage(fromPeerId, data);
                }
        }
    }

    /**
     * Handle join request (host only)
     */
    handleJoinRequest(fromPeerId, data) {
        const isReconnecting = data.reconnecting || false;
        
        // If client is reconnecting and has game state backup, and we don't have one, use theirs
        if (isReconnecting && data.gameStateBackup && !this.lastFullGameState) {
            console.log('Restoring game state from reconnecting client');
            this.lastFullGameState = data.gameStateBackup;
            this.gameInProgress = true;
            
            // Restore playerOrder from client
            if (data.playerOrder && data.playerOrder.length > 0) {
                // Make sure host is first, then merge client's order
                const hostFirst = [this.myId];
                data.playerOrder.forEach(id => {
                    if (id !== this.myId && !hostFirst.includes(id)) {
                        hostFirst.push(id);
                    }
                });
                this.playerOrder = hostFirst;
            }
            
            // Notify main.js to restore game state
            if (this.onBecomeHost) {
                this.onBecomeHost(this.lastFullGameState);
            }
        }
        
        // Check if this is a reconnecting player
        const wasDisconnected = this.disconnectedPlayers.has(fromPeerId);
        
        if (isReconnecting || wasDisconnected) {
            // Restore reconnecting player
            const oldInfo = this.disconnectedPlayers.get(fromPeerId) || {};
            this.disconnectedPlayers.delete(fromPeerId);
            
            const playerInfo = {
                id: fromPeerId,
                name: data.name || oldInfo.name || 'Player',
                isHost: false,
                queued: false // They're back, not queued
            };
            this.players.set(fromPeerId, playerInfo);
            
            // Make sure they're in playerOrder
            if (!this.playerOrder.includes(fromPeerId)) {
                this.playerOrder.push(fromPeerId);
            }
            
            console.log('Player reconnected:', fromPeerId);
            
            // Send acceptance with reconnected flag
            this.sendToPeer(fromPeerId, {
                type: 'join_accepted',
                playerId: fromPeerId,
                roomCode: this.roomCode,
                gameInProgress: this.gameInProgress || false,
                reconnected: true
            });
            
            // Send current player list with playerOrder
            this.sendToPeer(fromPeerId, {
                type: 'player_list',
                players: Array.from(this.players.values()),
                playerOrder: this.playerOrder
            });
            
            // Broadcast player reconnected to all others
            this.broadcast({
                type: 'player_reconnected',
                player: playerInfo
            }, fromPeerId);
            
            if (this.onPlayerJoin) {
                this.onPlayerJoin(Array.from(this.players.values()));
            }
            
            // Notify game logic of reconnection
            if (this.onReconnected) {
                this.onReconnected(fromPeerId);
            }
            
            return;
        }
        
        // Check if room is full (max 10 players)
        if (this.players.size >= 10) {
            this.sendToPeer(fromPeerId, {
                type: 'error',
                message: 'Room is full (max 10 players)'
            });
            return;
        }
        
        // Check if game is in progress - player will be queued
        const isQueued = this.gameInProgress || false;
        
        // Add player
        const playerInfo = {
            id: fromPeerId,
            name: data.name || 'Player',
            isHost: false,
            queued: isQueued
        };
        this.players.set(fromPeerId, playerInfo);
        
        // Track player order for host election
        if (!this.playerOrder.includes(fromPeerId)) {
            this.playerOrder.push(fromPeerId);
        }
        
        // Send acceptance to new player
        this.sendToPeer(fromPeerId, {
            type: 'join_accepted',
            playerId: fromPeerId,
            roomCode: this.roomCode,
            gameInProgress: isQueued
        });
        
        // Send current player list to new player with playerOrder
        this.sendToPeer(fromPeerId, {
            type: 'player_list',
            players: Array.from(this.players.values()),
            playerOrder: this.playerOrder
        });
        
        // Broadcast new player to all others with updated playerOrder
        this.broadcast({
            type: 'player_joined',
            player: playerInfo,
            playerOrder: this.playerOrder
        }, fromPeerId);
        
        if (this.onPlayerJoin) {
            this.onPlayerJoin(Array.from(this.players.values()));
        }
        
        // If game in progress, notify the game logic to queue this player
        if (isQueued && this.onMessage) {
            this.onMessage(fromPeerId, { 
                type: 'join', 
                name: data.name,
                queued: true 
            });
        }
    }
    
    /**
     * Set game in progress flag (for mid-game joins)
     */
    setGameInProgress(inProgress) {
        this.gameInProgress = inProgress;
        // Save session to persist gameInProgress flag
        if (this.myId) {
            this.saveSession();
        }
    }
    
    /**
     * Clear queued status for all players (called when new hand starts)
     */
    clearQueuedStatus() {
        for (const [id, player] of this.players) {
            if (player.queued) {
                player.queued = false;
            }
        }
    }

    /**
     * Handle disconnection
     * Store player info for potential reconnection
     */
    handleDisconnection(peerId) {
        console.log('Peer disconnected:', peerId);
        
        // Store player info for potential reconnection (expires after 5 minutes)
        const playerInfo = this.players.get(peerId);
        if (playerInfo) {
            this.disconnectedPlayers.set(peerId, {
                ...playerInfo,
                disconnectedAt: Date.now()
            });
            
            // Clear old disconnected players (older than 5 minutes)
            const now = Date.now();
            for (const [id, info] of this.disconnectedPlayers) {
                if (now - info.disconnectedAt > 5 * 60 * 1000) {
                    this.disconnectedPlayers.delete(id);
                }
            }
        }
        
        this.connections.delete(peerId);
        this.players.delete(peerId);
        
        // Broadcast to remaining players (they might reconnect)
        this.broadcast({
            type: 'player_disconnected',
            playerId: peerId,
            mayReconnect: true
        });
        
        if (this.onPlayerLeave) {
            this.onPlayerLeave(peerId, true); // true = may reconnect
        }
    }

    /**
     * Send message to a specific peer
     */
    sendToPeer(peerId, data) {
        const conn = this.connections.get(peerId);
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    /**
     * Send message to host (client only)
     */
    sendToHost(data) {
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.send(data);
        }
    }

    /**
     * Broadcast message to all connected peers (host only)
     */
    broadcast(data, excludePeerId = null) {
        for (const [peerId, conn] of this.connections) {
            if (peerId !== excludePeerId && conn.open) {
                conn.send(data);
            }
        }
    }

    /**
     * Broadcast game state (host only)
     * Filters sensitive information per player
     * Also sends full state for host migration backup
     */
    broadcastGameState(gameState) {
        for (const [peerId, conn] of this.connections) {
            if (conn.open) {
                // Create filtered state for this player
                const filteredState = this.filterStateForPlayer(gameState, peerId);
                conn.send({
                    type: 'game_state',
                    state: filteredState
                });
                
                // Also send full state for host migration backup
                conn.send({
                    type: 'full_game_state_backup',
                    state: gameState,
                    playerOrder: this.playerOrder
                });
            }
        }
        
        // Also update local state for host
        if (this.onGameStateUpdate) {
            const filteredState = this.filterStateForPlayer(gameState, this.myId);
            this.onGameStateUpdate(filteredState);
        }
    }

    /**
     * Filter game state to hide other players' hole cards
     */
    filterStateForPlayer(gameState, playerId) {
        const filtered = { ...gameState };
        filtered.players = gameState.players.map(p => {
            const playerCopy = { ...p };
            // Only show hole cards to the player themselves
            if (p.id !== playerId && gameState.phase !== 'results') {
                playerCopy.holeCards = p.holeCards.map(() => ({ faceDown: true }));
            }
            return playerCopy;
        });
        return filtered;
    }

    /**
     * Send action to host (client only)
     */
    sendAction(action) {
        if (this.isHost) {
            // Host handles action locally
            if (this.onMessage) {
                this.onMessage(this.myId, { type: 'action', action });
            }
        } else {
            this.sendToHost({
                type: 'action',
                action,
                playerId: this.myId
            });
        }
    }

    /**
     * Leave the room (intentionally)
     */
    leave() {
        // Clear session since this is intentional
        this.clearSession();
        
        if (this.isHost) {
            // Notify all players
            this.broadcast({
                type: 'error',
                message: 'Host has left the game'
            });
        }
        
        // Close all connections
        for (const conn of this.connections.values()) {
            conn.close();
        }
        
        if (this.hostConnection) {
            this.hostConnection.close();
        }
        
        if (this.peer) {
            this.peer.destroy();
        }
        
        this.connections.clear();
        this.players.clear();
        this.disconnectedPlayers.clear();
        this.peer = null;
    }

    /**
     * Get player info
     */
    getPlayer(peerId) {
        return this.players.get(peerId);
    }

    /**
     * Get all players
     */
    getAllPlayers() {
        return Array.from(this.players.values());
    }

    /**
     * Get queued players (waiting for next hand)
     */
    getQueuedPlayers() {
        return Array.from(this.players.values()).filter(p => p.queued);
    }

    /**
     * Get player count
     */
    getPlayerCount() {
        return this.players.size;
    }

    // ============ HOST MIGRATION ============

    /**
     * Handle host disconnection (client side)
     * Attempt to reconnect to host, then elect new host if needed
     */
    handleHostDisconnection() {
        console.log('Host disconnected, attempting to reconnect...');
        
        // Clear any existing timeout/interval
        if (this.hostReconnectTimeout) {
            clearTimeout(this.hostReconnectTimeout);
        }
        if (this.hostReconnectInterval) {
            clearInterval(this.hostReconnectInterval);
        }
        
        let reconnectAttempts = 0;
        const maxAttempts = 5;
        
        // Try to reconnect to host every 1 second for 5 seconds
        this.hostReconnectInterval = setInterval(() => {
            reconnectAttempts++;
            console.log(`Attempting to reconnect to host (attempt ${reconnectAttempts}/${maxAttempts})...`);
            
            this.attemptHostReconnect().then((success) => {
                if (success) {
                    console.log('Successfully reconnected to host!');
                    clearInterval(this.hostReconnectInterval);
                    this.hostReconnectInterval = null;
                }
            });
            
            if (reconnectAttempts >= maxAttempts) {
                clearInterval(this.hostReconnectInterval);
                this.hostReconnectInterval = null;
                console.log('Host did not reconnect, initiating host migration');
                this.initiateHostMigration();
            }
        }, 1000);
    }
    
    /**
     * Attempt to reconnect to the host
     */
    async attemptHostReconnect() {
        return new Promise((resolve) => {
            const hostPeerId = 'ultimateomaha-' + this.roomCode;
            
            try {
                const conn = this.peer.connect(hostPeerId, { reliable: true });
                
                const timeout = setTimeout(() => {
                    resolve(false);
                }, 800); // Quick timeout
                
                conn.on('open', () => {
                    clearTimeout(timeout);
                    console.log('Reconnected to host');
                    
                    // Set up connection
                    this.hostConnection = conn;
                    this.connections.set(hostPeerId, conn);
                    
                    conn.on('data', (data) => {
                        this.handleMessage(hostPeerId, data);
                    });
                    
                    conn.on('close', () => {
                        console.log('Connection to host lost again');
                        this.handleHostDisconnection();
                    });
                    
                    // Send reconnect message with game state backup
                    conn.send({
                        type: 'join',
                        name: this.myName,
                        reconnecting: true,
                        gameStateBackup: this.lastFullGameState,
                        playerOrder: this.playerOrder
                    });
                    
                    resolve(true);
                });
                
                conn.on('error', () => {
                    clearTimeout(timeout);
                    resolve(false);
                });
            } catch (err) {
                resolve(false);
            }
        });
    }

    /**
     * Initiate host migration - elect new host
     */
    initiateHostMigration() {
        // Determine if we should become the new host
        // First non-host player in the order becomes host
        const eligiblePlayers = this.playerOrder.filter(id => 
            id !== this.hostId && this.players.has(id)
        );
        
        if (eligiblePlayers.length === 0) {
            // No other players, we're alone
            if (this.onError) {
                this.onError('Host left and no other players available');
            }
            return;
        }
        
        const newHostId = eligiblePlayers[0];
        
        if (newHostId === this.myId) {
            // We become the new host!
            this.becomeNewHost();
        } else {
            // Wait for new host to connect to us
            console.log('Waiting for new host:', newHostId);
        }
    }

    /**
     * Become the new host
     */
    async becomeNewHost() {
        console.log('Becoming new host...');
        
        this.isHost = true;
        this.hostId = this.myId;
        
        // Update our player info
        const myInfo = this.players.get(this.myId);
        if (myInfo) {
            myInfo.isHost = true;
            this.players.set(this.myId, myInfo);
        }
        
        // Update session
        this.saveSession();
        
        // Get list of other players to connect to
        const otherPlayers = Array.from(this.players.keys()).filter(id => id !== this.myId);
        
        // Connect to each other player
        for (const peerId of otherPlayers) {
            try {
                const conn = this.peer.connect(peerId, { reliable: true });
                
                conn.on('open', () => {
                    console.log('Connected to peer as new host:', peerId);
                    this.connections.set(peerId, conn);
                    
                    // Tell them we're the new host
                    conn.send({
                        type: 'new_host_announcement',
                        newHostId: this.myId,
                        roomCode: this.roomCode,
                        gameState: this.lastFullGameState,
                        playerOrder: this.playerOrder
                    });
                    
                    // Set up message handler
                    conn.on('data', (data) => {
                        this.handleMessage(peerId, data);
                    });
                    
                    conn.on('close', () => {
                        this.handleDisconnection(peerId);
                    });
                });
                
                conn.on('error', (err) => {
                    console.error('Error connecting to peer:', peerId, err);
                });
            } catch (err) {
                console.error('Failed to connect to peer:', peerId, err);
            }
        }
        
        // Set up to receive incoming connections
        this.peer.on('connection', (conn) => {
            this.handleIncomingConnection(conn);
        });
        
        // Notify the app that we're now the host
        if (this.onBecomeHost) {
            this.onBecomeHost(this.lastFullGameState);
        }
    }

    /**
     * Handle new host announcement (when another player becomes host)
     */
    handleNewHostAnnouncement(data) {
        console.log('New host announced:', data.newHostId);
        
        // Clear reconnection timeout
        if (this.hostReconnectTimeout) {
            clearTimeout(this.hostReconnectTimeout);
            this.hostReconnectTimeout = null;
        }
        
        // Update host info
        this.hostId = data.newHostId;
        this.isHost = false;
        
        // Update game state if provided
        if (data.gameState) {
            this.lastFullGameState = data.gameState;
            if (this.onGameStateUpdate) {
                const filteredState = this.filterStateForPlayer(data.gameState, this.myId);
                this.onGameStateUpdate(filteredState);
            }
        }
        
        // Update player order
        if (data.playerOrder) {
            this.playerOrder = data.playerOrder;
        }
        
        // Update player list to reflect new host
        for (const [id, player] of this.players) {
            player.isHost = (id === data.newHostId);
        }
        
        if (this.onPlayerJoin) {
            this.onPlayerJoin(Array.from(this.players.values()));
        }
        
        // Save updated session
        this.saveSession();
    }

    /**
     * Handle connection request from new host
     */
    handleNewHostConnectionRequest(data) {
        // The new host is trying to establish connection
        // We should already be connected via their outgoing connection
        console.log('New host connection request received');
    }
}

// Export
window.MultiplayerManager = MultiplayerManager;

