/**
 * Edge the Dealer - Game Logic
 *
 * Rules:
 * - Players are dealt 5 cards.
 * - Dealer is dealt 7 open cards and uses best 5-card hand.
 * - Each draw round, players can discard 0-5 cards and must confirm.
 * - All draws execute simultaneously after every player confirms.
 * - If anyone beats dealer, winner is the lowest hand among those that beat dealer.
 * - If nobody beats dealer, highest hand wins.
 */

class EdgeTheDealerGame {
    constructor() {
        this.maxPlayers = 9; // 9 players + 7 dealer cards = 52 total cards
        this.reset();
    }

    reset() {
        this.players = [];
        this.queuedPlayers = [];
        this.deck = [];
        this.discardPile = [];
        this.dealerCards = [];
        this.dealerBestHand = null;
        this.phase = 'waiting'; // waiting, draw, results
        this.baseBet = 1.0;
        this.drawCount = 1;
        this.currentDrawRound = 0;
        this.lastResults = null;
        this.lastResolutionType = null;
    }

    roundMoney(amount) {
        return Math.round((amount + Number.EPSILON) * 100) / 100;
    }

    initGame(playerIds, baseBet, drawCount = 1) {
        if (playerIds.length > this.maxPlayers) {
            throw new Error(`Edge the Dealer supports at most ${this.maxPlayers} active players`);
        }

        this.baseBet = this.roundMoney(parseFloat(baseBet) || 1.0);
        this.drawCount = Math.min(4, Math.max(1, parseInt(drawCount, 10) || 1));
        this.players = playerIds.map(id => ({
            id,
            pnl: 0,
            startingPnl: 0,
            holeCards: [],
            totalBet: this.baseBet,
            hasConfirmed: false,
            pendingDiscards: []
        }));
        this.queuedPlayers = [];
    }

    queuePlayer(playerId) {
        if (this.players.some(p => p.id === playerId) || this.queuedPlayers.includes(playerId)) {
            return false;
        }
        this.queuedPlayers.push(playerId);
        return true;
    }

    addQueuedPlayers() {
        const stillQueued = [];
        for (const playerId of this.queuedPlayers) {
            if (this.players.length < this.maxPlayers) {
                this.players.push({
                    id: playerId,
                    pnl: 0,
                    startingPnl: 0,
                    holeCards: [],
                    totalBet: this.baseBet,
                    hasConfirmed: false,
                    pendingDiscards: []
                });
            } else {
                stillQueued.push(playerId);
            }
        }
        this.queuedPlayers = stillQueued;
    }

    setBaseBet(amount) {
        this.baseBet = this.roundMoney(parseFloat(amount) || 1.0);
    }

    setDrawCount(drawCount) {
        this.drawCount = Math.min(4, Math.max(1, parseInt(drawCount, 10) || 1));
    }

    drawOneCard() {
        if (this.deck.length === 0) {
            this.refillDeckFromDiscards();
        }
        if (this.deck.length === 0) {
            throw new Error('No cards available to draw');
        }
        return this.deck.shift();
    }

    drawCards(count) {
        const cards = [];
        for (let i = 0; i < count; i++) {
            cards.push(this.drawOneCard());
        }
        return cards;
    }

    refillDeckFromDiscards() {
        if (this.discardPile.length === 0) {
            return false;
        }
        this.deck = Poker.shuffleDeck([...this.discardPile]);
        this.discardPile = [];
        return true;
    }

    normalizeDiscardIndices(indices) {
        if (!Array.isArray(indices)) return [];
        const unique = new Set();
        for (const idx of indices) {
            const parsed = parseInt(idx, 10);
            if (!Number.isInteger(parsed) || parsed < 0 || parsed > 4) {
                continue;
            }
            unique.add(parsed);
        }
        return Array.from(unique).sort((a, b) => a - b);
    }

    startHand() {
        this.addQueuedPlayers();

        if (this.players.length === 0) {
            throw new Error('At least one player is required');
        }

        if (this.players.length > this.maxPlayers) {
            throw new Error(`Too many active players for a single deck (${this.maxPlayers} max)`);
        }

        this.deck = Poker.shuffleDeck(Poker.createDeck());
        this.discardPile = [];
        this.dealerCards = [];
        this.dealerBestHand = null;
        this.lastResults = null;
        this.lastResolutionType = null;

        for (const player of this.players) {
            player.startingPnl = player.pnl;
            player.holeCards = [];
            player.totalBet = this.baseBet;
            player.hasConfirmed = false;
            player.pendingDiscards = [];
        }

        // Deal all player cards first, then dealer cards.
        for (const player of this.players) {
            player.holeCards = this.drawCards(5);
        }
        this.dealerCards = this.drawCards(7);
        this.dealerBestHand = this.evaluateBestFiveFromCards(this.dealerCards);

        this.phase = 'draw';
        this.currentDrawRound = 1;

        return this.getGameState();
    }

