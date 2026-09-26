/**
 * Ultimate Omaha - Game Logic
 * Manages game state, dealing, betting rounds, and showdown
 * 
 * Payout rules (pairwise between players):
 * - If one player qualifies and another doesn't: Winner gets their bet * multiplier from the loser
 * - If both qualify or both don't qualify: Push (no exchange)
 * - PnL only updates at showdown, not during the hand
 */

class UltimateOmahaGame {
    constructor() {
        this.reset();
    }

    reset() {
        this.players = [];
        this.queuedPlayers = []; // Players waiting to join next hand
        this.deck = [];
        this.board1 = [];
        this.board2 = [];
        this.phase = 'waiting'; // waiting, preflop, flop, results
        this.baseBet = 1.00;
        this.actedThisRound = new Set();
        this.lastResults = null;
    }

    /**
     * Initialize a new game with players
     */
    initGame(playerIds, baseBet) {
        this.baseBet = baseBet;
        this.players = playerIds.map(id => ({
            id,
            pnl: 0, // All players start at 0 PnL
            startingPnl: 0, // PnL at start of hand (for display)
            holeCards: [],
            currentBet: 0,
            totalBet: 0,
            hasActed: false
        }));
        this.queuedPlayers = [];
    }

    /**
     * Add a player to the queue (for mid-game joins)
     */
    queuePlayer(playerId) {
        if (!this.queuedPlayers.includes(playerId) &&
            !this.players.find(p => p.id === playerId)) {
            this.queuedPlayers.push(playerId);
            return true;
        }
        return false;
    }

    /**
     * Add queued players to the game (called at start of new hand)
     */
    addQueuedPlayers() {
        for (const playerId of this.queuedPlayers) {
            this.players.push({
                id: playerId,
                pnl: 0, // Start at 0 PnL
                startingPnl: 0,
                holeCards: [],
                currentBet: 0,
                totalBet: 0,
                hasActed: false
            });
        }
        this.queuedPlayers = [];
    }

    /**
     * Set the base bet amount
     */
    setBaseBet(amount) {
        this.baseBet = parseFloat(amount) || 1.00;
    }

    /**
     * Start a new hand
     */
    startHand() {
        // Add any queued players first
        this.addQueuedPlayers();

        // Reset player states - save current PnL as starting PnL for display
        for (const player of this.players) {
            player.startingPnl = player.pnl; // Save for display during hand
            player.holeCards = [];
            player.currentBet = this.baseBet; // Track bet but don't deduct yet
            player.totalBet = this.baseBet;
            player.hasActed = false;
        }

        // Shuffle and create new deck
        this.deck = Poker.shuffleDeck(Poker.createDeck());
        this.board1 = [];
        this.board2 = [];
        this.actedThisRound = new Set();
        this.lastResults = null;

        // Deal hole cards
        for (const player of this.players) {
            player.holeCards = this.deck.splice(0, 4);
        }

        // Deal board cards (face down initially)
        this.board1 = this.deck.splice(0, 5);
        this.board2 = this.deck.splice(0, 5);

        this.phase = 'preflop';

        return this.getGameState();
    }

    /**
     * Get all active players
     */
    getActivePlayers() {
        return this.players;
    }

    /**
     * Process a player action (check or double)
     * All players act in parallel - no turns
     * Note: Chips are NOT deducted here, only tracked
     */
    processAction(playerId, action) {
        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { success: false, error: 'Invalid player' };
        }

        if (player.hasActed) {
            return { success: false, error: 'You have already acted this round' };
        }

        switch (action) {
            case 'check':
                player.hasActed = true;
                this.actedThisRound.add(playerId);
                break;

            case 'double':
                // Track the doubled bet (PnL only updated at showdown)
                const doubleAmount = player.currentBet;
                player.currentBet *= 2;
                player.totalBet += doubleAmount;
                player.hasActed = true;
                this.actedThisRound.add(playerId);
                break;

            default:
                return { success: false, error: 'Invalid action' };
        }

        // Check if ALL players have acted
        const allActed = this.players.every(p => this.actedThisRound.has(p.id));

        if (allActed) {
            this.advancePhase();
        }

