# Ultimate Omaha - Product Requirements Document (PRD)

## 1. Overview

Ultimate Omaha is a multiplayer poker variant played with 1-10 players over peer-to-peer WebRTC connections (PeerJS). The game features two community boards, qualification requirements, and a multiplier-based payout system where players compete directly against each other.

---

## 2. Core Game Rules

### 2.1 Basic Setup
- **Players**: 1-10 players
- **Cards**: Standard 52-card deck
- **Hole Cards**: Each player receives 4 hole cards
- **Community Boards**: Two separate 5-card boards
- **Hand Formation**: Omaha rules - must use exactly 2 hole cards + 3 board cards

### 2.2 Betting Structure
- **Base Bet**: Configurable by host (default $1.00, supports 2 decimal places)
- **All players bet equally** - this is a +EV game by design
- **No folding** - players can only Check or Double
- **Doubling**: Doubles the player's current bet for that street

### 2.3 Game Phases

| Phase | Board State | Player Action |
|-------|-------------|---------------|
| **Preflop** | All cards face down | Check or Double |
| **Flop** | 3 cards revealed per board | Check or Double |
| **Showdown** | All 5 cards revealed per board | Results displayed |

### 2.4 Qualification
A player **qualifies** if they make **Pair of Aces or better** on **BOTH** boards.

- If qualified: Player wins based on multiplier
- If not qualified (fouled): Player loses their bet

**Qualifying hands** (minimum Pair of Aces):
- Pair of Aces
- Two Pair (any)
- Trips (any)
- Straight
- Flush
- Boat (Full House)
- Quads (Four of a Kind)
- Straight Flush
- Royal Flush

### 2.5 Multipliers

| Hand | Multiplier |
|------|------------|
| Pair / Two Pair / Trips | 1× |
| Straight | 2× |
| Flush | 2× |
| Boat | 3× |
| Quads | 4× |
| Straight Flush | 5× |
| Royal Flush | 10× |

**Total Multiplier** = Board 1 Multiplier × Board 2 Multiplier

Example: Flush (2×) on Board 1 + Boat (3×) on Board 2 = 6× total

---

## 3. Payout System (CRITICAL)

### 3.1 Core Principle
- **Multiplayer (2+ players)**: Player-vs-player game. Money flows directly between players.
- **Single Player**: Play against an imaginary **bank** for practice/testing.

### 3.2 Single Player Mode (vs Bank)

When playing solo, payouts come from/go to an imaginary bank:

| Player Status | Result |
|---------------|--------|
| **Qualifies** | Win `bet × totalMultiplier` from the bank |
| **Fouls** | Lose `bet` to the bank |

### 3.3 Multiplayer Payout Rules

**Both rules apply INDEPENDENTLY - they stack!**

**Rule 1: Winner collects from everyone**
> If a player **qualifies** (wins), they receive `bet × multiplier` from **EACH** other player.
> 
> `Win from each opponent = player's bet × player's multiplier`
> `Total win from this rule = bet × multiplier × (number of other players)`

**Rule 2: Loser pays everyone**
> If a player **fouls** (loses), they pay their `bet` to **EACH** other player.
> 
> `Loss to each opponent = player's bet`
> `Total loss from this rule = bet × (number of other players)`

### 3.4 How Transactions Work Between Two Players

For any pair of players (P1, P2), **multiple transactions can occur**:

| P1 Status | P2 Status | Transactions |
|-----------|-----------|--------------|
| Wins | Loses | P1 gets `P1.bet × P1.mult` from P2 (P1's win) **AND** P2 pays `P2.bet` to P1 (P2's loss) |
| Wins | Wins | P1 gets `P1.bet × P1.mult` from P2 **AND** P2 gets `P2.bet × P2.mult` from P1 |
| Loses | Loses | P1 pays `P1.bet` to P2 **AND** P2 pays `P2.bet` to P1 |
| Loses | Wins | P1 pays `P1.bet` to P2 (P1's loss) **AND** P2 gets `P2.bet × P2.mult` from P1 (P2's win) |

### 3.5 Payout Calculation Algorithm

```javascript
For each player P:
    netResult = 0
    numOthers = totalPlayers - 1
    
    // Rule 1: If P wins, collect from everyone
    if P.qualifies:
        netResult += P.bet × P.multiplier × numOthers
    
    // Rule 2: If P loses, pay everyone
    if P.fouls:
        netResult -= P.bet × numOthers
    
    // Rule 3: Receive money from other losers
    for each OTHER player O:
        if O.fouls:
            netResult += O.bet
    
    // Rule 4: Pay money to other winners
    for each OTHER player O:
        if O.qualifies:
            netResult -= O.bet × O.multiplier

    P.pnl += netResult
```

