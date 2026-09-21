// Win 3.11 Minesweeper. All game logic lives in the page; the backend only
// hosts the window.

const LEVELS = {
  beginner:     { cols: 9,  rows: 9,  mines: 10  },
  intermediate: { cols: 16, rows: 16, mines: 40  },
  expert:       { cols: 30, rows: 16, mines: 99  },
};
const FACES = {
  ok:   '<svg viewBox="0 0 24 24"><g fill="none" stroke="#000" stroke-width="1.6"><circle cx="12" cy="12" r="9.6"/><path d="M8 14.2q4 3.6 8 0"/></g><circle cx="8.6" cy="9.4" r="1.25"/><circle cx="15.4" cy="9.4" r="1.25"/></svg>',
  oh:   '<svg viewBox="0 0 24 24"><g fill="none" stroke="#000" stroke-width="1.6"><circle cx="12" cy="12" r="9.6"/><circle cx="12" cy="15.2" r="1.6"/></g><circle cx="8.6" cy="9.4" r="1.25"/><circle cx="15.4" cy="9.4" r="1.25"/></svg>',
  win:  '<svg viewBox="0 0 24 24"><g fill="none" stroke="#000" stroke-width="1.6"><circle cx="12" cy="12" r="9.6"/><path d="M8 14.2q4 3.6 8 0"/></g><rect x="5.8" y="7.8" width="4.6" height="3.4" fill="#000"/><rect x="13.6" y="7.8" width="4.6" height="3.4" fill="#000"/><path d="M10.4 9.4h3.2" stroke="#000" stroke-width="1.4"/></svg>',
  dead: '<svg viewBox="0 0 24 24"><g fill="none" stroke="#000" stroke-width="1.6"><circle cx="12" cy="12" r="9.6"/><path d="M12 17.5q4-3.6 8-0" transform="translate(-4 0)"/><path d="M6.8 7.4l2.4 2.4m0-2.4l-2.4 2.4M14.8 7.4l2.4 2.4m0-2.4l-2.4 2.4"/></g></svg>',
};

let level = 'beginner';
let livesMode = false;
let herdMode = false;   // mines scurry away from freshly revealed cells

let cols, rows, mines;
let cells = [];            // { mine, revealed, flagged, marked, count, el }
let started = false;       // mines placed (after first click)
let over = false;
let won = false;
let lives = 3;
let flags = 0;
let time = 0;
let timerId = null;

const board = document.getElementById('board');
const mineLed = document.getElementById('mineled');
const timerLed = document.getElementById('timerled');
const smiley = document.getElementById('smiley');
const livesEl = document.getElementById('lives');
const dialog = document.getElementById('dialog');
const dmsg = document.getElementById('dmsg');
const winEl = document.getElementById('win');

// ── LEDs & faces ─────────────────────────────────────────────

function setLed(el, v) {
  const s = String(Math.max(-99, Math.min(999, v))).padStart(3, '0');
  el.textContent = s;
}

function setFace(k) {
  smiley.innerHTML = FACES[k];
}

function setLivesDisplay() {
  livesEl.hidden = !livesMode;
  livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(3 - lives);
}

function sync() {
  setLed(mineLed, mines - flags);
  setLed(timerLed, time);
  setFace(over ? (won ? 'win' : 'dead') : (livesMode && lives === 1 ? 'oh' : 'ok'));
  setLivesDisplay();
}

// ── game ─────────────────────────────────────────────────────

function newGame() {
  ({ cols, rows, mines } = LEVELS[level]);
  started = false;
  over = false;
  won = false;
  lives = 3;
  flags = 0;
  time = 0;
  clearInterval(timerId);
  timerId = null;

  winEl.style.width = cols * 16 + 20 + 'px';
  board.style.gridTemplateColumns = `repeat(${cols}, 16px)`;
  board.innerHTML = '';
  cells = [];
  for (let i = 0; i < cols * rows; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = i;
    board.appendChild(el);
    cells.push({ mine: false, revealed: false, flagged: false, marked: false, count: 0, el });
  }
  updateMenuChecks();
  dialog.hidden = true;
  sync();
  fitWindow();
}

function fitWindow() {
  requestAnimationFrame(() => {
    // Window size is device px; the page measures CSS px. The bounding
    // rect (not offsetWidth) reflects the page's zoom level, and on
    // scaled backends (X11 with a HiDPI Xft.dpi, scaled Wayland) we
    // must also multiply by the device pixel ratio — otherwise the
    // window is too small for its own content.
    const r = winEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    tiny.win.setSize(Math.round(r.width * dpr), Math.round(r.height * dpr));
  });
}

