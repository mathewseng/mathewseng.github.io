(function () {
  "use strict";

  const Core = window.OFCFantasylandCore;
  const STORAGE_KEY = "ofcFantasylandEv.v16";
  const CACHE_SCHEMA_VERSION = 3;
  const SETTINGS_KEY = "ofcFantasylandEv.settings.v3";
  const SECTION_KEY = "ofcFantasylandEv.section";
  const SECTION_IDS = ["overview", "repeat", "matrix", "rules"];
  // Hashes and saved sections from before the Royalty EV, Repeat and Foul tabs
  // merged into the overview: they still deep-link to the overview with the
  // matching metric selected. "charts" is the folded report page's chart tab.
  const LEGACY_SECTIONS = {
    ev: { section: "overview", metric: "immediate" },
    foul: { section: "overview", metric: "foul" },
    charts: { section: "overview", metric: "immediate" },
  };
  // Tabs whose charts and tables use the joker hues (and so show the legend).
  const JOKER_LEGEND_SECTIONS = new Set(["overview", "matrix"]);
  // Phones: the matrix head row is visually hidden (styles.css, max-width 680px).
  const PHONE_MATRIX_QUERY = "(max-width: 680px)";
  const METRICS = {
    immediate: { title: "Royalty EV by hand", note: "Expected immediate royalties from the best legal board · higher is better" },
    repeat: { title: "Repeat chance by hand", note: "Chance that at least one legal board returns to Fantasyland" },
    foul: { title: "Foul chance by hand", note: "Chance that no legal board exists · lower is better" },
  };
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
    results: cached.results,
    topRepeatJacksPlusResults: cached.topRepeatJacksPlusResults,
    settings: savedSettings,
    precomputedSamples: 0,
    repeatDetailScenario: "13-0",
    section: "overview",
    metric: "immediate",
  };

  const els = {};
  let sectionTabs = null;
  let rulesTabs = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    // The tabs work without the engine, so a failed load still leaves the page navigable.
    applyLegacySection();
    bindSectionTabs();
    bindMatrixHeadFocus();
    if (!Core) {
      showEngineFailure();
      return;
    }
    bindEvents();
    state.precomputedSamples = applyPrecomputedResults(window.OFCFantasylandPrecomputed);
    renderDatasetMeta(window.OFCFantasylandPrecomputed);
    buildRulesTabs();
    setMetric(state.metric);
    renderVariant();
  }

  function showEngineFailure() {
    announce("The Fantasyland engine did not load, so the charts cannot be drawn. Reload the page to try again.");
    const unavailable = "Unavailable: the Fantasyland engine did not load.";
    if (els.datasetSamples) {
      els.datasetSamples.textContent = "Engine not loaded";
      els.datasetSamples.classList.replace("badge--accent", "badge--bad");
    }
    document.querySelectorAll(".empty-chart").forEach((chart) => {
      chart.textContent = unavailable;
    });
    if (els.matrixMeta) els.matrixMeta.textContent = "Engine not loaded";
    if (els.deckMatrixMeta) els.deckMatrixMeta.textContent = "Engine not loaded";
    if (els.repeatSourceEmpty) {
      els.repeatSourceEmpty.hidden = false;
      const copy = els.repeatSourceEmpty.querySelector("p");
      if (copy) copy.textContent = unavailable;
    }
    if (els.rulesContent) {
      const copy = document.createElement("p");
      copy.className = "chart-note";
      copy.textContent = unavailable;
      els.rulesContent.replaceChildren(copy);
    }
  }

  // Polite status line (#ev-status): short confirmations of what a click changed.
  function say(message) {
    if (!els.status) return;
    els.status.textContent = "";
    window.setTimeout(() => {
      els.status.textContent = message;
    }, 30);
  }

  // On phones the matrix head row is visually hidden; its definition links
  // leave the tab order there (the chip row above the cards replaces them).
  function bindMatrixHeadFocus() {
    if (!window.matchMedia) return;
    const query = window.matchMedia(PHONE_MATRIX_QUERY);
    const apply = () => {
      document.querySelectorAll(".matrix-table thead .definition-link").forEach((button) => {
        if (query.matches) button.tabIndex = -1;
        else button.removeAttribute("tabindex");
      });
    };
    apply();
    if (query.addEventListener) query.addEventListener("change", apply);
  }

  function cacheElements() {
    Object.assign(els, {
      alerts: document.querySelector("#alerts"),
      status: document.querySelector("#ev-status"),
      jokerLegend: document.querySelector("#joker-legend"),
      datasetSamples: document.querySelector("#dataset-samples"),
      datasetDate: document.querySelector("#dataset-date"),
      variantSummary: document.querySelector("#variant-summary"),
      topRepeatRule: document.querySelector("#top-repeat-rule"),
      topRepeatJacksPlus: document.querySelector("#top-repeat-jacks-plus"),
      hypotheticalLegend: document.querySelector("#hypothetical-legend"),
      summaryGrid: document.querySelector("#summary-grid"),
      insightList: document.querySelector("#insight-list"),
      metricTitle: document.querySelector("#metric-title"),
      metricNote: document.querySelector("#metric-note"),
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
      repeatSourceEmpty: document.querySelector("#repeat-source-empty"),
      repeatSourceNote: document.querySelector("#repeat-source-note"),
      repeatSourceChart: document.querySelector("#repeat-source-chart"),
      repeatSourceDetail: document.querySelector("#repeat-source-detail"),
      jokerProbabilityBody: document.querySelector("#joker-probability-body"),
      definitionTitle: document.querySelector("#definition-title"),
      definitionCopy: document.querySelector("#definition-copy"),
      rulesTabs: document.querySelector("#rules-tabs"),
      rulesContent: document.querySelector("#rules-content"),
      sectionTabs: document.querySelector("#section-tabs"),
    });
  }

  function bindEvents() {
    document.querySelectorAll('input[name="variant"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.variant = Core.normalizeVariant(input.value);
        renderVariant();
      });
    });
    document.querySelectorAll('input[name="metric"]').forEach((input) => {
      input.addEventListener("change", () => setMetric(input.value));
    });
    els.topRepeatJacksPlus.addEventListener("change", () => {
      state.settings.topRepeatJacksPlus = els.topRepeatJacksPlus.checked;
      saveSettings();
      renderVariant();
    });
    document.querySelectorAll("button[data-definition]").forEach((button) => {
      button.addEventListener("click", () => showDefinition(button.dataset.definition));
    });
    window.addEventListener("resize", () => {
      fitRepeatSourceLabels();
      centerDistributionModes();
    });
  }

  // Map a pre-merge hash or saved section onto the overview and its metric
  // before the shared tab helper reads them.
  function applyLegacySection() {
    const hash = normalizeHash();
    let saved = null;
    try {
      saved = localStorage.getItem(SECTION_KEY);
    } catch (error) {
      // localStorage unavailable; the hash alone decides.
    }
    const legacy = LEGACY_SECTIONS[hash] || (!SECTION_IDS.includes(hash) && LEGACY_SECTIONS[saved]) || null;
    if (!legacy) return;
    state.metric = legacy.metric;
    if (LEGACY_SECTIONS[hash] && window.history?.replaceState) window.history.replaceState(null, "", `#${legacy.section}`);
    if (LEGACY_SECTIONS[saved]) {
      try {
        localStorage.setItem(SECTION_KEY, legacy.section);
      } catch (error) {
        // Ignore storage failures; the hash carries the section.
      }
    }
  }

  // The report redirect appends the old page's hash and query after its own
  // target hash (/ofc/fantasyland-report/#matrix arrives as #overview#matrix,
  // ?x=1 as #overview?x=1). Keep the last known section in the chain.
  function normalizeHash() {
    let raw = window.location.hash.replace(/^#/, "");
    try {
      raw = decodeURIComponent(raw);
    } catch (error) {
      // Malformed escapes: use the hash as written.
    }
    if (!/[#?&]/.test(raw)) return raw;
    const known = raw.split(/[#?&]/).filter((part) => SECTION_IDS.includes(part) || LEGACY_SECTIONS[part]);
    const picked = known.length ? known[known.length - 1] : "";
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${picked ? `#${picked}` : ""}`);
    }
    return picked;
  }

  function bindSectionTabs() {
    if (!els.sectionTabs || !window.Tabs) return;
    sectionTabs = window.Tabs.init(els.sectionTabs, {
      hash: true,
      storageKey: SECTION_KEY,
      onChange: (id) => {
        state.section = id;
        if (els.jokerLegend) els.jokerLegend.hidden = !JOKER_LEGEND_SECTIONS.has(id);
        fitRepeatSourceLabels();
        centerDistributionModes();
      },
    });
  }

  function setMetric(metric) {
    if (!METRICS[metric]) metric = "immediate";
    state.metric = metric;
    const input = document.querySelector(`input[name="metric"][value="${metric}"]`);
    if (input && !input.checked) input.checked = true;
    [els.evChart, els.repeatChart, els.foulChart].forEach((chart) => {
      if (chart) chart.hidden = chart.dataset.metric !== metric;
    });
    if (els.metricTitle) els.metricTitle.textContent = METRICS[metric].title;
    if (els.metricNote) els.metricNote.textContent = METRICS[metric].note;
  }

  function renderDatasetMeta(dataset) {
    if (!els.datasetSamples) return;
    if (!state.precomputedSamples) {
      els.datasetSamples.textContent = "No precomputed dataset loaded";
      els.datasetSamples.classList.remove("badge--accent");
      if (els.datasetDate) els.datasetDate.textContent = "";
      return;
    }
    els.datasetSamples.textContent = `${formatInteger(state.precomputedSamples)} samples per configuration`;
    const generated = new Date(dataset?.generatedAt || "");
    if (els.datasetDate) {
      els.datasetDate.textContent = Number.isNaN(generated.getTime())
        ? "Exact trainer solver"
        : `Exact trainer solver · generated ${generated.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
    }
  }

  function renderVariant() {
    const meta = Core.VARIANTS[state.variant];
    const scenarios = scenariosForVariant(state.variant);
    const jacksPlus = usesJacksPlusTopRepeat();
    const cardCounts = Core.analysisCardCounts(state.variant);
    const includesHypotheticals = cardCounts.some((cards) => !Core.supportsVariantCardCount(state.variant, cards));
    els.topRepeatRule.hidden = !JACKS_PLUS_REPEAT_VARIANTS.has(state.variant);
    els.topRepeatJacksPlus.checked = jacksPlus;
    if (els.hypotheticalLegend) els.hypotheticalLegend.hidden = !includesHypotheticals;
    els.variantSummary.textContent = `${meta.short}${jacksPlus ? " Top-row repeats require JJJ or better." : ""}${includesHypotheticals ? " Off-rule card counts are modeled as hypotheticals." : ""}`;
    const data = getVariantResults();
    renderSummary(data, scenarios);
    renderInsights(data, scenarios);
    renderMatrix(data, scenarios);
    renderDeckMatrix(data);
    renderCharts(data, scenarios);
    renderRepeatSourceLegend();
    renderJokerProbabilities();
    const complete = scenarios.filter((scenario) => data[scenarioKey(scenario)]).length;
    const sampleSummary = resultSampleSummary(data, scenarios);
    els.matrixTitle.textContent = `${cardCounts[0]}–${cardCounts[cardCounts.length - 1]} card ${meta.label} matrix`;
    const ruleLabel = jacksPlus ? " · JJJ+ top repeats" : "";
    els.matrixMeta.textContent = complete ? `${meta.label}${ruleLabel} · exact trainer solver · ${sampleSummary}` : "No samples yet";
    renderRules(state.variant);
  }

  // ---------- Overview: highlights and takeaways ----------

  function supportedEntries(data, scenarios) {
    const entries = scenarios
      .map((scenario) => ({ scenario, result: data[scenarioKey(scenario)] }))
      .filter((entry) => entry.result);
    const supported = entries.filter(({ scenario }) => Core.supportsVariantCardCount(state.variant, scenario.cards));
    return supported.length ? supported : entries;
  }

  function maxBy(items, valueFor) {
    return items.reduce((best, item) => (best === null || valueFor(item) > valueFor(best) ? item : best), null);
  }

  function configLabel(scenario) {
    return `${scenario.cards} cards / ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}`;
  }

  function renderSummary(data, scenarios) {
    if (!els.summaryGrid) return;
    const pool = supportedEntries(data, scenarios);
    if (!pool.length) {
      els.summaryGrid.replaceChildren();
      els.summaryGrid.hidden = true;
      return;
    }
    els.summaryGrid.hidden = false;
    const cardCounts = [...new Set(pool.map(({ scenario }) => scenario.cards))].sort((a, b) => a - b);
    const maxCards = cardCounts[cardCounts.length - 1];
    const top = maxBy(pool, ({ result }) => result.immediate);
    const noJoker = maxBy(pool.filter(({ scenario }) => scenario.jokers === 0), ({ result }) => result.immediate);
    const deck = aggregateDeckResults(data, maxCards, 2);
    const lift = maxBy(
      cardCounts
        .map((cards) => {
          const zero = data[scenarioKey({ cards, jokers: 0 })];
          const two = data[scenarioKey({ cards, jokers: 2 })];
          return zero && two ? { cards, lift: finiteNumber(two.immediate) - finiteNumber(zero.immediate) } : null;
        })
        .filter(Boolean),
      (item) => item.lift
    );
    const stats = [
      ["Top royalty EV", formatPoints(top.result.immediate), configLabel(top.scenario)],
      noJoker ? ["Best without jokers", formatPoints(noJoker.result.immediate), configLabel(noJoker.scenario)] : null,
      deck ? [`${maxCards}-card EV, 2-joker deck`, formatPoints(deck.immediate), `${formatPct(deck.repeatRate)} repeat · weighted before the deal`] : null,
      lift ? ["Largest joker lift", `+${formatPoints(lift.lift)}`, `${lift.cards} cards: 0 to 2 jokers`] : null,
    ].filter(Boolean);
    els.summaryGrid.replaceChildren(
      ...stats.map(([label, value, note]) => {
        const stat = document.createElement("div");
        stat.className = "stat";
        stat.innerHTML = `<span class="stat-label">${label}</span><strong class="stat-value">${value}</strong><span class="stat-delta">${note}</span>`;
        return stat;
      })
    );
  }

  function renderInsights(data, scenarios) {
    if (!els.insightList) return;
    const pool = supportedEntries(data, scenarios);
    if (!pool.length) {
      els.insightList.replaceChildren();
      return;
    }
    const cardCounts = [...new Set(pool.map(({ scenario }) => scenario.cards))].sort((a, b) => a - b);
    const minCards = cardCounts[0];
    const maxCards = cardCounts[cardCounts.length - 1];
    const find = (cards, jokers) => data[scenarioKey({ cards, jokers })];
    const twoJoker = pool.filter(({ scenario }) => scenario.jokers === 2);
    const best = maxBy(pool, ({ result }) => result.immediate);
    const insights = [];

    if (twoJoker.length) {
      const rates = twoJoker.map(({ result }) => finiteNumber(result.repeatRate));
      const low = formatPct(Math.min(...rates));
      const high = formatPct(Math.max(...rates));
      insights.push([
        "Jokers drive repeat equity",
        `Two-joker hands repeat in ${low === high ? low : `${low} to ${high}`} of deals across ${minCards}–${maxCards} cards.`,
      ]);
    }
    if (minCards !== maxCards && find(minCards, 0) && find(maxCards, 0) && find(minCards, 2) && find(maxCards, 2)) {
      insights.push([
        "Card count still matters",
        `Going from ${minCards} to ${maxCards} cards adds ${formatPoints(find(maxCards, 0).immediate - find(minCards, 0).immediate)} royalty EV with no jokers and ${formatPoints(find(maxCards, 2).immediate - find(minCards, 2).immediate)} with two jokers.`,
      ]);
    }
    if (best) {
      insights.push([
        "Best configuration",
        `${configLabel(best.scenario)} leads at ${formatPoints(best.result.immediate)} immediate EV and ${formatPct(best.result.repeatRate)} repeat chance.`,
      ]);
    }
    const deckMax = aggregateDeckResults(data, maxCards, 2);
    const deckMin = aggregateDeckResults(data, minCards, 2);
    if (deckMax && deckMin && minCards !== maxCards) {
      insights.push([
        "Real-deck joker mix",
        `A random ${maxCards}-card hand from a two-joker deck holds both jokers ${formatPct(Core.hypergeometricJokers(maxCards, 2, 2))} of the time; weighted before the deal it is worth ${formatPoints(deckMax.immediate)} against ${formatPoints(deckMin.immediate)} for ${minCards} cards.`,
      ]);
    }
    const fouls = pool.map(({ result }) => resultFoulRate(result));
    const maxFoul = Math.max(...fouls);
    if (maxFoul > 0) {
      const worst = maxBy(pool, ({ result }) => resultFoulRate(result));
      insights.push([
        "Foul risk",
        `Fouls reach ${formatPct(maxFoul)} at ${configLabel(worst.scenario)}; a fouled deal scores zero royalties and counts against the EV above.`,
      ]);
    } else {
      insights.push(["No fouls", `Every ${Core.VARIANTS[state.variant].label} deal has a legal board, so the royalty EV carries no foul discount.`]);
    }

    els.insightList.replaceChildren(
      ...insights.map(([title, body]) => {
        const card = document.createElement("article");
        card.className = "insight-card";
        card.innerHTML = `<strong>${title}</strong><p>${body}</p>`;
        return card;
      })
    );
  }

  // ---------- Repeat sources ----------

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

  // ---------- Matrix tables ----------

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
        <td><span class="hand-label"><i class="joker-dot j${scenario.jokers}" aria-hidden="true"></i><span>${scenario.cards} cards / ${scenario.jokers}J</span>${hypothetical ? '<small class="hypothetical-tag">hypothetical</small>' : ""}</span></td>
        <td class="num" data-label="Royalty EV" data-value="immediate">${result ? formatPoints(result.immediate) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-label="Repeat FL" data-value="repeat">${result ? formatPct(result.repeatRate) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-label="Repeat-line EV" data-value="repeatLine">${result && result.repeatLine !== null ? formatPoints(result.repeatLine) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-label="Recursive EV" data-value="recursive">${result ? formatRecursive(recursiveValueForScenario(data, scenario)) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-label="Foul" data-value="foul">${result ? formatPct(resultFoulRate(result)) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-label="Samples" data-value="samples">${result ? formatInteger(result.samples) : '<span class="cell-muted">0</span>'}</td>
      `;
      if (result) row.querySelector('[data-value="immediate"]').title = `Standard error +/-${formatPoints(result.standardError)}`;
      fragment.appendChild(row);
    });
    els.matrixBody.replaceChildren(fragment);
  }

  function renderDeckMatrix(data = getVariantResults()) {
    if (!els.deckMatrixBody) return;
    const complete = scenariosForVariant().every((scenario) => data[scenarioKey(scenario)]);
    if (els.deckMatrixMeta) {
      els.deckMatrixMeta.textContent = complete
        ? "Weighted from exact-hand results"
        : "Complete exact-hand results to calculate";
    }
    const fragment = document.createDocumentFragment();
    Core.analysisCardCounts(state.variant).forEach((cards) => DECK_JOKER_COUNTS.forEach((deckJokers) => {
      const result = aggregateDeckResults(data, cards, deckJokers);
      const row = document.createElement("tr");
      row.dataset.deckConfig = `${cards}-${deckJokers}`;
      row.innerHTML = `
        <td><span class="hand-label deck-label"><i class="deck-count">${deckJokers}J</i><span>${cards} cards</span></span></td>
        <td class="num" data-value="immediate">${result ? formatPoints(result.immediate) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-value="repeat">${result ? formatPct(result.repeatRate) : '<span class="cell-muted">--</span>'}</td>
        <td class="num" data-value="foul">${result ? formatPct(result.foulRate) : '<span class="cell-muted">--</span>'}</td>
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

  // ---------- Charts ----------

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
      if (els.repeatSourceEmpty) els.repeatSourceEmpty.hidden = false;
      els.repeatSourceDetail?.replaceChildren();
      return;
    }
    const maxImmediate = Math.max(1, ...results.map((entry) => entry.result.immediate));
    renderMetricMatrix(els.evChart, results, "immediate", maxImmediate);
    renderMetricMatrix(els.repeatChart, results, "repeat", 1);
    renderMetricMatrix(els.foulChart, results, "foul", 1);
    renderDistributionChart(results);
    renderRepeatSourceChart(results);
  }

  function renderRepeatSourceChart(entries) {
    const complete = PRECOMPUTED_REPEAT_SOURCE_VARIANTS.has(state.variant)
      && entries.length > 0
      && entries.every(({ result }) => hasCompleteRepeatSourceData(result) && hasCompleteRepeatDetailData(result, state.variant, currentTopRepeatMinRank()));
    els.repeatSourcePanel.hidden = !complete;
    if (els.repeatSourceEmpty) els.repeatSourceEmpty.hidden = complete;
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
      label.className = "repeat-source-label";
      label.textContent = `${scenario.cards}C / ${scenario.jokers}J`;
      const track = document.createElement("span");
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
      track.id = `repeat-track-${key}`;
      const values = document.createElement("span");
      values.className = "repeat-source-values";
      values.id = `repeat-values-${key}`;
      const multiRowLabel = state.variant === "bdp" ? "multi" : "SF";
      values.innerHTML = `<strong>${formatPct(sourceTotal / samples)}</strong><small>${formatPct(superTotal / samples)} ${multiRowLabel}</small>`;
      // The pinned aria-label names the button; the totals and the per-source
      // percentages are its description.
      row.setAttribute("aria-describedby", `${values.id} ${track.id}`);
      row.append(label, track, values);
      if (key === state.repeatDetailScenario) row.appendChild(createRepeatSourceBreakdown(counts, samples));
      row.addEventListener("click", () => {
        state.repeatDetailScenario = key;
        renderRepeatSourceChart(entries);
        els.repeatSourceChart.querySelector(".repeat-source-row.is-selected")?.focus({ preventScroll: true });
        say(`Showing repeat details for ${scenario.cards} cards and ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}.`);
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
      item.innerHTML = `<i class="${meta.className}" aria-hidden="true"></i><b>${meta.label}</b><strong>${formatDetailPct(finiteNumber(counts[mask]) / samples)}</strong>`;
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
    heading.innerHTML = `<div><p class="eyebrow eyebrow--plain">Selected hand</p><h3>${scenario.cards} cards / ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}</h3></div><span>${formatInteger(result.samples)} sampled hands</span>`;

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

  // The overview's metric matrix (the report page's matrix cells): one row per
  // card count, one column per joker count, each cell a value, a bar in the
  // joker hue and a one-line companion metric. Every cell keeps the
  // `.chart-row` hook and names its configuration for screen readers.
  function renderMetricMatrix(target, entries, metric, max) {
    const metricMeta = {
      immediate: { valueFor: (result) => result.immediate, format: formatPoints, meta: (result) => `${formatPct(result.repeatRate)} repeat` },
      repeat: { valueFor: (result) => result.repeatRate, format: formatPct, meta: (result) => `${formatPoints(result.immediate)} EV` },
      foul: { valueFor: resultFoulRate, format: formatPct, meta: (result) => `${formatPoints(result.immediate)} EV` },
    }[metric];
    const byKey = new Map(entries.map((entry) => [scenarioKey(entry.scenario), entry]));
    const cardCounts = [...new Set(entries.map(({ scenario }) => scenario.cards))].sort((a, b) => a - b);
    const fragment = document.createDocumentFragment();
    const head = document.createElement("div");
    head.className = "metric-matrix-head";
    head.setAttribute("aria-hidden", "true");
    head.innerHTML = `<span class="metric-matrix-corner">Cards</span>${[0, 1, 2].map((jokers) => `<span class="metric-matrix-col"><i class="joker-dot j${jokers}"></i>${jokers} joker${jokers === 1 ? "" : "s"}</span>`).join("")}`;
    fragment.appendChild(head);
    cardCounts.forEach((cards) => {
      const hypothetical = !Core.supportsVariantCardCount(state.variant, cards);
      const label = document.createElement("div");
      label.className = "metric-matrix-label";
      label.classList.toggle("is-hypothetical", hypothetical);
      label.innerHTML = `<span>${cards} cards</span>${hypothetical ? '<small class="hypothetical-tag">hypothetical</small>' : ""}`;
      fragment.appendChild(label);
      [0, 1, 2].forEach((jokers) => {
        const entry = byKey.get(scenarioKey({ cards, jokers }));
        if (!entry) {
          const empty = document.createElement("div");
          empty.className = "matrix-cell matrix-cell--empty";
          empty.innerHTML = `<span class="sr-only">${cards} cards, ${jokers} jokers: </span><span class="cell-muted">--</span>`;
          fragment.appendChild(empty);
          return;
        }
        const value = metricMeta.valueFor(entry.result);
        const cell = document.createElement("div");
        cell.className = "chart-row matrix-cell";
        cell.classList.toggle("is-hypothetical", hypothetical);
        cell.dataset.jokers = String(jokers);
        cell.dataset.config = scenarioKey(entry.scenario);
        cell.innerHTML = `
          <span class="sr-only">${configLabel(entry.scenario)}${hypothetical ? " (hypothetical)" : ""}: </span>
          <strong class="matrix-value">${metricMeta.format(value)}</strong>
          <div class="bar-track" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, (value / max) * 100)).toFixed(2)}%"></i></div>
          <span class="matrix-meta">${metricMeta.meta(entry.result)}</span>
        `;
        fragment.appendChild(cell);
      });
    });
    target.className = "bar-chart metric-matrix";
    target.replaceChildren(fragment);
  }

  function renderDistributionChart(entries) {
    const fragment = document.createDocumentFragment();
    // Tappable bins get the 44px touch floor on coarse pointers (the row scrolls sideways).
    const binWidth = window.matchMedia?.("(pointer: coarse)").matches ? 44 : 30;
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
      const title = document.createElement("strong");
      title.textContent = `${scenario.cards} cards / ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}`;
      const readout = document.createElement("span");
      readout.className = "distribution-readout";
      header.append(title, readout);
      const viewport = document.createElement("div");
      viewport.className = "distribution-viewport";
      viewport.dataset.modeIndex = String(mode.points);
      const plot = document.createElement("div");
      plot.className = "distribution-plot";
      plot.tabIndex = 0;
      plot.setAttribute("role", "group");
      plot.style.gridTemplateColumns = `repeat(${bins.length}, minmax(${binWidth}px, 1fr))`;
      plot.style.minWidth = `${bins.length * (binWidth + 4)}px`;
      plot.setAttribute("aria-label", `${title.textContent}: ${bins.map(({ points, rate }) => `${points} royalties ${formatDetailPct(rate)}`).join(", ")}`);
      bins.forEach(({ points, rate }) => {
        const bin = document.createElement("div");
        bin.className = "distribution-bin";
        bin.classList.toggle("is-mode", points === mode.points);
        bin.dataset.points = String(points);
        bin.innerHTML = `<div><i style="height:${Math.max(2, (rate / mode.rate) * 100).toFixed(2)}%"></i></div><strong>${points}</strong>`;
        bin.title = `${points} royalties: ${formatDetailPct(rate)}`;
        plot.appendChild(bin);
      });
      const describe = (points, isMode) => {
        const bin = bins[points];
        readout.innerHTML = `${isMode ? "Mode " : ""}<b>${bin.points} royalties</b> · ${formatDetailPct(bin.rate)}`;
      };
      const activate = (points, { scroll = false } = {}) => {
        const target = plot.children[points];
        if (!target) return;
        plot.querySelector(".is-active")?.classList.remove("is-active");
        target.classList.add("is-active");
        plot.dataset.active = String(points);
        describe(points, points === mode.points);
        if (scroll) target.scrollIntoView({ block: "nearest", inline: "nearest" });
      };
      plot.addEventListener("click", (event) => {
        const bin = event.target.closest(".distribution-bin");
        if (bin) activate(Number(bin.dataset.points));
      });
      plot.addEventListener("keydown", (event) => {
        const current = Number(plot.dataset.active ?? mode.points);
        const next = event.key === "ArrowRight" ? current + 1 : event.key === "ArrowLeft" ? current - 1 : event.key === "Home" ? 0 : event.key === "End" ? bins.length - 1 : null;
        if (next === null || next < 0 || next >= bins.length) return;
        event.preventDefault();
        activate(next, { scroll: true });
      });
      // Keyboard focus marks the mode bin, so the arrow keys start from a visible bin.
      plot.addEventListener("focus", () => {
        if (plot.dataset.active === undefined && plot.matches(":focus-visible")) activate(mode.points, { scroll: true });
      });
      describe(mode.points, true);
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

  function renderJokerProbabilities() {
    const fragment = document.createDocumentFragment();
    Core.analysisCardCounts(state.variant).forEach((cards) => DECK_JOKER_COUNTS.forEach((deckJokers) => {
      const probabilities = [0, 1, 2].map((jokers) => (jokers <= deckJokers ? hypergeometricJokers(cards, jokers, deckJokers) : null));
      const row = document.createElement("tr");
      row.innerHTML = `
        <td><span class="hand-label deck-label"><i class="deck-count">${deckJokers}J</i><span>${cards} cards</span></span></td>
        ${probabilities.map((value) => `<td class="num">${value === null ? '<span class="cell-muted">--</span>' : formatPct(value)}</td>`).join("")}
      `;
      fragment.appendChild(row);
    }));
    els.jokerProbabilityBody.replaceChildren(fragment);
  }

  function hypergeometricJokers(cards, jokers, deckJokers = 2) {
    return Core.hypergeometricJokers(cards, jokers, deckJokers);
  }

  function showDefinition(key) {
    const definition = DEFINITIONS[key] || DEFINITIONS.immediate;
    els.definitionTitle.textContent = definition.title;
    els.definitionCopy.textContent = definition.copy;
    // Wide screens keep the definitions beside the tables; elsewhere bring the
    // swapped copy into view so the click visibly does something.
    const box = els.definitionCopy.getBoundingClientRect();
    if (box.top < 0 || box.bottom > window.innerHeight) {
      els.definitionCopy.closest(".definitions-panel")?.scrollIntoView({ block: "nearest" });
    }
    say(`${definition.title}: ${definition.copy}`);
  }

  // ---------- Rules ----------

  function buildRulesTabs() {
    if (!els.rulesTabs) return;
    const fragment = document.createDocumentFragment();
    Core.ACTIVE_VARIANT_ORDER.forEach((variant) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = `rules-tab-${variant}`;
      button.setAttribute("role", "tab");
      button.dataset.tab = variant;
      button.className = variant === state.variant ? "active" : "";
      button.setAttribute("aria-selected", String(variant === state.variant));
      button.tabIndex = variant === state.variant ? 0 : -1;
      button.textContent = Core.VARIANTS[variant].compactLabel || Core.VARIANTS[variant].label;
      if (!window.Tabs) button.addEventListener("click", () => renderRules(variant));
      fragment.appendChild(button);
    });
    els.rulesTabs.replaceChildren(fragment);
    rulesTabs = window.Tabs ? window.Tabs.init(els.rulesTabs, { onChange: (id) => renderRulesArticle(id) }) : null;
  }

  // The rules tabs only change the article shown; the variant picker above
  // the tabs is the one place the page's variant changes.
  function renderRules(value) {
    const active = Core.normalizeVariant(value);
    if (rulesTabs) {
      if (rulesTabs.current === active) renderRulesArticle(active);
      else rulesTabs.activate(active);
      return;
    }
    els.rulesTabs?.querySelectorAll('[role="tab"]').forEach((button) => {
      const on = button.dataset.tab === active;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", String(on));
      button.tabIndex = on ? 0 : -1;
    });
    renderRulesArticle(active);
  }

  function renderRulesArticle(value) {
    if (!els.rulesContent) return;
    const active = Core.normalizeVariant(value);
    const article = Core.createRulesArticle(document, active, {
      repeatExtra: JACKS_PLUS_REPEAT_VARIANTS.has(active) && state.settings.topRepeatJacksPlus
        ? ["JJJ+ option: top trips below jacks do not count as a repeat."]
        : [],
      note: "Exact-hand samples use the joker count shown. Off-rule card counts are hypothetical analyses; deals with no legal board score zero royalties and appear in the Foul column.",
    });
    els.rulesContent.replaceChildren(article);
    els.rulesContent.scrollTop = 0;
  }

  // ---------- State helpers ----------

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
    return Core.scenarioKey(scenario);
  }

  function scenariosForVariant(variant = state.variant) {
    return Core.analysisScenarios(variant);
  }

  function resultSampleSummary(data, scenarios = scenariosForVariant()) {
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
    const complete = Core.ACTIVE_VARIANT_ORDER.every((variant) => scenariosForVariant(variant).every((scenario) => {
      const result = dataset.results?.[variant]?.[scenarioKey(scenario)];
      return finiteNumber(result?.samples) >= target
        && finiteNumber(result?.totals?.samples) === finiteNumber(result?.samples)
        && hasExactDistributionData(result)
        && (!PRECOMPUTED_REPEAT_SOURCE_VARIANTS.has(variant)
          || (hasCompleteRepeatSourceData(result) && hasCompleteRepeatDetailData(result, variant, null)));
    }));
    const jacksPlusComplete = Array.from(JACKS_PLUS_REPEAT_VARIANTS).every((variant) => scenariosForVariant(variant).every((scenario) => {
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
      scenariosForVariant(variant).forEach((scenario) => {
        const key = scenarioKey(scenario);
        const baseline = dataset.results[variant][key];
        const local = state.results[variant][key];
        if (!local || finiteNumber(local.samples) < finiteNumber(baseline.samples)) state.results[variant][key] = baseline;
      });
    });
    JACKS_PLUS_REPEAT_VARIANTS.forEach((variant) => {
      state.topRepeatJacksPlusResults[variant] = state.topRepeatJacksPlusResults[variant] || {};
      scenariosForVariant(variant).forEach((scenario) => {
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

  // The page's one assertive region: a dismissible alert toast.
  function announce(message) {
    if (!els.alerts) return;
    const toast = document.createElement("div");
    toast.className = "toast toast--alert";
    const text = document.createElement("span");
    text.textContent = message;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn btn--ghost btn--sm";
    close.textContent = "Dismiss";
    close.addEventListener("click", () => toast.remove());
    toast.append(text, close);
    els.alerts.appendChild(toast);
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
      // Storage is optional; the precomputed dataset still renders without it.
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (error) {
      // The JJJ+ preference is optional.
    }
  }

  window.OFCFantasylandEV = {
    aggregateDeckResults,
    applyPrecomputedResults,
    hypergeometricJokers,
    parseResultsCache,
    recursiveValueForScenario,
    scenariosForVariant,
    definitions: DEFINITIONS,
  };
})();
