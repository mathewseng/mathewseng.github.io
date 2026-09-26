(function (root, factory) {
  const api = factory();
  root.CardEvaluators = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Card basics
  // ---------------------------------------------------------------------------
  const RANK_VAL = { A: 14, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, "10": 10, J: 11, Q: 12, K: 13 };
  const RANK_CODE = { 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A", 1: "A" };
  const RANK_SHOW = { 1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10", 11: "J", 12: "Q", 13: "K", 14: "A" };
  const SUIT_IDX = { s: 0, h: 1, d: 2, c: 3 };
  const SUIT_CHARS = ["s", "h", "d", "c"];
  const SUIT_SYM = ["♠", "♥", "♦", "♣"];
  const SING = { 1: "Ace", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten", 11: "Jack", 12: "Queen", 13: "King", 14: "Ace" };
  const PLUR = { 1: "Aces", 2: "Twos", 3: "Threes", 4: "Fours", 5: "Fives", 6: "Sixes", 7: "Sevens", 8: "Eights", 9: "Nines", 10: "Tens", 11: "Jacks", 12: "Queens", 13: "Kings", 14: "Aces" };

  // Normalize one card. Returns { i, r, s } for standard, { i, joker }, { i, hidden } or { i, nonstd }.
  function norm(c, i) {
    if (!c || c.rank == null || c.rank === "") return { i, hidden: true };
    const rank = String(c.rank).toUpperCase();
    const suit = c.suit == null ? "" : String(c.suit).toLowerCase();
    if (rank === "JK" || rank === "JOKER") return { i, joker: true };
    const r = RANK_VAL[rank];
    const s = SUIT_IDX[suit];
    if (r && s !== undefined) return { i, r, s };
    return { i, nonstd: true };
  }

  function prep(cards, offset) {
    const out = { std: [], jokers: [], hidden: 0, nonstd: 0 };
    (cards || []).forEach((c, j) => {
      const n = norm(c, j + (offset || 0));
      if (n.hidden) out.hidden++;
      else if (n.joker) out.jokers.push(n);
      else if (n.nonstd) out.nonstd++;
      else out.std.push(n);
    });
    return out;
  }

  function stdLabel(r, s) {
    return RANK_SHOW[r] + SUIT_SYM[s];
  }
  function nLabel(n) {
    if (n.joker) return "Joker";
    if (n.hidden) return "??";
    return stdLabel(n.r, n.s);
  }

  function cardLabel(card) {
    const n = norm(card, 0);
    if (n.hidden) return "??";
    if (n.joker) return "Joker";
    if (n.nonstd) {
      const s = card.suit == null ? "" : String(card.suit);
      const sym = SUIT_IDX[s.toLowerCase()] !== undefined ? SUIT_SYM[SUIT_IDX[s.toLowerCase()]] : s && s !== "x" ? " " + s : "";
      return String(card.rank) + sym;
    }
    return stdLabel(n.r, n.s);
  }

  function parseCard(str) {
    if (str == null) return null;
    const t = String(str).trim();
    if (!t) return null;
    const up = t.toUpperCase();
    if (up === "JK" || up === "JOKER" || up === "JKX") return { rank: "JK", suit: "x" };
    const m = /^(10|[2-9TJQKA])([SHDC♠♥♦♣])$/i.exec(t);
    if (!m) return null;
    let rank = m[1].toUpperCase();
    if (rank === "10") rank = "T";
    const symMap = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
    const suit = symMap[m[2]] || m[2].toLowerCase();
    return { rank, suit };
  }
  function parseCards(str) {
    if (Array.isArray(str)) return str.map(parseCard).filter(Boolean);
    return String(str || "")
      .split(/[\s,]+/)
      .map(parseCard)
      .filter(Boolean);
  }

  function combos(n, k, fn) {
    if (k > n || k < 0) return;
    const idx = [];
    for (let i = 0; i < k; i++) idx.push(i);
    for (;;) {
      fn(idx);
      let i = k - 1;
      while (i >= 0 && idx[i] === n - k + i) i--;
      if (i < 0) return;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }

  function makeResult(o) {
    const r = {
      label: o.label,
      short: o.short || o.label,
      score: o.score,
      tone: o.tone || "neutral",
      used: o.used || [],
    };
    for (const key of Object.keys(o)) if (!(key in r) && o[key] !== undefined) r[key] = o[key];
    if (o.partial) r.partial = true;
    else delete r.partial;
    return r;
  }

  // ---------------------------------------------------------------------------
  // High-hand core: best 5-card (or partial) hand from rank counts, with k wilds.
  // ---------------------------------------------------------------------------
  const P16 = [1, 16, 256, 4096, 65536, 1048576];
  const CNT = new Int8Array(16);
  const SM = new Int32Array(4);
  const KK = [0, 0, 0, 0, 0];
  let R_CAT = 0;
  const R_TB = [0, 0, 0, 0, 0];
  let R_SUIT = -1;

  const SMASK = [];
  for (let top = 5; top <= 14; top++) {
    let m = 0;
    for (let r = top - 4; r <= top; r++) m |= 1 << (r === 1 ? 14 : r);
    SMASK[top] = m;
  }
  function popc(x) {
    let c = 0;
    while (x) {
      x &= x - 1;
      c++;
    }
    return c;
  }
  function bestStraight(mask, k, noWheel) {
    for (let top = 14; top >= 5; top--) {
      if (top === 5 && noWheel) break;
      if (5 - popc(mask & SMASK[top]) <= k) return top;
    }
    return 0;
  }
  function setRes(cat, a, b, c, d, e, suit) {
    R_CAT = cat;
    R_TB[0] = a;
    R_TB[1] = b;
    R_TB[2] = c;
    R_TB[3] = d;
    R_TB[4] = e;
    R_SUIT = suit;
    return cat * P16[5] + a * P16[4] + b * P16[3] + c * P16[2] + d * P16[1] + e;
  }
  // Fill KK[0..n-1] with best kickers excluding ranks ex1/ex2; kl leftover wilds count as top ranks.
  function kick(n, ex1, ex2, kl) {
    let f = 0;
    for (let r = 14; r >= 2 && f < n && kl > 0; r--) {
      if (r === ex1 || r === ex2) continue;
      KK[f++] = r;
      kl--;
    }
    for (let r = 14; r >= 2 && f < n; r--) {
      if (r === ex1 || r === ex2) continue;
      for (let c = CNT[r]; c > 0 && f < n; c--) KK[f++] = r;
    }
    for (let j = f; j < 5; j++) KK[j] = 0;
  }

  function highCore(rs, ss, len, k, noWheel) {
    CNT.fill(0);
    SM[0] = SM[1] = SM[2] = SM[3] = 0;
    let rm = 0;
    for (let i = 0; i < len; i++) {
      const r = rs[i];
      CNT[r]++;
      SM[ss[i]] |= 1 << r;
      rm |= 1 << r;
    }
    const total = len + k;
    const h = total < 5 ? total : 5;
    if (h === 0) return -1;
    if (h === 5) {
      for (let r = 14; r >= 2; r--) if (CNT[r] + k >= 5) return setRes(9, r, 0, 0, 0, 0, -1);
      let best = 0,
        bs = -1;
      for (let s = 0; s < 4; s++) {
        if (popc(SM[s]) + k >= 5) {
          const t = bestStraight(SM[s], k, noWheel);
          if (t > best) {
            best = t;
            bs = s;
          }
        }
      }
      if (best) return setRes(8, best, 0, 0, 0, 0, bs);
    }
    if (h >= 4) {
      for (let r = 14; r >= 2; r--) {
        if (CNT[r] + k >= 4) {
          const kl = k - Math.max(0, 4 - CNT[r]);
          kick(h - 4, r, 0, kl);
          return setRes(7, r, KK[0], 0, 0, 0, -1);
        }
      }
    }
    if (h === 5) {
      if (k === 0) {
        let t = 0;
        for (let r = 14; r >= 2; r--)
          if (CNT[r] >= 3) {
            t = r;
            break;
          }
        if (t) {
          for (let p = 14; p >= 2; p--) if (p !== t && CNT[p] >= 2) return setRes(6, t, p, 0, 0, 0, -1);
        }
      } else {
        for (let t = 14; t >= 2; t--) {
          const nt = Math.max(0, 3 - CNT[t]);
          if (nt > k) continue;
          for (let p = 14; p >= 2; p--) {
            if (p === t) continue;
            if (nt + Math.max(0, 2 - CNT[p]) <= k) return setRes(6, t, p, 0, 0, 0, -1);
          }
        }
      }
      // flush
      let bestV = -1,
        bestS = -1,
        bm = 0;
      for (let s = 0; s < 4; s++) {
        const pc = popc(SM[s]);
        if (pc + k < 5) continue;
        let m = SM[s];
        let add = k;
        for (let r = 14; r >= 2 && add > 0; r--)
          if (!(m & (1 << r))) {
            m |= 1 << r;
            add--;
          }
        let v = 0,
          f = 0;
        for (let r = 14; r >= 2 && f < 5; r--)
          if (m & (1 << r)) {
            v = v * 16 + r;
            f++;
          }
        if (v > bestV) {
          bestV = v;
          bestS = s;
          bm = m;
        }
      }
      if (bestS >= 0) {
        const t = [];
        for (let r = 14; r >= 2 && t.length < 5; r--) if (bm & (1 << r)) t.push(r);
        return setRes(5, t[0], t[1], t[2], t[3], t[4], bestS);
      }
      const st = bestStraight(rm, k, noWheel);
      if (st) return setRes(4, st, 0, 0, 0, 0, -1);
    }
    if (h >= 3) {
      for (let r = 14; r >= 2; r--) {
        if (CNT[r] + k >= 3) {
          const kl = k - Math.max(0, 3 - CNT[r]);
          kick(h - 3, r, 0, kl);
          return setRes(3, r, KK[0], KK[1], 0, 0, -1);
        }
      }
    }
    if (h >= 4) {
      if (k === 0) {
        let p1 = 0;
        for (let r = 14; r >= 2; r--) {
          if (CNT[r] >= 2) {
            if (!p1) p1 = r;
            else {
              kick(h - 4, p1, r, 0);
              return setRes(2, p1, r, KK[0], 0, 0, -1);
            }
          }
        }
      } else {
        for (let p1 = 14; p1 >= 3; p1--) {
          const n1 = Math.max(0, 2 - CNT[p1]);
          if (n1 > k) continue;
          for (let p2 = p1 - 1; p2 >= 2; p2--) {
            const n2 = Math.max(0, 2 - CNT[p2]);
            if (n1 + n2 <= k) {
              kick(h - 4, p1, p2, k - n1 - n2);
              return setRes(2, p1, p2, KK[0], 0, 0, -1);
            }
          }
        }
      }
    }
    if (h >= 2) {
      for (let r = 14; r >= 2; r--) {
        if (CNT[r] + k >= 2) {
          const kl = k - Math.max(0, 2 - CNT[r]);
          kick(h - 2, r, 0, kl);
          return setRes(1, r, KK[0], KK[1], KK[2], 0, -1);
        }
      }
    }
    kick(h, 0, 0, k);
    return setRes(0, KK[0], KK[1], KK[2], KK[3], KK[4], -1);
  }

  const CAT_SHORT = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush", "Five of a kind"];

  function pokerLabel(cat, tb) {
    switch (cat) {
      case 0:
        return tb[0] ? `High card, ${SING[tb[0]]}` : "High card";
      case 1:
        return `Pair of ${PLUR[tb[0]]}`;
      case 2:
        return `Two pair, ${PLUR[tb[0]]} and ${PLUR[tb[1]]}`;
      case 3:
        return `Three of a kind, ${PLUR[tb[0]]}`;
      case 4:
        return `Straight, ${SING[tb[0]]} high`;
      case 5:
        return `Flush, ${SING[tb[0]]} high`;
      case 6:
        return `Full house, ${PLUR[tb[0]]} full of ${PLUR[tb[1]]}`;
      case 7:
        return `Four of a kind, ${PLUR[tb[0]]}`;
      case 8:
        return tb[0] === 14 ? "Royal flush" : `Straight flush, ${SING[tb[0]]} high`;
      case 9:
        return `Five of a kind, ${PLUR[tb[0]]}`;
    }
    return "";
  }
  function pokerShort(cat, tb) {
    if (cat === 8 && tb[0] === 14) return "Royal flush";
    return CAT_SHORT[cat];
  }

  function straightRanks(top) {
    const out = [];
    for (let r = top; r > top - 5; r--) out.push(r === 1 ? 14 : r);
    return out;
  }
  // Which (rank, suit) the best hand uses, in display order.
  function neededCards(cat, tb, suit) {
    const need = [];
    const add = (r, n, s) => {
      for (let j = 0; j < n; j++) if (r) need.push({ r, s: s == null ? -1 : s });
    };
    switch (cat) {
      case 9:
        add(tb[0], 5);
        break;
      case 8:
        straightRanks(tb[0]).forEach((r) => add(r, 1, suit));
        break;
      case 7:
        add(tb[0], 4);
        add(tb[1], 1);
        break;
      case 6:
        add(tb[0], 3);
        add(tb[1], 2);
        break;
      case 5:
        tb.forEach((r) => add(r, 1, suit));
        break;
      case 4:
        straightRanks(tb[0]).forEach((r) => add(r, 1));
        break;
      case 3:
        add(tb[0], 3);
        add(tb[1], 1);
        add(tb[2], 1);
        break;
      case 2:
        add(tb[0], 2);
        add(tb[1], 2);
        add(tb[2], 1);
        break;
      case 1:
        add(tb[0], 2);
        add(tb[1], 1);
        add(tb[2], 1);
        add(tb[3], 1);
        break;
      default:
        tb.forEach((r) => add(r, 1));
    }
    return need;
  }
  function pickCards(need, std, jokers) {
    const usedSet = new Set();
    const picked = [];
    for (const nd of need) {
      let found = null;
      for (const c of std) {
        if (usedSet.has(c.i)) continue;
        if (c.r === nd.r && (nd.s < 0 || c.s === nd.s)) {
          found = c;
          break;
        }
      }
      if (!found) for (const j of jokers) if (!usedSet.has(j.i)) {
        found = j;
        break;
      }
      if (found) {
        usedSet.add(found.i);
        picked.push(found);
      }
    }
    return picked;
  }

  // Evaluate a set of normalized cards (std + wild jokers) as a high hand.
  function highFromNorm(std, jokers, noWheel) {
    const rs = std.map((c) => c.r);
    const ss = std.map((c) => c.s);
    const score = highCore(rs, ss, std.length, jokers.length, noWheel);
    if (score < 0) return null;
    return { score, cat: R_CAT, tb: R_TB.slice(), suit: R_SUIT, std, jokers };
  }

  function highResultFrom(best, extra) {
    const picked = pickCards(neededCards(best.cat, best.tb, best.suit), best.std, best.jokers);
    const n = best.std.length + best.jokers.length;
    const label = pokerLabel(best.cat, best.tb);
    return makeResult(
      Object.assign(
        {
          label,
          short: pokerShort(best.cat, best.tb),
          detail: picked.map(nLabel).join(" "),
          score: best.score,
          used: picked.map((c) => c.i),
          category: best.cat,
          handSize: Math.min(5, n),
          tone: best.cat >= 4 ? "good" : "neutral",
        },
        extra || {}
      )
    );
  }

  function splitBoard(result, handLen) {
    result.usedBoard = result.used.filter((i) => i >= handLen).map((i) => i - handLen);
    return result;
  }

  function evalPokerHigh(cards, ctx) {
    const board = Array.isArray(ctx.board) ? ctx.board : [];
    const all = cards.concat(board);
    const p = prep(all);
    const jokers = ctx.jokersWild ? p.jokers : [];
    const best = highFromNorm(p.std, jokers, false);
    if (!best) return null;
    const res = highResultFrom(best, { partial: p.hidden > 0 });
    if (board.length) splitBoard(res, cards.length);
    return res;
  }

  function evalOmaha(cards, ctx) {
    const board = Array.isArray(ctx.board) ? ctx.board : [];
    const ph = prep(cards);
    const pb = prep(board, cards.length);
    const wild = !!ctx.jokersWild;
    const hole = wild ? ph.std.concat(ph.jokers) : ph.std;
    const bd = wild ? pb.std.concat(pb.jokers) : pb.std;
    if (hole.length < 2 || bd.length < 3) return null;
    let best = null;
    combos(hole.length, 2, (hi) => {
      combos(bd.length, 3, (bi) => {
        const set = [hole[hi[0]], hole[hi[1]], bd[bi[0]], bd[bi[1]], bd[bi[2]]];
        const std = set.filter((c) => !c.joker);
        const jk = set.filter((c) => c.joker);
        const r = highFromNorm(std, jk, false);
        if (r && (!best || r.score > best.score)) best = r;
      });
    });
    const res = highResultFrom(best, { partial: ph.hidden + pb.hidden > 0 });
    return splitBoard(res, cards.length);
  }

  // ---------------------------------------------------------------------------
  // Lowball
  // ---------------------------------------------------------------------------
  // Ace-to-five key for up-to-5 ranks (A=1). Lower is better.
  function lowA5Key(ranks) {
    const cnt = {};
    ranks.forEach((r) => (cnt[r] = (cnt[r] || 0) + 1));
    const groups = Object.keys(cnt)
      .map((r) => ({ r: +r, c: cnt[r] }))
      .sort((a, b) => b.c - a.c || b.r - a.r);
    const pattern = groups.map((g) => g.c).join("");
    const CAT = { 1: 0, 11: 0, 111: 0, 1111: 0, 11111: 0, 2: 1, 21: 1, 211: 1, 2111: 1, 22: 2, 221: 2, 3: 3, 31: 3, 311: 3, 32: 4, 4: 5, 41: 5, 5: 6 };
    const cat = CAT[pattern] != null ? CAT[pattern] : 6;
    let tb = 0;
    const order = [];
    groups.forEach((g) => order.push(g.r));
    for (let j = 0; j < 5; j++) tb = tb * 16 + (order[j] || 0);
    const missing = 5 - ranks.length;
    return { key: (missing * 8 + cat) * P16[5] + tb, cat, groups, missing };
  }

  function evalLowA5(cards, ctx, eightOrBetter) {
    const board = Array.isArray(ctx.board) ? ctx.board : [];
    const p = prep(cards.concat(board));
    const pool = ctx.jokersWild ? p.std.concat(p.jokers) : p.std;
    if (!pool.length) return null;
    const m = Math.min(5, pool.length);
    let best = null;
    combos(pool.length, m, (idx) => {
      const set = idx.map((j) => pool[j]);
      const ranks = [];
      let jk = 0;
      set.forEach((c) => (c.joker ? jk++ : ranks.push(c.r === 14 ? 1 : c.r)));
      const shown = ranks.slice();
      for (let r = 1; r <= 13 && jk > 0; r++)
        if (ranks.indexOf(r) < 0) {
          ranks.push(r);
          jk--;
        }
      while (jk-- > 0) ranks.push(1);
      const k = lowA5Key(ranks);
      if (!best || k.key < best.key) best = Object.assign(k, { set, ranks, shown });
    });
    const desc = best.ranks.slice().sort((a, b) => b - a);
    const qual = best.missing === 0 && best.cat === 0 && desc[0] <= 8;
    let label, short;
    if (best.cat === 0) {
      const seq = desc.map((r) => RANK_SHOW[r]).join("-");
      if (best.missing) {
        label = `${seq} (${best.ranks.length} card${best.ranks.length === 1 ? "" : "s"})`;
        short = seq;
      } else if (desc.join() === "5,4,3,2,1") {
        label = "Wheel (5-4-3-2-A)";
        short = "Wheel";
      } else {
        label = `${seq} low`;
        short = `${RANK_SHOW[desc[0]]}-${RANK_SHOW[desc[1]]} low`;
      }
    } else {
      const g = best.groups;
      const pl = (r) => RANK_SHOW[r] + "s";
      const names = { 1: `Pair of ${pl(g[0].r)} low`, 2: `Two pair, ${pl(g[0].r)} & ${pl(g[1].r)}`, 3: `Trips ${pl(g[0].r)}`, 4: `Full house, ${pl(g[0].r)}`, 5: `Quads ${pl(g[0].r)}`, 6: `Five ${pl(g[0].r)}` };
      label = names[best.cat];
      short = label;
      if (best.missing) label += ` (${best.ranks.length} cards)`;
    }
    const used = best.set.map((c) => c.i);
    const detail = best.set.map(nLabel).join(" ");
    const res = {
      label,
      short,
      detail,
      score: -best.key,
      used,
      qualifies: qual,
      tone: qual ? "good" : best.cat > 0 ? "bad" : "neutral",
      partial: p.hidden > 0,
    };
    if (eightOrBetter && !qual) {
      res.label = "No low";
      res.short = "No low";
      res.detail = (label + " · " + detail).trim();
      res.score = -1e12;
      res.tone = "bad";
    }
    const out = makeResult(res);
    if (board.length) splitBoard(out, cards.length);
    return out;
  }

  function eval27(cards, ctx) {
    const p = prep(cards.concat(Array.isArray(ctx.board) ? ctx.board : []));
    const pool = p.std;
    if (!pool.length) return null;
    const m = Math.min(5, pool.length);
    let best = null;
    combos(pool.length, m, (idx) => {
      const set = idx.map((j) => pool[j]);
      const r = highFromNorm(set, [], true);
      const key = (5 - m) * P16[5] * 16 + r.score;
      if (!best || key < best.key) best = Object.assign(r, { key, set });
    });
    const desc = best.set.map((c) => c.r).sort((a, b) => b - a);
    const seq = desc.map((r) => RANK_SHOW[r]).join("-");
    let label, short;
    const tone = best.cat === 0 ? (m === 5 && desc[0] <= 8 ? "good" : "neutral") : "bad";
    if (best.cat === 0) {
      if (m < 5) {
        label = `${seq} (${m} card${m === 1 ? "" : "s"})`;
        short = seq;
      } else if (seq === "7-5-4-3-2") {
        label = "Number one (7-5-4-3-2)";
        short = "7-5 low";
      } else {
        label = `${RANK_SHOW[desc[0]]}-${RANK_SHOW[desc[1]]} low`;
        short = label;
      }
    } else {
      label = pokerLabel(best.cat, best.tb);
      short = CAT_SHORT[best.cat];
      if (m < 5) label += ` (${m} cards)`;
    }
    const res = makeResult({
      label,
      short,
      detail: best.cat === 0 ? seq : best.set.map(nLabel).join(" "),
      score: -best.key,
      used: best.set.map((c) => c.i),
      tone,
      partial: p.hidden > 0,
    });
    if (Array.isArray(ctx.board) && ctx.board.length) splitBoard(res, cards.length);
    return res;
  }

  function evalBadugi(cards) {
    const p = prep(cards);
    const pool = p.std;
    if (!pool.length) return null;
    let best = null;
    const maxK = Math.min(4, pool.length);
    for (let k = maxK; k >= 1 && !best; k--) {
      combos(pool.length, k, (idx) => {
        const set = idx.map((j) => pool[j]);
        const suits = new Set(set.map((c) => c.s));
        const ranks = set.map((c) => (c.r === 14 ? 1 : c.r));
        if (suits.size !== k || new Set(ranks).size !== k) return;
        const desc = ranks.slice().sort((a, b) => b - a);
        let num = 0;
        for (let j = 0; j < 4; j++) num = num * 16 + (desc[j] || 0);
        const score = k * 65536 - num;
        if (!best || score > best.score) best = { score, set, desc, k };
      });
    }
    const seq = best.desc.map((r) => RANK_SHOW[r]).join("-");
    return makeResult({
      label: best.k === 4 ? `4-card badugi ${seq}` : `${best.k}-card ${seq}`,
      short: best.k === 4 ? `Badugi ${seq}` : `${best.k}-card`,
      detail: best.set.map(nLabel).join(" "),
      score: best.score,
      value: best.k,
      used: best.set.map((c) => c.i),
      qualifies: best.k === 4,
      tone: best.k === 4 ? "good" : "neutral",
      partial: p.hidden > 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Casino
  // ---------------------------------------------------------------------------
  function evalBlackjack(cards, ctx) {
    const p = prep(cards);
    if (!p.std.length) return null;
    let total = 0,
      aces = 0;
    p.std.forEach((c) => {
      if (c.r === 14) {
        aces++;
        total += 1;
      } else total += Math.min(10, c.r);
    });
    const soft = aces > 0 && total + 10 <= 21;
    const best = soft ? total + 10 : total;
    const n = p.std.length;
    const used = p.std.map((c) => c.i);
    const partial = p.hidden > 0;
    if (best > 21) return makeResult({ label: `Bust (${best})`, short: "Bust", score: -1, value: best, used, bust: true, tone: "bad", partial });
    if (n === 2 && best === 21 && !partial) return makeResult({ label: "Blackjack!", short: "Blackjack", score: 100, value: 21, used, tone: "good", blackjack: true, partial });
    if (ctx.charlie && n >= ctx.charlie)
      return makeResult({ label: `${ctx.charlie}-card Charlie`, short: "Charlie", detail: `${soft ? "Soft" : "Hard"} ${best}`, score: 50, value: best, used, tone: "win", partial });
    return makeResult({ label: `${soft ? "Soft" : "Hard"} ${best}`, short: String(best), score: best, value: best, used, soft, tone: best === 21 ? "good" : "neutral", partial });
  }

  function evalBaccarat(cards) {
    const p = prep(cards);
    if (!p.std.length) return null;
    let sum = 0;
    p.std.forEach((c) => (sum += c.r === 14 ? 1 : c.r >= 10 ? 0 : c.r));
    const pts = sum % 10;
    const natural = p.std.length === 2 && pts >= 8 && !p.hidden;
    return makeResult({
      label: natural ? `Natural ${pts}` : `${pts} point${pts === 1 ? "" : "s"}`,
      short: natural ? `Natural ${pts}` : String(pts),
      score: pts,
      value: pts,
      used: p.std.map((c) => c.i),
      natural,
      tone: natural ? "good" : "neutral",
      partial: p.hidden > 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Cribbage
  // ---------------------------------------------------------------------------
  const cribVal = (r) => (r === 14 ? 1 : Math.min(10, r));
  const cribRank = (r) => (r === 14 ? 1 : r);

  function countFifteens(vals, skip) {
    const ways = new Array(16).fill(0);
    ways[0] = 1;
    vals.forEach((v, j) => {
      if (j === skip) return;
      for (let s = 15; s >= v; s--) ways[s] += ways[s - v];
    });
    return ways[15];
  }

  function evalCribHand(cards, ctx) {
    const p = prep(cards);
    let partial = p.hidden > 0;
    let starter = null;
    if (ctx.starter) {
      const s = norm(ctx.starter, -1);
      if (s.hidden) partial = true;
      else if (!s.joker && !s.nonstd) starter = s;
    }
    const hand = p.std;
    if (!hand.length && !starter) return null;
    const all = starter ? hand.concat([starter]) : hand.slice();
    const vals = all.map((c) => cribVal(c.r));
    const breakdown = [];
    const contrib = new Set();
    // Fifteens
    const f = countFifteens(vals, -1);
    if (f) {
      breakdown.push({ label: `Fifteens (${f})`, points: f * 2, kind: "fifteens" });
      all.forEach((c, j) => {
        if (countFifteens(vals, j) < f) contrib.add(c.i);
      });
    }
    // Pairs
    const byRank = {};
    all.forEach((c) => (byRank[cribRank(c.r)] = byRank[cribRank(c.r)] || []).push(c));
    let pairs = 0;
    Object.values(byRank).forEach((g) => {
      if (g.length >= 2) {
        pairs += (g.length * (g.length - 1)) / 2;
        g.forEach((c) => contrib.add(c.i));
      }
    });
    if (pairs) breakdown.push({ label: `Pair${pairs === 1 ? "" : "s"} ×${pairs}`, points: pairs * 2, kind: "pairs" });
    // Runs
    let runPts = 0;
    for (let r = 1; r <= 13; ) {
      if (!byRank[r]) {
        r++;
        continue;
      }
      let e = r;
      while (e + 1 <= 13 && byRank[e + 1]) e++;
      const len = e - r + 1;
      if (len >= 3) {
        let mult = 1;
        for (let q = r; q <= e; q++) {
          mult *= byRank[q].length;
          byRank[q].forEach((c) => contrib.add(c.i));
        }
        const names = { 1: "", 2: "Double run", 3: "Triple run", 4: "Double-double run" };
        const lbl = mult === 1 ? `Run of ${len}` : names[mult] ? `${names[mult]} of ${len}` : `Run of ${len} ×${mult}`;
        breakdown.push({ label: lbl, points: len * mult, kind: "runs" });
        runPts += len * mult;
      }
      r = e + 1;
    }
    // Flush
    if (hand.length >= 4 && hand.every((c) => c.s === hand[0].s)) {
      const starterMatch = starter && starter.s === hand[0].s;
      let pts = 0;
      if (ctx.isCrib) pts = starterMatch ? hand.length + 1 : 0;
      else pts = hand.length + (starterMatch ? 1 : 0);
      if (pts) {
        breakdown.push({ label: "Flush", points: pts, kind: "flush" });
        hand.forEach((c) => contrib.add(c.i));
      }
    }
    // Nobs
    if (starter) {
      const nob = hand.find((c) => c.r === 11 && c.s === starter.s);
      if (nob) {
        breakdown.push({ label: "Nobs", points: 1, kind: "nobs" });
        contrib.add(nob.i);
      }
    }
    const total = breakdown.reduce((a, b) => a + b.points, 0);
    const sumKind = (k) => breakdown.filter((b) => b.kind === k).reduce((a, b) => a + b.points, 0);
    const parts = [];
    if (sumKind("fifteens")) parts.push(`15s ${sumKind("fifteens")}`);
    if (pairs) parts.push(`pairs ${pairs * 2}`);
    if (runPts) parts.push(`runs ${runPts}`);
    if (sumKind("flush")) parts.push(`flush ${sumKind("flush")}`);
    if (sumKind("nobs")) parts.push("nobs 1");
    const used = [...contrib].filter((i) => i >= 0).sort((a, b) => a - b);
    return makeResult({
      label: total === 29 ? "29! Perfect hand" : `${total} point${total === 1 ? "" : "s"}`,
      short: String(total),
      detail: parts.length ? parts.join(" · ") : "Nothing",
      score: total,
      value: total,
      used,
      usedStarter: !!starter && contrib.has(-1),
      breakdown: breakdown.map((b) => ({ label: b.label, points: b.points })),
      tone: total >= 12 ? "good" : total === 0 ? "bad" : "neutral",
      partial,
    });
  }

  function evalPegging(cards) {
    const p = prep(cards);
    const seq = p.std;
    if (!seq.length) return null;
    let seg = [];
    let total = 0;
    seq.forEach((c) => {
      const v = cribVal(c.r);
      if (total === 31 || total + v > 31) {
        seg = [];
        total = 0;
      }
      seg.push(c);
      total += v;
    });
    let pts = 0;
    const reasons = [];
    let used = new Set([seg[seg.length - 1].i]);
    if (total === 15) {
      pts += 2;
      reasons.push("15");
      seg.forEach((c) => used.add(c.i));
    }
    if (total === 31) {
      pts += 2;
      reasons.push("31");
      seg.forEach((c) => used.add(c.i));
    }
    const last = seg[seg.length - 1];
    let same = 1;
    for (let j = seg.length - 2; j >= 0 && seg[j].r === last.r; j--) same++;
    if (same >= 2) {
      const pp = { 2: 2, 3: 6, 4: 12 }[Math.min(same, 4)];
      pts += pp;
      reasons.push({ 2: "pair", 3: "pair royal", 4: "double pair royal" }[Math.min(same, 4)]);
      seg.slice(seg.length - Math.min(same, 4)).forEach((c) => used.add(c.i));
    }
    for (let k = seg.length; k >= 3; k--) {
      const tail = seg.slice(seg.length - k).map((c) => cribRank(c.r));
      const set = new Set(tail);
      if (set.size !== k) continue;
      if (Math.max(...tail) - Math.min(...tail) === k - 1) {
        pts += k;
        reasons.push(`run of ${k}`);
        seg.slice(seg.length - k).forEach((c) => used.add(c.i));
        break;
      }
    }
    const label = `Count ${total}` + (pts ? ` · last play +${pts} (${reasons.join(", ")})` : "");
    return makeResult({
      label,
      short: pts ? `${total} · +${pts}` : `Count ${total}`,
      detail: seg.map(nLabel).join(" "),
      score: pts,
      value: pts,
      count: total,
      used: [...used].sort((a, b) => a - b),
      tone: pts ? "good" : "neutral",
      partial: p.hidden > 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Rummy
  // ---------------------------------------------------------------------------
  function evalGin(cards) {
    const p = prep(cards);
    const cs = p.std.slice(0, 30).map((c) => ({ i: c.i, r: cribRank(c.r), s: c.s, v: cribVal(c.r), c }));
    if (!cs.length) return null;
    const n = cs.length;
    const melds = [];
    // sets
    const byRank = {};
    cs.forEach((c, j) => (byRank[c.r] = byRank[c.r] || []).push(j));
    Object.values(byRank).forEach((g) => {
      for (let k = 3; k <= Math.min(4, g.length); k++)
        combos(g.length, k, (idx) => {
          let m = 0;
          idx.forEach((q) => (m |= 1 << g[q]));
          melds.push({ mask: m, type: "set" });
        });
    });
    // runs
    for (let s = 0; s < 4; s++) {
      const at = {};
      cs.forEach((c, j) => {
        if (c.s === s) (at[c.r] = at[c.r] || []).push(j);
      });
      for (let start = 1; start <= 11; start++) {
        if (!at[start]) continue;
        let choices = at[start].map((j) => 1 << j);
        for (let e = start + 1; e <= 13 && at[e]; e++) {
          const next = [];
          choices.forEach((m) => at[e].forEach((j) => next.push(m | (1 << j))));
          choices = next;
          if (e - start + 1 >= 3) choices.forEach((m) => melds.push({ mask: m, type: "run" }));
        }
      }
    }
    const meldsOf = [];
    for (let j = 0; j < n; j++) meldsOf.push(melds.filter((m) => m.mask & (1 << j)));
    const memo = new Map();
    function solve(mask) {
      if (mask === 0) return { dw: 0, melds: [] };
      if (memo.has(mask)) return memo.get(mask);
      let j = 0;
      while (!(mask & (1 << j))) j++;
      const rest = solve(mask & ~(1 << j));
      let best = { dw: rest.dw + cs[j].v, melds: rest.melds };
      for (const m of meldsOf[j]) {
        if ((m.mask & mask) !== m.mask) continue;
        const r = solve(mask & ~m.mask);
        if (r.dw < best.dw) best = { dw: r.dw, melds: [m].concat(r.melds) };
      }
      memo.set(mask, best);
      return best;
    }
    const full = n >= 30 ? 0x3fffffff : (1 << n) - 1;
    const best = solve(full);
    let meldedMask = 0;
    best.melds.forEach((m) => (meldedMask |= m.mask));
    const idxOf = (m) => cs.map((c, j) => (m & (1 << j) ? j : -1)).filter((j) => j >= 0);
    const meldText = best.melds.map((m) => {
      const js = idxOf(m.mask).sort((a, b) => cs[a].r - cs[b].r);
      if (m.type === "run") return js.map((j) => stdLabel(cs[j].r, cs[j].s)).join("");
      const rk = RANK_SHOW[cs[js[0]].r];
      return js.map(() => rk).join(rk.length > 1 ? " " : "");
    });
    const dead = cs.filter((c, j) => !(meldedMask & (1 << j)));
    const dw = best.dw;
    let label, tone;
    if (dw === 0 && n >= 11) {
      label = "Big gin";
      tone = "win";
    } else if (dw === 0) {
      label = "Gin!";
      tone = "win";
    } else {
      label = `Deadwood ${dw}`;
      tone = dw <= 10 ? "good" : "neutral";
    }
    const detailParts = meldText.slice();
    if (dead.length) detailParts.push("dw " + dead.map((c) => stdLabel(c.r, c.s)).join(" "));
    return makeResult({
      label,
      short: dw === 0 ? label.replace("!", "") : `DW ${dw}`,
      detail: detailParts.join(" · "),
      score: -dw,
      value: dw,
      used: cs.filter((c, j) => meldedMask & (1 << j)).map((c) => c.i),
      melds: best.melds.map((m) => ({ type: m.type, cards: idxOf(m.mask).map((j) => cs[j].i) })),
      tone,
      partial: p.hidden > 0,
    });
  }

  // ---------------------------------------------------------------------------
  // Open-face Chinese poker
  // ---------------------------------------------------------------------------
  function ofcRoyalty(row, cat, tb) {
    if (row === "top") {
      if (cat === 1 && tb[0] >= 6) return tb[0] - 5;
      if (cat === 3) return tb[0] + 8;
      return 0;
    }
    const royal = cat === 8 && tb[0] === 14;
    if (row === "middle") {
      if (cat === 9 || royal) return 50;
      return { 3: 2, 4: 4, 5: 8, 6: 12, 7: 20, 8: 30 }[cat] || 0;
    }
    if (cat === 9 || royal) return 25;
    return { 4: 2, 5: 4, 6: 6, 7: 10, 8: 15 }[cat] || 0;
  }
  function evalOfc(row) {
    const size = row === "top" ? 3 : 5;
    return function (cards, ctx) {
      const p = prep(cards);
      const jokers = ctx.jokersWild ? p.jokers : [];
      const best = highFromNorm(p.std, jokers, false);
      if (!best) return null;
      const res = highResultFrom(best, { partial: p.hidden > 0 });
      const n = p.std.length + jokers.length + p.hidden;
      const roy = ofcRoyalty(row, best.cat, best.tb);
      const incomplete = n < size;
      res.value = roy;
      res.royalty = roy;
      res.label = res.label + (roy ? ` · +${roy}` : "") + (incomplete ? " (incomplete)" : "");
      res.short = res.short + (roy ? ` +${roy}` : "");
      if (incomplete) res.incomplete = true;
      res.tone = roy ? "good" : "neutral";
      return res;
    };
  }

  // ---------------------------------------------------------------------------
  // Trick-taking
  // ---------------------------------------------------------------------------
  function evalHearts(cards) {
    const p = prep(cards);
    if (!p.std.length) return null;
    let pts = 0;
    const used = [];
    p.std.forEach((c) => {
      if (c.s === 1) {
        pts += 1;
        used.push(c.i);
      } else if (c.s === 0 && c.r === 12) {
        pts += 13;
        used.push(c.i);
      }
    });
    return makeResult({ label: `Points ${pts}`, short: String(pts), score: -pts, value: pts, used, tone: pts === 0 ? "good" : pts >= 13 ? "bad" : "neutral", partial: p.hidden > 0 });
  }

  function evalTrick(cards, ctx) {
    const p = prep(cards);
    if (!p.std.length) return null;
    const led = p.std[0].s;
    const trump = ctx.trump != null && SUIT_IDX[String(ctx.trump).toLowerCase()] !== undefined ? SUIT_IDX[String(ctx.trump).toLowerCase()] : -1;
    let win = null;
    let wv = -1;
    p.std.forEach((c) => {
      const v = c.s === trump ? 100 + c.r : c.s === led ? c.r : -1;
      if (v > wv) {
        wv = v;
        win = c;
      }
    });
    const byTrump = win.s === trump && trump !== led;
    return makeResult({
      label: `${stdLabel(win.r, win.s)} wins (${byTrump ? "trump" : "led"} ${SUIT_SYM[byTrump ? trump : led]})`,
      short: `${stdLabel(win.r, win.s)} wins`,
      score: wv,
      winnerIndex: win.i,
      used: [win.i],
      tone: "win",
      partial: p.hidden > 0,
    });
  }

  // ---------------------------------------------------------------------------
  // General
  // ---------------------------------------------------------------------------
  function evalPipSum(cards, ctx) {
    const p = prep(cards);
    if (!p.std.length) return null;
    let sum = 0;
    p.std.forEach((c) => {
      if (c.r === 14) sum += ctx.aceHigh ? 11 : 1;
      else if (c.r > 10) sum += ctx.faceTen ? 10 : c.r;
      else sum += c.r;
    });
    return makeResult({ label: `Sum ${sum}`, short: String(sum), score: sum, value: sum, used: p.std.map((c) => c.i), partial: p.hidden > 0 });
  }

  function evalSetSummary(cards) {
    const p = prep(cards);
    const n = p.std.length + p.jokers.length;
    if (!n) return null;
    const byRank = {};
    p.std.forEach((c) => (byRank[c.r] = byRank[c.r] || []).push(c));
    const ranks = Object.keys(byRank)
      .map(Number)
      .sort((a, b) => b - a);
    const used = [];
    const groupNames = [
      [4, "Quads"],
      [3, "Trips"],
      [2, "Pairs"],
    ];
    const parts = [];
    groupNames.forEach(([k, name]) => {
      const rs = ranks.filter((r) => (k === 4 ? byRank[r].length >= 4 : byRank[r].length === k));
      if (rs.length) {
        parts.push(`${rs.length === 1 && k === 2 ? "Pair" : name}: ${rs.map((r) => RANK_SHOW[r]).join(", ")}`);
        rs.forEach((r) => byRank[r].forEach((c) => used.push(c.i)));
      }
    });
    const sc = [0, 0, 0, 0];
    p.std.forEach((c) => sc[c.s]++);
    let ls = 0;
    for (let s = 1; s < 4; s++) if (sc[s] > sc[ls]) ls = s;
    if (p.std.length) parts.push(`Longest suit ${SUIT_SYM[ls]}×${sc[ls]}`);
    if (!used.length) parts.unshift("No pairs");
    const detail = SUIT_SYM.map((sym, s) => `${sym}${sc[s]}`).join(" ") + (p.jokers.length ? ` · Jokers ${p.jokers.length}` : "") + (p.nonstd ? ` · Other ${p.nonstd}` : "");
    return makeResult({ label: parts.join(" · "), short: `${n} cards`, detail, score: n, value: n, used: used.sort((a, b) => a - b), suitCounts: { s: sc[0], h: sc[1], d: sc[2], c: sc[3] }, partial: p.hidden > 0 });
  }

  function evalHighCard(cards, ctx) {
    const p = prep(cards);
    let best = null,
      bv = -1;
    const cand = p.std.concat(p.jokers);
    if (!cand.length) return null;
    cand.forEach((c) => {
      const v = c.joker ? 15 * 4 : c.r * 4 + (ctx.suitOrder ? 3 - c.s : 0);
      if (v > bv) {
        bv = v;
        best = c;
      }
    });
    const name = best.joker ? "Joker" : stdLabel(best.r, best.s);
    return makeResult({ label: `${name} high`, short: name, score: bv, used: [best.i], partial: p.hidden > 0 });
  }

  function evalCount(cards) {
    const n = (cards || []).length;
    if (!n) return null;
    return makeResult({ label: `${n} card${n === 1 ? "" : "s"}`, short: String(n), score: n, value: n, used: cards.map((c, j) => j) });
  }

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------
  const DEFS = [
    ["poker-high", "Poker (high)", "High", "Poker", "Best 5-card poker hand from the group plus any linked board.", { usesBoard: true }, evalPokerHigh],
    ["poker-omaha", "Omaha (high)", "Omaha", "Poker", "Exactly 2 hole cards plus exactly 3 board cards.", { usesBoard: true }, evalOmaha],
    ["ofc-top", "OFC top row", "OFC top", "Poker", "Open-face Chinese top row (3 cards) with royalties.", {}, evalOfc("top")],
    ["ofc-middle", "OFC middle row", "OFC mid", "Poker", "Open-face Chinese middle row (5 cards) with royalties.", {}, evalOfc("middle")],
    ["ofc-bottom", "OFC bottom row", "OFC bot", "Poker", "Open-face Chinese bottom row (5 cards) with royalties.", {}, evalOfc("bottom")],
    ["low-a5", "Ace-to-five low", "A-5 low", "Lowball", "Best 5-card low; aces low, straights and flushes ignored.", { usesBoard: true }, (c, x) => evalLowA5(c, x, false)],
    ["low-a5-8", "A-5 low, 8 or better", "8-low", "Lowball", "Ace-to-five low that only qualifies with 8-high or better.", { usesBoard: true }, (c, x) => evalLowA5(c, x, true)],
    ["low-27", "Deuce-to-seven low", "2-7 low", "Lowball", "Aces high; straights and flushes count against you.", {}, eval27],
    ["badugi", "Badugi", "Badugi", "Lowball", "Best set of distinct suits and ranks (up to 4), aces low.", {}, evalBadugi],
    ["blackjack", "Blackjack total", "BJ", "Casino", "Hand total with soft aces; blackjack, bust and Charlie.", {}, evalBlackjack],
    ["baccarat", "Baccarat points", "Bacc", "Casino", "Sum mod 10; faces and tens count zero.", {}, evalBaccarat],
    ["cribbage-hand", "Cribbage hand", "Crib", "Cribbage", "Fifteens, pairs, runs, flush and nobs with the starter.", { usesStarter: true }, evalCribHand],
    ["cribbage-pegging", "Cribbage pegging", "Peg", "Cribbage", "Running count and points for the last card played.", {}, evalPegging],
    ["gin-deadwood", "Gin rummy deadwood", "Gin", "Rummy", "Optimal melds (sets and same-suit runs) minimizing deadwood.", {}, evalGin],
    ["hearts-points", "Hearts points", "Hearts", "Trick-taking", "Each heart 1, queen of spades 13.", {}, evalHearts],
    ["trick", "Trick winner", "Trick", "Trick-taking", "Highest trump, else highest card of the led suit.", {}, evalTrick],
    ["pip-sum", "Pip sum", "Sum", "General", "Sum of card values (A=1, J/Q/K=11/12/13 or 10).", {}, evalPipSum],
    ["set-summary", "Set summary", "Sets", "General", "Rank groups and longest suit.", {}, evalSetSummary],
    ["high-card", "High card", "High", "General", "Single highest card (aces high).", {}, evalHighCard],
    ["count", "Card count", "Count", "General", "Number of cards.", {}, evalCount],
  ];

  const FNS = {};
  const EVALUATORS = DEFS.map(([id, label, short, group, description, flags, fn]) => {
    FNS[id] = fn;
    return Object.assign({ id, label, short, group, description }, flags, { higherIsBetter: true });
  });

  function evaluate(id, cards, ctx) {
    const fn = FNS[id];
    if (!fn) return null;
    return fn(Array.isArray(cards) ? cards : [], ctx || {});
  }

  function compare(id, a, b) {
    if (!a && !b) return 0;
    if (!a) return -1;
    if (!b) return 1;
    return a.score > b.score ? 1 : a.score < b.score ? -1 : 0;
  }

  function rankResults(id, results) {
    const nonNull = results.filter(Boolean);
    return results.map((r) => {
      if (!r) return nonNull.length + 1;
      return 1 + nonNull.filter((o) => o.score > r.score).length;
    });
  }

  // ---------------------------------------------------------------------------
  // Monte Carlo equity
  // ---------------------------------------------------------------------------
  function equity(opts) {
    const o = opts || {};
    const id = o.evaluator;
    const hands = o.hands || [];
    const board = o.board || [];
    const ctx = o.ctx || {};
    const deck = (o.deck || []).filter((c) => {
      const n = norm(c, 0);
      return !n.hidden && !n.nonstd;
    });
    const boardSize = o.boardSize == null ? board.length : o.boardSize;
    const need = Math.max(0, Math.min(boardSize - board.length, deck.length));
    let iters = need === 0 ? 1 : Math.max(1, o.iterations || 2000);
    const np = hands.length;
    const win = new Float64Array(np),
      tie = new Float64Array(np),
      share = new Float64Array(np);
    const scores = new Float64Array(np);
    const deckIdx = deck.map((c, j) => j);

    const hasJoker = (arr) => arr.some((c) => norm(c, 0).joker);
    const fast = id === "poker-high" && !(ctx.jokersWild && (hasJoker(deck) || hands.some(hasJoker) || hasJoker(board)));
    let fh, fb, fd, bufR, bufS;
    if (fast) {
      fh = hands.map((h) => prep(h).std);
      fb = prep(board).std;
      fd = deck.map((c) => norm(c, 0));
      bufR = new Int32Array(64);
      bufS = new Int32Array(64);
    }
    for (let it = 0; it < iters; it++) {
      // partial Fisher-Yates
      for (let j = 0; j < need; j++) {
        const q = j + Math.floor(Math.random() * (deckIdx.length - j));
        const t = deckIdx[j];
        deckIdx[j] = deckIdx[q];
        deckIdx[q] = t;
      }
      let best = -Infinity;
      if (fast) {
        for (let pI = 0; pI < np; pI++) {
          let len = 0;
          const h = fh[pI];
          for (let j = 0; j < h.length; j++) {
            bufR[len] = h[j].r;
            bufS[len++] = h[j].s;
          }
          for (let j = 0; j < fb.length; j++) {
            bufR[len] = fb[j].r;
            bufS[len++] = fb[j].s;
          }
          for (let j = 0; j < need; j++) {
            const c = fd[deckIdx[j]];
            bufR[len] = c.r;
            bufS[len++] = c.s;
          }
          const sc = len ? highCore(bufR, bufS, len, 0, false) : -Infinity;
          scores[pI] = sc;
          if (sc > best) best = sc;
        }
      } else {
        const full = board.slice();
        for (let j = 0; j < need; j++) full.push(deck[deckIdx[j]]);
        const c2 = Object.assign({}, ctx, { board: full });
        for (let pI = 0; pI < np; pI++) {
          const r = evaluate(id, hands[pI], c2);
          const sc = r ? r.score : -Infinity;
          scores[pI] = sc;
          if (sc > best) best = sc;
        }
      }
      if (best === -Infinity) continue;
      let nw = 0;
      for (let pI = 0; pI < np; pI++) if (scores[pI] === best) nw++;
      for (let pI = 0; pI < np; pI++) {
        if (scores[pI] !== best) continue;
        if (nw === 1) win[pI]++;
        else tie[pI]++;
        share[pI] += 1 / nw;
      }
    }
    return {
      players: Array.from({ length: np }, (_, j) => ({ win: win[j] / iters, tie: tie[j] / iters, share: share[j] / iters })),
      iterations: iters,
    };
  }

  const api = {
    EVALUATORS,
    evaluate,
    compare,
    rankResults,
    equity,
    parseCard,
    parseCards,
    cardLabel,
  };
  return api;
});
