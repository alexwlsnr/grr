// Minesweeper — the game itself runs entirely in the page. The backend only
// hosts the window.

export function init(app) {
  app.setTitle('Minesweeper');
  app.setResizable(false);
  app.center();
}