function placeMines(safeIdx) {
  const safe = new Set([safeIdx, ...neighbors(safeIdx)]);
  let placed = 0;
  while (placed < mines) {
    const i = Math.floor(Math.random() * cells.length);
    if (safe.has(i) || cells[i].mine) continue;
    cells[i].mine = true;
    placed++;
  }
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].mine) continue;
    cells[i].count = neighbors(i).filter(j => cells[j].mine).length;
  }
}

// ── herd mode ────────────────────────────────────────────────
// Revealing a cell makes every mine sitting next to it scurry one
// square toward the nearest board edge (first legal direction wins;
// a mine with no legal move is pinned). Numbers are recomputed
// after the move, so the whole grid shifts under your eyes.
function herd(i) {
  let moved = false;
  for (const j of neighbors(i)) {
    const m = cells[j];
    if (!m.mine || m.marked) continue;   // defused mines (3 lives) stay put
    if (fleeMine(j) !== null) moved = true;
  }
  return moved;
}

function fleeMine(i) {
  const x = i % cols, y = (i / cols) | 0;
  const dirs = [
    [y, -1, 0], [rows - 1 - y, 1, 0], [x, 0, -1], [cols - 1 - x, 0, 1],
  ].sort((a, b) => a[0] - b[0]);        // nearest edge first, ties keep this order
  for (const [, dr, dc] of dirs) {
    const nx = x + dc, ny = y + dr;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    const t = cells[ny * cols + nx];
    if (t.revealed || t.mine || t.marked) continue;
    cells[i].mine = false;
    t.mine = true;
    return ny * cols + nx;
  }
  return null;                           // pinned — cornered by revealed cells
}

function refreshCounts() {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.mine) continue;
    c.count = neighbors(i).filter(j => cells[j].mine).length;
    if (c.revealed && !c.mine) {
      c.el.textContent = c.count || '';
      c.el.className = 'cell' + (c.revealed ? ' revealed' : '') + (c.count ? ' c' + c.count : '');
    }
  }
}

function neighbors(i) {
  const x = i % cols, y = (i / cols) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push(ny * cols + nx);
    }
  return out;
}

function startTimer() {
  timerId = setInterval(() => {
    if (time < 99) { time++; setLed(timerLed, time); }
    else clearInterval(timerId), (timerId = null);
  }, 1000);
}

function reveal(i) {
  // returns the index of the mine hit by a direct click, or null.
  // The cascade never opens a mine cell (like the real flood fill):
  // in herd mode a mine may scurry onto a cell mid-cascade, but that
  // hides the mine there — it doesn't kill you. Only clicking it does.
  const c = cells[i];
  if (c.revealed || c.flagged || c.marked) return null;
  c.revealed = true;
  c.el.classList.add('revealed');
  if (c.mine) { c.el.textContent = '✸'; c.el.classList.add('mine'); return i; }
  if (herdMode && !over && herd(i)) refreshCounts();   // mines scurry, numbers shift
  if (c.count) { c.el.textContent = c.count; c.el.classList.add('c' + c.count); return null; }
  for (const j of neighbors(i)) {
    if (cells[j].mine) continue;   // flood fill stops at mines, never opens them
    const hit = reveal(j);
    if (hit !== null) return hit;
  }
  return null;
}

function render() {
  for (const c of cells) {
    c.el.textContent = c.marked ? '✸' : c.flagged ? '⚑' : c.revealed ? (c.count || '') : '';
  }
}

function lose() {
  over = true;
  clearInterval(timerId);
  timerId = null;
  for (const c of cells) {
    if (c.mine && !c.flagged && !c.marked) { c.el.textContent = '✸'; c.el.classList.add('mine'); }
    if (!c.mine && c.flagged) { c.el.textContent = '✖'; c.el.classList.add('c3'); }
  }
  sync();
}

function winGame() {
  over = true;
  won = true;
  clearInterval(timerId);
  timerId = null;
  for (const c of cells) if (c.mine && !c.flagged && !c.marked) { c.flagged = true; c.el.textContent = '⚑'; }
  sync();
}

function checkWin() {
  // win = every non-mine cell revealed
  for (const c of cells) if (!c.mine && !c.revealed) return;
  winGame();
}

function hitMine(i) {
  if (livesMode) lives--;
  if (livesMode && lives > 0) {
    // lose a life; the mine gets locked, flagged in place
    cells[i].marked = true;
    flags++;
    render();
    sync();
    return;
  }
  cells[i].el.classList.add('boom');
  lose();
}

