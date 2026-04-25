/* =====================================================
   CHESSMASTER ZYNTIX — engine.js
   Chess Board Rendering + AI Engine + Timer System
   ===================================================== */

/* ══════════════════════════════════════
   PIECE UNICODE MAP
══════════════════════════════════════ */
const PIECES_MAP = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟'
};

/* ══════════════════════════════════════
   GLOBAL ENGINE STATE
══════════════════════════════════════ */
const Engine = {
  chess:        null,   // chess.js instance
  selectedSq:   null,   // currently selected square
  legalMoves:   [],     // legal moves for selected piece
  lastMove:     null,   // { from, to } last move played
  boardFlipped: false,  // is board flipped?
  theme:        'classic',
  showCoords:   true,
  showHints:    true,
  isAIThinking: false,
  aiDepth:      5,
  playerColor:  'white', // 'white' | 'black'
  gameMode:     'local', // 'local' | 'ai' | 'online' | 'puzzle' | 'analysis' | 'lesson'
  timeControl:  300,     // seconds per player (0 = none)
};

/* ══════════════════════════════════════
   TIMER SYSTEM
══════════════════════════════════════ */
const TimerSystem = {
  white:    0,
  black:    0,
  active:   null,  // 'white' | 'black' | null
  interval: null,

  init(seconds) {
    this.stop();
    this.white  = seconds;
    this.black  = seconds;
    this.active = null;
    this._render();
    if (seconds > 0) this.start();
  },

  start() {
    if (this.interval) return;
    this.active = Engine.chess?.turn() === 'w' ? 'white' : 'black';
    this.interval = setInterval(() => this._tick(), 1000);
  },

  stop() {
    clearInterval(this.interval);
    this.interval = null;
    this.active   = null;
  },

  switchSide() {
    this.active = Engine.chess?.turn() === 'w' ? 'white' : 'black';
  },

  _tick() {
    if (!Engine.chess || Engine.chess.game_over()) { this.stop(); return; }
    const who = Engine.chess.turn() === 'w' ? 'white' : 'black';
    this[who] -= 1;
    this._render();
    if (this[who] <= 10) SoundSystem.timerLow();
    if (this[who] <= 0) {
      this.stop();
      const winner = who === 'white' ? 'Black' : 'White';
      GameOverSystem.show(winner + ' WINS!', '⏱ On Time!', '⏱', who !== Engine.playerColor);
    }
  },

  _render() {
    const fmt = (s) => {
      if (s < 0) s = 0;
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec.toString().padStart(2, '0')}`;
    };
    const botColor = Engine.playerColor;
    const topColor = botColor === 'white' ? 'black' : 'white';

    const botEl = document.getElementById('timer-bottom');
    const topEl = document.getElementById('timer-top');

    if (botEl) {
      botEl.textContent = fmt(this[botColor]);
      botEl.className   = 'player-timer' +
        (this.active === botColor ? ' active' : '') +
        (this[botColor] <= 30 ? ' danger' : '');
    }
    if (topEl) {
      topEl.textContent = fmt(this[topColor]);
      topEl.className   = 'player-timer' +
        (this.active === topColor ? ' active' : '') +
        (this[topColor] <= 30 ? ' danger' : '');
    }

    if (Engine.timeControl === 0) {
      if (botEl) botEl.textContent = '∞';
      if (topEl) topEl.textContent = '∞';
    }
  }
};

/* ══════════════════════════════════════
   BOARD RENDERER
══════════════════════════════════════ */
const BoardRenderer = {

  /* Main render — draws all 64 squares */
  render(boardId = 'chess-board') {
    const boardEl = document.getElementById(boardId);
    if (!boardEl || !Engine.chess) return;

    boardEl.innerHTML = '';
    // Apply theme class
    boardEl.className = 'chess-board' +
      (boardId === 'lesson-board'   ? ' lesson-board'   : '') +
      (boardId === 'puzzle-board'   ? ' puzzle-board'   : '') +
      (boardId === 'analysis-board' ? ' analysis-board' : '');
    if (Engine.theme !== 'classic') {
      boardEl.classList.add('theme-' + Engine.theme);
    }

    const files = 'abcdefgh';
    const ranks = Engine.boardFlipped ? [1,2,3,4,5,6,7,8] : [8,7,6,5,4,3,2,1];
    const filesArr = Engine.boardFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7];

    ranks.forEach(rank => {
      filesArr.forEach(fi => {
        const file  = files[fi];
        const sq    = file + rank;
        const isLight = (fi + rank) % 2 !== 0;

        const sqEl = document.createElement('div');
        sqEl.className  = 'board-square ' + (isLight ? 'light' : 'dark');
        sqEl.dataset.sq = sq;

        // ── Highlight states ──
        if (Engine.lastMove) {
          if (sq === Engine.lastMove.from) sqEl.classList.add('last-move-from');
          if (sq === Engine.lastMove.to)   sqEl.classList.add('last-move-to');
        }
        if (sq === Engine.selectedSq) sqEl.classList.add('selected');

        // ── Legal move hints ──
        if (Engine.showHints) {
          const lm = Engine.legalMoves.find(m => m.to === sq);
          if (lm) {
            const occupant = Engine.chess.get(sq);
            sqEl.classList.add(occupant ? 'legal-capture' : 'legal-move');
          }
        }

        // ── Check highlight ──
        if (Engine.chess.in_check()) {
          const kingSq = this._findKing(Engine.chess.turn());
          if (sq === kingSq) sqEl.classList.add('in-check');
        }

        // ── Render piece ──
        const piece = Engine.chess.get(sq);
        if (piece) {
          const key  = (piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase();
          const span = document.createElement('span');
          span.className   = 'chess-piece';
          span.textContent = PIECES_MAP[key] || '?';
          sqEl.appendChild(span);
        }

        // ── Events ──
        sqEl.addEventListener('click', () => BoardInput.handleClick(sq, boardId));

        boardEl.appendChild(sqEl);
      });
    });

    // Render coordinate labels
    if (Engine.showCoords) {
      this._renderCoords(ranks, filesArr);
    } else {
      const rl = document.getElementById('rank-labels');
      const fl = document.getElementById('file-labels');
      if (rl) rl.innerHTML = '';
      if (fl) fl.innerHTML = '';
    }
  },

  /* Render file (a-h) and rank (1-8) labels */
  _renderCoords(ranks, filesArr) {
    const rankEl = document.getElementById('rank-labels');
    const fileEl = document.getElementById('file-labels');
    if (!rankEl || !fileEl) return;

    const files = 'abcdefgh';
    rankEl.innerHTML = '';
    ranks.forEach(r => {
      const s = document.createElement('span');
      s.textContent = r;
      rankEl.appendChild(s);
    });

    fileEl.innerHTML = '';
    filesArr.forEach(fi => {
      const s = document.createElement('span');
      s.textContent = files[fi];
      fileEl.appendChild(s);
    });
  },

  /* Find king square for check highlight */
  _findKing(color) {
    const board = Engine.chess.board();
    const files = 'abcdefgh';
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (p && p.type === 'k' && p.color === color) {
          return files[f] + (8 - r);
        }
      }
    }
    return null;
  },

  /* Animate landing piece */
  animatePiece(sq, boardId = 'chess-board') {
    const boardEl = document.getElementById(boardId);
    if (!boardEl) return;
    const sqEl = boardEl.querySelector(`[data-sq="${sq}"]`);
    if (!sqEl) return;
    const pieceEl = sqEl.querySelector('.chess-piece');
    if (!pieceEl) return;
    pieceEl.classList.remove('piece-land');
    void pieceEl.offsetWidth; // force reflow
    pieceEl.classList.add('piece-land');
  }
};

/* ══════════════════════════════════════
   BOARD INPUT HANDLER
══════════════════════════════════════ */
const BoardInput = {

  handleClick(sq, boardId = 'chess-board') {
    if (!Engine.chess) return;

    // Route to correct handler based on mode
    switch (Engine.gameMode) {
      case 'puzzle':   PuzzleSystem.handleClick(sq);  return;
      case 'analysis': return; // navigation only
      case 'lesson':   LessonSystem.handleClick(sq);  return;
    }

    // Online: only allow moves on your turn
    if (Engine.gameMode === 'online' && Engine.chess.turn() !== Engine.playerColor[0]) return;
    // AI: block during AI thinking
    if (Engine.gameMode === 'ai' && Engine.chess.turn() !== Engine.playerColor[0]) return;
    if (Engine.isAIThinking) return;

    /* ── Piece already selected ── */
    if (Engine.selectedSq) {
      const moved = this._tryMove(Engine.selectedSq, sq, boardId);
      if (moved) {
        Engine.selectedSq = null;
        Engine.legalMoves = [];
      } else {
        // Maybe selecting a different piece
        const piece = Engine.chess.get(sq);
        if (piece && piece.color === Engine.chess.turn()) {
          Engine.selectedSq = sq;
          Engine.legalMoves = Engine.chess.moves({ square: sq, verbose: true });
          SoundSystem.select();
          BoardRenderer.render(boardId);
        } else {
          Engine.selectedSq = null;
          Engine.legalMoves = [];
          BoardRenderer.render(boardId);
        }
      }
      return;
    }

    /* ── No piece selected — select one ── */
    const piece = Engine.chess.get(sq);
    if (piece && piece.color === Engine.chess.turn()) {
      // For local 2P, allow any turn; for AI, only player's color
      if (Engine.gameMode === 'local' || piece.color === Engine.playerColor[0]) {
        Engine.selectedSq = sq;
        Engine.legalMoves = Engine.chess.moves({ square: sq, verbose: true });
        SoundSystem.select();
        BoardRenderer.render(boardId);
      }
    }
  },

  _tryMove(from, to, boardId) {
    const autoQueen = document.getElementById('setting-auto-queen')?.checked !== false;
    const piece     = Engine.chess.get(from);
    const isPawn    = piece?.type === 'p';
    const isPromo   = isPawn && (to[1] === '8' || to[1] === '1');

    if (isPromo && !autoQueen) {
      PromotionSystem.show(from, to, boardId);
      return true; // block normal flow; promotion modal handles it
    }

    const move = Engine.chess.move({ from, to, promotion: 'q' });
    if (!move) {
      SoundSystem.illegal();
      return false;
    }

    MoveProcessor.process(move, boardId);
    return true;
  }
};

/* ══════════════════════════════════════
   MOVE PROCESSOR
══════════════════════════════════════ */
const MoveProcessor = {

  process(move, boardId = 'chess-board') {
    Engine.lastMove   = { from: move.from, to: move.to };
    Engine.selectedSq = null;
    Engine.legalMoves = [];

    // ── Sounds ──
    if (move.flags.includes('k') || move.flags.includes('q')) {
      SoundSystem.castling();
    } else if (move.flags.includes('p')) {
      SoundSystem.promotion();
    } else if (Engine.chess.in_check()) {
      SoundSystem.check();
    } else if (move.flags.includes('c') || move.flags.includes('e')) {
      SoundSystem.capture();
    } else {
      SoundSystem.move();
    }

    // ── Update UI ──
    BoardRenderer.render(boardId);
    BoardRenderer.animatePiece(move.to, boardId);
    MoveHistoryUI.update();
    CapturedPiecesUI.update();
    TimerSystem.switchSide();

    // ── Online sync ──
    if (Engine.gameMode === 'online' && window.OnlineSystem) {
      OnlineSystem.syncMove(move);
    }

    // ── Check game over ──
    if (Engine.chess.game_over()) {
      setTimeout(() => GameOverSystem.detect(), 400);
      return;
    }

    // ── AI turn ──
    if (Engine.gameMode === 'ai' && Engine.chess.turn() !== Engine.playerColor[0]) {
      setTimeout(() => AIEngine.makeMove(), 500);
    }
  }
};

/* ══════════════════════════════════════
   PROMOTION SYSTEM
══════════════════════════════════════ */
const PromotionSystem = {

  _boardId: 'chess-board',
  _from: null,
  _to:   null,

  show(from, to, boardId) {
    this._from    = from;
    this._to      = to;
    this._boardId = boardId;

    const color = Engine.chess.get(from)?.color || 'w';
    const piecesEl = document.getElementById('promotion-pieces');
    piecesEl.innerHTML = '';

    ['q', 'r', 'b', 'n'].forEach(p => {
      const key  = color + p.toUpperCase();
      const span = document.createElement('span');
      span.className   = 'promotion-piece';
      span.textContent = PIECES_MAP[key] || '?';
      span.onclick     = () => this._choose(p);
      piecesEl.appendChild(span);
    });

    document.getElementById('modal-promotion').classList.remove('hidden');
  },

  _choose(piece) {
    document.getElementById('modal-promotion').classList.add('hidden');
    const move = Engine.chess.move({ from: this._from, to: this._to, promotion: piece });
    if (move) {
      SoundSystem.promotion();
      MoveProcessor.process(move, this._boardId);
    }
  }
};

/* ══════════════════════════════════════
   MOVE HISTORY UI
══════════════════════════════════════ */
const MoveHistoryUI = {

  update() {
    const listEl = document.getElementById('move-list');
    if (!listEl) return;

    const history = Engine.chess.history({ verbose: true });
    listEl.innerHTML = '';

    for (let i = 0; i < history.length; i += 2) {
      // Move number
      const numEl = document.createElement('div');
      numEl.className   = 'move-number';
      numEl.textContent = (i / 2 + 1) + '.';
      listEl.appendChild(numEl);

      // White move
      [history[i], history[i + 1]].forEach((m, idx) => {
        const div = document.createElement('div');
        div.className = 'move-san' +
          (i + idx === history.length - 1 ? ' current-move' : '');
        div.textContent = m ? m.san : '';
        if (m) {
          div.onclick = () => this.goToMove(i + idx, history);
        }
        listEl.appendChild(div);
      });
    }

    // Scroll to bottom
    const scrollArea = document.querySelector('.moves-scroll-area');
    if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight;
  },

  goToMove(index, history) {
    const temp = new Chess();
    for (let i = 0; i <= index; i++) temp.move(history[i]);
    Engine.chess   = temp;
    Engine.lastMove = index >= 0 ? { from: history[index].from, to: history[index].to } : null;
    Engine.selectedSq = null;
    Engine.legalMoves = [];
    BoardRenderer.render();
  }
};

/* ══════════════════════════════════════
   CAPTURED PIECES UI
══════════════════════════════════════ */
const CapturedPiecesUI = {

  update() {
    const history  = Engine.chess.history({ verbose: true });
    const wCap = [], bCap = [];
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    let wMat = 0, bMat = 0;

    history.forEach(m => {
      if (m.captured) {
        const key = (m.color === 'w' ? 'b' : 'w') + m.captured.toUpperCase();
        const pc  = PIECES_MAP[key] || '';
        const val = pieceValues[m.captured] || 0;
        if (m.color === 'w') { wCap.push(pc); wMat += val; }
        else                 { bCap.push(pc); bMat += val; }
      }
    });

    const isBottomWhite = Engine.playerColor === 'white';
    const botCapEl = document.getElementById('captured-bottom');
    const topCapEl = document.getElementById('captured-top');
    const botMatEl = document.getElementById('material-bottom');
    const topMatEl = document.getElementById('material-top');

    if (botCapEl) botCapEl.textContent = (isBottomWhite ? wCap : bCap).join('');
    if (topCapEl) topCapEl.textContent = (isBottomWhite ? bCap : wCap).join('');

    const diff = wMat - bMat;
    if (botMatEl) botMatEl.textContent = isBottomWhite && diff > 0 ? '+' + diff
                                       : !isBottomWhite && diff < 0 ? '+' + Math.abs(diff) : '';
    if (topMatEl) topMatEl.textContent = isBottomWhite && diff < 0 ? '+' + Math.abs(diff)
                                       : !isBottomWhite && diff > 0 ? '+' + diff : '';
  }
};

/* ══════════════════════════════════════
   PGN EXPORT
══════════════════════════════════════ */
function exportPGN() {
  if (!Engine.chess) return;
  const pgn = Engine.chess.pgn();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(pgn).then(() => showToast('PGN copied to clipboard!'));
  } else {
    // Fallback: download
    const blob = new Blob([pgn], { type: 'text/plain' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'zyntix-game.pgn';
    a.click();
  }
}

/* ══════════════════════════════════════
   GAME OVER SYSTEM
══════════════════════════════════════ */
const GameOverSystem = {

  detect() {
    TimerSystem.stop();
    SoundSystem.checkmate();

    let title, subtitle, icon, playerWon;

    if (Engine.chess.in_checkmate()) {
      const winner = Engine.chess.turn() === 'w' ? 'Black' : 'White';
      title     = winner.toUpperCase() + ' WINS!';
      subtitle  = 'Checkmate!';
      icon      = '💀';
      playerWon = (winner.toLowerCase() === Engine.playerColor);
      if (playerWon) SoundSystem.win(); else SoundSystem.lose();
    } else if (Engine.chess.in_stalemate()) {
      title = 'DRAW!'; subtitle = 'Stalemate'; icon = '🤝'; playerWon = null;
      SoundSystem.draw();
    } else if (Engine.chess.insufficient_material()) {
      title = 'DRAW!'; subtitle = 'Insufficient Material'; icon = '🤝'; playerWon = null;
      SoundSystem.draw();
    } else if (Engine.chess.in_threefold_repetition()) {
      title = 'DRAW!'; subtitle = 'Threefold Repetition'; icon = '🤝'; playerWon = null;
      SoundSystem.draw();
    } else {
      title = 'DRAW!'; subtitle = '50-Move Rule'; icon = '🤝'; playerWon = null;
      SoundSystem.draw();
    }

    // ELO update for AI games
    let eloChange = 0;
    if (window.currentUser && Engine.gameMode === 'ai') {
      const aiEloMap = { 1: 600, 2: 900, 5: 1300, 10: 1700, 18: 2200 };
      const aiElo   = aiEloMap[Engine.aiDepth] || 1300;
      const result  = playerWon === true ? 'win' : playerWon === false ? 'loss' : 'draw';
      eloChange     = EloSystem.calculate(window.currentUser.elo || 1200, aiElo, result);
      EloSystem.update(eloChange, result);
    }

    this.show(title, subtitle, icon, playerWon, eloChange);
  },

  show(title, subtitle, icon, playerWon, eloChange = 0) {
    TimerSystem.stop();

    document.getElementById('result-title').textContent    = title;
    document.getElementById('result-subtitle').textContent = subtitle;
    document.getElementById('result-icon').textContent     = icon;

    const eloEl = document.getElementById('result-elo-change');
    if (eloChange !== 0) {
      eloEl.textContent = (eloChange > 0 ? '+' : '') + eloChange + ' ELO';
      eloEl.className   = 'result-elo-change ' + (eloChange > 0 ? 'positive' : 'negative');
    } else {
      eloEl.textContent = '';
      eloEl.className   = 'result-elo-change';
    }

    if (playerWon === true) ConfettiSystem.spawn();
    document.getElementById('modal-gameover').classList.remove('hidden');
  }
};

/* ══════════════════════════════════════
   CONFETTI SYSTEM
══════════════════════════════════════ */
const ConfettiSystem = {
  spawn() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    container.innerHTML = '';
    const emojis = ['♟', '♔', '♕', '⭐', '🎉', '✨', '🏆'];
    for (let i = 0; i < 14; i++) {
      const p   = document.createElement('div');
      p.className   = 'confetti-piece';
      p.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      p.style.cssText = `left:${5 + Math.random() * 90}%; top:75%;
        animation-delay:${Math.random() * 0.5}s;
        font-size:${12 + Math.random() * 12}px`;
      container.appendChild(p);
    }
    setTimeout(() => { if (container) container.innerHTML = ''; }, 2500);
  }
};

/* ══════════════════════════════════════
   AI ENGINE (Minimax + Alpha-Beta)
══════════════════════════════════════ */
const AIEngine = {

  // Piece values
  _values: { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 },

  // Piece-square tables (for positional evaluation)
  _pst: {
    p: [  0, 0, 0, 0, 0, 0, 0, 0,
         50,50,50,50,50,50,50,50,
         10,10,20,30,30,20,10,10,
          5, 5,10,25,25,10, 5, 5,
          0, 0, 0,20,20, 0, 0, 0,
          5,-5,-10, 0, 0,-10,-5, 5,
          5,10,10,-20,-20,10,10, 5,
          0, 0, 0, 0, 0, 0, 0, 0 ],
    n: [-50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50 ],
    b: [-20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20 ],
    r: [  0, 0, 0, 0, 0, 0, 0, 0,
          5,10,10,10,10,10,10, 5,
         -5, 0, 0, 0, 0, 0, 0,-5,
         -5, 0, 0, 0, 0, 0, 0,-5,
         -5, 0, 0, 0, 0, 0, 0,-5,
         -5, 0, 0, 0, 0, 0, 0,-5,
         -5, 0, 0, 0, 0, 0, 0,-5,
          0, 0, 0, 5, 5, 0, 0, 0 ],
    q: [-20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20 ],
    k: [-30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20 ]
  },

  /* Static board evaluation (positive = white advantage) */
  evaluate(game) {
    if (game.in_checkmate()) return game.turn() === 'w' ? -99999 : 99999;
    if (game.in_draw())      return 0;

    let score = 0;
    const board = game.board();

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const p = board[r][f];
        if (!p) continue;

        const pieceVal = this._values[p.type] || 0;
        const pstRow   = p.color === 'w' ? r : 7 - r;
        const pstIdx   = pstRow * 8 + f;
        const pstVal   = this._pst[p.type] ? (this._pst[p.type][pstIdx] || 0) : 0;

        if (p.color === 'w') score += pieceVal + pstVal;
        else                 score -= pieceVal + pstVal;
      }
    }
    return score;
  },

  /* Minimax with Alpha-Beta pruning */
  minimax(game, depth, alpha, beta, isMaximizing) {
    if (depth === 0 || game.game_over()) return this.evaluate(game);

    const moves = game.moves({ verbose: true });

    // Move ordering: captures first (improves alpha-beta efficiency)
    moves.sort((a, b) => {
      const va = a.captured ? (this._values[a.captured] || 0) : 0;
      const vb = b.captured ? (this._values[b.captured] || 0) : 0;
      return vb - va;
    });

    if (isMaximizing) {
      let best = -Infinity;
      for (const move of moves) {
        game.move(move);
        best  = Math.max(best, this.minimax(game, depth - 1, alpha, beta, false));
        game.undo();
        alpha = Math.max(alpha, best);
        if (beta <= alpha) break; // Alpha-beta cutoff
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of moves) {
        game.move(move);
        best = Math.min(best, this.minimax(game, depth - 1, alpha, beta, true));
        game.undo();
        beta = Math.min(beta, best);
        if (beta <= alpha) break;
      }
      return best;
    }
  },

  /* Get best move for current position */
  getBestMove(game, depth) {
    const moves = game.moves({ verbose: true });
    if (!moves.length) return null;

    // For very low depths, add randomness for variety
    if (depth <= 1) {
      const captures = moves.filter(m => m.captured);
      const pool     = captures.length ? captures : moves;
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const isBlack = game.turn() === 'b';
    let bestScore = isBlack ? -Infinity : Infinity;
    let bestMove  = null;

    // Shuffle for variety (same eval = random pick among equal)
    for (let i = moves.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [moves[i], moves[j]] = [moves[j], moves[i]];
    }

    // Cap depth for performance on mobile
    const searchDepth = Math.min(depth, 3);

    for (const move of moves) {
      game.move(move);
      const score = this.minimax(game, searchDepth - 1, -Infinity, Infinity, !isBlack);
      game.undo();

      if (isBlack  && score > bestScore) { bestScore = score; bestMove = move; }
      if (!isBlack && score < bestScore) { bestScore = score; bestMove = move; }
    }

    return bestMove;
  },

  /* Called when it's AI's turn */
  makeMove() {
    if (!Engine.chess || Engine.chess.game_over() || Engine.isAIThinking) return;
    Engine.isAIThinking = true;

    const thinkBar = document.getElementById('ai-thinking-bar');
    if (thinkBar) thinkBar.classList.remove('hidden');

    // Use setTimeout so UI updates before blocking computation
    setTimeout(() => {
      const move = this.getBestMove(Engine.chess, Engine.aiDepth);
      if (move) {
        Engine.chess.move(move);
        MoveProcessor.process(move);
      }
      Engine.isAIThinking = false;
      const tb = document.getElementById('ai-thinking-bar');
      if (tb) tb.classList.add('hidden');
    }, 100);
  }
};

/* ══════════════════════════════════════
   ELO RATING SYSTEM
══════════════════════════════════════ */
const EloSystem = {

  calculate(myElo, opponentElo, result) {
    const K         = myElo < 2100 ? 32 : myElo < 2400 ? 24 : 16;
    const expected  = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
    const score     = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
    return Math.round(K * (score - expected));
  },

  async update(change, result) {
    const u = window.currentUser;
    if (!u) return;

    u.elo     = Math.max(100, (u.elo || 1200) + change);
    if (result === 'win')  u.wins   = (u.wins  || 0) + 1;
    if (result === 'loss') u.losses = (u.losses || 0) + 1;
    if (result === 'draw') u.draws  = (u.draws  || 0) + 1;

    // Update topbar ELO display
    const eloEl = document.getElementById('topbar-elo');
    if (eloEl) eloEl.textContent = u.elo;

    // Save ELO history for chart
    const hist = Storage.get('elo_history', []);
    hist.push({ elo: u.elo, ts: Date.now() });
    if (hist.length > 60) hist.shift();
    Storage.set('elo_history', hist);

    // Save to Firebase if logged in
    if (!u.isGuest && window.db) {
      try {
        await window.db.ref('users/' + u.uid).update({
          elo:    u.elo,
          wins:   u.wins,
          losses: u.losses,
          draws:  u.draws
        });
        // Update leaderboard entry
        await window.db.ref('leaderboard/' + u.uid).set({
          username: u.username,
          elo:      u.elo,
          wins:     u.wins || 0,
          avatar:   u.avatar || null,
          updatedAt: Date.now()
        });
      } catch (e) {}
    }
    if (u.isGuest) Storage.set('guest_user', u);
  }
};

/* ══════════════════════════════════════
   ANALYSIS MODE
══════════════════════════════════════ */
const AnalysisMode = {

  _history: [],
  _index:   0,

  load(pgn) {
    const temp = new Chess();
    try { temp.load_pgn(pgn); } catch (e) { showToast('Invalid PGN format!'); return; }
    this._history = temp.history({ verbose: true });
    this._index   = this._history.length;
    Engine.chess  = temp;
    Engine.gameMode   = 'analysis';
    Engine.lastMove   = this._index > 0 ? this._history[this._index - 1] : null;
    BoardRenderer.render('analysis-board');
    this._updateEval();
    showToast('Game loaded!');
  },

  prev() {
    if (this._index <= 0) return;
    this._index--;
    this._replayTo(this._index);
  },

  next() {
    if (this._index >= this._history.length) return;
    this._index++;
    this._replayTo(this._index);
  },

  goStart() { this._index = 0; this._replayTo(0); },
  goEnd()   { this._index = this._history.length; this._replayTo(this._index); },

  _replayTo(idx) {
    const temp = new Chess();
    for (let i = 0; i < idx; i++) temp.move(this._history[i]);
    Engine.chess    = temp;
    Engine.lastMove = idx > 0 ? { from: this._history[idx-1].from, to: this._history[idx-1].to } : null;
    Engine.selectedSq = null;
    Engine.legalMoves = [];
    BoardRenderer.render('analysis-board');
    this._updateEval();
  },

  _updateEval() {
    const score  = AIEngine.evaluate(Engine.chess) / 100;
    const pct    = Math.min(100, Math.max(0, 50 + score * 4));
    const barEl  = document.getElementById('eval-bar-white');
    const scEl   = document.getElementById('eval-score');
    if (barEl) barEl.style.width = pct + '%';
    if (scEl)  scEl.textContent  = (score > 0 ? '+' : '') + score.toFixed(1);
  }
};

/* ══════════════════════════════════════
   BOARD UTILITY FUNCTIONS
   (called from HTML / app.js)
══════════════════════════════════════ */
function flipBoard() {
  Engine.boardFlipped = !Engine.boardFlipped;
  BoardRenderer.render();
  SoundSystem.buttonClick();
}

function applyBoardTheme(theme) {
  Engine.theme = theme || 'classic';
  Storage.set('board_theme', Engine.theme);
  BoardRenderer.render();
}

function toggleCoordinates(show) {
  Engine.showCoords = show;
  Storage.set('show_coords', show);
  BoardRenderer.render();
}

function toggleHints(show) {
  Engine.showHints = show;
  Storage.set('show_hints', show);
}

/* Analysis screen button handlers */
function loadPGNForAnalysis()   { AnalysisMode.load(document.getElementById('pgn-import-input').value); }
function analysisPrev()         { AnalysisMode.prev(); }
function analysisNext()         { AnalysisMode.next(); }
function analysisGoStart()      { AnalysisMode.goStart(); }
function analysisGoEnd()        { AnalysisMode.goEnd(); }

/* Game Over modal buttons */
function startNewGame() {
  document.getElementById('modal-gameover').classList.add('hidden');
  if (Engine.gameMode === 'ai')    { startAIGame();    return; }
  if (Engine.gameMode === 'local') { startLocalGame(); return; }
  returnToMainMenu();
}

function analyzeCompletedGame() {
  document.getElementById('modal-gameover').classList.add('hidden');
  const pgn = Engine.chess?.pgn() || '';
  document.getElementById('pgn-import-input').value = pgn;
  showScreen('screen-analysis');
  if (pgn) AnalysisMode.load(pgn);
}

function shareGameResult() {
  const title  = document.getElementById('result-title').textContent;
  const myElo  = window.currentUser?.elo || 1200;
  const text   = `I just played Chessmaster Zyntix! ${title} | ELO: ${myElo} ⚡ Play free: ${location.href}`;
  if (navigator.share) {
    navigator.share({ title: 'Chessmaster Zyntix', text });
  } else {
    navigator.clipboard?.writeText(text);
    showToast('Result copied to clipboard!');
  }
}

function returnToMainMenu() {
  document.getElementById('modal-gameover').classList.add('hidden');
  TimerSystem.stop();
  showScreen('screen-menu');
}

/* Resign & Draw */
function resignGame() {
  if (!confirm('Resign this game?')) return;
  TimerSystem.stop();
  const winner = Engine.chess.turn() === 'w' ? 'Black' : 'White';
  let eloChange = 0;
  if (window.currentUser && Engine.gameMode === 'ai') {
    const aiEloMap = { 1: 600, 2: 900, 5: 1300, 10: 1700, 18: 2200 };
    const aiElo   = aiEloMap[Engine.aiDepth] || 1300;
    eloChange     = EloSystem.calculate(window.currentUser.elo || 1200, aiElo, 'loss');
    EloSystem.update(eloChange, 'loss');
  }
  GameOverSystem.show(winner.toUpperCase() + ' WINS!', 'By Resignation 🏳', '😔', false, eloChange);
  SoundSystem.lose();
}

function offerDraw() {
  if (!confirm('Offer draw to your opponent?')) return;
  TimerSystem.stop();
  GameOverSystem.show('DRAW!', 'By Agreement 🤝', '🤝', null, 0);
  SoundSystem.draw();
}
