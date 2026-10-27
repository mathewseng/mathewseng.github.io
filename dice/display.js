// One visual preference for every dice table. Switching never changes a roll.
export const DICE_STYLE_EVENT = 'dice-style-change';
const KEY = 'dice-display-style';
let memory;
export function diceStyle(fallback = '3d') {
  if (memory) return memory;
  try { const value = localStorage.getItem(KEY); if (['2d', '3d'].includes(value)) return value; } catch { /* In-memory play still works. */ }
  return fallback;
}
export function setDiceStyle(value) {
  if (!['2d', '3d'].includes(value)) return;
  memory = value;
  try { localStorage.setItem(KEY, value); } catch { /* Preference lasts this page session. */ }
  window.dispatchEvent(new CustomEvent(DICE_STYLE_EVENT, { detail: value }));
}
window.addEventListener('storage', event => {
  if (event.key === KEY && ['2d', '3d'].includes(event.newValue)) {
    memory = event.newValue;
    window.dispatchEvent(new CustomEvent(DICE_STYLE_EVENT, { detail: memory }));
  }
});
export function bindDiceStyle(container, { fallback = '3d', onChange = () => {} } = {}) {
  container.classList.add('segmented', 'dice-style');
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Dice appearance');
  container.innerHTML = ['2d', '3d'].map(value => `<button type="button" data-dice-style="${value}" aria-pressed="false">${value.toUpperCase()}</button>`).join('');
  const refresh = () => {
    const value = diceStyle(fallback);
    container.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.diceStyle === value)));
    onChange(value);
  };
  container.addEventListener('click', event => {
    const button = event.target.closest('[data-dice-style]');
    if (button) setDiceStyle(button.dataset.diceStyle);
  });
  window.addEventListener(DICE_STYLE_EVENT, refresh);
  refresh();
}
