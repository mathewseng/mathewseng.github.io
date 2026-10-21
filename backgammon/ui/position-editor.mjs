// SPDX-License-Identifier: GPL-3.0-or-later
import { clone, playerName } from '../core/rules.mjs';
import { editorOwner, editorCount, editorTargets, transferChecker, editChecker } from '../core/position-editor.mjs';
import { settings } from '../core/storage.mjs';
import { el, button } from './shell.mjs';

const normalized = point => typeof point === 'string' ? point.slice(0, -1) : point;
export class PositionEditor {
  constructor(board, onChange) {
    this.board = board;
    this.onChange = onChange;
    this.selected = null;
    this.color = 0;
    this.past = [];
    this.future = [];
    this.supplies = [0, 1].map(player => button('', () => this.chooseColor(player), 'editor-supply', {
      'data-editor-supply': player, 'aria-label': `Place ${playerName(player)} checkers`,
    }));
    this.undo = button('Undo', () => this.restore(false), '', {id:'editor-undo'});
    this.redo = button('Redo', () => this.restore(true), '', {id:'editor-redo'});
    this.help = el('span', {class:'editor-help', role:'status'}, 'Tap a checker to remove · tap a point to add · drag to move.');
    this.node = el('section', {class:'position-editor', hidden:true, 'aria-label':'Checker editor'},
      el('div', {class:'editor-supplies'}, ...this.supplies),
      el('div', {class:'editor-actions'}, this.undo, this.redo), this.help);
    this.normal = {};
    for (const name of ['onPoint','onDragStart','onDrop','onCancel','onBackground','onDieTap','onCube']) this.normal[name] = board[name];
    board.onDieTap = (...args) => this.active ? this.onDice?.(args[2]) : this.normal.onDieTap?.(...args);
    board.onCube = () => this.active ? this.onContext?.() : this.normal.onCube?.();
    board.onPoint = (point, options) => this.active ? this.tap(point, options) : this.normal.onPoint?.(point, options);
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
  chooseColor(player) { this.color = player; this.clear(); }
  commit(next) {
    if (!next || JSON.stringify(next) === JSON.stringify(this.state)) return;
    this.past.push(clone(this.state)); this.past = this.past.slice(-100); this.future = [];
    this.selected = null;
    this.onChange(next);
  }
  tap(point, options = {}) {
    if (String(point).startsWith('off')) return this.chooseColor(editorOwner(this.state, point));
    // Enter acts like a checker tap on an occupied point; Shift+Enter adds.
    const remove = options.checkerTap ?? (!options.quick && !!editorCount(this.state, point));
    const before = this.state, owner = remove ? editorOwner(before, point) : this.color;
    const next = editChecker(before, point, this.color, remove);
    if (!next) return;
    this.color = owner;
    this.commit(next);
    this.board.animateEdit(before, next, normalized(remove ? point : `off${owner}`),
      normalized(remove ? `off${owner}` : point), owner);
  }
  place(point, drop = false) {
    const from = this.selected, before = this.state, owner = editorOwner(before, from);
    const next = transferChecker(before, from, point);
    this.selected = null;
    if (next) {
      this.color = owner;
      this.commit(next);
      this.board.animateEdit(before, next, normalized(from), normalized(point), owner);
    } else {
      this.render();
      if (drop && from !== null) this.board.animateEdit(before, before, normalized(from), normalized(from), owner);
    }
  }
  restore(redo) {
    const stack = redo ? this.future : this.past;
    if (!stack.length) return;
    this.board.endDrag(); this.dragging = false;
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
      g.setAttribute('aria-label', `${g.getAttribute('aria-label').split(', movable')[0]}, ${editorCount(s,point) ? 'tap checker to remove, drag to move; ' : ''}tap point to place ${playerName(this.color)}`);
    }
    this.supplies.forEach((b, p) => {
      b.setAttribute('aria-pressed', String(this.color === p));
      b.title = `${playerName(p)} · ${s.off[p]} checkers available to place`;
      b.replaceChildren(el('span',{class:`checker-dot${p?' teal':''}`, 'aria-hidden':true}),
        el('span',{},playerName(p)), el('span',{class:'editor-supply-count'},s.off[p]));
    });
    this.undo.disabled = !this.past.length; this.redo.disabled = !this.future.length;
    this.help.textContent = this.dragging ? 'Release to place · return to the start to cancel.'
      : 'Tap a checker to remove · tap a point to add · drag to move.';

  }
}
