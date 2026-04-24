/* =====================================================
   CHESSMASTER ZYNTIX — sounds.js
   Complete Web Audio API Sound System
   ===================================================== */

const SoundSystem = (() => {
  /* ── Private State ── */
  let _ctx = null;
  let _enabled = true;
  let _volume = 0.7;
  let _vibrationEnabled = true;

  /* ── Init AudioContext (must be called after user gesture) ── */
  function _init() {
    if (_ctx) return;
    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[SoundSystem] Web Audio not supported.');
    }
  }

  /* ── Resume suspended context ── */
  function _resume() {
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
  }

  /* ── Core beep generator ── */
  function _beep(freq, duration, type = 'sine', volume = 0.35, delay = 0) {
    if (!_enabled || !_ctx) return;
    _resume();
    try {
      const osc  = _ctx.createOscillator();
      const gain = _ctx.createGain();
      const compressor = _ctx.createDynamicsCompressor();

      osc.connect(gain);
      gain.connect(compressor);
      compressor.connect(_ctx.destination);

      osc.type = type;
      osc.frequency.setValueAtTime(freq, _ctx.currentTime + delay);

      const v = volume * _volume;
      gain.gain.setValueAtTime(0, _ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(v, _ctx.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + delay + duration);

      osc.start(_ctx.currentTime + delay);
      osc.stop(_ctx.currentTime + delay + duration + 0.05);
    } catch (e) {}
  }

  /* ── Play a chord (array of [freq, delay] pairs) ── */
  function _chord(notes, duration, type = 'sine') {
    notes.forEach(([freq, delay]) => _beep(freq, duration, type, 0.22, delay));
  }

  /* ── Vibration ── */
  function _vibrate(pattern) {
    if (!_vibrationEnabled || !navigator.vibrate) return;
    navigator.vibrate(pattern);
  }

  /* ─────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────── */
  return {

    /* ── Configuration ── */
    init()           { _init(); },
    setEnabled(v)    { _enabled = Boolean(v); },
    setVolume(v)     { _volume = Math.max(0, Math.min(1, v / 100)); },
    setVibration(v)  { _vibrationEnabled = Boolean(v); },
    get enabled()    { return _enabled; },
    get volume()     { return Math.round(_volume * 100); },

    /* ── Chess Sounds ── */

    // Piece move (quiet click)
    move() {
      _beep(600, 0.08, 'sine', 0.3);
      _vibrate(18);
    },

    // Piece capture (thud)
    capture() {
      _beep(280, 0.06, 'sawtooth', 0.4);
      _beep(200, 0.12, 'sawtooth', 0.32, 0.06);
      _vibrate([28, 10, 28]);
    },

    // King in check (urgent chord)
    check() {
      _chord([[700, 0], [900, 0.08], [1100, 0.16]], 0.15, 'square');
      _vibrate([45, 15, 45]);
    },

    // Checkmate (dramatic ending)
    checkmate() {
      _chord([[220, 0], [277, 0.12], [330, 0.24], [440, 0.38]], 0.45, 'sawtooth');
      _vibrate([100, 50, 100, 50, 200]);
    },

    // Win fanfare
    win() {
      _chord([[523, 0], [659, 0.1], [784, 0.2], [1047, 0.35]], 0.3, 'sine');
      _vibrate([50, 30, 50, 30, 100]);
    },

    // Lose sound
    lose() {
      _chord([[440, 0], [370, 0.15], [330, 0.32], [277, 0.52]], 0.32, 'sawtooth');
      _vibrate([200]);
    },

    // Draw
    draw() {
      _chord([[392, 0], [392, 0.22]], 0.28, 'sine');
      _vibrate([50, 50, 50]);
    },

    // Piece selection (soft pop)
    select() {
      _beep(820, 0.04, 'sine', 0.18);
    },

    // Illegal move (error buzz)
    illegal() {
      _beep(150, 0.16, 'square', 0.32);
      _vibrate([100]);
    },

    // Castling (two-note swoosh)
    castling() {
      _beep(500, 0.06, 'sine', 0.3);
      _beep(720, 0.09, 'sine', 0.3, 0.07);
      _vibrate([20, 10, 40]);
    },

    // Pawn promotion (triumphant)
    promotion() {
      _chord([[523, 0], [659, 0.08], [784, 0.16], [1047, 0.26]], 0.22, 'sine');
      _vibrate([30, 20, 60]);
    },

    // Game start
    gameStart() {
      _chord([[400, 0], [500, 0.1], [620, 0.22]], 0.22, 'sine');
      _vibrate([30, 20, 30]);
    },

    // Button click (UI)
    buttonClick() {
      _beep(700, 0.05, 'sine', 0.14);
    },

    // Notification (ping)
    notification() {
      _chord([[880, 0], [1100, 0.1]], 0.16, 'sine');
      _vibrate([28, 28, 28]);
    },

    // Timer low warning
    timerLow() {
      _beep(880, 0.09, 'square', 0.5);
      _vibrate([45, 45]);
    },

    // Puzzle correct
    puzzleCorrect() {
      _chord([[659, 0], [784, 0.08], [1047, 0.18]], 0.26, 'sine');
      _vibrate([45, 20, 80]);
    },

    // Puzzle wrong
    puzzleWrong() {
      _beep(200, 0.2, 'sawtooth', 0.4);
      _vibrate([100, 50, 100]);
    },

    // Level complete
    levelComplete() {
      _chord([[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32], [1318, 0.45]], 0.3, 'sine');
      _vibrate([50, 30, 50, 30, 100]);
    },

    // En passant (special move)
    enPassant() {
      _beep(500, 0.05, 'sine', 0.3);
      _beep(650, 0.08, 'sine', 0.28, 0.06);
      _vibrate([18, 8, 35]);
    },
  };
})();

/* ── Auto-init on first user interaction ── */
const _sndInit = () => {
  SoundSystem.init();
  document.removeEventListener('touchstart', _sndInit);
  document.removeEventListener('click', _sndInit);
};
document.addEventListener('touchstart', _sndInit, { passive: true });
document.addEventListener('click', _sndInit);
