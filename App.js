/* =====================================================
   CHESSMASTER ZYNTIX — app.js
   Complete Application Logic: Auth, Game Modes,
   Puzzles, Lessons, Leaderboard, Profile, Friends,
   Notifications, Settings, Online Play
   ===================================================== */

/* ══════════════════════════════════════
   LOCAL STORAGE HELPER
══════════════════════════════════════ */
const Storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem('zx_' + key);
      return val === null ? fallback : JSON.parse(val);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('zx_' + key, JSON.stringify(value)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem('zx_' + key); } catch {}
  }
};

/* ══════════════════════════════════════
   FIREBASE INIT  (paste your config here)
══════════════════════════════════════ */
let firebaseApp = null;
let auth        = null;
let db          = null;
let storage     = null;

function initFirebase() {
  try {
    // ──────────────────────────────────────────
    // PASTE YOUR FIREBASE CONFIG BELOW:
    // Go to Firebase Console → Project Settings
    // → Your apps → Web app → Copy config
    // ──────────────────────────────────────────
    const firebaseConfig = {
      apiKey:            "AIzaSyAZTW4FWt0xn1AEWcrVA7Xss3c1bZ3stVA",
      authDomain:        "chessmaster-1c96a.firebaseapp.com",
      databaseURL:       "https://chessmaster-1c96a-default-rtdb.asia-southeast1.firebasedatabase.app",
      projectId:         "chessmaster-1c96a",
      storageBucket:     "chessmaster-1c96a.firebasestorage.app",
      messagingSenderId: "984344433718",
      appId:             "1:984344433718:web:d035baa29c7854a73cb497"
    };

    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
      console.warn('[Firebase] Config not set. Running in offline/guest mode.');
      return;
    }

    firebaseApp = firebase.initializeApp(firebaseConfig);
    auth        = firebase.auth();
    db          = firebase.database();
    storage     = firebase.storage();
    window.db   = db;
    console.log('[Firebase] Connected ✅');
  } catch (e) {
    console.warn('[Firebase] Init failed:', e.message);
  }
}

/* ══════════════════════════════════════
   CURRENT USER (global)
══════════════════════════════════════ */
window.currentUser = null;
// Structure: { uid, username, email, elo, wins, losses, draws,
//              puzzlesSolved, streak, gems, avatar, isGuest,
//              lessonsCompleted:[] }

/* ══════════════════════════════════════
   SCREEN NAVIGATION SYSTEM
══════════════════════════════════════ */
let _screenHistory = ['screen-splash'];

function showScreen(id) {
  // Save to history (avoid duplicates)
  const cur = _screenHistory[_screenHistory.length - 1];
  if (cur !== id) _screenHistory.push(id);

  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });

  // Show target screen
  const el = document.getElementById(id);
  if (el) el.classList.add('active');

  // Scroll to top
  window.scrollTo(0, 0);
  if (el) el.scrollTop = 0;

  SoundSystem.buttonClick();

  // Screen-specific init hooks
  const hooks = {
    'screen-leaderboard':    () => loadLeaderboard('global'),
    'screen-profile':        () => refreshProfile(),
    'screen-puzzles':        () => PuzzleSystem.init(),
    'screen-learn':          () => LessonSystem.renderLevelList(),
    'screen-friends':        () => loadFriends(),
    'screen-notifications':  () => renderNotifications(),
  };
  if (hooks[id]) hooks[id]();
}

function goBack() {
  if (_screenHistory.length > 1) {
    _screenHistory.pop();
    const prev = _screenHistory[_screenHistory.length - 1];
    showScreen(prev);
  } else {
    showScreen('screen-menu');
  }
}

