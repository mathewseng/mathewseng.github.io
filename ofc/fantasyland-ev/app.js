(function () {
  "use strict";

  const Core = window.OFCFantasylandCore;
  const STORAGE_KEY = "ofcFantasylandEv.v6";
  const CARD_COUNTS = [14, 15, 16, 17];
  const EXACT_SCENARIOS = [0, 1, 2].flatMap((jokers) => CARD_COUNTS.map((cards) => ({ cards, jokers })));
  const DECK_JOKER_COUNTS = [1, 2];
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
      copy: "Expected total royalties across this hand and future repeats. It uses a Jeffreys-smoothed repeat estimate so a small 100% sample does not imply infinite value.",
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

  const state = {
    variant: "high",
    running: false,
    abort: false,
    results: loadCache(),
  };

  const els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!Core) {
      document.body.innerHTML = '<p style="padding:24px;color:#fff">Fantasyland calculation engine did not load.</p>';
      return;
    }
    cacheElements();
    bindEvents();
    renderVariant();
  }

  function cacheElements() {
    Object.assign(els, {
      variantSummary: document.querySelector("#variant-summary"),
      sampleCount: document.querySelector("#sample-count"),
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
      summaryImmediate: document.querySelector("#summary-immediate"),
      summaryConfigCount: document.querySelector("#summary-config-count"),
      summaryRepeat: document.querySelector("#summary-repeat"),
      summaryRecursive: document.querySelector("#summary-recursive"),
      summaryFoul: document.querySelector("#summary-foul"),
      evChart: document.querySelector("#ev-chart"),
      repeatChart: document.querySelector("#repeat-chart"),
      foulChart: document.querySelector("#foul-chart"),
      distributionChart: document.querySelector("#distribution-chart"),
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
        state.variant = Core.normalizeVariant(input.value);
        renderVariant();
      });
    });
    els.run.addEventListener("click", runCalculator);
    els.stop.addEventListener("click", () => {
      state.abort = true;
      els.runStatus.textContent = "Stopping after this sample";
    });
    document.querySelectorAll(".definition-link").forEach((button) => {
      button.addEventListener("click", () => showDefinition(button.dataset.definition));
    });
    els.rulesOpen.addEventListener("click", () => openRules(state.variant));
    els.rulesClose.addEventListener("click", closeRules);
    els.rulesDialog.addEventListener("click", (event) => {
      if (event.target === els.rulesDialog) closeRules();
    });
  }

  function renderVariant() {
    const meta = Core.VARIANTS[state.variant];
    const scenarios = scenariosForVariant(state.variant);
    const configCount = scenarios.length;
    const includesHypotheticals = CARD_COUNTS.some((cards) => !Core.supportsVariantCardCount(state.variant, cards));
    els.variantSummary.textContent = `${meta.short}${includesHypotheticals ? " Off-rule card counts are modeled as hypotheticals below." : ""}`;
    const data = getVariantResults();
    renderMatrix(data, scenarios);
    renderDeckMatrix(data);
    renderSummary(data, scenarios);
    renderCharts(data, scenarios);
    renderJokerProbabilities();
    const complete = scenarios.filter((scenario) => data[scenarioKey(scenario)]).length;
    els.matrixTitle.textContent = `14–17 card ${meta.label} matrix`;
    els.summaryConfigCount.textContent = `Average of ${configCount} configs`;
    els.matrixMeta.textContent = complete ? `${meta.label} - ${complete}/${configCount} configs` : "No samples yet";
    if (!state.running) {
      els.runStatus.textContent = complete ? `${meta.label} results loaded` : "Ready to calculate";
      els.runDetail.textContent = complete ? "Run again to replace this sample" : `${configCount} configurations - browser only`;
      els.runProgress.style.width = complete === configCount ? "100%" : "0%";
    }
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
        <td data-value="recursive">${result ? formatRecursive(result.recursive) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="foul">${result ? formatPct(resultFoulRate(result)) : '<span class="cell-muted">--</span>'}</td>
        <td data-value="samples">${result ? result.samples : '<span class="cell-muted">0</span>'}</td>
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

  function renderSummary(data, scenarios = scenariosForVariant()) {
    const results = scenarios.map((scenario) => data[scenarioKey(scenario)]).filter(Boolean);
    if (!results.length) {
      [els.summaryImmediate, els.summaryRepeat, els.summaryFoul, els.summaryRecursive].forEach((element) => { element.textContent = "--"; });
      return;
    }
    els.summaryImmediate.textContent = formatPoints(mean(results.map((result) => result.immediate)));
    els.summaryRepeat.textContent = formatPct(mean(results.map((result) => result.repeatRate)));
    els.summaryFoul.textContent = formatPct(mean(results.map((result) => resultFoulRate(result))));
    els.summaryRecursive.textContent = formatRecursive(meanFinite(results.map((result) => result.recursive)));
  }

  function renderCharts(data, scenarios = scenariosForVariant()) {
    const results = scenarios.map((scenario) => ({ scenario, result: data[scenarioKey(scenario)] })).filter((entry) => entry.result);
    if (!results.length) {
      els.evChart.className = "bar-chart empty-chart";
      els.evChart.textContent = "Run the calculator to compare configurations.";
      els.repeatChart.className = "bar-chart empty-chart";
      els.repeatChart.textContent = "Repeat rates will appear here.";
      els.foulChart.className = "bar-chart empty-chart";
      els.foulChart.textContent = "Foul rates will appear here.";
      els.distributionChart.className = "distribution-chart empty-chart";
      els.distributionChart.textContent = "Royalty bands will appear here.";
      return;
    }
    const maxImmediate = Math.max(1, ...results.map((entry) => entry.result.immediate));
    renderBarChart(els.evChart, results, (result) => result.immediate, maxImmediate, formatPoints);
    renderBarChart(els.repeatChart, results, (result) => result.repeatRate, 1, formatPct);
    renderBarChart(els.foulChart, results, resultFoulRate, 1, formatPct);
    renderDistributionChart(results);
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
    const labels = ["0 royalties", "1-5 royalties", "6-10 royalties", "11-20 royalties", "21 or more royalties"];
    const classes = ["band-zero", "band-low", "band-mid", "band-high", "band-elite"];
    const fragment = document.createDocumentFragment();
    entries.forEach(({ scenario, result }) => {
      const row = document.createElement("div");
      row.className = "distribution-row";
      const label = document.createElement("span");
      label.textContent = `${scenario.cards}C / ${scenario.jokers}J`;
      const bar = document.createElement("div");
      bar.className = "distribution-bar";
      bar.setAttribute("aria-label", result.distribution.map((value, index) => `${labels[index]} ${formatPct(value)}`).join(", "));
      result.distribution.forEach((value, index) => {
        const segment = document.createElement("i");
        segment.className = classes[index];
        segment.style.width = `${(value * 100).toFixed(2)}%`;
        segment.title = `${labels[index]}: ${formatPct(value)}`;
        bar.appendChild(segment);
      });
      row.append(label, bar);
      fragment.appendChild(row);
    });
    els.distributionChart.className = "distribution-chart";
    els.distributionChart.replaceChildren(fragment);
  }

  async function runCalculator() {
    if (state.running) return;
    const variant = state.variant;
    const scenarios = scenariosForVariant(variant);
    const samples = Math.max(1, Number(els.sampleCount.value) || 5);
    const total = samples * scenarios.length;
    const runSeed = Core.hashSeed(`${Date.now()}-${Math.random()}-${variant}`).toString(16).padStart(8, "0").toUpperCase();
    const nextResults = {};
    const started = performance.now();
    let completed = 0;
    state.running = true;
    state.abort = false;
    setRunningUi(true);

    for (const scenario of scenarios) {
      const aggregate = createAggregate();
      for (let sample = 0; sample < samples; sample += 1) {
        if (state.abort || state.variant !== variant) break;
        const label = `${scenario.cards} cards / ${scenario.jokers} joker${scenario.jokers === 1 ? "" : "s"}`;
        els.runStatus.textContent = `Calculating ${label}`;
        els.runDetail.textContent = `Sample ${sample + 1} of ${samples}`;
        await yieldFrame();
        const seedText = `EV-${runSeed}-${variant}-${scenario.cards}C-${scenario.jokers}J-${sample}`;
        const ids = Core.dealSeeded(scenario.cards, scenario.jokers, Core.hashSeed(seedText).toString(16));
        const solved = solveSample(ids, variant);
        addSample(aggregate, solved);
        completed += 1;
        els.runProgress.style.width = `${((completed / total) * 100).toFixed(2)}%`;
      }
      if (aggregate.samples) {
        nextResults[scenarioKey(scenario)] = finalizeAggregate(aggregate);
        state.results[variant] = { ...(state.results[variant] || {}), ...nextResults };
        renderMatrix(state.results[variant], scenarios);
        renderDeckMatrix(state.results[variant]);
        renderSummary(state.results[variant], scenarios);
        renderCharts(state.results[variant], scenarios);
        saveCache();
      }
      if (state.abort || state.variant !== variant) break;
    }

    const elapsedSeconds = (performance.now() - started) / 1000;
    state.running = false;
    setRunningUi(false);
    if (state.variant !== variant) {
      state.abort = false;
      renderVariant();
      return;
    }
    if (state.abort) {
      els.runStatus.textContent = "Calculation stopped";
      els.runDetail.textContent = `${completed}/${total} samples completed`;
    } else {
      els.runStatus.textContent = "Calculation complete";
      els.runDetail.textContent = `${completed} deals in ${elapsedSeconds.toFixed(1)}s - bounded search estimate`;
      els.matrixMeta.textContent = `${Core.VARIANTS[variant].label} - ${samples} samples per config`;
      els.runProgress.style.width = "100%";
    }
    state.abort = false;
  }

  function createAggregate() {
    return { samples: 0, immediateSum: 0, immediateSquared: 0, strategySum: 0, repeatCount: 0, repeatPointSum: 0, qualifyCount: 0, distribution: [0, 0, 0, 0, 0] };
  }

  function solveSample(ids, variant) {
    const splitVariant = variant === "badugijack" || variant === "doubleblackjack";
    const searchBounds = splitVariant
      ? { maskLimit: 40, beamLimit: 24 }
      : { maskLimit: 140, beamLimit: 72 };
    const analysisOptions = { allowUnsupportedCardCount: true };
    let solved = Core.solveHand(ids, { variant, mode: "fast", ...searchBounds, ...analysisOptions });
    if (solved.best || variant === "high" || !Core.hasQualifyingMiddle(ids, variant, analysisOptions)) return solved;

    solved = splitVariant
      ? Core.solveHand(ids, { variant, mode: "fast", maskLimit: 80, beamLimit: 48, ...analysisOptions })
      : ids.length === 14
        ? Core.solveHand(ids, { variant, mode: "exact", ...analysisOptions })
        : Core.solveHand(ids, { variant, mode: "fast", maskLimit: 320, beamLimit: 180, ...analysisOptions });
    return solved;
  }

  function addSample(aggregate, solved) {
    const immediate = solved.bestRoyalty ? finiteNumber(solved.bestRoyalty.points) : 0;
    const strategy = solved.best ? finiteNumber(solved.best.points) : 0;
    aggregate.samples += 1;
    aggregate.immediateSum += immediate;
    aggregate.immediateSquared += immediate * immediate;
    aggregate.strategySum += strategy;
    aggregate.distribution[royaltyBandIndex(immediate)] += 1;
    if (solved.best) aggregate.qualifyCount += 1;
    if (solved.bestRepeat) {
      aggregate.repeatCount += 1;
      aggregate.repeatPointSum += finiteNumber(solved.bestRepeat.points);
    }
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
    };
  }

  function royaltyBandIndex(points) {
    if (points <= 0) return 0;
    if (points <= 5) return 1;
    if (points <= 10) return 2;
    if (points <= 20) return 3;
    return 4;
  }

  function setRunningUi(running) {
    els.run.disabled = running;
    els.stop.hidden = !running;
    els.sampleCount.disabled = running;
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
    Core.VARIANT_ORDER.forEach((variant) => {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.className = variant === active ? "active" : "";
      button.setAttribute("aria-selected", String(variant === active));
      button.textContent = Core.VARIANTS[variant].compactLabel || Core.VARIANTS[variant].label;
      button.addEventListener("click", () => renderRules(variant));
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
    [["Qualify", [rules.qualification]], ["Royalties", rules.scoring], ["Repeat Fantasyland", [rules.repeat]]].forEach(([label, lines]) => {
      const section = document.createElement("section");
      const sectionTitle = document.createElement("h4");
      sectionTitle.textContent = label;
      section.appendChild(sectionTitle);
      if (label === "Royalties") {
        section.classList.add("royalties-section");
        section.appendChild(renderRoyaltyGroups(lines));
      } else {
        const list = document.createElement("ul");
        lines.forEach((line) => {
          const item = document.createElement("li");
          appendRuleLine(item, line);
          list.appendChild(item);
        });
        section.appendChild(list);
      }
      article.appendChild(section);
    });
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

  function getVariantResults() {
    return state.results[state.variant] || {};
  }

  function scenarioKey(scenario) {
    return `${scenario.cards}-${scenario.jokers}`;
  }

  function scenariosForVariant() {
    return EXACT_SCENARIOS;
  }

  function resultFoulRate(result) {
    if (Number.isFinite(Number(result?.foulRate))) return Number(result.foulRate);
    return 1 - finiteNumber(result?.qualifyRate);
  }

  function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + finiteNumber(value), 0) / values.length : 0;
  }

  function meanFinite(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? mean(finite) : Infinity;
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
    return Number.isFinite(value) ? formatPoints(value) : "infinite";
  }

  function yieldFrame() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.results));
    } catch (error) {
      // Storage is optional; calculations still work without it.
    }
  }

  window.OFCFantasylandEV = {
    aggregateDeckResults,
    finalizeAggregate,
    hypergeometricJokers,
    scenariosForVariant,
    definitions: DEFINITIONS,
  };
})();
