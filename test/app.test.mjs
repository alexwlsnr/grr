// Tests that load the REAL src/frontend/app.js into a VM with a stubbed DOM,
// so they exercise the shipped code rather than a copy of it.
//   node --test test/app.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(here, '../src/frontend/app.js'), 'utf8');

function load() {
  const handlers = {};
  const els = {};
  let activeTimer = null;
  const mk = id => ({
    id, hidden: false, style: {}, dataset: {}, className: '', textContent: '', innerHTML: '',
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener(t, f) { (handlers[id + ':' + t] ??= []).push(f); },
    appendChild() {}, querySelectorAll() { return []; }, focus() {},
    getBoundingClientRect() { return { width: 0, height: 0 }; },
  });
  const document = {
    getElementById: id => (els[id] ??= mk(id)),
    createElement: () => mk('x'),
    addEventListener(t, f) { (handlers['doc:' + t] ??= []).push(f); },
    querySelectorAll() { return []; },
    documentElement: { style: {} },
  };
  const ctx = {
    document, handlers, els, requestAnimationFrame() {},
    window: { devicePixelRatio: 1 },
    tiny: { win: { setSize() {}, minimize() {} }, quit() {} },
    Math, console,
    setInterval: f => { activeTimer = f; return 1; },
    clearInterval: () => { activeTimer = null; },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + `
;globalThis.__api = {
  get cells(){ return cells; }, get cols(){ return cols; }, get rows(){ return rows; },
  get mines(){ return mines; }, get lives(){ return lives; }, get over(){ return over; },
  get won(){ return won; }, get started(){ return started; },
  set level(v){ level = v; }, set livesMode(v){ livesMode = v; }, set herdMode(v){ herdMode = v; },
  newGame, reveal, neighbors,
  click: i => handlers['board:click'][0]({ target: { closest: () => ({ dataset: { i: String(i) } }) } }),
  rightclick: i => handlers['board:contextmenu'][0]({ preventDefault() {}, target: { closest: () => ({ dataset: { i: String(i) } }) } }),
  mineLed: () => els.mineled.textContent,
  timerLed: () => els.timerled.textContent,
  livesText: () => els.lives.textContent,
};`, ctx);
  const api = ctx.__api;
  api.tick = () => { if (activeTimer) activeTimer(); };
  return api;
}

const LIVES_GAME = { level: 'intermediate', livesMode: true, herdMode: false };

test('defaults: intermediate, 3 lives, 40 mines', () => {
  const g = load();
  assert.equal(g.cols, 16); assert.equal(g.rows, 16); assert.equal(g.mines, 40);
  assert.equal(g.lives, 3);
  assert.equal(g.livesText(), '♥♥♥');
});

test('expert: 30x16, 85 mines, 5 lives', () => {
  const g = load();
  g.level = 'expert'; g.livesMode = true; g.newGame();
  assert.equal(g.cols, 30); assert.equal(g.rows, 16); assert.equal(g.mines, 85);
  assert.equal(g.lives, 5);
  assert.equal(g.livesText(), '♥♥♥♥♥');
  assert.equal(g.mineLed(), '085');
});

test('timer keeps counting past 99 and caps at 999', () => {
  const g = load();
  g.newGame();
  g.click(0);                       // starts the timer
  for (let s = 0; s < 150; s++) g.tick();
  assert.equal(g.timerLed(), '150');
  for (let s = 0; s < 1000; s++) g.tick();
  assert.equal(g.timerLed(), '999');
});

test('mine LED shows a negative count as -NN when flags exceed mines', () => {
  const g = load();
  g.level = 'beginner'; g.newGame();          // 10 mines
  for (let k = 0; k < 12; k++) g.rightclick(k);
  assert.equal(g.mineLed(), '-02');
});

test('flagging before the first click does not start the game', () => {
  const g = load();
  g.newGame();
  g.rightclick(0);
  g.click(0);                                  // left-click on a flag
  assert.equal(g.started, false);
  assert.equal(g.timerLed(), '000');
});

test('first real reveal is safe even after a flag-first click (standard mode)', () => {
  const g = load();
  g.level = 'beginner'; g.livesMode = false; g.newGame();
  for (let t = 0; t < 500; t++) {
    g.newGame();
    g.rightclick(0);
    g.click(0);                                // flag click: must not start the game
    g.click(80);                               // far corner, first real reveal
    assert.equal(g.over, false, `trial ${t}: first reveal hit a mine`);
  }
});

test('herd mode: mines move one step, never onto revealed cells, nothing revealed but the hit', () => {
  const g = load();
  for (let t = 0; t < 200; t++) {
    g.level = 'intermediate'; g.livesMode = false; g.herdMode = true; g.newGame();
    g.click(Math.floor(Math.random() * g.cells.length));
    for (let m = 0; m < 150 && !g.over; m++) {
      const opts = g.cells.map((c, j) => c.revealed || c.flagged ? null : j).filter(v => v !== null);
      if (!opts.length) break;
      g.click(opts[Math.floor(Math.random() * opts.length)]);
      for (let k = 0; k < g.cells.length; k++) {
        const c = g.cells[k];
        if (c.mine && c.revealed && !g.over) assert.fail(`revealed mine at ${k} in a live game`);
      }
      // revealed numbers must match the real neighbour mine count
      for (let k = 0; k < g.cells.length; k++) {
        const c = g.cells[k];
        if (!c.revealed || c.mine) continue;
        const real = g.neighbors(k).filter(j => g.cells[j].mine).length;
        assert.equal(c.count, real, `stale count at ${k}`);
      }
    }
  }
});
