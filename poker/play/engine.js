(function (root, factory) {
  const catalog = root.MixedPokerCatalog || (typeof require === "function" ? require("./game-catalog.js") : null);
  const evaluator = root.MixedPokerEvaluator || (typeof require === "function" ? require("./evaluator.js") : null);
  const api = factory(catalog, evaluator);
  root.MixedPokerEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function (Catalog, Eval) {
  "use strict";

  const DEFAULT_SETTINGS = Object.freeze({
    seats: 6,
    games: ["lhe", "o8", "razz", "stud", "stud8", "27-td", "plo4", "nlh"],
    handsPerGame: 6,
    startingStack: 2000,
    smallBlind: 5,
    bigBlind: 10,
    ante: 1,
    bringIn: 5,
    smallBet: 10,
    bigBet: 20,
    raiseCap: 4,
    straddle: false,
    bombEvery: 0,
    bombAnte: 10,
    actionClock: 0,
  });

  function createTable(players, settings = {}, seed = "") {
    const normalized = normalizeSettings(settings);
    const seats = players.slice(0, normalized.seats).map((player, seat) => ({
      id: String(player.id),
      name: cleanName(player.name),
      seat,
      stack: normalized.startingStack,
      sittingOut: false,
      disconnected: false,
      hole: [],
      down: [],
      up: [],
      discards: [],
      folded: false,
      allIn: false,
      streetBet: 0,
      totalCommitted: 0,
      lastAction: "",
      evaluation: [],
      payout: 0,
    }));
    if (seats.length < 2) throw new Error("A mixed game needs at least two players.");
    const minimumCap = Math.min(...normalized.games.map((id) => Catalog.getGame(id).maxPlayers));
    if (seats.length > minimumCap) throw new Error("One selected game supports only " + minimumCap + " players.");
    return {
      version: 1,
      kind: "poker",
      settings: normalized,
      players: seats,
      phase: "between",
      handNumber: 0,
      buttonIndex: -1,
      gameIndex: -1,
      gameHandCount: 0,
      gameId: normalized.games[0],
      deck: [],
      recyclableMuck: [],
      roundMuck: [],
      boards: [[]],
      zombieBoards: [],
      sharedStudCard: null,
      street: "",
      streetIndex: 0,
      drawNumber: 0,
      stage: "between",
      activePlayerId: null,
      pending: [],
      currentBet: 0,
      minRaise: normalized.bigBlind,
      raises: 0,
      bringInPlayerId: null,
      smallBlindPlayerId: null,
      bigBlindPlayerId: null,
      straddlePlayerId: null,
      isBombPot: false,
      ledger: [],
      handResult: null,
      seed: seed || randomSeed(),
      recycleCount: 0,
    };
  }

  function normalizeSettings(settings = {}) {
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    const games = Array.from(new Set((Array.isArray(merged.games) ? merged.games : DEFAULT_SETTINGS.games)
      .map(String)
      .filter((id) => Catalog.BY_ID[id])));
    if (!games.length) throw new Error("Choose at least one game.");
    const seats = clampWhole(merged.seats, 2, 8, 6);
    return {
      seats,
      games,
      handsPerGame: merged.handsPerGame === "orbit" ? seats : clampWhole(merged.handsPerGame, 1, 99, seats),
      startingStack: clampWhole(merged.startingStack, 20, 100000000, 2000),
      smallBlind: clampWhole(merged.smallBlind, 1, 1000000, 5),
      bigBlind: clampWhole(merged.bigBlind, 2, 2000000, 10),
      ante: clampWhole(merged.ante, 0, 1000000, 1),
      bringIn: clampWhole(merged.bringIn, 1, 1000000, 5),
      smallBet: clampWhole(merged.smallBet, 1, 2000000, 10),
      bigBet: clampWhole(merged.bigBet, 2, 4000000, 20),
      raiseCap: clampWhole(merged.raiseCap, 2, 9, 4),
      straddle: Boolean(merged.straddle),
      bombEvery: clampWhole(merged.bombEvery, 0, 99, 0),
      bombAnte: clampWhole(merged.bombAnte, 1, 2000000, 10),
      actionClock: clampWhole(merged.actionClock, 0, 300, 0),
    };
  }

  function startHand(source) {
    const state = clone(source);
    if (state.phase === "betting" || state.phase === "draw" || state.phase === "discard") throw new Error("The current hand is still active.");
    const funded = state.players.filter((player) => !player.sittingOut && player.stack > 0);
    if (funded.length < 2) throw new Error("At least two funded players are needed.");
    rotateGame(state);
    const game = Catalog.getGame(state.gameId);
    if (funded.length > game.maxPlayers) throw new Error(game.short + " supports at most " + game.maxPlayers + " players.");
    state.handNumber += 1;
    state.buttonIndex = nextEligibleSeat(state, state.buttonIndex);
    state.deck = shuffledDeck(state.seed + "-" + state.handNumber);
    state.recyclableMuck = [];
    state.roundMuck = [];
    state.boards = Array.from({ length: game.boards || 1 }, () => []);
    state.zombieBoards = [];
    state.sharedStudCard = null;
    state.street = "";
    state.streetIndex = 0;
    state.drawNumber = 0;
    state.stage = "dealing";
    state.phase = "dealing";
    state.activePlayerId = null;
    state.pending = [];
    state.currentBet = 0;
    state.raises = 0;
    state.handResult = null;
    state.bringInPlayerId = null;
    state.smallBlindPlayerId = null;
    state.bigBlindPlayerId = null;
    state.straddlePlayerId = null;
    state.isBombPot = game.bombPot || Boolean(state.settings.bombEvery && state.handNumber % state.settings.bombEvery === 0 && ["community", "dramaha"].includes(game.format));
    state.players.forEach(resetPlayerForHand);

    if (game.format === "stud" || game.format === "super-stud") dealStudOpening(state, game);
    else dealButtonGameOpening(state, game);
    return state;
  }

  function rotateGame(state) {
    if (state.gameIndex < 0 || state.gameHandCount >= state.settings.handsPerGame) {
      state.gameIndex = (state.gameIndex + 1) % state.settings.games.length;
      state.gameHandCount = 0;
    }
    state.gameId = state.settings.games[state.gameIndex];
    state.gameHandCount += 1;
  }

  function dealButtonGameOpening(state, game) {
    const active = activePlayers(state);
    const startSeat = nextEligibleSeat(state, state.buttonIndex);
    dealRounds(state, activeOrderFrom(state, startSeat), game.holeCards, "hole");
    if (game.format === "ari") dealBoardCards(state, 1);

    if (state.isBombPot) {
      active.forEach((player) => commit(player, state.settings.bombAnte));
      if (["community", "dramaha", "zombie"].includes(game.format)) {
        dealBoardCards(state, 3);
        state.street = "Flop";
        state.streetIndex = 1;
      }
      beginBetting(state, firstAfterButton(state));
      return;
    }

    postBlinds(state);
    state.street = game.format === "community" || game.format === "dramaha" ? "Preflop" : "Before draw";
    state.streetIndex = 0;
    const opener = state.straddlePlayerId
      ? nextEligibleSeat(state, playerById(state, state.straddlePlayerId).seat)
      : nextEligibleSeat(state, playerById(state, state.bigBlindPlayerId).seat);
    beginBetting(state, opener, true);
  }

  function dealStudOpening(state, game) {
    activePlayers(state).forEach((player) => commit(player, state.settings.ante));
    const order = activeOrderFrom(state, nextEligibleSeat(state, state.buttonIndex));
    if (game.superStud) {
      dealRounds(state, order, 4, "down");
      dealRounds(state, order, 1, "up");
    } else {
      dealRounds(state, order, 2, "down");
      dealRounds(state, order, 1, "up");
    }
    const razz = ["razz", "razz-27", "super-razzdeucey"].includes(game.id);
    const bringPlayer = activePlayers(state).slice().sort((left, right) => doorKey(right, razz) - doorKey(left, razz))[0];
    state.bringInPlayerId = bringPlayer.id;
    commit(bringPlayer, state.settings.bringIn);
    state.street = "Third street";
    state.streetIndex = 3;
    state.currentBet = bringPlayer.streetBet;
    state.minRaise = state.settings.smallBet;
    beginBetting(state, nextEligibleSeat(state, bringPlayer.seat), true);
  }

  function postBlinds(state) {
    const active = activePlayers(state);
    const button = state.players[state.buttonIndex];
    const smallSeat = active.length === 2 ? button.seat : nextEligibleSeat(state, button.seat);
    const bigSeat = nextEligibleSeat(state, smallSeat);
    const small = state.players[smallSeat];
    const big = state.players[bigSeat];
    state.smallBlindPlayerId = small.id;
    state.bigBlindPlayerId = big.id;
    commit(small, state.settings.smallBlind);
    commit(big, state.settings.bigBlind);
    state.currentBet = Math.max(small.streetBet, big.streetBet);
    state.minRaise = state.settings.bigBlind;
    if (state.settings.straddle && active.length >= 3) {
      const straddleSeat = nextEligibleSeat(state, bigSeat);
      const straddle = state.players[straddleSeat];
      state.straddlePlayerId = straddle.id;
      commit(straddle, state.settings.bigBlind * 2);
      state.currentBet = straddle.streetBet;
      state.minRaise = state.settings.bigBlind * 2;
    }
  }

  function beginBetting(state, startSeat, preserveBets = false) {
    if (!preserveBets) {
      state.players.forEach((player) => { player.streetBet = 0; });
      state.currentBet = 0;
      state.minRaise = betSize(state);
    }
    state.raises = state.currentBet > 0 ? 1 : 0;
    state.stage = "betting";
    state.phase = "betting";
    state.pending = actionOrder(state, startSeat);
    state.activePlayerId = state.pending[0] || null;
    if (!state.pending.length) advanceAfterBetting(state);
  }

  function legalActions(state, playerId) {
    if (state.stage !== "betting" || state.activePlayerId !== playerId) return null;
    const player = playerById(state, playerId);
    const game = Catalog.getGame(state.gameId);
    const toCall = Math.max(0, state.currentBet - player.streetBet);
    const maxTarget = player.streetBet + player.stack;
    const minimumTarget = state.currentBet === 0 ? Math.min(maxTarget, betSize(state)) : Math.min(maxTarget, state.currentBet + state.minRaise);
    let maximumTarget = maxTarget;
    if (game.structure === "pot-limit") {
      maximumTarget = Math.min(maxTarget, state.currentBet + potSize(state) + toCall);
    }
    if (game.structure === "limit") maximumTarget = minimumTarget;
    const capReached = game.structure === "limit" && state.raises >= state.settings.raiseCap;
    return {
      canFold: toCall > 0,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise: !capReached && player.stack > toCall && maximumTarget > state.currentBet,
      toCall: Math.min(toCall, player.stack),
      minimumTarget,
      maximumTarget,
      structure: game.structure,
    };
  }

  function act(source, playerId, action) {
    const state = clone(source);
    const legal = legalActions(state, playerId);
    if (!legal) throw new Error("It is not your turn.");
    const player = playerById(state, playerId);
    const type = String(action?.type || "");
    if (type === "fold") {
      player.folded = true;
      player.lastAction = "Fold";
      maybeCreateZombieBoard(state, player);
      state.pending.shift();
    } else if (type === "check") {
      if (!legal.canCheck) throw new Error("Checking is not available.");
      player.lastAction = "Check";
      state.pending.shift();
    } else if (type === "call") {
      if (!legal.canCall) throw new Error("There is nothing to call.");
      const paid = commit(player, legal.toCall);
      player.lastAction = paid < legal.toCall ? "All-in " + paid : "Call " + paid;
      state.pending.shift();
    } else if (type === "raise" || type === "bet") {
      if (!legal.canRaise) throw new Error("Raising is not available.");
      const game = Catalog.getGame(state.gameId);
      let target = game.structure === "limit" ? legal.minimumTarget : clampWhole(action.amount, player.streetBet + 1, legal.maximumTarget, legal.minimumTarget);
      if (target < legal.minimumTarget && target < player.streetBet + player.stack) throw new Error("The minimum total is " + legal.minimumTarget + ".");
      target = Math.min(target, legal.maximumTarget);
      const previousBet = state.currentBet;
      const paid = commit(player, target - player.streetBet);
      const newTarget = player.streetBet;
      if (newTarget <= previousBet) {
        player.lastAction = "All-in " + paid;
        state.pending.shift();
      } else {
        const raiseSize = newTarget - previousBet;
        state.currentBet = newTarget;
        if (raiseSize >= state.minRaise) state.minRaise = raiseSize;
        state.raises += 1;
        player.lastAction = (previousBet ? "Raise to " : "Bet ") + newTarget;
        state.pending = actionOrder(state, nextEligibleSeat(state, player.seat)).filter((id) => id !== player.id);
      }
    } else {
      throw new Error("Choose fold, check, call, bet, or raise.");
    }

    if (remainingPlayers(state).length === 1) return settleUncontested(state);
    state.pending = state.pending.filter((id) => {
      const candidate = playerById(state, id);
      return candidate && !candidate.folded && !candidate.allIn;
    });
    state.activePlayerId = state.pending[0] || null;
    if (!state.pending.length) advanceAfterBetting(state);
    return state;
  }

  function advanceAfterBetting(state) {
    state.activePlayerId = null;
    state.pending = [];
    const game = Catalog.getGame(state.gameId);
    if (game.format === "community" || game.format === "zombie") {
      advanceCommunity(state, game);
      return;
    }
    if (game.format === "dramaha") {
      advanceDramaha(state);
      return;
    }
    if (game.format === "draw" || game.format === "ari") {
      advanceDrawGame(state, game);
      return;
    }
    if (game.format === "stud" || game.format === "super-stud") {
      advanceStud(state, game);
      return;
    }
    throw new Error("Unsupported game format.");
  }

  function advanceCommunity(state, game) {
    if (state.streetIndex === 0) {
      dealBoardCards(state, 3);
      state.streetIndex = 1;
      state.street = "Flop";
      beginBetting(state, firstAfterButton(state));
    } else if (state.streetIndex === 1) {
      dealBoardCards(state, 1);
      state.streetIndex = 2;
      state.street = "Turn";
      beginBetting(state, firstAfterButton(state));
    } else if (state.streetIndex === 2) {
      dealBoardCards(state, 1);
      state.streetIndex = 3;
      state.street = "River";
      beginBetting(state, firstAfterButton(state));
    } else {
      settleShowdown(state);
    }
  }

  function advanceDramaha(state) {
    if (state.streetIndex === 0) {
      dealBoardCards(state, 3);
      state.streetIndex = 1;
      state.street = "Flop";
      beginBetting(state, firstAfterButton(state));
    } else if (state.streetIndex === 1 && state.drawNumber === 0) {
      beginDraw(state, 1);
    } else if (state.streetIndex === 1) {
      dealBoardCards(state, 1);
      state.streetIndex = 2;
      state.street = "Turn";
      beginBetting(state, firstAfterButton(state));
    } else if (state.streetIndex === 2) {
      dealBoardCards(state, 1);
      state.streetIndex = 3;
      state.street = "River";
      beginBetting(state, firstAfterButton(state));
    } else {
      settleShowdown(state);
    }
  }

  function advanceDrawGame(state, game) {
    if (state.drawNumber < game.draws) beginDraw(state, state.drawNumber + 1);
    else settleShowdown(state);
  }

  function beginDraw(state, drawNumber) {
    state.drawNumber = drawNumber;
    state.roundMuck = [];
    state.players.forEach((player) => { player.streetBet = 0; });
    state.currentBet = 0;
    state.stage = "draw";
    state.phase = "draw";
    state.street = ordinal(drawNumber) + " draw";
    state.pending = participantOrder(state, firstAfterButton(state));
    state.activePlayerId = state.pending[0] || null;
    if (!state.pending.length) finishDraw(state);
  }

  function submitDraw(source, playerId, discardIds) {
    const state = clone(source);
    if (state.stage !== "draw" || state.activePlayerId !== playerId) throw new Error("It is not your draw.");
    const player = playerById(state, playerId);
    const ids = Array.from(new Set((Array.isArray(discardIds) ? discardIds : []).map(String)));
    const maximum = player.hole.length;
    if (ids.length > maximum || ids.some((id) => !player.hole.includes(id))) throw new Error("Choose only cards from your hand.");
    player.hole = player.hole.filter((id) => !ids.includes(id));
    player.discards.push(...ids);
    state.roundMuck.push(...ids);
    for (let index = 0; index < ids.length; index += 1) player.hole.push(drawOne(state));
    player.lastAction = ids.length ? "Drew " + ids.length : "Pat";
    state.pending.shift();
    state.activePlayerId = state.pending[0] || null;
    if (!state.pending.length) finishDraw(state);
    return state;
  }

  function finishDraw(state) {
    state.recyclableMuck.push(...state.roundMuck);
    state.roundMuck = [];
    const game = Catalog.getGame(state.gameId);
    if (game.format === "dramaha") {
      state.street = "After draw";
      beginBetting(state, firstAfterButton(state));
      return;
    }
    state.streetIndex = state.drawNumber;
    state.street = "After " + ordinal(state.drawNumber) + " draw";
    beginBetting(state, firstAfterButton(state));
  }

  function advanceStud(state, game) {
    if (game.superStud && state.streetIndex === 3) {
      beginSuperDiscard(state);
      return;
    }
    if (state.streetIndex >= 7) {
      settleShowdown(state);
      return;
    }
    const nextStreet = state.streetIndex + 1;
    dealStudStreet(state, nextStreet);
    state.streetIndex = nextStreet;
    state.street = ordinal(nextStreet) + " street";
    const opener = studOpener(state, game);
    beginBetting(state, opener);
  }

  function beginSuperDiscard(state) {
    state.stage = "discard";
    state.phase = "discard";
    state.street = "Discard two";
    state.pending = participantOrder(state, firstAfterButton(state));
    state.activePlayerId = state.pending[0] || null;
  }

  function submitSuperDiscard(source, playerId, discardIds) {
    const state = clone(source);
    if (state.stage !== "discard" || state.activePlayerId !== playerId) throw new Error("It is not your discard.");
    const player = playerById(state, playerId);
    const ids = Array.from(new Set((Array.isArray(discardIds) ? discardIds : []).map(String)));
    if (ids.length !== 2 || ids.some((id) => !player.down.includes(id))) throw new Error("Discard exactly two down cards.");
    player.down = player.down.filter((id) => !ids.includes(id));
    player.discards.push(...ids);
    state.recyclableMuck.push(...ids);
    player.lastAction = "Discarded two";
    state.pending.shift();
    state.activePlayerId = state.pending[0] || null;
    if (!state.pending.length) {
      dealStudStreet(state, 4);
      state.streetIndex = 4;
      state.street = "Fourth street";
      beginBetting(state, studOpener(state, Catalog.getGame(state.gameId)));
    }
    return state;
  }

  function dealStudStreet(state, street) {
    const recipients = remainingPlayers(state);
    if (state.deck.length < recipients.length) {
      state.sharedStudCard = drawOne(state);
      return;
    }
    recipients.forEach((player) => {
      if (street === 7) player.down.push(drawOne(state));
      else player.up.push(drawOne(state));
    });
  }

  function settleShowdown(state) {
    state.stage = "showdown";
    state.phase = "showdown";
    state.activePlayerId = null;
    state.pending = [];
    const game = Catalog.getGame(state.gameId);
    const boards = state.boards.concat(state.zombieBoards);
    const contenders = remainingPlayers(state);
    contenders.forEach((player) => {
      const cards = playerCards(player).concat(state.sharedStudCard ? [state.sharedStudCard] : []);
      player.evaluation = Eval.evaluateGame(game, cards, boards);
      player.payout = 0;
    });
    state.players.filter((player) => player.folded).forEach((player) => {
      player.evaluation = [];
      player.payout = 0;
    });

    const pots = buildSidePots(state);
    pots.forEach((pot) => awardPot(state, pot));
    const net = {};
    state.players.forEach((player) => {
      player.stack += player.payout;
      net[player.id] = player.payout - player.totalCommitted;
    });
    state.handResult = {
      handNumber: state.handNumber,
      gameId: state.gameId,
      pots,
      net,
      completedAt: new Date().toISOString(),
    };
    state.ledger.push({
      handNumber: state.handNumber,
      gameId: state.gameId,
      completedAt: state.handResult.completedAt,
      net: clone(net),
      stacks: Object.fromEntries(state.players.map((player) => [player.id, player.stack])),
      players: Object.fromEntries(state.players.map((player) => [player.id, player.name])),
    });
    return state;
  }

  function settleUncontested(state) {
    const winner = remainingPlayers(state)[0];
    const pot = potSize(state);
    winner.stack += pot;
    const net = {};
    state.players.forEach((player) => {
      net[player.id] = (player.id === winner.id ? pot : 0) - player.totalCommitted;
      player.payout = player.id === winner.id ? pot : 0;
    });
    state.stage = "showdown";
    state.phase = "showdown";
    state.activePlayerId = null;
    state.pending = [];
    state.handResult = {
      handNumber: state.handNumber,
      gameId: state.gameId,
      uncontestedWinnerId: winner.id,
      pots: [{ amount: pot, eligible: [winner.id], awards: [{ component: "uncontested", winners: [winner.id], amount: pot }] }],
      net,
      completedAt: new Date().toISOString(),
    };
    state.ledger.push({
      handNumber: state.handNumber,
      gameId: state.gameId,
      completedAt: state.handResult.completedAt,
      net: clone(net),
      stacks: Object.fromEntries(state.players.map((player) => [player.id, player.stack])),
      players: Object.fromEntries(state.players.map((player) => [player.id, player.name])),
    });
    return state;
  }

  function buildSidePots(state) {
    const levels = Array.from(new Set(state.players.map((player) => player.totalCommitted).filter((value) => value > 0))).sort((a, b) => a - b);
    let previous = 0;
    return levels.map((level) => {
      const contributors = state.players.filter((player) => player.totalCommitted >= level);
      const amount = (level - previous) * contributors.length;
      previous = level;
      return {
        amount,
        cap: level,
        contributors: contributors.map((player) => player.id),
        eligible: contributors.filter((player) => !player.folded).map((player) => player.id),
        awards: [],
      };
    }).filter((pot) => pot.amount > 0);
  }

  function awardPot(state, pot) {
    const eligible = pot.eligible.map((id) => playerById(state, id)).filter(Boolean);
    if (!eligible.length) return;
    const componentCount = Math.max(...eligible.map((player) => player.evaluation.length), 1);
    const qualifiedIndexes = [];
    for (let index = 0; index < componentCount; index += 1) {
      if (eligible.some((player) => player.evaluation[index]?.qualifies)) qualifiedIndexes.push(index);
    }
    if (!qualifiedIndexes.length) qualifiedIndexes.push(0);
    const baseShare = Math.floor(pot.amount / qualifiedIndexes.length);
    let splitRemainder = pot.amount - baseShare * qualifiedIndexes.length;
    qualifiedIndexes.forEach((componentIndex) => {
      const share = baseShare + (splitRemainder-- > 0 ? 1 : 0);
      const candidates = eligible.filter((player) => player.evaluation[componentIndex]?.qualifies);
      const pool = candidates.length ? candidates : eligible;
      const bestQuality = Math.max(...pool.map((player) => player.evaluation[componentIndex]?.quality ?? -Infinity));
      const winners = pool.filter((player) => (player.evaluation[componentIndex]?.quality ?? -Infinity) === bestQuality);
      const perWinner = Math.floor(share / winners.length);
      let odd = share - perWinner * winners.length;
      const orderedWinners = oddChipOrder(state, winners);
      orderedWinners.forEach((winner) => {
        const amount = perWinner + (odd-- > 0 ? 1 : 0);
        winner.payout += amount;
      });
      pot.awards.push({
        component: pool[0]?.evaluation[componentIndex]?.label || "Pot",
        winners: orderedWinners.map((player) => player.id),
        amount: share,
      });
    });
  }

  function maybeCreateZombieBoard(state, player) {
    const game = Catalog.getGame(state.gameId);
    if (game.format !== "zombie" || !["Flop", "Turn"].includes(state.street) || player.hole.length !== 5) return;
    const random = seededRandom(state.seed + "-zombie-" + state.handNumber + "-" + player.id);
    const board = player.hole.slice();
    for (let index = board.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [board[index], board[target]] = [board[target], board[index]];
    }
    state.zombieBoards.push(board);
  }

  function filterStateForPlayer(source, clientId) {
    const state = clone(source);
    delete state.deck;
    delete state.recyclableMuck;
    delete state.roundMuck;
    state.players.forEach((player) => {
      const mine = player.id === clientId;
      const reveal = state.phase === "showdown" && !player.folded;
      if (!mine && !reveal) {
        player.hole = player.hole.map(() => "BACK");
        player.down = player.down.map(() => "BACK");
      }
      player.discards = player.discards.map(() => "BACK");
    });
    return state;
  }

  function adjustStack(source, playerId, amount, note = "Adjustment") {
    const state = clone(source);
    if (!["between", "showdown"].includes(state.phase)) throw new Error("Adjust stacks between hands.");
    const player = playerById(state, playerId);
    if (!player) throw new Error("Player not found.");
    const delta = Math.trunc(Number(amount));
    if (!Number.isFinite(delta) || player.stack + delta < 0) throw new Error("Enter a valid stack adjustment.");
    player.stack += delta;
    state.ledger.push({
      adjustment: true,
      completedAt: new Date().toISOString(),
      playerId,
      amount: delta,
      note: String(note).slice(0, 80),
      stacks: Object.fromEntries(state.players.map((entry) => [entry.id, entry.stack])),
    });
    return state;
  }

  function exportLedger(state) {
    return {
      exportedAt: new Date().toISOString(),
      settings: clone(state.settings),
      players: state.players.map(({ id, name }) => ({ id, name })),
      entries: clone(state.ledger),
      stacks: Object.fromEntries(state.players.map((player) => [player.name, player.stack])),
    };
  }

  function ledgerText(state) {
    const lines = ["Mixed Poker Ledger", ""];
    state.ledger.forEach((entry) => {
      if (entry.adjustment) {
        lines.push(entry.note + ": " + playerName(state, entry.playerId) + " " + signed(entry.amount));
        return;
      }
      const game = Catalog.getGame(entry.gameId);
      const net = state.players.map((player) => player.name + " " + signed(entry.net[player.id] || 0)).join(" · ");
      lines.push("Hand " + entry.handNumber + " · " + game.short + ": " + net);
    });
    lines.push("", "Stacks", ...state.players.map((player) => player.name + ": " + player.stack));
    return lines.join("\n");
  }

  function actionOrder(state, startSeat) {
    const order = activeOrderFrom(state, startSeat);
    return order.map((seat) => typeof seat === "number" ? state.players[seat] : seat)
      .filter((player) => player && !player.folded && !player.allIn && player.stack > 0)
      .map((player) => player.id);
  }

  function participantOrder(state, startSeat) {
    const result = [];
    for (let offset = 0; offset < state.players.length; offset += 1) {
      const player = state.players[(startSeat + offset) % state.players.length];
      if (!player.sittingOut && !player.folded) result.push(player.id);
    }
    return result;
  }

  function activeOrderFrom(state, startSeat) {
    const result = [];
    for (let offset = 0; offset < state.players.length; offset += 1) {
      const index = (startSeat + offset) % state.players.length;
      const player = state.players[index];
      if (!player.sittingOut && player.stack > 0) result.push(index);
    }
    return result;
  }

  function activePlayers(state) {
    return state.players.filter((player) => !player.sittingOut && player.stack > 0);
  }

  function remainingPlayers(state) {
    return state.players.filter((player) => !player.sittingOut && !player.folded);
  }

  function firstAfterButton(state) {
    return nextEligibleSeat(state, state.buttonIndex);
  }

  function nextEligibleSeat(state, fromSeat) {
    for (let offset = 1; offset <= state.players.length; offset += 1) {
      const index = (fromSeat + offset + state.players.length) % state.players.length;
      const player = state.players[index];
      if (!player.sittingOut && player.stack > 0) return index;
    }
    return 0;
  }

  function studOpener(state, game) {
    const razz = ["razz", "razz-27", "super-razzdeucey"].includes(game.id);
    const players = remainingPlayers(state).filter((player) => !player.allIn);
    players.sort((left, right) => visibleStudKey(right, razz) - visibleStudKey(left, razz));
    return players[0]?.seat ?? firstAfterButton(state);
  }

  function visibleStudKey(player, razz) {
    const ranks = player.up.map((id) => Eval.makeCard(id).rank === 14 && razz ? 1 : Eval.makeCard(id).rank);
    const counts = new Map();
    ranks.forEach((rank) => counts.set(rank, (counts.get(rank) || 0) + 1));
    const pairs = Array.from(counts, ([rank, count]) => ({ rank, count })).sort((a, b) => b.count - a.count || b.rank - a.rank);
    const highKey = (pairs[0]?.count || 0) * 10000 + packRanks(ranks.slice().sort((a, b) => b - a));
    return razz ? 1000000 - highKey : highKey;
  }

  function doorKey(player, razz) {
    const card = Eval.makeCard(player.up[0]);
    const rank = razz && card.rank === 14 ? 1 : card.rank;
    const suit = { c: 0, d: 1, h: 2, s: 3 }[card.suit];
    return razz ? rank * 4 + suit : (15 - rank) * 4 + (3 - suit);
  }

  function dealRounds(state, seatOrder, count, target) {
    for (let round = 0; round < count; round += 1) {
      seatOrder.forEach((seat) => state.players[seat][target].push(drawOne(state)));
    }
  }

  function dealBoardCards(state, count) {
    state.boards.forEach((board) => {
      for (let index = 0; index < count; index += 1) board.push(drawOne(state));
    });
  }

  function drawOne(state) {
    if (!state.deck.length) {
      if (!state.recyclableMuck.length) throw new Error("The deck is exhausted.");
      state.recycleCount += 1;
      state.deck = shuffle(state.recyclableMuck.splice(0), state.seed + "-recycle-" + state.handNumber + "-" + state.recycleCount);
    }
    return state.deck.pop();
  }

  function shuffledDeck(seed) {
    const deck = [];
    ["s", "h", "d", "c"].forEach((suit) => "AKQJT98765432".split("").forEach((rank) => deck.push(rank + suit)));
    return shuffle(deck, seed);
  }

  function shuffle(values, seed) {
    const random = seededRandom(seed);
    for (let index = values.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1));
      [values[index], values[target]] = [values[target], values[index]];
    }
    return values;
  }

  function seededRandom(seed) {
    let value = hashSeed(String(seed));
    return function random() {
      value += 0x6d2b79f5;
      let result = Math.imul(value ^ value >>> 15, 1 | value);
      result ^= result + Math.imul(result ^ result >>> 7, 61 | result);
      return ((result ^ result >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashSeed(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function resetPlayerForHand(player) {
    player.hole = [];
    player.down = [];
    player.up = [];
    player.discards = [];
    player.folded = player.sittingOut || player.stack <= 0;
    player.allIn = false;
    player.streetBet = 0;
    player.totalCommitted = 0;
    player.lastAction = "";
    player.evaluation = [];
    player.payout = 0;
  }

  function commit(player, requested) {
    const amount = Math.max(0, Math.min(player.stack, Math.trunc(Number(requested) || 0)));
    player.stack -= amount;
    player.streetBet += amount;
    player.totalCommitted += amount;
    if (player.stack === 0) player.allIn = true;
    return amount;
  }

  function potSize(state) {
    return state.players.reduce((total, player) => total + player.totalCommitted, 0);
  }

  function betSize(state) {
    const game = Catalog.getGame(state.gameId);
    if (game.structure !== "limit") return state.settings.bigBlind;
    if (game.format === "stud" || game.format === "super-stud") return state.streetIndex >= 5 ? state.settings.bigBet : state.settings.smallBet;
    return state.streetIndex >= 2 ? state.settings.bigBet : state.settings.smallBet;
  }

  function playerCards(player) {
    return player.hole.concat(player.down, player.up);
  }

  function playerById(state, id) {
    return state.players.find((player) => player.id === id);
  }

  function playerName(state, id) {
    return playerById(state, id)?.name || "Player";
  }

  function oddChipOrder(state, players) {
    const ids = new Set(players.map((player) => player.id));
    const ordered = activeOrderFrom(state, firstAfterButton(state)).map((seat) => state.players[seat]).filter((player) => ids.has(player.id));
    return ordered.length ? ordered : players;
  }

  function packRanks(ranks) {
    return ranks.slice(0, 5).reduce((total, rank) => total * 15 + rank, 0);
  }

  function ordinal(value) {
    const number = Number(value);
    if (number === 1) return "First";
    if (number === 2) return "Second";
    if (number === 3) return "Third";
    if (number === 4) return "Fourth";
    if (number === 5) return "Fifth";
    if (number === 6) return "Sixth";
    if (number === 7) return "Seventh";
    return String(number);
  }

  function randomSeed() {
    const values = new Uint32Array(2);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(values);
    else { values[0] = Date.now(); values[1] = Math.random() * 0xffffffff; }
    return values[0].toString(16) + values[1].toString(16);
  }

  function cleanName(value) {
    return String(value || "Player").trim().replace(/\s+/g, " ").slice(0, 24) || "Player";
  }

  function clampWhole(value, minimum, maximum, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
  }

  function signed(value) {
    const number = Number(value) || 0;
    return number > 0 ? "+" + number : String(number);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  return {
    DEFAULT_SETTINGS,
    act,
    adjustStack,
    buildSidePots,
    createTable,
    exportLedger,
    filterStateForPlayer,
    legalActions,
    ledgerText,
    normalizeSettings,
    potSize,
    settleShowdown,
    startHand,
    submitDraw,
    submitSuperDiscard,
  };
});
