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

/* jsdom does not fetch <script src>, and a `const` injected later with w.eval is scoped to that eval —
   it never reaches the page's global lexical scope, so the app would not see it. Inlining the file before
   the DOM is built is what the browser actually does. */
const html = fs.readFileSync(path.join(ROOT, 'pv/index.html'), 'utf8')
  .replace(/<script src="discs\.js[^"]*"><\/script>/,
           '<script>' + fs.readFileSync(path.join(ROOT, 'pv/discs.js'), 'utf8') + '</script>');
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

  // ── 7 · the disc chart, from three digits up ────────────────────────────────────────
  // «两位数不需要» — two digits keep the plain two-row table; three and four get the chart that draws the
  // exchange. The two are told apart by what they actually are, not by looking for an <svg>: the old
  // table is full of them too (renderPVCell draws every cell as one).
  const chartKind = () => { const el = doc.querySelector('.ops-pv-chart');
    if (!el) return 'none';
    if (/<table/.test(el.innerHTML)) return 'table';
    if (/marker id="dq"/.test(el.innerHTML)) return 'discs';
    return 'other'; };
  const kinds = {};
  for (const [mod, lvl] of [['d3','a3'], ['d3','s3'], ['d4','a7'], ['d4','s5'], ['d5','a4d3'], ['d5','s4d4']]) {
    open(mod, lvl); kinds[lvl] = chartKind();
  }
  T('two-digit levels keep the plain chart', kinds.a3 === 'table' && kinds.s3 === 'table', kinds);
  T('three- and four-digit levels get the exchange chart',
    ['a7','s5','a4d3','s4d4'].every(l => kinds[l] === 'discs'), kinds);
  open('d4', 's5');
  const el = doc.querySelector('.ops-pv-chart').innerHTML;
  T('…and it really draws the exchange: a dashed disc, an arrow and crossings',
    /stroke-dasharray/.test(el) && /marker-end/.test(el) && /var\(--bad/.test(el.replace(/var\(--bad, #CF4B3E\)/g, 'var(--bad')),
    el.slice(0, 120));

  /* The picture has to be RIGHT, not merely present: what is left uncrossed in each column must be the
     digit of the answer in that column. 4072 − 1385 caught the flaw this checks for — the hundreds
     received a ten and then lent one of those on to the tens, and a loan made out of borrowed discs was
     drawn solid, so the column read 7 where the answer says 6. */
  const columnsOf = (a, b) => {
    const svg = ev(`DISCS.sub(${a},${b})`);
    const nP = String(Math.max(a, b)).length, colW = (340 - 8) / nP;
    const col = x => Math.min(nP - 1, Math.max(0, Math.floor((x - 4) / colW)));
    const left = new Array(nP).fill(0), crossLines = new Array(nP).fill(0);
    for (const m of svg.matchAll(/<circle cx="([\d.]+)" cy="[\d.]+" r="\d+" fill="([^"]+)"/g))
      if (m[2] !== 'none') left[col(+m[1])]++;                       // a dashed one is fill="none"
    for (const m of svg.matchAll(/<line x1="([\d.]+)"[^>]*stroke="var\(--bad[^"]*"/g))
      crossLines[col(+m[1])]++;                                     // two lines make one cross
    return left.map((n, i) => n - crossLines[i] / 2);
  };
  const wrongCols = [];
  for (const [a, b] of [[628,356],[274,92],[809,324],[715,682],[4072,1385],[2000,999],[500,271],[1000,1]]) {
    const want = String(a - b).padStart(String(Math.max(a,b)).length, '0').split('').map(Number);
    const got = columnsOf(a, b);
    if (got.join() !== want.join()) wrongCols.push({ sum: `${a} − ${b} = ${a-b}`, want, got });
  }
  T('every column of the disc chart is left holding the answer', wrongCols.length === 0, wrongCols);

  /* Every level has to yield its OWN placement question. genPlacementQ matches ids exactly, so the moment
     twins existed they all fell through to the «1 + 1 = ?» at the bottom of the chain — shown under the
     twin's own heading, and answered correctly by everyone, which sent the placement ladder climbing into
     the four-digit levels on the strength of it. */
  const fellThrough = ev(`
    LEVEL_ORDER.map(e => e.levelId).filter(id => {
      const q = genPlacementQ(id);
      return q.q === '1 + 1 = ?' && id !== 'a1';
    })`);
  T('no level falls through to the placement fallback', fellThrough.length === 0, fellThrough.slice(0, 6));
  T('a twin asks its parent\'s placement question', ev(`
      LEVEL_ORDER.map(e=>e.levelId).filter(id=>NOFIG.has(id))
        .every(id => genPlacementQ(id).sub === genPlacementQ(id.slice(0,-2)).sub)`));

  // ── 8 · the placement test, driven to the top ───────────────────────────────────────
  // Answer everything right and it should climb the PARENT levels only, ask a real question each time,
  // and finish on the last one. This is the run that was showing «1 + 1 = ?» under a twin's heading and
  // then, because everyone gets that right, carrying children into the four-digit levels.
  ev('startDiagnostic()');
  const probes = [], tags = [];
  for (let i = 0; i < 40 && ev('state.placement && state.placement.active'); i++) {
    probes.push((doc.querySelector('.pt-q') || {}).textContent || '');
    tags.push(ev('PLACE_ORDER[Math.min(state.placement.currentIdx, PLACE_ORDER.length-1)].levelId'));
    const btn = doc.querySelector('.check-btn');
    const m = /checkPlacement\((-?\d+)\)/.exec(btn.getAttribute('onclick') || '');
    const inp = doc.getElementById('pt-ans'); inp.value = m[1];
    ev(`checkPlacement(${m[1]})`);
  }
  T('the ladder never asks the fallback question', !probes.includes('1 + 1 = ?'),
    probes.filter(q => q === '1 + 1 = ?').length + ' of ' + probes.length);
  T('…and it only ever probes parent levels', tags.every(t => !ev('NOFIG').has(t)),
    tags.filter(t => ev('NOFIG').has(t)).slice(0, 4));
  T(`…and a child who gets everything right lands on the last level (${probes.length} questions)`,
    ev('state.unlockedUpTo') === ev('LEVEL_ORDER.length - 1'),
    { at: ev('state.unlockedUpTo'), of: ev('LEVEL_ORDER.length - 1') });

  /* 5. the two-digit hint chart (blockChart2, owner's notebook page 2026-09-25): three rows, exchange drawn.
        Counted from the SVG: a rod is ten <rect>s, a cube one; a spent block sits in <g opacity="0.3">;
        a crossed block has a <path> with the error stroke over it. What stays uncrossed must be the answer. */
  try {
    const stepsA = w.buildVisualSteps(36, 26, '+'), stepsS = w.buildVisualSteps(62, 26, '−');
    const fin = st => st[st.length - 1];
    const row = (h, cls) => { const d = new w.DOMParser().parseFromString('<table>' + h + '</table>', 'text/html'); return d.querySelector('tr.' + cls); };
    const cells = tr => [...tr.querySelectorAll('td')];
    const cnt = (td, sel) => td.querySelectorAll(sel).length;
    const rA = row(w.blockChart2(36, 26, '+', fin(stepsA)), 'pv-row-r'), [tA, oA] = cells(rA);
    T('36 + 26, last step: the ones cell holds 12 cubes, ten of them faded in a dashed box, two solid', cnt(oA, 'rect[rx="2"]') === 12 && cnt(oA, 'g[opacity] rect[rx="2"]') === 10 && cnt(oA, 'rect[stroke-dasharray]') === 1, { cubes: cnt(oA, 'rect[rx="2"]'), faded: cnt(oA, 'g[opacity] rect[rx="2"]') });
    T('…and the tens cell holds 3 + 2 + the carried rod = 6 rods, the new one in a dashed box, with the arrow', cnt(tA, 'rect[rx="1.5"]') === 60 && cnt(tA, 'rect[stroke-dasharray]') === 1 && /⟵/.test(tA.textContent), { rods: cnt(tA, 'rect[rx="1.5"]') / 10 });
    const first = w.blockChart2(36, 26, '+', stepsA[0]);
    T('36 + 26, first step (ones only): the tens result cell is still a «?»', /bc2-q">\?/.test(cells(row(first, 'pv-row-r'))[0].innerHTML), cells(row(first, 'pv-row-r'))[0].innerHTML.slice(0, 80));
    const rS = row(w.blockChart2(62, 26, '−', fin(stepsS)), 'pv-row-r'), [tS, oS] = cells(rS);
    const rodsLeft = cnt(tS, 'rect[rx="1.5"]') / 10 - cnt(tS, 'g[opacity] rect[rx="1.5"]') / 10 - cnt(tS, 'path[stroke="var(--error)"]');
    const cubesLeft = cnt(oS, 'rect[rx="2"]') - cnt(oS, 'path[stroke="var(--error)"]');
    T('62 − 26, last step: one rod faded (given away), two crossed, three left; ten cubes arrived, six crossed, six left = 36', cnt(tS, 'g[opacity] rect[rx="1.5"]') === 10 && cnt(tS, 'path[stroke="var(--error)"]') === 2 && rodsLeft === 3 && cnt(oS, 'rect[rx="2"]') === 12 && cubesLeft === 6 && /⟶/.test(oS.textContent), { rodsLeft, cubesLeft, cubes: cnt(oS, 'rect[rx="2"]') });
    const s0 = row(w.blockChart2(62, 26, '−', stepsS[0]), 'pv-row-r');
    T('62 − 26, first step («2 < 6»): the result row is still just a — 6 rods, 2 cubes, nothing faded or crossed', cnt(s0, 'rect[rx="1.5"]') === 60 && cnt(s0, 'rect[rx="2"]') === 2 && cnt(s0, 'g[opacity]') === 0 && cnt(s0, 'path') === 0);
    const noRe = row(w.blockChart2(42, 31, '+', fin(w.buildVisualSteps(42, 31, '+'))), 'pv-row-r');
    T('42 + 31 (no exchange): 7 rods and 3 cubes, no dashed box, no arrow', cnt(noRe, 'rect[rx="1.5"]') === 70 && cnt(noRe, 'rect[rx="2"]') === 3 && cnt(noRe, 'rect[stroke-dasharray]') === 0 && !/⟵|⟶/.test(noRe.textContent));
    T('the hint of a two-digit column level uses the chart; a three-digit one does not', /class="pv-table bc2"/.test(w.renderVisualHint(36, 26, '+', 0, 5, stepsA[0])) && !/bc2/.test(w.renderVisualHint(436, 226, '+', 0, 5, w.buildVisualSteps(436, 226, '+')[0])));
  } catch (e) { T('two-digit hint chart', false, e.message); }

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  process.exit(failed ? 1 : 0);
}, 400);