        return { success: true, gameState: this.getGameState() };
    }

    /**
     * Advance to the next phase
     */
    advancePhase() {
        this.actedThisRound = new Set();

        for (const player of this.players) {
            player.hasActed = false;
        }

        switch (this.phase) {
            case 'preflop':
                this.phase = 'flop';
                break;

            case 'flop':
                this.phase = 'results';
                this.resolveShowdown();
                break;
        }
    }

    /**
     * Resolve the showdown - evaluate hands and calculate payouts
     * 
     * Payout Rules:
     * 1. If you WIN (qualify): You receive (bet × multiplier) from EACH other player
     * 2. If you LOSE (foul): You pay (bet) to EACH other player
     * 
     * Both rules apply independently! Between any two players, multiple transactions can occur.
     */
    resolveShowdown() {
        // Step 1: Evaluate each player's hands and determine qualification
        const results = this.players.map(player => {
            const hand1 = Poker.evaluateOmahaHand(player.holeCards, this.board1);
            const hand2 = Poker.evaluateOmahaHand(player.holeCards, this.board2);

            const qualifies1 = Poker.doesHandQualify(hand1);
            const qualifies2 = Poker.doesHandQualify(hand2);
            const qualifies = qualifies1 && qualifies2;

            const totalMultiplier = qualifies
                ? Poker.calculateTotalMultiplier(hand1, hand2)
                : 0;

            return {
                playerId: player.id,
                holeCards: [...player.holeCards],
                hand1: {
                    name: hand1.name,
                    rank: hand1.rank,
                    qualifies: qualifies1,
                    multiplier: Poker.getMultiplier(hand1)
                },
                hand2: {
                    name: hand2.name,
                    rank: hand2.rank,
                    qualifies: qualifies2,
                    multiplier: Poker.getMultiplier(hand2)
                },
                qualifies,
                totalMultiplier,
                totalBet: player.totalBet,
                netResult: 0
            };
        });

        // Step 2: Calculate payouts
        if (results.length === 1) {
            // Single player mode: play against the bank
            const player = results[0];
            if (player.qualifies) {
                // Win: receive bet × multiplier from the bank
                player.netResult = player.totalBet * player.totalMultiplier;
            } else {
                // Foul: lose bet to the bank
                player.netResult = -player.totalBet;
            }
        } else {
            // Multiplayer: pairwise transactions between all players
            for (let i = 0; i < results.length; i++) {
                for (let j = i + 1; j < results.length; j++) {
                    const pi = results[i];
                    const pj = results[j];

                    // Money flowing from j to i (positive = i receives from j)
                    let flowToI = 0;

                    // If i qualifies, i receives i's bet × i's multiplier from j
                    if (pi.qualifies) {
                        flowToI += pi.totalBet * pi.totalMultiplier;
                    }

                    // If i fouls, i pays i's bet to j (negative flow to i)
                    if (!pi.qualifies) {
                        flowToI -= pi.totalBet;
                    }

                    // If j qualifies, j receives j's bet × j's multiplier from i (negative flow to i)
                    if (pj.qualifies) {
                        flowToI -= pj.totalBet * pj.totalMultiplier;
                    }

                    // If j fouls, j pays j's bet to i (positive flow to i)
                    if (!pj.qualifies) {
                        flowToI += pj.totalBet;
                    }

                    // Apply the net flow
                    pi.netResult += flowToI;
                    pj.netResult -= flowToI;
                }
            }
        }

        // Step 3: Apply net results to player PnL
        for (const result of results) {
            const player = this.players.find(p => p.id === result.playerId);
            if (player) {
                player.pnl += result.netResult;
            }
        }

        // Debug: Log results
        console.log('Showdown results:', results.map(r => ({
            id: r.playerId,
            qualifies: r.qualifies,
            multiplier: r.totalMultiplier,
            bet: r.totalBet,
            net: r.netResult
        })));

        // Verification: Total should sum to 0 in multiplayer (not in single player vs bank)
        if (results.length > 1) {
            const totalNet = results.reduce((sum, r) => sum + r.netResult, 0);
            if (Math.abs(totalNet) > 0.001) {
                console.error('Payout error: Total net result is not zero:', totalNet);
            }
        }

        this.lastResults = results;
        return results;
    }

    /**
     * Get current game state (for broadcasting)
     */
    getGameState() {
        return {
            phase: this.phase,
            baseBet: this.baseBet,
            players: this.players.map(p => ({
                id: p.id,
                pnl: p.startingPnl, // Show starting PnL during hand
                actualPnl: p.pnl, // Actual PnL (for results)
                currentBet: p.currentBet,
                totalBet: p.totalBet,
                hasActed: p.hasActed,
                holeCards: p.holeCards
            })),
            queuedPlayers: this.queuedPlayers,
            board1: this.getBoardState(1),
            board2: this.getBoardState(2),
            totalPot: this.getTotalPot(),
            results: this.lastResults
        };
    }

    /**
     * Get board state based on current phase
     */
    getBoardState(boardNum) {
        const board = boardNum === 1 ? this.board1 : this.board2;

        switch (this.phase) {
            case 'preflop':
                return board.map(() => ({ faceDown: true }));

            case 'flop':
                return board.map((card, i) =>
                    i < 3 ? card : { faceDown: true }
                );

            case 'results':
                return board;

            default:
                return board.map(() => ({ faceDown: true }));
        }
    }

    /**
     * Get total pot
     */
    getTotalPot() {
        return this.players.reduce((sum, p) => sum + p.totalBet, 0);
    }

    /**
     * Remove a player from the game
     */
    removePlayer(playerId) {
        const index = this.players.findIndex(p => p.id === playerId);
        if (index !== -1) {
            this.players.splice(index, 1);
        }
        // Also remove from queue if there
        const qIndex = this.queuedPlayers.indexOf(playerId);
        if (qIndex !== -1) {
            this.queuedPlayers.splice(qIndex, 1);
        }
    }

    /**
     * Get serializable state for sync
     */
    serialize() {
        return {
            players: this.players,
            queuedPlayers: this.queuedPlayers,
            deck: this.deck,
            board1: this.board1,
            board2: this.board2,
            phase: this.phase,
            baseBet: this.baseBet,
            actedThisRound: Array.from(this.actedThisRound),
            lastResults: this.lastResults
        };
    }

    /**
     * Load state from serialized data
     */
    deserialize(data) {
        this.players = data.players;
        this.queuedPlayers = data.queuedPlayers || [];
        this.deck = data.deck;
        this.board1 = data.board1;
        this.board2 = data.board2;
        this.phase = data.phase;
        this.baseBet = data.baseBet;
        this.actedThisRound = new Set(data.actedThisRound);
        this.lastResults = data.lastResults;
    }
}

// Export
window.UltimateOmahaGame = UltimateOmahaGame;
