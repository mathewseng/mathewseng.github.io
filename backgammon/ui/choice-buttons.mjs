// SPDX-License-Identifier: GPL-3.0-or-later
import { el, button } from './shell.mjs';

// A small visible choice set with the same value/change contract as a select.
export function choiceButtons(options, initial, onChange = () => {}) {
  let value = String(initial), disabled = false;
  const group = el('div', {class:'choice-buttons', role:'group'});
  const buttons = options.map(([key, label]) => button(label, () => {
    group.value = key;
    onChange(String(key));
    group.dispatchEvent(new Event('change', {bubbles:true}));
  }, '', {'data-choice':String(key)}));
  const update = () => buttons.forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.choice === value)); b.disabled = disabled;
  });
  Object.defineProperties(group, {
    value:{get:()=>value,set:next=>{value=String(next);update();}},
    disabled:{get:()=>disabled,set:next=>{disabled=!!next;update();}},
  });
  group.append(...buttons); update(); return group;
}
