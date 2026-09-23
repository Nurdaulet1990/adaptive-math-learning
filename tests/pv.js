// Drive the real PV app (pv/index.html) and check what a child would actually see.
//   node tests/pv.js            (needs jsdom: npm i jsdom, or JSDOM_MODULE=/path/to/jsdom)
//
// PV is not a route folder like the others — it is a whole legacy app, with its own question screens, its
// own placement test and its own state, wrapped by pv/bridge.js. Nothing in the suite touched it until now,
// which is how a column that silently dropped every zero survived. jsdom runs the page's own scripts (the
// <script src> tags are not fetched, so the app runs standalone on its own localStorage, exactly as it does
// before the bridge has loaded), and then the test plays the app: open a level, answer, press «Келесі».
//
// Checked here:
//   1. the vertical column prints every digit of both numbers, zeros included
//   2. the question counter in the header moves — it is written once by renderMain and was stuck at 1/10
//   3. the ten-frame picture, which is drawn WITH the question, does not print the answer
//   4. «Түсіну» never asks a question that contains its own answer
const fs = require('fs'), path = require('path');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
const ROOT = path.join(__dirname, '..');
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };

const html = fs.readFileSync(path.join(ROOT, 'pv/index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://example.org/pv/', pretendToBeVisual: true });
const w = dom.window;
w.addEventListener('error', () => {});

