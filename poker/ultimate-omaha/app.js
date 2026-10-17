/**
 * Ultimate Omaha - Main Controller
 * Handles UI, screen transitions, and ties everything together
 */

class GameController {
    constructor() {
        this.multiplayer = new MultiplayerManager();
        this.game = new UltimateOmahaGame();
        this.currentScreen = 'menu';
        this.myPlayerId = null;
        this.gameStarted = false;

        // Game log and chat
        this.handNumber = 0;
        this.lastPhase = null;

        this.setupEventListeners();
        this.setupMultiplayerCallbacks();
        this.setupLogAndChat();
        this.setupStageObserver();

        // Check for session to reconnect
        this.checkForReconnection();
    }

    /**
     * The sticky action stage's height is published as --stage-h so toasts
     * stack above it instead of covering the primary action.
     */
    setupStageObserver() {
        const stage = document.getElementById('action-area');
        if (!stage || typeof ResizeObserver !== 'function') return;
        const measure = () => {
            const visible = this.currentScreen === 'game' ? stage.offsetHeight : 0;
            document.documentElement.style.setProperty('--stage-h', `${visible}px`);
        };
        new ResizeObserver(measure).observe(stage);
        measure();
    }

    /**
     * Check if there's a session to reconnect to on page load
     */
    async checkForReconnection() {
        if (!this.multiplayer.hasSession()) {
            return;
        }

        const session = this.multiplayer.loadSession();
        if (!session) return;

        this.showToast('Reconnecting...', 'info');

        try {
            const result = await this.multiplayer.reconnect();
            this.myPlayerId = result.peerId;

            if (result.isHost) {
                // Host reconnected
                document.getElementById('room-code').textContent = result.roomCode;
                document.getElementById('your-name').textContent = session.playerName;
                document.getElementById('start-game-btn').classList.remove('hidden');
                document.getElementById('host-controls').style.display = 'flex';
                document.getElementById('waiting-message').classList.add('hidden');

                // If game was in progress, go to game screen
                // Check both session and multiplayer for gameInProgress
                if (session.gameInProgress || this.multiplayer.gameInProgress) {
                    this.gameStarted = true;
                    this.multiplayer.gameInProgress = true;
                    this.showScreen('game');
                    this.showToast('Reconnected as host! Waiting for players...', 'success');
                } else {
                    this.showScreen('lobby');
                    this.showToast('Reconnected to lobby!', 'success');
                }
            } else {
                // Client reconnected
                document.getElementById('room-code').textContent = result.roomCode;
                document.getElementById('your-name').textContent = session.playerName;
                document.getElementById('start-game-btn').classList.add('hidden');
                document.getElementById('host-controls').style.display = 'none';
                document.getElementById('waiting-message').classList.remove('hidden');

                this.showScreen('lobby');
                this.showToast('Reconnected!', 'success');
            }
        } catch (err) {
            console.error('Reconnection failed:', err);
            this.multiplayer.clearSession();
            this.showToast('Could not reconnect: ' + err.message, 'error');
        }
    }

    /**
     * Format a number as currency, showing $ and decimals only if not whole
     */
    formatCurrency(amount, forceSign = false) {
        const absAmount = Math.abs(amount);
        const isWhole = absAmount === Math.floor(absAmount);
        const formatted = isWhole ? absAmount.toString() : absAmount.toFixed(2);

        if (amount < 0) {
            return `-$${formatted}`;
        } else if (forceSign && amount > 0) {
            return `+$${formatted}`;
        }
        return `$${formatted}`;
    }

    // ============ SETUP ============

