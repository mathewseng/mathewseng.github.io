# Edge the Dealer - Product Requirements Document (PRD)

## 1. Overview

Edge the Dealer is a multiplayer 5-card draw poker variant played with 1-9 players over peer-to-peer WebRTC connections (PeerJS). Players compete against a shared dealer hand and each other, with a unique twist: if anyone beats the dealer, the **lowest** hand among those that beat the dealer wins. If nobody beats the dealer, the **highest** player hand wins. The game features configurable multi-draw rounds (1-4), simultaneous play, and a pot-based payout system.

---

## 2. Core Game Rules

### 2.1 Basic Setup
- **Players**: 1-9 players (9 × 5 cards + 7 dealer cards = 52 total)
- **Cards**: Standard 52-card deck
- **Player Cards**: Each player receives 5 cards (private)
- **Dealer Cards**: 7 cards dealt face-up (visible to all players)
- **Dealer Hand**: Best 5-card poker hand from the 7 dealer cards (auto-evaluated)
- **Ante**: All players bet equally (configurable base bet, default $1.00)

### 2.2 Betting Structure
- **Base Bet**: Configurable by host (default $1.00, supports 2 decimal places)
- **All players bet equally** - flat ante, no raises or additional betting streets
- **No folding** - all players must play every hand they are dealt into

### 2.3 Game Phases

| Phase | State | Player Action |
|-------|-------|---------------|
| **Deal** | 5 cards to each player, 7 to dealer | View cards, see dealer's 7 cards |
| **Draw Round 1** | First draw round | Select 0-5 cards to discard, then confirm |
| **Draw Round 2-4** | Additional draw rounds (if configured) | Select 0-5 cards to discard, then confirm |
| **Showdown** | All draws complete | Results displayed, PnL calculated |

### 2.4 Draw Rounds
- Host configures the number of draw rounds: **Single** (1), **Double** (2), **Triple** (3), or **Quadruple** (4).
- In each draw round:
  1. Each player selects 0-5 cards to discard.
  2. Each player confirms their selection.
  3. Once **all** players confirm, discards and replacements execute simultaneously.
  4. If the deck runs out of cards, all previously discarded cards are reshuffled into the deck.
- After all draw rounds complete, the game proceeds to showdown.

### 2.5 Winning Conditions

All players are ranked by **standard high poker hand strength**.

**If one or more players beat the dealer:**
> The winner is the **lowest** hand among those that beat the dealer.
> This is the core "edge" mechanic — you want to *just barely* beat the dealer, not crush them.

**If nobody beats the dealer:**
> The winner is the **highest** player hand.

**Ties:**
> If multiple players have the same winning hand strength, the pot is split equally among them.

### 2.6 Hand Rankings (High to Low)

| Rank | Hand | Example |
|------|------|---------|
| 10 | Royal Flush | A♠ K♠ Q♠ J♠ T♠ |
| 9 | Straight Flush | 9♥ 8♥ 7♥ 6♥ 5♥ |
| 8 | Quads | K♠ K♥ K♦ K♣ 2♠ |
| 7 | Boat | A♠ A♥ A♦ K♠ K♥ |
| 6 | Flush | A♣ J♣ 8♣ 6♣ 2♣ |
| 5 | Straight | T♠ 9♥ 8♦ 7♣ 6♠ |
| 4 | Trips | 7♠ 7♥ 7♦ K♠ 3♣ |
| 3 | Two Pair | A♠ A♥ 8♦ 8♣ 4♠ |
| 2 | Pair | Q♠ Q♥ 9♦ 5♣ 2♠ |
| 1 | High Card | A♠ J♥ 8♦ 5♣ 3♠ |

---

## 3. Payout System

### 3.1 Core Principle
- **Multiplayer (2+ players)**: Pot-based game. All antes go into the pot; winners split the pot.
- **Single Player**: Play against the dealer as a virtual **bank**.

### 3.2 Single Player Mode (vs Bank)

When playing solo, the dealer acts as the bank:

| Player vs Dealer | Result |
|------------------|--------|
| **Player beats dealer** | Win: `+bet` |
| **Player does not beat dealer** | Lose: `-bet` |

### 3.3 Multiplayer Payout Rules

**Pot Calculation:**
> `Total Pot = sum of all player bets`