/* ══════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════ */
let _toastTimer = null;
function showToast(message, duration = 2600) {
  const el = document.getElementById('toast-notification');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

/* ══════════════════════════════════════
   SUB-PANEL TOGGLE (Online screen)
══════════════════════════════════════ */
function toggleSubPanel(id) {
  // Close all sub-panels first
  document.querySelectorAll('.sub-panel').forEach(p => p.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeSubPanel(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

/* ══════════════════════════════════════
   GAME PANEL TOGGLE (Game screen)
══════════════════════════════════════ */
function toggleGamePanel(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.classList.contains('hidden');

  // Close all panels
  document.querySelectorAll('.game-slide-panel').forEach(p => p.classList.add('hidden'));

  if (isHidden) {
    el.classList.remove('hidden');
    if (id === 'panel-chat') {
      document.getElementById('chat-unread')?.classList.add('hidden');
    }
  }
}

function closeGamePanel(id) {
  document.getElementById(id)?.classList.add('hidden');
}

/* ══════════════════════════════════════
   AUTH SYSTEM
══════════════════════════════════════ */
function switchAuthTab(tab) {
  document.getElementById('form-login').classList.toggle('hidden',    tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
  document.getElementById('tab-login').classList.toggle('active',    tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  setAuthMessage('');
}

function setAuthMessage(msg, type = 'error') {
  const el = document.getElementById('auth-message');
  el.textContent = msg;
  el.className   = 'auth-message' + (msg ? ' ' + type : '');
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) { setAuthMessage('Please fill all fields.'); return; }

  if (!auth) {
    setAuthMessage('Firebase not configured. Use Guest mode.', 'error');
    return;
  }

  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await _loadUserFromDB(cred.user.uid);
  } catch (e) {
    const msg = (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password')
      ? 'Invalid email or password.' : e.message;
    setAuthMessage(msg);
  }
}

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  if (!username || !email || !password) { setAuthMessage('Please fill all fields.'); return; }
  if (username.length < 3)  { setAuthMessage('Username must be at least 3 characters.'); return; }
  if (password.length < 6)  { setAuthMessage('Password must be at least 6 characters.'); return; }

  if (!auth) {
    setAuthMessage('Firebase not configured. Use Guest mode.', 'error');
    return;
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const userData = {
      username, email,
      elo: 1200, wins: 0, losses: 0, draws: 0,
      puzzlesSolved: 0, streak: 0, gems: 50,
      lessonsCompleted: [],
      createdAt: Date.now(), lastSeen: Date.now()
    };
    await db.ref('users/' + cred.user.uid).set(userData);
    window.currentUser = { uid: cred.user.uid, ...userData };
    _onLoginSuccess();
  } catch (e) {
    const msg = e.code === 'auth/email-already-in-use'
      ? 'This email is already registered.' : e.message;
    setAuthMessage(msg);
  }
}

function doGuestLogin() {
  const num = Math.floor(Math.random() * 99999);
  window.currentUser = {
    uid: 'guest_' + num,
    username: 'Guest' + num,
    elo: 1200, wins: 0, losses: 0, draws: 0,
    puzzlesSolved: 0, streak: 0, gems: 0,
    lessonsCompleted: [],
    isGuest: true
  };
  Storage.set('guest_user', window.currentUser);
  _onLoginSuccess();
}

async function _loadUserFromDB(uid) {
  try {
    const snap = await db.ref('users/' + uid).get();
    if (snap.exists()) {
      window.currentUser = { uid, ...snap.val() };
      db.ref('users/' + uid).update({ lastSeen: Date.now() });
    } else {
      doGuestLogin(); return;
    }
    _onLoginSuccess();
  } catch (e) {
    setAuthMessage('Failed to load user data.');
  }
}

function _onLoginSuccess() {
  const u = window.currentUser;
  document.getElementById('topbar-name').textContent = u.username;
  document.getElementById('topbar-elo').textContent  = u.elo || 1200;
  document.getElementById('streak-count').textContent = u.streak || 0;
  document.getElementById('gems-count').textContent   = u.gems || 0;
  document.getElementById('setting-account-type').textContent = u.isGuest ? 'Guest' : 'Registered';
  document.getElementById('setting-email').textContent        = u.email || '—';

  // Load saved settings
  _loadSettings();
  // Check daily streak
  _checkDailyStreak();
  // Show main menu
  showScreen('screen-menu');
  // Welcome notification
  addNotification('🎮', 'Welcome back!', 'Hello ' + u.username + '! Ready to play?');
}

function doLogout() {
  if (!confirm('Are you sure you want to logout?')) return;
  if (auth && !window.currentUser?.isGuest) auth.signOut();
  Storage.remove('guest_user');
  window.currentUser = null;
  TimerSystem.stop();
  showScreen('screen-auth');
}

/* ══════════════════════════════════════
   SETTINGS LOAD / SAVE
══════════════════════════════════════ */
function _loadSettings() {
  const theme   = Storage.get('board_theme', 'classic');
  const sound   = Storage.get('sound_enabled', true);
  const volume  = Storage.get('sound_volume', 70);
  const vib     = Storage.get('vibration', true);
  const coords  = Storage.get('show_coords', true);
  const hints   = Storage.get('show_hints', true);

  Engine.theme      = theme;
  Engine.showCoords = coords;
  Engine.showHints  = hints;
  SoundSystem.setEnabled(sound);
  SoundSystem.setVolume(volume);
  SoundSystem.setVibration(vib);

  const g = id => document.getElementById(id);
  if (g('setting-board-theme')) g('setting-board-theme').value = theme;
  if (g('setting-sound'))       g('setting-sound').checked     = sound;
  if (g('setting-volume'))      g('setting-volume').value      = volume;
  if (g('setting-vibration'))   g('setting-vibration').checked = vib;
  if (g('setting-coords'))      g('setting-coords').checked    = coords;
  if (g('setting-hints'))       g('setting-hints').checked     = hints;
}

function toggleSound(enabled) {
  SoundSystem.setEnabled(enabled);
  Storage.set('sound_enabled', enabled);
}

function setVolume(val) {
  SoundSystem.setVolume(parseInt(val));
  Storage.set('sound_volume', parseInt(val));
}

function toggleVibration(enabled) {
  SoundSystem.setVibration(enabled);
  Storage.set('vibration', enabled);
}

function requestNotifications(enabled) {
  if (!enabled) return;
  if ('Notification' in window) {
    Notification.requestPermission().then(perm => {
      if (perm !== 'granted') {
        showToast('Notification permission denied.');
        document.getElementById('setting-notifications').checked = false;
      } else {
        showToast('Notifications enabled!');
      }
    });
  }
}

/* ══════════════════════════════════════
   DAILY STREAK
══════════════════════════════════════ */
function _checkDailyStreak() {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const lastLogin = Storage.get('last_login_date');

  if (lastLogin === today) return; // Already counted today

  let streak = parseInt(Storage.get('streak_count') || 0);
  if (lastLogin === yesterday) streak++;
  else streak = 1;

  Storage.set('streak_count', streak);
  Storage.set('last_login_date', today);

  if (window.currentUser) {
    window.currentUser.streak = streak;
    document.getElementById('streak-count').textContent = streak;
    if (streak > 1) addNotification('🔥', streak + ' Day Streak!', 'Keep playing every day!');
    // Save to DB
    if (!window.currentUser.isGuest && db) {
      db.ref('users/' + window.currentUser.uid).update({ streak }).catch(() => {});
    }
    if (window.currentUser.isGuest) Storage.set('guest_user', window.currentUser);
  }
}

/* ══════════════════════════════════════
   GAME MODE: LOCAL 2-PLAYER
══════════════════════════════════════ */
function startLocalGame() {
  Engine.gameMode    = 'local';
  Engine.playerColor = 'white';
  Engine.boardFlipped = false;
  Engine.chess       = new Chess();
  Engine.lastMove    = null;
  Engine.selectedSq  = null;
  Engine.legalMoves  = [];

  _setPlayerBars('Player 2 ♚', '', 'Player 1 ♔', '', null, null);
  _initGame();
  showScreen('screen-game');
}

/* ══════════════════════════════════════
   GAME MODE: vs AI
══════════════════════════════════════ */
let _selectedDifficulty = 5;
let _selectedColor      = 'white';
let _selectedTimeCtrl   = 300;

function selectDifficulty(btn, depth) {
  document.querySelectorAll('.diff-card').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _selectedDifficulty = depth;
}

function selectColor(btn, color) {
  document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  _selectedColor = color;
}

function selectTime(btn, seconds) {
  // Only update buttons in same container
  btn.closest('.time-grid').querySelectorAll('.time-card').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  _selectedTimeCtrl = seconds;
  Engine.timeControl = seconds;
}

function startAIGame() {
  const finalColor = _selectedColor === 'random'
    ? (Math.random() > 0.5 ? 'white' : 'black')
    : _selectedColor;

  Engine.gameMode    = 'ai';
  Engine.playerColor = finalColor;
  Engine.boardFlipped = finalColor === 'black';
  Engine.aiDepth     = _selectedDifficulty;
  Engine.chess       = new Chess();
  Engine.lastMove    = null;
  Engine.selectedSq  = null;
  Engine.legalMoves  = [];

  const aiNames  = { 1: 'Novice Bot', 2: 'Easy Bot', 5: 'Medium Bot', 10: 'Hard Bot', 18: 'Grandmaster' };
  const aiElos   = { 1: 600,          2: 900,         5: 1300,         10: 1700,        18: 2200 };
  const aiName   = '🤖 ' + (aiNames[_selectedDifficulty]  || 'Bot');
  const aiElo    = aiElos[_selectedDifficulty] || 1300;
  const myName   = window.currentUser?.username || 'You';
  const myElo    = window.currentUser?.elo       || 1200;
  const myAvatar = window.currentUser?.avatar    || null;

  if (finalColor === 'white') {
    _setPlayerBars(aiName, aiElo, myName, myElo, null, myAvatar);
  } else {
    _setPlayerBars(myName, myElo, aiName, aiElo, myAvatar, null);
  }

  _initGame();
  showScreen('screen-game');

  // If AI plays white, trigger first move
  if (finalColor === 'black') {
    setTimeout(() => AIEngine.makeMove(), 800);
  }
}

function _setPlayerBars(topName, topElo, botName, botElo, topAvatarUrl, botAvatarUrl) {
  document.getElementById('name-top').textContent = topName;
  document.getElementById('elo-top').textContent  = topElo || '';
  document.getElementById('name-bottom').textContent = botName;
  document.getElementById('elo-bottom').textContent  = botElo || '';
  _setAvatar('avatar-top',    topAvatarUrl, '♚');
  _setAvatar('avatar-bottom', botAvatarUrl, '♔');
}

function _setAvatar(elId, url, fallback) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (url) {
    el.innerHTML = `<img src="${url}" alt="avatar" />`;
  } else {
    el.textContent = fallback;
  }
}

function _initGame() {
  document.querySelectorAll('.game-slide-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('move-list').innerHTML = '';
  document.getElementById('captured-top').textContent = '';
  document.getElementById('captured-bottom').textContent = '';
  document.getElementById('material-top').textContent = '';
  document.getElementById('material-bottom').textContent = '';
  document.getElementById('chat-messages').innerHTML = '';

  TimerSystem.init(_selectedTimeCtrl);
  BoardRenderer.render('chess-board');
  MoveHistoryUI.update();
  SoundSystem.gameStart();
}

/* ══════════════════════════════════════
   ONLINE MULTIPLAYER
══════════════════════════════════════ */
const OnlineSystem = {
  _roomRef:        null,
  _myColor:        'white',
  _roomCode:       null,
  _moveCount:      0,
  _chatCount:      0,

  async createRoom() {
    if (!db) { showToast('Firebase required for online play. Add your config!'); return; }
    if (!window.currentUser || window.currentUser.isGuest) {
      showToast('Please login to play online!'); return;
    }

    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    this._roomCode = code;
    this._myColor  = 'white';
    this._moveCount = 0;
    this._chatCount = 0;

    this._roomRef = db.ref('rooms/' + code);
    await this._roomRef.set({
      whiteUid:      window.currentUser.uid,
      whiteName:     window.currentUser.username,
      whiteElo:      window.currentUser.elo,
      whiteAvatar:   window.currentUser.avatar || null,
      blackUid:      null,
      moves:         [],
      status:        'waiting',
      chat:          [],
      timeControl:   _selectedTimeCtrl,
      createdAt:     Date.now()
    });

    document.getElementById('room-code-display').textContent = code;
    document.getElementById('room-created-box').classList.remove('hidden');
    this._listenRoom(code, 'white');
  },

  async joinRoom() {
    const code = document.getElementById('join-code-input').value.trim().toUpperCase();
    if (!code || code.length !== 6) { showToast('Enter a 6-character room code.'); return; }
    if (!db) { showToast('Firebase required for online play!'); return; }
    if (!window.currentUser || window.currentUser.isGuest) {
      showToast('Please login to play online!'); return;
    }

    const snap = await db.ref('rooms/' + code).get();
    if (!snap.exists()) { showToast('Room not found!'); return; }
    const data = snap.val();
    if (data.status !== 'waiting') { showToast('This room is already full!'); return; }

    this._roomCode  = code;
    this._myColor   = 'black';
    this._moveCount = 0;
    this._chatCount = 0;

    await db.ref('rooms/' + code).update({
      blackUid:    window.currentUser.uid,
      blackName:   window.currentUser.username,
      blackElo:    window.currentUser.elo,
      blackAvatar: window.currentUser.avatar || null,
      status:      'playing'
    });
    this._listenRoom(code, 'black');
  },

  async quickMatch() {
    if (!db) { showToast('Firebase required for quick match!'); return; }
    if (!window.currentUser || window.currentUser.isGuest) {
      showToast('Please login for quick match!'); return;
    }

    showToast('🔍 Finding opponent...');
    const wmRef = db.ref('matchmaking');
    const snap  = await wmRef.get();

    if (snap.exists()) {
      const data = snap.val();
      if (data.uid !== window.currentUser.uid) {
        await wmRef.remove();
        document.getElementById('join-code-input').value = data.roomCode;
        await this.joinRoom();
        return;
      }
    }

    const code = Math.random().toString(36).substr(2, 6).toUpperCase();
    await wmRef.set({
      uid:      window.currentUser.uid,
      roomCode: code,
      elo:      window.currentUser.elo || 1200,
      ts:       Date.now()
    });
    wmRef.onDisconnect().remove();

    toggleSubPanel('panel-create');
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('room-created-box').classList.remove('hidden');
    document.getElementById('waiting-text').textContent = 'Finding opponent...';

    this._roomCode = code;
    this._myColor  = 'white';
    this._moveCount = 0;
    await this.createRoom();
  },

  _listenRoom(code, myColor) {
    this._roomRef = db.ref('rooms/' + code);

    this._roomRef.on('value', snap => {
      if (!snap.exists()) return;
      const data = snap.val();

      // Game starts when both players joined
      if (data.status === 'playing' && Engine.gameMode !== 'online') {
        this._startOnlineGame(data, myColor);
      }

      // Sync moves from opponent
      if (data.moves && Array.isArray(data.moves) && data.moves.length > this._moveCount) {
        for (let i = this._moveCount; i < data.moves.length; i++) {
          if (Engine.chess) {
            const move = Engine.chess.move(data.moves[i]);
            if (move) {
              this._moveCount++;
              Engine.lastMove = { from: move.from, to: move.to };
              if (Engine.chess.in_check())              SoundSystem.check();
              else if (move.flags.includes('c'))        SoundSystem.capture();
              else                                      SoundSystem.move();
              MoveHistoryUI.update();
              CapturedPiecesUI.update();
              TimerSystem.switchSide();
              BoardRenderer.render('chess-board');
              if (Engine.chess.game_over()) setTimeout(() => GameOverSystem.detect(), 400);
            }
          }
        }
      }

      // Sync chat messages
      if (data.chat) this._syncChat(data.chat);
    });
  },

  _startOnlineGame(data, myColor) {
    Engine.gameMode    = 'online';
    Engine.playerColor = myColor;
    Engine.boardFlipped = myColor === 'black';
    Engine.chess       = new Chess();
    Engine.lastMove    = null;
    Engine.selectedSq  = null;
    Engine.legalMoves  = [];

    const oppName   = myColor === 'white' ? (data.blackName   || 'Opponent') : (data.whiteName   || 'Opponent');
    const oppElo    = myColor === 'white' ? (data.blackElo    || 1200)        : (data.whiteElo    || 1200);
    const oppAvatar = myColor === 'white' ? (data.blackAvatar || null)        : (data.whiteAvatar || null);

    _setPlayerBars(
      oppName, oppElo,
      window.currentUser?.username, window.currentUser?.elo,
      oppAvatar, window.currentUser?.avatar
    );

    _selectedTimeCtrl = data.timeControl || 300;
    _initGame();
    showToast('Game started! You play ' + (myColor === 'white' ? '♔ White' : '♚ Black'));
    showScreen('screen-game');
  },

  async syncMove(move) {
    if (!this._roomRef) return;
    try {
      const snap  = await this._roomRef.child('moves').get();
      const moves = snap.exists() ? snap.val() : [];
      moves.push(move.san);
      await this._roomRef.update({ moves, fen: Engine.chess.fen() });
      this._moveCount = moves.length;
    } catch (e) {}
  },

  _syncChat(chatObj) {
    const msgs = Object.values(chatObj).sort((a, b) => a.ts - b.ts);
    if (msgs.length <= this._chatCount) return;

    for (let i = this._chatCount; i < msgs.length; i++) {
      const m     = msgs[i];
      const isMine = m.uid === window.currentUser?.uid;
      _appendChatBubble(m.message, isMine ? 'my-message' : 'their-message', m.name);

      if (!isMine && document.getElementById('panel-chat')?.classList.contains('hidden')) {
        document.getElementById('chat-unread')?.classList.remove('hidden');
        SoundSystem.notification();
      }
    }
    this._chatCount = msgs.length;
  }
};

/* Expose online functions to HTML */
function createOnlineRoom() { OnlineSystem.createRoom(); }
function joinOnlineRoom()   { OnlineSystem.joinRoom();   }
function doQuickMatch()     { OnlineSystem.quickMatch(); }

function copyRoomCode() {
  const code = document.getElementById('room-code-display').textContent;
  navigator.clipboard?.writeText(code);
  showToast('Room code copied: ' + code);
}

/* ══════════════════════════════════════
   CHAT SYSTEM
══════════════════════════════════════ */
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';

  if (OnlineSystem._roomRef) {
    // Online: push to Firebase
    OnlineSystem._roomRef.child('chat').push({
      uid:     window.currentUser?.uid || 'guest',
      name:    window.currentUser?.username || 'Guest',
      message: msg,
      ts:      Date.now()
    });
  } else {
    // Local: just show in chat
    _appendChatBubble(msg, 'my-message', 'You');
  }
}

function sendQuickChat(msg) {
  document.getElementById('chat-input').value = msg;
  sendChatMessage();
}

function _appendChatBubble(msg, cssClass, name) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'chat-bubble ' + cssClass;
  if (cssClass === 'their-message') {
    div.innerHTML = `<div class="bubble-name">${name}</div>${msg}`;
  } else {
    div.textContent = msg;
  }
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

/* ══════════════════════════════════════
   PUZZLE SYSTEM
══════════════════════════════════════ */
const PUZZLE_DATA = [
  // { fen, moves:[], theme, rating, cat }
  { fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
    moves: ['e8e7'], theme: 'Escape Check', rating: 900, cat: 'mate' },
  { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    moves: ['d1h5'], theme: 'Quick Attack', rating: 700, cat: 'fork' },
  { fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 5',
    moves: ['c4f7'], theme: 'Sacrifice Fork', rating: 1400, cat: 'fork' },
  { fen: '6k1/5ppp/p7/1p6/8/1P6/5PPP/6K1 w - - 0 1',
    moves: ['g1f2'], theme: 'King Walk', rating: 1000, cat: 'endgame' },
  { fen: 'r2q1rk1/1pp1bppp/p1np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 0 8',
    moves: ['c4f7'], theme: 'Bishop Fork', rating: 1500, cat: 'fork' },
  { fen: '8/8/8/3k4/8/8/3PP3/3K4 w - - 0 1',
    moves: ['d2d4'], theme: 'Pawn Advance', rating: 1100, cat: 'endgame' },
  { fen: '4k3/4R3/8/8/8/8/8/4K3 w - - 0 1',
    moves: ['e7e8'], theme: 'Back Rank Mate', rating: 800, cat: 'mate' },
  { fen: 'r3k2r/pp3ppp/2p5/2b5/4p3/2N5/PPP2PPP/R2QKB1R w KQkq - 0 12',
    moves: ['c3e4'], theme: 'Knight Fork', rating: 1600, cat: 'fork' },
  { fen: '5k2/8/5K2/5P2/8/8/8/8 w - - 0 1',
    moves: ['f6e7'], theme: 'King Opposition', rating: 1200, cat: 'endgame' },
  { fen: 'r1b1k2r/ppppqppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 6 5',
    moves: ['c4f7'], theme: 'Fried Liver', rating: 1600, cat: 'fork' },
  { fen: '8/8/1k6/8/8/8/1K1R4/8 w - - 0 1',
    moves: ['d2d6'], theme: 'Rook Cut-off', rating: 1300, cat: 'endgame' },
  { fen: 'rnbqkb1r/ppp2ppp/3p1n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
    moves: ['c4f7'], theme: 'Scholar Attack', rating: 1100, cat: 'mate' },
];

const PuzzleSystem = {
  _index:     0,
  _moveIndex: 0,
  _solved:    0,
  _streak:    0,
  _category:  'all',
  _selected:  null,

  _getPool() {
    return this._category === 'all'
      ? PUZZLE_DATA
      : PUZZLE_DATA.filter(p => p.cat === this._category);
  },

  _current() {
    const pool = this._getPool();
    return pool[this._index % pool.length];
  },

  init() {
    const p = this._current();
    Engine.chess       = new Chess(p.fen);
    Engine.playerColor = Engine.chess.turn() === 'w' ? 'white' : 'black';
    Engine.boardFlipped = Engine.playerColor === 'black';
    Engine.gameMode    = 'puzzle';
    Engine.selectedSq  = null;
    Engine.legalMoves  = [];
    Engine.lastMove    = null;
    this._moveIndex    = 0;
    this._selected     = null;

    document.getElementById('puzzle-rating').textContent = p.rating;
    document.getElementById('puzzle-theme').textContent  = p.theme;
    document.getElementById('puzzle-solved-count').textContent = this._solved + '/10';
    document.getElementById('puzzle-streak-count').textContent = this._streak;
    document.getElementById('puzzle-turn').textContent =
      Engine.playerColor === 'white' ? 'White' : 'Black';

    const statusEl = document.getElementById('puzzle-status');
    statusEl.textContent = '♟ Find the best move for ' +
      (Engine.playerColor === 'white' ? 'White' : 'Black') + '!';
    statusEl.className = 'puzzle-status-bar';

    BoardRenderer.render('puzzle-board');
  },

  handleClick(sq) {
    const p = this._current();
    const statusEl = document.getElementById('puzzle-status');

    if (this._selected) {
      const attempted = this._selected + sq;
      const expected  = p.moves[this._moveIndex];

      if (attempted === expected || attempted.substring(0, 4) === expected) {
        // Correct move!
        const move = Engine.chess.move({ from: this._selected, to: sq, promotion: 'q' });
        if (move) {
          Engine.lastMove = { from: this._selected, to: sq };
          this._moveIndex++;
          SoundSystem.puzzleCorrect();

          if (this._moveIndex >= p.moves.length) {
            // Puzzle solved!
            this._solved++;
            this._streak++;
            statusEl.textContent = '✅ Brilliant! Puzzle Solved!';
            statusEl.className   = 'puzzle-status-bar correct';
            document.getElementById('puzzle-solved-count').textContent = this._solved + '/10';
            document.getElementById('puzzle-streak-count').textContent = this._streak;
            if (window.currentUser) {
              window.currentUser.puzzlesSolved = (window.currentUser.puzzlesSolved || 0) + 1;
              if (!window.currentUser.isGuest && db) {
                db.ref('users/' + window.currentUser.uid)
                  .update({ puzzlesSolved: window.currentUser.puzzlesSolved });
              }
            }
          } else {
            statusEl.textContent = '✅ Correct! Keep going...';
            statusEl.className   = 'puzzle-status-bar correct';
          }
        }
      } else {
        // Wrong move
        this._streak = 0;
        document.getElementById('puzzle-streak-count').textContent = 0;
        SoundSystem.puzzleWrong();
        statusEl.textContent = '❌ Wrong! Try again.';
        statusEl.className   = 'puzzle-status-bar wrong';
      }

      this._selected    = null;
      Engine.selectedSq = null;
      Engine.legalMoves = [];
      BoardRenderer.render('puzzle-board');

    } else {
      const piece = Engine.chess.get(sq);
      if (piece && piece.color === Engine.chess.turn()) {
        this._selected    = sq;
        Engine.selectedSq = sq;
        Engine.legalMoves = Engine.chess.moves({ square: sq, verbose: true });
        SoundSystem.select();
        BoardRenderer.render('puzzle-board');
      }
    }
  }
};

function puzzleHint() {
  const p    = PuzzleSystem._current();
  const move = p.moves[PuzzleSystem._moveIndex];
  if (move) showToast('💡 Hint: Move from ' + move.substring(0, 2).toUpperCase());
}

function puzzleRetry() {
  PuzzleSystem._moveIndex = 0;
  PuzzleSystem._selected  = null;
  PuzzleSystem.init();
}

function nextPuzzle() {
  PuzzleSystem._index++;
  PuzzleSystem.init();
}

function setPuzzleCategory(btn, cat) {
  document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  PuzzleSystem._category = cat;
  PuzzleSystem._index    = 0;
  PuzzleSystem.init();
}

/* ══════════════════════════════════════
   LESSON SYSTEM — 7 Levels
══════════════════════════════════════ */
const LESSON_DATA = [
  {
    id: 1, title: 'How Pieces Move',
    subtitle: 'Learn all 6 piece movements',
    meta: '6 Steps · 12 min',
    steps: [
      { icon: '♟', text: 'Welcome to Chess! The goal is to checkmate (trap) the opponent\'s king. There are 6 different pieces, each with a unique way of moving. Let\'s learn them all!', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', hint: 'This is the starting position of chess' },
      { icon: '♙', text: 'PAWN (♙♟): Moves 1 square forward. On its first move it can move 2 squares. Pawns capture diagonally. Pawns are the soul of chess!', fen: '8/8/8/8/8/8/4P3/8 w - - 0 1', hint: 'This pawn can move to e3 or e4 (first move)' },
      { icon: '♖', text: 'ROOK (♖♜): Moves any number of squares horizontally or vertically. Controls entire rows and columns! Worth about 5 points.', fen: '8/8/8/8/8/8/8/4R3 w - - 0 1', hint: 'The rook controls the entire e-file and 1st rank' },
      { icon: '♗', text: 'BISHOP (♗♝): Moves diagonally any number of squares. Each bishop always stays on its starting color! Worth about 3 points.', fen: '8/8/8/8/8/8/8/2B5 w - - 0 1', hint: 'This bishop can only ever move on light squares' },
      { icon: '♕', text: 'QUEEN (♕♛): The most powerful piece! Combines the rook and bishop — moves in any direction any number of squares. Worth about 9 points. Protect her!', fen: '8/8/8/8/8/8/8/3Q4 w - - 0 1', hint: 'From d1, the queen can control 21 squares!' },
      { icon: '♔', text: 'KING (♔♚): Moves 1 square in any direction. Must be protected at all times! If the king is checkmated, the game is over. The king becomes strong in the endgame.', fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', hint: 'The king must never step onto an attacked square' },
    ]
  },
  {
    id: 2, title: 'Captures & Exchanges',
    subtitle: 'Win material effectively',
    meta: '5 Steps · 10 min',
    steps: [
      { icon: '⚔️', text: 'CAPTURING: Move your piece to a square occupied by an enemy piece. That piece is removed from the game! You can capture with any piece.', fen: '8/8/8/4p3/3P4/8/8/8 w - - 0 1', hint: 'The white pawn can capture the black pawn on e5!' },
      { icon: '💰', text: 'PIECE VALUES: Pawn=1, Knight=3, Bishop=3, Rook=5, Queen=9. Always calculate if an exchange benefits you before taking!', fen: '8/8/3q4/8/4N3/8/8/8 w - - 0 1', hint: 'The Knight (3pts) can capture the Queen (9pts) — a great trade!' },
      { icon: '⚠️', text: 'HANGING PIECES: A piece that can be captured for free is called "hanging". Before every move, check if any of your pieces are undefended!', fen: '8/8/8/4p3/8/8/8/4R3 w - - 0 1', hint: 'The black pawn on e5 is hanging — white can take it for free!' },
      { icon: '👻', text: 'EN PASSANT: A special pawn capture! If an opponent\'s pawn moves 2 squares past your pawn, you can capture it as if it only moved 1 square. Must be done immediately!', fen: '8/8/8/3pP3/8/8/8/8 w - d6 0 1', hint: 'White can capture en passant on d6 — try it!' },
      { icon: '🔄', text: 'TRADING RULE: Trade pieces when you\'re ahead in material. Avoid trades when behind. Always ask: am I giving up more than I gain?', fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', hint: 'Develop your pieces before starting exchanges!' },
    ]
  },
  {
    id: 3, title: 'Special Moves',
    subtitle: 'Castling, En Passant & Promotion',
    meta: '4 Steps · 8 min',
    steps: [
      { icon: '🏰', text: 'CASTLING: The king moves 2 squares toward a rook, and the rook jumps to the other side. Use it to keep your king safe and activate your rook!', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', hint: 'Both kings can castle kingside (short) or queenside (long)' },
      { icon: '📋', text: 'CASTLING RULES: You CANNOT castle if: (1) King or rook has moved, (2) King is in check, (3) King passes through an attacked square, (4) Squares between are occupied.', fen: '8/8/8/8/8/8/8/R3K2R w KQ - 0 1', hint: 'White can castle both sides here — try e1-g1 or e1-c1' },
      { icon: '👻', text: 'EN PASSANT RULE: This capture must be done on your VERY NEXT move. If you wait, you lose the opportunity forever! It is the only capture not on the destination square.', fen: '8/4p3/8/3P4/8/8/8/8 b - - 0 1', hint: 'After black plays e5, white can immediately capture d6 via d5xe6' },
      { icon: '♛', text: 'PROMOTION: When a pawn reaches the last rank (8th for white, 1st for black), it must promote to any piece. Almost always choose a QUEEN! Sometimes a knight is better.', fen: '8/4P3/8/8/8/8/8/8 w - - 0 1', hint: 'Advance the pawn to e8 and promote to a queen!' },
    ]
  },
  {
    id: 4, title: 'Check & Checkmate',
    subtitle: 'Win conditions and king safety',
    meta: '6 Steps · 15 min',
    steps: [
      { icon: '⚠️', text: 'CHECK: When your king is attacked, you are in check! You MUST respond immediately — you cannot make any other move. Three ways to escape: move king, block the attack, or capture the attacker.', fen: '4k3/8/8/8/8/8/8/4R3 w - - 0 1', hint: 'White rook can give check from e8 — black king must respond!' },
      { icon: '🏃', text: 'ESCAPING CHECK: (1) Move the king to a safe square, (2) Block the check with another piece, (3) Capture the checking piece. If none work, it\'s checkmate!', fen: '4k3/8/8/8/8/4r3/8/4K3 w - - 0 1', hint: 'White king is in check from e3 rook. Find a safe square!' },
      { icon: '👑', text: 'CHECKMATE: The king is in check and there is NO way to escape. This ends the game! Checkmate can happen with just a few pieces if the king is trapped.', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', hint: 'White can deliver back-rank checkmate with Ra8#!' },
      { icon: '🤝', text: 'STALEMATE: The player to move has NO legal moves but is NOT in check. This is a DRAW! Avoid it when you\'re winning; try to force it when losing.', fen: 'k7/8/KQ6/8/8/8/8/8 b - - 0 1', hint: 'Is it stalemate? Black has no legal moves and is NOT in check!' },
      { icon: '🏢', text: 'BACK RANK MATE: A classic checkmate pattern! A rook or queen delivers mate on the back rank when the king has no escape squares. Always keep an escape square for your king!', fen: '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', hint: 'Ra8# delivers back rank mate! The pawns trap the king.' },
      { icon: '📚', text: "SCHOLAR'S MATE: A 4-move checkmate. Even though good players can defend it easily, knowing it helps you avoid falling for it as a beginner. Watch your f2/f7 squares!", fen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', hint: "Black is checkmated! The queen on f7 is protected by the bishop. Don't let this happen to you!" },
    ]
  },
  {
    id: 5, title: 'Basic Openings',
    subtitle: 'Start your games the right way',
    meta: '8 Steps · 20 min',
    steps: [
      { icon: '📖', text: 'THE 3 GOLDEN RULES: (1) Control the center with pawns (e4, d4), (2) Develop ALL your pieces quickly, (3) Castle early for king safety. Follow these and win more games!', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', hint: 'Start with 1.e4 or 1.d4 to control the central squares' },
      { icon: '🇮🇹', text: "ITALIAN GAME (1.e4 e5 2.Nf3 Nc6 3.Bc4): One of the oldest openings! White aims the bishop at the f7 pawn — the weakest point in Black's position.", fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK1NR b KQkq - 3 3', hint: "The bishop on c4 eyes f7 — Black's most vulnerable point!" },
      { icon: '🛡️', text: "RUY LOPEZ (1.e4 e5 2.Nf3 Nc6 3.Bb5): The 'Spanish Torture'! White pressures the knight that defends e5. One of the most popular openings at all levels.", fen: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', hint: 'The bishop indirectly attacks e5 by threatening the Nc6!' },
      { icon: '🏴', text: "SICILIAN DEFENSE (1.e4 c5): The most popular defense to 1.e4! Black fights for the center asymmetrically. Creates sharp, complex positions where both sides have chances.", fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', hint: "Black controls d4 from the side — leads to imbalanced, fighting chess!" },
      { icon: '♟', text: "QUEEN'S GAMBIT (1.d4 d5 2.c4): White offers a pawn to gain central control. The most important d4 opening! Can be accepted (2...dxc4) or declined (2...e6).", fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2', hint: "Accept with 2...dxc4 or decline with 2...e6 — both are excellent!" },
      { icon: '🌙', text: "LONDON SYSTEM (1.d4, 2.Nf3, 3.Bf4): A solid, reliable opening that's easy to learn! White sets up a strong pawn structure and develops naturally. Great for beginners.", fen: 'rnbqkb1r/ppp1pppp/5n2/3p4/3P1B2/5N2/PPP1PPPP/RN1QKB1R b KQkq - 3 3', hint: 'Simple, solid, strong — the London System is easy to learn and play!' },
      { icon: '🔥', text: "KING'S INDIAN DEFENSE (1.d4 Nf6 2.c4 g6 3.Nc3 Bg7): Black lets White build a big center, then counterattacks! Dynamic and aggressive. A favorite of Fischer and Kasparov!", fen: 'rnbqkb1r/pppppp1p/5np1/8/2PPP3/2N5/PP3PPP/R1BQKBNR b KQkq - 0 4', hint: 'Black will castle kingside and launch a powerful counterattack!' },
      { icon: '❌', text: "COMMON MISTAKES TO AVOID: (1) Moving the same piece twice, (2) Bringing the queen out too early, (3) Not castling, (4) Moving pawns in front of your king. Development before attack!", fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 4 6', hint: 'Both sides are well developed — this is how a good opening should look!' },
    ]
  },
  {
    id: 6, title: 'Tactics: Forks & Pins',
    subtitle: 'Attack two pieces at once',
    meta: '7 Steps · 18 min',
    steps: [
      { icon: '⚡', text: 'FORK: One piece attacks two or more enemy pieces simultaneously! The opponent can only save one. Knights are the best forking pieces because they jump!', fen: '8/8/8/3ppp2/4N3/8/8/8 w - - 0 1', hint: 'The knight on e4 attacks all 3 pawns at once — a triple fork!' },
      { icon: '♞', text: 'KNIGHT FORK TRICK: Look for moves like Ne5+ that attack the king and queen at the same time. This is called a "royal fork" and wins the queen for free!', fen: 'r2qk2r/8/8/8/3N4/8/8/4K3 w - - 0 1', hint: 'Can you find a knight fork that attacks the king and rook?' },
      { icon: '📌', text: 'PIN: A piece cannot move because doing so would expose a more valuable piece to attack. Absolute pin = pinned to the king (moving is illegal). Use pins to win material!', fen: 'r2qkb1r/ppp2ppp/2n5/3pp1B1/8/2NP1N2/PPP2PPP/R2QKB1R b KQkq - 1 6', hint: 'The bishop on g5 pins the knight — it cannot move without exposing the queen!' },
      { icon: '🎯', text: "SKEWER: Like a pin, but the more valuable piece is in front! Force the valuable piece to move, then capture what's behind it. Bishops and rooks are great at skewers.", fen: '4k3/8/8/8/8/8/8/4K2R w - - 0 1', hint: 'Rook to e1+ skewers the king — when it moves, capture what\'s behind!' },
      { icon: '💥', text: 'DISCOVERED ATTACK: Move one piece to reveal a threat from a piece behind it. The moving piece also creates a new threat. Two threats at once are very hard to defend!', fen: 'r3k3/8/8/3b4/4n3/8/8/4K2R b - - 0 1', hint: 'Black can create a powerful discovered attack — find it!' },
      { icon: '⚔️', text: 'DOUBLE CHECK: Two pieces check the king simultaneously! The king MUST move — it cannot block or capture both attackers. Leads to forced checkmate patterns!', fen: '4k3/3R4/8/3b4/8/8/8/4K3 b - - 0 1', hint: 'Black can give double check and win! Find the powerful move.' },
      { icon: '✅', text: 'TACTICS CHECKLIST: Before every move, ask yourself: Can I check? Can I fork? Can I pin? Can I skewer? Can I create a discovered attack? This mindset finds winning moves!', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQ - 6 7', hint: 'Scan this position — can you spot any tactical motifs?' },
    ]
  },
  {
    id: 7, title: 'Endgame Mastery',
    subtitle: 'Convert your winning positions',
    meta: '8 Steps · 25 min',
    steps: [
      { icon: '♔', text: 'ACTIVATE YOUR KING: In the endgame, the king becomes a powerful fighting piece! Walk it toward the center. Use it aggressively to support your pawns and fight.', fen: '8/8/8/8/8/8/5K2/8 w - - 0 1', hint: 'Centralize the king — move it toward e4 or d4!' },
      { icon: '♙', text: 'PASSED PAWNS: A pawn with no enemy pawns in front or to the side is "passed". It will become a queen if not stopped! Passed pawns must be pushed forward relentlessly.', fen: '8/8/8/4P3/8/8/8/8 w - - 0 1', hint: 'This passed pawn has a clear path to promotion on e8!' },
      { icon: '📐', text: 'THE SQUARE RULE: Draw an imaginary square from the pawn to the promotion square. If the enemy king can step INSIDE this square on its turn, it can catch the pawn!', fen: '8/8/8/8/4P3/8/8/6k1 w - - 0 1', hint: "Use the square rule to determine if the black king can catch the pawn!" },
      { icon: '♔', text: 'OPPOSITION: When two kings face each other with one square between them, the player who does NOT have to move has the "opposition" and a positional advantage in pawn endings.', fen: '8/8/8/4k3/4P3/4K3/8/8 w - - 0 1', hint: 'White needs to gain the opposition to advance the pawn and win!' },
      { icon: '🏰', text: "ROOK ENDINGS: The most common endgame! Golden Rule: Place your rook BEHIND passed pawns — both yours and your opponent's. Active rooks decide endgames!", fen: '8/8/4k3/4p3/8/4K3/8/4R3 w - - 0 1', hint: 'The rook behind the passer is stronger — which side is better here?' },
      { icon: '🌉', text: "LUCENA POSITION: The key winning technique with Rook + Pawn vs Rook. 'Build a bridge' — use your rook to shield your king from checks. Every chess player must know this!", fen: '3R4/3PK3/8/8/8/8/8/3rk3 w - - 0 1', hint: 'This is the Lucena position — White wins by building a bridge with the rook!' },
      { icon: '🛡️', text: "PHILIDOR POSITION: The essential defensive technique! Keep your rook on the 6th rank to cut off the enemy king. When the pawn advances to the 6th, move to the back rank.", fen: '8/8/r7/8/1P6/1K6/8/1R6 w - - 0 1', hint: 'The rook on the 6th rank holds the draw — the Philidor Defense!' },
      { icon: '🏆', text: "CONGRATULATIONS! 🎉 You've completed all 7 learning levels! You now know more than most casual players. Apply what you've learned in real games and keep improving. Good luck, Grandmaster!", fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', hint: '🎓 You are now ready to play chess at an intermediate level!' },
    ]
  }
];

const LessonSystem = {
  _currentLevel: 0,
  _currentStep:  0,
  _completed:    new Set(Storage.get('completed_lessons', [])),

  renderLevelList() {
    const listEl = document.getElementById('levels-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const total     = LESSON_DATA.length;
    const doneCount = this._completed.size;
    const pct       = Math.round((doneCount / total) * 100);

    document.getElementById('learn-progress-fill').style.width = pct + '%';
    document.getElementById('learn-progress-pct').textContent  = pct + '%';

    LESSON_DATA.forEach((level, idx) => {
      const isDone   = this._completed.has(idx);
      const isOpen   = idx === 0 || this._completed.has(idx - 1);
      const statusTx = isDone ? '✅ Complete' : isOpen ? '▶ START' : '🔒';

      const div = document.createElement('div');
      div.className = 'level-card' +
        (isDone ? ' completed' : '') +
        (isOpen ? ' unlocked'  : '');

      div.innerHTML = `
        <div class="level-number">${idx + 1}</div>
        <div class="level-body">
          <div class="level-title">${level.title}</div>
          <div class="level-subtitle">${level.subtitle}</div>
          <div class="level-meta">${level.meta}</div>
        </div>
        <div class="level-status">${statusTx}</div>
      `;
      div.addEventListener('click', () => this.startLevel(idx));
      listEl.appendChild(div);
    });
  },

  startLevel(idx) {
    const level = LESSON_DATA[idx];
    if (idx > 0 && !this._completed.has(idx - 1)) {
      showToast('🔒 Complete the previous level first!');
      return;
    }

    this._currentLevel = idx;
    this._currentStep  = 0;
    Engine.gameMode    = 'lesson';

    document.getElementById('lesson-screen-title').textContent = `Level ${idx + 1}: ${level.title}`;
    showScreen('screen-lesson');
    this._renderStep();
  },

  _renderStep() {
    const level = LESSON_DATA[this._currentLevel];
    const step  = level.steps[this._currentStep];

    document.getElementById('lesson-icon').textContent        = step.icon;
    document.getElementById('lesson-text').textContent        = step.text;
    document.getElementById('lesson-hint').textContent        = '💡 ' + step.hint;
    document.getElementById('lesson-step-counter').textContent =
      (this._currentStep + 1) + '/' + level.steps.length;

    // Load position
    try {
      Engine.chess = new Chess(step.fen);
    } catch (e) {
      Engine.chess = new Chess();
    }
    Engine.selectedSq  = null;
    Engine.legalMoves  = [];
    Engine.lastMove    = null;
    Engine.boardFlipped = false;
    BoardRenderer.render('lesson-board');

    // Progress dots
    const dotsEl = document.getElementById('lesson-dots');
    dotsEl.innerHTML = '';
    level.steps.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'lesson-dot' + (i === this._currentStep ? ' active' : '');
      dotsEl.appendChild(dot);
    });

    // Button states
    document.getElementById('lesson-prev-btn').disabled =
      this._currentStep === 0;
    document.getElementById('lesson-next-btn').textContent =
      this._currentStep === level.steps.length - 1 ? '✅ FINISH' : 'NEXT ›';
  },

  next() {
    const level = LESSON_DATA[this._currentLevel];
    if (this._currentStep < level.steps.length - 1) {
      this._currentStep++;
      this._renderStep();
      SoundSystem.buttonClick();
    } else {
      // Level complete!
      this._completed.add(this._currentLevel);
      Storage.set('completed_lessons', [...this._completed]);

      if (window.currentUser) {
        window.currentUser.lessonsCompleted = [...this._completed];
        if (!window.currentUser.isGuest && db) {
          db.ref('users/' + window.currentUser.uid)
            .update({ lessonsCompleted: [...this._completed] });
        }
        if (window.currentUser.isGuest) Storage.set('guest_user', window.currentUser);
      }

      SoundSystem.levelComplete();
      showToast('🎉 Level ' + (this._currentLevel + 1) + ' Complete! +50 XP');
      showScreen('screen-learn');
    }
  },

  prev() {
    if (this._currentStep > 0) {
      this._currentStep--;
      this._renderStep();
      SoundSystem.buttonClick();
    }
  },

  handleClick(sq) {
    // Allow interaction in lessons for exploration
    const piece = Engine.chess.get(sq);
    if (piece) {
      Engine.selectedSq = sq;
      Engine.legalMoves = Engine.chess.moves({ square: sq, verbose: true });
      BoardRenderer.render('lesson-board');
    } else if (Engine.selectedSq) {
      const move = Engine.chess.move({ from: Engine.selectedSq, to: sq, promotion: 'q' });
      if (move) { Engine.lastMove = { from: move.from, to: move.to }; SoundSystem.move(); }
      Engine.selectedSq = null;
      Engine.legalMoves = [];
      BoardRenderer.render('lesson-board');
    }
  }
};

// Expose to HTML
function lessonNext() { LessonSystem.next(); }
function lessonPrev() { LessonSystem.prev(); }

/* ══════════════════════════════════════
   LEADERBOARD
══════════════════════════════════════ */
async function loadLeaderboard(tab, btn) {
  if (btn) {
    document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '<div class="loading-text">⏳ Loading rankings...</div>';

  if (tab === 'global' && db) {
    try {
      const snap = await db.ref('leaderboard').orderByChild('elo').limitToLast(50).get();
      const users = [];
      snap.forEach(child => users.push({ uid: child.key, ...child.val() }));
      users.sort((a, b) => b.elo - a.elo);
      _renderLeaderboard(users, listEl);
      return;
    } catch (e) {}
  }

  // Fallback to local storage
  const local = Storage.get('local_lb', []);
  if (local.length > 0) {
    _renderLeaderboard(local, listEl);
  } else {
    listEl.innerHTML = '<div class="empty-state">Play games to appear here!</div>';
  }
}

function _renderLeaderboard(users, listEl) {
  listEl.innerHTML = '';
  const medals = ['🥇', '🥈', '🥉'];
  const rankClasses = ['rank-1', 'rank-2', 'rank-3'];

  users.forEach((u, i) => {
    const isMe = u.uid === window.currentUser?.uid;
    const div  = document.createElement('div');
    div.className = 'lb-item' + (isMe ? ' is-me' : '');
    div.innerHTML = `
      <div class="lb-rank ${rankClasses[i] || ''}">${medals[i] || (i + 1)}</div>
      <div class="lb-avatar">${u.avatar ? `<img src="${u.avatar}" />` : '♟'}</div>
      <div>
        <div class="lb-name">${u.username || 'Player'}</div>
        <div class="lb-record">W${u.wins || 0} / L${u.losses || 0}</div>
      </div>
      <div class="lb-elo">${u.elo || 1200}</div>
    `;
    listEl.appendChild(div);
  });
}

/* ══════════════════════════════════════
   PROFILE
══════════════════════════════════════ */
function refreshProfile() {
  const u = window.currentUser;
  if (!u) return;

  document.getElementById('profile-display-name').textContent = u.username;
  document.getElementById('stat-elo').textContent     = u.elo    || 1200;
  document.getElementById('stat-wins').textContent    = u.wins   || 0;
  document.getElementById('stat-losses').textContent  = u.losses || 0;
  document.getElementById('stat-draws').textContent   = u.draws  || 0;
  document.getElementById('stat-puzzles').textContent = u.puzzlesSolved || 0;
  document.getElementById('stat-streak').textContent  = u.streak || 0;

  // Rank badge based on ELO
  const ranks = [
    [0,    'Novice 🌱'],
    [800,  'Beginner 📗'],
    [1000, 'Casual ♟'],
    [1200, 'Intermediate ⚔️'],
    [1400, 'Advanced 🎯'],
    [1600, 'Expert ⚡'],
    [1800, 'Master 👑'],
    [2000, 'Grandmaster 🏆']
  ];
  const rank = [...ranks].reverse().find(([threshold]) => (u.elo || 1200) >= threshold);
  document.getElementById('profile-rank-badge').textContent = rank ? rank[1] : 'Novice 🌱';

  // Avatar
  if (u.avatar) {
    document.getElementById('profile-avatar-large').innerHTML = `<img src="${u.avatar}" alt="avatar" />`;
    document.getElementById('topbar-avatar').innerHTML        = `<img src="${u.avatar}" alt="avatar" />`;
  } else {
    document.getElementById('profile-avatar-large').textContent = '♞';
    document.getElementById('topbar-avatar').textContent         = '♞';
  }

  _drawEloChart();
  _renderAchievements();
}

function _drawEloChart() {
  const canvas = document.getElementById('elo-chart-canvas');
  if (!canvas) return;
  const history = Storage.get('elo_history', []);
  const ctx     = canvas.getContext('2d');

  // Set canvas dimensions
  canvas.width  = canvas.offsetWidth  * window.devicePixelRatio;
  canvas.height = 110 * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  const W = canvas.offsetWidth;
  const H = 110;

  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, W, H);

  if (history.length < 2) {
    ctx.fillStyle = '#4a5568';
    ctx.font      = '12px Exo 2, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Play more games to see your ELO history', W / 2, H / 2);
    return;
  }

  const elos = history.map(e => e.elo);
  const min  = Math.min(...elos) - 40;
  const max  = Math.max(...elos) + 40;
  const range = max - min;

  // Grid lines
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.12)';
  ctx.lineWidth   = 0.5;
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ELO line
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth   = 1.8;
  ctx.shadowColor = '#00d4ff';
  ctx.shadowBlur  = 8;
  ctx.beginPath();
  history.forEach((entry, i) => {
    const x = (i / (history.length - 1)) * W;
    const y = H - ((entry.elo - min) / range) * (H - 20) - 10;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Last point dot
  const lastElo = elos[elos.length - 1];
  const lx = W;
  const ly = H - ((lastElo - min) / range) * (H - 20) - 10;
  ctx.fillStyle  = '#00d4ff';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(lx - 1, ly, 4, 0, Math.PI * 2);
  ctx.fill();
}

function _renderAchievements() {
  const u    = window.currentUser;
  const grid = document.getElementById('achievements-grid');
  if (!grid || !u) return;

  const doneCount = LessonSystem._completed.size;
  const achievements = [
    { icon: '🏆', name: 'First Win',     unlocked: (u.wins || 0) >= 1 },
    { icon: '⭐', name: '10 Wins',       unlocked: (u.wins || 0) >= 10 },
    { icon: '🧩', name: 'Puzzle Solver', unlocked: (u.puzzlesSolved || 0) >= 10 },
    { icon: '🎓', name: 'Student',       unlocked: doneCount >= 3 },
    { icon: '📚', name: 'Graduate',      unlocked: doneCount >= 7 },
    { icon: '🔥', name: 'ELO 1400+',    unlocked: (u.elo || 1200) >= 1400 },
    { icon: '💎', name: 'ELO 1600+',    unlocked: (u.elo || 1200) >= 1600 },
    { icon: '📅', name: '3-Day Streak',  unlocked: (u.streak || 0) >= 3 },
  ];

  grid.innerHTML = '';
  achievements.forEach(a => {
    const div = document.createElement('div');
    div.className = 'achievement-badge ' + (a.unlocked ? 'unlocked' : 'locked');
    div.innerHTML = `
      <div class="achievement-icon">${a.icon}</div>
      <div class="achievement-name">${a.name}</div>
    `;
    grid.appendChild(div);
  });
}

function toggleEditProfile() {
  const sec = document.getElementById('edit-profile-section');
  sec.classList.toggle('hidden');
  if (!sec.classList.contains('hidden')) {
    document.getElementById('edit-username-input').value = window.currentUser?.username || '';
    document.getElementById('edit-username-input').focus();
  }
}

async function saveNewUsername() {
  const newName = document.getElementById('edit-username-input').value.trim();
  if (!newName || newName.length < 3) { showToast('Minimum 3 characters required.'); return; }

  if (window.currentUser) {
    window.currentUser.username = newName;
    document.getElementById('profile-display-name').textContent = newName;
    document.getElementById('topbar-name').textContent          = newName;

    if (!window.currentUser.isGuest && db) {
      await db.ref('users/' + window.currentUser.uid).update({ username: newName });
    }
    if (window.currentUser.isGuest) Storage.set('guest_user', window.currentUser);
    document.getElementById('edit-profile-section').classList.add('hidden');
    showToast('Username updated!');
  }
}

function uploadProfilePicture(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast('Image too large! Max 3MB.'); return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    if (!window.currentUser) return;

    window.currentUser.avatar = dataUrl;
    document.getElementById('profile-avatar-large').innerHTML = `<img src="${dataUrl}" alt="avatar" />`;
    document.getElementById('topbar-avatar').innerHTML        = `<img src="${dataUrl}" alt="avatar" />`;

    if (!window.currentUser.isGuest && storage && db) {
      try {
        const ref = storage.ref('avatars/' + window.currentUser.uid);
        await ref.putString(dataUrl, 'data_url');
        const url = await ref.getDownloadURL();
        window.currentUser.avatar = url;
        await db.ref('users/' + window.currentUser.uid).update({ avatar: url });
        showToast('Profile picture updated!');
      } catch (e) {
        showToast('Saved locally (Firebase Storage not configured).');
      }
    } else {
      if (window.currentUser.isGuest) Storage.set('guest_user', window.currentUser);
      showToast('Profile picture updated!');
    }
  };
  reader.readAsDataURL(file);
}

/* ══════════════════════════════════════
   TOURNAMENT SYSTEM
══════════════════════════════════════ */
async function joinTournament(id) {
  if (!window.currentUser || window.currentUser.isGuest) {
    showToast('Please login to join tournaments!'); return;
  }
  showToast('✅ Registered for tournament!');
  addNotification('🎯', 'Tournament Registered!', 'You joined the ' + id + ' tournament. Get ready!');

  if (db) {
    try {
      await db.ref('tournaments/' + id + '/players/' + window.currentUser.uid).set({
        username: window.currentUser.username,
        elo:      window.currentUser.elo,
        joinedAt: Date.now()
      });
    } catch (e) {}
  }
}

/* ══════════════════════════════════════
   FRIENDS SYSTEM
══════════════════════════════════════ */
async function searchFriend() {
  const query   = document.getElementById('friend-search-input').value.trim();
  const results = document.getElementById('friend-search-results');
  if (!query) return;
  if (!db)   { showToast('Firebase required for friend search!'); return; }

  results.classList.remove('hidden');
  results.innerHTML = '<div class="loading-text">🔍 Searching...</div>';

  try {
    const snap = await db.ref('users').orderByChild('username').equalTo(query).get();
    if (!snap.exists()) {
      results.innerHTML = '<div class="empty-state">No player found with that username.</div>';
      return;
    }
    results.innerHTML = '';
    snap.forEach(child => {
      const u   = child.val();
      const uid = child.key;
      if (uid === window.currentUser?.uid) return;

      const div = document.createElement('div');
      div.className = 'friend-item';
      div.innerHTML = `
        <div class="friend-avatar">${u.avatar ? `<img src="${u.avatar}">` : '♟'}</div>
        <div>
          <div class="friend-name">${u.username}</div>
          <div class="friend-elo">ELO: ${u.elo || 1200}</div>
        </div>
        <button class="friend-action-btn" onclick="addFriend('${uid}', '${u.username}')">+ Add</button>
      `;
      results.appendChild(div);
    });
  } catch (e) {
    results.innerHTML = '<div class="empty-state">Search failed. Try again.</div>';
  }
}

async function addFriend(uid, username) {
  if (!window.currentUser || window.currentUser.isGuest) {
    showToast('Please login to add friends!'); return;
  }
  try {
    await db.ref('friends/' + window.currentUser.uid + '/' + uid).set({
      username, addedAt: Date.now()
    });
    showToast('✅ Friend request sent to ' + username + '!');
    loadFriends();
  } catch (e) {
    showToast('Failed to add friend. Try again.');
  }
}

async function loadFriends() {
  const listEl = document.getElementById('friends-list');
  if (!window.currentUser || window.currentUser.isGuest || !db) {
    listEl.innerHTML = '<div class="empty-state">Login to see your friends list.</div>';
    return;
  }

  try {
    const snap = await db.ref('friends/' + window.currentUser.uid).get();
    if (!snap.exists()) {
      listEl.innerHTML = '<div class="empty-state">No friends yet. Search for players above!</div>';
      return;
    }
    listEl.innerHTML = '';
    snap.forEach(child => {
      const f   = child.val();
      const div = document.createElement('div');
      div.className = 'friend-item';
      div.innerHTML = `
        <div class="friend-avatar">♟</div>
        <div>
          <div class="friend-name">${f.username}</div>
        </div>
        <button class="friend-action-btn" onclick="challengeFriend('${child.key}')">⚔️ Challenge</button>
      `;
      listEl.appendChild(div);
    });
  } catch (e) {}
}

function challengeFriend(uid) {
  showToast('Invite sent! Tell them to use your room code.');
  createOnlineRoom();
  showScreen('screen-online');
  toggleSubPanel('panel-create');
}

/* ══════════════════════════════════════
   NOTIFICATION SYSTEM
══════════════════════════════════════ */
let _notifications = Storage.get('notifications', []);

function addNotification(icon, title, subtitle) {
  _notifications.unshift({ icon, title, subtitle, ts: Date.now() });
  if (_notifications.length > 25) _notifications.pop();
  Storage.set('notifications', _notifications);
  document.getElementById('notif-dot')?.classList.remove('hidden');
}

function renderNotifications() {
  document.getElementById('notif-dot')?.classList.add('hidden');
  const listEl = document.getElementById('notifications-list');

  if (!_notifications.length) {
    listEl.innerHTML = '<div class="empty-state">No notifications yet.</div>';
    return;
  }

  listEl.innerHTML = '';
  _notifications.forEach(n => {
    const ago = Math.floor((Date.now() - n.ts) / 60000);
    const timeStr = ago < 1 ? 'Just now'
      : ago < 60 ? ago + 'm ago'
      : Math.floor(ago / 60) + 'h ago';

    const div = document.createElement('div');
    div.className = 'notification-item';
    div.innerHTML = `
      <div class="notif-item-icon">${n.icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${n.title}</div>
        <div class="notif-item-sub">${n.subtitle}</div>
      </div>
      <div class="notif-item-time">${timeStr}</div>
    `;
    listEl.appendChild(div);
  });
}

function clearAllNotifications() {
  _notifications = [];
  Storage.set('notifications', []);
  renderNotifications();
}

/* ══════════════════════════════════════
   PWA — SERVICE WORKER REGISTRATION
══════════════════════════════════════ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ══════════════════════════════════════
   APP INITIALIZATION
══════════════════════════════════════ */
window.addEventListener('load', () => {
  // Init Firebase
  initFirebase();

  // Load notifications
  _notifications = Storage.get('notifications', []);
  if (_notifications.length) {
    document.getElementById('notif-dot')?.classList.remove('hidden');
  }

  // Load completed lessons
  LessonSystem._completed = new Set(Storage.get('completed_lessons', []));

  // ── Firebase auto-login ──
  if (auth) {
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          await _loadUserFromDB(user.uid);
        } catch (e) {
          _tryGuestAutoLogin();
        }
      } else {
        _tryGuestAutoLogin();
      }
    });
  } else {
    // No Firebase — try guest restore after splash
    setTimeout(_tryGuestAutoLogin, 2500);
  }

  // ── Splash auto-dismiss ──
  setTimeout(() => {
    const splashEl = document.getElementById('screen-splash');
    if (splashEl) {
      splashEl.style.transition = 'opacity 0.5s';
      splashEl.style.opacity    = '0';
      setTimeout(() => splashEl.classList.remove('active'), 500);
    }
  }, 2400);

  // ── Spawn splash particles ──
  _spawnSplashParticles();
});

function _tryGuestAutoLogin() {
  const savedGuest = Storage.get('guest_user');
  if (savedGuest?.uid) {
    window.currentUser = savedGuest;
    _onLoginSuccess();
  } else {
    showScreen('screen-auth');
  }
}

function _spawnSplashParticles() {
  const container = document.getElementById('splash-particles');
  if (!container) return;
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    p.className = 'splash-particle';
    p.style.cssText = `
      left: ${Math.random() * 100}%;
      animation-delay: ${Math.random() * 2.5}s;
      animation-duration: ${2.5 + Math.random() * 2}s;
    `;
    container.appendChild(p);
  }
}
