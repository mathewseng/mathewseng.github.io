(function () {
  "use strict";

  const Core = window.OFCFantasylandCore;
  const TrainerCore = window.OFCSolverCore;
  const STORAGE_KEY = "ofcFantasylandEv.v16";
  const CACHE_SCHEMA_VERSION = 3;
  const SETTINGS_KEY = "ofcFantasylandEv.settings.v3";
  const CARD_COUNTS = [14, 15, 16, 17];
  const EXACT_SCENARIOS = [0, 1, 2].flatMap((jokers) => CARD_COUNTS.map((cards) => ({ cards, jokers })));
  const DECK_JOKER_COUNTS = [1, 2];
  const ROYALTY_DISTRIBUTION_SIZE = 128;
  const REPEAT_SOURCE_ORDER = [1, 2, 4, 3, 5, 6, 7];
  const REPEAT_SOURCE_META = {
    1: { label: "Top", className: "source-top" },
    2: { label: "Middle", className: "source-middle" },
    4: { label: "Bottom", className: "source-bottom" },
    3: { label: "Top + Middle", className: "source-top-middle", extraCards: 1 },
    5: { label: "Top + Bottom", className: "source-top-bottom", extraCards: 1 },
    6: { label: "Middle + Bottom", className: "source-middle-bottom", extraCards: 1 },
    7: { label: "All three", className: "source-all", extraCards: 2 },
  };
  const PRECOMPUTED_REPEAT_SOURCE_VARIANTS = new Set(["high", "low", "badeucey", "bdp", "cribbage"]);
  const JACKS_PLUS_REPEAT_VARIANTS = new Set(["low", "badeucey", "cribbage"]);
  const PRECOMPUTED_SOLVER_ID = "trainer-exactdist-20260907b+trainer-exact-jjjplus-20260907b";
  const DEFAULT_SERIAL_MS = {
    high: 360,
    low: 240,
    badeucey: 340,
    bdp: 180,
    cribbage: 190,
  };
  const DEFINITIONS = {
    immediate: {
      title: "Royalty EV",
      copy: "Expected immediate royalties from the highest-scoring legal board. Deals with no legal board contribute zero royalties.",
    },
    repeat: {
      title: "Repeat Fantasyland chance",
      copy: "Chance that the hand contains at least one legal board that returns to Fantasyland. The repeat-first strategy takes that line whenever it exists.",
    },
    line: {
      title: "Repeat-line EV",
      copy: "Average royalties on the best repeat line, conditional on a repeat line existing. Hands with no repeat line are excluded from this average.",
    },
    recursive: {
      title: "Recursive royalty EV",
      copy: "Expected total royalties across this hand and future repeats. Joker games model every future deal from a 54-card deck, weighted by the chance of drawing zero, one, or two jokers. Repeat estimates use Jeffreys smoothing.",
    },
    foul: {
      title: "Foul chance",
      copy: "Chance that no legal board can be made under the selected variant rules. This includes failure to meet any required row qualification.",
    },
    deck: {
      title: "Deck-composition EV",
      copy: "Probability-weighted result before the deal, using the chance of drawing each exact joker count from a deck containing one or two jokers.",
    },
  };

  const cached = loadCache();
  const savedSettings = loadSettings();
  const state = {
    variant: "high",
    running: false,
    abort: false,
    results: cached.results,
    topRepeatJacksPlusResults: cached.topRepeatJacksPlusResults,
    settings: savedSettings,
    cancelRun: null,
    precomputedSamples: 0,
    repeatDetailScenario: "14-0",
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!Core || !TrainerCore) {
      document.body.innerHTML = '<p style="padding:24px;color:#fff">Fantasyland calculation engines did not load.</p>';
      return;
    }
    cacheElements();
    bindEvents();
    state.precomputedSamples = applyPrecomputedResults(window.OFCFantasylandPrecomputed);
    renderVariant();
  }

  function cacheElements() {
    Object.assign(els, {
      variantSummary: document.querySelector("#variant-summary"),
      topRepeatRule: document.querySelector("#top-repeat-rule"),
      topRepeatJacksPlus: document.querySelector("#top-repeat-jacks-plus"),
      sampleCount: document.querySelector("#sample-count"),
      sample100k: document.querySelector("#sample-100k"),
      sampleTotal: document.querySelector("#sample-total"),
      estimateTime: document.querySelector("#estimate-time"),
      estimateDetail: document.querySelector("#estimate-detail"),
      run: document.querySelector("#run-calculator"),
      stop: document.querySelector("#stop-calculator"),
      runStatus: document.querySelector("#run-status"),
      runDetail: document.querySelector("#run-detail"),
      runProgress: document.querySelector("#run-progress"),
      matrixBody: document.querySelector("#matrix-body"),
      matrixTitle: document.querySelector("#matrix-title"),
      matrixMeta: document.querySelector("#matrix-meta"),
      deckMatrixBody: document.querySelector("#deck-matrix-body"),
      deckMatrixMeta: document.querySelector("#deck-matrix-meta"),
      evChart: document.querySelector("#ev-chart"),
      repeatChart: document.querySelector("#repeat-chart"),
      foulChart: document.querySelector("#foul-chart"),
      distributionChart: document.querySelector("#distribution-chart"),
      repeatSourcePanel: document.querySelector("#repeat-source-panel"),
      repeatSourceNote: document.querySelector("#repeat-source-note"),
      repeatSourceChart: document.querySelector("#repeat-source-chart"),
      repeatSourceDetail: document.querySelector("#repeat-source-detail"),
      jokerProbabilityBody: document.querySelector("#joker-probability-body"),
      definitionTitle: document.querySelector("#definition-title"),
      definitionCopy: document.querySelector("#definition-copy"),
      rulesOpen: document.querySelector("#rules-open"),
      rulesDialog: document.querySelector("#rules-dialog"),
      rulesClose: document.querySelector("#rules-close"),
      rulesTabs: document.querySelector("#rules-tabs"),
      rulesContent: document.querySelector("#rules-content"),
    });
  }

  function bindEvents() {
    document.querySelectorAll('input[name="variant"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.abort = state.running;
        if (state.cancelRun) state.cancelRun();
        state.variant = Core.normalizeVariant(input.value);
        renderVariant();
        updateEstimate();
      });
    });
    els.topRepeatJacksPlus.addEventListener("change", () => {
      state.abort = state.running;
      if (state.cancelRun) state.cancelRun();
      state.settings.topRepeatJacksPlus = els.topRepeatJacksPlus.checked;
      saveSettings();
      renderVariant();
      updateEstimate();
    });
    if (els.run) {
      els.run.addEventListener("click", runCalculator);
      els.stop.addEventListener("click", () => {
        state.abort = true;
        els.runStatus.textContent = "Stopping calculation";
        if (state.cancelRun) state.cancelRun();
      });
      els.sampleCount.addEventListener("input", () => {
        state.settings.sampleCount = els.sampleCount.value;
        saveSettings();
        updateEstimate();
      });
      els.sample100k.addEventListener("click", () => {
        els.sampleCount.value = "100000";
        els.sampleCount.dispatchEvent(new Event("input", { bubbles: true }));
        els.sampleCount.focus();
      });
    }
    document.querySelectorAll(".definition-link").forEach((button) => {
      button.addEventListener("click", () => showDefinition(button.dataset.definition));
    });
    els.rulesOpen.addEventListener("click", () => openRules(state.variant));
    els.rulesClose.addEventListener("click", closeRules);
    els.rulesDialog.addEventListener("click", (event) => {
      if (event.target === els.rulesDialog) closeRules();
    });
    window.addEventListener("resize", () => {
      fitRepeatSourceLabels();
      centerDistributionModes();
    });
  }

  function renderVariant() {
    const meta = Core.VARIANTS[state.variant];
    const scenarios = scenariosForVariant(state.variant);
    const jacksPlus = usesJacksPlusTopRepeat();
    const includesHypotheticals = CARD_COUNTS.some((cards) => !Core.supportsVariantCardCount(state.variant, cards));
    els.topRepeatRule.hidden = !JACKS_PLUS_REPEAT_VARIANTS.has(state.variant);
    els.topRepeatJacksPlus.checked = jacksPlus;
    els.variantSummary.textContent = `${meta.short}${jacksPlus ? " Top-row repeats require JJJ or better." : ""}${includesHypotheticals ? " Off-rule card counts are modeled as hypotheticals below." : ""}`;
    const data = getVariantResults();
    renderMatrix(data, scenarios);
    renderDeckMatrix(data);
    renderCharts(data, scenarios);
    renderRepeatSourceLegend();
    renderJokerProbabilities();
    const complete = scenarios.filter((scenario) => data[scenarioKey(scenario)]).length;
    const sampleSummary = resultSampleSummary(data, scenarios);
    els.matrixTitle.textContent = `14–17 card ${meta.label} matrix`;
    const ruleLabel = jacksPlus ? " · JJJ+ top repeats" : "";
    els.matrixMeta.textContent = complete ? `${meta.label}${ruleLabel} · exact trainer solver · ${sampleSummary}` : "No samples yet";
    if (!state.running && els.runStatus) {
      els.runStatus.textContent = complete ? `${meta.label}${ruleLabel} results loaded` : "Ready to calculate";
      els.runDetail.textContent = complete
        ? `${sampleSummary}; trainer-matched solver; ${state.precomputedSamples ? "shared baseline loaded" : "new runs add samples"}`
        : `${scenarios.length} configurations - completed samples save locally`;
      els.runProgress.style.width = complete === scenarios.length ? "100%" : "0%";
    }
  }

  function renderRepeatSourceLegend() {
    const capped = state.variant === "bdp";
    if (els.repeatSourceNote) {
      els.repeatSourceNote.textContent = capped
        ? "Bar width = repeat chance; multi-row colors = multiple repeat paths"
        : "Bar width = repeat chance; multi-row = Super Fantasyland";
    }
    document.querySelectorAll("[data-repeat-extra]").forEach((label) => {
      const paths = Number(label.dataset.repeatExtra);
      label.textContent = capped ? `${paths} paths` : `+${paths - 1} card${paths === 2 ? "" : "s"}`;
    });
  }

  function renderMatrix(data = getVariantResults(), scenarios = scenariosForVariant()) {
    if (!els.matrixBody) return;
    const fragment = document.createDocumentFragment();
    scenarios.forEach((scenario) => {
      const result = data[scenarioKey(scenario)];
      const hypothetical = !Core.supportsVariantCardCount(state.variant, scenario.cards);
      const row = document.createElement("tr");
      row.dataset.config = scenarioKey(scenario);
      row.classList.toggle("is-hypothetical", hypothetical);
      row.innerHTML = `
        <td><span class="hand-label"><i class="joker-dot j${scenario.jokers}"></i><span>${scenario.cards} cards / ${scenario.jokers}J</span>${hypothetical ? '<small>hypothetical</small>' : ""}</span></td>
        <td data-value="immediate">${result ? formatPoints(result.immediate) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="repeat">${result ? formatPct(result.repeatRate) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="repeatLine">${result && result.repeatLine !== null ? formatPoints(result.repeatLine) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="recursive">${result ? formatRecursive(recursiveValueForScenario(data, scenario)) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="foul">${result ? formatPct(resultFoulRate(result)) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="samples">${result ? formatInteger(result.samples) : '<span class="cell-muted">0</span>'}</td>
      `;
      if (result) row.querySelector('[data-value="immediate"]').title = `Standard error +/-${formatPoints(result.standardError)}`;
      fragment.appendChild(row);
    });
    els.matrixBody.replaceChildren(fragment);
  }

  function renderDeckMatrix(data = getVariantResults()) {
    if (!els.deckMatrixBody) return;
    const complete = EXACT_SCENARIOS.every((scenario) => data[scenarioKey(scenario)]);
    if (els.deckMatrixMeta) {
      els.deckMatrixMeta.textContent = complete
        ? "Weighted from exact-hand results"
        : "Complete exact-hand results to calculate";
    }
    const fragment = document.createDocumentFragment();
    CARD_COUNTS.forEach((cards) => DECK_JOKER_COUNTS.forEach((deckJokers) => {
      const result = aggregateDeckResults(data, cards, deckJokers);
      const row = document.createElement("tr");
      row.dataset.deckConfig = `${cards}-${deckJokers}`;
      row.innerHTML = `
        <td><span class="hand-label deck-label"><i class="deck-count">${deckJokers}J</i><span>${cards} cards</span></span></td>
        <td data-value="immediate">${result ? formatPoints(result.immediate) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="repeat">${result ? formatPct(result.repeatRate) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="foul">${result ? formatPct(result.foulRate) : '<span class="cell-muted">--</span>'}</td>
      `;
      fragment.appendChild(row);
    }));
    els.deckMatrixBody.replaceChildren(fragment);
  }

  function aggregateDeckResults(data, cards, deckJokers) {
    const weighted = [];
    for (let jokers = 0; jokers <= deckJokers; jokers += 1) {
      const result = data[scenarioKey({ cards, jokers })];
      if (!result) return null;
      weighted.push({ result, weight: hypergeometricJokers(cards, jokers, deckJokers) });
    }
    return weighted.reduce(
      (total, entry) => {
        total.immediate += finiteNumber(entry.result.immediate) * entry.weight;
        total.repeatRate += finiteNumber(entry.result.repeatRate) * entry.weight;
        total.foulRate += resultFoulRate(entry.result) * entry.weight;
        return total;
      },
      { immediate: 0, repeatRate: 0, foulRate: 0 }
    );
  }

  function recursiveValueForScenario(data, scenario) {
    const current = data[scenarioKey(scenario)];
    if (!current) return NaN;
    const currentRepeat = recursiveRepeatRateFor(current);
    if (scenario.jokers === 0) return finiteNumber(current.strategy) / Math.max(Number.EPSILON, 1 - currentRepeat);

    let futureStrategy = 0;
    let futureRepeat = 0;
    for (let jokers = 0; jokers <= 2; jokers += 1) {
      const future = data[scenarioKey({ cards: scenario.cards, jokers })];
      if (!future) return NaN;
      const weight = hypergeometricJokers(scenario.cards, jokers, 2);
      futureStrategy += finiteNumber(future.strategy) * weight;
      futureRepeat += recursiveRepeatRateFor(future) * weight;
    }
    const continuation = futureStrategy / Math.max(Number.EPSILON, 1 - futureRepeat);
    return finiteNumber(current.strategy) + currentRepeat * continuation;
  }

  function recursiveRepeatRateFor(result) {
    if (Number.isFinite(Number(result?.recursiveRepeatRate))) return Number(result.recursiveRepeatRate);
    const samples = Math.max(0, finiteNumber(result?.samples));
    const repeatCount = Math.max(0, finiteNumber(result?.totals?.repeatCount));
    return samples ? (repeatCount + 0.5) / (samples + 1) : 0;
  }

  function renderCharts(data, scenarios = scenariosForVariant()) {
    const results = scenarios.map((scenario) => ({ scenario, result: data[scenarioKey(scenario)] })).filter((entry) => entry.result);
    if (!results.length) {
      els.evChart.className = "bar-chart empty-chart";
      els.evChart.textContent = "Precomputed configurations will appear here.";
      els.repeatChart.className = "bar-chart empty-chart";
      els.repeatChart.textContent = "Repeat rates will appear here.";
      els.foulChart.className = "bar-chart empty-chart";
      els.foulChart.textContent = "Foul rates will appear here.";
      els.distributionChart.className = "distribution-chart empty-chart";
      els.distributionChart.textContent = "Royalty outcomes will appear here.";
      els.repeatSourcePanel.hidden = true;
      els.repeatSourceDetail?.replaceChildren();
      return;
    }
    const maxImmediate = Math.max(1, ...results.map((entry) => entry.result.immediate));
    renderBarChart(els.evChart, results, (result) => result.immediate, maxImmediate, formatPoints);
    renderBarChart(els.repeatChart, results, (result) => result.repeatRate, 1, formatPct);
    renderBarChart(els.foulChart, results, resultFoulRate, 1, formatPct);
    renderDistributionChart(results);
    renderRepeatSourceChart(results);
  }

  function renderRepeatSourceChart(entries) {
    const complete = PRECOMPUTED_REPEAT_SOURCE_VARIANTS.has(state.variant)
      && entries.length > 0
      && entries.every(({ result }) => hasCompleteRepeatSourceData(result) && hasCompleteRepeatDetailData(result, state.variant, currentTopRepeatMinRank()));
    els.repeatSourcePanel.hidden = !complete;
    if (!complete) {
      els.repeatSourceChart.replaceChildren();
      els.repeatSourceDetail?.replaceChildren();
      return;
    }

    const entryKeys = new Set(entries.map(({ scenario }) => scenarioKey(scenario)));
    if (!entryKeys.has(state.repeatDetailScenario)) state.repeatDetailScenario = scenarioKey(entries[0].scenario);
    const fragment = document.createDocumentFragment();
    entries.forEach(({ scenario, result }) => {
      const key = scenarioKey(scenario);
      const counts = result.totals.repeatSources;
      const samples = finiteNumber(result.samples);
      const sourceTotal = REPEAT_SOURCE_ORDER.reduce((sum, mask) => sum + finiteNumber(counts[mask]), 0);
      const superTotal = [3, 5, 6, 7].reduce((sum, mask) => sum + finiteNumber(counts[mask]), 0);
      const row = document.createElement("button");
      row.type = "button";
      row.className = "repeat-source-row";
      row.classList.toggle("is-selected", key === state.repeatDetailScenario);
      row.dataset.jokers = String(scenario.jokers);
      row.setAttribute("aria-pressed", String(key === state.repeatDetailScenario));
      row.setAttribute("aria-label", `Show repeat details for ${scenario.cards} cards and ${scenario.jokers} jokers`);
      const label = document.createElement("span");
      label.textContent = `${scenario.cards}C / ${scenario.jokers}J`;
      const track = document.createElement("div");
      track.className = "repeat-source-track";
      const ariaParts = [];
      REPEAT_SOURCE_ORDER.forEach((mask) => {
        const count = finiteNumber(counts[mask]);
        if (!count) return;
        const meta = REPEAT_SOURCE_META[mask];
        const allHandsRate = count / samples;
        const repeatShare = sourceTotal ? count / sourceTotal : 0;
        const segment = document.createElement("i");
        segment.className = meta.className;
        segment.style.width = `${(allHandsRate * 100).toFixed(3)}%`;
        const multiPathSuffix = meta.extraCards
          ? state.variant === "bdp"
            ? `, ${meta.extraCards + 1} repeat paths`
            : `, +${meta.extraCards} Fantasyland card${meta.extraCards === 1 ? "" : "s"}`
          : "";
        segment.title = `${meta.label}: ${formatDetailPct(allHandsRate)} of all hands, ${formatDetailPct(repeatShare)} of repeats${multiPathSuffix}`;
        const segmentLabel = document.createElement("b");
        segmentLabel.textContent = formatDetailPct(allHandsRate);
        segment.appendChild(segmentLabel);
        track.appendChild(segment);
        ariaParts.push(`${meta.label} ${formatDetailPct(allHandsRate)}`);
      });
      track.setAttribute("aria-label", ariaParts.join(", "));
      const values = document.createElement("div");
      values.className = "repeat-source-values";
      const multiRowLabel = state.variant === "bdp" ? "multi" : "SF";
      values.innerHTML = `<strong>${formatPct(sourceTotal / samples)}</strong><small>${formatPct(superTotal / samples)} ${multiRowLabel}</small>`;
      row.append(label, track, values);
      if (key === state.repeatDetailScenario) row.appendChild(createRepeatSourceBreakdown(counts, samples));
      row.addEventListener("click", () => {
        state.repeatDetailScenario = key;
        renderRepeatSourceChart(entries);
      });
      fragment.appendChild(row);
    });
    els.repeatSourceChart.replaceChildren(fragment);
    fitRepeatSourceLabels();
    renderRepeatSourceDetail(entries.find(({ scenario }) => scenarioKey(scenario) === state.repeatDetailScenario));
  }

  function createRepeatSourceBreakdown(counts, samples) {
    const breakdown = document.createElement("span");
    breakdown.className = "repeat-source-breakdown";
    breakdown.setAttribute("aria-label", "All repeat-source percentages for this hand");
    REPEAT_SOURCE_ORDER.forEach((mask) => {
      const meta = REPEAT_SOURCE_META[mask];
      const item = document.createElement("span");
      item.innerHTML = `<i class="${meta.className}"></i><b>${meta.label}</b><strong>${formatDetailPct(finiteNumber(counts[mask]) / samples)}</strong>`;
      breakdown.appendChild(item);
    });
    return breakdown;
  }

  function fitRepeatSourceLabels() {
    if (!els.repeatSourceChart) return;
    window.requestAnimationFrame(() => {
      els.repeatSourceChart.querySelectorAll(".repeat-source-track > i > b").forEach((label) => {
        const segment = label.parentElement;
        label.classList.toggle("fits", segment.getBoundingClientRect().width >= label.scrollWidth + 10);
      });
    });
  }

  function hasCompleteRepeatSourceData(result) {
    const counts = result?.totals?.repeatSources;
    if (!Array.isArray(counts) || counts.length < 8) return false;
    const sourceTotal = REPEAT_SOURCE_ORDER.reduce((sum, mask) => sum + finiteNumber(counts[mask]), 0);
    return sourceTotal === finiteNumber(result.totals.repeatCount);
  }

  function hasCompleteRepeatDetailData(result, variant, minimumTopRank = null) {
    const totals = result?.totals;
    const details = totals?.repeatDetails;
    if (
      !details
      || !Array.isArray(details.topTripsByRank)
      || details.topTripsByRank.length < 15
      || !Number.isFinite(Number(details.topBdpWheel))
      || !Array.isArray(details.bottomQuadsByRank)
      || details.bottomQuadsByRank.length < 15
      || !Array.isArray(details.bottomStraightFlushByRank)
      || details.bottomStraightFlushByRank.length < 15
      || !Array.isArray(details.cribbageMiddleByScore)
      || details.cribbageMiddleByScore.length < 30
    ) return false;
    const sourceCounts = totals.repeatSources;
    const topExpected = [1, 3, 5, 7].reduce((sum, mask) => sum + finiteNumber(sourceCounts?.[mask]), 0);
    const bottomExpected = [4, 5, 6, 7].reduce((sum, mask) => sum + finiteNumber(sourceCounts?.[mask]), 0);
    const topTotal = details.topTripsByRank.reduce((sum, count) => sum + finiteNumber(count), 0)
      + finiteNumber(details.topBdpWheel);
    const rankedStraightFlushTotal = details.bottomStraightFlushByRank.reduce((sum, count) => sum + finiteNumber(count), 0);
    const straightFlushTotal = finiteNumber(details.bottomStraightFlush) + finiteNumber(details.bottomRoyalFlush);
    const bottomTotal = details.bottomQuadsByRank.reduce((sum, count) => sum + finiteNumber(count), 0)
      + rankedStraightFlushTotal;
    const middleTotal = details.cribbageMiddleByScore.reduce((sum, count) => sum + finiteNumber(count), 0);
    const middleExpected = variant === "cribbage" ? finiteNumber(totals.qualifyCount) : 0;
    const belowMinimumTopTrips = minimumTopRank === null
      ? 0
      : details.topTripsByRank.slice(0, minimumTopRank).reduce((sum, count) => sum + finiteNumber(count), 0);
    return topTotal === topExpected
      && bottomTotal === bottomExpected
      && rankedStraightFlushTotal === straightFlushTotal
      && middleTotal === middleExpected
      && belowMinimumTopTrips === 0;
  }

  function renderRepeatSourceDetail(entry) {
    if (!els.repeatSourceDetail) return;
    if (!entry) {
      els.repeatSourceDetail.replaceChildren();
      return;
    }
    const { scenario, result } = entry;
    const details = result.totals.repeatDetails;
    const section = document.createElement("section");
    section.className = "repeat-source-detail-content";

    const heading = document.createElement("header");
    heading.className = "repeat-detail-heading";
    heading.innerHTML = `<div><p class="eyebrow">Selected hand</p><h3>${scenario.cards} cards / ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}</h3></div><span>${formatInteger(result.samples)} sampled hands</span>`;

    const groups = document.createElement("div");
    groups.className = "repeat-detail-groups";
    const sourceCounts = result.totals.repeatSources;
    const samples = finiteNumber(result.samples);
    const topRepeatCount = [1, 3, 5, 7].reduce((sum, mask) => sum + finiteNumber(sourceCounts[mask]), 0);
    const middleRepeatCount = [2, 3, 6, 7].reduce((sum, mask) => sum + finiteNumber(sourceCounts[mask]), 0);
    const bottomRepeatCount = [4, 5, 6, 7].reduce((sum, mask) => sum + finiteNumber(sourceCounts[mask]), 0);
    const topEntries = [];
    const minimumTopRank = usesJacksPlusTopRepeat() ? 11 : 2;
    if (state.variant === "bdp") {
      topEntries.push({ label: "A23", count: finiteNumber(details.topBdpWheel) });
    } else {
      for (let rank = 14; rank >= minimumTopRank; rank -= 1) {
        const count = finiteNumber(details.topTripsByRank[rank]);
        topEntries.push({ label: repeatedRankLabel(rank, 3), count });
      }
    }
    const topCondition = state.variant === "bdp"
      ? `A23 Badugi wheel · ${formatPct(topRepeatCount / samples)} of all hands`
      : `${usesJacksPlusTopRepeat() ? "Trip J or better" : "Trips"} · ${formatPct(topRepeatCount / samples)} of all hands`;
    groups.appendChild(createFrequencyGroup("Top", topCondition, topEntries, {
      denominator: samples,
      emptyText: "No top-row repeats in this sample.",
    }));

    if (state.variant === "cribbage") {
      const cribbageEntries = [{ label: "24+ points", count: middleRepeatCount, className: "is-aggregate" }];
      for (let score = details.cribbageMiddleByScore.length - 1; score >= 11; score -= 1) {
        cribbageEntries.push({
          label: `${score} points`,
          count: finiteNumber(details.cribbageMiddleByScore[score]),
          className: score >= 24 ? "is-repeat-qualifier" : "",
        });
      }
      groups.appendChild(createFrequencyGroup(
        "Middle",
        `24+ repeats · ${formatPct(middleRepeatCount / samples)} of all hands`,
        cribbageEntries,
        { denominator: samples }
      ));
    } else {
      const middleCondition = {
        high: "Quads or better",
        low: "7-5-4-3-2 wheel",
        badeucey: "Wheel low + wheel Badugi",
        bdp: "Middle does not trigger repeats in BDP",
      }[state.variant] || "Variant repeat condition";
      const middleEntries = middleRepeatCount
        ? [{ label: middleCondition, count: middleRepeatCount }]
        : [];
      groups.appendChild(createFrequencyGroup("Middle", `${formatPct(middleRepeatCount / samples)} of all hands`, middleEntries, {
        denominator: samples,
        emptyText: state.variant === "bdp" ? "No middle-row repeat condition." : "No middle-row repeats in this sample.",
      }));
    }

    const straightFlushTotal = details.bottomStraightFlushByRank.reduce((sum, count) => sum + finiteNumber(count), 0);
    const quadsTotal = details.bottomQuadsByRank.reduce((sum, count) => sum + finiteNumber(count), 0);
    const bottomEntries = [{ label: "Straight flush", count: straightFlushTotal, className: "is-aggregate" }];
    for (let rank = 14; rank >= 5; rank -= 1) {
      bottomEntries.push({
        label: straightFlushRunLabel(rank),
        count: finiteNumber(details.bottomStraightFlushByRank[rank]),
      });
    }
    bottomEntries.push({ label: "Quads", count: quadsTotal, className: "is-aggregate starts-section" });
    for (let rank = 14; rank >= 2; rank -= 1) {
      const count = finiteNumber(details.bottomQuadsByRank[rank]);
      bottomEntries.push({ label: repeatedRankLabel(rank, 4), count });
    }
    groups.appendChild(createFrequencyGroup("Bottom", `Repeat type · ${formatPct(bottomRepeatCount / samples)} of all hands`, bottomEntries, {
      denominator: samples,
      emptyText: "No bottom-row repeats in this sample.",
    }));

    section.append(heading, groups);
    els.repeatSourceDetail.replaceChildren(section);
  }

  function createFrequencyGroup(title, subtitle, entries, options = {}) {
    const group = document.createElement("section");
    group.className = `repeat-detail-group ${options.className || ""}`.trim();
    group.classList.toggle("is-single", entries.length === 1);
    const header = document.createElement("header");
    header.innerHTML = `<h4>${title}</h4><span>${subtitle}</span>`;
    group.appendChild(header);
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "repeat-detail-empty";
      empty.textContent = options.emptyText || "No matching repeats in this sample.";
      group.appendChild(empty);
      return group;
    }
    const total = entries.reduce((sum, item) => sum + item.count, 0);
    const defaultDenominator = Number.isFinite(options.denominator) ? options.denominator : total;
    const grid = document.createElement("div");
    grid.className = "repeat-frequency-grid";
    entries.forEach(({ label, count, rate: explicitRate, denominator, className }) => {
      const comparisonTotal = Number.isFinite(denominator) ? denominator : defaultDenominator;
      const rate = Number.isFinite(explicitRate) ? explicitRate : comparisonTotal ? count / comparisonTotal : 0;
      const item = document.createElement("div");
      item.className = `repeat-frequency-item ${className || ""}`.trim();
      item.classList.toggle("has-count", count > 0);
      item.innerHTML = `<span>${label}</span><strong>${formatDetailPct(rate)}</strong><i style="width:${(rate * 100).toFixed(3)}%"></i>`;
      item.title = `${formatInteger(count)} of ${formatInteger(comparisonTotal)}`;
      grid.appendChild(item);
    });
    group.appendChild(grid);
    return group;
  }

  function rankLabel(rank) {
    return ({ 14: "A", 13: "K", 12: "Q", 11: "J", 10: "T" })[rank] || String(rank);
  }

  function repeatedRankLabel(rank, count) {
    return rankLabel(rank).repeat(count);
  }

  function straightFlushRunLabel(highRank) {
    const ranks = highRank === 5
      ? [5, 4, 3, 2, 14]
      : Array.from({ length: 5 }, (_, index) => highRank - index);
    const cards = ranks.map(rankLabel).join("");
    return highRank === 14 ? `Royal flush · ${cards}` : cards;
  }

  function formatDetailPct(rate) {
    const percentage = finiteNumber(rate) * 100;
    return `${percentage.toFixed(percentage > 0 && percentage < 1 ? 2 : 1)}%`;
  }

  function renderBarChart(target, entries, valueFor, max, formatter) {
    const fragment = document.createDocumentFragment();
    entries.forEach(({ scenario, result }) => {
      const value = valueFor(result);
      const row = document.createElement("div");
      row.className = "chart-row";
      row.dataset.jokers = String(scenario.jokers);
      row.innerHTML = `
        <span>${scenario.cards}C / ${scenario.jokers}J</span>
        <div class="bar-track"><i style="width:${Math.max(0, Math.min(100, (value / max) * 100)).toFixed(2)}%"></i></div>
        <strong>${formatter(value)}</strong>
      `;
      fragment.appendChild(row);
    });
    target.className = "bar-chart";
    target.replaceChildren(fragment);
  }

  function renderDistributionChart(entries) {
    const fragment = document.createDocumentFragment();
    entries.forEach(({ scenario, result }) => {
      const distribution = Array.from(result.distribution || [], (rate) => finiteNumber(rate));
      let maximum = distribution.length - 1;
      while (maximum > 0 && distribution[maximum] <= 0) maximum -= 1;
      const bins = Array.from({ length: maximum + 1 }, (_, points) => ({ points, rate: distribution[points] || 0 }));
      const mode = bins.reduce((best, bin) => (bin.rate > best.rate ? bin : best), bins[0]);
      const row = document.createElement("div");
      row.className = "distribution-row";
      row.dataset.jokers = String(scenario.jokers);
      const header = document.createElement("header");
      header.innerHTML = `<strong>${scenario.cards} cards / ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}</strong><span>Mode <b>${mode.points} royalties</b> · ${formatDetailPct(mode.rate)}</span>`;
      const viewport = document.createElement("div");
      viewport.className = "distribution-viewport";
      viewport.dataset.modeIndex = String(mode.points);
      const plot = document.createElement("div");
      plot.className = "distribution-plot";
      plot.style.gridTemplateColumns = `repeat(${bins.length}, minmax(30px, 1fr))`;
      plot.style.minWidth = `${bins.length * 34}px`;
      plot.setAttribute("aria-label", bins.map(({ points, rate }) => `${points} royalties ${formatDetailPct(rate)}`).join(", "));
      bins.forEach(({ points, rate }) => {
        const bin = document.createElement("div");
        bin.className = "distribution-bin";
        bin.classList.toggle("is-mode", points === mode.points);
        bin.innerHTML = `<div><i style="height:${Math.max(2, (rate / mode.rate) * 100).toFixed(2)}%"></i></div><strong>${points}</strong><small>${formatDetailPct(rate)}</small>`;
        bin.title = `${points} royalties: ${formatDetailPct(rate)}`;
        plot.appendChild(bin);
      });
      viewport.appendChild(plot);
      row.append(header, viewport);
      fragment.appendChild(row);
    });
    els.distributionChart.className = "distribution-chart";
    els.distributionChart.replaceChildren(fragment);
    window.requestAnimationFrame(centerDistributionModes);
  }

  function centerDistributionModes() {
    if (!els.distributionChart) return;
    els.distributionChart.querySelectorAll(".distribution-viewport").forEach((viewport) => {
      const plot = viewport.firstElementChild;
      const modeIndex = Number(viewport.dataset.modeIndex);
      if (!plot || !Number.isInteger(modeIndex) || modeIndex < 0 || plot.children.length < 1) return;
      const mode = plot.children[modeIndex];
      if (!mode) return;
      viewport.scrollLeft = Math.max(0, mode.offsetLeft + mode.offsetWidth / 2 - viewport.clientWidth / 2);
    });
  }

  async function runCalculator() {
    if (state.running) return;
    const samples = parseSampleCount();
    if (!samples) {
      updateEstimate();
      els.sampleCount.focus();
      return;
    }
    const variant = state.variant;
    const topRepeatMinRank = currentTopRepeatMinRank();
    const resultStore = resultsStoreFor(topRepeatMinRank);
    resultStore[variant] = resultStore[variant] || {};
    const scenarios = scenariosForVariant(variant);
    const total = samples * scenarios.length;
    const runSeed = Core.hashSeed(`${Date.now()}-${Math.random()}-${variant}`).toString(16).padStart(8, "0").toUpperCase();
    const started = performance.now();
    const aggregates = new Map(scenarios.map((scenario) => [scenarioKey(scenario), aggregateFromResult(resultStore[variant][scenarioKey(scenario)])]));
    let completed = 0;
    let lastRender = 0;
    let lastSave = 0;
    let workersUsed = 1;
    state.running = true;
    state.abort = false;
    setRunningUi(true);
    els.runStatus.textContent = "Starting calculation";
    els.runDetail.textContent = `${formatInteger(total)} new hands across ${scenarios.length} configurations`;
    els.runProgress.style.width = "0%";

    const renderProgress = (force = false) => {
      const now = performance.now();
      if (!force && now - lastRender < 180) return;
      if (state.variant !== variant || currentTopRepeatMinRank() !== topRepeatMinRank) return;
      const data = resultStore[variant];
      renderMatrix(data, scenarios);
      renderDeckMatrix(data);
      renderCharts(data, scenarios);
      lastRender = now;
    };

    const handleProgress = (scenario, chunk) => {
      if (!chunk || !chunk.samples) return;
      const key = scenarioKey(scenario);
      const cumulative = aggregates.get(key) || createAggregate();
      mergeAggregate(cumulative, chunk);
      aggregates.set(key, cumulative);
      resultStore[variant][key] = finalizeAggregate(cumulative);
      completed += chunk.samples;

      const elapsed = performance.now() - started;
      const remainingMs = completed ? (elapsed / completed) * Math.max(0, total - completed) : estimateRunMs(samples, variant);
      els.runStatus.textContent = `Calculating ${Core.VARIANTS[variant].label}`;
      els.runDetail.textContent = `${formatInteger(completed)} / ${formatInteger(total)} hands - ${formatDuration(remainingMs)} left`;
      els.runProgress.style.width = `${Math.min(100, (completed / total) * 100).toFixed(2)}%`;
      els.estimateTime.textContent = formatDuration(remainingMs);
      els.estimateDetail.textContent = `${formatInteger(completed)} hands completed`;
      renderProgress();
      if (performance.now() - lastSave >= 1000) {
        saveCache();
        lastSave = performance.now();
      }
    };

    let outcome;
    try {
      if (typeof Worker === "function") {
        outcome = await runWorkerPool({ variant, scenarios, samples, runSeed, topRepeatMinRank, onProgress: handleProgress });
        workersUsed = outcome.workersUsed;
      } else {
        outcome = await runMainThread({ variant, scenarios, samples, runSeed, topRepeatMinRank, onProgress: handleProgress });
      }
    } catch (error) {
      outcome = { stopped: true, error };
    }

    const elapsedSeconds = (performance.now() - started) / 1000;
    state.running = false;
    state.cancelRun = null;
    setRunningUi(false);
    renderProgress(true);
    saveCache();
    if (completed >= Math.min(12, total)) saveBenchmark(variant, (elapsedSeconds * 1000 * workersUsed) / completed);
    if (state.variant !== variant || currentTopRepeatMinRank() !== topRepeatMinRank) {
      state.abort = false;
      renderVariant();
      return;
    }
    if (outcome.error) {
      els.runStatus.textContent = "Calculation interrupted";
      els.runDetail.textContent = `${formatInteger(completed)} new hands saved - ${outcome.error.message || "worker error"}`;
    } else if (state.abort || outcome.stopped) {
      els.runStatus.textContent = "Calculation stopped";
      els.runDetail.textContent = `${formatInteger(completed)} / ${formatInteger(total)} new hands saved`;
    } else {
      els.runStatus.textContent = "Calculation complete";
      els.runDetail.textContent = `${formatInteger(completed)} new hands in ${formatDuration(elapsedSeconds * 1000)} using ${workersUsed} worker${workersUsed === 1 ? "" : "s"}; trainer-matched solver`;
      els.matrixMeta.textContent = `${Core.VARIANTS[variant].label}${topRepeatMinRank === 11 ? " · JJJ+ top repeats" : ""} - ${resultSampleSummary(resultStore[variant], scenarios)}`;
      els.runProgress.style.width = "100%";
    }
    state.abort = false;
    updateEstimate();
  }

  function runWorkerPool({ variant, scenarios, samples, runSeed, topRepeatMinRank, onProgress }) {
    const workerCount = availableWorkerCount();
    const chunkSize = sampleChunkSize(samples);
    return new Promise((resolve, reject) => {
      const workers = [];
      let queueIndex = 0;
      let completedTasks = 0;
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        workers.forEach((worker) => worker.terminate());
        resolve({ workersUsed: workerCount, ...result });
      };

      state.cancelRun = () => finish({ stopped: true });

      const assign = (worker) => {
        if (settled) return;
        if (queueIndex >= scenarios.length) {
          if (completedTasks >= scenarios.length) finish({ stopped: false });
          return;
        }
        const scenario = scenarios[queueIndex];
        const taskId = queueIndex;
        queueIndex += 1;
        worker.postMessage({ type: "run", taskId, variant, scenario, samples, runSeed, chunkSize, topRepeatMinRank });
      };

      for (let index = 0; index < workerCount; index += 1) {
        let worker;
        try {
          worker = new Worker("./worker.js?v=20260907a");
        } catch (error) {
          workers.forEach((item) => item.terminate());
          reject(error);
          return;
        }
        workers.push(worker);
        worker.onmessage = (event) => {
          const message = event.data || {};
          if (message.type === "progress") onProgress(message.scenario, message.aggregate);
          if (message.type === "complete") {
            completedTasks += 1;
            assign(worker);
          }
        };
        worker.onerror = (event) => {
          if (settled) return;
          settled = true;
          workers.forEach((item) => item.terminate());
          reject(new Error(event.message || "Calculation worker failed"));
        };
        assign(worker);
      }
    });
  }

  async function runMainThread({ variant, scenarios, samples, runSeed, topRepeatMinRank, onProgress }) {
    state.cancelRun = () => { state.abort = true; };
    for (const scenario of scenarios) {
      for (let sample = 0; sample < samples; sample += 1) {
        if (state.abort || state.variant !== variant) return { stopped: true, workersUsed: 1 };
        await yieldFrame();
        const seedText = `EV-${runSeed}-${variant}-${scenario.cards}C-${scenario.jokers}J-${sample}`;
        const ids = Core.dealSeeded(scenario.cards, scenario.jokers, Core.hashSeed(seedText).toString(16));
        const chunk = createAggregate();
        addSample(chunk, solveSample(ids, variant, topRepeatMinRank), variant);
        onProgress(scenario, chunk);
      }
    }
    return { stopped: false, workersUsed: 1 };
  }

  function createAggregate() {
    return {
      samples: 0,
      immediateSum: 0,
      immediateSquared: 0,
      strategySum: 0,
      repeatCount: 0,
      repeatPointSum: 0,
      repeatSources: Array(8).fill(0),
      repeatDetails: createRepeatDetails(),
      qualifyCount: 0,
      distribution: Array(ROYALTY_DISTRIBUTION_SIZE).fill(0),
    };
  }

  function mergeAggregate(target, source) {
    target.samples += finiteNumber(source.samples);
    target.immediateSum += finiteNumber(source.immediateSum);
    target.immediateSquared += finiteNumber(source.immediateSquared);
    target.strategySum += finiteNumber(source.strategySum);
    target.repeatCount += finiteNumber(source.repeatCount);
    target.repeatPointSum += finiteNumber(source.repeatPointSum);
    target.repeatSources = target.repeatSources.map((value, index) => value + finiteNumber(source.repeatSources?.[index]));
    mergeRepeatDetails(target.repeatDetails, source.repeatDetails);
    target.qualifyCount += finiteNumber(source.qualifyCount);
    target.distribution = target.distribution.map((value, index) => value + finiteNumber(source.distribution?.[index]));
    return target;
  }

  function aggregateFromResult(result) {
    if (!result || !finiteNumber(result.samples)) return createAggregate();
    if (result.totals && finiteNumber(result.totals.samples) === finiteNumber(result.samples)) {
      return {
        samples: finiteNumber(result.totals.samples),
        immediateSum: finiteNumber(result.totals.immediateSum),
        immediateSquared: finiteNumber(result.totals.immediateSquared),
        strategySum: finiteNumber(result.totals.strategySum),
        repeatCount: finiteNumber(result.totals.repeatCount),
        repeatPointSum: finiteNumber(result.totals.repeatPointSum),
        repeatSources: Array.from({ length: 8 }, (_, index) => finiteNumber(result.totals.repeatSources?.[index])),
        repeatDetails: copyRepeatDetails(result.totals.repeatDetails),
        qualifyCount: finiteNumber(result.totals.qualifyCount),
        distribution: Array.from({ length: ROYALTY_DISTRIBUTION_SIZE }, (_, index) => finiteNumber(result.totals.distribution?.[index])),
      };
    }

    const samples = Math.max(0, Math.round(finiteNumber(result.samples)));
    const immediate = finiteNumber(result.immediate);
    const variance = Math.pow(finiteNumber(result.standardError), 2) * samples;
    const rawDistribution = Array.from({ length: ROYALTY_DISTRIBUTION_SIZE }, (_, index) => finiteNumber(result.distribution?.[index]) * samples);
    const distribution = rawDistribution.map(Math.floor);
    let remainder = samples - distribution.reduce((sum, value) => sum + value, 0);
    const fractionalOrder = rawDistribution.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((left, right) => right.fraction - left.fraction);
    for (let index = 0; remainder > 0; index = (index + 1) % fractionalOrder.length) {
      distribution[fractionalOrder[index].index] += 1;
      remainder -= 1;
    }
    while (remainder < 0) {
      const largest = distribution.indexOf(Math.max(...distribution));
      distribution[largest] -= 1;
      remainder += 1;
    }
    const repeatCount = Math.round(finiteNumber(result.repeatRate) * samples);
    return {
      samples,
      immediateSum: immediate * samples,
      immediateSquared: (variance + immediate * immediate) * samples,
      strategySum: finiteNumber(result.strategy) * samples,
      repeatCount,
      repeatPointSum: finiteNumber(result.repeatLine) * repeatCount,
      repeatSources: Array(8).fill(0),
      repeatDetails: createRepeatDetails(),
      qualifyCount: Math.round((1 - resultFoulRate(result)) * samples),
      distribution,
    };
  }

  function solveSample(ids, variant, topRepeatMinRank = null) {
    const solved = TrainerCore.solveVariantHand(ids, variant, {
      allowUnsupportedCardCount: true,
      ...(topRepeatMinRank === null ? {} : { topRepeatMinRank }),
    });
    if (variant === "high" && !solved.best) throw new Error("High Fantasyland must always have a legal board.");
    return solved;
  }

  function addSample(aggregate, solved, variant) {
    const immediate = solved.bestRoyalty ? finiteNumber(solved.bestRoyalty.points) : 0;
    const strategy = solved.best ? finiteNumber(solved.best.points) : 0;
    aggregate.samples += 1;
    aggregate.immediateSum += immediate;
    aggregate.immediateSquared += immediate * immediate;
    aggregate.strategySum += strategy;
    aggregate.distribution[Math.max(0, Math.min(ROYALTY_DISTRIBUTION_SIZE - 1, Math.trunc(immediate)))] += 1;
    if (solved.best) aggregate.qualifyCount += 1;
    if (solved.bestRepeat) {
      aggregate.repeatCount += 1;
      aggregate.repeatPointSum += finiteNumber(solved.bestRepeat.points);
      const repeatMask = Math.trunc(finiteNumber(solved.bestRepeat.repeatMask));
      if (repeatMask >= 1 && repeatMask <= 7) aggregate.repeatSources[repeatMask] += 1;
      const repeatDetail = TrainerCore.repeatDetailForSolution(solved.bestRepeat);
      if (repeatDetail.topBdpWheel) aggregate.repeatDetails.topBdpWheel += 1;
      if (repeatDetail.topTripsRank >= 2 && repeatDetail.topTripsRank <= 14) {
        aggregate.repeatDetails.topTripsByRank[repeatDetail.topTripsRank] += 1;
      }
      if (repeatDetail.bottomKind === "quads" && repeatDetail.bottomQuadsRank >= 2 && repeatDetail.bottomQuadsRank <= 14) {
        aggregate.repeatDetails.bottomQuadsByRank[repeatDetail.bottomQuadsRank] += 1;
      } else if (repeatDetail.bottomKind === "straight-flush" || repeatDetail.bottomKind === "royal-flush") {
        if (repeatDetail.bottomKind === "royal-flush") aggregate.repeatDetails.bottomRoyalFlush += 1;
        else aggregate.repeatDetails.bottomStraightFlush += 1;
        if (repeatDetail.bottomStraightFlushRank >= 5 && repeatDetail.bottomStraightFlushRank <= 14) {
          aggregate.repeatDetails.bottomStraightFlushByRank[repeatDetail.bottomStraightFlushRank] += 1;
        }
      }
    }
    if (variant === "cribbage" && solved.best) {
      const score = TrainerCore.repeatDetailForSolution(solved.best).middleCribbagePoints;
      if (!Number.isInteger(score) || score < 0 || score >= aggregate.repeatDetails.cribbageMiddleByScore.length) {
        throw new Error(`Unexpected Cribbage middle score: ${score}`);
      }
      aggregate.repeatDetails.cribbageMiddleByScore[score] += 1;
    }
  }

  function createRepeatDetails() {
    return {
      topTripsByRank: Array(15).fill(0),
      topBdpWheel: 0,
      bottomQuadsByRank: Array(15).fill(0),
      bottomStraightFlushByRank: Array(15).fill(0),
      bottomStraightFlush: 0,
      bottomRoyalFlush: 0,
      cribbageMiddleByScore: Array(30).fill(0),
    };
  }

  function copyRepeatDetails(value) {
    return {
      topTripsByRank: Array.from({ length: 15 }, (_, index) => finiteNumber(value?.topTripsByRank?.[index])),
      topBdpWheel: finiteNumber(value?.topBdpWheel),
      bottomQuadsByRank: Array.from({ length: 15 }, (_, index) => finiteNumber(value?.bottomQuadsByRank?.[index])),
      bottomStraightFlushByRank: Array.from({ length: 15 }, (_, index) => finiteNumber(value?.bottomStraightFlushByRank?.[index])),
      bottomStraightFlush: finiteNumber(value?.bottomStraightFlush),
      bottomRoyalFlush: finiteNumber(value?.bottomRoyalFlush),
      cribbageMiddleByScore: Array.from({ length: 30 }, (_, index) => finiteNumber(value?.cribbageMiddleByScore?.[index])),
    };
  }

  function mergeRepeatDetails(target, source) {
    const incoming = copyRepeatDetails(source);
    target.topTripsByRank = target.topTripsByRank.map((value, index) => value + incoming.topTripsByRank[index]);
    target.topBdpWheel += incoming.topBdpWheel;
    target.bottomQuadsByRank = target.bottomQuadsByRank.map((value, index) => value + incoming.bottomQuadsByRank[index]);
    target.bottomStraightFlushByRank = target.bottomStraightFlushByRank.map((value, index) => value + incoming.bottomStraightFlushByRank[index]);
    target.bottomStraightFlush += incoming.bottomStraightFlush;
    target.bottomRoyalFlush += incoming.bottomRoyalFlush;
    target.cribbageMiddleByScore = target.cribbageMiddleByScore.map((value, index) => value + incoming.cribbageMiddleByScore[index]);
    return target;
  }

  function finalizeAggregate(aggregate) {
    const n = aggregate.samples;
    const immediate = aggregate.immediateSum / n;
    const strategy = aggregate.strategySum / n;
    const repeatRate = aggregate.repeatCount / n;
    const recursiveRepeatRate = (aggregate.repeatCount + 0.5) / (n + 1);
    const variance = Math.max(0, aggregate.immediateSquared / n - immediate * immediate);
    return {
      samples: n,
      immediate,
      strategy,
      repeatRate,
      recursiveRepeatRate,
      repeatLine: aggregate.repeatCount ? aggregate.repeatPointSum / aggregate.repeatCount : null,
      recursive: strategy / (1 - recursiveRepeatRate),
      qualifyRate: aggregate.qualifyCount / n,
      foulRate: 1 - aggregate.qualifyCount / n,
      standardError: Math.sqrt(variance / n),
      distribution: aggregate.distribution.map((count) => count / n),
      repeatSources: aggregate.repeatSources.map((count) => count / n),
      repeatDetails: copyRepeatDetails(aggregate.repeatDetails),
      totals: {
        samples: n,
        immediateSum: aggregate.immediateSum,
        immediateSquared: aggregate.immediateSquared,
        strategySum: aggregate.strategySum,
        repeatCount: aggregate.repeatCount,
        repeatPointSum: aggregate.repeatPointSum,
        repeatSources: aggregate.repeatSources.slice(),
        repeatDetails: copyRepeatDetails(aggregate.repeatDetails),
        qualifyCount: aggregate.qualifyCount,
        distribution: aggregate.distribution.slice(),
      },
    };
  }

  function setRunningUi(running) {
    document.querySelector(".run-bar")?.classList.toggle("is-running", running);
    els.run.disabled = running;
    els.stop.hidden = !running;
    els.sampleCount.disabled = running;
    els.sample100k.disabled = running;
    els.topRepeatJacksPlus.disabled = running;
  }

  function renderJokerProbabilities() {
    const fragment = document.createDocumentFragment();
    CARD_COUNTS.forEach((cards) => DECK_JOKER_COUNTS.forEach((deckJokers) => {
      const probabilities = [0, 1, 2].map((jokers) => (jokers <= deckJokers ? hypergeometricJokers(cards, jokers, deckJokers) : null));
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><strong>${cards} cards</strong><small>${deckJokers}J deck</small></td>
        ${probabilities.map((value) => `<td>${value === null ? '<span class="cell-muted">--</span>' : formatPct(value)}</td>`).join("")}
      `;
      fragment.appendChild(row);
    }));
    els.jokerProbabilityBody.replaceChildren(fragment);
  }

  function hypergeometricJokers(cards, jokers, deckJokers = 2) {
    return (choose(deckJokers, jokers) * choose(52, cards - jokers)) / choose(52 + deckJokers, cards);
  }

  function choose(n, k) {
    if (k < 0 || k > n) return 0;
    const size = Math.min(k, n - k);
    let value = 1;
    for (let index = 1; index <= size; index += 1) value = (value * (n - size + index)) / index;
    return value;
  }

  function showDefinition(key) {
    const definition = DEFINITIONS[key] || DEFINITIONS.immediate;
    els.definitionTitle.textContent = definition.title;
    els.definitionCopy.textContent = definition.copy;
  }

  function openRules(variant) {
    renderRules(variant);
    if (typeof els.rulesDialog.showModal === "function") els.rulesDialog.showModal();
    else els.rulesDialog.setAttribute("open", "");
  }

  function closeRules() {
    if (typeof els.rulesDialog.close === "function" && els.rulesDialog.open) els.rulesDialog.close();
    else els.rulesDialog.removeAttribute("open");
  }

  function renderRules(value) {
    const active = Core.normalizeVariant(value);
    const tabFragment = document.createDocumentFragment();
    Core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.className = variant === active ? "active" : "";
      button.setAttribute("aria-selected", String(variant === active));
      button.textContent = Core.VARIANTS[variant].compactLabel || Core.VARIANTS[variant].label;
      button.addEventListener("click", () => {
        const input = document.querySelector(`input[name="variant"][value="${variant}"]`);
        if (input && !input.checked) {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        renderRules(variant);
      });
      tabFragment.appendChild(button);
    });
    els.rulesTabs.replaceChildren(tabFragment);

    const rules = Core.RULE_SECTIONS.find((section) => section.id === active);
    const article = document.createElement("article");
    article.className = "rules-article";
    const heading = document.createElement("div");
    heading.className = "rules-article-heading";
    const title = document.createElement("h3");
    title.textContent = rules.title;
    const short = document.createElement("p");
    short.textContent = Core.VARIANTS[active].short;
    heading.append(title, short);
    article.appendChild(heading);
    const sections = [];
    if (rules.natural) sections.push(["Natural OFC", rules.natural]);
    sections.push(["Fantasyland board", [rules.qualification]], ["Royalties", rules.scoring]);
    if (rules.fantasy) sections.push(["Enter Fantasyland", [rules.fantasy]]);
    sections.push(["Repeat Fantasyland", [rules.repeat]]);
    if (rules.stacking) sections.push(["Stacking / Super FL", [rules.stacking]]);
    if (rules.superFantasy) sections.push(["Super Fantasyland", [rules.superFantasy]]);
    sections.forEach(([label, lines]) => {
      const section = document.createElement("section");
      const sectionTitle = document.createElement("h4");
      sectionTitle.textContent = label;
      section.appendChild(sectionTitle);
      if (label === "Royalties") {
        section.classList.add("royalties-section");
        section.appendChild(renderRoyaltyGroups(lines));
      } else {
        const list = document.createElement("ul");
        const sectionLines = label === "Repeat Fantasyland" && JACKS_PLUS_REPEAT_VARIANTS.has(active) && state.settings.topRepeatJacksPlus
          ? lines.concat("JJJ+ option: top trips below jacks do not count as a repeat.")
          : lines;
        sectionLines.forEach((line) => {
          const item = document.createElement("li");
          appendRuleLine(item, line);
          list.appendChild(item);
        });
        section.appendChild(list);
      }
      article.appendChild(section);
    });
    if (active === "cribbage") article.appendChild(renderCribbage24PlusHands());
    const note = document.createElement("p");
    note.className = "rules-seed-note";
    note.textContent = "Exact-hand samples use the joker count shown. Off-rule card counts are hypothetical analyses; deals with no legal board score zero royalties and appear in the Foul column.";
    article.appendChild(note);
    els.rulesContent.replaceChildren(article);
    els.rulesContent.scrollTop = 0;
  }

  function renderRoyaltyGroups(groups) {
    const wrapper = document.createElement("div");
    wrapper.className = "royalty-groups";
    groups.forEach((group) => {
      const block = document.createElement("div");
      block.className = "royalty-group";
      const title = document.createElement("h5");
      title.textContent = group.label;
      const list = document.createElement("ul");
      list.className = "royalty-list";
      group.items.forEach((line) => {
        const item = document.createElement("li");
        appendRuleLine(item, line);
        list.appendChild(item);
      });
      block.append(title, list);
      wrapper.appendChild(block);
    });
    return wrapper;
  }

  function renderCribbage24PlusHands() {
    const section = document.createElement("section");
    section.className = "cribbage-hand-reference";
    const sectionTitle = document.createElement("h4");
    sectionTitle.textContent = "24+ hands";

    const reference = document.createElement("div");
    reference.className = "cribbage-hand-reference-body";
    const intro = document.createElement("header");
    intro.innerHTML = `
      <div>
        <h5>Complete rank-combination list</h5>
        <p>Five-card patterns after joker substitution. Suits are ignored.</p>
      </div>
    `;
    reference.appendChild(intro);

    Core.CRIBBAGE_24_PLUS_HANDS.forEach((scoreGroup) => {
      const group = document.createElement("div");
      group.className = "cribbage-score-group";
      const heading = document.createElement("div");
      heading.className = "cribbage-score-heading";
      heading.innerHTML = `
        <strong><mark>${scoreGroup.score}</mark> points</strong>
        <span>${scoreGroup.royalties} royalties</span>
      `;
      group.appendChild(heading);

      const hands = document.createElement("div");
      hands.className = "cribbage-hand-list";
      scoreGroup.patterns.forEach((pattern) => {
        const row = document.createElement("div");
        row.className = "cribbage-hand-row";
        const cards = document.createElement("strong");
        cards.className = "cribbage-hand-pattern";
        cards.textContent = pattern.label;
        cards.setAttribute("aria-label", `${pattern.label.split("").join(" ")}${pattern.note ? `, ${pattern.note}` : ""}`);
        if (pattern.note) {
          const note = document.createElement("small");
          note.textContent = ` (${pattern.note})`;
          cards.appendChild(note);
        }

        const explanation = document.createElement("div");
        explanation.className = "cribbage-hand-explanation";
        const breakdown = document.createElement("span");
        breakdown.className = "cribbage-hand-breakdown";
        const visibleComponents = pattern.note
          ? pattern.components.filter(([label]) => !/nobs?/i.test(label))
          : pattern.components;
        visibleComponents.forEach(([label, points], index) => {
          if (index) breakdown.appendChild(document.createTextNode(" + "));
          const term = document.createElement("span");
          term.textContent = `${label} `;
          const value = document.createElement("strong");
          value.textContent = `${points}pt${points === 1 ? "" : "s"}`;
          term.appendChild(value);
          breakdown.appendChild(term);
        });
        explanation.appendChild(breakdown);
        row.append(cards, explanation);
        hands.appendChild(row);
      });
      group.appendChild(hands);
      reference.appendChild(group);
    });

    const gapNote = document.createElement("p");
    gapNote.className = "cribbage-score-gap-note";
    gapNote.textContent = "No five-card hand scores 25, 26, or 27 points under these rules.";
    reference.appendChild(gapNote);
    section.append(sectionTitle, reference);
    return section;
  }

  function appendRuleLine(item, line) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      const term = document.createElement("strong");
      term.className = "rule-term";
      term.textContent = line.slice(0, separator);
      item.appendChild(term);
      appendRuleDetail(item, line.slice(separator + 1));
      return;
    }
    appendRuleDetail(item, line);
  }

  function appendRuleDetail(item, text) {
    const detail = document.createElement("span");
    detail.className = "rule-detail";
    String(text).split(/(\b\d+(?:[-–]\d+)?(?:pts?)?\+?\b|\b(?:Fantasyland|Badugi|blackjack|flush|flushes|straight|pair|pairs|trips|quads|royal flush|foul|bust)\b)/gi).forEach((token) => {
      if (!token) return;
      if (/^\d/.test(token)) {
        const value = document.createElement("mark");
        value.className = "rule-number";
        value.textContent = token;
        detail.appendChild(value);
      } else if (/^(?:Fantasyland|Badugi|blackjack|flush|flushes|straight|pair|pairs|trips|quads|royal flush|foul|bust)$/i.test(token)) {
        const keyword = document.createElement("em");
        keyword.className = /^(?:foul|bust)$/i.test(token) ? "rule-keyword danger" : "rule-keyword";
        keyword.textContent = token;
        detail.appendChild(keyword);
      } else {
        detail.appendChild(document.createTextNode(token));
      }
    });
    item.appendChild(detail);
  }

  function usesJacksPlusTopRepeat(variant = state.variant) {
    return JACKS_PLUS_REPEAT_VARIANTS.has(variant) && Boolean(state.settings.topRepeatJacksPlus);
  }

  function currentTopRepeatMinRank() {
    return usesJacksPlusTopRepeat() ? 11 : null;
  }

  function resultsStoreFor(topRepeatMinRank = null) {
    return topRepeatMinRank === 11 ? state.topRepeatJacksPlusResults : state.results;
  }

  function getVariantResults(variant = state.variant, topRepeatMinRank = currentTopRepeatMinRank()) {
    return resultsStoreFor(topRepeatMinRank)[variant] || {};
  }

  function scenarioKey(scenario) {
    return `${scenario.cards}-${scenario.jokers}`;
  }

  function scenariosForVariant() {
    return EXACT_SCENARIOS;
  }

  function parseSampleCount() {
    const value = Number(els.sampleCount?.value);
    if (!Number.isFinite(value) || value < 1 || !Number.isSafeInteger(value) || value > Math.floor(Number.MAX_SAFE_INTEGER / EXACT_SCENARIOS.length)) return null;
    return value;
  }

  function updateEstimate() {
    if (!els.sampleCount || !els.estimateTime) return;
    const samples = parseSampleCount();
    const valid = Boolean(samples);
    els.sampleCount.setCustomValidity(valid ? "" : "Enter a whole number of at least 1.");
    if (!state.running) els.run.disabled = !valid;
    if (!valid) {
      els.sampleTotal.textContent = "Enter a whole number of at least 1";
      els.estimateTime.textContent = "--";
      els.estimateDetail.textContent = "Waiting for a valid sample count";
      return;
    }
    const total = samples * EXACT_SCENARIOS.length;
    const workers = availableWorkerCount();
    const calibrated = finiteNumber(state.settings.benchmarks?.[state.variant]?.serialMsPerDeal) > 0;
    els.sampleTotal.textContent = `${formatInteger(total)} hands total`;
    els.estimateTime.textContent = `~${formatDuration(estimateRunMs(samples, state.variant))}`;
    els.estimateDetail.textContent = `${workers} worker${workers === 1 ? "" : "s"}; ${calibrated ? "calibrated" : "initial estimate"}`;
  }

  function estimateRunMs(samples, variant = state.variant) {
    const saved = finiteNumber(state.settings.benchmarks?.[variant]?.serialMsPerDeal);
    const serialMs = saved > 0 ? saved : DEFAULT_SERIAL_MS[variant] || 220;
    return (samples * EXACT_SCENARIOS.length * serialMs) / availableWorkerCount();
  }

  function saveBenchmark(variant, serialMsPerDeal) {
    if (!Number.isFinite(serialMsPerDeal) || serialMsPerDeal <= 0) return;
    state.settings.benchmarks = state.settings.benchmarks || {};
    const previous = finiteNumber(state.settings.benchmarks[variant]?.serialMsPerDeal);
    state.settings.benchmarks[variant] = {
      serialMsPerDeal: previous > 0 ? previous * 0.65 + serialMsPerDeal * 0.35 : serialMsPerDeal,
      updatedAt: new Date().toISOString(),
    };
    saveSettings();
  }

  function availableWorkerCount() {
    const hardware = typeof navigator !== "undefined" ? finiteNumber(navigator.hardwareConcurrency) : 1;
    return Math.min(EXACT_SCENARIOS.length, 8, Math.max(1, Math.floor(hardware || 2) - 1));
  }

  function sampleChunkSize(samples) {
    if (samples <= 24) return 1;
    if (samples <= 240) return 2;
    if (samples <= 2400) return 5;
    if (samples <= 24000) return 10;
    return 25;
  }

  function resultSampleSummary(data, scenarios = EXACT_SCENARIOS) {
    const counts = scenarios.map((scenario) => finiteNumber(data?.[scenarioKey(scenario)]?.samples)).filter((value) => value > 0);
    if (!counts.length) return "no samples";
    const minimum = Math.min(...counts);
    const maximum = Math.max(...counts);
    return minimum === maximum
      ? `${formatInteger(minimum)} samples/config`
      : `${formatInteger(minimum)}-${formatInteger(maximum)} samples/config`;
  }

  function applyPrecomputedResults(dataset) {
    const target = finiteNumber(dataset?.samplesPerConfig);
    if (
      dataset?.schemaVersion !== 1
      || dataset?.solver !== PRECOMPUTED_SOLVER_ID
      || target < 10000
      || !dataset.results
      || !dataset.topRepeatJacksPlusResults
    ) return 0;
    const complete = Core.ACTIVE_VARIANT_ORDER.every((variant) => EXACT_SCENARIOS.every((scenario) => {
      const result = dataset.results?.[variant]?.[scenarioKey(scenario)];
      return finiteNumber(result?.samples) >= target
        && finiteNumber(result?.totals?.samples) === finiteNumber(result?.samples)
        && hasExactDistributionData(result)
        && (!PRECOMPUTED_REPEAT_SOURCE_VARIANTS.has(variant)
          || (hasCompleteRepeatSourceData(result) && hasCompleteRepeatDetailData(result, variant, null)));
    }));
    const jacksPlusComplete = Array.from(JACKS_PLUS_REPEAT_VARIANTS).every((variant) => EXACT_SCENARIOS.every((scenario) => {
      const result = dataset.topRepeatJacksPlusResults?.[variant]?.[scenarioKey(scenario)];
      return finiteNumber(result?.samples) >= target
        && finiteNumber(result?.totals?.samples) === finiteNumber(result?.samples)
        && hasExactDistributionData(result)
        && hasCompleteRepeatSourceData(result)
        && hasCompleteRepeatDetailData(result, variant, 11);
    }));
    if (!complete || !jacksPlusComplete) return 0;

    Core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
      state.results[variant] = state.results[variant] || {};
      EXACT_SCENARIOS.forEach((scenario) => {
        const key = scenarioKey(scenario);
        const baseline = dataset.results[variant][key];
        const local = state.results[variant][key];
        if (!local || finiteNumber(local.samples) < finiteNumber(baseline.samples)) state.results[variant][key] = baseline;
      });
    });
    JACKS_PLUS_REPEAT_VARIANTS.forEach((variant) => {
      state.topRepeatJacksPlusResults[variant] = state.topRepeatJacksPlusResults[variant] || {};
      EXACT_SCENARIOS.forEach((scenario) => {
        const key = scenarioKey(scenario);
        const baseline = dataset.topRepeatJacksPlusResults[variant][key];
        const local = state.topRepeatJacksPlusResults[variant][key];
        if (!local || finiteNumber(local.samples) < finiteNumber(baseline.samples)) state.topRepeatJacksPlusResults[variant][key] = baseline;
      });
    });
    saveCache();
    return target;
  }

  function resultFoulRate(result) {
    if (Number.isFinite(Number(result?.foulRate))) return Number(result.foulRate);
    return 1 - finiteNumber(result?.qualifyRate);
  }

  function hasExactDistributionData(result) {
    const counts = result?.totals?.distribution;
    return Array.isArray(counts)
      && counts.length === ROYALTY_DISTRIBUTION_SIZE
      && counts.reduce((sum, count) => sum + finiteNumber(count), 0) === finiteNumber(result?.samples);
  }

  function finiteNumber(value) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  function formatPoints(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "--";
  }

  function formatPct(value) {
    return `${(finiteNumber(value) * 100).toFixed(1)}%`;
  }

  function formatRecursive(value) {
    return Number.isFinite(value) ? formatPoints(value) : "--";
  }

  function formatInteger(value) {
    return Math.max(0, Math.round(finiteNumber(value))).toLocaleString("en-US");
  }

  function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.ceil(finiteNumber(milliseconds) / 1000));
    if (seconds < 1) return "<1s";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
    const days = Math.floor(hours / 24);
    return `${days}d ${String(hours % 24).padStart(2, "0")}h`;
  }

  function yieldFrame() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  function loadCache() {
    try {
      return parseResultsCache(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return { results: {}, topRepeatJacksPlusResults: {} };
    }
  }

  function parseResultsCache(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      if (
        !parsed
        || typeof parsed !== "object"
        || parsed.schemaVersion !== CACHE_SCHEMA_VERSION
        || parsed.solver !== PRECOMPUTED_SOLVER_ID
        || !parsed.results
        || typeof parsed.results !== "object"
        || !parsed.topRepeatJacksPlusResults
        || typeof parsed.topRepeatJacksPlusResults !== "object"
      ) return { results: {}, topRepeatJacksPlusResults: {} };
      return {
        results: parsed.results,
        topRepeatJacksPlusResults: parsed.topRepeatJacksPlusResults,
      };
    } catch (error) {
      return { results: {}, topRepeatJacksPlusResults: {} };
    }
  }

  function loadSettings() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        schemaVersion: CACHE_SCHEMA_VERSION,
        solver: PRECOMPUTED_SOLVER_ID,
        results: state.results,
        topRepeatJacksPlusResults: state.topRepeatJacksPlusResults,
      }));
    } catch (error) {
      // Storage is optional; calculations still work without it.
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (error) {
      // Device calibration is optional.
    }
  }

  window.OFCFantasylandEV = {
    aggregateDeckResults,
    aggregateFromResult,
    applyPrecomputedResults,
    finalizeAggregate,
    formatDuration,
    hypergeometricJokers,
    mergeAggregate,
    parseResultsCache,
    recursiveValueForScenario,
    sampleChunkSize,
    scenariosForVariant,
    solveSample,
    definitions: DEFINITIONS,
  };
})();
