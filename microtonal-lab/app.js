(() => {
  "use strict";

  const TWO_PI = Math.PI * 2;
  const ROOT_FREQUENCY = 261.63;
  const COLOR_PALETTE = ["#57d6ff", "#a7f06d", "#ff5d92", "#f7c75c", "#ad8cff", "#5ff0c8"];
  const FAMILY_LABELS = {
    equal: "Equal",
    just: "Just",
    world: "World",
    free: "Free",
    custom: "Custom",
  };

  const CHROMATIC_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const WHITE_SEMITONE_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
  const HARMONIC_ANCHOR_CLASSES = new Set([0, 5, 7]);
  const CHROMATIC_KEY_ROWS = [
    { keys: "q2w3er5t6y7ui9o0p[=]".split(""), semitoneStart: 12 },
    { keys: "zsxdcvgbhnjm,l.;/".split(""), semitoneStart: 0 },
  ];
  const COMPUTER_KEY_ROWS = [
    { keys: "1234567890-=".split(""), offset: 0 },
    { keys: "qwertyuiop[]".split(""), offset: 0.55 },
    { keys: "asdfghjkl;'".split(""), offset: 0.95 },
    { keys: "zxcvbnm,./".split(""), offset: 1.45 },
  ];
  const SMALL_LOWER_KEYS = "zxcvbnm,./l".split("");
  const SMALL_UPPER_KEYS = "qwertyuiop[]".split("");
  const DENSE_LOWER_KEYS = "zsxdcvgbhnjm,l.;/fk'".split("");
  const DENSE_UPPER_KEYS = "q2w3e4r5t6y7u8i9o0p-[=]".split("");
  const PHYSICAL_WHITE_KEYS = new Set("qwertyuiop[]zxcvbnm,./".split(""));

  const COMMON_EDO_NAMES = new Map([
    [5, "5-EDO Open Pentad"],
    [7, "7-EDO Neutral Diatonic"],
    [10, "10-EDO Split Pentad"],
    [12, "12-EDO Familiar Grid"],
    [15, "15-EDO Wide Chromatic"],
    [17, "17-EDO Sharp Chromatic"],
    [19, "19-EDO Third-Tone Color"],
    [22, "22-EDO Shruti Grid"],
    [24, "24-EDO Quarter Tone"],
    [26, "26-EDO Double Tritave Shadow"],
    [31, "31-EDO Meantone Field"],
    [34, "34-EDO Dense Chromatic"],
    [41, "41-EDO Lattice Grid"],
    [46, "46-EDO Neutral Rich"],
    [53, "53-EDO Comma Matrix"],
    [72, "72-EDO Fine Mesh"],
  ]);

  const state = {
    family: "all",
    search: "",
    preset: null,
    scale: null,
    baseFrequency: ROOT_FREQUENCY,
    keyboardBase: 0,
    focusedIndex: 0,
    waveform: "triangle",
    volume: 0.72,
    brightness: 4200,
    release: 0.42,
    hold: false,
    drone: false,
    pulse: false,
    tempo: 96,
    pulsePattern: [0, 3, 5, 7, 10, 12, 14, 17],
    pulseStep: 0,
    builderMode: "equal",
  };

  const activeVoices = new Map();
  const keyToIndex = new Map();
  let audio = null;
  let droneVoice = null;
  let pulseTimer = null;
  let pulseTimeouts = [];
  let waveformData = null;

  const dom = {};

  function parseRatio(value) {
    if (typeof value === "number") {
      return value > 0 ? value : NaN;
    }
    const raw = String(value).trim();
    if (!raw) {
      return NaN;
    }
    const normalized = raw.replace(":", "/");
    if (normalized.includes("/")) {
      const [left, right] = normalized.split("/").map((part) => Number(part.trim()));
      return left > 0 && right > 0 ? left / right : NaN;
    }
    const parsed = Number(normalized);
    return parsed > 0 ? parsed : NaN;
  }

  function centsFromRatio(ratio) {
    return 1200 * Math.log2(ratio);
  }

  function ratioFromCents(cents) {
    return Math.pow(2, cents / 1200);
  }

  function approximateFraction(value, maxDenominator = 99) {
    if (!Number.isFinite(value) || value <= 0) {
      return "?:?";
    }

    let bestNumerator = 1;
    let bestDenominator = 1;
    let bestError = Math.abs(value - 1);

    for (let denominator = 1; denominator <= maxDenominator; denominator += 1) {
      const numerator = Math.max(1, Math.round(value * denominator));
      const error = Math.abs(value - numerator / denominator);
      if (error < bestError) {
        bestError = error;
        bestNumerator = numerator;
        bestDenominator = denominator;
      }
    }

    return `${bestNumerator}:${bestDenominator}`;
  }

  function formatPeriod(value) {
    if (Math.abs(value - 2) < 0.00001) {
      return "2:1";
    }
    if (Math.abs(value - 3) < 0.00001) {
      return "3:1";
    }
    return approximateFraction(value, 64);
  }

  function formatCents(value) {
    if (!Number.isFinite(value)) {
      return "--";
    }
    const fixed = Math.abs(value) >= 1000 ? value.toFixed(0) : value.toFixed(1);
    return `${fixed}c`;
  }

  function equalPreset(divisions, options = {}) {
    const period = parseRatio(options.period ?? "2/1");
    const label = options.name ?? COMMON_EDO_NAMES.get(divisions) ?? `${divisions}-EDO`;
    const periodLabel = formatPeriod(period);
    const suffix = period === 2 ? "EDO" : "EDT";
    return {
      id: options.id ?? `equal-${divisions}-${periodLabel.replace(":", "-")}`,
      name: label,
      family: options.family ?? "equal",
      method: "equal",
      divisions,
      size: options.size ?? divisions,
      period,
      repeat: options.repeat ?? true,
      badge: options.badge ?? `${divisions} ${suffix}`,
      tags: ["equal", `${divisions}`, periodLabel, ...(options.tags ?? [])],
    };
  }

  function ratioPreset(id, name, family, ratios, period = "2/1", options = {}) {
    const parsedRatios = ratios
      .map((ratio) => {
        const value = parseRatio(ratio);
        return Number.isFinite(value) ? { label: String(ratio), ratio: value } : null;
      })
      .filter(Boolean);

    return {
      id,
      name,
      family,
      method: "ratios",
      ratios: parsedRatios,
      size: parsedRatios.length,
      period: parseRatio(period),
      repeat: options.repeat ?? true,
      badge: options.badge ?? formatPeriod(parseRatio(period)),
      tags: ["ratio", "just", ...(options.tags ?? [])],
    };
  }

  function centsPreset(id, name, family, cents, period = "2/1", options = {}) {
    return {
      id,
      name,
      family,
      method: "cents",
      cents: cents.map(Number).filter(Number.isFinite),
      size: cents.length,
      period: parseRatio(period),
      repeat: options.repeat ?? true,
      badge: options.badge ?? `${cents.length} notes`,
      tags: ["cents", ...(options.tags ?? [])],
    };
  }

  function generatorPreset(id, name, stepCents, size, options = {}) {
    return {
      id,
      name,
      family: options.family ?? "free",
      method: "generator",
      stepCents,
      size,
      period: parseRatio(options.period ?? "2/1"),
      repeat: options.repeat ?? false,
      reduceToPeriod: options.reduceToPeriod ?? false,
      badge: options.badge ?? `${stepCents.toFixed(1)}c`,
      tags: ["generator", ...(options.tags ?? [])],
    };
  }

  function createPresets() {
    const equalDivisions = [
      ...Array.from({ length: 30 }, (_, index) => index + 2),
      34,
      41,
      46,
      53,
      72,
    ];

    const equalPresets = equalDivisions.map((division) =>
      equalPreset(division, {
        name: COMMON_EDO_NAMES.get(division) ?? `${division}-EDO Equal Division`,
        tags: division >= 24 ? ["high-resolution"] : [],
      }),
    );

    return [
      ...equalPresets,
      equalPreset(7, {
        id: "tritave-7",
        name: "7-EDT Tritave Steps",
        period: "3/1",
        family: "free",
        badge: "7 EDT",
        tags: ["tritave", "non-octave"],
      }),
      equalPreset(9, {
        id: "tritave-9",
        name: "9-EDT Tritave Steps",
        period: "3/1",
        family: "free",
        badge: "9 EDT",
        tags: ["tritave", "non-octave"],
      }),
      equalPreset(13, {
        id: "bohlen-pierce-13",
        name: "Bohlen-Pierce 13-EDT",
        period: "3/1",
        family: "free",
        badge: "13 EDT",
        tags: ["bohlen-pierce", "tritave", "non-octave"],
      }),
      equalPreset(15, {
        id: "tritave-15",
        name: "15-EDT Tritave Steps",
        period: "3/1",
        family: "free",
        badge: "15 EDT",
        tags: ["tritave", "non-octave"],
      }),
      ratioPreset(
        "ji-5-limit",
        "5-limit Just Intonation",
        "just",
        ["1/1", "16/15", "9/8", "6/5", "5/4", "4/3", "45/32", "3/2", "8/5", "5/3", "9/5", "15/8"],
        "2/1",
        { badge: "5-limit", tags: ["major", "harmonic"] },
      ),
      ratioPreset(
        "ji-pythagorean",
        "Pythagorean Chain",
        "just",
        ["1/1", "256/243", "9/8", "32/27", "81/64", "4/3", "729/512", "3/2", "128/81", "27/16", "16/9", "243/128"],
        "2/1",
        { badge: "3-limit", tags: ["fifths"] },
      ),
      ratioPreset(
        "ji-harmonic-8-16",
        "Harmonics 8-16",
        "just",
        ["1/1", "9/8", "10/8", "11/8", "12/8", "13/8", "14/8", "15/8"],
        "2/1",
        { badge: "8-16", tags: ["harmonic-series", "overtone"] },
      ),
      ratioPreset(
        "ji-11-limit",
        "11-limit Lattice",
        "just",
        ["1/1", "16/15", "10/9", "8/7", "7/6", "6/5", "5/4", "4/3", "11/8", "3/2", "8/5", "7/4", "15/8"],
        "2/1",
        { badge: "11-limit", tags: ["septimal", "undecimal"] },
      ),
      ratioPreset(
        "ji-subharmonic",
        "Subharmonic Mirror",
        "just",
        ["1/1", "16/15", "8/7", "4/3", "16/11", "8/5", "5/3", "16/9", "15/8"],
        "2/1",
        { badge: "undertone", tags: ["subharmonic"] },
      ),
      ratioPreset(
        "bp-just",
        "Bohlen-Pierce Just",
        "free",
        ["1/1", "27/25", "25/21", "9/7", "7/5", "75/49", "5/3", "9/5", "49/25", "15/7", "7/3", "63/25", "25/9"],
        "3/1",
        { badge: "3:1 JI", tags: ["bohlen-pierce", "tritave", "non-octave"] },
      ),
      centsPreset("world-slendro", "Slendro Approximation", "world", [0, 240, 480, 720, 960], "2/1", {
        badge: "5 notes",
        tags: ["gamelan"],
      }),
      centsPreset("world-pelog", "Pelog Approximation", "world", [0, 133, 267, 533, 667, 800, 1067], "2/1", {
        badge: "7 notes",
        tags: ["gamelan"],
      }),
      centsPreset("world-rast", "Maqam Rast 24-EDO", "world", [0, 200, 350, 500, 700, 850, 1050], "2/1", {
        badge: "rast",
        tags: ["maqam", "quarter-tone"],
      }),
      centsPreset("world-bayati", "Maqam Bayati 24-EDO", "world", [0, 150, 300, 500, 700, 800, 1000], "2/1", {
        badge: "bayati",
        tags: ["maqam", "quarter-tone"],
      }),
      centsPreset(
        "world-meantone",
        "Quarter-comma Meantone",
        "world",
        [0, 76.05, 193.16, 310.26, 386.31, 503.42, 579.47, 696.58, 772.63, 889.74, 1006.84, 1082.89],
        "2/1",
        { badge: "meantone", tags: ["historic"] },
      ),
      centsPreset(
        "world-werckmeister",
        "Werckmeister Color Map",
        "world",
        [0, 90.2, 192.2, 294.1, 390.2, 498, 588.3, 696.1, 792.2, 888.3, 996.1, 1092.2],
        "2/1",
        { badge: "well", tags: ["historic", "well-temperament"] },
      ),
      generatorPreset("carlos-alpha", "Carlos Alpha Walk", 78, 28, {
        repeat: false,
        badge: "78.0c",
        tags: ["carlos", "non-octave"],
      }),
      generatorPreset("carlos-beta", "Carlos Beta Walk", 63.8, 32, {
        repeat: false,
        badge: "63.8c",
        tags: ["carlos", "non-octave"],
      }),
      generatorPreset("carlos-gamma", "Carlos Gamma Walk", 35.1, 42, {
        repeat: false,
        badge: "35.1c",
        tags: ["carlos", "non-octave"],
      }),
      generatorPreset("miracle-mos", "Miracle Generator MOS", 116.7, 21, {
        repeat: true,
        reduceToPeriod: true,
        badge: "MOS",
        tags: ["generator", "well-formed"],
      }),
      generatorPreset("porcupine-mos", "Porcupine Generator MOS", 163.6, 15, {
        repeat: true,
        reduceToPeriod: true,
        badge: "MOS",
        tags: ["generator", "well-formed"],
      }),
    ];
  }

  const PRESETS = createPresets();

  function buildScale(preset) {
    const period = Number.isFinite(preset.period) && preset.period > 0 ? preset.period : 2;
    const periodCents = centsFromRatio(period);
    let cents = [];
    let labels = [];

    if (preset.method === "equal") {
      const step = periodCents / preset.divisions;
      cents = Array.from({ length: preset.size }, (_, index) => index * step);
      labels = cents.map((_, index) => `${index}`);
    }

    if (preset.method === "ratios") {
      cents = preset.ratios.map((entry) => centsFromRatio(entry.ratio));
      labels = preset.ratios.map((entry) => entry.label.replace("/", ":"));
    }

    if (preset.method === "cents") {
      cents = preset.cents.slice();
      labels = cents.map((value) => formatCents(value));
    }

    if (preset.method === "generator") {
      cents = Array.from({ length: preset.size }, (_, index) => index * preset.stepCents);
      labels = cents.map((_, index) => `g${index}`);

      if (preset.reduceToPeriod) {
        const sorted = cents
          .map((value, index) => ({
            cents: positiveModulo(value, periodCents),
            label: `g${index}`,
          }))
          .sort((a, b) => a.cents - b.cents);
        cents = sorted.map((entry) => entry.cents);
        labels = sorted.map((entry) => entry.label);
      }
    }

    if (!cents.length || cents[0] !== 0) {
      cents.unshift(0);
      labels.unshift("0");
    }

    return {
      ...preset,
      period,
      periodCents,
      cents,
      labels,
      size: cents.length,
      repeat: preset.repeat !== false,
    };
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function stepForIndex(index) {
    const scale = state.scale;
    if (!scale) {
      return 0;
    }
    return positiveModulo(index, scale.size);
  }

  function octaveForIndex(index) {
    const scale = state.scale;
    if (!scale) {
      return 0;
    }
    return Math.floor(index / scale.size);
  }

  function pitchAt(index) {
    const scale = state.scale;
    if (!scale) {
      return {
        index,
        step: 0,
        label: "0",
        cents: 0,
        localCents: 0,
        ratio: 1,
        frequency: state.baseFrequency,
      };
    }

    let cents;
    let localCents;
    let step;
    let label;

    if (scale.method === "generator" && !scale.repeat && !scale.reduceToPeriod) {
      cents = index * scale.stepCents;
      localCents = cents;
      step = positiveModulo(index, scale.size);
      label = `g${index}`;
    } else {
      step = stepForIndex(index);
      const periodOffset = octaveForIndex(index) * scale.periodCents;
      localCents = scale.cents[step];
      cents = localCents + periodOffset;
      label = scale.labels[step] ?? `${step}`;
    }

    const ratio = ratioFromCents(cents);
    return {
      index,
      step,
      label,
      cents,
      localCents,
      ratio,
      frequency: state.baseFrequency * ratio,
    };
  }

  function getDom() {
    [
      "audioButton",
      "panicButton",
      "presetCount",
      "presetSearch",
      "familyTabs",
      "presetList",
      "baseFrequency",
      "waveform",
      "volume",
      "brightness",
      "release",
      "holdButton",
      "droneButton",
      "pulseButton",
      "tuningCanvas",
      "activePresetName",
      "periodReadout",
      "stepReadout",
      "lastNoteReadout",
      "focusedNote",
      "frequencyReadout",
      "centsReadout",
      "ratioReadout",
      "familyReadout",
      "indexReadout",
      "shufflePulse",
      "pulseSteps",
      "tempo",
      "tempoReadout",
      "rangeDown",
      "rangeReadout",
      "rangeUp",
      "keyboard",
      "builderTabs",
      "builderForm",
      "customDivisions",
      "customEqualPeriod",
      "customEqualSize",
      "customListType",
      "customListPeriod",
      "customListValues",
      "customGeneratorStep",
      "customGeneratorSize",
      "customGeneratorRepeat",
      "customGeneratorPeriod",
      "scaleMap",
    ].forEach((id) => {
      dom[id] = document.getElementById(id);
    });
  }

  function init() {
    getDom();
    state.preset = PRESETS.find((preset) => preset.id === "equal-12-2-1") ?? PRESETS.find((preset) => preset.divisions === 12) ?? PRESETS[0];
    state.scale = buildScale(state.preset);
    bindEvents();
    renderAll();
    drawLoop();
  }

  function bindEvents() {
    dom.audioButton.addEventListener("click", () => {
      ensureAudio();
    });

    dom.panicButton.addEventListener("click", () => {
      stopEverything();
    });

    dom.presetSearch.addEventListener("input", () => {
      state.search = dom.presetSearch.value.trim().toLowerCase();
      renderPresetList();
    });

    dom.familyTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-family]");
      if (!button) {
        return;
      }
      state.family = button.dataset.family;
      dom.familyTabs.querySelectorAll(".tab-button").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      renderPresetList();
    });

    dom.presetList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-preset-id]");
      if (!button) {
        return;
      }
      const preset = PRESETS.find((entry) => entry.id === button.dataset.presetId);
      if (preset) {
        loadPreset(preset);
      }
    });

    dom.baseFrequency.addEventListener("input", () => {
      const value = Number(dom.baseFrequency.value);
      if (Number.isFinite(value) && value > 0) {
        state.baseFrequency = value;
        if (state.drone) {
          restartDrone();
        }
        renderKeyboard();
        renderScaleMap();
        updateReadouts(state.focusedIndex);
      }
    });

    dom.waveform.addEventListener("change", () => {
      state.waveform = dom.waveform.value;
    });

    dom.volume.addEventListener("input", () => {
      state.volume = Number(dom.volume.value);
      if (audio) {
        audio.master.gain.setTargetAtTime(state.volume * 0.62, audio.ctx.currentTime, 0.018);
      }
    });

    dom.brightness.addEventListener("input", () => {
      state.brightness = Number(dom.brightness.value);
      activeVoices.forEach((voice) => {
        voice.filter.frequency.setTargetAtTime(state.brightness, audio.ctx.currentTime, 0.025);
      });
    });

    dom.release.addEventListener("input", () => {
      state.release = Number(dom.release.value);
    });

    dom.holdButton.addEventListener("click", () => {
      state.hold = !state.hold;
      dom.holdButton.setAttribute("aria-pressed", String(state.hold));
      if (!state.hold) {
        [...activeVoices.keys()].filter((id) => id.startsWith("hold-")).forEach(stopVoice);
      }
    });

    dom.droneButton.addEventListener("click", () => {
      state.drone = !state.drone;
      dom.droneButton.setAttribute("aria-pressed", String(state.drone));
      if (state.drone) {
        startDrone();
      } else {
        stopDrone();
      }
    });

    dom.pulseButton.addEventListener("click", () => {
      if (state.pulse) {
        stopPulse();
      } else {
        startPulse();
      }
    });

    dom.shufflePulse.addEventListener("click", () => {
      shufflePulsePattern();
    });

    dom.tempo.addEventListener("input", () => {
      state.tempo = Number(dom.tempo.value);
      dom.tempoReadout.value = String(state.tempo);
      if (state.pulse) {
        stopPulseTimer();
        startPulseTimer();
      }
    });

    dom.pulseSteps.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pulse-index]");
      if (!button) {
        return;
      }
      const pulseIndex = Number(button.dataset.pulseIndex);
      state.pulsePattern[pulseIndex] = positiveModulo(state.pulsePattern[pulseIndex] + 1, Math.max(1, state.scale.size * 2));
      renderPulseSteps();
    });

    dom.pulseSteps.addEventListener("contextmenu", (event) => {
      const button = event.target.closest("[data-pulse-index]");
      if (!button) {
        return;
      }
      event.preventDefault();
      const pulseIndex = Number(button.dataset.pulseIndex);
      state.pulsePattern[pulseIndex] = positiveModulo(state.pulsePattern[pulseIndex] - 1, Math.max(1, state.scale.size * 2));
      renderPulseSteps();
    });

    dom.rangeDown.addEventListener("click", () => {
      state.keyboardBase -= keyboardPeriodStride();
      renderKeyboard();
      updateReadouts(state.keyboardBase);
    });

    dom.rangeUp.addEventListener("click", () => {
      state.keyboardBase += keyboardPeriodStride();
      renderKeyboard();
      updateReadouts(state.keyboardBase);
    });

    dom.keyboard.addEventListener("pointerdown", (event) => {
      const button = event.target.closest("[data-index]");
      if (!button) {
        return;
      }
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const index = Number(button.dataset.index);
      if (state.hold) {
        toggleHeldVoice(index);
      } else {
        startVoice(`pointer-${event.pointerId}`, index, 0.92);
      }
    });

    ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
      dom.keyboard.addEventListener(eventName, (event) => {
        if (!state.hold) {
          stopVoice(`pointer-${event.pointerId}`);
        }
      });
    });

    dom.keyboard.addEventListener("pointerover", (event) => {
      const button = event.target.closest("[data-index]");
      if (button) {
        updateReadouts(Number(button.dataset.index));
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.repeat || isTypingTarget(event.target)) {
        return;
      }
      const key = normalizeKey(event.key);
      if (!keyToIndex.has(key)) {
        return;
      }
      event.preventDefault();
      const index = keyToIndex.get(key);
      if (state.hold) {
        toggleHeldVoice(index);
      } else {
        startVoice(`key-${key}`, index, 0.96);
      }
    });

    window.addEventListener("keyup", (event) => {
      if (state.hold || isTypingTarget(event.target)) {
        return;
      }
      const key = normalizeKey(event.key);
      if (keyToIndex.has(key)) {
        stopVoice(`key-${key}`);
      }
    });

    dom.builderTabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-builder]");
      if (!button) {
        return;
      }
      state.builderMode = button.dataset.builder;
      dom.builderTabs.querySelectorAll(".tab-button").forEach((tab) => {
        tab.classList.toggle("active", tab === button);
      });
      document.querySelectorAll("[data-builder-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.builderPanel === state.builderMode);
      });
    });

    dom.builderForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const preset = createCustomPreset();
      if (preset) {
        loadPreset(preset);
      } else {
        dom.builderForm.classList.remove("error-flash");
        requestAnimationFrame(() => dom.builderForm.classList.add("error-flash"));
      }
    });

    window.addEventListener("resize", () => {
      drawTuning();
    });
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
  }

  function normalizeKey(key) {
    return key.length === 1 ? key.toLowerCase() : key;
  }

  function loadPreset(preset) {
    state.preset = preset;
    state.scale = buildScale(preset);
    state.keyboardBase = 0;
    state.focusedIndex = 0;
    if (state.drone) {
      restartDrone();
    }
    renderAll();
  }

  function renderAll() {
    renderPresetList();
    renderKeyboard();
    renderPulseSteps();
    renderScaleMap();
    updateReadouts(state.focusedIndex);
  }

  function renderPresetList() {
    const search = state.search;
    const filtered = PRESETS.filter((preset) => {
      const familyMatch = state.family === "all" || preset.family === state.family;
      const haystack = [preset.name, preset.family, preset.badge, ...(preset.tags ?? [])].join(" ").toLowerCase();
      const searchMatch = !search || haystack.includes(search);
      return familyMatch && searchMatch;
    });

    dom.presetCount.value = String(filtered.length);
    dom.presetList.innerHTML = filtered
      .map((preset) => {
        const active = state.preset && preset.id === state.preset.id ? " active" : "";
        const tags = [FAMILY_LABELS[preset.family], preset.method, ...(preset.tags ?? []).slice(0, 2)]
          .filter(Boolean)
          .map((tag) => `<span>${escapeHtml(tag)}</span>`)
          .join("");
        return `
          <button class="preset-button${active}" type="button" data-preset-id="${escapeHtml(preset.id)}">
            <span class="preset-name-row">
              <span class="preset-name">${escapeHtml(preset.name)}</span>
              <span class="preset-badge">${escapeHtml(preset.badge)}</span>
            </span>
            <span class="preset-meta">${tags}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderKeyboard() {
    keyToIndex.clear();
    dom.rangeReadout.value = String(state.keyboardBase);
    dom.keyboard.innerHTML = "";
    const keyboardMap = buildKeyboardMap();

    COMPUTER_KEY_ROWS.forEach((row) => {
      const rowEl = document.createElement("div");
      rowEl.className = "key-row";
      rowEl.style.setProperty("--row-offset", String(row.offset));

      row.keys.forEach((key) => {
        const button = document.createElement("button");
        const keyInfo = keyboardMap.get(key);
        if (!keyInfo) {
          button.className = "key-button is-unused-key";
          button.type = "button";
          button.disabled = true;
          button.dataset.key = key;
          button.setAttribute("aria-label", `${displayKey(key)} is unmapped`);
          button.innerHTML = `
            <span class="key-letter">${escapeHtml(displayKey(key))}</span>
            <span class="key-step">--</span>
            <span class="key-cents">unused</span>
          `;
          rowEl.appendChild(button);
          return;
        }

        const index = keyInfo.index;
        const pitch = pitchAt(index);
        const keyClasses = ["key-button", "is-used-key", keyInfo.isWhite ? "is-white-key" : "is-black-key"];
        if (isHarmonicKeyboardIndex(index)) {
          keyClasses.push("is-harmonic-key");
        }
        if (isOctaveKeyboardIndex(index)) {
          keyClasses.push("is-octave-key");
        }
        button.className = keyClasses.join(" ");
        button.type = "button";
        button.dataset.key = key;
        button.dataset.index = String(index);
        button.dataset.slot = String(keyInfo.slot);
        button.setAttribute("aria-label", `Play ${keyboardPitchLabel(keyInfo, pitch)} at ${pitch.frequency.toFixed(2)} hertz`);
        if (pitch.step === 0) {
          button.classList.add("is-anchor");
        }
        button.innerHTML = `
          <span class="key-letter">${escapeHtml(displayKey(key))}</span>
          <span class="key-step">${escapeHtml(keyboardPitchLabel(keyInfo, pitch))}</span>
          <span class="key-cents">${escapeHtml(formatCents(pitch.localCents))}</span>
        `;
        rowEl.appendChild(button);
        keyToIndex.set(key, index);
      });

      dom.keyboard.appendChild(rowEl);
    });

    syncActiveKeys();
  }

  function displayKey(key) {
    return key.toUpperCase();
  }

  function buildKeyboardMap() {
    const size = keyboardPeriodStride();
    const map = new Map();
    const put = (key, degree, options = {}) => {
      if (!key || map.has(key)) {
        return;
      }
      map.set(key, {
        index: state.keyboardBase + degree,
        isWhite: options.isWhite ?? PHYSICAL_WHITE_KEYS.has(key),
        slot: options.slot ?? degree,
      });
    };

    if (size < 12) {
      SMALL_LOWER_KEYS.slice(0, size).forEach((key, degree) => {
        put(key, degree, { isWhite: PHYSICAL_WHITE_KEYS.has(key), slot: degree });
      });
      SMALL_UPPER_KEYS.slice(0, size).forEach((key, degree) => {
        put(key, size + degree, { isWhite: true, slot: size + degree });
      });
      return map;
    }

    if (size === 12) {
      CHROMATIC_KEY_ROWS.forEach((row) => {
        row.keys.forEach((key, index) => {
          const degree = row.semitoneStart + index;
          const semitoneClass = positiveModulo(degree, 12);
          put(key, degree, {
            isWhite: WHITE_SEMITONE_CLASSES.has(semitoneClass),
            slot: degree,
          });
        });
      });
      return map;
    }

    if (size <= DENSE_LOWER_KEYS.length) {
      DENSE_LOWER_KEYS.slice(0, size).forEach((key, degree) => {
        put(key, degree, { slot: degree });
      });
      DENSE_UPPER_KEYS.forEach((key, index) => {
        put(key, size + index, { slot: size + index });
      });
      return map;
    }

    const lowerCount = DENSE_LOWER_KEYS.length;
    DENSE_LOWER_KEYS.forEach((key, degree) => {
      put(key, degree, { slot: degree });
    });

    const overflow = size - lowerCount;
    const upperWhiteKeys = DENSE_UPPER_KEYS.filter((key) => PHYSICAL_WHITE_KEYS.has(key));
    const octaveWhiteIndex = Math.min(upperWhiteKeys.length - 1, Math.ceil(overflow / 2));
    const octaveKey = upperWhiteKeys[octaveWhiteIndex];
    const octaveKeyPosition = DENSE_UPPER_KEYS.indexOf(octaveKey);
    const keysBeforeOctave = DENSE_UPPER_KEYS.slice(0, octaveKeyPosition);
    const extraBeforeOctave = Math.max(0, size - lowerCount);

    keysBeforeOctave.slice(0, extraBeforeOctave).forEach((key, index) => {
      put(key, lowerCount + index, { slot: lowerCount + index });
    });
    put(octaveKey, size, { isWhite: true, slot: size });

    DENSE_UPPER_KEYS.slice(octaveKeyPosition + 1).forEach((key, index) => {
      put(key, size + index + 1, { slot: size + index + 1 });
    });

    return map;
  }

  function keyboardPitchLabel(keyInfo, pitch) {
    if (state.scale?.repeat && state.scale.size === 12) {
      return CHROMATIC_NOTE_NAMES[positiveModulo(keyInfo.slot, 12)];
    }
    return pitch.label;
  }

  function keyboardPeriodStride() {
    return Math.max(1, state.scale?.size ?? 1);
  }

  function isOctaveKeyboardIndex(index) {
    return positiveModulo(index - state.keyboardBase, keyboardPeriodStride()) === 0;
  }

  function isHarmonicKeyboardIndex(index) {
    const size = keyboardPeriodStride();
    const localIndex = positiveModulo(index - state.keyboardBase, size);
    const anchors = new Set([0, Math.round(size * 5 / 12), Math.round(size * 7 / 12)]);
    return anchors.has(localIndex);
  }

  function renderPulseSteps() {
    dom.pulseSteps.innerHTML = state.pulsePattern
      .map(
        (value, index) =>
          `<button class="pulse-step${index === state.pulseStep && state.pulse ? " active" : ""}" type="button" data-pulse-index="${index}">+${value}</button>`,
      )
      .join("");
  }

  function renderScaleMap() {
    const maxRows = Math.min(144, state.scale.size);
    const activeStep = stepForIndex(state.focusedIndex);
    dom.scaleMap.innerHTML = state.scale.cents
      .slice(0, maxRows)
      .map((cents, index) => {
        const ratio = ratioFromCents(cents);
        const active = index === activeStep ? " active" : "";
        return `
          <div class="scale-step${active}">
            <strong>${index}</strong>
            <span>${escapeHtml(state.scale.labels[index] ?? String(index))}</span>
            <span>${escapeHtml(approximateFraction(ratio, 64))}</span>
          </div>
        `;
      })
      .join("");
  }

  function updateReadouts(index) {
    state.focusedIndex = index;
    const pitch = pitchAt(index);
    const family = FAMILY_LABELS[state.preset.family] ?? state.preset.family;

    dom.activePresetName.textContent = state.preset.name;
    dom.periodReadout.textContent = state.scale.repeat ? formatPeriod(state.scale.period) : "open";
    dom.stepReadout.textContent = String(state.scale.size);
    dom.focusedNote.textContent = `Step ${pitch.label}`;
    dom.frequencyReadout.value = `${pitch.frequency.toFixed(2)} Hz`;
    dom.centsReadout.textContent = pitch.cents.toFixed(2);
    dom.ratioReadout.textContent = approximateFraction(pitch.ratio, 99);
    dom.familyReadout.textContent = family;
    dom.indexReadout.textContent = String(index);
    syncActiveKeys();
    syncScaleMapActive();
  }

  function syncScaleMapActive() {
    const activeStep = stepForIndex(state.focusedIndex);
    dom.scaleMap.querySelectorAll(".scale-step").forEach((stepEl, index) => {
      stepEl.classList.toggle("active", index === activeStep);
    });
  }

  function syncActiveKeys() {
    const activeIndexes = new Set([...activeVoices.values()].map((voice) => voice.index));
    dom.keyboard.querySelectorAll(".key-button").forEach((button) => {
      button.classList.toggle("active", activeIndexes.has(Number(button.dataset.index)));
    });
  }

  async function ensureAudio() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      dom.audioButton.textContent = "Audio unavailable";
      return null;
    }

    if (!audio) {
      const ctx = new AudioContextClass();
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      const delay = ctx.createDelay(1.2);
      const feedback = ctx.createGain();
      const wet = ctx.createGain();
      const analyser = ctx.createAnalyser();

      master.gain.value = state.volume * 0.62;
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 6;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.18;
      delay.delayTime.value = 0.22;
      feedback.gain.value = 0.24;
      wet.gain.value = 0.12;
      analyser.fftSize = 2048;
      waveformData = new Uint8Array(analyser.fftSize);

      master.connect(compressor);
      compressor.connect(analyser);
      analyser.connect(ctx.destination);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(compressor);

      audio = { ctx, master, compressor, delay, feedback, wet, analyser };
    }

    if (audio.ctx.state === "suspended") {
      await audio.ctx.resume();
    }
    dom.audioButton.textContent = "Audio running";
    return audio;
  }

  async function startVoice(id, index, velocity = 1) {
    if (activeVoices.has(id)) {
      stopVoice(id);
    }

    const pitch = pitchAt(index);
    updateReadouts(index);
    dom.lastNoteReadout.textContent = `${pitch.frequency.toFixed(1)} Hz`;

    const graph = await ensureAudio();
    if (!graph) {
      return;
    }

    const { ctx } = graph;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const partial = ctx.createOscillator();
    const partialGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const send = ctx.createGain();

    osc.type = state.waveform;
    partial.type = "sine";
    osc.frequency.setValueAtTime(pitch.frequency, now);
    partial.frequency.setValueAtTime(pitch.frequency * 2, now);
    partialGain.gain.setValueAtTime(state.waveform === "sine" ? 0.28 : 0.12, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(state.brightness, now);
    filter.Q.setValueAtTime(0.62, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.18 * velocity), now + 0.018);
    send.gain.setValueAtTime(0.26, now);

    osc.connect(filter);
    partial.connect(partialGain);
    partialGain.connect(filter);
    filter.connect(amp);
    amp.connect(graph.master);
    amp.connect(send);
    send.connect(graph.delay);

    osc.start(now);
    partial.start(now);

    activeVoices.set(id, { id, index, osc, partial, partialGain, filter, amp, send });
    syncActiveKeys();
  }

  function stopVoice(id) {
    const voice = activeVoices.get(id);
    if (!voice || !audio) {
      activeVoices.delete(id);
      syncActiveKeys();
      return;
    }

    activeVoices.delete(id);
    const now = audio.ctx.currentTime;
    const release = Math.max(0.04, state.release);
    voice.amp.gain.cancelScheduledValues(now);
    voice.amp.gain.setTargetAtTime(0.0001, now, release / 4);
    voice.send.gain.setTargetAtTime(0, now, release / 5);
    voice.osc.stop(now + release + 0.08);
    voice.partial.stop(now + release + 0.08);
    syncActiveKeys();
  }

  function toggleHeldVoice(index) {
    const id = `hold-${index}`;
    if (activeVoices.has(id)) {
      stopVoice(id);
    } else {
      startVoice(id, index, 0.9);
    }
  }

  async function startDrone() {
    const graph = await ensureAudio();
    if (!graph) {
      return;
    }
    stopDrone();
    const pitch = pitchAt(0);
    const now = graph.ctx.currentTime;
    const osc = graph.ctx.createOscillator();
    const second = graph.ctx.createOscillator();
    const secondGain = graph.ctx.createGain();
    const filter = graph.ctx.createBiquadFilter();
    const gain = graph.ctx.createGain();

    osc.type = "sine";
    second.type = "triangle";
    osc.frequency.setValueAtTime(pitch.frequency / 2, now);
    second.frequency.setValueAtTime(pitch.frequency, now);
    secondGain.gain.setValueAtTime(0.22, now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1100, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.35);

    osc.connect(filter);
    second.connect(secondGain);
    secondGain.connect(filter);
    filter.connect(gain);
    gain.connect(graph.master);
    osc.start(now);
    second.start(now);
    droneVoice = { osc, second, gain };
  }

  function stopDrone() {
    if (!droneVoice || !audio) {
      droneVoice = null;
      return;
    }
    const now = audio.ctx.currentTime;
    droneVoice.gain.gain.setTargetAtTime(0.0001, now, 0.12);
    droneVoice.osc.stop(now + 0.45);
    droneVoice.second.stop(now + 0.45);
    droneVoice = null;
  }

  function restartDrone() {
    if (!state.drone) {
      return;
    }
    stopDrone();
    startDrone();
  }

  function startPulse() {
    state.pulse = true;
    dom.pulseButton.setAttribute("aria-pressed", "true");
    state.pulseStep = 0;
    startPulseTimer();
    pulseTick();
  }

  function stopPulse() {
    state.pulse = false;
    dom.pulseButton.setAttribute("aria-pressed", "false");
    stopPulseTimer();
    renderPulseSteps();
  }

  function startPulseTimer() {
    stopPulseTimer();
    const interval = Math.max(120, 30000 / state.tempo);
    pulseTimer = window.setInterval(pulseTick, interval);
  }

  function stopPulseTimer() {
    if (pulseTimer) {
      window.clearInterval(pulseTimer);
      pulseTimer = null;
    }
    pulseTimeouts.forEach((timeout) => window.clearTimeout(timeout));
    pulseTimeouts = [];
  }

  function pulseTick() {
    if (!state.pulse) {
      return;
    }

    const interval = Math.max(120, 30000 / state.tempo);
    const patternIndex = state.pulseStep % state.pulsePattern.length;
    const pitchIndex = state.pulsePattern[patternIndex];
    const id = `pulse-${performance.now()}-${patternIndex}`;
    startVoice(id, pitchIndex, 0.68);
    pulseTimeouts.push(window.setTimeout(() => stopVoice(id), interval * 0.86));
    state.pulseStep = (state.pulseStep + 1) % state.pulsePattern.length;
    renderPulseSteps();
  }

  function shufflePulsePattern() {
    const span = Math.max(4, Math.min(state.scale.size * 2, 28));
    state.pulsePattern = state.pulsePattern.map((_, index) => {
      const wave = Math.sin((index + 1) * 1.7 + performance.now() * 0.001);
      return positiveModulo(Math.round((wave + 1) * 0.5 * span + index), span);
    });
    renderPulseSteps();
  }

  function stopEverything() {
    stopPulse();
    state.drone = false;
    dom.droneButton.setAttribute("aria-pressed", "false");
    stopDrone();
    [...activeVoices.keys()].forEach(stopVoice);
  }

  function createCustomPreset() {
    if (state.builderMode === "equal") {
      const divisions = Number(dom.customDivisions.value);
      const size = Number(dom.customEqualSize.value);
      const period = parseRatio(dom.customEqualPeriod.value);
      if (!Number.isInteger(divisions) || divisions < 2 || !Number.isFinite(period) || !Number.isInteger(size) || size < 2) {
        return null;
      }
      return equalPreset(divisions, {
        id: `custom-equal-${Date.now()}`,
        name: `Custom ${divisions}-ED${period === 2 ? "O" : "P"}`,
        family: "custom",
        period,
        size,
        badge: `${divisions} div`,
        tags: ["custom"],
      });
    }

    if (state.builderMode === "list") {
      const type = dom.customListType.value;
      const period = parseRatio(dom.customListPeriod.value);
      const tokens = dom.customListValues.value
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean);

      if (!tokens.length || !Number.isFinite(period)) {
        return null;
      }

      if (type === "ratios") {
        const ratios = tokens.filter((token) => Number.isFinite(parseRatio(token)));
        if (!ratios.length) {
          return null;
        }
        return ratioPreset(`custom-ratios-${Date.now()}`, "Custom Ratio List", "custom", ratios, period, {
          badge: `${ratios.length} ratios`,
          tags: ["custom"],
        });
      }

      const cents = tokens.map(Number).filter(Number.isFinite);
      if (!cents.length) {
        return null;
      }
      return centsPreset(`custom-cents-${Date.now()}`, "Custom Cents List", "custom", cents, period, {
        badge: `${cents.length} cents`,
        tags: ["custom"],
      });
    }

    if (state.builderMode === "generator") {
      const stepCents = Number(dom.customGeneratorStep.value);
      const size = Number(dom.customGeneratorSize.value);
      const period = parseRatio(dom.customGeneratorPeriod.value);
      if (!Number.isFinite(stepCents) || stepCents <= 0 || !Number.isInteger(size) || size < 2 || !Number.isFinite(period)) {
        return null;
      }
      return generatorPreset(`custom-generator-${Date.now()}`, "Custom Generator", stepCents, size, {
        family: "custom",
        repeat: dom.customGeneratorRepeat.checked,
        reduceToPeriod: dom.customGeneratorRepeat.checked,
        period,
        badge: `${stepCents.toFixed(1)}c`,
        tags: ["custom"],
      });
    }

    return null;
  }

  function drawLoop() {
    drawTuning();
    window.requestAnimationFrame(drawLoop);
  }

  function drawTuning() {
    const canvas = dom.tuningCanvas;
    const context = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, rect.width);
    const height = Math.max(320, rect.height);

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#080b10";
    context.fillRect(0, 0, width, height);

    drawGrid(context, width, height);
    drawPitchMap(context, width, height);
    drawWaveform(context, width, height);
  }

  function drawGrid(context, width, height) {
    context.save();
    context.strokeStyle = "rgba(255, 255, 255, 0.045)";
    context.lineWidth = 1;
    for (let x = 0; x <= width; x += 44) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = 0; y <= height; y += 44) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();
  }

  function drawPitchMap(context, width, height) {
    const scale = state.scale;
    if (!scale) {
      return;
    }

    const centerX = width * 0.5;
    const centerY = height * 0.54;
    const radius = Math.min(width, height) * 0.31;
    const activeSteps = new Set([...activeVoices.values()].map((voice) => stepForIndex(voice.index)));
    const activeIndices = [...activeVoices.values()].map((voice) => voice.index);
    const points = scale.cents.slice(0, Math.min(scale.cents.length, 96)).map((cents, index) => {
      const periodCents = scale.repeat ? scale.periodCents : Math.max(1200, Math.abs(scale.stepCents || 1200) * scale.size);
      const local = positiveModulo(cents, periodCents);
      const angle = (local / periodCents) * TWO_PI - Math.PI / 2;
      const ring = scale.repeat ? 0.82 : 0.36 + (index / Math.max(1, scale.size - 1)) * 0.54;
      return {
        index,
        cents,
        angle,
        x: centerX + Math.cos(angle) * radius * ring,
        y: centerY + Math.sin(angle) * radius * ring,
        color: COLOR_PALETTE[index % COLOR_PALETTE.length],
        active: activeSteps.has(index),
      };
    });

    context.save();
    context.strokeStyle = "rgba(255, 255, 255, 0.09)";
    context.lineWidth = 1;
    [0.34, 0.56, 0.82, 1].forEach((ring) => {
      context.beginPath();
      context.arc(centerX, centerY, radius * ring, 0, TWO_PI);
      context.stroke();
    });

    context.beginPath();
    context.moveTo(centerX - radius * 1.12, centerY);
    context.lineTo(centerX + radius * 1.12, centerY);
    context.moveTo(centerX, centerY - radius * 1.12);
    context.lineTo(centerX, centerY + radius * 1.12);
    context.stroke();

    points.forEach((point) => {
      context.strokeStyle = point.active ? `${point.color}cc` : "rgba(255, 255, 255, 0.07)";
      context.lineWidth = point.active ? 2 : 1;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(point.x, point.y);
      context.stroke();
    });

    points.forEach((point) => {
      context.fillStyle = point.color;
      context.globalAlpha = point.active ? 1 : 0.72;
      context.beginPath();
      context.arc(point.x, point.y, point.active ? 7 : 4.5, 0, TWO_PI);
      context.fill();
      if (point.active) {
        context.globalAlpha = 0.18;
        context.beginPath();
        context.arc(point.x, point.y, 18, 0, TWO_PI);
        context.fill();
      }
      context.globalAlpha = 1;
    });

    if (points.length <= 31) {
      context.font = "700 11px Inter, system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      points.forEach((point) => {
        const labelRadius = radius * (scale.repeat ? 0.98 : 0.96);
        const labelX = centerX + Math.cos(point.angle) * labelRadius;
        const labelY = centerY + Math.sin(point.angle) * labelRadius;
        context.fillStyle = point.active ? point.color : "rgba(244, 247, 251, 0.7)";
        context.fillText(String(point.index), labelX, labelY);
      });
    }

    activeIndices.forEach((index, activeIndex) => {
      const pitch = pitchAt(index);
      const periodCents = scale.repeat ? scale.periodCents : Math.max(1200, Math.abs(scale.stepCents || 1200) * scale.size);
      const angle = (positiveModulo(pitch.localCents, periodCents) / periodCents) * TWO_PI - Math.PI / 2;
      const color = COLOR_PALETTE[activeIndex % COLOR_PALETTE.length];
      context.strokeStyle = color;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(centerX, centerY, radius * (0.9 + activeIndex * 0.035), angle - 0.08, angle + 0.08);
      context.stroke();
    });

    context.fillStyle = "rgba(244, 247, 251, 0.94)";
    context.font = "900 22px Inter, system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(formatPeriod(scale.period), centerX, centerY - 9);
    context.fillStyle = "rgba(164, 175, 191, 0.86)";
    context.font = "800 11px Inter, system-ui, sans-serif";
    context.fillText(scale.repeat ? "repeat period" : "open chain", centerX, centerY + 16);
    context.restore();
  }

  function drawWaveform(context, width, height) {
    const baseY = height - 74;
    const waveHeight = 54;

    context.save();
    context.strokeStyle = "rgba(87, 214, 255, 0.58)";
    context.lineWidth = 2;
    context.beginPath();

    if (audio && waveformData) {
      audio.analyser.getByteTimeDomainData(waveformData);
      waveformData.forEach((value, index) => {
        const x = (index / (waveformData.length - 1)) * width;
        const y = baseY + ((value - 128) / 128) * waveHeight * 0.5;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      });
    } else {
      const now = performance.now() * 0.002;
      for (let index = 0; index < 180; index += 1) {
        const x = (index / 179) * width;
        const y = baseY + Math.sin(index * 0.17 + now) * 12 + Math.sin(index * 0.041 + now * 1.8) * 5;
        if (index === 0) {
          context.moveTo(x, y);
        } else {
          context.lineTo(x, y);
        }
      }
    }

    context.stroke();
    context.fillStyle = "rgba(164, 175, 191, 0.72)";
    context.font = "800 11px Inter, system-ui, sans-serif";
    context.textAlign = "left";
    context.fillText("signal", 16, baseY + waveHeight * 0.5 + 6);
    context.restore();
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
