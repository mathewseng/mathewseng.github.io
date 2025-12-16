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

        this.setupEventListeners();
        this.setupMultiplayerCallbacks();
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
        // Menu screen
        document.getElementById('create-room-btn').addEventListener('click', () => this.createRoom());
        document.getElementById('join-room-btn').addEventListener('click', () => this.joinRoom());
        document.getElementById('room-code-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinRoom();
        });

        // Lobby screen
        document.getElementById('copy-code-btn').addEventListener('click', () => this.copyRoomCode());
        document.getElementById('start-game-btn').addEventListener('click', () => this.startGame());
        document.getElementById('leave-lobby-btn').addEventListener('click', () => this.leaveLobby());

        // Game screen
        document.getElementById('check-btn').addEventListener('click', () => this.sendAction('check'));
        document.getElementById('double-btn').addEventListener('click', () => this.sendAction('double'));
        document.getElementById('rules-btn').addEventListener('click', () => this.showRules());
        document.getElementById('close-rules').addEventListener('click', () => this.hideRules());
        document.getElementById('next-hand-btn').addEventListener('click', () => this.startNextHand());

        // Close modal on outside click
        document.getElementById('rules-modal').addEventListener('click', (e) => {
            if (e.target.id === 'rules-modal') this.hideRules();
        });
    }

    setupMultiplayerCallbacks() {
        this.multiplayer.onPlayerJoin = (players) => {
            this.updateLobbyPlayers(players);
            
            // If game already started and this is host, check for new players to queue
            if (this.gameStarted && this.multiplayer.isHost) {
                // New players get queued automatically by host
            }
        };

        this.multiplayer.onPlayerLeave = (playerId) => {
            this.showToast(`A player has left`, 'info');
            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());

            if (this.currentScreen === 'game') {
                this.game.removePlayer(playerId);
            }
        };

        this.multiplayer.onGameStateUpdate = (state) => {
            this.updateGameUI(state);
        };

        this.multiplayer.onConnected = (data) => {
            this.showToast('Connected to room!', 'success');
            
            // If game is in progress, show game screen and notify player they're queued
            if (data.gameInProgress) {
                this.gameStarted = true;
                this.showToast('Game in progress - you\'ll join next hand', 'info');
                this.showScreen('game');
            }
        };

        this.multiplayer.onError = (message) => {
            this.showToast(message, 'error');
        };

        this.multiplayer.onMessage = (fromPeerId, data) => {
            this.handleGameMessage(fromPeerId, data);
        };
    }

    // ============ SCREEN MANAGEMENT ============

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`${screenId}-screen`).classList.add('active');
        this.currentScreen = screenId;
    }

    // ============ LOADING STATES ============

    setButtonLoading(btn, loading) {
        if (loading) {
            btn.classList.add('loading');
            btn.disabled = true;
        } else {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
    }

    // ============ MENU ACTIONS ============

    async createRoom() {
        const name = document.getElementById('player-name').value.trim() || 'Host';
        this.multiplayer.myName = name;

        const createBtn = document.getElementById('create-room-btn');
        const joinBtn = document.getElementById('join-room-btn');
        
        this.setButtonLoading(createBtn, true);
        joinBtn.disabled = true;

        try {
            const result = await this.multiplayer.initPeer(true);
            this.myPlayerId = result.peerId;

            document.getElementById('room-code').textContent = this.multiplayer.roomCode;
            document.getElementById('start-game-btn').classList.remove('hidden');
            document.getElementById('host-controls').style.display = 'flex';
            document.getElementById('waiting-message').classList.add('hidden');

            this.updateLobbyPlayers(this.multiplayer.getAllPlayers());
            this.showScreen('lobby');
            this.showToast(`Room created: ${this.multiplayer.roomCode}`, 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            this.setButtonLoading(createBtn, false);
            joinBtn.disabled = false;
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

        const joinBtn = document.getElementById('join-room-btn');
        const createBtn = document.getElementById('create-room-btn');
        
        this.setButtonLoading(joinBtn, true);
        createBtn.disabled = true;

        try {
            await this.multiplayer.initPeer(false, roomCode);
            this.myPlayerId = this.multiplayer.myId;

            await this.multiplayer.connectToRoom();

            document.getElementById('room-code').textContent = roomCode;
            document.getElementById('start-game-btn').classList.add('hidden');
            document.getElementById('host-controls').style.display = 'none';
            document.getElementById('waiting-message').classList.remove('hidden');

            this.showScreen('lobby');
        } catch (err) {
            this.showToast(err.message, 'error');
        } finally {
            this.setButtonLoading(joinBtn, false);
            createBtn.disabled = false;
        }
    }

    // ============ LOBBY ACTIONS ============

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

        document.getElementById('player-count').textContent = `(${players.length}/10)`;

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

    // ============ GAME ACTIONS ============

    startGame() {
        if (!this.multiplayer.isHost) return;

        const baseBet = parseFloat(document.getElementById('base-bet').value) || 1.00;

        const playerIds = Array.from(this.multiplayer.players.keys());

        this.game.initGame(playerIds, baseBet);
        this.game.startHand();
        this.gameStarted = true;
        this.multiplayer.setGameInProgress(true);

        this.multiplayer.broadcast({ type: 'start_game' });
        this.multiplayer.broadcastGameState(this.game.getGameState());

        this.showScreen('game');
    }

    handleGameMessage(fromPeerId, data) {
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
        this.multiplayer.broadcastGameState(this.game.getGameState());
    }

    // ============ UI UPDATES ============

    updateGameUI(state) {
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
            document.getElementById('my-pnl').textContent = this.formatCurrency(displayPnl);
            document.getElementById('my-pnl').style.color = displayPnl >= 0 ? 'var(--gold-light)' : 'var(--danger)';
            document.getElementById('current-bet').textContent = this.formatCurrency(myPlayer.totalBet);
        }

        // Update other players - pass results for showdown
        this.updatePlayersArea(state.players, state.phase, state.results);

        // Update action buttons
        this.updateActionButtons(state, myPlayer);

        // Handle board results at showdown
        if (state.phase === 'results' && state.results) {
            this.updateBoardResults(state, myPlayer);
        } else {
            document.getElementById('board-1-result').textContent = '';
            document.getElementById('board-2-result').textContent = '';
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

    updateBoard(boardId, cards) {
        const board = document.getElementById(boardId);
        const slots = board.querySelectorAll('.card-slot');

        cards.forEach((card, i) => {
            const slot = slots[i];
            slot.innerHTML = '';

            if (card.faceDown) {
                slot.classList.remove('dealt');
                const cardEl = document.createElement('div');
                cardEl.className = 'card face-down';
                slot.appendChild(cardEl);
                slot.classList.add('dealt');
            } else {
                const formatted = Poker.formatCard(card);
                const cardEl = this.createCardElement(formatted);
                slot.appendChild(cardEl);
                slot.classList.add('dealt');
            }
        });
    }

    updateHoleCards(cards) {
        const container = document.getElementById('hole-cards');
        const slots = container.querySelectorAll('.card-slot');

        cards.forEach((card, i) => {
            const slot = slots[i];
            slot.innerHTML = '';

            if (card.faceDown) {
                const cardEl = document.createElement('div');
                cardEl.className = 'card face-down';
                slot.appendChild(cardEl);
            } else {
                const formatted = Poker.formatCard(card);
                const cardEl = this.createCardElement(formatted);
                slot.appendChild(cardEl);
            }
            slot.classList.add('dealt');
        });
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

    createMiniCardElement(formattedCard) {
        const card = document.createElement('div');
        card.className = `mini-card ${formattedCard.isRed ? 'red' : 'black'}`;
        card.innerHTML = `
            <span class="rank">${formattedCard.rank}</span>
            <span class="suit">${formattedCard.suit}</span>
        `;
        return card;
    }

    updatePlayersArea(players, phase, results = null) {
        const container = document.getElementById('players-area');
        container.innerHTML = '';

        players.forEach((player, index) => {
            const playerInfo = this.multiplayer.getPlayer(player.id);
            const isMe = player.id === this.myPlayerId;

            const div = document.createElement('div');
            div.className = `player-box ${player.hasActed ? 'acted' : ''} ${phase === 'results' ? 'showdown' : ''}`;

            const name = playerInfo ? playerInfo.name : (isMe ? 'You' : `Player ${index + 1}`);

            // Show starting PnL during hand, actual PnL at results
            const displayPnl = phase === 'results' ? player.actualPnl : player.pnl;

            // Get result for this player at showdown
            let resultHtml = '';
            if (phase === 'results' && results) {
                const playerResult = results.find(r => r.playerId === player.id);
                if (playerResult) {
                    // Show hole cards
                    let cardsHtml = '<div class="player-cards">';
                    if (playerResult.holeCards) {
                        playerResult.holeCards.forEach(card => {
                            const formatted = Poker.formatCard(card);
                            cardsHtml += `<div class="mini-card ${formatted.isRed ? 'red' : 'black'}">
                                <span class="rank">${formatted.rank}</span>
                                <span class="suit">${formatted.suit}</span>
                            </div>`;
                        });
                    }
                    cardsHtml += '</div>';

                    // Show hands on each board
                    const hand1Class = playerResult.hand1.qualifies ? 'qualified' : 'fouled';
                    const hand2Class = playerResult.hand2.qualifies ? 'qualified' : 'fouled';
                    
                    const handsHtml = `
                        <div class="player-hands">
                            <div class="hand-result ${hand1Class}">${playerResult.hand1.name} ${playerResult.qualifies ? `(${playerResult.hand1.multiplier}×)` : ''}</div>
                            <div class="hand-result ${hand2Class}">${playerResult.hand2.name} ${playerResult.qualifies ? `(${playerResult.hand2.multiplier}×)` : ''}</div>
                        </div>
                    `;

                    // Show payout
                    const payoutClass = playerResult.netResult >= 0 ? 'win' : 'lose';
                    const payoutText = playerResult.qualifies 
                        ? `${playerResult.totalMultiplier}× → ${this.formatCurrency(playerResult.netResult, true)}`
                        : `FOUL → ${this.formatCurrency(playerResult.netResult, true)}`;
                    
                    resultHtml = `
                        ${cardsHtml}
                        ${handsHtml}
                        <div class="payout ${payoutClass}">${payoutText}</div>
                    `;
                }
            }

            div.innerHTML = `
                <div class="name">${this.escapeHtml(name)}${isMe ? ' (You)' : ''}</div>
                <div class="pnl" style="color: ${displayPnl >= 0 ? 'var(--gold-light)' : 'var(--danger)'}">PnL: ${this.formatCurrency(displayPnl)}</div>
                <div class="bet-amount">Bet: ${this.formatCurrency(player.totalBet)}</div>
                ${phase !== 'results' ? `<div class="status ${player.hasActed ? '' : 'waiting'}">${player.hasActed ? '✓' : '...'}</div>` : ''}
                ${resultHtml}
            `;

            container.appendChild(div);
        });
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
                
                // Set the next bet input to current bet
                const nextBetInput = document.getElementById('next-bet');
                if (nextBetInput && nextBetInput.value === '1.00') {
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

        result1.textContent = `Your ${hand1.name} (${Poker.getMultiplier(hand1)}×) ${qualifies1 ? '✓' : '✗'}`;
        result1.className = `board-result ${qualifies1 ? 'qualified' : 'fouled'}`;

        result2.textContent = `Your ${hand2.name} (${Poker.getMultiplier(hand2)}×) ${qualifies2 ? '✓' : '✗'}`;
        result2.className = `board-result ${qualifies2 ? 'qualified' : 'fouled'}`;
    }

    // ============ RULES MODAL ============

    showRules() {
        document.getElementById('rules-modal').classList.remove('hidden');
    }

    hideRules() {
        document.getElementById('rules-modal').classList.add('hidden');
    }

    // ============ UTILITIES ============

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

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.gameController = new GameController();
});
