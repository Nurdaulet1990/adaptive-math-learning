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
  const open = (mod, lvl) => ev(`state.module=${JSON.stringify(mod)};state.level=${JSON.stringify(lvl)};`
    + `state.questionNum=0;state.score=0;state.total=0;renderMain();`);
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

  // ── 2 · the counter moves ───────────────────────────────────────────────────────────
  open('d3', 'a3');
  const seen = [];
  for (let i = 0; i < 4; i++) {
    seen.push(doc.getElementById('qCount').textContent.trim());
    ev('state.questionNum++');         // what showFeedback does after a verdict
    ev('generateQuestion()');          // what the «Келесі →» button does
  }
  T('the question counter follows the questions', seen.join(' ') === '1/10 2/10 3/10 4/10', seen);

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

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  process.exit(failed ? 1 : 0);
}, 400);
