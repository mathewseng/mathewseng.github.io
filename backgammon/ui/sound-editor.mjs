// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button, field, select } from "./shell.mjs";
import { SOUND_ACTIONS, SOUND_STYLES, soundStyle } from "../core/sound.mjs";
import { sound, soundPreferences } from "./sound.mjs";

export function soundControls(changeSound) {
  const status = el("p", { class: "sound-status muted small", role: "status" });
  let disposed = false, previewVersion = 0;
  const preview = async (action) => {
    const version = ++previewVersion;
    sound.stop();
    await sound.unlock();
    if (disposed || version !== previewVersion) return;
    const label = SOUND_ACTIONS.find(item => item.id === action).label;
    status.textContent = sound.play(action)
      ? `${label} · ${SOUND_STYLES.find(item => item.id === soundStyle(soundPreferences(), action)).label}`
      : "Sound could not play. Check your device’s volume and silent mode.";
  };
  const enabled = el("input", { type: "checkbox", onChange: event => changeSound({ enabled: event.target.checked }) });
  const output = el("output", { for: "sound-volume" });
  const volume = el("input", {
    id: "sound-volume", type: "range", min: 0, max: 100, step: 5,
    onInput: event => changeSound({ volume: Number(event.target.value) }),
  });
  const options = SOUND_STYLES.map(item => [item.id, item.label]);
  const preset = select([["custom", "Custom mix"], ...options], "classic", value => {
    if (value === "custom") return;
    changeSound({ effects: Object.fromEntries(SOUND_ACTIONS.map(item => [item.id, value])) });
    if (value !== "off" && soundPreferences().enabled && soundPreferences().volume) void preview("roll");
  });
  preset.querySelector('[value="custom"]').disabled = true;
  const presetField = field("Apply to all actions", preset);
  presetField.classList.add("sound-picker");
  const reset = button("Reset choices", () => {
    changeSound({ effects: {} });
    status.textContent = "All actions use Classic. Volume unchanged.";
  }, "ghost");
  const list = el("div", { class: "sound-action-list" });
  const rows = [];
  let group;
  for (const action of SOUND_ACTIONS) {
    if (group !== action.group) {
      group = action.group;
      list.append(el("h3", { class: "sound-group-title" }, group));
    }
    const picker = select(options, "classic", value => {
      changeSound({ effects: { ...soundPreferences().effects, [action.id]: value } });
      if (value === "off") status.textContent = `${action.label} is silent.`;
      else if (soundPreferences().enabled && soundPreferences().volume) void preview(action.id);
    });
    picker.setAttribute("aria-label", `${action.label} sound`);
    const play = button("", () => preview(action.id), "ghost sound-preview", {
      "aria-label": `Preview ${action.label.toLowerCase()}`, title: `Preview ${action.label.toLowerCase()}`,
    });
    play.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="m9 5 11 7-11 7z" fill="currentColor"/></svg>';
    const row = el("div", { class: "sound-action", "data-sound-action": action.id },
      el("span", { class: "sound-action-label" }, action.label), el("div", {class:"field sound-picker"}, picker), play);
    rows.push({ action, picker, play });
    list.append(row);
  }
  const root = el("section", { class: "sound-editor", "aria-label": "Sound editor" },
    el("div", { class: "sound-editor-intro" },
      el("h2", {}, "Choose your sounds"),
      el("p", { class: "muted" }, "Choose a sound for each action. Changes save immediately; choosing a sound previews it.")),
    el("div", { class: "sound-master" },
      el("label", { class: "check" }, enabled, "Sound effects"),
      el("div", { class: "sound-volume-heading" }, el("label", { for: "sound-volume" }, "Volume"), output), volume),
    el("div", { class: "sound-collection" }, presetField, reset),
    status, list,
    el("p", { class: "sound-style-guide muted small" }, "Felt · muted   /   Wood · warm   /   Glass · clear   /   Digital · crisp"),
    el("p", { class: "muted small" }, "Shared across Backgammon tools on this device. Background tabs stay silent."));
  const update = () => {
    previewVersion++;
    sound.stop();
    const value = soundPreferences();
    enabled.checked = value.enabled;
    volume.value = value.volume;
    output.textContent = `${value.volume}%`;
    volume.setAttribute("aria-valuetext", `${value.volume} percent`);
    const styles = new Set(SOUND_ACTIONS.map(action => soundStyle(value, action.id)));
    preset.value = styles.size === 1 ? [...styles][0] : "custom";
    reset.disabled = !Object.keys(value.effects).length;
    status.textContent = !value.enabled ? "Sound is off. Enable it above to preview your choices."
      : !value.volume ? "Volume is 0%. Raise it above to preview your choices."
        : "Use ▶ to listen again. Your game stays unchanged.";
    for (const { action, picker, play } of rows) {
      picker.value = soundStyle(value, action.id);
      play.disabled = !value.enabled || !value.volume || picker.value === "off";
    }
  };
  update();
  addEventListener("bg-sound", update);
  root.dispose = () => {
    disposed = true;
    previewVersion++;
    sound.stop();
    removeEventListener("bg-sound", update);
  };
  return root;
}