### 3.6 Examples

**Example 1: 3 Players - One Winner, Two Losers**
- Player A: Wins with $4 payout (bet × multiplier = $4)
- Player B: Loses, bet $2
- Player C: Loses, bet $1

**Transactions between A and B:**
- A wins → A receives $4 from B
- B loses → B pays $2 to A
- **Net: B pays $6 to A**

**Transactions between A and C:**
- A wins → A receives $4 from C
- C loses → C pays $1 to A
- **Net: C pays $5 to A**

**Transactions between B and C:**
- B loses → B pays $2 to C
- C loses → C pays $1 to B
- **Net: B pays $1 to C**

**Result:**
- A: +$6 + $5 = **+$11**
- B: -$6 - $1 = **-$7**
- C: -$5 + $1 = **-$4**
- **Total: $0** ✓

**Example 2: All Winners**
- Player A: Wins 2×, bet $1
- Player B: Wins 3×, bet $1
- Player C: Wins 1×, bet $1

**Transactions:**
- A receives $2 from B, $2 from C = +$4
- A pays $3 to B, $1 to C = -$4
- Net A: $0

- B receives $3 from A, $3 from C = +$6
- B pays $2 to A, $1 to C = -$3
- Net B: +$3

- C receives $1 from A, $1 from B = +$2
- C pays $2 to A, $3 to B = -$5
- Net C: -$3

**Result:** A: $0, B: +$3, C: -$3, **Total: $0** ✓

**Example 3: All Losers**
- Player A: Loses, bet $1
- Player B: Loses, bet $2
- Player C: Loses, bet $3

**Transactions:**
- A pays $1 to B, $1 to C = -$2
- A receives $2 from B, $3 from C = +$5
- Net A: +$3

- B pays $2 to A, $2 to C = -$4
- B receives $1 from A, $3 from C = +$4
- Net B: $0

- C pays $3 to A, $3 to B = -$6
- C receives $1 from A, $2 from B = +$3
- Net C: -$3

**Result:** A: +$3, B: $0, C: -$3, **Total: $0** ✓

*(In the all-losers case, players with smaller bets profit from players with larger bets!)*

---

## 4. UI/UX Specifications

### 4.1 Screens

1. **Menu Screen**
   - Player name input
   - "Create Room" button
   - Room code input + "Join Room" button
   - Quick rules preview

2. **Lobby Screen**
   - Room code display with copy button
   - Player list (shows host badge, queued status)
   - Bet amount input (host only)
   - "Start Game" / "Leave Lobby" buttons

3. **Game Screen**
   - Room code header (always visible for sharing)
   - Two community boards (stacked vertically)
   - Player boxes showing: name, PnL, bet, status
   - Queued players show "⏳ Waiting for next hand"
   - Current player's hole cards
   - Action area with Check/Double buttons
   - At showdown: host controls for next hand
   - Game log and chat panel at bottom (tabbed)

### 4.2 Player Box Display

**During Hand:**
```
┌─────────────────┐
│ Player Name     │
│ PnL: $0         │
│ Bet: $1         │
│ ✓ (or ...)      │
└─────────────────┘
```

**At Showdown:**
```
┌─────────────────────┐
│ Player Name         │
│ PnL: $0             │
│ Bet: $1             │
│ [A♠][K♥][Q♦][J♣]   │  ← Hole cards
│ Flush (2×)          │  ← Board 1 hand + multiplier
│ Boat (3×)           │  ← Board 2 hand + multiplier
│ $1 × 6 → +$6        │  ← Equation: bet × totalMult → result
│ PnL this hand: +$6  │  ← Net result for this hand
└─────────────────────┘
```

### 4.3 Board Result Display

Below each community board at showdown:
```
Flush (2×) ✓          ← Hand name, multiplier, qualify status
```
- No "Your" prefix
- Shows multiplier in parentheses
- ✓ if qualifies, ✗ if fouls

### 4.4 Your Hand Area at Showdown

