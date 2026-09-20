/* ar/generate.js — AR route question generators, part 1 of 2: the FACT layer
 * (AR-01 … AR-23 — equal groups, tables, the speed drills, division facts, distributivity,
 * remainder). The ALGORITHM layer (AR-24 … AR-41) lives in generate2.js. Both merge into the same
 * global GENERATORS object; the shared helpers below are published as AR_UTIL for
 * generate2.js to reuse, so THIS FILE MUST LOAD FIRST.
 * Split from one 648-line file with the owner's approval (ROUTE_CONVENTION.md §2,
 * §1 rule 5) — both files are listed in MAP.md.
 *
 * §5: pure functions, no DOM, no globals, no Core.  type(params, lvl) -> question (§7).
 * lvl 1 Нақты · lvl 2 Сұлба · lvl 3 Мәтін (§6) — figure AND number range change.
 * DECIMAL SEPARATOR: dot (5.25) — owner's ruling 2026-09-13, now ROUTE_CONVENTION §8.
 *
 * ── Why every answer here is a SINGLE number ──
 * The isCorrect patch LANDED (v1.1 §4: every number in the expected answer must
 * match, in order), so a compound answer would now grade correctly. AR still asks
 * for one number per question, because §4's kind:'custom' trap 2 is unchanged —
 * the feedback line prints a single value, «Дұрыс жауабы: X», so a compound answer
 * would be DISPLAYED wrong even where it is graded right. Full result via ansHTML/expl.
 */
