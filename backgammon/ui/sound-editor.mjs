// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button } from "./shell.mjs";
import { SOUND_ACTIONS, SOUND_STYLES, soundStyle } from "../core/sound.mjs";
import { sound, soundPreferences } from "./sound.mjs";

const character = {classic:"Original",felt:"Muted",wood:"Warm",glass:"Clear",digital:"Crisp",off:"No sound"};
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
  const choose = (action, style, all = false) => {
    changeSound({ effects: all
      ? Object.fromEntries(SOUND_ACTIONS.map(item => [item.id, style]))
      : {...soundPreferences().effects, [action.id]:style} });
    if (style === "off") status.textContent = all ? "All actions are silent." : `${action.label} is silent.`;
    else if (soundPreferences().enabled && soundPreferences().volume) void preview(action.id);
  };
  const enabled = el("input", { type: "checkbox", onChange: event => changeSound({ enabled: event.target.checked }) });
  const output = el("output", { for: "sound-volume" });
  const volume = el("input", {
    id: "sound-volume", type: "range", min: 0, max: 100, step: 5,
    onInput: event => changeSound({ volume: Number(event.target.value) }),
  });
  const reset = button("Reset choices", () => {
    changeSound({ effects: {} });
    status.textContent = "All actions use Classic. Volume unchanged.";
  }, "ghost");
  const rows = [];
  const choices = (action, all = false) => {
    const group = el("div", { class: "sound-choices", role:"group", "aria-label":all ? "All action sounds" : `${action.label} sound` });
    const buttons = SOUND_STYLES.map(style => {
      const mark = el("span", {class:"sound-choice-mark", "aria-hidden":true});
      const control = button("", () => choose(action, style.id, all), "ghost sound-choice", {
        "aria-label":`${all ? "All actions" : action.label}: ${style.label}`,
        "aria-pressed":"false", title:style.description, "data-sound-style":style.id,
      });
      control.append(el("span", {class:"sound-choice-heading"}, mark, el("span", {}, style.label)),
        el("span", {class:"sound-choice-character", "aria-hidden":true}, character[style.id]));
      group.append(control);
      return {style,control,mark};
    });
    rows.push({action,buttons,all});
    return group;
  };
  const list = el("div", { class: "sound-action-list" });
  let group;
  for (const action of SOUND_ACTIONS) {
    if (group !== action.group) {
      group = action.group;
      list.append(el("h3", { class: "sound-group-title" }, group));
    }
    list.append(el("div", { class: "sound-action", "data-sound-action": action.id },
      el("h4", { class: "sound-action-label" }, action.label), choices(action)));
  }
  const bulk = el("details", {class:"sound-bulk"},
    el("summary", {}, "Apply one style to every action"),
    el("p", {class:"muted small"}, "Replaces your individual choices. Tap to apply and hear the dice sound."),
    choices(SOUND_ACTIONS.find(action => action.id === "roll"), true));
  const root = el("section", { class: "sound-editor", "aria-label": "Sound editor" },
    el("div", { class: "sound-editor-intro" },
      el("h2", {}, "Choose your sounds"),
      el("p", { class: "muted" }, "Tap a sound to select and hear it. Tap again to replay. Changes save immediately.")),
    el("div", { class: "sound-master" },
      el("label", { class: "check" }, enabled, "Sound effects"),
      el("div", { class: "sound-volume-heading" }, el("label", { for: "sound-volume" }, "Volume"), output), volume),
    status, list, bulk, reset,
    el("p", { class: "muted small" }, "Shared across Backgammon tools on this device. Background tabs stay silent."));
  const update = () => {
    previewVersion++;
    sound.stop();
    const value = soundPreferences();
    enabled.checked = value.enabled;
    volume.value = value.volume;
    output.textContent = `${value.volume}%`;
    volume.setAttribute("aria-valuetext", `${value.volume} percent`);
    reset.disabled = !Object.keys(value.effects).length;
    status.textContent = !value.enabled ? "Sound is off. Enable it above to hear your choices."
      : !value.volume ? "Volume is 0%. Raise it above to hear your choices."
        : "Tap any sound to compare. The highlighted sound is selected.";
    for (const {action,buttons,all} of rows) {
      for (const {style,control,mark} of buttons) {
        const selected = all ? SOUND_ACTIONS.every(item => soundStyle(value, item.id) === style.id)
          : soundStyle(value, action.id) === style.id;
        control.setAttribute("aria-pressed", String(selected));
        mark.textContent = selected ? "✓" : style.id === "off" ? "−" : "▶";
      }
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