// ── input ────────────────────────────────────────────────────

board.addEventListener('click', e => {
  if (over) return;
  const el = e.target.closest('.cell');
  if (!el) return;
  const i = +el.dataset.i;
  const c = cells[i];
  if (!started) { started = true; placeMines(i); startTimer(); }
  if (c.flagged || c.marked) return;
  let hit = null;
  if (c.revealed) {
    // chord: all adjacent mines already flagged → open the rest
    if (c.count && neighbors(i).filter(j => cells[j].flagged || cells[j].marked).length === c.count)
      for (const j of neighbors(i)) { hit = reveal(j); if (hit !== null) break; }
  } else {
    hit = reveal(i);
  }
  if (hit !== null) { hitMine(hit); return; }
  render();
  sync();
  checkWin();
});

board.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (over) return;
  const el = e.target.closest('.cell');
  if (!el) return;
  const i = +el.dataset.i;
  const c = cells[i];
  if (c.revealed || c.marked) return;
  c.flagged = !c.flagged;
  flags += c.flagged ? 1 : -1;
  render();
  sync();
});

board.addEventListener('mousedown', e => {
  const el = e.target.closest('.cell');
  if (e.button === 0 && !over && el && !el.classList.contains('revealed'))
    setFace('oh');
});
board.addEventListener('mouseup', () => { if (!over) sync(); });

smiley.addEventListener('click', newGame);

document.getElementById('dok').addEventListener('click', () => { dialog.hidden = true; });
document.getElementById('closebtn').addEventListener('click', () => tiny.quit());
document.getElementById('minbtn').addEventListener('click', () => tiny.win.minimize());

// Zoom dropdown — drive the page's zoom and refit the window to match
const zoomInput = document.getElementById('zoom');
zoomInput.addEventListener('change', () => {
  document.documentElement.style.zoom = parseFloat(zoomInput.value);
  fitWindow();
});

// ── menus ────────────────────────────────────────────────────

const dds = { game: document.getElementById('dd-game'), help: document.getElementById('dd-help') };
let openMenu = null;

function closeMenus() {
  for (const k in dds) dds[k].hidden = true;
  document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
  openMenu = null;
}

document.querySelectorAll('.menu').forEach(m => {
  m.addEventListener('click', e => {
    e.stopPropagation();
    const k = m.dataset.menu;
    const wasOpen = openMenu === k;
    closeMenus();
    if (!wasOpen) {
      openMenu = k;
      m.classList.add('open');
      dds[k].hidden = false;
    }
  });
});

document.querySelectorAll('.item').forEach(it => {
  it.addEventListener('click', e => {
    e.stopPropagation();
    closeMenus();
    if (it.dataset.action) doAction(it.dataset.action);
  });
});

function doAction(a) {
  switch (a) {
    case 'new':            newGame(); break;
    case 'beginner':       if (level !== 'beginner') { level = 'beginner'; newGame(); } break;
    case 'intermediate':   if (level !== 'intermediate') { level = 'intermediate'; newGame(); } break;
    case 'expert':         if (level !== 'expert') { level = 'expert'; newGame(); } break;
    case 'lives':          livesMode = !livesMode; newGame(); break;
    case 'herd':           herdMode = !herdMode; newGame(); break;
    case 'quit':           tiny.quit(); break;
    case 'about':
      showDialog('Minesweeper\n\ntinyjs demo — WebKit window, ~6 MB, no Electron.\n\nHerd Mode (Game menu): mines scurry toward the nearest\nedge whenever you reveal a cell next to them.\nFlush them into corners, then clear the board.');
      break;
  }
}

function updateMenuChecks() {
  document.getElementById('m-beginner').classList.toggle('checked', level === 'beginner');
  document.getElementById('m-intermediate').classList.toggle('checked', level === 'intermediate');
  document.getElementById('m-expert').classList.toggle('checked', level === 'expert');
  document.getElementById('m-lives').classList.toggle('checked', livesMode);
  document.getElementById('m-herd').classList.toggle('checked', herdMode);
}

document.addEventListener('click', closeMenus);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMenus();
  if (e.key === 'F9') { e.preventDefault(); newGame(); }
});

// ── dialog ───────────────────────────────────────────────────

function showDialog(msg) {
  dmsg.textContent = msg;
  dialog.hidden = false;
  document.getElementById('dok').focus();
}

// ── init ─────────────────────────────────────────────────────

newGame();

