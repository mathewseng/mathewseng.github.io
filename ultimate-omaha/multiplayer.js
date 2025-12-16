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
        
        this.onPlayerJoin = null;
        this.onPlayerLeave = null;
        this.onGameStateUpdate = null;
        this.onMessage = null;
        this.onError = null;
        this.onConnected = null;
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
                }
                
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
     */
    async connectToRoom() {
        return new Promise((resolve, reject) => {
            const hostPeerId = 'ultimateomaha-' + this.roomCode;
            console.log('Connecting to host:', hostPeerId);
            
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
                
                // Send join request
                this.sendToHost({
                    type: 'join',
                    name: this.myName,
                    peerId: this.myId
                });
                
                // Set up message handler
                conn.on('data', (data) => {
                    this.handleMessage(hostPeerId, data);
                });
                
                conn.on('close', () => {
                    if (this.onError) {
                        this.onError('Disconnected from host');
                    }
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
                // Update player list
                this.players = new Map(data.players.map(p => [p.id, p]));
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(Array.from(this.players.values()));
                }
                break;
                
            case 'player_joined':
                this.players.set(data.player.id, data.player);
                if (this.onPlayerJoin) {
                    this.onPlayerJoin(Array.from(this.players.values()));
                }
                break;
                
            case 'player_left':
                this.players.delete(data.playerId);
                if (this.onPlayerLeave) {
                    this.onPlayerLeave(data.playerId);
                }
                break;
                
            case 'game_state':
                if (this.onGameStateUpdate) {
                    this.onGameStateUpdate(data.state);
                }
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
        
        // Send acceptance to new player
        this.sendToPeer(fromPeerId, {
            type: 'join_accepted',
            playerId: fromPeerId,
            roomCode: this.roomCode,
            gameInProgress: isQueued
        });
        
        // Send current player list to new player
        this.sendToPeer(fromPeerId, {
            type: 'player_list',
            players: Array.from(this.players.values())
        });
        
        // Broadcast new player to all others
        this.broadcast({
            type: 'player_joined',
            player: playerInfo
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
     */
    handleDisconnection(peerId) {
        console.log('Peer disconnected:', peerId);
        this.connections.delete(peerId);
        this.players.delete(peerId);
        
        // Broadcast to remaining players
        this.broadcast({
            type: 'player_left',
            playerId: peerId
        });
        
        if (this.onPlayerLeave) {
            this.onPlayerLeave(peerId);
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
     * Leave the room
     */
    leave() {
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
     * Get player count
     */
    getPlayerCount() {
        return this.players.size;
    }
}

// Export
window.MultiplayerManager = MultiplayerManager;

