// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, playerName } from '../core/rules.mjs';
import { editorOwner, editorCount, editorTargets, transferChecker } from '../core/position-editor.mjs';
import { settings } from '../core/storage.mjs';
import { el, button } from './shell.mjs';

const normalized = point => typeof point === 'string' ? point.slice(0, -1) : point;
export class PositionEditor {
  constructor(board, onChange) {
    this.board = board;
    this.onChange = onChange;
    this.selected = null;
    this.past = [];
    this.future = [];
    this.supplies = [0, 1].map(player => button('', () => this.tap(`off${player}`), 'editor-supply', {
      'data-editor-supply': player, 'aria-label': `Place ${playerName(player)} checkers`,
    }));
    this.tray = button('To tray', () => this.place(`off${editorOwner(this.state, this.selected)}`), '', {id:'editor-to-tray'});
    this.undo = button('Undo', () => this.restore(false), '', {id:'editor-undo'});
    this.redo = button('Redo', () => this.restore(true), '', {id:'editor-redo'});
    this.help = el('span', {class:'editor-help', role:'status'}, 'Pick a checker, then tap its destination. Or drag.');
    this.node = el('section', {class:'position-editor', hidden:true, 'aria-label':'Checker editor'},
      el('div', {class:'editor-supplies'}, ...this.supplies),
      el('div', {class:'editor-actions'}, this.tray, this.undo, this.redo), this.help);
    this.normal = {};
    for (const name of ['onPoint','onDragStart','onDrop','onCancel','onBackground','onDieTap','onCube']) this.normal[name] = board[name];
    board.onDieTap = (...args) => this.active ? this.onDice?.(args[2]) : this.normal.onDieTap?.(...args);
    board.onCube = () => this.active ? this.onContext?.() : this.normal.onCube?.();
    board.onPoint = (point, options) => this.active ? this.tap(point) : this.normal.onPoint?.(point, options);
    board.onDragStart = point => {
      if (!this.active) return this.normal.onDragStart?.(point);
      if (!editorCount(this.state, point)) return false;
      this.selected = point; this.dragging = true; this.render(); return true;
    };
    board.onDrop = (from, target) => {
      if (!this.active) return this.normal.onDrop?.(from, target);
      this.dragging = false;
      this.place(target, true);
    };
    board.onCancel = () => this.active ? this.clear() : this.normal.onCancel?.();
    board.onBackground = () => this.active ? this.clear() : this.normal.onBackground?.();
    document.addEventListener('click', e => {
      // The supply's label is replaced during selection. Its old span is then
      // detached, so closest() alone would mistake that tap for the background.
      const handled = e.composedPath().some(node => node === board.svg ||
        node.matches?.('button,a,input,textarea,select,label,summary,dialog,[role="button"],[contenteditable]'));
      if (this.active && this.selected !== null && !handled &&
          performance.now() >= (board.suppressClickUntil || 0)) this.clear();
    });
    document.addEventListener('keydown', e => {
      if (!this.active || document.querySelector('dialog[open]') || e.target.closest('input,textarea,select,[contenteditable]')) return;
      if (e.key.toLowerCase() === 'z') { e.preventDefault(); this.restore(e.shiftKey); }
      if (['Backspace', 'Delete'].includes(e.key) && this.selected !== null) { e.preventDefault(); this.tray.click(); }
    });
  }
  sync(state, active) {
    this.state = state; this.active = active; this.node.hidden = !active;
    if (!active) { this.selected = null; this.dragging = false; return; }
    if (!editorCount(state, this.selected)) this.selected = null;
    this.render();
  }
  clear() { this.selected = null; this.dragging = false; this.render(); }
  reset() { this.past = []; this.future = []; this.selected = null; }
  tap(point) {
    if (point === this.selected) return this.clear();
    if (this.selected !== null && editorTargets(this.state, this.selected).includes(point)) return this.place(point);
    this.selected = editorCount(this.state, point) ? point : null;
    this.render();
  }
  place(point, drop = false) {
    const from = this.selected, before = this.state, owner = editorOwner(before, from);
    const next = transferChecker(before, from, point);
    this.selected = !drop && String(from).startsWith('off') && next && editorCount(next, from) ? from : null;
    if (next) {
      this.past.push(clone(before)); this.past = this.past.slice(-100); this.future = [];
      this.onChange(next);
      this.board.animateEdit(before, next, normalized(from), normalized(point), owner);
    } else {
      this.render();
      if (drop && from !== null) this.board.animateEdit(before, before, normalized(from), normalized(from), owner);
    }
  }
  restore(redo) {
    const stack = redo ? this.future : this.past;
    if (!stack.length) return;
    (redo ? this.past : this.future).push(clone(this.state)); this.selected = null;
    this.onChange(stack.pop());
  }
  render() {
    const s = this.state, owner = editorOwner(s, this.selected) ?? s.turn;
    const targets = editorTargets(s, this.selected), moves = targets.map(to => ({to:normalized(to)}));
    // The editor can move either color, in any direction, without playing dice.
    this.board.render({...s, turn:owner}, {...settings(), editor:true, diceState:s, chooseDie:()=>{}, moveHints:true,
      selected: this.selected === null ? null : normalized(this.selected),
      sources:s.points.flatMap((n,p)=>n?[p]:[]), moves,
      dropPreview: target => {
        if (!targets.includes(target)) return null;
        return {point:normalized(target), count:editorCount(s,target)+(target===this.selected?0:1), undo:target===this.selected};
      }});
    this.board.svg.querySelector('.board-cube')?.setAttribute('role','button');
    this.board.svg.querySelector('.board-cube')?.setAttribute('tabindex','0');
    for (const g of this.board.svg.querySelectorAll('[data-point]')) {
      const point = this.board.decode(g.dataset.point);
      g.classList.toggle('editor-target', this.dragging && targets.includes(point));
      g.setAttribute('aria-label', `${g.getAttribute('aria-label').split(', movable')[0]}${targets.includes(point) ? ', place selected checker here' : ''}`);
    }
    this.supplies.forEach((b, p) => {
      b.disabled = !s.off[p]; b.setAttribute('aria-pressed', String(this.selected === `off${p}`));
      b.replaceChildren(el('span',{class:`checker-dot${p?' teal':''}`, 'aria-hidden':true}),
        el('span',{},playerName(p)), el('span',{class:'editor-supply-count'},s.off[p]));
    });
    this.tray.disabled = this.selected === null || String(this.selected).startsWith('off');
    this.undo.disabled = !this.past.length; this.redo.disabled = !this.future.length;
    this.help.textContent = this.selected === null ? 'Pick a checker, then tap its destination. Or drag.'
      : String(this.selected).startsWith('off') ? 'Tap points to place checkers.' : 'Tap a destination. Tap the checker again to cancel.';
  }
}