(function (root) {
  'use strict';

  /* ── helpers ───────────────────────────────────────────── */
  var R = function (a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; };
  var pick = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var num = function (x) { return String(+(Math.round(x * 1e6) / 1e6)); };  // dot separator

  /* Case forms are stored, not generated. Kazakh accusative and dative endings
   * depend on the final sound and on vowel harmony (қарындаш → қарындаш-ТЫ, not -ды;
   * қорап → қорап-ҚА / қорап-ТА, not -ке / -те), and ROUTE_CONVENTION §8 says not to
   * hard-code new endings in code. Written out here so a human can check the forms;
   * move to core/words.js if that file is ever added.
   *   one    nominative (after a numeral, and in «қанша X?»)
   *   acc    accusative — «N X-ты бөлді»
   *   boxLoc locative   — «N қорапТА»
   *   boxDat dative     — «қорапҚА салды» */
  var THING = [
    { one: 'алма', acc: 'алманы', box: 'себет', boxLoc: 'себетте', boxDat: 'себетке' },
    { one: 'дәптер', acc: 'дәптерді', box: 'қорап', boxLoc: 'қорапта', boxDat: 'қорапқа' },
    { one: 'қарындаш', acc: 'қарындашты', box: 'пенал', boxLoc: 'пеналда', boxDat: 'пеналға' },
    { one: 'кітап', acc: 'кітапты', box: 'сөре', boxLoc: 'сөреде', boxDat: 'сөреге' },
    { one: 'гүл', acc: 'гүлді', box: 'ваза', boxLoc: 'вазада', boxDat: 'вазаға' },
    { one: 'доп', acc: 'допты', box: 'қорап', boxLoc: 'қорапта', boxDat: 'қорапқа' }
  ];

  /* Distinct wrong options for kind:'choice'. Every value must be a DISTINCT
   * NUMBER: core/runner.js marks every option Core.isCorrect() accepts, so two
   * options that compare equal both light up green (ROUTE_CONVENTION §4). Since
   * the patch landed that means equal by the full number sequence, not just by a
   * shared leading number — but distinct values are still the rule. */
  function opts(correct, pool) {
    var out = [String(correct)], guard = 0, step = 1;
    while (out.length < 4 && guard++ < 60) {
      var v = String(pool());
      if (out.indexOf(v) < 0) out.push(v);
    }
    // pool exhausted (small numbers): walk outwards so there are always 4
    while (out.length < 4 && step < 40) {
      [+correct + step, +correct - step].forEach(function (c) {
        if (c > 0 && out.length < 4 && out.indexOf(String(c)) < 0) out.push(String(c));
      });
      step++;
    }
    for (var i = out.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }
  function near(v, spread) {
    return function () {
      var d = R(1, spread) * (Math.random() < 0.5 ? -1 : 1);
      return Math.max(0, v + d);
    };
  }

  var G = {};

  /* ══ AR-01 · Тең топтар — what the symbol MEANS ════════
   * Kazakh reads a × b as "a taken b times" (textbook: 3·4 = 3+3+3+3), so
   * throughout AR-01…03 the FIRST factor is what is repeated and the SECOND is
   * how many times. lvl 1 shows the expression AND the picture together — the
   * association is the lesson, not the challenge. Numbers stay inside 5 until
   * lvl 3, and lvl 3's repeated addend stays skip-countable (2/3/4/5/10),
   * because the tables are not taught until AR-04/AR-06. */
  G.groups = function (p, lvl) {
    var ICON = ['🍎', '🍐', '🍌', '🐟', '⭐', '🌸'];
    var a, b, th = pick(THING);
    if (lvl === 1) { a = R(2, 5); b = R(2, 5); }          // "a taken b times"
    else if (lvl === 2) { a = R(2, 5); b = R(2, 6); }
    else { a = pick([2, 3, 4, 5, 10]); b = R(2, 10); }
    var tot = a * b;
    if (lvl === 1) {
      return {
        stem: 'Барлығы қанша?',
        kind: 'input',
        ans: String(tot),
        fig: { type: 'meaning', a: a, b: b, icon: pick(ICON) },
        h1: a + ' × ' + b + ' дегеніміз — ' + a + ' санын ' + b + ' рет алу.',
        h2: Array(b + 1).join(a + ' + ').slice(0, -3),
        steps: [{ label: 'Қатарларды сана', expr: 'Неше қатар?', val: String(b) },
                { label: 'Барлығы', expr: a + ' × ' + b + ' = ?', val: String(tot) }],
        expl: a + ' × ' + b + ' = ' + Array(b + 1).join(a + ' + ').slice(0, -3) + ' = ' + tot + '.'
      };
    }
    if (lvl === 2) {
      return {
        stem: 'Барлығы қанша?',
        kind: 'input',
        ans: String(tot),
        fig: { type: 'meaning', a: a, b: b, icon: pick(ICON), show: 'sum' },
        hfig: { type: 'meaning', a: a, b: b, icon: '🍎', answer: true },
        h1: 'Бірдей қосылғышты көбейтуге ауыстыр: ' + a + ' саны ' + b + ' рет.',
        h2: a + ' × ' + b,
        steps: [{ label: 'Көбейтуге ауыстыр', expr: a + ' × ' + b + ' = ?', val: String(tot) }],
        expl: Array(b + 1).join(a + ' + ').slice(0, -3) + ' = ' + a + ' × ' + b + ' = ' + tot + '.'
      };
    }
    return {
      stem: b + ' ' + th.boxLoc + ' ' + a + '-ден ' + th.one + ' бар. Барлығы қанша ' + th.one + '?',
      kind: 'input',
      ans: String(tot),
      hfig: { type: 'meaning', a: a, b: Math.min(b, 6), icon: '🍎' },
      h1: 'Әр ' + th.boxLoc + ' ' + a + '-ден — демек ' + a + ' санын ' + b + ' рет аламыз.',
      h2: a + ' × ' + b,
      steps: [{ label: 'Не қайталанады', expr: 'Әр ' + th.box + 'та нешеден?', val: String(a) },
              { label: 'Неше рет', expr: 'Неше ' + th.box + '?', val: String(b) },
              { label: 'Көбейтінді', expr: a + ' × ' + b + ' = ?', val: String(tot) }],
      expl: a + ' × ' + b + ' = ' + tot + '. ' + a + ' санын ' + b + ' рет алдық.'
    };
  };

  /* ══ AR-02 · Қосудан көбейтуге ═════════════════════════ */
  G.rep_add = function (p, lvl) {
    var a = lvl === 1 ? R(2, 5) : lvl === 2 ? R(2, 5) : pick([2, 3, 4, 5, 10]);
    var b = lvl === 1 ? R(2, 4) : lvl === 2 ? R(2, 6) : R(2, 9);
    var sumTxt = Array(b + 1).join(a + ' + ').slice(0, -3);
    if (lvl === 1 || lvl === 2) {
      // "a + a + a = a × ?" — the missing number is HOW MANY TIMES, so the
      // answer is a scalar and the factor order matches the textbook.
      return {
        stem: sumTxt + ' = ' + a + ' × ?',
        kind: 'choice',
        choices: opts(b, near(b, 3)),
        ans: String(b),
        fig: { type: 'meaning', a: a, b: b, icon: lvl === 1 ? '🍎' : '⭐', show: 'sum' },
        h1: a + ' саны қанша рет қайталанды? Сол сан — екінші көбейткіш.',
        h2: a + ' × ' + b,
        expl: sumTxt + ' — мұнда ' + a + ' саны ' + b + ' рет алынған, сондықтан ' +
          a + ' × ' + b + ' = ' + a * b + '.'
      };
    }
    return {
      stem: sumTxt + ' = ?',
      kind: 'input',
      ans: String(a * b),
      hfig: { type: 'meaning', a: a, b: b, icon: '🍎', show: 'both' },
      h1: 'Бірдей қосылғышты көбейтуге ауыстыр.',
      h2: a + ' × ' + b,
      steps: [{ label: 'Неше рет', expr: a + ' саны неше рет?', val: String(b) },
              { label: 'Көбейтінді', expr: a + ' × ' + b + ' = ?', val: String(a * b) }],
      expl: sumTxt + ' = ' + a + ' × ' + b + ' = ' + a * b + '.'
    };
  };

  /* ══ AR-03 · Қатар мен баған · ауыстырымдылық ══════════
   * An array of r rows with c in each is c taken r times → c × r. */
  G.array = function (p, lvl) {
    var r = lvl === 1 ? R(2, 5) : R(2, 9), c = lvl === 1 ? R(2, 5) : R(2, 9);
    if (lvl === 1) {
      return {
        stem: r + ' қатар, әр қатарда ' + c + '. Осы кестені құр да, нүктелер санын жаз.',
        kind: 'custom',
        ans: String(r * c),
        ansHTML: c + ' × ' + r + ' = <b>' + r * c + '</b>',
        h1: 'Әр қатарда ' + c + ', қатар саны ' + r + ' — демек ' + c + ' санын ' + r + ' рет аламыз.',
        h2: c + ' × ' + r,
        expl: c + ' × ' + r + ' = ' + r * c + '. Әр қатарда ' + c + ', барлығы ' + r + ' қатар.',
        /* No local "already answered" latch: core/runner.js owns that. In practice
         * mode the FIRST wrong answer gets one retry (§7), and the runner guards
         * its own callback with window._Q.done — a latch here would leave the
         * student with a dead UI on that retry. */
        mount: function (el, submit) {
          var N = 9, sel = { r: 0, c: 0 };
          var html = '<div class="ar-grid" style="display:inline-block">';
          for (var i = 1; i <= N; i++) {
            html += '<div style="display:flex">';
            for (var j = 1; j <= N; j++) {
              html += '<span data-r="' + i + '" data-c="' + j + '" style="width:22px;height:22px;' +
                'margin:1px;border-radius:4px;border:1.5px solid var(--line);cursor:pointer"></span>';
            }
            html += '</div>';
          }
          html += '</div><div style="margin-top:10px;display:flex;gap:12px;align-items:center">' +
            '<span class="ar-lbl note" style="font-weight:800">0 қатар × 0</span>' +
            '<button class="btn ar-go" type="button">Тексеру</button></div>';
          el.innerHTML = html;
          var lbl = el.querySelector('.ar-lbl'), cells = el.querySelectorAll('[data-r]');
          function paint() {
            Array.prototype.forEach.call(cells, function (s) {
              var on = +s.dataset.r <= sel.r && +s.dataset.c <= sel.c;
              s.style.background = on ? 'var(--accent)' : 'transparent';
            });
            lbl.textContent = sel.r + ' қатар × ' + sel.c + ' = ' + sel.r * sel.c;
          }
          Array.prototype.forEach.call(cells, function (s) {
            s.addEventListener('click', function () {
              sel.r = +s.dataset.r; sel.c = +s.dataset.c; paint();
            });
          });
          el.querySelector('.ar-go').addEventListener('click', function () {
            if (sel.r) submit(String(sel.r * sel.c));
          });
        }
      };
    }
    if (lvl === 2) {
      return {
        stem: c + ' × ' + r + ' = ? × ' + c,
        kind: 'choice',
        choices: opts(r, near(r, 3)),
        ans: String(r),
        fig: { type: 'array', r: r, c: c },
        h1: 'Кестені бұрсаң, нүктелер саны өзгермейді — көбейткіштер орын ауыстырады.',
        h2: c + ' × ' + r + ' = ' + r + ' × ' + c,
        expl: 'Ауыстырымдылық қасиеті: ' + c + ' × ' + r + ' = ' + r + ' × ' + c + ' = ' + r * c + '.'
      };
    }
    return {
      stem: r + ' × ' + c + ' = ?  (' + c + ' × ' + r + ' белгілі)',
      kind: 'input',
      ans: String(r * c),
      hfig: { type: 'array', r: r, c: c },
      h1: 'Көбейткіштердің орнын ауыстырсаң, көбейтінді өзгермейді.',
      h2: r + ' × ' + c + ' = ' + c + ' × ' + r,
      expl: r + ' × ' + c + ' = ' + r * c + '.'
    };
  };

  /* ══ AR-04…14 · Көбейту кестесі — one stage per table ══
   * params: { k:[table], review:[tables already learned] }
   * Cumulative by design (Rocket Math): a slice of every question pool is drawn
   * from the tables already passed, so earlier facts keep being retrieved inside
   * the new one instead of being parked in a separate review system. */
  G.table = function (p, lvl) {
    var pool = p.k, rev = p.review || [];
    // lvl 1 is the new table only; later levels mix in what came before
    var useReview = rev.length && lvl > 1 && Math.random() < (lvl === 2 ? 0.25 : 0.35);
    var k = useReview ? pick(rev) : pick(pool);
    var m = lvl === 1 ? R(2, 5) : R(2, 10);
    var prod = k * m;
    if (lvl === 3 && Math.random() < 0.4) {           // missing-factor form
      return {
        stem: k + ' × ? = ' + prod,
        kind: 'input',
        ans: String(m),
        h1: 'Белгісіз көбейткішті табу үшін бөл.',
        h2: prod + ' ÷ ' + k,
        steps: [{ label: 'Кері амал', expr: prod + ' ÷ ' + k + ' = ?', val: String(m) }],
        expl: prod + ' ÷ ' + k + ' = ' + m + ', себебі ' + k + ' × ' + m + ' = ' + prod + '.'
      };
    }
    return {
      stem: k + ' × ' + m + ' = ?',
      kind: 'input',
      ans: String(prod),
      fig: lvl === 1 ? { type: 'numline', k: k, times: m }
        : lvl === 2 ? { type: 'array', r: m, c: k } : null,
      hfig: lvl === 3 ? { type: 'array', r: m, c: k } : null,
      h1: k + ' санын ' + m + ' рет ал, немесе кестеден тап.',
      h2: k + ' × ' + m,
      expl: k + ' × ' + m + ' = ' + prod + '.' + (useReview ? ' (қайталау)' : '')
    };
  };

  /* ══ AR-15 · ⚡ Жылдамдық — practice, then the test ══════
   * Rocket Math splits the two: ORAL PRACTICE with a partner who corrects every
   * hesitation, and only then a 1-minute written test with no help at all. The
   * CPA levels carry that split:
   *   lvl 1  practice, untimed — a wrong answer triggers the correction
   *   lvl 2  practice, but a hesitation counts as an error too (automaticity)
   *   lvl 3  the timed test: no correction, no help — this is what the stage test runs
   * Correction = the partner's procedure: show the WHOLE fact, have it repeated
   * three times, then back up three problems and come again.
   * §5 forbids touching Core, so the speed bar cannot be stored; each test measures
   * the pupil's own input speed on the spot and asks for a share of it. */
  /* ══ ⚡ Жаттығу / Жылдамдық — the fact-fluency drill ════════════════════
   * Rocket Math's shape: practise with correction first, test for automaticity
   * after. What the first build got wrong was the SIZE of a level-3 item.
   *
   * It used to be a whole two-phase timed test (8 s copy + 12 s compute). But
   * core/runner.js draws TEN level-3 items for a stage test and needs 8 right,
   * and it wants 3 counted-correct in a row at level 3 before it even unlocks —
   * so clearing one ⚡ station meant thirteen back-to-back timed tests, about
   * five minutes of relentless typing, and nearly twenty minutes across the four
   * ⚡ stations. That is why it felt both hard and boring: the unit of work was
   * an exam, repeated thirteen times.
   *
   * Now ONE level-3 item is ONE FACT. The runner's ten draws then add up to a
   * ten-fact test rather than ten exams. It carried an 8-second clock at first;
   * that had to go, because the same item is what the PLACEMENT DIAGNOSTIC asks
   * and a generator cannot tell the two apart — see the note on the lvl-3 branch.
   * The fluency standard lives at lvl 2 (six seconds a fact, with a teaching
   * card and no placement consequences), which a child must clear to reach 3.
   *
   * Levels 1–2 are where the child actually spends time, so that is where the
   * engagement lives: a combo counter, a best-of-session line, the whole fact
   * flashed back on every correct answer, and a correction that costs ONE
   * retype rather than three (Rocket Math says three, but three SPOKEN takes
   * six seconds and three TYPED takes fifteen — the modality changes the cost).
   */
  G.speed = function (p, lvl) {
    /* Focus groups are built FROM this stage's tables, never filtered down to
     * them afterwards: a round drilling 2, 5, 10 must not be headed "× 6, 7". */
    var has = function (x) { return p.k.indexOf(x) >= 0; };
    var FOCUS = [];
    p.k.forEach(function (t) { FOCUS.push([t]); });
    for (var fi = 0; fi < p.k.length; fi++) {
      for (var fj = fi + 1; fj < p.k.length; fj++) FOCUS.push([p.k[fi], p.k[fj]]);
    }
    [[2, 5, 10], [2, 3, 4, 5], [6, 7, 8, 9]].forEach(function (g) {
      if (g.every(has) && g.length < p.k.length) FOCUS.push(g);
    });
    FOCUS.push(p.k.slice());
    var tables = pick(FOCUS);
    // Second axis, the way fact-fluency programmes split a table: the small
    // multipliers come automatic long before the big ones, so drill them apart.
    var SIZE = [{ m: [2, 10], n: '' }, { m: [2, 5], n: ' · кіші' }, { m: [6, 10], n: ' · үлкен' }];
    var sz = pick(SIZE);
    var fname = (tables.length === p.k.length ? 'барлық кесте'
      : tables.length === 1 ? tables[0] + ' кестесі' : tables.join(', ')) + sz.n;
    var OP = p.op === 'div' ? '÷' : '×';
    // A division drill is the same loop with the fact turned around: the pupil
    // retrieves 56 ÷ 7 from the 7-table they just made automatic.
    function fact() {
      var t = pick(tables), m = R(sz.m[0], sz.m[1]);
      return p.op === 'div' ? { a: t * m, b: t, v: m } : { a: t, b: m, v: t * m };
    }

    /* ── lvl 3 · ONE fact, no clock. Used by BOTH the stage test and the
     *    placement diagnostic — and that is exactly why it must not be timed.
     *
     * A generator is called as (params, lvl) and cannot tell which of the two is
     * asking. When this item carried an 8-second countdown, the diagnostic put a
     * stopwatch in front of a child who had seen no teaching card and no
     * explanation: the bar simply started draining. AR-07 is the THIRD probe for
     * every pupil under `placement:'climb'`, so one slow-but-correct answer there
     * closed the bracket and capped the whole placement. Measured on the real
     * runner: a pupil who genuinely knew through AR-16, but took longer than 8 s
     * on that unfamiliar screen, was placed at AR-07 — NINE stages too low, with
     * the test ending early so nothing later could rescue it.
     *
     * Automaticity has not been given up; it moved to where it belongs. Level 2
     * is the fluency gate — ten facts, six seconds each, at most two corrections,
     * with a teaching card, unlimited retries and no placement consequences — and
     * a child only reaches level 3 by clearing it. This level-3 item then
     * confirms the facts stick across a fresh draw, which is what the stage test
     * is for. That split is also closer to Rocket Math than the old one: their
     * hesitation rule lives in the partner practice, and the written test that
     * follows is a confirmation, not the place the standard is set. */
    if (lvl === 3) {
      var f3 = fact();
      return {
        stem: f3.a + ' ' + OP + ' ' + f3.b + ' = ?',
        kind: 'input',
        ans: String(f3.v),
        h1: 'Бұл кестені жаттығу деңгейінде уақытпен пысықтадың — мұнда есіңде қалғанын тексереміз.',
        h2: f3.a + ' ' + OP + ' ' + f3.b,
        expl: f3.a + ' ' + OP + ' ' + f3.b + ' = ' + f3.v +
          '. Жылдамдық 2-деңгейде өлшенді; бұл жерде дұрыстығы маңызды.'
      };
    }
    /* ── lvl 1–2 · the practice round, where the child spends their time ── */
    var LIMIT = lvl === 2 ? 6000 : 0;          // lvl 2: a hesitation is an error
    var ROUND = 10, ALLOW = lvl === 2 ? 2 : 3;
    return {
      stem: 'Жаттығу · ' + OP + ' ' + fname,
      kind: 'custom',
      ans: 'иә',
      ansHTML: '<b>раундты таза аяқтау</b>',
      h1: 'Қателессең — бүкіл мысал көрсетіледі, оны бір рет қайталайсың, сосын ол мысал ' +
        'раундтың ішінде тағы бір рет келеді.',
      h2: lvl === 2 ? 'Бұл деңгейде әр мысалға ' + (LIMIT / 1000) + ' секунд — қалған уақыт жолақпен көрінеді.' :
        'Бұл деңгейде уақыт шектелмейді — тек дұрыстығы маңызды.',
      expl: 'Раундта ' + ROUND + ' мысал. ' + ALLOW + ' түзетуден аспасаң — өттің. ' +
        'Түзету — жаза емес, есте сақтаудың жолы.',
      mount: function (el, submit) {
        var q = [], i = 0, fixes = 0, combo = 0, best = 0, cur = null,
          t0 = 0, mode = 'run', tmr = null, clk = null, over = false;
        for (var n = 0; n < ROUND; n++) q.push(fact());
        el.innerHTML =
          '<div style="display:flex;flex-direction:column;gap:9px;align-items:center">' +
          '<div class="sp-head note" style="font-weight:800;text-align:center"></div>' +
          '<div class="sp-combo" style="font-family:var(--disp);font-weight:700;min-height:1.6em"></div>' +
          '<div class="sp-q" style="font-family:var(--disp);font-size:2rem;font-weight:600"></div>' +
          '<div class="sp-row" style="display:flex;gap:8px;align-items:center">' +
          '<input class="big sp-in" inputmode="numeric" style="max-width:140px;text-align:center">' +
          '<button class="btn sp-ok" type="button">Қою</button></div>' +
          '<div class="sp-msg" style="min-height:1.5em;font-weight:800;text-align:center"></div>' +
          '<div class="sp-bar" style="width:100%;max-width:240px;height:8px;border-radius:5px;' +
          'background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:100%;' +
          'background:var(--accent);border-radius:5px"></i></div>' +
          '<button class="btn sp-go" type="button">Бастау</button></div>';
        var head = el.querySelector('.sp-head'), qEl = el.querySelector('.sp-q'),
          inp = el.querySelector('.sp-in'), bar = el.querySelector('.sp-bar i'),
          go = el.querySelector('.sp-go'), row = el.querySelector('.sp-row'),
          msg = el.querySelector('.sp-msg'), cb = el.querySelector('.sp-combo');
        row.style.display = 'none';
        function stop() {
          if (tmr) { clearTimeout(tmr); tmr = null; }
          if (clk) { clearInterval(clk); clk = null; }
        }
        function drawCombo() {
          cb.innerHTML = combo > 1
            ? '<span style="color:var(--gold);font-size:1.3rem">🔥 ' + combo + '</span>' +
              (best > combo ? '<span class="note" style="margin-left:10px">рекорд ' + best + '</span>' : '')
            : (best > 1 ? '<span class="note">рекорд: ' + best + '</span>' : '');
        }
        function show() {
          stop();
          drawCombo();
          if (mode === 'run') {
            head.textContent = 'Мысал ' + Math.min(i + 1, ROUND) + ' / ' + ROUND +
              (fixes ? ' · түзету: ' + fixes : '');
            qEl.textContent = cur.a + ' ' + OP + ' ' + cur.b + ' = ?';
          } else {
            head.innerHTML = '<span style="color:var(--bad)">Қайтала: ' +
              cur.a + ' ' + OP + ' ' + cur.b + ' = ' + cur.v + '</span>';
            qEl.textContent = cur.a + ' ' + OP + ' ' + cur.b + ' = ' + cur.v;
          }
          inp.value = ''; inp.focus(); t0 = Date.now();
          if (mode === 'run' && LIMIT) {
            bar.style.background = 'var(--gold)';
            clk = setInterval(function () {
              bar.style.width = Math.max(0, (LIMIT - (Date.now() - t0)) / LIMIT * 100) + '%';
            }, 80);
            tmr = setTimeout(function () { miss('slow'); }, LIMIT);
          } else {
            bar.style.background = 'var(--accent)';
            bar.style.width = Math.min(100, i / ROUND * 100) + '%';
          }
        }
        function nextFact() {
          if (i >= ROUND) return finish();
          cur = q[i]; mode = 'run'; show();
        }
        function miss(why, typed) {
          stop();
          fixes++; combo = 0; mode = 'fix';
          // Never let a correct-but-slow answer look like a wrong one.
          if (why === 'slow') {
            msg.textContent = 'Уақыт бітті — жауабың дұрыс болса да, мақсат ойланбай айту.';
            msg.style.color = 'var(--gold)';
          } else {
            msg.textContent = 'Сенің жауабың: ' + typed + '. Дұрысы: ' + cur.v + '.';
            msg.style.color = 'var(--bad)';
          }
          show();
        }
        function finish() {
          if (over) return;
          over = true; stop();
          row.style.display = 'none'; qEl.textContent = ''; cb.innerHTML = '';
          var ok = fixes <= ALLOW;
          bar.style.background = ok ? 'var(--good)' : 'var(--bad)';
          bar.style.width = '100%';
          head.innerHTML = 'Раунд бітті · түзету: <b>' + fixes + '</b> (рұқсат: ' + ALLOW + ')' +
            ' · ең ұзын тізбек: <b>' + best + '</b>';
          msg.textContent = ok ? 'Өттің ✓'
            : (LIMIT ? 'Жауаптарың дұрыс болса да, ' + (LIMIT / 1000) +
              ' секундтан ұзаққа созылды. Тағы бір раунд жаса.' : 'Тағы бір раунд жаса.');
          msg.style.color = ok ? 'var(--good)' : 'var(--bad)';
          go.textContent = 'Қайта бастау'; go.style.display = '';
          submit(ok ? 'иә' : 'жоқ');
        }
        function answer() {
          if (!cur || over) return;
          var v = parseInt(inp.value, 10);
          if (isNaN(v)) { msg.textContent = 'Сан жаз.'; msg.style.color = 'var(--muted)'; return; }
          if (mode === 'fix') {
            if (v !== cur.v) {
              msg.textContent = 'Қайталауда дәл ' + cur.v + ' деп жаз.';
              msg.style.color = 'var(--bad)';
              inp.value = ''; inp.focus();
              return;
            }
            /* One retype, then the fact comes back INSIDE the round instead of
             * rewinding the counter three places. Same intent as Rocket Math's
             * "back up three" — meet the fact again soon — but the round stays
             * exactly ROUND long, so a shaky child cannot make it balloon. */
            msg.textContent = '';
            if (q.length < ROUND + 4) q.splice(Math.min(i + 3, q.length), 0, cur);
            i++;
            if (fixes > ALLOW + 1) return finish();
            nextFact(); return;
          }
          stop();
          if (v === cur.v) {
            combo++; if (combo > best) best = combo;
            // flash the WHOLE fact back: feedback and one more correct exposure
            msg.innerHTML = '<span style="color:var(--good)">' + cur.a + ' ' + OP + ' ' +
              cur.b + ' = ' + cur.v + ' ✓</span>';
            msg.style.color = 'var(--good)';
            i++; nextFact();
          } else miss('wrong', v);
        }
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') answer(); });
        el.querySelector('.sp-ok').addEventListener('click', answer);
        go.addEventListener('click', function () {
          /* A failed round ends with finish() → over = true and shows this button as «Қайта бастау». It used to
             return right here, so the button was dead: the runner had just granted the free second try and was
             waiting for a new submit that could never come — the only ways out were ✕ or burning all five hints.
             Once the runner closes the question it disables every button inside the widget, so a restart after
             the final verdict is still impossible. */
          over = false;
          q = []; for (var n2 = 0; n2 < ROUND; n2++) q.push(fact());
          i = 0; fixes = 0; combo = 0; msg.textContent = '';
          row.style.display = ''; go.style.display = 'none';
          nextFact();
        });
      }
    };
  };

  /* ══ AR-05 · Тең бөлу · екі мағына ═════════════════════ */
  G.share = function (p, lvl) {
    var per = lvl === 1 ? R(2, 5) : R(2, 9);
    var g = lvl === 1 ? R(2, 4) : R(2, 9);
    var tot = per * g, th = pick(THING);
    var quot = Math.random() < 0.5;                    // quotative vs partitive
    if (lvl === 3 && Math.random() < 0.35) {           // the discrimination item
      var stem = quot
        ? tot + ' ' + th.acc + ' ' + per + '-ден ' + th.boxDat + ' салды. Не ізделеді?'
        : tot + ' ' + th.acc + ' ' + g + ' балаға тең бөлді. Не ізделеді?';
      return {
        stem: stem,
        kind: 'choice',
        choices: ['Неше топ', 'Әр топта нешеден'],
        ans: quot ? 'Неше топ' : 'Әр топта нешеден',
        h1: 'Берілгені не: топтың саны ма, әр топтағы сан ба?',
        h2: quot ? 'Әр топтағы сан белгілі → топ санын іздейміз'
          : 'Топ саны белгілі → әр топтағы санды іздейміз',
        expl: quot
          ? 'Әр ' + th.boxLoc + ' ' + per + ' екені белгілі, сондықтан неше ' + th.box + ' екенін іздейміз: ' + tot + ' ÷ ' + per + ' = ' + g + '.'
          : g + ' бала екені белгілі, сондықтан әр балаға нешеден екенін іздейміз: ' + tot + ' ÷ ' + g + ' = ' + per + '.'
      };
    }
    var d = quot ? per : g, a = quot ? g : per;
    return {
      stem: lvl === 3
        ? (quot ? tot + ' ' + th.acc + ' ' + per + '-ден ' + th.boxDat + ' салды. Неше ' + th.box + ' керек?'
          : tot + ' ' + th.acc + ' ' + g + ' балаға тең бөлді. Әр балаға нешеден?')
        : tot + ' ÷ ' + d + ' = ?',
      kind: 'input',
      ans: String(a),
      fig: lvl === 1 ? { type: 'groups', g: g, n: per }
        : lvl === 2 ? (quot ? { type: 'numline', k: per, times: g } : { type: 'rembar', total: tot, per: per, groups: g, rem: 0 }) : null,
      hfig: lvl === 3 ? { type: 'groups', g: g, n: per } : null,
      h1: quot ? 'Ішінде ' + per + '-тен неше рет бар екенін тап.'
        : 'Барлығын ' + g + ' топқа тең үлестір.',
      h2: tot + ' ÷ ' + d,
      steps: [{ label: 'Бөл', expr: tot + ' ÷ ' + d + ' = ?', val: String(a) }],
      expl: tot + ' ÷ ' + d + ' = ' + a + ', себебі ' + d + ' × ' + a + ' = ' + tot + '.'
    };
  };

  /* ══ Бөлу кестесі — grouped and cumulative, like the × tables ══
   * params: { k:[divisors], review:[divisors already passed] }
   * Division facts are retrieved from the multiplication table the pupil has
   * just made automatic, so the divisor groups mirror the × groups. */
  G.divfact = function (p, lvl) {
    var pool = p.k, rev = p.review || [];
    var useReview = rev.length && lvl > 1 && Math.random() < 0.3;
    var b = useReview ? pick(rev) : pick(pool);
    var q = lvl === 1 ? R(2, 5) : R(2, 10);
    var a = b * q;
    if (lvl === 2) {
      // the fact family: one array, four equations
      return {
        stem: b + ' × ' + q + ' = ' + a + ' болса, ' + a + ' ÷ ' + b + ' = ?',
        kind: 'choice',
        choices: opts(q, near(q, 3)),
        ans: String(q),
        fig: { type: 'array', r: q, c: b },
        h1: 'Үш саннан төрт теңдік құрылады: екі көбейту, екі бөлу.',
        h2: b + ' × ' + q + ' = ' + a + '  →  ' + a + ' ÷ ' + b + ' = ' + q,
        expl: b + ' × ' + q + ' = ' + a + ', сондықтан ' + a + ' ÷ ' + b + ' = ' + q +
          '. Көбейту мен бөлу — өзара кері амалдар.'
      };
    }
    return {
      stem: a + ' ÷ ' + b + ' = ?',
      kind: 'input',
      ans: String(q),
      fig: lvl === 1 ? { type: 'array', r: q, c: b } : null,
      hfig: lvl === 3 ? { type: 'array', r: q, c: b } : null,
      h1: 'Кері амалды ойла: ' + b + ' нешеге көбейткенде ' + a + ' болады?',
      h2: b + ' × ? = ' + a,
      steps: [{ label: 'Кері амал', expr: b + ' × ? = ' + a, val: String(q) }],
      expl: a + ' ÷ ' + b + ' = ' + q + ', себебі ' + b + ' × ' + q + ' = ' + a + '.' +
        (useReview ? ' (қайталау)' : '')
    };
  };

  /* ══ AR-08 · Үлестірімділік (үлестірімділік) ════════ */
  G.distrib = function (p, lvl) {
    var a = R(p.a[0], p.a[1]);
    // lvl 3 reaches past the table so the stage test can draw 10 distinct items
    var b = lvl === 3 ? R(p.b[0], p.b[1] + 4) : R(p.b[0], p.b[1]);
    var s1 = 5, s2 = b - 5;                            // split the second factor at 5
    if (s2 < 1) { s1 = Math.max(1, b - 1); s2 = b - s1; }
    if (lvl === 1 || lvl === 2) {
      // Asks for the missing piece of the split — scalar, and it tests the split
      // itself rather than recognising a well-formed expression.
      return {
        stem: a + ' × ' + b + ' = ' + a + ' × ' + s1 + ' + ' + a + ' × ?',
        kind: 'choice',
        choices: opts(s2, near(s2, 3)),
        ans: String(s2),
        fig: lvl === 1 ? { type: 'array', r: a, c: b, split: s1 }
          : { type: 'area', rows: [a], cols: [s1, s2] },
        h1: 'Қиын көбейткішті екі оңайға бөл: ' + b + ' = ' + s1 + ' + ?',
        h2: b + ' − ' + s1 + ' = ' + s2,
        expl: a + ' × ' + b + ' = ' + a + ' × ' + s1 + ' + ' + a + ' × ' + s2 +
          ' = ' + a * s1 + ' + ' + a * s2 + ' = ' + a * b + '.'
      };
    }
    return {
      stem: a + ' × ' + b + ' = ?',
      kind: 'input',
      ans: String(a * b),
      hfig: { type: 'area', rows: [a], cols: [s1, s2] },
      h1: b + ' санын ' + s1 + ' пен ' + s2 + '-ге бөліп есепте.',
      h2: a + ' × ' + s1 + ' + ' + a + ' × ' + s2,
      steps: [
        { label: 'Бірінші бөлік', expr: a + ' × ' + s1 + ' = ?', val: String(a * s1) },
        { label: 'Екінші бөлік', expr: a + ' × ' + s2 + ' = ?', val: String(a * s2) },
        { label: 'Қос', expr: a * s1 + ' + ' + a * s2 + ' = ?', val: String(a * b) }
      ],
      expl: a + ' × ' + b + ' = ' + a * s1 + ' + ' + a * s2 + ' = ' + a * b + '.'
    };
  };

  /* ══ AR-09 · Қалдықпен бөлу ════════════════════════════ */
  G.remainder = function (p, lvl) {
    var d = R(p.d[0], p.d[1]);
    var tot = lvl === 1 ? R(d + 1, d * 5) : R(p.tot[0], p.tot[1]);
    var q = Math.floor(tot / d), r = tot % d;
    if (r === 0) { tot += 1; q = Math.floor(tot / d); r = tot % d; }
    var th = pick(THING);
    if (lvl === 3 && Math.random() < 0.4) {            // interpreting the remainder
      var need = q + (r > 0 ? 1 : 0);
      return {
        stem: tot + ' ' + th.acc + ' ' + d + '-тен ' + th.boxDat + ' салады. Барлығына неше ' +
          th.box + ' керек?',
        kind: 'input',
        ans: String(need),
        hfig: { type: 'rembar', total: tot, per: d, groups: q, rem: r },
        h1: 'Қалдық та бір ' + th.box + ' талап етеді.',
        h2: tot + ' ÷ ' + d + ' = ' + q + ' (қалдық ' + r + ')',
        expl: tot + ' ÷ ' + d + ' = ' + q + ' қалдық ' + r + '. Қалған ' + r + ' ' + th.one +
          ' үшін тағы бір ' + th.box + ' керек: ' + need + '.'
      };
    }
    // Ask for ONE of the two numbers (see the note on compound answers above).
    var askRem = Math.random() < 0.5;
    return {
      stem: askRem ? tot + ' ÷ ' + d + ' — қалдықты тап.'
        : tot + ' ÷ ' + d + ' — бөліндіні тап.',
      kind: 'input',
      ans: String(askRem ? r : q),
      ansHTML: '<b>' + (askRem ? r : q) + '</b>  <span class="note">(' + tot + ' ÷ ' + d +
        ' = ' + q + ' қалдық ' + r + ')</span>',
      fig: lvl === 1 ? { type: 'groups', g: q, n: d, left: r }
        : lvl === 2 ? { type: 'rembar', total: tot, per: d, groups: q, rem: r } : null,
      hfig: lvl === 3 ? { type: 'rembar', total: tot, per: d, groups: q, rem: r } : null,
      h1: d + '-тен неше рет алуға болады? Артылғаны — қалдық.',
      h2: d + ' × ' + q + ' = ' + d * q + ', ' + tot + ' − ' + d * q + ' = ' + r,
      steps: askRem
        ? [{ label: 'Толық топ саны', expr: tot + ' ÷ ' + d + ' (толық)', val: String(q) },
        { label: 'Қалдық', expr: tot + ' − ' + d + ' × ' + q + ' = ?', val: String(r) }]
        : [{ label: 'Ең үлкен көбейтінді', expr: d + ' × ? ≤ ' + tot, val: String(q) }],
      expl: tot + ' ÷ ' + d + ' = ' + q + ' қалдық ' + r + '. Қалдық әрқашан бөлгіштен кіші (' +
        r + ' < ' + d + ').'
    };
  };


  root.GENERATORS = Object.assign(root.GENERATORS || {}, G);
  root.AR_UTIL = { R: R, pick: pick, num: num, THING: THING, opts: opts, near: near };
})(typeof window !== 'undefined' ? window : this);