    setupEventListeners() {
        // Menu screen - combined start/join button
        const startJoinBtn = document.getElementById('start-join-btn');
        const roomCodeInput = document.getElementById('room-code-input');

        startJoinBtn.addEventListener('click', () => this.startOrJoinGame());

        // Update button text based on room code input
        roomCodeInput.addEventListener('input', () => this.updateStartJoinButton());
        roomCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.startOrJoinGame();
        });

        // Lobby screen
        document.getElementById('copy-code-btn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leave-lobby-btn').addEventListener('click', () => this.leaveLobby());

        // Game screen
        document.getElementById('check-btn').addEventListener('click', () => this.sendAction('check'));
        document.getElementById('double-btn').addEventListener('click', () => this.sendAction('double'));
        document.getElementById('rules-btn').addEventListener('click', () => this.showRules());
        document.getElementById('rules-preview-btn')?.addEventListener('click', () => this.showRules());
        document.getElementById('close-rules').addEventListener('click', () => this.hideRules());
        document.querySelector('[data-close-rules]')?.addEventListener('click', () => this.hideRules());
        document.getElementById('next-hand-btn').addEventListener('click', () => this.startNextHand());
        document.getElementById('leave-game-btn')?.addEventListener('click', () => this.quitGame());
    }

    updateStartJoinButton() {
        const roomCode = document.getElementById('room-code-input').value.trim();
        const btn = document.getElementById('start-join-btn');
        const btnText = btn.querySelector('.btn-text');
        const btnIcon = btn.querySelector('.btn-icon');

        if (roomCode) {
            btnText.textContent = 'Join Game';
            btnIcon.textContent = '♦';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
        } else {
            btnText.textContent = 'Start Game';
            btnIcon.textContent = '♠';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
        }
    }

    /**
     * Leave a running game: a kit confirm that says what happens to the
     * room and the saved session, then the same clean exit Edge the Dealer
     * uses (the page reloads so every piece of local state is fresh).
     */
    async quitGame() {
        const isHost = this.multiplayer.isHost;
        const text = isHost
            ? 'Leaving closes the room for everyone at the table and clears your saved session.'
            : 'Your seat is given up and your saved session is cleared. You can rejoin with the room code.';
        const ok = window.Sheet
            ? await Sheet.confirm({ title: isHost ? 'Close the table?' : 'Leave the table?', text, verb: isHost ? 'Close table' : 'Leave', danger: true, sheet: true })
            : window.confirm(text);
        if (!ok) return;

        const leaveBtn = document.getElementById('leave-game-btn');
        if (leaveBtn) {
            leaveBtn.disabled = true;
            leaveBtn.textContent = 'Leaving…';
        }

        try { this.multiplayer.leave(); } catch (err) { console.error('Leave error:', err); }
        try { this.multiplayer.clearSession(); } catch (err) { console.error('Clear session error:', err); }
        this.gameStarted = false;
        window.location.replace(window.location.pathname + window.location.search);
    }

    startOrJoinGame() {
        const roomCode = document.getElementById('room-code-input').value.trim();
        if (roomCode) {
            this.joinRoom();
        } else {
            this.createRoom();
        }
    }

    setupMultiplayerCallbacks() {
        this.multiplayer.onPlayerJoin = (players) => {
            this.updateLobbyPlayers(players);

            // If game already started and this is host, check for new players to queue
            if (this.gameStarted && this.multiplayer.isHost) {
                // New players get queued automatically by host
            }
        };

        this.multiplayer.onPlayerLeave = (playerId, mayReconnect = false) => {
            if (mayReconnect) {
                this.showToast(`A player disconnected (may reconnect)`, 'info');
            } else {
                this.showToast(`A player has left`, 'info');
            }
            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());

            // Don't remove player from game immediately if they may reconnect
            if (this.currentScreen === 'game' && !mayReconnect) {
                this.game.removePlayer(playerId);
            }
        };

        this.multiplayer.onReconnected = (playerId) => {
            this.showToast(`A player reconnected!`, 'success');
            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());

            // Send current game state to reconnected player
            if (this.gameStarted && this.multiplayer.isHost) {
                this.multiplayer.broadcastGameState(this.game.getGameState());
            }
        };

        this.multiplayer.onGameStateUpdate = (state) => {
            this.updateGameUI(state);
        };

        this.multiplayer.onConnected = (data) => {
            if (data.reconnected) {
                this.showToast('Reconnected to room!', 'success');
            } else {
                this.showToast('Connected to room!', 'success');
            }

            // If game is in progress, show game screen and notify player they're queued
            if (data.gameInProgress) {
                this.gameStarted = true;
                if (!data.reconnected) {
                    this.showToast('Game in progress - you\'ll join next hand', 'info');
                }
                this.showScreen('game');
            }
        };

        this.multiplayer.onError = (message) => {
            this.showToast(message, 'error');
        };

        this.multiplayer.onMessage = (fromPeerId, data) => {
            this.handleGameMessage(fromPeerId, data);
        };

        this.multiplayer.onBecomeHost = (gameState) => {
            this.handleBecomeHost(gameState);
        };
    }

    // ============ GAME LOG & CHAT ============

    setupLogAndChat() {
        // Tab switching (shared/tabs.js adds the tablist keyboard model and
        // the hidden attribute on panels; the page keeps its own .active flags)
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                this.switchTab(tabId);
            });
        });
        if (window.Tabs) Tabs.init(document.getElementById('log-chat-tabs'));

        // Chat input
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-chat-btn');

        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        sendBtn?.addEventListener('click', () => this.sendChatMessage());

        // Emoji picker
        const emojiBtn = document.getElementById('emoji-picker-btn');
        const emojiPicker = document.getElementById('emoji-picker');

        const setPickerOpen = (open) => {
            emojiPicker?.classList.toggle('hidden', !open);
            emojiBtn?.setAttribute('aria-expanded', String(open));
        };
        emojiBtn?.addEventListener('click', () => {
            setPickerOpen(emojiPicker?.classList.contains('hidden'));
        });

        // Emoji selection
        document.querySelectorAll('.emoji-option').forEach(emoji => {
            emoji.addEventListener('click', () => {
                const text = emoji.textContent;
                if (chatInput) {
                    chatInput.value += text;
                    chatInput.focus();
                }
                setPickerOpen(false);
            });
        });

        // Close emoji picker when clicking outside or pressing Escape
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-picker') && !e.target.closest('.emoji-picker-btn')) {
                setPickerOpen(false);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && emojiPicker && !emojiPicker.classList.contains('hidden')) {
                setPickerOpen(false);
                emojiBtn?.focus();
            }
        });
    }

    switchTab(tabId) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });
    }

    // ============ GAME LOG ============

    addLogEntry(type, content, extraClass = '') {
        const logContainer = document.getElementById('game-log');
        if (!logContainer) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type} ${extraClass}`.trim();
        entry.innerHTML = content;
        logContainer.appendChild(entry);

        // Auto-scroll to bottom
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    /**
     * A peer-supplied display name, escaped for innerHTML. Names reach every
     * client through the host, so the chat and the log must never trust them.
     */
    safeName(name) {
        return this.escapeHtml(name || 'Player');
    }

    logHandStart(baseBet, players) {
        this.handNumber++;
        const playerNames = players.map(p => {
            const info = this.multiplayer.getPlayer(p.id);
            return this.safeName(info?.name);
        }).join(', ');

        this.addLogEntry('hand-start',
            `<strong>Hand ${this.handNumber}</strong>` +
            `Bet ${this.formatCurrency(baseBet)} · Players: ${playerNames}`
        );
    }

    logAction(playerId, action, amount) {
        const playerInfo = this.multiplayer.getPlayer(playerId);
        const name = this.safeName(playerInfo?.name);
        const isMe = playerId === this.myPlayerId;

        const actionClass = action === 'double' ? 'double' : '';
        const actionText = action === 'check' ? 'checks' : `doubles to ${this.formatCurrency(amount)}`;

        this.addLogEntry('action',
            `<span class="player-name">${name}${isMe ? ' (you)' : ''}</span> ` +
            `<span class="action-type ${actionClass}">${actionText}</span>`
        );
    }

    /**
     * Small shared playing cards for a log line
     */
    logCardsHtml(cards) {
        return `<span class="log-cards">${PlayingCards.rowHtml(cards.map(card => this.cardFace(card)))}</span>`;
    }

    logBoardCards(boardNum, cards, phase) {
        const phaseName = phase === 'flop' ? 'Flop' : 'Turn/River';
        this.addLogEntry('board', `Board ${boardNum} ${phaseName}: ${this.logCardsHtml(cards)}`);
    }

    logShowdown(results) {
        this.addLogEntry('showdown', '<strong>Showdown</strong>');

        results.forEach(result => {
            const playerInfo = this.multiplayer.getPlayer(result.playerId);
            const name = this.safeName(playerInfo?.name);
            const isMe = result.playerId === this.myPlayerId;

            // Log their cards
            this.addLogEntry('showdown',
                `<span class="player-name">${name}${isMe ? ' (you)' : ''}</span>: ${this.logCardsHtml(result.holeCards)}`
            );

            // Log their result
            const resultClass = result.netResult > 0 ? 'win' : (result.netResult < 0 ? 'lose' : 'push');
            const handDesc = result.qualifies
                ? `${this.escapeHtml(result.hand1.name)} + ${this.escapeHtml(result.hand2.name)} (${result.totalMultiplier}×)`
                : 'Foul';

            this.addLogEntry('result',
                `${handDesc}: ${this.formatCurrency(result.netResult, true)}`,
                resultClass
            );
        });
    }

    logPnLSummary(players) {
        this.addLogEntry('showdown', '<strong>PnL summary</strong>');

        players.forEach(player => {
            const playerInfo = this.multiplayer.getPlayer(player.id);
            const name = this.safeName(playerInfo?.name);
            const isMe = player.id === this.myPlayerId;
            const pnl = player.actualPnl || player.pnl;
            const resultClass = pnl > 0 ? 'win' : (pnl < 0 ? 'lose' : 'push');

            this.addLogEntry('result',
                `<span class="player-name">${name}${isMe ? ' (you)' : ''}</span>: ` +
                `${this.formatCurrency(pnl, true)} total`,
                resultClass
            );
        });
    }

    // ============ CHAT ============

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        // Check for emoji-only message (for emoji blast effect)
        const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(text) && text.length <= 4;

        // Send to all players
        if (this.multiplayer.isHost) {
            // Host broadcasts
            this.multiplayer.broadcast({
                type: 'chat',
                senderId: this.myPlayerId,
                senderName: this.multiplayer.myName,
                text: text,
                timestamp: Date.now(),
                isEmojiOnly
            });
            // Also show locally
            this.addChatMessage(this.myPlayerId, this.multiplayer.myName, text, Date.now(), isEmojiOnly);
        } else {
            // Client sends to host to broadcast
            this.multiplayer.sendToHost({
                type: 'chat',
                senderId: this.myPlayerId,
                senderName: this.multiplayer.myName,
                text: text,
                timestamp: Date.now(),
                isEmojiOnly
            });
            // Show locally immediately
            this.addChatMessage(this.myPlayerId, this.multiplayer.myName, text, Date.now(), isEmojiOnly);
        }

        input.value = '';
    }

    addChatMessage(senderId, senderName, text, timestamp, isEmojiOnly = false) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const isMe = senderId === this.myPlayerId;
        const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const msg = document.createElement('div');
        msg.className = `chat-message${isEmojiOnly ? ' emoji-blast' : ''}`;

        if (isEmojiOnly) {
            msg.textContent = text;
        } else {
            msg.innerHTML = `
                <span class="sender${isMe ? ' me' : ''}">${this.safeName(senderName)}:</span>
                <span class="text">${this.escapeHtml(text)}</span>
                <span class="timestamp">${time}</span>
            `;
        }

        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        // Switch to chat tab if not visible and message from others
        if (!isMe && !document.getElementById('chat-tab')?.classList.contains('active')) {
            // Flash the chat tab to indicate new message
            const chatTabBtn = document.querySelector('[data-tab="chat"]');
            chatTabBtn?.classList.add('has-notification');
            setTimeout(() => chatTabBtn?.classList.remove('has-notification'), 2000);
        }
    }

    addSystemMessage(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msg = document.createElement('div');
        msg.className = 'chat-message system';
        msg.textContent = text;
        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;
    }

    /**
     * Handle becoming the new host after host migration
     */
    handleBecomeHost(gameState) {
        console.log('We are now the host!');
        this.showToast('You are now the host!', 'success');

        // Restore game state if available
        if (gameState) {
            this.game.deserialize(this.convertGameStateToInternal(gameState));
            this.gameStarted = gameState.phase !== 'waiting';
            this.multiplayer.setGameInProgress(this.gameStarted);
        }

        // Update UI to show host controls
        document.getElementById('start-game-btn').classList.remove('hidden');
        document.getElementById('host-controls').style.display = 'flex';
        document.getElementById('waiting-message').classList.add('hidden');

        // Update room code display
        document.getElementById('room-code').textContent = this.multiplayer.roomCode;

        // If game is in progress, show game screen
        if (this.gameStarted) {
            this.showScreen('game');

            // Show host showdown controls if at results
            if (gameState && gameState.phase === 'results') {
                document.getElementById('host-showdown-controls').classList.remove('hidden');
                document.getElementById('waiting-next').classList.add('hidden');
            }

            // Broadcast current state to all players
            this.multiplayer.broadcastGameState(this.game.getGameState());
        }

        // Log the host migration
        this.addSystemMessage('You are now the host!');
    }

    /**
     * Convert broadcast game state to internal game state format
     */
    convertGameStateToInternal(state) {
        return {
            players: state.players.map(p => ({
                id: p.id,
                pnl: p.actualPnl || p.pnl || 0,
                startingPnl: p.pnl || 0,
                holeCards: p.holeCards || [],
                currentBet: p.currentBet || state.baseBet,
                totalBet: p.totalBet || state.baseBet,
                hasActed: p.hasActed || false
            })),
            queuedPlayers: state.queuedPlayers || [],
            deck: [], // Deck is consumed, not needed for restoration
            board1: state.board1 || [],
            board2: state.board2 || [],
            phase: state.phase || 'waiting',
            baseBet: state.baseBet || 1,
            actedThisRound: [],
            lastResults: state.results || null
        };
    }

    // ============ SCREEN MANAGEMENT ============

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${screenId}-screen`).classList.add('active');
        this.currentScreen = screenId;

        // Show room code in game screen
        if (screenId === 'game') {
            const roomCode = this.multiplayer.roomCode;
            document.getElementById('game-room-code').textContent = roomCode;
        }

        // Leave lives in the topbar while a game runs; the lobby has its own button.
        const leaveBtn = document.getElementById('leave-game-btn');
        if (leaveBtn) leaveBtn.hidden = screenId !== 'game';
        if (screenId !== 'game') document.documentElement.style.setProperty('--stage-h', '0px');
    }

    // ============ LOADING STATES ============

    setButtonLoading(btn, loading) {
        if (loading) {
            btn.classList.add('loading');
            btn.setAttribute('aria-busy', 'true');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.removeAttribute('aria-busy');
            btn.disabled = false;
        }
    }

    // ============ MENU ACTIONS ============

    async createRoom() {
        const name = document.getElementById('player-name').value.trim() || 'Host';
        this.multiplayer.myName = name;

        const btn = document.getElementById('start-join-btn');
        this.setButtonLoading(btn, true);

        try {
            const result = await this.multiplayer.initPeer(true);
            this.myPlayerId = result.peerId;

            document.getElementById('room-code').textContent = this.multiplayer.roomCode;
            document.getElementById('your-name').textContent = name;
            document.getElementById('start-game-btn').classList.remove('hidden');
            document.getElementById('host-controls').style.display = 'flex';
            document.getElementById('waiting-message').classList.add('hidden');

            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());
            this.showScreen('lobby');
            this.showToast(`Room created: ${this.multiplayer.roomCode}`, 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    }

    async joinRoom() {
        const name = document.getElementById('player-name').value.trim() || 'Player';
        const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();

        if (!roomCode) {
            this.showToast('Please enter a room code', 'error');
            return;
        }

        this.multiplayer.myName = name;

        const btn = document.getElementById('start-join-btn');
        this.setButtonLoading(btn, true);

        try {
            await this.multiplayer.initPeer(false, roomCode);
            this.myPlayerId = this.multiplayer.myId;

            await this.multiplayer.connectToRoom();

            document.getElementById('room-code').textContent = roomCode;
            document.getElementById('your-name').textContent = name;
            document.getElementById('start-game-btn').classList.add('hidden');
            document.getElementById('host-controls').style.display = 'none';
            document.getElementById('waiting-message').classList.remove('hidden');

            this.showScreen('lobby');
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            this.setButtonLoading(btn, false);
        }
    }

    // ============ LOBBY ACTIONS ============

    updateLobbyPlayers(players) {
        const container = document.getElementById('lobby-players');
        container.innerHTML = '';

        players.forEach(player => {
            const isQueued = player.queued;
            const isMe = player.id === this.myPlayerId;
            const div = document.createElement('div');
            div.className = `lobby-player seat seat--lobby ${player.isHost ? 'host seat--host' : ''} ${isQueued ? 'queued seat--queued' : ''} ${isMe ? 'seat--me' : ''}`;
            div.innerHTML = `
                <span class="seat-avatar" aria-hidden="true">${this.initials(player.name)}</span>
                <div class="player-name seat-name"><span>${this.escapeHtml(player.name)}</span>${isMe ? '<span class="seat-badge">You</span>' : ''}</div>
                <div class="seat-meta">
                    ${player.isHost ? '<span class="host-badge seat-badge seat-badge--accent">Host</span>' : '<span class="seat-badge">Player</span>'}
                    ${isQueued ? '<span class="queued-badge seat-badge seat-badge--warn">Joining next hand</span>' : ''}
                </div>
            `;
            container.appendChild(div);
        });

        document.getElementById('player-count').textContent = `(${players.length}/10)`;

        const startBtn = document.getElementById('start-game-btn');
        if (this.multiplayer.isHost && players.length >= 1) {
            startBtn.disabled = false;
        }
    }

    async copyRoomCode() {
        const code = this.multiplayer.roomCode || '';
        try {
            await this.copyText(code);
            this.showToast('Room code copied!', 'success');
        } catch (err) {
            this.showToast(`Could not copy. The room code is ${code}.`, 'error');
        }
    }

    /**
     * Clipboard API with an execCommand fallback for browsers (and insecure
     * contexts) that do not expose navigator.clipboard.
     */
    async copyText(text) {
        if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('aria-hidden', 'true');
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        if (!ok) throw new Error('Copy failed');
    }

    initials(name) {
        const parts = String(name || 'P').trim().split(/\s+/).filter(Boolean);
        return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'P';
    }

    leaveLobby() {
        this.multiplayer.leave();
        this.showScreen('menu');
        this.gameStarted = false;
    }

    // ============ GAME ACTIONS ============

    startGame() {
        if (!this.multiplayer.isHost) return;

        const baseBet = parseFloat(document.getElementById('base-bet').value) || 1.00;

        const playerIds = Array.from(this.multiplayer.players.keys());

        this.game.initGame(playerIds, baseBet);
        this.game.startHand();
        this.gameStarted = true;
        this.multiplayer.setGameInProgress(true);

        // Log hand start
        this.logHandStart(baseBet, this.game.players);
        this.multiplayer.broadcast({
            type: 'hand_start_log',
            baseBet,
            players: this.game.players.map(p => ({ id: p.id }))
        });

        this.multiplayer.broadcast({ type: 'start_game' });
        this.multiplayer.broadcastGameState(this.game.getGameState());

        this.showScreen('game');
    }

    handleGameMessage(fromPeerId, data) {
        // Handle chat for all players (host or client)
        if (data.type === 'chat') {
            // If we're host, relay to all other players
            if (this.multiplayer.isHost) {
                this.multiplayer.broadcast({
                    type: 'chat',
                    senderId: data.senderId,
                    senderName: data.senderName,
                    text: data.text,
                    timestamp: data.timestamp,
                    isEmojiOnly: data.isEmojiOnly
                }, fromPeerId); // Exclude sender
            }
            // Show the message (unless it's our own)
            if (data.senderId !== this.myPlayerId) {
                this.addChatMessage(data.senderId, data.senderName, data.text, data.timestamp, data.isEmojiOnly);
            }
            return;
        }

        // Handle log messages for clients
        if (data.type === 'action_log') {
            this.logAction(data.playerId, data.action, data.amount);
            return;
        }

        if (data.type === 'hand_start_log') {
            this.logHandStart(data.baseBet, data.players);
            return;
        }

        if (!this.multiplayer.isHost) {
            if (data.type === 'start_game') {
                this.gameStarted = true;
                this.showScreen('game');
            }
            return;
        }

        // Host handles game logic
        switch (data.type) {
            case 'action':
                const result = this.game.processAction(data.playerId || fromPeerId, data.action);
                if (result.success) {
                    // Log the action
                    const player = this.game.players.find(p => p.id === (data.playerId || fromPeerId));
                    this.logAction(data.playerId || fromPeerId, data.action, player?.totalBet);
                    // Broadcast action log to all
                    this.multiplayer.broadcast({
                        type: 'action_log',
                        playerId: data.playerId || fromPeerId,
                        action: data.action,
                        amount: player?.totalBet
                    });
                    this.multiplayer.broadcastGameState(this.game.getGameState());
                } else {
                    this.multiplayer.sendToPeer(fromPeerId, {
                        type: 'error',
                        message: result.error
                    });
                }
                break;

            case 'next_hand':
                // Only host can start next hand
                break;

            case 'join':
                // Player joining mid-game - queue them for next hand
                if (this.gameStarted && this.game.phase !== 'waiting') {
                    this.game.queuePlayer(fromPeerId);
                    this.showToast(`${data.name || 'Player'} will join next hand`, 'info');
                    this.addSystemMessage(`${data.name || 'Player'} joined and will play next hand`);
                    // Send current game state to the new player
                    this.multiplayer.sendToPeer(fromPeerId, {
                        type: 'game_state',
                        state: this.multiplayer.filterStateForPlayer(this.game.getGameState(), fromPeerId)
                    });
                }
                break;
        }
    }

    sendAction(action) {
        if (this.multiplayer.isHost) {
            const result = this.game.processAction(this.myPlayerId, action);
            if (result.success) {
                // Log the action
                const player = this.game.players.find(p => p.id === this.myPlayerId);
                this.logAction(this.myPlayerId, action, player?.totalBet);
                // Broadcast action log to all
                this.multiplayer.broadcast({
                    type: 'action_log',
                    playerId: this.myPlayerId,
                    action: action,
                    amount: player?.totalBet
                });
                this.multiplayer.broadcastGameState(this.game.getGameState());
            } else {
                this.showToast(result.error, 'error');
            }
        } else {
            this.multiplayer.sendAction(action);
        }
    }

    startNextHand() {
        if (!this.multiplayer.isHost) return;

        // Get the new bet amount from host controls
        const nextBetInput = document.getElementById('next-bet');
        if (nextBetInput) {
            const newBet = parseFloat(nextBetInput.value) || 1.00;
            this.game.setBaseBet(newBet);
        }

        // Clear queued status for players joining this hand
        this.multiplayer.clearQueuedStatus();

        this.game.startHand();

        // Log hand start
        this.logHandStart(this.game.baseBet, this.game.players);
        this.multiplayer.broadcast({
            type: 'hand_start_log',
            baseBet: this.game.baseBet,
            players: this.game.players.map(p => ({ id: p.id }))
        });

        this.multiplayer.broadcastGameState(this.game.getGameState());
    }

    // ============ UI UPDATES ============

    updateGameUI(state) {
        // Log phase transitions
        if (state.phase !== this.lastPhase) {
            if (state.phase === 'flop') {
                // Log flop cards
                this.logBoardCards(1, state.board1, 'flop');
                this.logBoardCards(2, state.board2, 'flop');
            } else if (state.phase === 'results') {
                // Log turn/river cards
                this.logBoardCards(1, state.board1, 'results');
                this.logBoardCards(2, state.board2, 'results');
                // Log showdown results
                if (state.results) {
                    this.logShowdown(state.results);
                    this.logPnLSummary(state.players);
                }
            }
            this.lastPhase = state.phase;
        }

        // Update boards
        this.updateBoard('board-1', state.board1);
        this.updateBoard('board-2', state.board2);

        // Find my player data
        const myPlayer = state.players.find(p => p.id === this.myPlayerId);

        // Update my hole cards
        if (myPlayer) {
            this.updateHoleCards(myPlayer.holeCards);
            // Show starting PnL during hand, actual PnL at results
            const displayPnl = state.phase === 'results' ? myPlayer.actualPnl : myPlayer.pnl;
            const pnlEl = document.getElementById('my-pnl');
            pnlEl.textContent = this.formatCurrency(displayPnl);
            pnlEl.classList.toggle('is-good', displayPnl > 0);
            pnlEl.classList.toggle('is-bad', displayPnl < 0);
            document.getElementById('current-bet').textContent = this.formatCurrency(myPlayer.totalBet);
        } else {
            this.updateHoleCards([]);
        }

        // Street / phase indicator and the queued late joiner's explanation
        this.updatePhaseIndicator(state, myPlayer);

        // Update other players - pass results for showdown and queued players
        this.updatePlayersArea(state.players, state.phase, state.results, state.queuedPlayers);

        // Update action buttons
        this.updateActionButtons(state, myPlayer);

        // Handle board results at showdown
        if (state.phase === 'results' && state.results) {
            this.updateBoardResults(state, myPlayer);
        } else {
            document.getElementById('board-1-result').textContent = '';
            document.getElementById('board-2-result').textContent = '';
            // Clear my hand results when not at showdown
            const resultsDiv = document.querySelector('.my-hand-results');
            if (resultsDiv) resultsDiv.remove();
        }

        // Hide "Your Bet:" at showdown
        const currentBetInfo = document.querySelector('.current-bet-info');
        if (currentBetInfo) {
            if (state.phase === 'results') {
                currentBetInfo.classList.add('hidden');
            } else {
                currentBetInfo.classList.remove('hidden');
            }
        }
    }

    formatPhase(phase) {
        const phaseNames = {
            'waiting': 'Waiting',
            'preflop': 'Preflop',
            'flop': 'Flop',
            'results': 'Showdown'
        };
        return phaseNames[phase] || phase;
    }

    /**
     * The street in the game header, on the felt and in the action stage,
     * plus the persistent note a queued late joiner sees in the hand panel.
     */
    updatePhaseIndicator(state, myPlayer) {
        const phase = this.formatPhase(state.phase);
        const phaseLabel = document.getElementById('phase-label');
        if (phaseLabel) phaseLabel.textContent = phase;

        const feltPhase = document.getElementById('felt-phase');
        if (feltPhase) {
            feltPhase.textContent = state.phase === 'waiting'
                ? 'Waiting for the deal'
                : state.phase === 'results'
                    ? 'Showdown'
                    : `${phase} · bet ${this.formatCurrency(state.baseBet)}`;
        }

        const queued = !myPlayer && this.gameStarted;
        const notice = document.getElementById('queued-notice');
        if (notice) notice.hidden = !queued;

        const kicker = document.getElementById('action-kicker');
        const title = document.getElementById('action-title');
        if (kicker) kicker.textContent = phase;
        if (title) {
            if (queued) {
                title.textContent = 'In from the next hand';
            } else if (state.phase === 'results') {
                title.textContent = 'Hand complete';
            } else if (myPlayer && myPlayer.hasActed) {
                title.textContent = 'Waiting for the other players';
            } else if (myPlayer) {
                title.textContent = state.phase === 'flop' ? 'Check or double on the flop' : 'Check or double';
            } else {
                title.textContent = 'Waiting for the deal';
            }
        }
    }

    updateBoard(boardId, cards) {
        const board = document.getElementById(boardId);
        const slots = board.querySelectorAll('.card-slot');

        cards.forEach((card, i) => this.fillSlot(slots[i], card));
    }

    updateHoleCards(cards) {
        const container = document.getElementById('hole-cards');
        const slots = container.querySelectorAll('.card-slot');

        slots.forEach((slot, i) => this.fillSlot(slot, cards[i] || null));
    }

    // ============ CARD RENDERING (shared component) ============

    /**
     * What the shared card component should draw for a game card
     */
    cardFace(card) {
        if (!card || card.faceDown) return 'BACK';
        return { rank: card.rank, suit: card.suit };
    }

    cardKey(card) {
        if (!card) return '';
        return card.faceDown ? 'BACK' : Poker.getCardId(card);
    }

    /**
     * Put a card in a slot. The slot is only rebuilt (and the deal animation
     * replayed) when the card it shows actually changes.
     */
    fillSlot(slot, card) {
        if (!slot) return;
        const key = this.cardKey(card);
        if (slot.dataset.card === key) return;

        slot.dataset.card = key;
        slot.innerHTML = '';
        slot.classList.remove('dealt');
        if (!key) return;

        slot.appendChild(PlayingCards.element(this.cardFace(card)));
        void slot.offsetWidth; // restart the deal animation
        slot.classList.add('dealt');
    }

    updatePlayersArea(players, phase, results = null, queuedPlayerIds = []) {
        const container = document.getElementById('players-area');
        container.innerHTML = '';

        players.forEach((player, index) => {
            const playerInfo = this.multiplayer.getPlayer(player.id);
            const isMe = player.id === this.myPlayerId;

            const div = document.createElement('article');
            const seatState = [
                player.hasActed ? 'acted seat--confirmed' : '',
                phase === 'results' ? 'showdown' : '',
                isMe ? 'seat--me' : '',
                playerInfo?.isHost ? 'seat--host' : ''
            ].filter(Boolean).join(' ');
            div.className = `player-box seat ${seatState}`.trim();

            const name = playerInfo ? playerInfo.name : (isMe ? 'You' : `Player ${index + 1}`);

            // Show starting PnL during hand, actual PnL at results
            const displayPnl = phase === 'results' ? player.actualPnl : player.pnl;
            const pnlClass = displayPnl > 0 ? 'is-good' : (displayPnl < 0 ? 'is-bad' : '');

            // Get result for this player at showdown
            let resultHtml = '';
            if (phase === 'results' && results) {
                const playerResult = results.find(r => r.playerId === player.id);
                if (playerResult) {
                    // Show hole cards
                    const holeCards = playerResult.holeCards || [];
                    const cardsHtml = `<div class="player-cards seat-cards">${PlayingCards.rowHtml(holeCards.map(card => this.cardFace(card)))}</div>`;

                    // Show hands on each board (name and multiplier badge)
                    const handsHtml = `
                        <div class="player-hands hand-chip-row">
                            ${this.handResultHtml(playerResult.hand1, 'Board 1')}
                            ${this.handResultHtml(playerResult.hand2, 'Board 2')}
                        </div>
                    `;

                    // Show equation: bet × totalMultiplier = hand payout (not net PnL)
                    const payoutClass = playerResult.netResult >= 0 ? 'win' : 'lose';
                    const handPayout = playerResult.qualifies
                        ? playerResult.totalBet * playerResult.totalMultiplier
                        : -playerResult.totalBet;
                    const equationText = playerResult.qualifies
                        ? `${this.formatCurrency(playerResult.totalBet)} × ${playerResult.totalMultiplier} = ${this.formatCurrency(handPayout, true)}`
                        : `Foul = ${this.formatCurrency(handPayout, true)}`;

                    resultHtml = `
                        ${cardsHtml}
                        ${handsHtml}
                        <div class="payout-equation ${playerResult.qualifies ? 'win' : 'lose'}">${equationText}</div>
                        <div class="payout ${payoutClass}">PnL this hand: ${this.formatCurrency(playerResult.netResult, true)}</div>
                    `;
                }
            }

            const statusHtml = phase !== 'results'
                ? (player.hasActed
                    ? '<span class="status seat-badge seat-badge--good">Acted</span>'
                    : '<span class="status waiting seat-badge">Waiting</span>')
                : '';

            div.innerHTML = `
                <span class="seat-avatar" aria-hidden="true">${this.initials(name)}</span>
                <div class="name seat-name"><span>${this.escapeHtml(name)}</span>${isMe ? '<span class="seat-badge">You</span>' : ''}</div>
                <div class="seat-meta">
                    <span class="pnl seat-pnl ${pnlClass}">PnL ${this.formatCurrency(displayPnl)}</span>
                    <span class="bet-amount">Bet ${this.formatCurrency(player.totalBet)}</span>
                    ${statusHtml}
                </div>
                ${resultHtml}
            `;

            container.appendChild(div);
        });

        // Show queued players (waiting for next hand)
        if (queuedPlayerIds && queuedPlayerIds.length > 0) {
            queuedPlayerIds.forEach(playerId => {
                // Don't show if they're already in the active players list
                if (players.some(p => p.id === playerId)) return;

                const playerInfo = this.multiplayer.getPlayer(playerId);
                const isMe = playerId === this.myPlayerId;
                const name = playerInfo ? playerInfo.name : (isMe ? 'You' : 'Player');

                const div = document.createElement('article');
                div.className = 'player-box seat seat--queued queued';

                div.innerHTML = `
                    <span class="seat-avatar" aria-hidden="true">${this.initials(name)}</span>
                    <div class="name seat-name"><span>${this.escapeHtml(name)}</span>${isMe ? '<span class="seat-badge">You</span>' : ''}</div>
                    <div class="seat-meta"><span class="queued-status seat-badge seat-badge--warn">Joining next hand</span></div>
                `;

                container.appendChild(div);
            });
        }
    }

    /**
     * A board result as a hand chip: name, multiplier badge (gold is the
     * multiplier colour) and whether it qualifies.
     */
    handResultHtml(hand, label) {
        const tone = hand.qualifies ? 'hand-chip--good' : 'hand-chip--bad';
        const state = hand.qualifies ? 'qualified' : 'fouled';
        return `<span class="hand-result hand-chip ${tone} ${state}">` +
            `${label ? `<span class="hand-chip-label">${label}</span>` : ''}` +
            `<strong>${this.escapeHtml(hand.name)}</strong>` +
            `<span class="badge badge--warn mult">${hand.multiplier}×</span>` +
            `<span class="sr-only">${hand.qualifies ? 'qualifies' : 'fouls'}</span>` +
            `</span>`;
    }

    updateActionButtons(state, myPlayer) {
        const actionButtons = document.getElementById('action-buttons');
        const hostControls = document.getElementById('host-showdown-controls');
        const waitingMsg = document.getElementById('waiting-next');
        const checkBtn = document.getElementById('check-btn');
        const doubleBtn = document.getElementById('double-btn');

        if (state.phase === 'results') {
            // Hide action buttons, show host controls or waiting message
            actionButtons.classList.add('hidden');

            if (this.multiplayer.isHost) {
                hostControls.classList.remove('hidden');
                waitingMsg.classList.add('hidden');

                // Refill the next-bet input from the table unless the host is editing it
                const nextBetInput = document.getElementById('next-bet');
                if (nextBetInput && document.activeElement !== nextBetInput) {
                    nextBetInput.value = state.baseBet % 1 === 0 ? state.baseBet : state.baseBet.toFixed(2);
                }
            } else {
                hostControls.classList.add('hidden');
                waitingMsg.classList.remove('hidden');
            }
            return;
        }

        // Normal play - show action buttons
        actionButtons.classList.remove('hidden');
        hostControls.classList.add('hidden');
        waitingMsg.classList.add('hidden');

        const canAct = myPlayer && !myPlayer.hasActed;

        checkBtn.disabled = !canAct;
        doubleBtn.disabled = !canAct;
    }

    updateBoardResults(state, myPlayer) {
        if (!myPlayer) return;

        const holeCards = myPlayer.holeCards.filter(c => !c.faceDown);
        if (holeCards.length !== 4) return;

        const board1Cards = state.board1.filter(c => !c.faceDown);
        const board2Cards = state.board2.filter(c => !c.faceDown);

        if (board1Cards.length !== 5 || board2Cards.length !== 5) return;

        const hand1 = Poker.evaluateOmahaHand(holeCards, board1Cards);
        const hand2 = Poker.evaluateOmahaHand(holeCards, board2Cards);

        const result1 = document.getElementById('board-1-result');
        const result2 = document.getElementById('board-2-result');

        const qualifies1 = Poker.doesHandQualify(hand1);
        const qualifies2 = Poker.doesHandQualify(hand2);

        const mult1 = Poker.getMultiplier(hand1);
        const mult2 = Poker.getMultiplier(hand2);
        const hand1Pnl = qualifies1 ? myPlayer.totalBet * mult1 : -myPlayer.totalBet;
        const hand2Pnl = qualifies2 ? myPlayer.totalBet * mult2 : -myPlayer.totalBet;

        result1.innerHTML = this.boardResultHtml(hand1, mult1, qualifies1);
        result1.className = `board-result hand-chip ${qualifies1 ? 'qualified hand-chip--good' : 'fouled hand-chip--bad'}`;

        result2.innerHTML = this.boardResultHtml(hand2, mult2, qualifies2);
        result2.className = `board-result hand-chip ${qualifies2 ? 'qualified hand-chip--good' : 'fouled hand-chip--bad'}`;

        // Update the player-hand-area with total pnl this hand
        this.updateMyHandResults(state, myPlayer, hand1, hand2, qualifies1, qualifies2);
    }

    boardResultHtml(hand, multiplier, qualifies) {
        return `<strong>${this.escapeHtml(hand.name)}</strong>` +
            `<span class="badge badge--warn mult">${multiplier}×</span>` +
            `<span class="board-result-state">${qualifies ? 'Qualifies' : 'Foul'}</span>`;
    }

    updateMyHandResults(state, myPlayer, hand1, hand2, qualifies1, qualifies2) {
        // Find or create the results container in player-hand-area
        const handArea = document.querySelector('.player-hand-area');
        let resultsDiv = handArea.querySelector('.my-hand-results');

        if (!resultsDiv) {
            resultsDiv = document.createElement('div');
            resultsDiv.className = 'my-hand-results';
            handArea.appendChild(resultsDiv);
        }

        const mult1 = Poker.getMultiplier(hand1);
        const mult2 = Poker.getMultiplier(hand2);
        const hand1Pnl = qualifies1 ? myPlayer.totalBet * mult1 : -myPlayer.totalBet;
        const hand2Pnl = qualifies2 ? myPlayer.totalBet * mult2 : -myPlayer.totalBet;

        // Get actual net result from results
        const myResult = state.results?.find(r => r.playerId === myPlayer.id);
        const netPnl = myResult ? myResult.netResult : 0;
        const netClass = netPnl >= 0 ? 'win' : 'lose';

        const totalMult = (qualifies1 && qualifies2) ? mult1 * mult2 : 0;
        const handPayout = (qualifies1 && qualifies2)
            ? myPlayer.totalBet * totalMult
            : -myPlayer.totalBet;
        const equationClass = (qualifies1 && qualifies2) ? 'win' : 'lose';
        const equationText = (qualifies1 && qualifies2)
            ? `${this.formatCurrency(myPlayer.totalBet)} × ${totalMult} = ${this.formatCurrency(handPayout, true)}`
            : `Foul = ${this.formatCurrency(handPayout, true)}`;

        resultsDiv.innerHTML = `
            <div class="hand-chip-row">
                ${this.handResultHtml({ name: hand1.name, multiplier: mult1, qualifies: qualifies1 }, 'Board 1')}
                ${this.handResultHtml({ name: hand2.name, multiplier: mult2, qualifies: qualifies2 }, 'Board 2')}
            </div>
            <div class="my-hand-equation ${equationClass}">${equationText}</div>
            <div class="my-hand-total ${netClass}">PnL this hand: ${this.formatCurrency(netPnl, true)}</div>
        `;
    }

    // ============ RULES MODAL ============

    showRules() {
        const dialog = document.getElementById('rules-modal');
        if (window.Sheet) Sheet.open(dialog, { dismissible: true, sheet: true });
        else dialog.showModal();
    }

    hideRules() {
        const dialog = document.getElementById('rules-modal');
        if (window.Sheet) Sheet.close(dialog);
        else dialog.close();
    }

    // ============ UTILITIES ============

    /**
     * Toasts: errors go to the assertive #alerts stack, everything else to
     * the polite #toast-container. Each toast has a dismiss control and
     * pauses its timer while hovered or focused.
     */
    showToast(message, type = 'info') {
        const alert = type === 'error';
        const container = document.getElementById(alert ? 'alerts' : 'toast-container') || document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}${alert ? ' toast--alert' : type === 'success' ? ' toast--good' : ''}`;
        const text = document.createElement('span');
        text.textContent = message;
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'btn btn--ghost btn--icon btn--sm';
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.innerHTML = '<svg class="icon" aria-hidden="true"><use href="../../shared/icons.svg#i-close" /></svg>';
        toast.append(text, dismiss);

        let timer = 0;
        const remove = () => { clearTimeout(timer); toast.remove(); };
        const arm = () => { clearTimeout(timer); timer = setTimeout(remove, alert ? 6000 : 3500); };
        dismiss.addEventListener('click', remove);
        toast.addEventListener('mouseenter', () => clearTimeout(timer));
        toast.addEventListener('focusin', () => clearTimeout(timer));
        toast.addEventListener('mouseleave', arm);
        toast.addEventListener('focusout', arm);
        while (container.children.length >= 3) container.firstElementChild.remove();
        container.appendChild(toast);
        arm();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.gameController = new GameController();
});