    getActivePlayers() {
        return this.players;
    }

    submitDiscards(playerId, discardIndices) {
        if (this.phase !== 'draw') {
            return { success: false, error: 'Discarding is only allowed during draw rounds' };
        }

        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { success: false, error: 'Invalid player' };
        }

        if (player.hasConfirmed) {
            return { success: false, error: 'You already confirmed this draw round' };
        }

        const normalized = this.normalizeDiscardIndices(discardIndices);
        if (normalized.length > 5) {
            return { success: false, error: 'You can discard at most 5 cards' };
        }

        player.pendingDiscards = normalized;
        return { success: true, gameState: this.getGameState() };
    }

    confirmDiscards(playerId, discardIndices = null) {
        if (this.phase !== 'draw') {
            return { success: false, error: 'Cannot confirm outside draw rounds' };
        }

        const player = this.players.find(p => p.id === playerId);
        if (!player) {
            return { success: false, error: 'Invalid player' };
        }

        if (player.hasConfirmed) {
            return { success: false, error: 'You already confirmed this draw round' };
        }

        if (discardIndices !== null) {
            const submit = this.submitDiscards(playerId, discardIndices);
            if (!submit.success) return submit;
        }

        player.hasConfirmed = true;

        const allConfirmed = this.players.every(p => p.hasConfirmed);
        if (allConfirmed) {
            try {
                this.executeDrawRound();
            } catch (err) {
                return { success: false, error: err.message || 'Draw round failed' };
            }
        }

        return { success: true, gameState: this.getGameState() };
    }

    executeDrawRound() {
        // Collect all discards first so they are available if deck needs refill.
        const replacementPlans = [];
        for (const player of this.players) {
            const slots = [...player.pendingDiscards].sort((a, b) => a - b);
            replacementPlans.push({ player, slots });
            for (const slot of slots) {
                const oldCard = player.holeCards[slot];
                if (oldCard) {
                    this.discardPile.push(oldCard);
                }
                player.holeCards[slot] = null;
            }
        }

        // Draw replacements after all discards are in the pile.
        for (const plan of replacementPlans) {
            for (const slot of plan.slots) {
                plan.player.holeCards[slot] = this.drawOneCard();
            }
        }

        if (this.currentDrawRound < this.drawCount) {
            this.currentDrawRound += 1;
            for (const player of this.players) {
                player.hasConfirmed = false;
                player.pendingDiscards = [];
            }
            this.phase = 'draw';
        } else {
            this.phase = 'results';
            this.resolveShowdown();
        }
    }

    evaluateBestFiveFromCards(cards) {
        if (!Array.isArray(cards) || cards.length < 5) return null;

        const allFiveCardCombos = Poker.combinations(cards, 5);
        let best = null;
        for (const combo of allFiveCardCombos) {
            const hand = Poker.evaluate5CardHand(combo);
            if (!best || Poker.compareHands(hand, best) > 0) {
                best = hand;
            }
        }
        return best;
    }

    evaluatePlayerHand(playerCards) {
        if (!Array.isArray(playerCards) || playerCards.length !== 5) return null;
        return Poker.evaluate5CardHand(playerCards);
    }

    pickLowestHand(hands) {
        if (!hands.length) return null;
        let lowest = hands[0];
        for (let i = 1; i < hands.length; i++) {
            if (Poker.compareHands(hands[i].hand, lowest.hand) < 0) {
                lowest = hands[i];
            }
        }
        return lowest;
    }

    pickHighestHand(hands) {
        if (!hands.length) return null;
        let highest = hands[0];
        for (let i = 1; i < hands.length; i++) {
            if (Poker.compareHands(hands[i].hand, highest.hand) > 0) {
                highest = hands[i];
            }
        }
        return highest;
    }

    resolveShowdown() {
        const dealerHand = this.dealerBestHand || this.evaluateBestFiveFromCards(this.dealerCards);
        this.dealerBestHand = dealerHand;

        const handSummaries = this.players.map(player => {
            const hand = this.evaluatePlayerHand(player.holeCards);
            const beatsDealer = Poker.compareHands(hand, dealerHand) > 0;
            return {
                playerId: player.id,
                hand,
                beatsDealer,
                totalBet: player.totalBet
            };
        });

        const beatingPlayers = handSummaries.filter(h => h.beatsDealer);
        let winningReference = null;
        let winningPlayerIds = [];

        if (beatingPlayers.length > 0) {
            winningReference = this.pickLowestHand(beatingPlayers);
            winningPlayerIds = beatingPlayers
                .filter(h => Poker.compareHands(h.hand, winningReference.hand) === 0)
                .map(h => h.playerId);
            this.lastResolutionType = 'lowest_beating_dealer';
        } else {
            winningReference = this.pickHighestHand(handSummaries);
            winningPlayerIds = handSummaries
                .filter(h => Poker.compareHands(h.hand, winningReference.hand) === 0)
                .map(h => h.playerId);
            this.lastResolutionType = 'highest_when_no_one_beats_dealer';
        }

        const totalPot = this.players.reduce((sum, p) => sum + p.totalBet, 0);
        const winnerCount = Math.max(winningPlayerIds.length, 1);

        const results = handSummaries.map(summary => {
            const player = this.players.find(p => p.id === summary.playerId);
            const isWinner = winningPlayerIds.includes(summary.playerId);

            let netResult = 0;
            if (this.players.length === 1) {
                // Single player mode uses dealer as bank.
                netResult = summary.beatsDealer ? summary.totalBet : -summary.totalBet;
            } else {
                const winningShare = isWinner ? totalPot / winnerCount : 0;
                netResult = winningShare - summary.totalBet;
            }

            netResult = this.roundMoney(netResult);
            player.pnl = this.roundMoney(player.pnl + netResult);

            return {
                playerId: summary.playerId,
                holeCards: [...player.holeCards],
                hand: {
                    name: summary.hand.name,
                    rank: summary.hand.rank,
                    value: [...summary.hand.value]
                },
                beatsDealer: summary.beatsDealer,
                isWinner,
                totalBet: summary.totalBet,
                netResult
            };
        });

        this.lastResults = results;
        return results;
    }

    getGameState() {
        return {
            phase: this.phase,
            baseBet: this.baseBet,
            drawCount: this.drawCount,
            currentDrawRound: this.currentDrawRound,
            players: this.players.map(p => ({
                id: p.id,
                pnl: p.startingPnl,
                actualPnl: p.pnl,
                totalBet: p.totalBet,
                hasConfirmed: p.hasConfirmed,
                discardCount: p.pendingDiscards.length,
                holeCards: p.holeCards
            })),
            queuedPlayers: [...this.queuedPlayers],
            dealerCards: [...this.dealerCards],
            dealerBestHand: this.phase === 'results' && this.dealerBestHand
                ? {
                    name: this.dealerBestHand.name,
                    rank: this.dealerBestHand.rank,
                    value: [...this.dealerBestHand.value],
                    cards: [...this.dealerBestHand.cards]
                }
                : null,
            deckCount: this.deck.length,
            discardCount: this.discardPile.length,
            results: this.lastResults,
            resolutionType: this.lastResolutionType
        };
    }

    removePlayer(playerId) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            this.players.splice(playerIndex, 1);
        }

        const queuedIndex = this.queuedPlayers.indexOf(playerId);
        if (queuedIndex !== -1) {
            this.queuedPlayers.splice(queuedIndex, 1);
        }
    }

    serialize() {
        return {
            players: this.players,
            queuedPlayers: this.queuedPlayers,
            deck: this.deck,
            discardPile: this.discardPile,
            dealerCards: this.dealerCards,
            dealerBestHand: this.dealerBestHand,
            phase: this.phase,
            baseBet: this.baseBet,
            drawCount: this.drawCount,
            currentDrawRound: this.currentDrawRound,
            lastResults: this.lastResults,
            lastResolutionType: this.lastResolutionType
        };
    }

    deserialize(data) {
        this.players = data.players || [];
        this.queuedPlayers = data.queuedPlayers || [];
        this.deck = data.deck || [];
        this.discardPile = data.discardPile || [];
        this.dealerCards = data.dealerCards || [];
        this.dealerBestHand = data.dealerBestHand || null;
        this.phase = data.phase || 'waiting';
        this.baseBet = data.baseBet || 1.0;
        this.drawCount = data.drawCount || 1;
        this.currentDrawRound = data.currentDrawRound || 0;
        this.lastResults = data.lastResults || null;
        this.lastResolutionType = data.lastResolutionType || null;
    }
}

window.EdgeTheDealerGame = EdgeTheDealerGame;