**Winner Determination:**
1. Evaluate all player hands against dealer.
2. If any players beat the dealer → winner is the **lowest** hand among beaters.
3. If no players beat the dealer → winner is the **highest** hand overall.
4. If multiple players tie for the winning hand → split pot equally among them.

**Payout:**
> Each winner receives: `Total Pot / number of winners`
> Each player's net result: `winnings received - bet paid`

### 3.4 Payout Calculation Algorithm

```javascript
// Determine winners
const beatingPlayers = players.filter(p => p.beatsDealer);
let winnerIds = [];

if (beatingPlayers.length > 0) {
    // Lowest hand among those beating dealer
    const lowestBeater = pickLowestHand(beatingPlayers);
    winnerIds = beatingPlayers
        .filter(p => compareHands(p.hand, lowestBeater.hand) === 0)
        .map(p => p.id);
} else {
    // Highest hand when nobody beats dealer
    const highestHand = pickHighestHand(allPlayers);
    winnerIds = allPlayers
        .filter(p => compareHands(p.hand, highestHand.hand) === 0)
        .map(p => p.id);
}

// Calculate payouts
const totalPot = players.reduce((sum, p) => sum + p.bet, 0);
const winnerCount = winnerIds.length;

for (const player of players) {
    const isWinner = winnerIds.includes(player.id);
    const winnings = isWinner ? totalPot / winnerCount : 0;
    player.netResult = winnings - player.bet;
    player.pnl += player.netResult;
}
```

### 3.5 Examples

**Example 1: 3 Players — One Beats Dealer (Lowest Wins)**
- Dealer: Two Pair (Aces and Kings)
- Player A: Trips (beats dealer) — bet $1
- Player B: Flush (beats dealer) — bet $1
- Player C: Pair (does not beat dealer) — bet $1
- Total Pot: $3

Players A and B both beat the dealer. Player A has the **lower** hand (Trips < Flush), so Player A wins.

**Result:**
- Player A: $3 - $1 = **+$2**
- Player B: $0 - $1 = **-$1**
- Player C: $0 - $1 = **-$1**
- **Total: $0** ✓

**Example 2: 3 Players — Nobody Beats Dealer (Highest Wins)**
- Dealer: Flush
- Player A: Two Pair — bet $1
- Player B: Trips — bet $1
- Player C: Pair — bet $1
- Total Pot: $3

Nobody beats the dealer. Player B has the **highest** hand (Trips), so Player B wins.

**Result:**
- Player A: $0 - $1 = **-$1**
- Player B: $3 - $1 = **+$2**
- Player C: $0 - $1 = **-$1**
- **Total: $0** ✓

**Example 3: 2 Players — Tie**
- Dealer: Straight
- Player A: Flush (beats dealer) — bet $1
- Player B: Flush of same rank (beats dealer) — bet $1
- Total Pot: $2

Both players beat dealer with equal hands → split pot.

**Result:**
- Player A: $1 - $1 = **$0**
- Player B: $1 - $1 = **$0**
- **Total: $0** ✓

**Example 4: Single Player — Beats Dealer**
- Dealer: Two Pair
- Player: Trips — bet $2

Player beats dealer → wins bet from bank.

**Result:**
- Player: **+$2**

**Example 5: Single Player — Loses to Dealer**
- Dealer: Flush
- Player: Two Pair — bet $2

Player does not beat dealer → loses bet to bank.

**Result:**
- Player: **-$2**

---

## 4. UI/UX Specifications

### 4.1 Screens

1. **Menu Screen**
   - Player name input
   - Room code input (entering a code changes button to "Join Game")
   - "Start Game" / "Join Game" button (context-sensitive)
   - Quick rules preview

2. **Lobby Screen**
   - Room code display with copy button
   - Player list (shows host badge, queued status)
   - Host controls: bet amount input, draw count selector
   - "Start Game" / "Leave Lobby" buttons
   - Non-host sees "Waiting for host to start..."

