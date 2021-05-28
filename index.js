const { Chess } = require("chess.js");
const { Engine } = require("node-uci");
const puppeteer = require("puppeteer");

/**
 * convert from algebraic format to indices
 * (zero at top left)
 * TODO: add sanity checking
 * @param {string} position
 * @return {{x: number; y:number}}
 */
function algebraic_to_indices(position) {
  const x = position.charCodeAt(0) - "a".charCodeAt(0);
  const y = 8 - parseInt(position[1]);
  return { x, y };
}

/**
 * click a chess cell
 * @param {puppeteer.Page} page
 * @param {puppeteer.ElementHandle<Element>} board
 * @param {number} x
 * @param {number} y
 */
async function chess_click(page, board, x, y) {
  const box = await board.boundingBox();
  const cell_size = {
    x: box.width / 8.0,
    y: box.height / 8.0,
  };
  const page_pos = {
    x: box.x + cell_size.x * x + cell_size.x / 2.0,
    y: box.y + cell_size.y * y + cell_size.y / 2.0,
  };
  page.mouse.click(page_pos.x, page_pos.y);
}

/**
 * move piece in long algebraic notation
 * @param {puppeteer.Page} page
 * @param {puppeteer.ElementHandle<Element>} board
 * @param {string} move
 */
async function chess_move(page, board, move) {
  const { x: sx, y: sy } = algebraic_to_indices(move.slice(0, 2));
  const { x: ex, y: ey } = algebraic_to_indices(move.slice(2, 4));
  await chess_click(page, board, sx, sy);
  await page.waitForTimeout(50);
  await chess_click(page, board, ex, ey);
  if (move.length > 4) {
    await page.waitForTimeout(500);
    await page.click(`.promotion-piece.w${move[4]}`);
  }
  await page.waitForTimeout(100);
}

/**
 * get the currently played moves
 * @param {puppeteer.Page} page
 */
async function scrape_moves(page) {
  return await (
    await page.$$eval(".move", (moves) =>
      moves.map((move) =>
        [...move.childNodes].map((node) => node.textContent).join(" ")
      )
    )
  ).join(" ");
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ["--start-maximized"],
  });
  const page = await browser.newPage();
  await page.goto("https://www.chess.com/play/computer");

  const engine = new Engine("stockfish");
  await engine.init();
  await engine.setoption("Threads", "12");
  await engine.isready();
  await engine.ucinewgame();

  const chess = new Chess();

  const board = await page.$("chess-board");

  const play = async () => {
    let move = 1;
    while (true) {
      const pgn_moves = await scrape_moves(page);
      chess.load_pgn(pgn_moves);
      if (chess.game_over()) {
        break;
      }
      await engine.position(chess.fen());
      const { bestmove, ponder } = await engine.go({ depth: 20 });
      console.log(`move ${move} is ${bestmove}`);
      await chess_move(page, board, bestmove);
      await page.waitForSelector(`[data-whole-move-number="${move}"] > .black`);
      move += 1;
    }
  };
  await page.exposeFunction("play", play);
  await page.$eval(".selection-menu-footer > button", (start) =>
    start.addEventListener("mousedown", (e) => {
      if (e.target.title === "Play") {
        play();
      }
    })
  );
})();
