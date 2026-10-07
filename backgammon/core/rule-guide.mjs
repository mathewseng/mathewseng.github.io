// SPDX-License-Identifier: GPL-3.0-or-later
import { rulesOf } from "./rules.mjs";

// Read-only explanation of the canonical rules; never derives rules from UI config.
export function ruleGuide(s) {
  const r = rulesOf(s), money = !s.matchLength;
  return [
    ["Objective and direction", "Each player has 15 checkers. Move toward your own home board, then bear all 15 off to win. Point numbers follow the chosen board orientation; flipping the board does not change play."],
    ["Opening roll", "Each player rolls one die. Ties are rerolled. The higher die starts, and that player uses both opening dice."],
    ["Opening stakes", money && r.cube && r.automaticDoubles
      ? `A tied opening roll doubles the centered cube. ${r.automaticDoubles === 10 ? "Every tie counts: 1 → 2 → 4 → 8, up to the cube limit of 1024." : `This session allows at most ${r.automaticDoubles} opening double${r.automaticDoubles === 1 ? "" : "s"}.`} Neither player owns the cube afterward. Doubles rolled during normal play do not raise the stakes.`
      : "Opening ties do not raise the stakes in this game. Doubles during normal play do not raise the stakes either."],
    ["Using the dice", "Each die is a separate move, in either order. The same checker may use both dice if each landing is legal. Doubles give four moves of that number. Use both dice (or as many of the four as possible); if only one of two different dice can be played, use the higher one. A win ends the roll immediately."],
    ["Blocked points and hits", "You may land on an empty point, your own checkers, or one opposing checker. Two or more opposing checkers block a point. Landing on a lone opposing checker hits it to the bar; each intermediate landing must also be legal."],
    ["Entering from the bar", "Enter every barred checker into the opponent’s home board before moving other checkers. A die of 1 enters on the opponent’s 1-point, and so on. Blocked entries cannot be used; if no legal entry is possible, the turn passes automatically."],
    ["Bearing off", "All your remaining checkers must be in your home board, with none on the bar. An exact die bears a checker off its numbered point. An oversized die may bear off from your highest occupied point only when no checker is farther from the tray. You may also move within home. A hit requires re-entry and returning home before bearing off again."],
    ["Scoring", "A single win scores the cube value. A gammon scores twice that value when the loser has borne off no checkers. A backgammon scores three times when the loser has borne off none and still has a checker on the bar or in the winner’s home board. The Jacoby setting below can reduce these bonuses."],
    ["Session or match", money
      ? "Unlimited points session: points accumulate without a target score. Each new game starts with a centered cube at 1 before any opening ties."
      : `First to ${s.matchLength} points wins the match. A new game starts with a centered cube at 1. Scores stop at the match target.`],
    ["Doubling cube", r.cube
      ? "Before rolling, the player on turn may offer twice the stakes if the cube is centered or theirs. Taking accepts the new value and gives the taker cube ownership; dropping loses the previous cube value. The owner can redouble on a later turn. The cube is limited to 1024. No offer is allowed in Crawford or when the current stake already reaches the offerer’s match target."
      : "Disabled. Players cannot offer doubles, beavers or raccoons."],
    ["Jacoby", money && r.jacoby
      ? "On: gammons and backgammons count only after a double is accepted. Automatic opening doubles leave the cube centered and do not activate those bonuses."
      : money ? "Off: gammons and backgammons always count." : "Not used in match play: gammons and backgammons count toward the match score."],
    ["Beavers and raccoons", money && r.cube && r.immediateRedoubles
      ? `Beavers are on: the taker may accept a double and immediately double again while keeping ownership. ${r.immediateRedoubles === 2 ? "Raccoons are also on: the original doubler may immediately double the beaver again; the beaverer keeps ownership." : "Raccoons are off."} A player declining an immediate redouble loses the stake already accepted. The cube limit still applies.`
      : "Off: a cube offer may only be taken or dropped."],
    ["Crawford", money ? "Not used in unlimited points sessions."
      : `The first game after a player reaches one point from winning is played without doubling. Doubling returns in subsequent games (post-Crawford). ${s.crawford ? "This is the Crawford game." : s.crawfordPlayed ? "This match is now post-Crawford." : "The Crawford game has not yet been played."}`],
    ["Resignation", "Offer a single, gammon or backgammon loss at the current cube value when allowed by the position and Jacoby rule. The opponent must accept; declining resumes play. Gammons or backgammons cannot be offered after bearing a checker off."],
    ["Drafts, forced play and undo", "Chosen moves stay editable until Confirm turn. Undo reverses a draft step; Reset clears chosen steps while keeping forced ones. Entirely forced turns and passes advance automatically. A forced continuation after a choice stays in the draft for confirmation. Undoing a committed human decision requires the opponent’s agreement; forced actions cannot be taken back."],
  ];
}
