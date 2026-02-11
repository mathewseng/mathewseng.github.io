/**
 * Edge the Dealer - Main Controller
 * Handles UI, state rendering, and multiplayer orchestration.
 */

class EdgeTheDealerController {
    constructor() {
        this.multiplayer = new MultiplayerManager();
        this.game = new EdgeTheDealerGame();
        this.currentScreen = 'menu';
        this.myPlayerId = null;
        this.gameStarted = false;

        this.handNumber = 0;
        this.lastPhase = null;
        this.lastDrawRound = 0;
        this.currentState = null;
        this.selectedDiscards = new Set();

        this.setupEventListeners();
        this.setupMultiplayerCallbacks();
        this.setupLogAndChat();

        this.checkForReconnection();
    }

    async checkForReconnection() {
        if (!this.multiplayer.hasSession()) return;

        const session = this.multiplayer.loadSession();
        if (!session) return;

        this.showToast('Reconnecting...', 'info');

        try {
            const result = await this.multiplayer.reconnect();
            this.myPlayerId = result.peerId;

            document.getElementById('room-code').textContent = result.roomCode;
            document.getElementById('your-name').textContent = session.playerName;

            if (result.isHost) {
                document.getElementById('start-game-btn').classList.remove('hidden');
                document.getElementById('host-controls').style.display = 'flex';
                document.getElementById('waiting-message').classList.add('hidden');

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
                document.getElementById('start-game-btn').classList.add('hidden');
                document.getElementById('host-controls').style.display = 'none';
                document.getElementById('waiting-message').classList.remove('hidden');

                this.showScreen('lobby');
                this.showToast('Reconnected!', 'success');
            }
        } catch (err) {
            console.error('Reconnection failed:', err);
            this.multiplayer.clearSession();
            this.showToast(`Could not reconnect: ${err.message}`, 'error');
        }
    }

    formatCurrency(amount, forceSign = false) {
        const abs = Math.abs(amount);
        const isWhole = abs === Math.floor(abs);
        const formatted = isWhole ? abs.toString() : abs.toFixed(2);

        if (amount < 0) return `-$${formatted}`;
        if (forceSign && amount > 0) return `+$${formatted}`;
        return `$${formatted}`;
    }

    // ============ SETUP ============

    setupEventListeners() {
        // Menu
        const startJoinBtn = document.getElementById('start-join-btn');
        const roomCodeInput = document.getElementById('room-code-input');
        startJoinBtn.addEventListener('click', () => this.startOrJoinGame());
        roomCodeInput.addEventListener('input', () => this.updateStartJoinButton());
        roomCodeInput.addEventListener('keypress', e => {
            if (e.key === 'Enter') this.startOrJoinGame();
        });

        // Lobby
        document.getElementById('copy-code-btn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leave-lobby-btn').addEventListener('click', () => this.leaveLobby());

        // Game controls
        document.getElementById('clear-discards-btn').addEventListener('click', () => this.clearDiscards());
        document.getElementById('confirm-discards-btn').addEventListener('click', () => this.confirmDiscards());
        document.getElementById('next-hand-btn').addEventListener('click', () => this.startNextHand());
        document.getElementById('rules-btn').addEventListener('click', () => this.showRules());
        document.getElementById('close-rules').addEventListener('click', () => this.hideRules());

        // Card selection
        document.getElementById('hole-cards').addEventListener('click', (e) => {
            const slot = e.target.closest('.card-slot');
            if (!slot) return;
            const index = parseInt(slot.dataset.slot, 10);
            if (!Number.isInteger(index)) return;
            this.toggleDiscard(index);
        });

        // Close modal on backdrop click
        document.getElementById('rules-modal').addEventListener('click', (e) => {
            if (e.target.id === 'rules-modal') this.hideRules();
        });
    }

    setupMultiplayerCallbacks() {
        this.multiplayer.onPlayerJoin = (players) => {
            this.updateLobbyPlayers(players);
        };

        this.multiplayer.onPlayerLeave = (playerId, mayReconnect = false) => {
            if (mayReconnect) {
                this.showToast('A player disconnected (may reconnect)', 'info');
            } else {
                this.showToast('A player has left', 'info');
            }

            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());

            if (this.currentScreen === 'game' && !mayReconnect) {
                this.game.removePlayer(playerId);
            }
        };