```
┌─────────────────────────┐
│      YOUR HAND          │
│   [A♠][K♥][Q♦][J♣]     │
│     PnL: $0             │
├─────────────────────────┤
│ Board 1: Flush (2×)     │
│ Board 2: Boat (3×)      │
│ $1 × 6 → +$6            │
│ PnL this hand: +$6      │
└─────────────────────────┘
```

### 4.5 Number Formatting
- Always show `$` prefix
- Only show decimals if not a whole number: `$1` not `$1.00`, but `$1.50` if needed
- Negative numbers: `-$5` 
- Positive with sign (for payouts): `+$5`

### 4.6 Hand Names (Simplified)
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

### 4.7 Game Log & Chat

A tabbed panel at the bottom of the game screen provides:

**Game Log Tab** - Automatic logging of all game events:
- Hand start (bet amount, players)
- Player actions (check/double with amounts)
- Board cards (flop, turn, river for both boards)
- Showdown (all players' hole cards)
- Hand results (each player's hand ranking, multiplier, payout)
- PnL summary (running totals)

```
═══ Hand #1 ═══
Bet: $1 • Players: Alice, Bob, Carol
Alice checks
Bob doubles to $2
Carol checks
Board 1 Flop: A♠ K♥ Q♦
Board 2 Flop: 7♣ 8♣ 9♣
Board 1 Turn/River: A♠ K♥ Q♦ J♠ T♣
Board 2 Turn/River: 7♣ 8♣ 9♣ T♣ J♣
─── Showdown ───
Alice: A♥ K♠ Q♠ J♥
  → Two Pair + Straight (2×): +$2
Bob: 6♣ 5♣ 4♣ 3♣
  → FOUL: -$2
─── PnL Summary ───
Alice: +$2 total
Bob: -$2 total
```

**Chat Tab** - Real-time chat with features:
- Text messaging with timestamps
- Emoji picker with poker-themed emojis (♠️ ♥️ ♦️ ♣️ 🃏 💰 🔥)
- Quick chat shortcuts (GG, NH, GL)
- Emoji-only messages display larger with bounce animation
- Notification pulse on tab when new message arrives
- System messages for joins/reconnects

**UI Layout:**
```
┌─────────────────────────────────┐
│ [📋 Game Log] [💬 Chat]         │  ← Tabs
├─────────────────────────────────┤
│                                 │
│   (Log entries or chat msgs)    │  ← Scrollable content
│                                 │
├─────────────────────────────────┤
│ [Type a message...] [Send] [😀] │  ← Chat input (chat tab only)
└─────────────────────────────────┘
```

---

## 5. Technical Architecture

### 5.1 File Structure
```
ultimate-omaha/
├── index.html      # Main HTML structure
├── style.css       # All styles
├── poker.js        # Hand evaluation, deck management
├── game.js         # Game state, betting, payouts
├── multiplayer.js  # PeerJS networking
└── main.js         # UI controller, event handling
```

### 5.2 Key Classes

**`Poker` (poker.js)** - Static utility class
- `createDeck()` - Returns 52-card array
- `shuffleDeck(deck)` - Fisher-Yates shuffle
- `evaluateOmahaHand(holeCards, boardCards)` - Best 5-card hand
- `doesHandQualify(hand)` - Pair of Aces+ check
- `getMultiplier(hand)` - Returns 1-10 multiplier
- `calculateTotalMultiplier(hand1, hand2)` - Multiplies both
- `formatCard(card)` - Returns display-ready card object

**`UltimateOmahaGame` (game.js)** - Game state manager
- `initGame(playerIds, baseBet)` - Initialize new game
- `startHand()` - Deal cards, reset state
- `processAction(playerId, action)` - Handle check/double
- `advancePhase()` - Move to next phase
- `resolveShowdown()` - Calculate all payouts
- `getGameState()` - Return serializable state

**`MultiplayerManager` (multiplayer.js)** - Networking
- `initPeer(isHost, roomCode)` - Create PeerJS connection
- `connectToRoom()` - Join existing room
- `broadcast(data)` - Send to all peers
- `broadcastGameState(state)` - Filtered per-player state
- `filterStateForPlayer(state, playerId)` - Hide other hole cards

**`GameController` (main.js)** - UI Controller
- `updateGameUI(state)` - Render game state
- `updatePlayersArea(players, phase, results)` - Player boxes
- `updateActionButtons(state, myPlayer)` - Action area
- `formatCurrency(amount, forceSign)` - Number formatting

### 5.3 State Management

**Player Object:**
```javascript
{
    id: string,           // PeerJS ID
    pnl: number,          // Current profit/loss (starts at 0)
    startingPnl: number,  // PnL at hand start (for display during hand)
    holeCards: Card[],    // 4 cards
    currentBet: number,   // Current street bet
    totalBet: number,     // Total bet this hand
    hasActed: boolean     // Acted this round?
}
```

**Game State (broadcast):**
```javascript
{
    phase: 'waiting' | 'preflop' | 'flop' | 'results',
    baseBet: number,
    players: PlayerState[],
    board1: Card[],       // 5 cards (some faceDown)
    board2: Card[],
    results: Result[]     // Only at showdown
}
```

**Result Object:**
```javascript
{
    playerId: string,
    holeCards: Card[],
    hand1: { name, rank, qualifies, multiplier },
    hand2: { name, rank, qualifies, multiplier },
    qualifies: boolean,
    totalMultiplier: number,
    totalBet: number,
    netResult: number     // +/- amount
}
```

### 5.4 Parallel Actions
- All players act simultaneously (not in turns)
- Players see `...` while waiting, `✓` after acting
- Phase advances only when ALL players have acted
- `actedThisRound: Set<playerId>` tracks who has acted

### 5.5 Mid-Game Joins
- New players can join during a hand in progress
- They are queued (`queuedPlayers` array in game state)
- Added to game at start of next hand
- UI shows them with "⏳ Waiting for next hand" status
- They can still see the current game state, chat, and game log
- Room code is always visible at top of game screen for sharing

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

3. **Host Reconnection**: 
   - Host reconnects using the same room code-based peer ID
   - PeerJS allows this if the previous connection was dropped
   - If `gameInProgress` was true, host goes directly to game screen
   - Game state is restored from reconnecting clients' backups

4. **Client Reconnection**:
   - Client reconnects using the same peer ID they had before
   - Host recognizes them via the `disconnectedPlayers` map
   - Client sends their `lastFullGameState` backup to help restore host
   - Client is restored to the game (not queued)

5. **Disconnection Grace Period**: 
   - When a player disconnects, host stores their info for 5 minutes
   - If they reconnect within that time, they're restored
   - After 5 minutes, they're considered fully left

6. **Game State Sync**:
   - `playerOrder` is sent with `player_list` and `player_joined` messages
   - All clients track the same join order for host election
   - `gameInProgress` is updated in session when game starts/ends

**Session Lifecycle:**
```
Connect → Save Session → [Page Refresh] → Load Session → Reconnect → Restore
    ↓
Leave (intentional) → Clear Session
```

**Key Data Structures:**

```javascript
// sessionStorage: 'ultimateomaha_session'
{
    peerId: string,
    roomCode: string,
    playerName: string,
    isHost: boolean,
    gameInProgress: boolean,
    timestamp: number
}

// MultiplayerManager.disconnectedPlayers (Map)
peerId → {
    id: string,
    name: string,
    isHost: boolean,
    disconnectedAt: number  // for expiration
}

// MultiplayerManager.playerOrder (Array)
[hostId, player1Id, player2Id, ...]  // Join order, host always first
```

### 5.7 Host Migration

When the host disconnects or refreshes, the system first tries to reconnect, then migrates to another host if needed.

**How It Works:**

1. **Game State Backup**: Host broadcasts full (unfiltered) game state to all clients with every update. Clients store this as `lastFullGameState`. `playerOrder` is also synced.

2. **Player Order Tracking**: Host maintains `playerOrder` array tracking join order (host first). Sent with `player_list` and `player_joined` messages.

3. **Session Persistence**: `gameInProgress` flag is saved to session, allowing host to remember game was in progress after refresh.

4. **Host Disconnection Detection**: When a client loses connection to the host:
   - Client attempts to reconnect every 1 second for 5 attempts
   - On each attempt, sends reconnect with game state backup
   - If successful, connection is restored

5. **Host Reconnection with State Restore**:
   - If host refreshes, they come back with no game state
   - First client to reconnect sends their `gameStateBackup`
   - Host restores game from client's backup
   - Game continues seamlessly

6. **Host Election** (if host doesn't reconnect within 5 seconds):
   - First player in `playerOrder` (excluding old host) becomes new host
   - If that's us, we call `becomeNewHost()`
   - Otherwise, we wait for the new host to connect

7. **New Host Setup**:
   - New host marks themselves as host
   - Connects to all other players
   - Sends `new_host_announcement` with game state
   - Restores game from `lastFullGameState`
   - Shows game screen, begins handling game logic

**Host Migration Flow:**
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

**Limitations:**
- Brief interruption (~5 seconds) while migration occurs
- If all clients disconnect simultaneously, game is lost
- At least one client must have received a game state backup

---

## 6. Payout Implementation

### 6.1 Correct Algorithm (game.js)

```javascript
resolveShowdown() {
    const numPlayers = this.players.length;
    const numOtherPlayers = numPlayers - 1;

    // Step 1: Evaluate each player's hands
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
            hand1: { name: hand1.name, qualifies: qualifies1, multiplier: Poker.getMultiplier(hand1) },
            hand2: { name: hand2.name, qualifies: qualifies2, multiplier: Poker.getMultiplier(hand2) },
            qualifies,
            totalMultiplier,
            totalBet: player.totalBet,
            netResult: 0
        };
    });
    
    // Step 2: Calculate each player's net result
    for (const player of results) {
        let net = 0;

        // RULE 1: If player WINS, receive bet×multiplier from EACH other player
        if (player.qualifies) {
            net += player.totalBet * player.totalMultiplier * numOtherPlayers;
        }

        // RULE 2: If player LOSES, pay bet to EACH other player
        if (!player.qualifies) {
            net -= player.totalBet * numOtherPlayers;
        }

        // RULE 3: Receive money from each OTHER player who loses
        for (const other of results) {
            if (other.playerId === player.playerId) continue;
            if (!other.qualifies) {
                net += other.totalBet;
            }
        }

        // RULE 4: Pay money to each OTHER player who wins
        for (const other of results) {
            if (other.playerId === player.playerId) continue;
            if (other.qualifies) {
                net -= other.totalBet * other.totalMultiplier;
            }
        }

        player.netResult = net;
    }
    
    // Step 3: Apply to PnL
    for (const result of results) {
        const player = this.players.find(p => p.id === result.playerId);
        player.pnl += result.netResult;
    }
    
    this.lastResults = results;
    return results;
}
```

### 6.2 Verification
After every hand, verify: `sum(all player netResults) === 0`

### 6.3 Payout Logic Explanation

The algorithm considers 4 independent money flows for each player:

1. **Your win income**: If you qualify, collect `bet × multiplier` from each opponent
2. **Your loss expense**: If you foul, pay `bet` to each opponent  
3. **Receive from other losers**: You receive each other loser's bet
4. **Pay to other winners**: You pay each other winner's `bet × multiplier`

Note: Rules 1+4 and Rules 2+3 are symmetric - what one player receives, another pays.

---

## 7. Testing Scenarios

### 7.1 Payout Tests
1. **2 players: 1 wins, 1 loses** - Winner gets bet × multiplier
2. **3 players: 1 wins 2×, 2 lose** - Winner gets $4 total (bet=1)
3. **3 players: 2 win (2×, 3×), 1 loses** - Each winner collects from loser
4. **3 players: All qualify** - No money changes hands
5. **3 players: All foul** - No money changes hands
6. **Different bet sizes** - Player who doubled pays/receives more

### 7.2 Edge Cases
- **Single player game** - Plays against bank (qualify = win bet×mult, foul = lose bet)
- **Player disconnects mid-hand** - Stored for 5 min, can reconnect and resume
- **Player refreshes page** - Auto-reconnects using stored session
- **Host refreshes** - Reconnects with same room code, OR if too slow, another player becomes host
- **Host leaves/crashes** - First other player becomes new host after 5 second timeout
- All players have same hand
- Player joins mid-hand (should be queued)

---

## 8. Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-12-14 | Initial implementation |
| 1.1 | 2024-12-14 | Fixed payout algorithm, renamed Stack→PnL |
| 1.2 | 2024-12-18 | Added single-player mode (vs bank), updated showdown UI with equation display |
| 1.3 | 2024-12-18 | Added session persistence - players can refresh without disconnecting |
| 1.4 | 2024-12-18 | Added host migration - if host leaves, another player becomes host automatically |
| 1.5 | 2024-12-18 | Added game log and chat with emoji picker, notifications, and poker slang shortcuts |
| 1.6 | 2024-12-18 | Room code displayed at top during game, improved mid-game join display, taller log/chat panel |
| 1.7 | 2024-12-18 | Improved host migration: reconnect attempts before migration, game state backup from clients |

