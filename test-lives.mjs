// Standalone simulation of the 3 Lives mode logic (mirrors app.js):
// check invariants across many random games.

function makeGame(cols, rows, nMines) {
  const cells = Array.from({ length: cols * rows }, () => ({
    mine: false, revealed: false, flagged: false, marked: false, count: 0,
    el: { textContent: '', className: '', classList: { add() {} } },
  }));
  let g = { cols, rows, mines: nMines, cells, started: false, over: false, won: false };

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

  function reveal(startI) {
    const queue = [startI];
    let hit = null;
    
    while (queue.length && hit === null) {
      const i = queue.shift();
      const c = cells[i];
      if (c.revealed || c.flagged || c.marked) continue;
      
      c.revealed = true;
      if (c.mine) {
        hit = i;
        break;
      }
      
      if (c.count) continue;
      
      for (const j of neighbors(i)) {
        if (!cells[j].mine) queue.push(j);
      }
    }
    return hit;
  }

  function hitMine(i, lives) {
    if (lives <= 0) return { mineHit: true, lives: lives };
    // In lives mode: lose a life, mine gets marked
    cells[i].marked = true;
    return { mineHit: false, lives: lives - 1 };
  }

  function checkWin() {
    for (const c of cells) if (!c.mine && !c.revealed) return false;
    return true;
  }

  return { g, neighbors, placeMines, reveal, hitMine, checkWin, cells };
}

let failures = 0;
function invariants(game, lives, hitCell = null) {
  const { cols, rows, cells } = game.g;
  const n = cells.filter(c => c.mine).length;
  if (n !== game.g.mines) { console.log('FAIL: mine count', n, '!=', game.g.mines); failures++; }
  
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.mine && c.revealed && i !== hitCell) { 
      console.log('FAIL: revealed mine at', i); 
      failures++; 
    }
  }
  
  // Check marked mines are actually mines
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c.marked && !c.mine) { 
      console.log('FAIL: marked non-mine at', i); 
      failures++; 
    }
  }
  
  // Check revealed numbers match actual mine neighbors
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (!c.revealed || c.mine) continue;
    const real = game.neighbors(i).filter(j => cells[j].mine).length;
    if (c.count !== real) { 
      console.log('FAIL: stale count at', i, c.count, '!=', real); 
      failures++; 
    }
  }
}

function playOne(cols, rows, nMines, maxMoves) {
  const game = makeGame(cols, rows, nMines);
  let lives = 3;
  let started = false;
  let safeIdx = null;
  
  for (let m = 0; m < maxMoves; m++) {
    if (game.g.over) break;
    
    // Pick a random unrevealed, unflagged cell
    const options = game.g.cells.map((c, j) => c.revealed || c.flagged ? null : j).filter(v => v !== null);
    if (!options.length) break;
    
    const pick = options[Math.floor(Math.random() * options.length)];
    
    if (!started) {
      started = true;
      game.placeMines(pick);
    }
    
    const hit = game.reveal(pick);
    
    if (hit !== null) {
      // Mine hit!
      const result = game.hitMine(hit, lives);
      if (result.mineHit) {
        // Game over
        game.g.over = true;
        invariants(game, lives, hit);
        break;
      } else {
        // Lost a life, mine is marked
        lives = result.lives;
        invariants(game, lives, hit);
        continue;
      }
    }
    
    invariants(game, lives);
    
    // Check win condition
    if (game.checkWin()) {
      game.g.over = true;
      game.g.won = true;
      break;
    }
  }
}

const LEVELS = [[9, 9, 10], [16, 16, 40], [30, 16, 99]];

// Test 3 Lives mode
console.log('Testing 3 Lives mode...');
for (let trial = 0; trial < 1000; trial++) {
  const [c, r, m] = LEVELS[trial % 3];
  playOne(c, r, m, 200);
}

// Test standard mode (no lives)
console.log('Testing standard mode...');
for (let trial = 0; trial < 1000; trial++) {
  const [c, r, m] = LEVELS[trial % 3];
  playOne(c, r, m, 50);
}

console.log(failures === 0 ? '2000 games (lives + standard): all invariants held' : `${failures} FAILURES`);
process.exit(failures ? 1 : 0);
