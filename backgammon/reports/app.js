// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, select, field } from "../ui/shell.mjs";
import { PRESETS, ENGINE_VERSION } from "../engine/metadata.mjs";
import { startUpdates } from "../ui/updates.mjs";
import { EngineClient } from "../engine/client.mjs";
import { renderReplyPrecision } from "./reply-fullgame-precision.mjs";
import { renderFullgamePrecision } from "./fullgame-precision.mjs";

// Let the document finish loading while the service-worker gate runs.
// Only start the tool after the gate has finished or allowed offline use.
let readerMoved = false;
for (const type of ["wheel", "touchmove", "keydown", "pointerdown"])
  addEventListener(type, () => (readerMoved = true), { once: true, passive: true });
async function boot() {
await startUpdates();
const $ = (id) => document.getElementById(id);
const time = (n) =>
  n < 1000 ? `${n.toFixed(n < 10 ? 2 : 0)} ms` : `${(n / 1000).toFixed(2)} s`;
const label = (p) => PRESETS[p]?.name || `Rollout · ${p.slice(7)} trials`;
const link = (text, href) => el("a", { href }, text);
// Report tables: a visible caption above a scrolling .table-wrap with a sticky
// first column; the <caption> stays in the table for assistive technology.
function table(headers, rows, caption) {
  const num = (i) => (i ? { class: "num" } : {});
  return el(
    "figure",
    { class: "docs-table" },
    el("p", { class: "docs-table-caption", "aria-hidden": "true" }, caption),
    el(
      "div",
      {
        class: "table-wrap table-wrap--sticky-col report-table-wrap",
        tabindex: "0",
        role: "region",
        "aria-label": caption,
      },
      el(
        "table",
        { class: "data-table report-table" },
        el("caption", { class: "sr-only" }, caption),
        el(
          "thead",
          {},
          el("tr", {}, ...headers.map((h, i) => el("th", { scope: "col", ...num(i) }, h))),
        ),
        el(
          "tbody",
          {},
          ...rows.map((row) =>
            el(
              "tr",
              {},
              ...row.map((cell, i) =>
                el(i ? "td" : "th", i ? num(i) : { scope: "row" }, cell),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}
// "Measured on" line shared by every recorded dataset.
const measured = (engine, recordedAt, note = "") =>
  el(
    "p",
    { class: "docs-meta" },
    el("span", { class: "chip" }, `Measured ${new Date(recordedAt).toLocaleString()}`),
    el("code", {}, engine),
    note ? el("span", {}, note) : null,
  );
// Errors stay in their section and are announced once.
const failed = (target, e) => {
  target.append(el("p", { class: "error" }, e.message));
  $("report-alert").textContent = e.message;
};
async function json(path) {
  const r = await fetch(path);
  if (!r.ok)
    throw new Error(
      `Report could not load (${r.status}). Reload or try online.`,
    );
  return r.json();
}
$("release").textContent = ENGINE_VERSION;
const downloads = (...links) => el("p", { class: "docs-links" }, ...links);
try {
  const [report, accuracy] = await Promise.all([json("../data/adaptive-benchmark.json"), json("../data/adaptive-accuracy.json")]);
  let browserName = report.results[0].browser;
  const target = el("div", {});
  const draw = () => {
    const browser = report.results.find(b => b.browser === browserName);
    target.replaceChildren(table(["Position", "Completed depth", "Median", "Range"], browser.rows.map(row => {
      const depths = [...new Set(row.completedPlies)].sort((a,b)=>a-b);
      return [row.topic, `${depths.join(" / ")} ply`, time(row.summary.median), `${time(row.summary.min)}–${time(row.summary.max)}`];
    }), `${browser.browser} ${browser.version} · five fresh-worker samples per position; search time excludes loading.`));
  };
  $("automatic-content").append(
    measured(report.results[0].engine, report.recordedAt),
    field("Automatic search browser", select(report.results.map(b=>[b.browser,b.browser]), browserName, value=>{browserName=value;draw();})),
    target,
    el("p", {}, `The automatic root filter retained the exhaustive two-ply best move in ${accuracy.summary.identicalBest} of ${accuracy.summary.positions} tested positions. ${accuracy.summary.arbitraryMoveChecks} submitted moves outside the filtered list were also graded against exhaustive analysis. This is same-engine agreement, not proof of perfect play or an Elo improvement.`),
    el("p", {class:"muted"}, `${report.environment.cpu} · ${report.environment.os}. ${report.method}`),
    el("p", {}, "Auto first evaluates every move at zero ply, then retains the top 16, up to 24 within 0.160 equity, and the played move. Three- and four-ply searches narrow the list further. Filtering can miss a better move; fixed Standard and Deep retain all legal results. Every displayed comparison uses one completed depth."),
    downloads(link("Download automatic timings", "../data/adaptive-benchmark.json"), link("Download filter validation", "../data/adaptive-accuracy.json")),
  );
  draw();
} catch (e) { failed($("automatic-content"), e); }
try {
  const report = await json("../data/native-benchmark.json");
  let browserName = report.results[0].browser, preset = "deep", condition = "cold";
  const target = el("div", {});
  const draw = () => {
    const browser = report.results.find(b => b.browser === browserName);
    target.replaceChildren(table(
      ["Position", "Scalar", "SIMD", "Time saved"],
      browser.rows.filter(r => r.preset === preset).map(r => {
        const scalar = r.summary.scalar[condition].median;
        const simd = r.summary.simd[condition].median;
        return [r.topic, time(scalar), time(simd), Math.min(scalar, simd) < 10 ? "—" : `${((1 - simd / scalar) * 100).toFixed(1)}%`];
      }),
      `${browser.browser} ${browser.version} · ${label(preset)} · median of five paired workers. ${condition === "cold" ? "First search in each worker." : "Three repeated searches per worker; native caches warm."}`,
    ));
  };
  $("acceleration-content").append(
    measured(report.engine, report.recordedAt),
    el("div", {class:"row docs-controls"},
      field("Browser", select(report.results.map(b => [b.browser, b.browser]), browserName, value => {browserName = value; draw();})),
      field("Analysis setting", select([["standard","Standard"],["deep","Deep"]], preset, value => {preset = value; draw();})),
      field("Cache condition", select([["cold","Fresh worker"],["warm","Repeated search"]], condition, value => {condition = value; draw();})),
    ),
    target,
    el("p", {class:"muted"}, `${report.environment.cpu} · ${report.environment.os}. ${report.environment.conditions}`),
    el("p", {}, "Negative time saved means the accelerated build was slower in that measurement. Percentages are omitted below 10 ms; small differences and zero readings can be timer noise or rounding. Startup, transfer, compilation, raw samples and ranges are recorded separately in the download."),
    downloads(link("Download paired engine measurements", "../data/native-benchmark.json")),
  );
  draw();
} catch (e) {
  failed($("acceleration-content"), e);
}
try {
  const speed = await json("../data/speed-report.json");
  let topic = "contact";
  const target = el("div", {});
  function draw() {
    const rows = speed.rows.filter((r) => r.topic === topic);
    target.replaceChildren(
      table(
        [
          "Setting",
          "Median compute",
          "Observed range",
          "Complete incl. startup",
          "Cache hit",
        ],
        rows.map((r) => [
          label(r.preset),
          time(r.compute.median),
          `${time(r.compute.min)} – ${time(r.compute.max)}`,
          time(r.endToEnd.median),
          time(r.cacheHit.median),
        ]),
        `${topic} · ${rows[0]?.compute.n || 0} fresh-worker samples per setting; no p95 from this small sample.`,
      ),
    );
  }
  $("speed-content").append(
    measured(speed.engine, speed.recordedAt, "Historical results below retain their original engine version."),
    field(
      "Position type",
      select(
        ["opening", "contact", "race", "bearoff", "cube"].map((t) => [
          t,
          t[0].toUpperCase() + t.slice(1),
        ]),
        topic,
        (v) => {
          topic = v;
          draw();
        },
      ),
    ),
    target,
    el(
      "p",
      { class: "muted" },
      `${speed.environment.cpu} · ${speed.environment.os} · ${speed.environment.browser}. ${speed.environment.condition}`,
    ),
    el(
      "p",
      {},
      `Engine download size: ${(speed.bytes / 1024 / 1024).toFixed(2)} MiB. Median local transfer ${time(speed.startup.transferMs.median)}, compilation ${time(speed.startup.compileMs.median)}, initialization ${time(speed.startup.initializeMs.median)}. Internet and real-phone speeds are unmeasured.`,
    ),
    downloads(link("Download all samples (JSON)", "../data/speed-report.json")),
  );
  draw();
  if (speed.auto) {
    const median = (xs) =>
      [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    $("speed-content").append(
      el("h3", {}, "Previous automatic pipeline · Quick then Deep"),
      table(
        ["Position", "Quick first answer", "Deep final answer"],
        speed.auto.rows.map((r) => [
          r.topic,
          time(median(r.samples.map((s) => s.firstMs))),
          time(median(r.samples.map((s) => s.finalMs))),
        ]),
        speed.auto.method,
      ),
    );
  }
} catch (e) {
  failed($("speed-content"), e);
}
try {
  const report = await json("../data/accuracy-report.json");
  $("accuracy-content").append(
    el("p", {}, report.description),
    measured(report.engine, report.recordedAt),
    table(
      [
        "Position class / setting",
        "Covered choices",
        "Within 0.005 of reference best",
        "Mean reference loss",
      ],
      report.summary.flatMap((group) =>
        group.presets.map((r) => [
          `${group.topic} / ${label(r.preset)}`,
          `${r.covered}/${r.n}`,
          `${r.agreementWithin005}/${r.covered}`,
          r.meanReferenceLoss.toFixed(4),
        ]),
      ),
      "300 positions · Quick, Standard and Deep · cubeless equity units",
    ),
    el(
      "p",
      {},
      "The reference contains only selected alternatives. A current best move missing from that list is “uncovered,” not wrong or correct. The loss average excludes those decisions. These are historical GNUbg rollouts with sampling and policy error—not exact answers, an Elo rating, or proof of superiority over another engine.",
    ),
    el(
      "p",
      {},
      "Expert, Research and new rollouts have timing and integration checks below. This 300-position quality comparison measures 0–2 ply only; it does not establish that every deeper result is better.",
    ),
    downloads(
      link("Download per-position results", "../data/accuracy-report.json"),
      link(
        "Download reference positions & provenance",
        "../data/accuracy-reference.json",
      ),
    ),
  );
  const native = await json("../data/native-validation.json");
  $("accuracy-content").append(
    el("h3", {}, "Independent desktop integration check"),
    el("p", {}, native.description),
    el(
      "p",
      {},
      `${native.cases.length} comparisons · maximum absolute difference ${native.maxDifference.toFixed(8)} · tolerance ${native.tolerance}. ${native.reference}`,
    ),
    downloads(
      link(
        "Download desktop comparison results",
        "../data/native-validation.json",
      ),
    ),
  );
} catch (e) {
  failed($("accuracy-content"), e);
}
try {
  const report=await json('../data/deep-book-comparison.json'),contextAudit=report.contextAudit;
  const rows=['opening','reply'].map(kind=>{
    const summary=report.summaries[kind],d=summary.depths;
    return [kind==='opening'?'Opening rolls':'Reply rolls',String(d['5'].referenceBestEV?.n||0),
      ...['3','4','5'].map(p=>d[p].referenceBestEV?.meanAbsoluteDifference.toFixed(5)||'—')];
  });
  const openingDepths=report.summaries.opening.depths,replyDepths=report.summaries.reply.depths;
  const gap=(depths,depth)=>depths[depth].referenceBestEV.meanAbsoluteDifference.toFixed(5);
  $('opening-accuracy-content').append(
    measured(report.book,report.recordedAt),
    el('p',{},`Moving from three to five plies reduces the mean EV gap for XG’s preferred moves from ${gap(openingDepths,'3')} to ${gap(openingDepths,'5')} for openings, and from ${gap(replyDepths,'3')} to ${gap(replyDepths,'5')} for replies. Five ply agrees with ${openingDepths['5'].bestMoveAgreement}/${report.summaries.opening.positions} opening choices and ${replyDepths['5'].bestMoveAgreement}/${report.summaries.reply.positions} reply choices; four ply agrees with ${openingDepths['4'].bestMoveAgreement}/${report.summaries.opening.positions} and ${replyDepths['4'].bestMoveAgreement}/${report.summaries.reply.positions}. More depth does not uniformly improve move choices.`),
    el('p',{},`The book contains ${report.coverage.openingRolls} opening rolls with all ${report.coverage.openingCandidates} legal resulting moves, plus ${report.coverage.replyRolls} reply decisions across ${report.coverage.replyBoards} opening boards. The reply pass evaluates ${report.coverage.replyFinalists} screened alternatives at five plies. XG has matching positions for ${report.summaries.opening.positions} openings and ${report.summaries.reply.positions} replies. ${report.uncoveredReferencePositions.length} of its ${report.referencePositions} published positions are outside our opening-branch coverage.`),
    table(['Positions','EV comparisons','3-ply difference','4-ply difference','5-ply difference'],rows,
      'Mean absolute EV difference for XG’s preferred move · current-cube equity units'),
    table(['Positions','Shared candidates','3-ply difference','4-ply difference','5-ply difference'],['opening','reply'].map(kind=>{
      const d=report.summaries[kind].depths;
      return [kind==='opening'?'Opening alternatives':'Reply alternatives',String(d['5'].commonCandidateEV?.n||0),...['3','4','5'].map(p=>d[p].commonCandidateEV?.meanAbsoluteDifference.toFixed(5)||'—')];
    }),'Mean absolute EV difference across every shared candidate · identical cohort at all three depths'),
    table(['Positions','3-ply best move','4-ply best move','5-ply best move'],['opening','reply'].map(kind=>{
      const s=report.summaries[kind];return [kind==='opening'?'Opening rolls':'Reply rolls',...['3','4','5'].map(p=>`${s.depths[p].bestMoveAgreement}/${s.positions}`)];
    }),'Best-move agreement with XG · every matched position'),
    el('p',{},['opening','reply'].map(kind=>{const s=report.summaries[kind],d=s.depths['5'];return `${kind==='opening'?'Opening':'Reply'} choices at five plies lose ${d.meanSelectedMoveReferenceLoss?.toFixed(5)??'unknown'} equity as an unweighted position average according to XG, among the ${d.choiceLossCovered}/${s.positions} choices XG lists.`;}).join(' ')),
    el('p',{},'Each depth is compared on the same resulting boards. A smaller EV difference means closer agreement with this reference, not proof of exact play. Best-move agreement includes every matched decision; EV comparisons exclude XG moves missing from the five-ply candidate set.'),
    el('p',{},'The deeper search retains GNUbg’s neural and cube models and its static policy for future checker moves. It is not equivalent to an XG rollout.'),
    el('p',{},'The published XG book 3.70 (2013) mixes finite rollouts and XGRoller++ evaluations and enables beavers. Our book uses Jacoby with beavers off. Its opening 6–5 diagram/XGID is inconsistent with the heading and move table; the comparison uses the standard opening position and preserves this correction in the source data.'),
    el('p',{},`A separate paired 3-ply check across all ${contextAudit.positions} source positions found a maximum beaver-on/off EV difference of ${contextAudit.maximumAbsoluteDifference.toFixed(8)}. That rule difference does not explain the observed 3-ply gaps in this sample; equivalence at greater depth is untested.`),
    el('p',{},'Openings score every legal move at five plies. Replies use four-ply screening, then evaluate the union of the three- and four-ply top two and all candidates within 0.040 at either depth. Screened-out candidates remain a limitation. Third- and fourth-turn entries retain their historical three-ply evaluations.'),
    downloads(link('Full per-move comparison','../docs/deep-book-comparison.json'),link('Computed evaluations','../docs/deep-book-evaluations.json'),link('Raw native scores (JSONL)','../docs/deep-book-scores.jsonl'),link('XG positions and provenance','../docs/deep-book-xg-reference.json'),link('Paired beaver-rule check','../docs/deep-book-context-audit.json'),
      link('Method and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/DEEP-OPENING-BOOK.md'),
      link('Published XG source','https://www.extremegammon.com/Openingbook.aspx')),
  );
} catch(e) { failed($('opening-accuracy-content'),e); }
if ($('rollout-accuracy-content')) try {
  const [report,book]=await Promise.all([json('../data/rollout-policy-comparison.json'),json('../data/rollout-book-validation.json')]);
  if(!report.complete)throw Error('The rollout comparison is incomplete.');
  let cohort='opening';
  const storedPolicySummary=Object.entries(book.storedPolicies??{'short-deep':{positions:book.coverage.sampled}}).map(([id,p])=>`${p.positions} ${id==='strong'?'full-game Strong':'Short/deep'}`).join(', ');
  const target=el('div',{}),detail=el('div',{}),policies=report.policies;
  const number=v=>Number.isFinite(v)?v.toFixed(5):'—';
  const draw=()=>{
    const s=report.summaries[cohort];
    const rows=[['Five-ply book',number(s.fivePly.referenceBestEV?.meanAbsoluteDifference),`${s.fivePly.bestMoveAgreement}/${s.positions}`,'—','—'],
      ...policies.map(p=>{const v=s.policies[p.id];return [p.name,number(v.referenceBestEV?.meanAbsoluteDifference),`${v.bestMoveAgreement}/${v.positions}`,`${v.clearLeadersUnadjusted}/${v.positions}`,number(v.maximumSamplingHalfWidth)];})];
    target.replaceChildren(table(['Policy','Mean EV gap','XG move agreement','Clear leads*','Largest ±95%'],rows,'Same positions and alternatives · EV gap measures XG’s preferred move in current-cube equity units'));
    const chosen=report.rows.filter(r=>cohort==='all'||r.cohort===cohort);
    detail.replaceChildren(table(['Position','XG choice','Short/deep choice','Leader gap ±95%*'],chosen.map(r=>{
      const p=r.policies['short-deep'],title=r.kind==='opening'?`Opening ${r.roll}`:`${new URL(r.source).pathname.split('/').at(-1).replace('Replies_to_','After ').replace('.html','')} · ${r.roll}`;
      return [link(title,r.source),r.referenceBest.move,`${p.bestMove}${p.agrees?' · agrees':''}`,p.leaderGap?`${number(p.leaderGap.difference)} ± ${number(p.leaderGap.confidenceHalfWidth)}`:'Only candidate'];
    }),'Short/deep choices and paired gaps to their runners-up · source links open the matching XG table'));
  };
  $('rollout-accuracy-content').append(
    measured(report.engine,report.recordedAt),
    el('p',{},`${report.coverage.positions} decisions and ${report.coverage.candidates} candidate moves, each with ${report.expectedTrials} trials under Basic and Short/deep. The cohort includes every opening, all 39 five-ply reply disagreements and 12 agreeing reply controls. Full-game Balanced and Strong are available in Solver and implementation-tested; this accuracy comparison tests Basic versus Short/deep.`),
    field('Rollout comparison positions',select([['opening','All 15 openings'],['reply-disagreement','39 reply disagreements'],['reply-control','12 agreeing reply controls'],['all','All 66 decisions']],cohort,v=>{cohort=v;draw();})),target,
    el('p',{},'Basic simulates complete games with 0/0 checker/cube policies. Short/deep uses 2/2 for two simulated turns, then 1/2, and a two-ply endpoint after five turns. This independently implemented short-rollout method uses GNUbg’s evaluator and ply numbering.'),
    el('p',{},'*Clear leads and leader-gap intervals are unadjusted exploratory 95% comparisons across independent common-seed batches. They exclude model bias, screened-out alternatives and XG reference uncertainty. The largest interval is for a candidate’s EV, not its gap to another move. More agreement with XG does not prove exact play.'),
    el('p',{},`The tables above preserve the original Basic/Short-deep experiment. The independent GNUbg book uses stored rollout estimates for ${book.coverage.sampled} decisions (${storedPolicySummary}) and five-ply estimates for the other ${book.coverage.fivePlyFallback} matched reference positions. Current XG best-move agreement is ${book.summaries.opening.bestMoveAgreement}/${book.summaries.opening.positions} openings and ${book.summaries.reply.bestMoveAgreement}/${book.summaries.reply.positions} replies. The initial Short/deep cohorts qualified against their five-ply baseline; the full-game follow-up has separately recorded acceptance criteria. Unlisted moves receive a complete fallback comparison; rollout scores are not mixed with tree scores when grading.`),
    el('p',{},`Against the requested 0.005 absolute-equity target, ${book.summaries.opening.referenceBestEV.withinTolerance}/${book.summaries.opening.positions} openings and ${book.summaries.reply.referenceBestEV.withinTolerance}/${book.summaries.reply.positions} replies are within tolerance for XG’s preferred move. Across all matched reply alternatives, ${book.summaries.reply.commonCandidateEV.withinTolerance}/${book.summaries.reply.commonCandidateEV.n} values meet the target. These are descriptive reference differences, not confidence or equivalence tests.`),
    el('p',{},'XG’s published book mixes rollouts and XGRoller++ evaluations, with beavers enabled. Our simulations disable beavers. This deliberately selected cohort is not an independent test of general playing strength.'),
    el('p',{},link('See the independent 4,096-trial confirmation of the remaining disagreements.','#rollout-diagnostic')),detail,
    downloads(link('Published-book validation','../docs/rollout-book-validation.json'),link('Full comparison and uncertainty','../docs/rollout-policy-comparison.json'),link('Candidate plan and build provenance','../docs/rollout-policy-inputs.json'),link('Raw independent batches (gzip)','../docs/rollout-policy-batches.jsonl.gz'),link('Original plan and scope change','../docs/rollout-policy-plan-amendment.json'),link('Native/browser implementation checks','../docs/rollout-policy-validation.json'),link('Method and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/ROLLOUT-POLICIES.md'),link('XG’s rollout description','https://www.extremegammon.com/support.aspx')),
  );draw();
} catch(e) { failed($('rollout-accuracy-content'),e); }
if ($('rollout-diagnostic-content')) try {
  const report=await json('../data/rollout-diagnostic-comparison.json');
  if(!report.complete||report.coverage.classified!==24)throw Error('The fixed confirmation is incomplete.');
  const counts=report.classifications,opening=report.rows.find(r=>r.kind==='opening');
  const number=v=>`${v>=0?'+':''}${v.toFixed(5)}`;
  const interval=g=>`[${number(g.familywise95.lower)}, ${number(g.familywise95.upper)}]`;
  const names={persistent:'Persistent preference',reversed:'Reversed toward XG',unresolved:'Unresolved'};
  let filter='all';const target=el('div',{});
  const draw=()=>target.replaceChildren(table(
    ['Position','Previous choice','XG choice','Fresh gap','Simultaneous 95% interval','Conclusion','XG gap*'],
    report.rows.filter(r=>filter==='all'||r.gap.classification===filter).map(r=>[
      link(r.kind==='opening'?`Opening ${r.roll}`:`${new URL(r.source).pathname.split('/').at(-1).replace('Replies_to_','After ').replace('.html','')} · ${r.roll}`,r.source),
      r.previousMove,r.xgMove,number(r.gap.difference),interval(r.gap),names[r.gap.classification],
      `${number(-r.reference.preferredGap)}${r.reference.marginalIntervalsSeparate?'':' · overlapping error bars'}`,
    ]),'Fixed pairs · positive gaps favor our previous choice; negative gaps favor XG’s choice · current-cube equity'));
  $('rollout-diagnostic-content').append(
    measured(report.engine,report.recordedAt),
    el('p',{},`${report.trialsPerMove.toLocaleString()} fresh trials per move × 48 moves = ${(report.trialsPerMove*48).toLocaleString()} rollout trials. ${counts.persistent} pairs retain a statistically clear preference against XG, ${counts.reversed} clearly reverse${counts.reversed===1?'s':''} toward XG, and ${counts.unresolved} remain unresolved after correcting for all 24 comparisons.`),
    el('p',{},`Opening 2–1: ${opening.previousMove} versus ${opening.xgMove}. The fresh difference is ${number(opening.gap.difference)}, with simultaneous 95% interval ${interval(opening.gap)}: ${names[opening.gap.classification].toLowerCase()}.`),
    el('p',{},'Each pair uses shared dice in 128 independent batches of 32 trials. Every trial seed is fresh relative to the earlier experiment. The two moves and 4,096-trial stopping point were fixed before this run; the previous 512 trials are excluded. Intervals use paired batch means with a Student-t approximation and Bonferroni correction across 24 positions.'),
    el('p',{},'A persistent preference is evidence against sampling noise as the sole cause within this pipeline. It does not isolate the neural evaluator: checker choices, cube decisions, move filtering and the five-turn truncation endpoint can create systematic differences. Both engines are estimates. All 24 reference pairs use published XG rollouts with 3-ply, 4-ply or XG Roller continuation policies. Their reported marginal error bars often overlap, and their shared-dice covariance is unavailable.'),
    el('p',{},link('See the controlled full-game cutoff, checker and cube tests.','#fullgame-ablation')),
    el('p',{},'Unresolved means these samples cannot determine the direction confidently; it does not prove the moves are equal or that all disagreement is noise. A reversed result supports sampling instability in the original ranking. This two-move diagnostic did not replace the opening guide’s full candidate comparisons; the subsequent full-game experiment evaluates the retained alternatives.'),
    field('Disagreement conclusion',select([['all','All 24 positions'],...Object.entries(names).map(([k,v])=>[k,`${v} (${counts[k]})`])],filter,v=>{filter=v;draw();})),target,
    el('p',{},'*XG gap uses the same sign convention. “Overlapping error bars” compares the two reported marginal intervals; this is not a paired significance test. XG enables beavers while these GNUbg rollouts disable them. Ordinary 95% intervals, previous 512-trial gaps and three-/four-/five-ply gaps are available in the full result download.'),
    downloads(link('Full paired results','../docs/rollout-diagnostic-comparison.json'),link('Fixed pairs, seeds and policy','../docs/rollout-diagnostic-inputs.json'),link('Raw fresh batches (gzip)','../docs/rollout-diagnostic-batches.jsonl.gz'),link('Method and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/ROLLOUT-DIAGNOSTIC.md')),
  );draw();
} catch(e) { failed($('rollout-diagnostic-content'),e); }
if ($('fullgame-ablation-content')) try {
  const [report,confirmation]=await Promise.all([json('../data/fullgame-ablation-comparison.json'),json('../data/opening-fullgame-confirmation-comparison.json')]);
  if(!confirmation.complete||confirmation.records!==1024||confirmation.trialsPerMovePolicy!==4096)throw Error('The opening confirmation is incomplete.');
  if(!report.complete||report.rows.length!==15||report.records!==4320)throw Error('The full-game experiment is incomplete.');
  const number=v=>`${v>=0?'+':''}${v.toFixed(5)}`;
  const interval=g=>`[${number(g.familywise95.lower)}, ${number(g.familywise95.upper)}]`;
  const names={'short':'Five-turn baseline','full-matched':'Full game · same players','full-strong':'Full game · stronger checker','full-cube3':'Full game · deeper cube'};
  const effects={cutoff:'Remove the five-turn cutoff',checker:'Strengthen late checker play',cube:'Deepen cube decisions'};
  const directions={'toward-XG':'Shift toward XG','away-from-XG':'Shift away from XG',unresolved:'Unresolved shift'};
  let selected='cutoff';const target=el('div',{});
  const draw=()=>target.replaceChildren(table(
    ['Position','Previous choice / XG choice','Gap before','Gap after','Change in gap','Simultaneous 95% interval','Effect'],
    report.rows.map(r=>{const e=r.effects[selected];return [
      link(r.kind==='opening'?`Opening ${r.roll}`:`${new URL(r.source).pathname.split('/').at(-1).replace('Replies_to_','After ').replace('.html','')} · ${r.roll}`,r.source),
      `${r.previousMove} / ${r.xgMove}`,number(r.policies[e.before].gap.difference),number(r.policies[e.after].gap.difference),number(e.difference),interval(e),directions[e.direction],
    ];}),'Paired effects · move gaps are previous choice minus XG choice · negative changes shift toward XG'));
  const opening=report.rows.find(r=>r.kind==='opening'),confirmed=confirmation.rows[0];
  $('fullgame-ablation-content').append(
    measured('Pinned GNUbg · controlled native rollouts',report.recordedAt),
    el('p',{},'This original study did not meet its recorded book-update criteria: Full/strong had a larger sampled mean gap error than Short, and no individual effect cleared the planned threshold. Wider full-game intervals do not establish that the disagreements were fixed.'),
    el('p',{},link('See the independently seeded precision follow-up.','#fullgame-precision')),
    el('p',{},`${report.totalTrials.toLocaleString()} trials across four policies. Each disputed move receives ${report.trialsPerMovePolicy.toLocaleString()} fresh trials per policy; the stronger-checker run also evaluates every previously retained alternative. Dice are shared across moves and policies. Samples from the preceding experiments are excluded.`),
    table(['Policy','XG leads the fixed pair','Clear preference against XG','Clear preference for XG','Unresolved pairs','Mean absolute gap difference from XG'],
      Object.entries(names).map(([id,label])=>{const s=report.summaries[id];return [label,`${s.pairMeanFavorsXG} / 15`,s.classifications.persistent,s.classifications.reversed,s.classifications.unresolved,s.meanAbsoluteGapError.toFixed(5)];}),
      'Selected disagreements only · preference counts use simultaneous intervals across 60 policy–position gaps'),
    el('p',{},`Secondary averages across the fixed 15-position cohort: ${Object.entries(report.cohortEffects).map(([id,e])=>`${effects[id]}: ${number(e.difference)} ${interval(e)}`).join('; ')}. These three intervals form a separate simultaneous 95% family using 32 aggregate block means. This diagnostic was specified after the independent opening result revealed high variance, before inspecting the primary equities; it does not change the original promotion criteria or establish the effect at every position.`),
    el('p',{},`Primary 1,024-trial opening 2–1 comparison, split minus slot: ${Object.entries(names).map(([id,name])=>`${name}: ${number(opening.policies[id].gap.difference)} ${interval(opening.policies[id].gap)}`).join('; ')}. Published XG gap: ${number(opening.referenceGap)}.`),
    el('p',{},'A separate opening 2–1 confirmation was fixed before inspecting these equities: 4,096 fresh trials per move/policy, 32,768 additional trials in total. Its seeds are disjoint from the whole primary experiment. It tests the cutoff and checker effects again and evaluates all four retained moves under Full/strong, without pooling the two experiments.'),
    table(['Opening 2–1 policy','Split equity','Slot equity','Split minus slot','Simultaneous 95% interval'],Object.entries(confirmed.policies).map(([id,p])=>[
      names[id],number(p.candidates.find(c=>c.role==='previous-choice').equity),number(p.candidates.find(c=>c.role==='xg-choice').equity),number(p.gap.difference),interval(p.gap),
    ]),'Independent 4,096-trial opening confirmation · simultaneous intervals across its three policy gaps'),
    el('p',{},`Independent opening effects: removing the cutoff changes the gap by ${number(confirmed.effects.cutoff.difference)} ${interval(confirmed.effects.cutoff)}; stronger late checker play changes it by ${number(confirmed.effects.checker.difference)} ${interval(confirmed.effects.checker)}. These intervals form a separate two-comparison family. The Full/strong leader among all four retained moves is ${confirmed.policies['full-strong'].bestMove}.`),
    el('p',{},'The first comparison removes only the cutoff: checker play remains 2-ply for two turns, then 1-ply, with 2-ply cube decisions. The second keeps 2-ply checker play throughout. The third changes cube decisions from 2-ply to 3-ply. Full games end at a cube pass, game completion or an eligible bearoff database endpoint. Normal move filters and variance reduction remain enabled.'),
    field('Full-game effect',select(Object.entries(effects),selected,v=>{selected=v;draw();})),target,
    el('p',{},'Effect intervals preserve paired covariance across both moves and policies. They use 32 independent batch means and a Student-t approximation, with simultaneous 95% coverage across the 45 planned effects. Policy-gap intervals use a separate 60-comparison family. An unresolved shift does not prove the policies equivalent. A shift toward XG does not by itself establish the correct move.'),
    el('p',{},'Removing the cutoff tests the endpoint equity estimate under unchanged simulated players. That estimate combines neural probabilities with cube valuation, so cutoff and evaluator error are not mutually exclusive explanations. Residual disagreement can still reflect checker/cube choices, filtering, reference uncertainty or rules; it does not isolate neural weights. These are comparisons with published historical XG rollouts, not fresh XG engine runs. XG enables beavers; these GNUbg simulations disable them.'),
    downloads(link('Independent opening confirmation','../docs/opening-fullgame-confirmation-comparison.json'),link('Opening confirmation plan','../docs/opening-fullgame-confirmation-inputs.json'),link('Opening confirmation batches (gzip)','../docs/opening-fullgame-confirmation-batches.jsonl.gz'),link('Full results and intervals','../docs/fullgame-ablation-comparison.json'),link('Fixed plan and seeds','../docs/fullgame-ablation-inputs.json'),link('Raw full-game batches (gzip)','../docs/fullgame-ablation-batches.jsonl.gz'),link('Native implementation checks','../docs/fullgame-native-validation.json'),link('Second-host parity checks','../docs/fullgame-remote-validation.json'),link('Runtime weights and database checks','../docs/fullgame-runtime-validation.json'),link('Secondary cohort plan','../docs/fullgame-cohort-analysis-plan.json'),link('Method and reproduction','https://github.com/mathewseng/mathewseng.github.io/blob/main/backgammon/docs/FULLGAME-ABLATION.md')),
  );draw();
} catch(e) { failed($('fullgame-ablation-content'),e); }
if ($('reply-fullgame-precision-content')) await renderReplyPrecision($('reply-fullgame-precision-content'), {json,table,link,downloads,failed});
if ($('fullgame-precision-content')) await renderFullgamePrecision($('fullgame-precision-content'), {json,table,link,measured,downloads,failed});
$("method-content").append(
  el(
    "dl",
    { class: "report-methods" },
    ...[
      [
        "Auto",
        "Complete at least two plies, normally try three, and potentially reach four. The next-stage cost estimate and stable-lead policy can stop further search. Only completed same-depth comparisons replace the current result. A broad zero-ply screen retains at least sixteen candidates, up to twenty-four within 0.160, plus the submitted move; higher depths narrow that list further. The completed depth and screening limits are shown.",
      ],
      [
        "Quick / Standard / Deep",
        "0, 1 and 2 ply respectively. Every legal resulting checker position is scored at the same depth. Cube/match context is preserved.",
      ],
      [
        "Expert / Research",
        "3 and 4 ply. Start with all moves at 2 ply; keep at least the top two, up to eight within 0.080 for Expert or four within 0.040 for Research, plus the submitted move. Finalists are rescored at equal depth. A screened-out move can still be better. Cube decisions use the selected depth directly.",
      ],
      [
        "Rollouts",
        "Real GNUbg simulations, with Basic (0/0), Balanced (1/1, default) and Strong (2/2) full-game checker/cube policies, plus Short/deep: 2/2 for two turns, then 1/2, and a two-ply endpoint after five simulated turns. All use variance reduction and seeded ISAAC dice. Historical timing samples below used Basic. Up to four close 2-ply candidates, at least two, plus the submitted move. Ordinary doubling and match scores are supported; beavers/raccoons require tree analysis. All policies allow cubeless bearoff database termination.",
      ],
      [
        "Uncertainty",
        "95% intervals approximate sampling error only. They omit policy bias, model error and screening risk. Alternatives share dice; conservative gap checks add their standard errors rather than assuming independence. More samples do not fix a weak policy.",
      ],
      [
        "Recovery",
        "Each completed 32-trial batch is saved locally by Solver. Cancel terminates the worker. Resume regenerates a worker and continues from saved moments and the next seed. An unfinished batch is discarded. Mobile suspension can stop computation.",
      ],
      [
        "Reproducibility",
        "Raw samples, engine revision, reference source checksums and per-position results are downloadable. Scripts live under backgammon/scripts/. Benchmark datasets are separate from trainer lessons.",
      ],
    ].flatMap(([a, b]) => [el("dt", {}, a), el("dd", {}, b)]),
  ),
);
// The sections fill in after the browser has already jumped to a #section
// link; jump again once their tables exist unless the reader has moved.
if (!readerMoved) document.getElementById(location.hash.slice(1))?.scrollIntoView();
let devicePreset = "deep",
  deviceTopic = "contact",
  client = null;
// The device card shows one progress bar while a measurement runs:
// indeterminate for searches, determinate for rollouts.
function deviceState(state, progress) {
  $("device-card").dataset.state = state;
  $("device-progress").hidden = state !== "running";
  $("device-status").dataset.error = String(state === "error");
  const bar = $("device-bar");
  bar.classList.toggle("bar--indeterminate", !progress);
  if (progress) {
    const done = Math.min(progress.done, progress.total);
    bar.style.setProperty("--value", String(done / progress.total));
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", String(progress.total));
    bar.setAttribute("aria-valuenow", String(done));
    $("device-progress-value").textContent = `${done} / ${progress.total} trials`;
  } else {
    bar.style.removeProperty("--value");
    for (const name of ["aria-valuemin", "aria-valuemax", "aria-valuenow"]) bar.removeAttribute(name);
    $("device-progress-value").textContent = "";
  }
}
const run = button(
  "Run measurement",
  async () => {
    if (client) {
      const cancelled = client;
      client = null;
      cancelled.destroy();
      run.textContent = "Run measurement";
      deviceState("idle");
      $("device-status").textContent = "Measurement cancelled.";
      return;
    }
    const measuredPreset = devicePreset,
      measuredTopic = deviceTopic;
    let settled = false;
    // Engine status while it runs; the line written when the measurement ends
    // must not be replaced by the worker's own teardown status.
    const own = new EngineClient({
      onStatus: (_, text) => {
        if (!settled && client === own) $("device-status").textContent = text;
      },
    });
    client = own;
    run.textContent = "Cancel";
    deviceState("running");
    $("device-status").textContent = "Starting the engine…";
    try {
      const fixture = (await json("../data/exercises.json")).items.find(
        (f) => f.topic === measuredTopic,
      );
      const options = measuredPreset.startsWith("rollout")
        ? {
            rollout: { trials: Number(measuredPreset.slice(7)), seed: 20261006 },
            onProgress: (cp) => {
              $("device-status").textContent = `${cp.completed} completed trials per alternative`;
              deviceState("running", { done: cp.completed, total: Number(measuredPreset.slice(7)) });
            },
          }
        : { preset: measuredPreset };
      const started = performance.now(),
        answer = await own.analyze(fixture.state, options);
      if (client !== own) return;
      $("device-result").replaceChildren(
        table(
          ["Setting / position", "Compute", "Including startup"],
          [
            [
              `${label(measuredPreset)} / ${measuredTopic}`,
              time(answer.elapsedMs),
              time(performance.now() - started),
            ],
          ],
          `One on-device sample · ${new Date().toLocaleString()}`,
        ),
        el("p", { class: "docs-meta" }, el("code", {}, navigator.userAgent)),
      );
      deviceState("done");
      $("device-status").textContent = "Measurement complete.";
    } catch (e) {
      if (e.name !== "AbortError" && client === own) {
        deviceState("error");
        $("device-status").textContent = e.message;
      }
    } finally {
      settled = true;
      own.destroy();
      if (client === own) {
        client = null;
        run.textContent = "Run measurement";
      }
    }
  },
  "primary",
);
$("device-controls").append(
  field(
    "Setting",
    select(
      [...Object.keys(PRESETS), "rollout64", "rollout256"].map((k) => [
        k,
        label(k),
      ]),
      devicePreset,
      (v) => (devicePreset = v),
    ),
  ),
  field(
    "Position",
    select(
      ["opening", "contact", "race", "bearoff", "cube"].map((t) => [t, t]),
      deviceTopic,
      (v) => (deviceTopic = v),
    ),
  ),
  run,
);
addEventListener("pagehide", () => client?.destroy());

document.documentElement.dataset.appReady = "true";
}
// Section TOC: mark the section being read. Presentation only; the links are
// plain anchors and work without this.
function trackSections() {
  const links = [...document.querySelectorAll(".docs-toc a[href^='#']")];
  const sections = links.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  if (!sections.length || !("IntersectionObserver" in window)) return;
  const visible = new Set();
  const mark = () => {
    const current = sections.find((s) => visible.has(s)) || null;
    for (const a of links) {
      if (current && a.hash === "#" + current.id) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    }
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) entry.isIntersecting ? visible.add(entry.target) : visible.delete(entry.target);
      mark();
    },
    { rootMargin: "-20% 0px -55% 0px" },
  );
  sections.forEach((s) => observer.observe(s));
}
trackSections();
boot();