// give the app a moment to finish its own boot
setTimeout(() => {
  const doc = w.document;
  /* `let state = …` and `function renderMain()` are top-level declarations of a classic script: the
     functions land on window, the `let`/`const` bindings do not. w.eval runs in the page's own global
     scope, which can see both — the same reason the other suites ask the vm context for STAGES by name. */
  const ev = code => w.eval(code);
  // renderMain does not start a level — startLevel does, and that is where the run is reset. Reset it here
  // too, or a level opened straight after a completed one inherits a finished run and ends immediately.
  const open = (mod, lvl) => ev(`state.module=${JSON.stringify(mod)};state.level=${JSON.stringify(lvl)};`
    + `state.questionNum=0;state.score=0;state.total=0;state.streak=0;`
    + `state.streakNeed=${'COMP_LVL.has(' + JSON.stringify(lvl) + ')?4:8'};state.streakCap=state.streakNeed+12;`
    + `renderMain();`);
  const text = () => (doc.getElementById('main') || doc.body).textContent.replace(/\s+/g, ' ');

  // ── 1 · the column keeps its zeros ──────────────────────────────────────────────────
  // a4d1 is 4-digit addition with no carry; draw until one of the two numbers contains a 0.
  let withZero = null;
  for (let i = 0; i < 200 && !withZero; i++) {
    open('d5', 'a4d1');
    const o = ev('currentOps');
    if (/0/.test(String(o.a)) || /0/.test(String(o.b))) withZero = o;
  }
  if (!withZero) T('found a 4-digit sum containing a zero to look at', false);
  else {
    const rows = [...doc.querySelectorAll('.vert-row')].map(r =>
      [...r.querySelectorAll('.vert-digit')].map(d => d.textContent.trim()).join(''));
    const a = rows.find(r => r === String(withZero.a)) !== undefined;
    const b = rows.find(r => r === String(withZero.b)) !== undefined;
    T(`the column prints ${withZero.a} and ${withZero.b} in full, zeros included`, a && b,
      { a: withZero.a, b: withZero.b, rows });
  }

  // ── 2 · the header counts the RUN, and it moves ─────────────────────────────────────
  // It used to be «1/10» written once by renderMain and never touched again. It is now the thing the child
  // is actually working towards, so it has to follow every verdict.
  open('d3', 'a3');
  const seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(doc.getElementById('qCount').textContent.trim());
    ev('showFeedback(true)');          // a right answer
    ev('generateQuestion()');          // what the «Келесі →» button does
  }
  T('the header follows the run', seen.join(' ') === 'қатарынан 0/8 қатарынан 1/8 қатарынан 2/8 қатарынан 3/8', seen);

  // ── 3 · the ten-frame does not finish the sum ───────────────────────────────────────
  const leaks = [];
  for (const [mod, lvl] of [['d2', 'a2'], ['d2', 's20b']]) {
    for (let i = 0; i < 60; i++) {
      open(mod, lvl);
      // genHorizOps keeps nothing, so read the two numbers off the equation row it just drew
      const row = doc.querySelector('.equation-row');
      const nums = (row ? row.textContent : '').match(/\d+/g);
      if (!nums || nums.length < 2) continue;
      const a = +nums[0], b = +nums[1], ans = lvl === 'a2' ? a + b : a - b;
      // the caption and the picture's own labels sit below the equation row
      const below = (doc.querySelector('.block-display') || {}).textContent || '';
      const body = below.replace(new RegExp(`\\b${a}\\b`, 'g'), ' ').replace(new RegExp(`\\b${b}\\b`, 'g'), ' ');
      if (new RegExp(`\\b${ans}\\b`).test(body)) leaks.push({ lvl, a, b, ans, body: body.replace(/\s+/g, ' ').trim().slice(0, 80) });
    }
  }
  T('the ten-frame picture never prints the answer', leaks.length === 0, leaks.slice(0, 2));

  // ── 4 · «Түсіну» does not ask a question that contains its answer ───────────────────
  const selfAnswering = [];
  for (const lvl of ['u1', 'u2', 'u3', 'u4', 'u5']) {
    const mod = ev('MODULES').find(m => m.levels.some(l => l.id === lvl));
    for (let i = 0; i < 80; i++) {
      open(mod.id, lvl);
      const q = (doc.querySelector('.question') || doc.querySelector('.equation-row') || {}).textContent || '';
      const btn = doc.querySelector('.check-btn');
      const m = btn && /checkAnswer\((-?\d+)\)/.exec(btn.getAttribute('onclick') || '');
      if (!m) continue;
      const ans = m[1];
      /* The fault this is for is «9 — бұл қандай сан?»: one number on screen, and it is the answer. A
         stem may legitimately contain the answer when it is one of several numbers — «16 − 8 =» has to
         print 8, and «32 және 86 — қайсысы үлкен?» has to print both to be answerable at all. So the
         rule is the narrow one: the stem shows exactly ONE number, and that number is the answer. */
      const nums = (q.match(/\d+/g) || []);
      if (nums.length === 1 && nums[0] === ans) selfAnswering.push({ lvl, q: q.trim().replace(/\s+/g, ' '), ans });
    }
  }
  T('no Түсіну question carries its own answer in the stem', selfAnswering.length === 0, selfAnswering.slice(0, 3));

  // ── 5 · a level is passed by a RUN, not by a count ──────────────────────────────────
  const answer = ok => { ev(`showFeedback(${ok});`); ev('generateQuestion()'); };
  open('d3', 'a3');
  ev('state.streakNeed=8');
  for (let i = 0; i < 7; i++) answer(true);
  answer(false);                                   // one miss at the eighth
  T('a miss puts the run back to nothing', ev('state.streak') === 0, ev('state.streak'));
  T('…and the level is still running', !/Тамаша|Қайталап/.test(text()), text().slice(0, 60));
  for (let i = 0; i < 7; i++) answer(true);
  T('seven in a row is not yet a pass', !/Тамаша/.test(text()), ev('state.streak'));
  answer(true);
  T('the eighth in a row passes it', /Тамаша/.test(text()) && ev('state.streak') === 8, ev('state.streak'));

  open('d3', 'a3');
  ev('state.streakNeed=8');
  let asked = 0;
  while (asked < 30 && !/Тамаша|Қайталап/.test(text())) { answer(asked % 2 === 0); asked++; }
  T('alternating right and wrong never passes, and the level does end', /Қайталап/.test(text()), { asked });

  // ── 6 · the no-picture twins ────────────────────────────────────────────────────────
  const AID = '.block-display, .horiz-vis, .ops-pv-chart';
  const aids = () => doc.querySelectorAll(AID).length;
  T('every add/sub level has a twin right behind it', ev(`
      (() => { const ids=[]; MODULES.forEach(m=>m.levels.forEach(l=>ids.push(l.id)));
        return ids.every((id,i) => !ADDSUB.has(id) || ids[i+1] === id + '_n'); })()`));
  T('76 levels, 28 of them without a picture', ev('LEVEL_ORDER.length') === 76 && ev('NOFIG.size') === 28,
    { levels: ev('LEVEL_ORDER.length'), twins: ev('NOFIG.size') });

  /* The station number is the identity of a station, so the original 48 must still be exactly the numbers
     they were before the twins were inserted — a saved stage row or a logged event from before today
     points at PV-27 and has to keep meaning AR… meaning a7. */
  T('the first 48 stations kept their numbers', ev(`
      (() => { const было={c1:1,a1:2,s1:3,u1:4,c20:5,pv20:6,a20n:7,a2:8,s20n:9,s20b:10,u2:11,ct10:12,
        c2:13,p1:14,m1:15,a3:16,a4:17,a5:18,a6:19,s2:20,s3:21,u3:22,c3:23,p2:24,p3:25,m2:26,a7:27,a8:28,
        a9:29,a10:30,s4:31,s5:32,s6:33,s7:34,u4:35,c4:36,pv4d:37,p4:38,m3:39,a4d1:40,a4d2:41,a4d3:42,
        a4d4:43,s4d1:44,s4d2:45,s4d3:46,s4d4:47,u5:48};
        return Object.keys(было).every(k => STAGE_NO[k] === было[k]); })()`));
  T('every level has a number, and no number is used twice', ev(`
      (() => { const ids=[]; MODULES.forEach(m=>m.levels.forEach(l=>ids.push(l.id)));
        const ns=ids.map(i=>STAGE_NO[i]);
        return ns.every(n=>typeof n==='number') && new Set(ns).size===ns.length; })()`));

  open('d1', 'a1');
  const withPic = aids();
  open('d1', 'a1_n');
  T(`the parent level draws its aids (${withPic}) and the twin draws none`, withPic > 0 && aids() === 0,
    { parent: withPic, twin: aids() });
  T('…but it is the same question: the equation is still there',
    !!doc.querySelector('.equation-row, .prompt-card'), text().slice(0, 50));

  // a wrong answer brings the picture back — and is still wrong
  ev('state.streak=5');
  ev('showFeedback(false)');
  T('a miss on a no-picture level puts the aid back', aids() === withPic, { now: aids(), want: withPic });
  T('…and the answer still counts as wrong: the run is gone', ev('state.streak') === 0, ev('state.streak'));

  // and the aid does not linger into the next question
  ev('generateQuestion()');
  T('the next question is bare again', aids() === 0, aids());

  /* The bug this pair is for: the map card carries stageId(levelId), and the tap handler turned that
     number back into a POSITION — `PV-16 → LEVEL_ORDER[15]`. That was the same thing until the numbers
     were written out and 28 levels inserted; after that, tapping a two-digit station opened whatever had
     slid into index 15. A number is an identity here, and the only safe way back is to look it up. */
  T('a station number is no longer its position — so nothing may index by it',
    ev('LEVEL_ORDER.some((e,i) => STAGE_NO[e.levelId] !== i+1)'));
  T('every station id maps back to its own level, and to no other', ev(`
      (() => { const id = e => 'PV-' + String(STAGE_NO[e.levelId]).padStart(2,'0');
        return LEVEL_ORDER.every(e => {
          const hits = LEVEL_ORDER.filter(x => id(x) === id(e));
          return hits.length === 1 && hits[0].levelId === e.levelId; }); })()`));

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  process.exit(failed ? 1 : 0);
}, 400);