3. **Game Screen**
   - Room code header with quit button
   - Dealer area: 7 cards split into "Used 5-Card Hand" + "Unused Cards"
   - Players area: grid of player boxes
   - Your hand area: 5 interactive card slots with discard selection
   - Live hand strength indicator (shows current hand name)
   - Live dealer comparison indicator (beats/doesn't beat dealer)
   - Action area: Keep All, Replace All, Clear, Confirm buttons
   - Draw round banner with deck/discard counts
   - Host showdown controls: next bet, next draw count, next hand button
   - Game log and chat panel (tabbed)

### 4.2 Dealer Area Display

```
┌──────────────────────────────────────┐
│         DEALER (7 CARDS)             │
│                                      │
│  ┌─ Used 5-Card Hand ─────────────┐  │
│  │  [A♠] [K♠] [Q♠] [J♠] [T♠]    │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─ Unused Cards ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │  [5♥] [2♣]                     │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘  │
│                                      │
│  Dealer Best: Royal Flush            │
└──────────────────────────────────────┘
```

### 4.3 Player Box Display

**During Draw:**
```
┌─────────────────┐
│ Player Name     │
│ PnL: $0         │
│ Bet: $1         │
│ ✓ Confirmed     │
│ Discards: 2     │
└─────────────────┘
```

**At Showdown:**
```
┌─────────────────────┐
│ Player Name         │
│ PnL: +$2            │
│ Bet: $1             │
│ [A♠][K♥][Q♦][J♣][T♠]│ ← Mini cards
│ Straight            │ ← Hand name
│ ✓ Beats dealer      │ ← Comparison
│ 🏆 Winner           │ ← If winner
│ PnL this hand: +$2  │ ← Net result
└─────────────────────┘
```

### 4.4 Your Hand Area

```
┌──────────────────────────────────┐
│       YOUR HAND                  │
│  [A♠] [K♥] [Q♦] [J♣] [T♠]     │
│                                  │
│  Hand: Straight                  │ ← Live indicator
│  ✓ Beats Dealer                  │ ← Live indicator
│  PnL: $0                        │
├──────────────────────────────────┤
│  At showdown:                    │
│  Dealer: Two Pair                │
│  You: Straight ✓                 │
│  Mode: Lowest above dealer wins  │
│  PnL this hand: +$2             │
└──────────────────────────────────┘
```

### 4.5 Action Area

```
┌──────────────────────────────────┐
│  Your Bet: $1           [?]     │
│  Draw Round 1 of 2              │
│  Deck: 20 • Discards: 7        │
│                                  │
│  [Keep All]    [Replace All]     │
│  [Clear]       [Confirm (2)]     │
│                                  │
│  Waiting for other players...    │
└──────────────────────────────────┘
```

### 4.6 Number Formatting
- Always show `$` prefix
- Only show decimals if not a whole number: `$1` not `$1.00`, but `$1.50` if needed
- Negative numbers: `-$5`
- Positive with sign (for payouts): `+$5`

### 4.7 Hand Names

| Internal Name | Display Name |
|---------------|--------------|
| HIGH_CARD | High Card |
| PAIR | Pair |
| TWO_PAIR | Two Pair |
| THREE_OF_A_KIND | Trips |
| STRAIGHT | Straight |
| FLUSH | Flush |
| FULL_HOUSE | Boat |
| FOUR_OF_A_KIND | Quads |
| STRAIGHT_FLUSH | Straight Flush |
| ROYAL_FLUSH | Royal Flush |

### 4.8 Game Log & Chat

A tabbed panel at the bottom of the game screen provides:

**Game Log Tab** - Automatic logging of all game events:
- Hand start (bet amount, draw count, players)
- Player discard confirmations (count, round)
- Draw round transitions
- Showdown results (all hands, dealer comparison, winner)
- PnL summary (running totals)

```
═══ Hand #1 ═══
Bet: $1 • Draws: 2 • Players: Alice, Bob, Carol
Alice confirms 2 discards (Round 1/2)
Bob confirms 0 discards (Round 1/2)
Carol confirms 3 discards (Round 1/2)
Draw round 2 begins.
Alice confirms 1 discard (Round 2/2)
Bob confirms 0 discards (Round 2/2)
Carol confirms 2 discards (Round 2/2)
─── Showdown ───
Dealer: Two Pair
Result mode: Lowest hand that beat dealer wins
Alice: Trips (beats dealer) 🏆 +$2
Bob: Flush (beats dealer) -$1
Carol: Pair (misses dealer) -$1
─── PnL Summary ───
Alice: +$2 total
Bob: -$1 total
Carol: -$1 total
```

**Chat Tab** - Real-time chat with features:
- Text messaging with timestamps
- Emoji picker with poker-themed emojis (♠️ ♥️ ♦️ ♣️ 🃏 💰 🔥)
- Quick chat shortcuts (GG, NH, GL)
- Emoji-only messages display larger with bounce animation
- Notification pulse on tab when new message arrives
- System messages for joins/reconnects

---

## 5. Technical Architecture

### 5.1 File Structure
```
edge-the-dealer/
├── index.html              # Main HTML structure
├── styles.css              # All styles (imports ../ultimate-omaha/styles.css)
├── game.js                 # Game state, draw logic, showdown resolution
├── app.js                  # UI controller, event handling, multiplayer orchestration
└── docs/PRD.md             # This document

Shared dependencies (from ../ultimate-omaha/):
├── poker.js                # Hand evaluation, deck management
├── multiplayer.js          # PeerJS networking, host migration
└── styles.css              # Base styles (imported via @import)
```

### 5.2 Key Classes

**`Poker` (../ultimate-omaha/poker.js)** - Static utility class (shared)
- `createDeck()` - Returns 52-card array
- `shuffleDeck(deck)` - Fisher-Yates shuffle
- `evaluate5CardHand(cards)` - Evaluate a 5-card poker hand
- `compareHands(hand1, hand2)` - Compare two hands (returns -1, 0, 1)
- `combinations(cards, n)` - Generate all n-card combinations
- `getRankValue(rank)` - Get numeric value for a rank
- `getCardId(card)` - Unique identifier for a card
- `formatCard(card)` - Returns display-ready card object

**`EdgeTheDealerGame` (game.js)** - Game state manager
- `initGame(playerIds, baseBet, drawCount)` - Initialize new game
- `startHand()` - Shuffle, deal cards, set phase to 'draw'
- `confirmDiscards(playerId, discardIndices)` - Confirm a player's discards
- `executeDrawRound()` - Execute simultaneous discards/replacements
- `resolveShowdown()` - Evaluate all hands, determine winners, calculate PnL
- `getGameState()` - Return serializable state for multiplayer sync
- `evaluateBestFiveFromCards(cards)` - Best 5-card hand from N cards (for dealer)
- `sortCardsForDisplay(cards)` - Smart sort: groups first, then rank, then suit
- `queuePlayer(playerId)` - Queue a late-joining player
- `removePlayer(playerId)` - Remove a disconnected player
- `serialize()` / `deserialize(data)` - For state backup/restore

**`MultiplayerManager` (../ultimate-omaha/multiplayer.js)** - Networking (shared)
- `initPeer(isHost, roomCode)` - Create PeerJS connection
- `connectToRoom()` - Join existing room
- `broadcast(data, excludePeerId)` - Send to all peers
- `broadcastGameState(state)` - Filtered per-player state
- `filterStateForPlayer(state, playerId)` - Hide other players' hole cards
- `sendToHost(data)` / `sendToPeer(peerId, data)` - Direct messaging

**`EdgeTheDealerController` (app.js)** - UI Controller
- `updateGameUI(state)` - Render full game state to DOM
- `updateDealerCards(state)` - Render dealer's 7 cards (grouped)
- `updateHoleCards(cards, canSelect)` - Render player's hand with selection
- `updatePlayersArea(players, phase, results)` - Player boxes
- `updateActionButtons(state, myPlayer)` - Action area state
- `toggleDiscard(slotIndex)` - Toggle card selection for discard
- `confirmDiscards()` - Send discard confirmation
- `formatCurrency(amount, forceSign)` - Number formatting

### 5.3 State Management

**Player Object (internal):**
```javascript
{
    id: string,              // PeerJS ID
    pnl: number,            // Current profit/loss (starts at 0)
    startingPnl: number,    // PnL at hand start (for display during hand)
    holeCards: Card[],       // 5 cards
    totalBet: number,        // Bet this hand (= baseBet)
    hasConfirmed: boolean,   // Confirmed this draw round?
    pendingDiscards: number[] // Indices of cards to discard
}
```

**Game State (broadcast):**
```javascript
{
    phase: 'waiting' | 'draw' | 'results',
    baseBet: number,
    drawCount: number,          // Total draw rounds (1-4)
    currentDrawRound: number,   // Current round (1-based)
    players: PlayerState[],     // All player states
    queuedPlayers: string[],    // IDs of queued players
    dealerCards: Card[],        // All 7 dealer cards
    dealerUsedCards: Card[],    // Best 5 cards
    dealerUnusedCards: Card[],  // Remaining 2 cards
    dealerBestHand: Hand,       // Evaluated dealer hand
    deckCount: number,          // Cards remaining in deck
    discardCount: number,       // Cards in discard pile
    results: Result[],          // Only at showdown
    resolutionType: string      // 'lowest_beating_dealer' or 'highest_when_no_one_beats_dealer'
}
```

**Result Object:**
```javascript
{
    playerId: string,
    holeCards: Card[],
    hand: { name: string, rank: number, value: number[] },
    beatsDealer: boolean,
    isWinner: boolean,
    totalBet: number,
    netResult: number    // +/- amount
}
```

### 5.4 Parallel Actions
- All players act simultaneously (not in turns)
- Players see `... Waiting` while others haven't confirmed, `✓ Confirmed` after confirming
- Draw round executes only when ALL players have confirmed
- `hasConfirmed` flag per player tracks confirmation status

### 5.5 Mid-Game Joins
- New players can join during a hand in progress
- They are queued (`queuedPlayers` array in game state)
- Added to game at start of next hand via `addQueuedPlayers()`
- UI shows them with "⏳ Waiting for next hand" status
- They can see the current game state, chat, and game log

### 5.6 Session Persistence & Reconnection

Players can refresh the page without losing their connection.

**How It Works:**

1. **Session Storage**: When a player connects, their session info is saved to `sessionStorage`:
   - `peerId` - Their PeerJS ID
   - `roomCode` - The room they're in
   - `playerName` - Their display name
   - `isHost` - Whether they're the host
   - `gameInProgress` - Whether a game is currently running
   - `timestamp` - For expiration (1 hour)

2. **On Page Load**: The app checks for an existing session and attempts to reconnect automatically.

3. **Host Reconnection**: Host reconnects using the same room code-based peer ID. If `gameInProgress` was true, host goes directly to game screen.

4. **Client Reconnection**: Client reconnects using the same peer ID. Host recognizes them and restores them to the game.

5. **Disconnection Grace Period**: When a player disconnects, host stores their info for 5 minutes. If they reconnect within that time, they're restored.

### 5.7 Host Migration

When the host disconnects, the system attempts reconnection first, then migrates to another host if needed.

**Flow:**
```
Host Disconnects
    ↓
Clients detect (conn.on('close'))
    ↓
Attempt reconnect every 1s (5 times)
    ↓
If reconnect succeeds → Send gameStateBackup to host → Resume
    ↓
If no reconnect → initiateHostMigration()
    ↓
First eligible player → becomeNewHost()
    ↓
Connect to all peers, send new_host_announcement
    ↓
Restore game state, continue game
```

---

## 6. Testing Scenarios

### 6.1 Payout Tests
1. **1 player beats dealer** - Winner gets entire pot
2. **Multiple players beat dealer** - Lowest hand among beaters wins pot
3. **Nobody beats dealer** - Highest hand wins pot
4. **All players tie** - Pot split equally (net $0 for everyone)
5. **2 players beat dealer, tied** - Split pot between both beaters
6. **Single player beats dealer** - Wins +bet from bank
7. **Single player loses to dealer** - Loses -bet to bank

### 6.2 Edge Cases
- **Maximum players (9)** - All 52 cards dealt (9×5 + 7 = 52), no cards in deck
- **Deck exhaustion during draws** - Discard pile reshuffled into deck mid-draw
- **0 discards confirmed** - Player keeps all cards (stand pat)
- **5 discards confirmed** - Player replaces entire hand
- **Player disconnects mid-hand** - Stored for reconnection, game continues
- **Player refreshes page** - Auto-reconnects using stored session
- **Host disconnects** - Host migration to next player
- **Player joins mid-hand** - Queued for next hand
- **All players discard all cards** - Heavy deck usage, may need reshuffle
- **Draw count change between hands** - Host adjusts for next hand

### 6.3 Resolution Type Verification
- When resolution is "lowest_beating_dealer": confirm the lowest hand among beaters is selected
- When resolution is "highest_when_no_one_beats_dealer": confirm the highest overall hand is selected
- Verify `sum(all netResults) === 0` for multiplayer hands

---

## 7. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-02-14 | Initial implementation with multiplayer, multi-draw, chat, and game log |
| 2.0 | 2025-02-14 | Major UI/UX overhaul: modern design, iPhone optimization, QoL features (Keep All, Replace All, live hand strength, dealer comparison, animations, swipe gestures, compact single-player mode) |
