/* مسار 24: الخادم الجماعي. ملف مُجمَّع آلياً، لا تعدّله يدوياً (المصدر: js/rules و server/). */
/* إعدادات اللعبة: الأرقام والخيارات هنا فقط، ولا شيء منها يخص الشاشة. */
(function (root) {
  var G = (root.Game = root.Game || {});

  G.config = Object.freeze({
    boardSize: 24,        // اللوحة: 24 خانة كما في الصورة (قررها اللاعب)
    piecesPerPlayer: 15,  // القاعدة 2: أحجار كل لاعب
    players: Object.freeze(['p1', 'p2']), // p1 = الأحمر، p2 = العاجي
    // نقطة البداية لكل لاعب بترقيم اللوحة (كما في الصورة).
    // الخانة 1 عند كل لاعب (بترقيمه الخاص) هي نقطة بدايته.
    startPoint: Object.freeze({ p1: 24, p2: 12 }),
    finalZoneSize: 6,     // المنطقة النهائية: آخر ست خانات من مسار كل لاعب (قررها اللاعب)
    diceFaces: 6,
    movesPerDouble: 4,    // كل رمية مزدوجة تمنح 4 حركات (قررها اللاعب)
    // القاعدة 9 كما أوضحتَها: يخرج من خانة البداية حجر واحد في الدور حتى في الرمية المزدوجة
    // (2-2: حجر واحد يتحرك 4 مرات، و5-5: حجر واحد يتحرك 4 مرات). فإن لم تبقَ حركة قانونية أخرى خرج حجر آخر.
    startExitsPerTurn: 1,
    // القواعد 12 و13: ست خانات متتالية مغلقة (فيها حجر أو أكثر) قبل وصول أي حجر للمنافس إلى منطقته النهائية
    // تتيح للمنافس أن يأكل حجراً واحداً في الرمية (يختاره حسب النرد).
    blockLength: 6,
    eatsPerTurn: 1,
    flags: Object.freeze({
      // القاعدة 4: لا يجتمع حجرا لاعبين مختلفين في خانة واحدة
      enforceNoMixedCells: true,
      // الحجر يسير في اتجاه مساره فقط (استنتاج من وصف اتجاه الحركة، لا قاعدة مكتوبة)
      forwardOnly: true,
      // القاعدة 7 حرفياً: «جميع الحركات اختيارية»، فيجوز إنهاء الدور قبل استعمال كل الحركات
      allowEndTurnEarly: true,
      // افتراض يحتاج تأكيداً: لا يُؤكل إلا حجر وحيد في خانته (حتى لا تتعارض القاعدة 4)
      eatOnlySingleStone: true
    })
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* مسار كل لاعب: التحويل بين ترقيمه الخاص (1 إلى 24) ونقاط اللوحة (1 إلى 24 كما في الصورة).
   الأحمر: من 24 نحو 23 ... 13 ثم 12 ... 1.
   العاجي: من 12 نحو 11 ... 1 ثم 24 ... 13.
   كل ما يلزم هو نقطة البداية في config.startPoint. */
(function (root) {
  var G = (root.Game = root.Game || {});
  var N = G.config.boardSize;

  function mod(a) {
    return ((a % N) + N) % N;
  }

  /* ترقيم اللاعب (1..N) إلى نقطة اللوحة */
  function toPoint(player, own) {
    return mod(G.config.startPoint[player] - own) + 1;
  }

  /* نقطة اللوحة إلى ترقيم اللاعب (1..N) */
  function toOwn(player, point) {
    var v = mod(G.config.startPoint[player] - point + 1);
    return v === 0 ? N : v;
  }

  /* هل هذه النقطة ضمن المنطقة النهائية للاعب (آخر ست خانات من مساره)؟ */
  function isFinal(player, point) {
    return toOwn(player, point) > N - G.config.finalZoneSize;
  }

  /* ترقيم الصفوف (المذكور في القاعدتين 11 و14): كل صف من 1 إلى 12.
     الصف العلوي يبدأ من بداية الأحمر (24 = 1 ... 13 = 12)،
     والصف السفلي يبدأ من بداية العاجي (12 = 1 ... 1 = 12). */
  function rowNumber(point) {
    var half = N / 2;
    return point > half ? N + 1 - point : half + 1 - point;
  }

  G.paths = { toPoint: toPoint, toOwn: toOwn, isFinal: isFinal, rowNumber: rowNumber };
})(typeof window !== 'undefined' ? window : globalThis);

/* حالة اللوحة ودوال القواعد. لا يوجد هنا أي كود يخص الشاشة.
   الخانات تُفهرس بنقاط اللوحة (1 إلى 24 كما في الصورة).
   كل دالة تُرجع { ok: true, state } عند النجاح، أو { ok: false, reason } عند الرفض.
   الحالة نفسها لا تُعدَّل أبداً؛ كل تغيير ينتج حالة جديدة (يسهّل التراجع). */
(function (root) {
  var G = (root.Game = root.Game || {});
  var cfg = G.config;

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  /* opts.setup: 'start' (الافتراضي: كل لاعب بأحجاره الخمسة عشر على نقطة بدايته) أو 'empty' */
  function createState(opts) {
    var empty = opts && opts.setup === 'empty';
    var cells = [];
    for (var i = 0; i < cfg.boardSize; i++) cells.push({ owner: null, count: 0 });
    var reserve = {};
    cfg.players.forEach(function (p) {
      reserve[p] = empty ? cfg.piecesPerPlayer : 0;
      if (!empty) {
        var c = cells[cfg.startPoint[p] - 1];
        c.owner = p;
        c.count = cfg.piecesPerPlayer;
      }
    });
    var off = {};
    cfg.players.forEach(function (p) { off[p] = 0; });
    var captured = {};
    cfg.players.forEach(function (p) { captured[p] = 0; });
    return { cells: cells, reserve: reserve, off: off, captured: captured };
  }

  function cloneState(s) {
    return {
      cells: s.cells.map(function (c) { return { owner: c.owner, count: c.count }; }),
      reserve: Object.assign({}, s.reserve),
      off: Object.assign({}, s.off),
      captured: Object.assign({}, s.captured)
    };
  }

  function isValidCell(n) {
    return Number.isInteger(n) && n >= 1 && n <= cfg.boardSize;
  }

  function cellAt(s, n) {
    return s.cells[n - 1];
  }

  function piecesOnBoard(s, player) {
    return s.cells.reduce(function (t, c) { return t + (c.owner === player ? c.count : 0); }, 0);
  }

  /* القاعدة 4: هل يجوز لهذا اللاعب أن يستقر في هذه الخانة؟ */
  function checkLanding(s, player, cell) {
    var c = cellAt(s, cell);
    if (cfg.flags.enforceNoMixedCells && c.count > 0 && c.owner !== player) {
      return fail('OPPONENT_IN_CELL');
    }
    return { ok: true };
  }

  function canPlace(s, player, cell) {
    if (cfg.players.indexOf(player) < 0) return fail('BAD_PLAYER');
    if (!isValidCell(cell)) return fail('BAD_CELL');
    if (s.reserve[player] <= 0) return fail('NO_RESERVE');
    return checkLanding(s, player, cell);
  }

  function placePiece(s, player, cell) {
    var check = canPlace(s, player, cell);
    if (!check.ok) return check;
    var next = cloneState(s);
    var c = cellAt(next, cell);
    c.owner = player;
    c.count += 1;
    next.reserve[player] -= 1;
    return { ok: true, state: next };
  }

  function canMove(s, from, to) {
    if (!isValidCell(from) || !isValidCell(to)) return fail('BAD_CELL');
    if (from === to) return fail('SAME_CELL');
    var src = cellAt(s, from);
    if (src.count === 0) return fail('EMPTY_SOURCE');
    if (cfg.flags.forwardOnly &&
        G.paths.toOwn(src.owner, to) <= G.paths.toOwn(src.owner, from)) {
      return fail('BACKWARD');
    }
    return checkLanding(s, src.owner, to);
  }

  function movePiece(s, from, to) {
    var check = canMove(s, from, to);
    if (!check.ok) return check;
    var next = cloneState(s);
    var src = cellAt(next, from);
    var dst = cellAt(next, to);
    var owner = src.owner;
    src.count -= 1;
    if (src.count === 0) src.owner = null;
    dst.owner = owner;
    dst.count += 1;
    return { ok: true, state: next };
  }

  /* إخراج حجر من اللوحة (شروط الإخراج في game.js) */
  function bearOff(s, from) {
    if (!isValidCell(from)) return fail('BAD_CELL');
    if (cellAt(s, from).count === 0) return fail('EMPTY_SOURCE');
    var next = cloneState(s);
    var src = cellAt(next, from);
    var owner = src.owner;
    src.count -= 1;
    if (src.count === 0) src.owner = null;
    next.off[owner] += 1;
    return { ok: true, state: next };
  }

  /* القاعدة 13: حجر يأكل حجر المنافس الوحيد في to (يُرفع من اللوحة ويُحسب مأكولاً) */
  function capturePiece(s, from, to) {
    if (!isValidCell(from) || !isValidCell(to)) return fail('BAD_CELL');
    var src = cellAt(s, from);
    var dst = cellAt(s, to);
    if (src.count === 0) return fail('EMPTY_SOURCE');
    if (dst.count === 0 || dst.owner === src.owner) return fail('NOTHING_TO_EAT');
    if (cfg.flags.eatOnlySingleStone && dst.count !== 1) return fail('OPPONENT_IN_CELL');
    var next = cloneState(s);
    var a = cellAt(next, from);
    var b = cellAt(next, to);
    var eater = a.owner;
    var victim = b.owner;
    a.count -= 1;
    if (a.count === 0) a.owner = null;
    b.owner = eater;
    b.count = 1;
    next.captured[victim] += 1;
    return { ok: true, state: next, victim: victim };
  }

  /* القاعدة 14: إعادة المأكولين إلى خانة نقطة بدايتهم */
  function releaseCaptured(s, player) {
    var n = s.captured[player];
    if (n <= 0) return fail('NONE_CAPTURED');
    var cell = cfg.startPoint[player];
    var c = cellAt(s, cell);
    if (c.count > 0 && c.owner !== player) return fail('OPPONENT_IN_CELL');
    var next = cloneState(s);
    var d = cellAt(next, cell);
    d.owner = player;
    d.count += n;
    next.captured[player] = 0;
    return { ok: true, state: next, count: n };
  }

  function piecesCaptured(s, player) {
    return s.captured[player];
  }

  function piecesOff(s, player) {
    return s.off[player];
  }

  G.state = {
    createState: createState,
    cloneState: cloneState,
    isValidCell: isValidCell,
    cellAt: cellAt,
    piecesOnBoard: piecesOnBoard,
    canPlace: canPlace,
    placePiece: placePiece,
    canMove: canMove,
    movePiece: movePiece,
    bearOff: bearOff,
    capturePiece: capturePiece,
    releaseCaptured: releaseCaptured,
    piecesCaptured: piecesCaptured,
    piecesOff: piecesOff
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* سير اللعبة: رمية البادئ، النرد، الأدوار، الحركات القانونية، الإخراج، الفوز.
   لا يوجد هنا أي كود يخص الشاشة. كل دالة تُرجع { ok, game, events } أو { ok: false, reason }.
   اللعبة نفسها لا تُعدَّل أبداً؛ كل تغيير ينتج لعبة جديدة.

   القاعدة 9: يخرج من خانة البداية حجر واحد في الدور حتى في الرمية المزدوجة،
   فإن لم تبقَ حركة قانونية أخرى خرج حجر آخر.
   القواعد 12 و13 و14:
   - خانة مغلقة = فيها حجر أو أكثر لنفس اللاعب. ست خانات مغلقة متتالية على مسار اللاعب
     (بترقيمه الخاص) بينما لم يصل أي حجر للمنافس إلى منطقته النهائية (آخر ست خانات من مساره)
     تتيح للمنافس أن يأكل حجراً واحداً في الدور، يختاره بالنرد: ينتقل حجره إلى خانة الحجر المأكول.
   - الحجر المأكول يخرج من اللوحة ولا يعود حتى تصل كل أحجار الآكل التي على اللوحة إلى خانته الأخيرة
     (الخانة 24 بترقيم الآكل)، فيعود إلى خانة بداية صاحبه.
   - ما دام عند اللاعب حجر مأكول لا يبدأ إخراجه.

   الإخراج (القواعد 10 و11 و15):
   - لا يبدأ إلا حين تصبح كل أحجار اللاعب في آخر ست خانات من مساره.
   - الحجر يحتاج مسافة = (24 + 1 - ترقيمه عند اللاعب): الخانة الأخيرة تحتاج 1.
   - النرد الأكبر من اللازم يُخرج الحجر فقط إن لم يكن للاعب حجر في خانة أبعد من خانة هذا الحجر.
   - يجوز استعمال أكثر من نرد لإخراج حجر واحد (مثال القاعدة 11: 5+2 لحجر في الخانة 7)،
     بشرط أن كل نرد ضروري، وأن تكون الخانات الوسيطة قانونية. */
(function (root) {
  var G = (root.Game = root.Game || {});
  var cfg = G.config;
  var P = G.paths;
  var R = G.state;
  var N = cfg.boardSize;

  function fail(reason) {
    return { ok: false, reason: reason };
  }

  function other(p) {
    return p === 'p1' ? 'p2' : 'p1';
  }

  function rollDie(rng) {
    return 1 + Math.floor(rng() * cfg.diceFaces);
  }

  /* opts.board: حالة لوحة جاهزة (للاختبار) */
  function createGame(opts) {
    return {
      board: (opts && opts.board) || R.createState(),
      phase: 'start',      // start | roll | move | over
      current: null,       // p1 أو p2
      startRolls: null,    // { p1: n, p2: n } آخر رمية لتحديد البادئ
      dice: null,          // [a, b] آخر رمية
      movesLeft: [],       // قيم الحركات المتبقية (4 قيم عند المزدوج)
      winner: null,
      eats: 0,             // عدد الأحجار التي أُكلت في هذا الدور (القاعدة 13)
      startExits: 0        // عدد الأحجار التي خرجت من خانة البداية في هذا الدور (القاعدة 9)
    };
  }

  function clone(g) {
    return Object.assign({}, g, { movesLeft: g.movesLeft.slice() });
  }

  function passTurn(g) {
    var n = clone(g);
    n.current = other(g.current);
    n.phase = 'roll';
    n.movesLeft = [];
    return n;
  }

  /* ---------- الحركة العادية ---------- */

  /* ---------- القواعد 12 و13 و14 ---------- */

  /* أطول سلسلة خانات متتالية مغلقة للاعب على مساره (بترقيمه الخاص) */
  function closedRun(board, player) {
    var best = 0;
    var run = 0;
    for (var own = 1; own <= N; own++) {
      var c = R.cellAt(board, P.toPoint(player, own));
      if (c.count > 0 && c.owner === player) { run += 1; if (run > best) best = run; } else run = 0;
    }
    return best;
  }

  /* هل وصل حجر للاعب إلى منطقته النهائية (أو خرج)؟ */
  function reachedFinal(board, player) {
    if (board.off[player] > 0) return true;
    for (var p = 1; p <= N; p++) {
      var c = R.cellAt(board, p);
      if (c.count > 0 && c.owner === player && P.isFinal(player, p)) return true;
    }
    return false;
  }

  /* هل للاعب الحالي حق الأكل الآن؟ (منافسه أغلق ست خانات ولم يصل حجر اللاعب إلى منطقته النهائية) */
  function penaltyActive(g) {
    var me = g.current;
    var foe = other(me);
    return g.phase === 'move' && g.eats < cfg.eatsPerTurn &&
      closedRun(g.board, foe) >= cfg.blockLength && !reachedFinal(g.board, me);
  }

  /* هل الخانة to فيها حجر يجوز أكله الآن؟ */
  function canEat(g, to) {
    var c = R.cellAt(g.board, to);
    if (c.count === 0 || c.owner === g.current) return false;
    if (cfg.flags.eatOnlySingleStone && c.count !== 1) return false;
    return penaltyActive(g);
  }

  /* القاعدة 14: تعود أحجار المأكول حين تصل كل أحجار الآكل التي على اللوحة إلى خانته الأخيرة */
  function releaseDue(g, events) {
    var board = g.board;
    cfg.players.forEach(function (victim) {
      if (board.captured[victim] <= 0) return;
      var eater = other(victim);
      var onBoard = R.piecesOnBoard(board, eater);
      if (onBoard === 0) return;
      var last = R.cellAt(board, P.toPoint(eater, N));
      if (last.owner !== eater || last.count !== onBoard) return;
      var res = R.releaseCaptured(board, victim);
      if (res.ok) {
        board = res.state;
        events.push({ type: 'returned', player: victim, count: res.count });
      }
    });
    if (board === g.board) return g;
    var n = clone(g);
    n.board = board;
    return n;
  }

  /* القاعدة 9: هل توجد حركة قانونية لحجر ليس في خانة البداية (نقل أو إخراج)؟ */
  function hasNonStartMove(g) {
    var start = cfg.startPoint[g.current];
    for (var p = 1; p <= N; p++) {
      if (p === start) continue;
      if (legalMoves(g, p).length > 0 || bearOffOptions(g, p).length > 0) return true;
    }
    return false;
  }

  /* القاعدة 9: هل مُنع خروج حجر آخر من خانة البداية؟ يُمنع إذا خرج العدد المسموح وبقيت حركة قانونية أخرى */
  function startLimitReached(g) {
    return g.phase === 'move' && g.startExits >= cfg.startExitsPerTurn && hasNonStartMove(g);
  }

  /* الحركات القانونية لحجر في الخانة from: [{ to, die }] */
  function legalMoves(g, from) {
    if (g.phase !== 'move' || !R.isValidCell(from)) return [];
    var c = R.cellAt(g.board, from);
    if (c.count === 0 || c.owner !== g.current) return [];
    if (from === cfg.startPoint[g.current] && startLimitReached(g)) return [];
    var own = P.toOwn(g.current, from);
    var out = [];
    var seen = {};
    g.movesLeft.forEach(function (d) {
      if (seen[d]) return;
      seen[d] = true;
      var target = own + d;
      if (target > N) return; // ما بعد الخانة الأخيرة إخراج، انظر bearOffOptions
      var to = P.toPoint(g.current, target);
      if (R.canMove(g.board, from, to).ok) out.push({ to: to, die: d });
      else if (canEat(g, to)) out.push({ to: to, die: d, capture: true });
    });
    return out;
  }

  /* ---------- الإخراج ---------- */

  /* هل كل أحجار اللاعب على اللوحة في منطقته النهائية؟ */
  function allInFinalZone(board, player) {
    for (var p = 1; p <= N; p++) {
      var c = R.cellAt(board, p);
      if (c.count > 0 && c.owner === player && !P.isFinal(player, p)) return false;
    }
    return board.captured[player] === 0;
  }

  function canBearOff(g) {
    return g.phase === 'move' && allInFinalZone(g.board, g.current);
  }

  /* هل للاعب حجر في خانة أبعد عن الخروج من خانة هذا الحجر؟ */
  function hasFarther(board, player, point) {
    var own = P.toOwn(player, point);
    for (var p = 1; p <= N; p++) {
      var c = R.cellAt(board, p);
      if (c.count > 0 && c.owner === player && P.toOwn(player, p) < own) return true;
    }
    return false;
  }

  function permutations(arr) {
    if (arr.length <= 1) return [arr.slice()];
    var out = [];
    arr.forEach(function (v, i) {
      var rest = arr.slice(0, i).concat(arr.slice(i + 1));
      permutations(rest).forEach(function (p) { out.push([v].concat(p)); });
    });
    return out;
  }

  /* عند استعمال أكثر من نرد: هل يوجد ترتيب تكون فيه كل الخانات الوسيطة قانونية؟ */
  function hasLegalOrder(board, player, own, dice) {
    return permutations(dice).some(function (order) {
      var pos = own;
      for (var k = 0; k < order.length - 1; k++) {
        pos += order[k];
        var c = R.cellAt(board, P.toPoint(player, pos));
        if (cfg.flags.enforceNoMixedCells && c.count > 0 && c.owner !== player) return false;
      }
      return true;
    });
  }

  function sortedKey(dice) {
    return dice.slice().sort(function (a, b) { return a - b; }).join(',');
  }

  /* طرق إخراج الحجر الذي في الخانة from: [{ dice: [..], overshoot: bool }] */
  function bearOffOptions(g, from) {
    if (g.phase !== 'move' || !R.isValidCell(from)) return [];
    var c = R.cellAt(g.board, from);
    if (c.count === 0 || c.owner !== g.current) return [];
    if (!allInFinalZone(g.board, g.current)) return [];

    var own = P.toOwn(g.current, from);
    var need = N + 1 - own;
    var farther = hasFarther(g.board, g.current, from);
    var vals = g.movesLeft;
    var out = [];
    var seen = {};

    for (var mask = 1; mask < (1 << vals.length); mask++) {
      var dice = [];
      var sum = 0;
      for (var i = 0; i < vals.length; i++) {
        if (mask & (1 << i)) { dice.push(vals[i]); sum += vals[i]; }
      }
      if (sum < need) continue;
      var minimal = dice.every(function (d) { return sum - d < need; });
      if (!minimal) continue;
      if (sum > need && farther) continue;
      var key = sortedKey(dice);
      if (seen[key]) continue;
      if (dice.length > 1 && !hasLegalOrder(g.board, g.current, own, dice)) continue;
      seen[key] = true;
      out.push({ dice: dice.slice().sort(function (a, b) { return b - a; }), overshoot: sum > need });
    }
    out.sort(function (a, b) { return a.dice.length - b.dice.length || a.dice[0] - b.dice[0]; });
    return out;
  }

  function hasAnyLegalMove(g) {
    for (var p = 1; p <= N; p++) {
      if (legalMoves(g, p).length > 0 || bearOffOptions(g, p).length > 0) return true;
    }
    return false;
  }

  /* القاعدة 8: إذا لم تبقَ حركة ممكنة يمرر اللاعب دوره */
  function settle(g, events) {
    if (g.phase !== 'move') return g;
    if (g.movesLeft.length === 0) {
      events.push({ type: 'turnDone', player: g.current });
      return passTurn(g);
    }
    if (!hasAnyLegalMove(g)) {
      events.push({ type: 'autoPass', player: g.current });
      return passTurn(g);
    }
    return g;
  }

  /* ---------- سير الدور ---------- */

  /* رمية نرد لكل لاعب لتحديد البادئ: الأعلى يبدأ، وتُعاد الرمية عند التعادل */
  function rollStart(g, rng) {
    if (g.phase !== 'start') return fail('WRONG_PHASE');
    var a = rollDie(rng);
    var b = rollDie(rng);
    var n = clone(g);
    n.startRolls = { p1: a, p2: b };
    if (a === b) {
      return { ok: true, game: n, events: [{ type: 'startTie', rolls: n.startRolls }] };
    }
    n.current = a > b ? 'p1' : 'p2';
    n.phase = 'roll';
    return { ok: true, game: n, events: [{ type: 'starter', player: n.current, rolls: n.startRolls }] };
  }

  /* رمي نردين: كل نرد حركة، والمزدوج 4 حركات */
  function rollDice(g, rng) {
    if (g.phase !== 'roll') return fail('WRONG_PHASE');
    var a = rollDie(rng);
    var b = rollDie(rng);
    var n = clone(g);
    n.dice = [a, b];
    n.phase = 'move';
    n.startExits = 0;
    n.eats = 0;
    n.movesLeft = [];
    var count = a === b ? cfg.movesPerDouble : 2;
    for (var i = 0; i < count; i++) n.movesLeft.push(i === 1 && a !== b ? b : a);
    var events = [{ type: 'rolled', player: g.current, dice: [a, b] }];
    n = settle(n, events);
    return { ok: true, game: n, events: events };
  }

  /* تحريك حجر من from إلى to؛ النرد المستعمل يُستنتج من المسافة على مسار اللاعب */
  function playMove(g, from, to) {
    if (g.phase !== 'move') return fail('WRONG_PHASE');
    if (!R.isValidCell(from) || !R.isValidCell(to)) return fail('BAD_CELL');
    var c = R.cellAt(g.board, from);
    if (c.count === 0) return fail('EMPTY_SOURCE');
    if (c.owner !== g.current) return fail('NOT_YOUR_PIECE');
    if (from === cfg.startPoint[g.current] && startLimitReached(g)) return fail('START_LIMIT');
    var die = P.toOwn(g.current, to) - P.toOwn(g.current, from);
    if (die <= 0) return fail('BACKWARD');
    var idx = g.movesLeft.indexOf(die);
    if (idx < 0) return fail('NO_SUCH_DIE');
    var eating = canEat(g, to);
    var moved = eating ? R.capturePiece(g.board, from, to) : R.movePiece(g.board, from, to);
    if (!moved.ok) return moved;
    var n = clone(g);
    n.board = moved.state;
    n.movesLeft.splice(idx, 1);
    if (from === cfg.startPoint[g.current]) n.startExits += 1;
    var events = [];
    if (eating) {
      n.eats += 1;
      events.push({ type: 'captured', player: g.current, victim: moved.victim, from: from, to: to, die: die });
    } else {
      events.push({ type: 'moved', player: g.current, from: from, to: to, die: die });
    }
    n = releaseDue(n, events);
    n = settle(n, events);
    return { ok: true, game: n, events: events };
  }

  /* إخراج الحجر الذي في from بالنرد المذكور (إحدى طرق bearOffOptions). القاعدة 15: الفوز بإخراج كل الأحجار */
  function playBearOff(g, from, dice) {
    if (g.phase !== 'move') return fail('WRONG_PHASE');
    var want = sortedKey(dice || []);
    var opt = bearOffOptions(g, from).filter(function (o) { return sortedKey(o.dice) === want; })[0];
    if (!opt) return fail('CANNOT_BEAR_OFF');
    var moved = R.bearOff(g.board, from);
    if (!moved.ok) return moved;
    var n = clone(g);
    n.board = moved.state;
    opt.dice.forEach(function (d) { n.movesLeft.splice(n.movesLeft.indexOf(d), 1); });
    var events = [{ type: 'bornOff', player: g.current, from: from, dice: opt.dice }];
    n = releaseDue(n, events);
    if (n.board.off[g.current] >= cfg.piecesPerPlayer) {
      n.phase = 'over';
      n.winner = g.current;
      n.movesLeft = [];
      events.push({ type: 'won', player: g.current });
      return { ok: true, game: n, events: events };
    }
    n = settle(n, events);
    return { ok: true, game: n, events: events };
  }

  /* القاعدة 7: الحركات اختيارية، فيجوز إنهاء الدور مبكراً */
  function endTurn(g) {
    if (g.phase !== 'move') return fail('WRONG_PHASE');
    if (!cfg.flags.allowEndTurnEarly) return fail('MUST_MOVE');
    return { ok: true, game: passTurn(g), events: [{ type: 'turnEnded', player: g.current }] };
  }

  G.game = {
    createGame: createGame,
    rollStart: rollStart,
    rollDice: rollDice,
    legalMoves: legalMoves,
    startLimitReached: startLimitReached,
    canBearOff: canBearOff,
    bearOffOptions: bearOffOptions,
    hasAnyLegalMove: hasAnyLegalMove,
    playMove: playMove,
    playBearOff: playBearOff,
    closedRun: closedRun,
    penaltyActive: penaltyActive,
    endTurn: endTurn,
    other: other
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* منطق الغرفة على الخادم: لا يعرف شيئاً عن Cloudflare، فيُختبر كاملاً في Node.
   قواعد اللعبة هي نفس ملفات js/rules التي تعمل على الهاتف (مصدر واحد للحقيقة). */

const GM = globalThis.Game.game;

const LIMITS = {
  nameMax: 16,
  chatMax: 200,
  historyMax: 50,
  rawMax: 2048,
  chatBurst: 5,          // أكثر عدد رسائل ...
  chatWindowMs: 5000,    // ... خلال هذه المدة
  ttlMs: 6 * 60 * 60 * 1000 // تُحذف الغرفة الخاملة بعد 6 ساعات
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف متشابهة (0/O و1/I)
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const SEATS = ['p1', 'p2'];

function randInt(n) {
  // عشوائي آمن بلا انحياز (نرفض القيم التي تخلّ بالتوزيع)
  const limit = Math.floor(0x100000000 / n) * n;
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= limit);
  return a[0] % n;
}

function randomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randInt(CODE_ALPHABET.length)];
  return s;
}

function randomToken() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/* النرد يرميه الخادم وحده */
function secureRng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

function clean(text, max) {
  return String(text == null ? '' : text)
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanName(name, fallback) {
  const n = clean(name, LIMITS.nameMax);
  return n || fallback;
}

function createRoom(code, now) {
  return {
    code,
    createdAt: now,
    updatedAt: now,
    version: 0,
    seats: { p1: null, p2: null },     // { token, name }
    game: GM.createGame(),
    chat: [],
    chatSeq: 0,
    rematch: { p1: false, p2: false }
  };
}

function isFull(room) {
  return !!(room.seats.p1 && room.seats.p2);
}

/* انضمام أو عودة بنفس الرمز السري */
function join(room, { name, token }) {
  if (typeof token === 'string' && token) {
    for (const s of SEATS) {
      const seat = room.seats[s];
      if (seat && seat.token === token) {
        if (typeof name === 'string' && name.trim()) seat.name = cleanName(name, seat.name);
        return { ok: true, seat: s, token, reconnected: true };
      }
    }
  }
  const free = SEATS.find((s) => !room.seats[s]);
  if (!free) return { ok: false, reason: 'ROOM_FULL' };
  const t = randomToken();
  room.seats[free] = { token: t, name: cleanName(name, free === 'p1' ? 'لاعب 1' : 'لاعب 2') };
  return { ok: true, seat: free, token: t, reconnected: false };
}

/* ما يراه اللاعب: لا يحوي رمز الخصم السري أبداً */
function snapshot(room, seat, connected) {
  return {
    code: room.code,
    seat,
    token: room.seats[seat] ? room.seats[seat].token : undefined,
    version: room.version,
    names: {
      p1: room.seats.p1 ? room.seats.p1.name : null,
      p2: room.seats.p2 ? room.seats.p2.name : null
    },
    connected: connected || { p1: false, p2: false },
    ready: isFull(room),
    game: room.game,
    chat: room.chat,
    rematch: room.rematch
  };
}

function publicState(room) {
  return { version: room.version, game: room.game };
}

function isCell(n) { return Number.isInteger(n) && n >= 1 && n <= 24; }

function parseAction(msg) {
  switch (msg.kind) {
    case 'rollStart':
    case 'rollDice':
    case 'endTurn':
      return { ok: true };
    case 'move':
      return isCell(msg.from) && isCell(msg.to) ? { ok: true } : { ok: false };
    case 'bearOff':
      return isCell(msg.from) && Array.isArray(msg.dice) && msg.dice.length >= 1 && msg.dice.length <= 4 &&
        msg.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) ? { ok: true } : { ok: false };
    default:
      return { ok: false };
  }
}

/* تنفيذ حركة. تُعالَج الرسائل واحدة بعد واحدة، ورقم النسخة يمنع حركتين متعارضتين.
   rng: مولّد النرد (يُحقن في الاختبار). */
function applyAction(room, seat, msg, rng) {
  if (!isFull(room)) return { ok: false, reason: 'WAITING_FOR_OPPONENT' };
  if (!parseAction(msg).ok) return { ok: false, reason: 'BAD_INPUT' };
  if (msg.v !== room.version) return { ok: false, reason: 'STALE', resync: true };

  const g = room.game;
  if (g.phase === 'over') return { ok: false, reason: 'GAME_OVER' };
  if (g.phase === 'start') {
    if (msg.kind !== 'rollStart') return { ok: false, reason: 'WRONG_PHASE' };
  } else {
    if (g.current !== seat) return { ok: false, reason: 'NOT_YOUR_TURN' };
    const want = g.phase === 'roll' ? ['rollDice'] : ['move', 'bearOff', 'endTurn'];
    if (!want.includes(msg.kind)) return { ok: false, reason: 'WRONG_PHASE' };
  }

  let res;
  switch (msg.kind) {
    case 'rollStart': res = GM.rollStart(g, rng || secureRng); break;
    case 'rollDice': res = GM.rollDice(g, rng || secureRng); break;
    case 'move': res = GM.playMove(g, msg.from, msg.to); break;
    case 'bearOff': res = GM.playBearOff(g, msg.from, msg.dice); break;
    case 'endTurn': res = GM.endTurn(g); break;
  }
  if (!res || !res.ok) return { ok: false, reason: (res && res.reason) || 'GENERIC' };

  room.game = res.game;
  room.version += 1;
  room.rematch = { p1: false, p2: false };
  return { ok: true, events: res.events || [] };
}

/* إعادة اللعب بعد النهاية: يلزم موافقة اللاعبين */
function requestRematch(room, seat) {
  if (room.game.phase !== 'over') return { ok: false, reason: 'WRONG_PHASE' };
  room.rematch[seat] = true;
  if (room.rematch.p1 && room.rematch.p2) {
    room.game = GM.createGame();
    room.version += 1;
    room.rematch = { p1: false, p2: false };
    return { ok: true, started: true };
  }
  return { ok: true, started: false };
}

/* المحادثة: تنظيف النص، وحد للمعدل، وسجل محدود */
function postChat(room, seat, text, now, bucket) {
  const body = clean(text, LIMITS.chatMax);
  if (!body) return { ok: false, reason: 'EMPTY_MESSAGE' };
  const recent = (bucket || []).filter((t) => now - t < LIMITS.chatWindowMs);
  if (recent.length >= LIMITS.chatBurst) return { ok: false, reason: 'RATE_LIMIT' };
  recent.push(now);
  if (bucket) { bucket.length = 0; recent.forEach((t) => bucket.push(t)); }
  room.chatSeq += 1;
  const message = { id: room.chatSeq, seat, name: room.seats[seat].name, text: body, ts: now };
  room.chat.push(message);
  if (room.chat.length > LIMITS.historyMax) room.chat.splice(0, room.chat.length - LIMITS.historyMax);
  return { ok: true, message };
}

/* غلاف Durable Object رقيق حول core.mjs: يحمل الاتصالات ويحفظ الغرفة ويبثّ الرسائل.
   يستعمل واجهة «السبات» (Hibernation) كي لا تُحسب مدة الانتظار بين الحركات. */

class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.buckets = { p1: [], p2: [] };
    if (typeof WebSocketRequestResponsePair !== 'undefined') {
      // نبض القلب 'ping' يُجاب عليه دون إيقاظ الغرفة
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get('room');
      this.room = saved || null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create' && request.method === 'POST') {
      if (this.room) return new Response('exists', { status: 409 });
      this.room = createRoom(url.searchParams.get('code'), Date.now());
      await this.save();
      return new Response('ok', { status: 201 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (!this.room) return new Response('no such room', { status: 404 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async save() {
    this.room.updatedAt = Date.now();
    await this.ctx.storage.put('room', this.room);
    await this.ctx.storage.setAlarm(Date.now() + LIMITS.ttlMs);
  }

  seatOf(ws) {
    const att = ws.deserializeAttachment();
    return att && att.seat ? att.seat : null;
  }

  connected(exclude) {
    const c = { p1: false, p2: false };
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude || ws.readyState === 2 || ws.readyState === 3) continue;
      const s = this.seatOf(ws);
      if (s) c[s] = true;
    }
    return c;
  }

  send(ws, obj) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* اتصال مغلق */ }
  }

  broadcast(obj, exclude) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude || !this.seatOf(ws)) continue;
      this.send(ws, obj);
    }
  }

  presence(exclude) {
    return {
      t: 'presence',
      connected: this.connected(exclude),
      names: { p1: this.room.seats.p1 && this.room.seats.p1.name, p2: this.room.seats.p2 && this.room.seats.p2.name },
      ready: !!(this.room.seats.p1 && this.room.seats.p2)
    };
  }

  async webSocketMessage(ws, raw) {
    if (!this.room) { this.send(ws, { t: 'error', reason: 'NO_ROOM' }); return ws.close(4404, 'no room'); }
    if (typeof raw !== 'string' || raw.length > LIMITS.rawMax) return this.send(ws, { t: 'error', reason: 'BAD_MESSAGE' });
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return this.send(ws, { t: 'error', reason: 'BAD_MESSAGE' }); }
    if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return this.send(ws, { t: 'error', reason: 'BAD_MESSAGE' });

    const seat = this.seatOf(ws);

    if (msg.t === 'hello') {
      if (seat) return this.send(ws, { t: 'error', reason: 'ALREADY_JOINED' });
      const res = join(this.room, { name: msg.name, token: msg.token });
      if (!res.ok) {
        this.send(ws, { t: 'error', reason: res.reason });
        return ws.close(4403, 'room full');
      }
      // اتصال قديم لنفس المقعد (هاتف آخر أو تبويب قديم) يُستبدل
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && this.seatOf(other) === res.seat) {
          this.send(other, { t: 'error', reason: 'REPLACED' });
          other.serializeAttachment({ seat: null });
          other.close(4001, 'replaced');
        }
      }
      ws.serializeAttachment({ seat: res.seat });
      await this.save();
      this.send(ws, { t: 'welcome', ...snapshot(this.room, res.seat, this.connected()) });
      this.broadcast(this.presence(), ws);
      return;
    }

    if (!seat) return this.send(ws, { t: 'error', reason: 'NOT_JOINED' });

    switch (msg.t) {
      case 'act': {
        const res = applyAction(this.room, seat, msg, secureRng);
        if (!res.ok) {
          this.send(ws, { t: 'rejected', reason: res.reason, version: this.room.version });
          if (res.resync) this.send(ws, { t: 'state', resync: true, ...publicState(this.room) });
          return;
        }
        await this.save();
        this.broadcast({ t: 'state', events: res.events, by: seat, ...publicState(this.room) });
        return;
      }
      case 'chat': {
        const res = postChat(this.room, seat, msg.text, Date.now(), this.buckets[seat]);
        if (!res.ok) return this.send(ws, { t: 'rejected', reason: res.reason, version: this.room.version });
        await this.save();
        this.broadcast({ t: 'chat', message: res.message });
        return;
      }
      case 'rematch': {
        const res = requestRematch(this.room, seat);
        if (!res.ok) return this.send(ws, { t: 'rejected', reason: res.reason, version: this.room.version });
        await this.save();
        if (res.started) this.broadcast({ t: 'state', events: [{ type: 'rematch' }], by: seat, ...publicState(this.room) });
        else this.broadcast({ t: 'rematch', rematch: this.room.rematch });
        return;
      }
      default:
        return this.send(ws, { t: 'error', reason: 'BAD_MESSAGE' });
    }
  }

  async webSocketClose(ws, code, reason) {
    try { ws.close(code && code !== 1005 && code !== 1006 ? code : 1000, reason || ''); } catch (e) { /* مغلق */ }
    if (this.room) this.broadcast(this.presence(ws));
  }

  async webSocketError(ws) {
    if (this.room) this.broadcast(this.presence(ws));
  }

  /* تنظيف الغرفة الخاملة: تُحذف البيانات والمحادثة كلها */
  async alarm() {
    if (!this.room) return;
    const idle = Date.now() - this.room.updatedAt >= LIMITS.ttlMs;
    if (!idle) { await this.ctx.storage.setAlarm(this.room.updatedAt + LIMITS.ttlMs); return; }
    for (const ws of this.ctx.getWebSockets()) { try { ws.close(1000, 'expired'); } catch (e) { /* */ } }
    await this.ctx.storage.deleteAll();
    this.room = null;
  }
}

/* نقطة الدخول: ينشئ الغرف ويحوّل اتصالات WebSocket إلى غرفتها.
   الملفات الثابتة (الموقع نفسه) تقدّمها Cloudflare من مجلد dist قبل الوصول إلى هذا الملف. */


function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/* المتصفح يرسل Origin دائماً. نرفض أي موقع آخر يحاول استعمال الخادم (حماية من CSWSH).
   الطلبات بلا Origin (أدوات الاختبار) لا تأتي من متصفح فلا خطر منها. */
function originOk(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  if (origin === new URL(request.url).origin) return true;
  return allowedOrigins(env).includes(origin);
}

function cors(request, env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin && allowedOrigins(env).includes(origin)) {
    return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
  }
  return {};
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) } });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/room') {
      const headers = cors(request, env);
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (request.method !== 'POST') return json({ error: 'METHOD' }, 405, headers);
      if (!originOk(request, env)) return json({ error: 'FORBIDDEN' }, 403);
      for (let i = 0; i < 6; i++) {
        const code = randomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const r = await stub.fetch('https://room/create?code=' + code, { method: 'POST' });
        if (r.status === 201) return json({ code }, 201, headers);
      }
      return json({ error: 'BUSY' }, 503, headers);
    }

    const m = url.pathname.match(/^\/ws\/([A-Za-z0-9]{6})$/);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'EXPECTED_WEBSOCKET' }, 426);
      if (!originOk(request, env)) return json({ error: 'FORBIDDEN' }, 403);
      const code = m[1].toUpperCase();
      if (!CODE_RE.test(code)) return json({ error: 'BAD_CODE' }, 400);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      return stub.fetch(request);
    }

    return json({ error: 'NOT_FOUND' }, 404);
  }
};

export { Room };
