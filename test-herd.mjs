// Standalone simulation of the herd-mode logic (mirrors app.js):
// check invariants across many random games.

function makeGame(cols, rows, nMines) {
  const cells = Array.from({ length: cols * rows }, () => ({
    mine: false, revealed: false, flagged: false, marked: false, count: 0,
    el: { textContent: '', className: '', classList: { add() {} } },
  }));
  let g = { cols, rows, mines: nMines, cells, started: false, over: false };
  const idx = i => i;

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

  function placeMines(safeIdx) {
    const safe = new Set([safeIdx, ...neighbors(safeIdx)]);
    let placed = 0;
    while (placed < nMines) {
      const i = Math.floor(Math.random() * cells.length);
      if (safe.has(i) || cells[i].mine) continue;
      cells[i].mine = true; placed++;
    }
    for (let i = 0; i < cells.length; i++)
      if (!cells[i].mine) cells[i].count = neighbors(i).filter(j => cells[j].mine).length;
  }

  function fleeMine(i) {
    const x = i % cols, y = (i / cols) | 0;
    const dirs = [
      [y, -1, 0], [rows - 1 - y, 1, 0], [x, 0, -1], [cols - 1 - x, 0, 1],
    ].sort((a, b) => a[0] - b[0]);
    for (const [, dr, dc] of dirs) {
      const nx = x + dc, ny = y + dr;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const t = cells[ny * cols + nx];
      if (t.revealed || t.mine || t.marked) continue;
      cells[i].mine = false;
      t.mine = true;
      return ny * cols + nx;
    }
    return null;
  }

  function herd(i) {
    let moved = false;
    for (const j of neighbors(i)) {
      const m = cells[j];
      if (!m.mine || m.marked) continue;
      if (fleeMine(j) !== null) moved = true;
    }
    return moved;
  }

  function refreshCounts() {
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.mine) continue;
      c.count = neighbors(i).filter(j => cells[j].mine).length;
      if (c.revealed) c.el.textContent = c.count || '';
    }
  }

  function reveal(i) {
    const c = cells[i];
    if (c.revealed || c.flagged || c.marked) return null;
    c.revealed = true;
    if (c.mine) return i;
    if (g.herd && herd(i)) refreshCounts();
    c.el.textContent = c.count || '';
    if (c.count) return null;
    for (const j of neighbors(i)) {
      if (cells[j].mine) continue;   // flood fill stops at mines
      const hit = reveal(j); if (hit !== null) return hit;
    }
    return null;
  }

  return { g, neighbors, placeMines, reveal, cells };
}

let failures = 0;
function invariants(game, hitCell = null) {
  const { cols, rows, cells } = game.g;
  const n = cells.filter(c => c.mine).length;
  if (n !== game.g.mines) { console.log('FAIL: mine count', n, '!=', game.g.mines); failures++; }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    // a revealed mine is only ever the one clicked to lose
    if (c.mine && c.revealed && i !== hitCell) { console.log('FAIL: revealed mine at', i); failures++; }
  }
  // revealed numbers must match actual mine neighbors
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c.revealed || c.mine) continue;
    const real = game.neighbors(i).filter(j => cells[j].mine).length;
    if (c.count !== real) { console.log('FAIL: stale count at', i, c.count, '!=', real); failures++; }
    if (String(c.el.textContent) !== String(real || '')) { console.log('FAIL: stale display at', i); failures++; }
  }
}

function playOne(cols, rows, nMines, herd, moves) {
  const game = makeGame(cols, rows, nMines);
  game.g.herd = herd;
  let i = Math.floor(Math.random() * cols * rows);
  game.placeMines(i);
  const h0 = game.reveal(i);
  if (h0 !== null && h0 !== i) { console.log('FAIL: first-click cascade death at', h0); failures++; }
  invariants(game, h0);
  if (h0 !== null) return game;       // clicked a mine (scurried under the start cell)
  for (let m = 0; m < moves; m++) {
    // click a random unrevealed, unflagged cell
    const options = game.g.cells.map((c, j) => c.revealed || c.flagged ? null : j).filter(v => v !== null);
    if (!options.length) break;
    const pick = options[Math.floor(Math.random() * options.length)];
    const hit = game.reveal(pick);
    if (hit !== null && hit !== pick) { console.log('FAIL: cascade death at', hit, '!= clicked', pick); failures++; }
    if (hit !== null) { invariants(game, hit); break; } // game over
    invariants(game);
    if (game.g.cells.every(c => c.mine || c.revealed)) break; // win
  }
  return game;
}

const LEVELS = [[9, 9, 10], [16, 16, 40], [30, 16, 99]];
for (let trial = 0; trial < 3000; trial++) {
  const [c, r, m] = LEVELS[trial % 3];
  playOne(c, r, m, true, 200);
}
console.log(failures === 0 ? '3000 herd games across all levels: all invariants held' : `${failures} FAILURES`);

// convergence: mines should drift to the border over many reveals
{
  const game = makeGame(9, 9, 10, true);
  game.g.herd = true;
  game.placeMines(40);
  const before = game.g.cells.filter(c => c.mine).length;
  // reveal a sweep of safe-ish cells without dying: click center, then random safe cells
  game.reveal(40);
  let border = 0, total = 0;
  for (let m = 0; m < 50; m++) {
    const options = game.g.cells.map((c, j) => (c.revealed || c.flagged || c.mine) ? null : j).filter(v => v !== null);
    if (!options.length) break;
    game.reveal(options[Math.floor(Math.random() * options.length)]); // may die; that's fine
  }
  for (const c of game.g.cells) if (c.mine) { total++; const x = game.g.cells.indexOf(c) % 9, y = (game.g.cells.indexOf(c) / 9) | 0; if (x === 0 || y === 0 || x === 8 || y === 8) border++; }
  console.log(`convergence sample: ${border}/${total} mines on border after 50 clicks (started 10)`);
}
process.exit(failures ? 1 : 0);