        this.multiplayer.onReconnected = () => {
            this.showToast('A player reconnected!', 'success');
            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());
            if (this.gameStarted && this.multiplayer.isHost) {
                this.multiplayer.broadcastGameState(this.game.getGameState());
            }
        };

        this.multiplayer.onGameStateUpdate = (state) => {
            this.updateGameUI(state);
        };

        this.multiplayer.onConnected = (data) => {
            this.showToast(data.reconnected ? 'Reconnected to room!' : 'Connected to room!', 'success');

            if (data.gameInProgress) {
                this.gameStarted = true;
                if (!data.reconnected) {
                    this.showToast('Game in progress - you will join next hand', 'info');
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

    setupLogAndChat() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-chat-btn');

        chatInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });
        sendBtn?.addEventListener('click', () => this.sendChatMessage());

        const emojiBtn = document.getElementById('emoji-picker-btn');
        const emojiPicker = document.getElementById('emoji-picker');
        emojiBtn?.addEventListener('click', () => emojiPicker?.classList.toggle('hidden'));

        document.querySelectorAll('.emoji-option').forEach(emoji => {
            emoji.addEventListener('click', () => {
                const text = emoji.textContent;
                if (chatInput) {
                    chatInput.value += text;
                    chatInput.focus();
                }
                emojiPicker?.classList.add('hidden');
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-picker') && !e.target.closest('.emoji-picker-btn')) {
                emojiPicker?.classList.add('hidden');
            }
        });
    }

    // ============ MENU / LOBBY ============

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

    startOrJoinGame() {
        const roomCode = document.getElementById('room-code-input').value.trim();
        if (roomCode) this.joinRoom();
        else this.createRoom();
    }

    setButtonLoading(btn, loading) {
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

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

    updateLobbyPlayers(players) {
        const container = document.getElementById('lobby-players');
        container.innerHTML = '';

        players.forEach(player => {
            const isQueued = player.queued;
            const div = document.createElement('div');
            div.className = `lobby-player ${player.isHost ? 'host' : ''} ${isQueued ? 'queued' : ''}`;
            div.innerHTML = `
                <div class="player-name">${this.escapeHtml(player.name)}</div>
                ${player.isHost ? '<div class="host-badge">Host</div>' : ''}
                ${isQueued ? '<div class="queued-badge">Joining next hand</div>' : ''}
            `;
            container.appendChild(div);
        });

        document.getElementById('player-count').textContent = `(${players.length}/9)`;

        const startBtn = document.getElementById('start-game-btn');
        if (this.multiplayer.isHost && players.length >= 1) {
            startBtn.disabled = false;
        }
    }

    copyRoomCode() {
        navigator.clipboard.writeText(this.multiplayer.roomCode).then(() => {
            this.showToast('Room code copied!', 'success');
        });
    }

    leaveLobby() {
        this.multiplayer.leave();
        this.showScreen('menu');
        this.gameStarted = false;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${screenId}-screen`).classList.add('active');
        this.currentScreen = screenId;

        if (screenId === 'game') {
            document.getElementById('game-room-code').textContent = this.multiplayer.roomCode;
        }
    }

    // ============ GAME FLOW ============

    startGame() {
        if (!this.multiplayer.isHost) return;

        const baseBet = parseFloat(document.getElementById('base-bet').value) || 1.0;
        const drawCount = parseInt(document.getElementById('draw-count').value, 10) || 1;
        const playerIds = Array.from(this.multiplayer.players.keys());

        if (playerIds.length > this.game.maxPlayers) {
            this.showToast(`Too many players for one deck (max ${this.game.maxPlayers})`, 'error');
            return;
        }

        try {
            this.game.initGame(playerIds, baseBet, drawCount);
            this.game.startHand();
        } catch (err) {
            this.showToast(err.message || 'Failed to start game', 'error');
            return;
        }

        this.gameStarted = true;
        this.multiplayer.setGameInProgress(true);
        this.selectedDiscards.clear();
        this.lastPhase = null;
        this.lastDrawRound = 0;

        this.logHandStart(baseBet, drawCount, this.game.players);
        this.multiplayer.broadcast({
            type: 'hand_start_log',
            baseBet,
            drawCount,
            players: this.game.players.map(p => ({ id: p.id }))
        });

        this.multiplayer.broadcast({ type: 'start_game' });
        this.multiplayer.broadcastGameState(this.game.getGameState());

        this.showScreen('game');
    }

    startNextHand() {
        if (!this.multiplayer.isHost) return;

        const nextBet = parseFloat(document.getElementById('next-bet').value) || 1.0;
        const nextDrawCount = parseInt(document.getElementById('next-draw-count').value, 10) || 1;

        this.game.setBaseBet(nextBet);
        this.game.setDrawCount(nextDrawCount);
        this.multiplayer.clearQueuedStatus();

        try {
            this.game.startHand();
        } catch (err) {
            this.showToast(err.message || 'Failed to start next hand', 'error');
            return;
        }

        this.selectedDiscards.clear();
        this.lastPhase = null;
        this.lastDrawRound = 0;

        this.logHandStart(this.game.baseBet, this.game.drawCount, this.game.players);
        this.multiplayer.broadcast({
            type: 'hand_start_log',
            baseBet: this.game.baseBet,
            drawCount: this.game.drawCount,
            players: this.game.players.map(p => ({ id: p.id }))
        });

        this.multiplayer.broadcastGameState(this.game.getGameState());
    }

    handleGameMessage(fromPeerId, data) {
        // Chat messages (all peers)
        if (data.type === 'chat') {
            if (this.multiplayer.isHost) {
                this.multiplayer.broadcast({
                    type: 'chat',
                    senderId: data.senderId,
                    senderName: data.senderName,
                    text: data.text,
                    timestamp: data.timestamp,
                    isEmojiOnly: data.isEmojiOnly
                }, fromPeerId);
            }
            if (data.senderId !== this.myPlayerId) {
                this.addChatMessage(data.senderId, data.senderName, data.text, data.timestamp, data.isEmojiOnly);
            }
            return;
        }

        if (data.type === 'discard_log') {
            this.logDiscardConfirm(data.playerId, data.discardCount, data.round, data.totalRounds);
            return;
        }

        if (data.type === 'hand_start_log') {
            this.logHandStart(data.baseBet, data.drawCount, data.players);
            return;
        }

        if (data.type === 'system_log') {
            if (data.message) {
                this.addLogEntry('board', this.escapeHtml(data.message));
            }
            return;
        }

        if (!this.multiplayer.isHost) {
            if (data.type === 'start_game') {
                this.gameStarted = true;
                this.showScreen('game');
            }
            return;
        }

        switch (data.type) {
            case 'confirm_discards': {
                const actingId = data.playerId || fromPeerId;
                const stateBefore = this.game.getGameState();
                const roundBefore = stateBefore.currentDrawRound;
                const phaseBefore = stateBefore.phase;
                const discardCount = this.countDiscardSelection(data.discards);

                const result = this.game.confirmDiscards(actingId, data.discards || []);
                if (!result.success) {
                    this.multiplayer.sendToPeer(fromPeerId, {
                        type: 'error',
                        message: result.error
                    });
                    return;
                }

                this.logDiscardConfirm(actingId, discardCount, roundBefore, this.game.drawCount);
                this.multiplayer.broadcast({
                    type: 'discard_log',
                    playerId: actingId,
                    discardCount,
                    round: roundBefore,
                    totalRounds: this.game.drawCount
                });

                const stateAfter = this.game.getGameState();
                if (phaseBefore === 'draw' && stateAfter.phase === 'draw' && stateAfter.currentDrawRound !== roundBefore) {
                    this.addLogEntry('board', `Draw round ${stateAfter.currentDrawRound} begins.`);
                    this.multiplayer.broadcast({
                        type: 'system_log',
                        message: `Draw round ${stateAfter.currentDrawRound} begins.`
                    });
                }

                this.multiplayer.broadcastGameState(stateAfter);
                break;
            }

            case 'join':
                if (this.gameStarted && this.game.phase !== 'waiting') {
                    this.game.queuePlayer(fromPeerId);
                    this.showToast(`${data.name || 'Player'} will join next hand`, 'info');
                    this.addSystemMessage(`${data.name || 'Player'} joined and will play next hand`);
                    this.multiplayer.sendToPeer(fromPeerId, {
                        type: 'game_state',
                        state: this.multiplayer.filterStateForPlayer(this.game.getGameState(), fromPeerId)
                    });
                }
                break;
        }
    }

    confirmDiscards() {
        if (!this.currentState || this.currentState.phase !== 'draw') return;
        const myPlayer = this.currentState.players.find(p => p.id === this.myPlayerId);
        if (!myPlayer || myPlayer.hasConfirmed) return;

        const discards = Array.from(this.selectedDiscards).sort((a, b) => a - b);
        const discardCount = discards.length;

        if (this.multiplayer.isHost) {
            const stateBefore = this.game.getGameState();
            const roundBefore = stateBefore.currentDrawRound;
            const phaseBefore = stateBefore.phase;

            const result = this.game.confirmDiscards(this.myPlayerId, discards);
            if (!result.success) {
                this.showToast(result.error, 'error');
                return;
            }

            this.logDiscardConfirm(this.myPlayerId, discardCount, roundBefore, this.game.drawCount);
            this.multiplayer.broadcast({
                type: 'discard_log',
                playerId: this.myPlayerId,
                discardCount,
                round: roundBefore,
                totalRounds: this.game.drawCount
            });

            const stateAfter = this.game.getGameState();
            if (phaseBefore === 'draw' && stateAfter.phase === 'draw' && stateAfter.currentDrawRound !== roundBefore) {
                this.addLogEntry('board', `Draw round ${stateAfter.currentDrawRound} begins.`);
                this.multiplayer.broadcast({
                    type: 'system_log',
                    message: `Draw round ${stateAfter.currentDrawRound} begins.`
                });
            }

            this.multiplayer.broadcastGameState(stateAfter);
        } else {
            this.multiplayer.sendToHost({
                type: 'confirm_discards',
                playerId: this.myPlayerId,
                discards
            });
        }
    }

    clearDiscards() {
        if (!this.currentState || this.currentState.phase !== 'draw') return;
        const myPlayer = this.currentState.players.find(p => p.id === this.myPlayerId);
        if (!myPlayer || myPlayer.hasConfirmed) return;
        this.selectedDiscards.clear();
        this.updateGameUI(this.currentState);
    }

    toggleDiscard(slotIndex) {
        if (!this.currentState || this.currentState.phase !== 'draw') return;
        const myPlayer = this.currentState.players.find(p => p.id === this.myPlayerId);
        if (!myPlayer || myPlayer.hasConfirmed) return;
        if (!myPlayer.holeCards || !myPlayer.holeCards[slotIndex] || myPlayer.holeCards[slotIndex].faceDown) return;

        if (this.selectedDiscards.has(slotIndex)) {
            this.selectedDiscards.delete(slotIndex);
        } else {
            if (this.selectedDiscards.size >= 5) return;
            this.selectedDiscards.add(slotIndex);
        }

        this.updateGameUI(this.currentState);
    }

    // ============ UI ============

    updateGameUI(state) {
        this.currentState = state;

        // State transitions for logs and local UI reset
        if (state.phase !== this.lastPhase || state.currentDrawRound !== this.lastDrawRound) {
            if (this.lastDrawRound !== 0 && state.currentDrawRound !== this.lastDrawRound) {
                this.selectedDiscards.clear();
            }

            if (state.phase === 'results' && this.lastPhase !== 'results' && state.results) {
                this.logShowdown(state);
                this.logPnLSummary(state.players);
            }

            if (this.lastPhase === 'results' && state.phase === 'draw') {
                this.selectedDiscards.clear();
            }

            this.lastPhase = state.phase;
            this.lastDrawRound = state.currentDrawRound;
        }

        // Dealer cards and dealer hand
        this.updateDealerCards(state);
        this.updateDealerResult(state);

        // My player view
        const myPlayer = state.players.find(p => p.id === this.myPlayerId);
        if (myPlayer) {
            const displayPnl = state.phase === 'results' ? myPlayer.actualPnl : myPlayer.pnl;
            document.getElementById('my-pnl').textContent = this.formatCurrency(displayPnl);
            document.getElementById('my-pnl').style.color = displayPnl >= 0 ? 'var(--gold-light)' : 'var(--danger)';
            document.getElementById('current-bet').textContent = this.formatCurrency(myPlayer.totalBet);
            this.updateHoleCards(myPlayer.holeCards, !myPlayer.hasConfirmed && state.phase === 'draw');
            this.updateMyHandResults(state, myPlayer);
        }

        // Everyone else
        this.updatePlayersArea(state.players, state.phase, state.results, state.queuedPlayers);
        this.updateActionButtons(state, myPlayer);
    }

    updateDealerCards(state) {
        const dealerGroups = this.getDealerCardGroupsFromState(state);
        this.renderDealerRow('dealer-used-cards', dealerGroups.dealerUsedCards, false);
        this.renderDealerRow('dealer-unused-cards', dealerGroups.dealerUnusedCards, true);
    }

    updateDealerResult(state) {
        const resultEl = document.getElementById('dealer-hand-result');
        const dealerGroups = this.getDealerCardGroupsFromState(state);
        const dealerBest = dealerGroups.dealerBestHand;
        if (!dealerBest) {
            resultEl.textContent = '';
            resultEl.classList.remove('result-mode');
            return;
        }

        let modeText = '';
        if (state.phase === 'results') {
            modeText = state.resolutionType === 'lowest_beating_dealer'
                ? 'Mode: Lowest hand above dealer wins'
                : 'Mode: Nobody beat dealer - highest hand wins';
            resultEl.classList.add('result-mode');
        } else {
            resultEl.classList.remove('result-mode');
        }

        resultEl.innerHTML = `
            Dealer Best: <strong>${this.escapeHtml(dealerBest.name)}</strong>
            ${modeText ? `<span class="mode-note">${this.escapeHtml(modeText)}</span>` : ''}
        `;
    }

    updateHoleCards(cards, canSelect) {
        const container = document.getElementById('hole-cards');
        const slots = container.querySelectorAll('.card-slot');
        const displayCards = this.sortCardsForDisplay(cards || []);

        slots.forEach((slot, i) => {
            slot.innerHTML = '';
            slot.classList.remove('dealt', 'selected-discard', 'locked');

            const card = displayCards[i];
            if (!card) return;

            if (card.faceDown) {
                const cardEl = document.createElement('div');
                cardEl.className = 'card face-down';
                slot.appendChild(cardEl);
            } else {
                slot.appendChild(this.createCardElement(Poker.formatCard(card)));
                if (canSelect && this.selectedDiscards.has(i)) {
                    slot.classList.add('selected-discard');
                }
            }

            if (!canSelect) {
                slot.classList.add('locked');
            }

            slot.classList.add('dealt');
        });

        const help = document.getElementById('discard-help');
        if (this.currentState?.phase === 'draw') {
            help.textContent = canSelect
                ? `Selected to discard: ${this.selectedDiscards.size}`
                : 'Confirmed. Waiting for others...';
        } else {
            help.textContent = 'Showdown complete. Host starts the next hand.';
        }
    }

    updatePlayersArea(players, phase, results = null, queuedPlayerIds = []) {
        const container = document.getElementById('players-area');
        container.innerHTML = '';

        players.forEach((player, index) => {
            const playerInfo = this.multiplayer.getPlayer(player.id);
            const isMe = player.id === this.myPlayerId;
            const name = playerInfo ? playerInfo.name : (isMe ? 'You' : `Player ${index + 1}`);
            const displayPnl = phase === 'results' ? player.actualPnl : player.pnl;

            const playerBox = document.createElement('div');
            playerBox.className = `player-box ${player.hasConfirmed ? 'confirmed acted' : ''} ${phase === 'results' ? 'showdown' : ''}`;

            let detailsHtml = '';
            if (phase !== 'results') {
                detailsHtml = `
                    <div class="status ${player.hasConfirmed ? 'confirmed' : 'waiting'}">
                        ${player.hasConfirmed ? '✓ Confirmed' : '... Waiting'}
                    </div>
                    <div class="discard-count">Selected discards: ${player.discardCount || 0}</div>
                `;
            } else if (results) {
                const result = results.find(r => r.playerId === player.id);
                if (result) {
                    const sortedCards = this.sortCardsForDisplay(result.holeCards || []);
                    let cardsHtml = '<div class="player-cards">';
                    sortedCards.forEach(card => {
                        const formatted = Poker.formatCard(card);
                        cardsHtml += `<div class="mini-card ${formatted.isRed ? 'red' : 'black'}">
                            <span class="rank">${formatted.rank}</span>
                            <span class="suit">${formatted.suit}</span>
                        </div>`;
                    });
                    cardsHtml += '</div>';

                    const compareClass = result.beatsDealer ? 'beats' : 'misses';
                    const compareText = result.beatsDealer ? 'Beats dealer' : 'Does not beat dealer';
                    const payoutClass = result.netResult >= 0 ? 'win' : 'lose';

                    detailsHtml = `
                        ${cardsHtml}
                        <div class="hand-result-line"><strong>${this.escapeHtml(result.hand.name)}</strong></div>
                        <div class="dealer-compare ${compareClass}">${compareText}</div>
                        ${result.isWinner ? '<div class="winner-label">🏆 Winner</div>' : ''}
                        <div class="payout ${payoutClass}">PnL this hand: ${this.formatCurrency(result.netResult, true)}</div>
                    `;
                }
            }

            playerBox.innerHTML = `
                <div class="name">${this.escapeHtml(name)}${isMe ? ' (You)' : ''}</div>
                <div class="pnl" style="color: ${displayPnl >= 0 ? 'var(--gold-light)' : 'var(--danger)'}">
                    PnL: ${this.formatCurrency(displayPnl)}
                </div>
                <div class="bet-amount">Bet: ${this.formatCurrency(player.totalBet)}</div>
                ${detailsHtml}
            `;
            container.appendChild(playerBox);
        });

        if (queuedPlayerIds && queuedPlayerIds.length > 0) {
            queuedPlayerIds.forEach(playerId => {
                if (players.some(p => p.id === playerId)) return;
                const playerInfo = this.multiplayer.getPlayer(playerId);
                const isMe = playerId === this.myPlayerId;
                const name = playerInfo ? playerInfo.name : (isMe ? 'You' : 'Player');

                const div = document.createElement('div');
                div.className = 'player-box queued';
                div.innerHTML = `
                    <div class="name">${this.escapeHtml(name)}${isMe ? ' (You)' : ''}</div>
                    <div class="queued-status">⏳ Waiting for next hand</div>
                `;
                container.appendChild(div);
            });
        }
    }

    updateActionButtons(state, myPlayer) {
        const actionButtons = document.getElementById('action-buttons');
        const hostControls = document.getElementById('host-showdown-controls');
        const waitingNext = document.getElementById('waiting-next');
        const waitingDraw = document.getElementById('waiting-draw');
        const drawRoundBanner = document.getElementById('draw-round-banner');

        const clearBtn = document.getElementById('clear-discards-btn');
        const confirmBtn = document.getElementById('confirm-discards-btn');

        drawRoundBanner.textContent = `Draw Round ${state.currentDrawRound} of ${state.drawCount}`;

        if (state.phase === 'results') {
            actionButtons.classList.add('hidden');
            waitingDraw.classList.add('hidden');

            if (this.multiplayer.isHost) {
                hostControls.classList.remove('hidden');
                waitingNext.classList.add('hidden');

                const nextBetInput = document.getElementById('next-bet');
                const nextDrawInput = document.getElementById('next-draw-count');

                if (document.activeElement !== nextBetInput) {
                    nextBetInput.value = state.baseBet % 1 === 0 ? state.baseBet : state.baseBet.toFixed(2);
                }
                if (document.activeElement !== nextDrawInput) {
                    nextDrawInput.value = String(state.drawCount);
                }
            } else {
                hostControls.classList.add('hidden');
                waitingNext.classList.remove('hidden');
            }
            return;
        }

        hostControls.classList.add('hidden');
        waitingNext.classList.add('hidden');
        actionButtons.classList.remove('hidden');

        const canAct = !!myPlayer && !myPlayer.hasConfirmed;
        clearBtn.disabled = !canAct || this.selectedDiscards.size === 0;
        confirmBtn.disabled = !canAct;
        waitingDraw.classList.toggle('hidden', !myPlayer || !myPlayer.hasConfirmed);
    }

    updateMyHandResults(state, myPlayer) {
        const handArea = document.querySelector('.player-hand-area');
        let resultsDiv = handArea.querySelector('.my-hand-results');

        if (!resultsDiv) {
            resultsDiv = document.createElement('div');
            resultsDiv.className = 'my-hand-results';
            handArea.appendChild(resultsDiv);
        }

        if (state.phase !== 'results' || !state.results) {
            resultsDiv.innerHTML = '';
            return;
        }

        const myResult = state.results.find(r => r.playerId === myPlayer.id);
        if (!myResult) {
            resultsDiv.innerHTML = '';
            return;
        }

        const dealerBest = state.dealerBestHand || this.getDealerCardGroupsFromState(state).dealerBestHand;
        if (!dealerBest) {
            resultsDiv.innerHTML = '';
            return;
        }

        const compareClass = myResult.beatsDealer ? 'qualified' : 'fouled';
        const netClass = myResult.netResult >= 0 ? 'win' : 'lose';
        const modeText = state.resolutionType === 'lowest_beating_dealer'
            ? 'Lowest hand above dealer won'
            : 'No one beat dealer - highest hand won';

        resultsDiv.innerHTML = `
            <div class="my-hand-row">Dealer: ${this.escapeHtml(dealerBest.name)}</div>
            <div class="my-hand-row ${compareClass}">You: ${this.escapeHtml(myResult.hand.name)} ${myResult.beatsDealer ? '✓' : '✗'}</div>
            <div class="my-hand-equation">${this.escapeHtml(modeText)}</div>
            <div class="my-hand-total ${netClass}">PnL this hand: ${this.formatCurrency(myResult.netResult, true)}</div>
        `;
    }

    createCardElement(formattedCard) {
        const card = document.createElement('div');
        card.className = `card ${formattedCard.isRed ? 'red' : 'black'}`;
        card.innerHTML = `
            <span class="rank">${formattedCard.rank}</span>
            <span class="suit">${formattedCard.suit}</span>
        `;
        return card;
    }

    renderDealerRow(containerId, cards, markUnused) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const slots = container.querySelectorAll('.card-slot');
        slots.forEach((slot, index) => {
            slot.innerHTML = '';
            slot.classList.remove('dealt', 'unused-slot');

            const card = cards[index];
            if (!card) return;

            if (card.faceDown) {
                const cardEl = document.createElement('div');
                cardEl.className = 'card face-down';
                slot.appendChild(cardEl);
            } else {
                const cardEl = this.createCardElement(Poker.formatCard(card));
                if (markUnused) {
                    cardEl.classList.add('unused-card');
                }
                slot.appendChild(cardEl);
            }

            if (markUnused) {
                slot.classList.add('unused-slot');
            }
            slot.classList.add('dealt');
        });
    }

    getDealerCardGroupsFromState(state) {
        const explicitUsed = Array.isArray(state.dealerUsedCards) ? state.dealerUsedCards : [];
        const explicitUnused = Array.isArray(state.dealerUnusedCards) ? state.dealerUnusedCards : [];
        const explicitBest = state.dealerBestHand || null;

        if (explicitUsed.length > 0 || explicitUnused.length > 0) {
            return {
                dealerBestHand: explicitBest,
                dealerUsedCards: this.sortCardsForDisplay(explicitUsed),
                dealerUnusedCards: this.sortCardsForDisplay(explicitUnused)
            };
        }

        const visibleCards = (state.dealerCards || []).filter(card => !card.faceDown);
        if (visibleCards.length < 5) {
            return {
                dealerBestHand: null,
                dealerUsedCards: [],
                dealerUnusedCards: []
            };
        }

        const dealerBestHand = explicitBest || this.evaluateBestFiveFromCards(visibleCards);
        const usedCards = this.sortCardsForDisplay(dealerBestHand?.cards || []);
        const usedIds = new Set(usedCards.map(card => Poker.getCardId(card)));
        const unusedCards = this.sortCardsForDisplay(
            visibleCards.filter(card => !usedIds.has(Poker.getCardId(card)))
        );

        return {
            dealerBestHand,
            dealerUsedCards: usedCards,
            dealerUnusedCards: unusedCards
        };
    }

    getSuitSortValue(suit) {
        const suitOrder = { s: 3, h: 2, d: 1, c: 0 };
        return suitOrder[suit] ?? -1;
    }

    sortCardsForDisplay(cards) {
        if (!Array.isArray(cards)) return [];
        const safeCards = cards.filter(card => card && typeof card === 'object');

        const rankCounts = new Map();
        safeCards.forEach(card => {
            rankCounts.set(card.rank, (rankCounts.get(card.rank) || 0) + 1);
        });

        return [...safeCards].sort((a, b) => {
            const countA = rankCounts.get(a.rank) || 0;
            const countB = rankCounts.get(b.rank) || 0;
            const groupedA = countA > 1;
            const groupedB = countB > 1;

            if (groupedA !== groupedB) {
                return groupedA ? -1 : 1;
            }

            if (groupedA && groupedB && countA !== countB) {
                return countB - countA;
            }

            const rankDiff = Poker.getRankValue(b.rank) - Poker.getRankValue(a.rank);
            if (rankDiff !== 0) return rankDiff;

            return this.getSuitSortValue(b.suit) - this.getSuitSortValue(a.suit);
        });
    }

    countDiscardSelection(selection) {
        if (!Array.isArray(selection)) return 0;
        const unique = new Set();
        selection.forEach(idx => {
            const parsed = parseInt(idx, 10);
            if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 4) {
                unique.add(parsed);
            }
        });
        return unique.size;
    }

    evaluateBestFiveFromCards(cards) {
        const combos = Poker.combinations(cards, 5);
        let best = null;
        combos.forEach(combo => {
            const hand = Poker.evaluate5CardHand(combo);
            if (!best || Poker.compareHands(hand, best) > 0) {
                best = hand;
            }
        });
        if (!best) return null;
        return {
            ...best,
            cards: this.sortCardsForDisplay(best.cards || [])
        };
    }

    // ============ LOGGING ============

    addLogEntry(type, content, extraClass = '') {
        const logContainer = document.getElementById('game-log');
        if (!logContainer) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type} ${extraClass}`.trim();
        entry.innerHTML = content;
        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    logHandStart(baseBet, drawCount, players) {
        this.handNumber += 1;
        const playerNames = players.map(p => {
            const info = this.multiplayer.getPlayer(p.id);
            return info?.name || 'Player';
        }).join(', ');

        this.addLogEntry(
            'hand-start',
            `<strong>═══ Hand #${this.handNumber} ═══</strong><br>` +
            `Bet: ${this.formatCurrency(baseBet)} • Draws: ${drawCount} • Players: ${playerNames}`
        );
    }

    logDiscardConfirm(playerId, discardCount, round, totalRounds) {
        const playerInfo = this.multiplayer.getPlayer(playerId);
        const name = playerInfo?.name || 'Player';
        const isMe = playerId === this.myPlayerId;
        this.addLogEntry(
            'action',
            `<span class="player-name">${name}${isMe ? ' (you)' : ''}</span> ` +
            `confirms ${discardCount} discard${discardCount === 1 ? '' : 's'} ` +
            `(Round ${round}/${totalRounds})`
        );
    }

    logShowdown(state) {
        this.addLogEntry('showdown', '<strong>─── Showdown ───</strong>');

        if (state.dealerBestHand) {
            this.addLogEntry('showdown', `Dealer: <strong>${this.escapeHtml(state.dealerBestHand.name)}</strong>`);
        }

        if (state.resolutionType === 'lowest_beating_dealer') {
            this.addLogEntry('showdown', 'Result mode: Lowest hand that beat dealer wins');
        } else {
            this.addLogEntry('showdown', 'Result mode: Nobody beat dealer, highest hand wins');
        }

        state.results.forEach(result => {
            const playerInfo = this.multiplayer.getPlayer(result.playerId);
            const name = playerInfo?.name || 'Player';
            const isMe = result.playerId === this.myPlayerId;

            const cls = result.netResult > 0 ? 'win' : (result.netResult < 0 ? 'lose' : 'push');
            const compareText = result.beatsDealer ? 'beats dealer' : 'misses dealer';
            this.addLogEntry(
                'result',
                `<span class="player-name">${name}${isMe ? ' (you)' : ''}</span>: ` +
                `${this.escapeHtml(result.hand.name)} (${compareText}) ` +
                `${result.isWinner ? '🏆' : ''} ${this.formatCurrency(result.netResult, true)}`,
                cls
            );
        });
    }

    logPnLSummary(players) {
        this.addLogEntry('showdown', '<strong>─── PnL Summary ───</strong>');
        players.forEach(player => {
            const info = this.multiplayer.getPlayer(player.id);
            const name = info?.name || 'Player';
            const isMe = player.id === this.myPlayerId;
            const pnl = player.actualPnl ?? player.pnl ?? 0;
            const cls = pnl > 0 ? 'win' : (pnl < 0 ? 'lose' : 'push');
            this.addLogEntry(
                'result',
                `<span class="player-name">${name}${isMe ? ' (you)' : ''}</span>: ${this.formatCurrency(pnl, true)} total`,
                cls
            );
        });
    }

    // ============ CHAT ============

    switchTab(tabId) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });
    }

    sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const text = input.value.trim();
        if (!text) return;

        const isEmojiOnly = /^[\p{Emoji}\s]+$/u.test(text) && text.length <= 4;

        if (this.multiplayer.isHost) {
            this.multiplayer.broadcast({
                type: 'chat',
                senderId: this.myPlayerId,
                senderName: this.multiplayer.myName,
                text,
                timestamp: Date.now(),
                isEmojiOnly
            });
            this.addChatMessage(this.myPlayerId, this.multiplayer.myName, text, Date.now(), isEmojiOnly);
        } else {
            this.multiplayer.sendToHost({
                type: 'chat',
                senderId: this.myPlayerId,
                senderName: this.multiplayer.myName,
                text,
                timestamp: Date.now(),
                isEmojiOnly
            });
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
            msg.innerHTML = text;
        } else {
            msg.innerHTML = `
                <span class="sender${isMe ? ' me' : ''}">${senderName}:</span>
                <span class="text">${this.escapeHtml(text)}</span>
                <span class="timestamp">${time}</span>
            `;
        }

        container.appendChild(msg);
        container.scrollTop = container.scrollHeight;

        if (!isMe && !document.getElementById('chat-tab')?.classList.contains('active')) {
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

    // ============ HOST MIGRATION SUPPORT ============

    handleBecomeHost(gameState) {
        this.showToast('You are now the host!', 'success');

        if (gameState) {
            this.game.deserialize(this.convertGameStateToInternal(gameState));
            this.gameStarted = gameState.phase !== 'waiting';
            this.multiplayer.setGameInProgress(this.gameStarted);
        }

        document.getElementById('start-game-btn').classList.remove('hidden');
        document.getElementById('host-controls').style.display = 'flex';
        document.getElementById('waiting-message').classList.add('hidden');
        document.getElementById('room-code').textContent = this.multiplayer.roomCode;

        if (this.gameStarted) {
            this.showScreen('game');
            if (gameState && gameState.phase === 'results') {
                document.getElementById('host-showdown-controls').classList.remove('hidden');
                document.getElementById('waiting-next').classList.add('hidden');
            }
            this.multiplayer.broadcastGameState(this.game.getGameState());
        }

        this.addSystemMessage('You are now the host!');
    }

    convertGameStateToInternal(state) {
        return {
            players: (state.players || []).map(p => ({
                id: p.id,
                pnl: p.actualPnl ?? p.pnl ?? 0,
                startingPnl: p.pnl ?? 0,
                holeCards: p.holeCards || [],
                totalBet: p.totalBet ?? state.baseBet ?? 1,
                hasConfirmed: p.hasConfirmed || false,
                pendingDiscards: []
            })),
            queuedPlayers: state.queuedPlayers || [],
            deck: [],
            discardPile: [],
            dealerCards: state.dealerCards || [],
            dealerBestHand: state.dealerBestHand || null,
            phase: state.phase || 'waiting',
            baseBet: state.baseBet || 1,
            drawCount: state.drawCount || 1,
            currentDrawRound: state.currentDrawRound || 1,
            lastResults: state.results || null,
            lastResolutionType: state.resolutionType || null
        };
    }

    // ============ RULES / TOAST / UTILS ============

    showRules() {
        document.getElementById('rules-modal').classList.remove('hidden');
    }

    hideRules() {
        document.getElementById('rules-modal').classList.add('hidden');
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.gameController = new EdgeTheDealerController();
});
