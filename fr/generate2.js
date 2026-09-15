/* fr/generate2.js — FR generators, part 2: the tracks added on top of the
 * original seven stations.  Loads after generate.js and merges into the same
 * GENERATORS object.  Owner: assistant (fractions author).
 *
 * GENERATORS[type](params, lvl) → question, exactly as core/runner.js documents.
 * lvl 1 concrete (a drawing to read), 2 pictorial (the drawing moves into the
 * hint), 3 abstract (typed answer).  Every number comes from FR_UTIL so the
 * station's difficulty class is enforced in one place and _selfcheck.js can
 * assert it; nothing here invents its own arithmetic.
 *
 * Two rules that are specific to fractions and easy to get wrong:
 *
 * 1. CHOICES MUST BE DISTINCT BY VALUE, NOT BY STRING.  runner.js marks every
 *    option Core.isCorrect accepts: `if(Core.isCorrect(q,b.dataset.v)) add('ok')`.
 *    Core compares fractions by value, so offering 2/4 next to the answer 1/2
 *    lights up two buttons green at once.  The live fracChoices() dedupes by
 *    string and would happily do this.  choices4() below dedupes by value.
 *
 * 2. A STATION ABOUT FORM NEEDS q.form.  For "қысқарт" the answer 3/4 and the
 *    offering 6/8 are the same value and different answers; without
 *    owner-patch/core.js.patch core accepts both and the station is decorative.
 *    Those generators set q.form and lose nothing if the patch is not applied
 *    yet — the question is still correct, just too lenient.
 */
'use strict';
(function () {
  var U = (typeof FR_UTIL !== 'undefined' && FR_UTIL) || (typeof window !== 'undefined' && window.FR_UTIL);
  if (!U) throw new Error('fr/generate2.js: FR_UTIL missing — load generate.js first');
  if (typeof GENERATORS === 'undefined') throw new Error('fr/generate2.js: load after generate.js');

  var rnd = U.rnd, pick = U.pick;
  var F = function (n, d) { return n + '/' + d; };
  var M = function (w, n, d) { return w + ' ' + n + '/' + d; };
  var shuf = function (a) { return a.slice().sort(function () { return Math.random() - 0.5; }); };

  /* One implementation of value-distinct choices, in FR_UTIL — see rule 1 above. */
  var choices4 = U.choices;

  var fc = function (n, d) { return { v: F(n, d), h: fracHTML(n, d) }; };
  var mc = function (w, n, d) { return { v: M(w, n, d), h: mixedHTML(w, n, d) }; };
  var nc = function (x) { return { v: String(x), h: String(x) }; };
  /* an answer that may or may not have a whole part */
  function ansOf(w, n, d) { return w ? (n ? M(w, n, d) : String(w)) : F(n, d); }
  function ansHTMLOf(w, n, d) { return w ? (n ? mixedHTML(w, n, d) : String(w)) : fracHTML(n, d); }

  var G = {

    /* ── FR-08 Үлес пен тең бөлік ──────────────────────────────
       Before a fraction can be read, "one of d EQUAL parts" has to mean
       something.  lvl 1 names the unit fraction off a drawing, lvl 2 counts the
       parts, lvl 3 does it in words with no drawing at all. */
    part: function (p, lvl) {
      var it = U.pickRead({ d: lvl === 1 ? [2, 5] : p.d, kinds: ['proper'] }), d = it.d;
      var q = { h1: 'Бөлім — фигура неше ТЕҢ бөлікке бөлінгенін көрсетеді. Бір бөлік — сол бөлшектің үлесі.' };
      if (lvl === 1) {
        q.stem = 'Бір боялған бөлікті қалай атаймыз?';
        q.fig = pick([{ type: 'pie', d: d, n: 1 }, { type: 'bar', d: d, n: 1 }]);
        q.ans = F(1, d); q.ansHTML = fracHTML(1, d);
        q.steps = [{ label: 'Барлық тең бөлік', expr: 'фигурадағы бөліктер', val: String(d) }, { label: 'Алынған бөлік', expr: 'бір бөлік', val: '1' }];
        q.expl = 'Фигура ' + d + ' тең бөлікке бөлінген, біреуі алынған → 1/' + d + '.';
        Object.assign(q, choices4(fc(1, d), [fc(1, d + 1), fc(1, Math.max(2, d - 1)), fc(d, 1), fc(d - 1, d)]));
      } else if (lvl === 2) {
        q.stem = 'Фигура неше тең бөлікке бөлінген?';
        q.fig = { type: 'grid', d: d, n: 0 }; q.ans = String(d);
        q.steps = [{ label: 'Бөлік саны', expr: 'бәрін сана', val: String(d) }];
        q.expl = d + ' тең бөлік бар, демек әр бөлік — 1/' + d + '.';
        Object.assign(q, choices4(nc(d), [nc(d + 1), nc(Math.max(2, d - 1)), nc(d * 2)]));
      } else {
        /* The object varies as well as the denominator: with one noun and d in
           2…8 this station can only make seven distinct stems, and startTest
           then hands the child a seven-question test instead of ten. */
        q.stem = pick(['Нан', 'Пицца', 'Торт', 'Таспа', 'Шоколад']) + ' ' + d + ' теңдей бөлікке бөлінді. Бір бөлікті бөлшекпен жаз (мысалы 1/5).';
        q.kind = 'input'; q.ans = F(1, d); q.hfig = { type: 'bar', d: d, n: 1 };
        q.steps = [{ label: 'Бөлімі', expr: 'теңдей бөлік саны', val: String(d) }, { label: 'Алымы', expr: 'алынған бөлік', val: '1' }];
        q.expl = d + ' теңдей бөліктің біреуі — 1/' + d + '.';
      }
      return q;
    },

    /* ── FR-18 Бөлгіштер жұбы ──────────────────────────────────
       Dr Don's rule: walk 1, 2, 3 … and write the pair, so nothing is missed.
       This is the tool the reducing track runs on, which is why it sits before
       it and not after — the same reason Үлестірімділік precedes ×6–9 in AR. */
    factors: function (p, lvl) {
      var it = U.pickFactors({ n: lvl === 1 ? [12, 30] : p.n }), n = it.n, pairs = it.pairs;
      var all = U.divisors(n);
      var q = { h1: '1-ден бастап реттеп тексер: 1, 2, 3 … Әрқайсысына жұбын жаз, сонда бірде-бірі қалып қоймайды.',
        expl: n + ' санының бөлгіштері: ' + all.join(', ') + '. Жұптары: ' + pairs.map(function (x) { return x[0] + ' · ' + x[1]; }).join(', ') + '.' };
      if (lvl < 3) {
        var miss = pick(all.filter(function (x) { return x !== 1 && x !== n; })) || 1;
        q.stem = n + ' саны ' + miss + '-ге бөліне ме? Бөлінсе, жұбы қанша?';
        q.exprHTML = n + ' = ' + miss + ' · <span class="q">?</span>'; q.ans = String(n / miss);
        q.steps = [{ label: 'Жұбы', expr: n + ' : ' + miss, val: String(n / miss) }];
        if (lvl === 1) q.fig = { type: 'grid', d: n, n: n / miss };
        Object.assign(q, choices4(nc(n / miss), [nc(n / miss + 1), nc(Math.max(1, n / miss - 1)), nc(miss)]));
      } else {
        q.stem = n + ' санының БАРЛЫҚ бөлгішін кішісінен бастап жаз (үтірмен бөліп: 1, 2, …).';
        q.kind = 'input'; q.ans = all.join(', ');
        q.steps = [{ label: 'Бөлгіштер', expr: '1-ден реттеп', val: all.join(', ') }];
      }
      return q;
    },

    /* ── FR-19 Жай және құрама сан ─────────────────────────────── */
    prime: function (p, lvl) {
      var it = U.pickPrime({ n: lvl === 1 ? [2, 20] : p.n }), n = it.n;
      var ds = U.divisors(n);
      var q = { stem: n + ' — жай сан ба, әлде құрама сан ба?', ans: it.prime ? 'жай' : 'құрама', kind: 'choice',
        choices: ['жай', 'құрама'], choiceHTML: ['Жай сан', 'Құрама сан'],
        h1: 'Жай санның бөлгіші тек екеу: 1 және өзі. Одан басқа бөлгіші табылса — құрама.',
        h2: n + '-ді 2, 3, 5, 7-ге бөліп көр.',
        steps: [{ label: 'Бөлгіштері', expr: 'бәрін тап', val: ds.join(', ') }],
        expl: n + ' санының бөлгіштері: ' + ds.join(', ') + ' — ' + (it.prime ? 'тек 1 мен өзі, демек ЖАЙ сан.' : 'екеуден көп, демек ҚҰРАМА сан.') };
      if (lvl === 1) q.fig = { type: 'grid', d: n, n: 0 };
      if (lvl === 3) { q.stem = n + ' саны неше бөлгішке ие? (жауап — сан)'; q.kind = 'input'; q.ans = String(ds.length); q.choices = []; }
      return q;
    },

    /* ── FR-20 ⚡ ЕҮОБ пен ЕКОЕ ─────────────────────────────────
       Reducing needs the greatest common factor and the common denominator
       needs the least common multiple; both have to be instant, or the real
       work of FR-21…FR-33 is spent on them instead. */
    gcf_lcm: function (p, lvl) {
      var it = U.pickGcfLcm({ a: lvl === 1 ? [2, 8] : p.a, b: lvl === 1 ? [2, 8] : p.b });
      var wantG = Math.random() < 0.5, ans = wantG ? it.gcf : it.lcm;
      var q = { stem: wantG ? ('ЕҮОБ (' + it.a + '; ' + it.b + ') — ең үлкен ортақ бөлгіш?') : ('ЕКОЕ (' + it.a + '; ' + it.b + ') — ең кіші ортақ еселік?'),
        ans: String(ans),
        h1: wantG ? 'Екеуінің де бөлгіштерін жаз, ортақтарының ең үлкенін ал.' : 'Үлкенінің еселіктерін жаз: ' + it.b + ', ' + 2 * it.b + ', ' + 3 * it.b + ' … қайсысы ' + it.a + '-ге де бөлінеді?',
        steps: [{ label: it.a + ' бөлгіштері', expr: '', val: U.divisors(it.a).join(', ') }, { label: it.b + ' бөлгіштері', expr: '', val: U.divisors(it.b).join(', ') }, { label: wantG ? 'ЕҮОБ' : 'ЕКОЕ', expr: '', val: String(ans) }],
        expl: 'ЕҮОБ(' + it.a + '; ' + it.b + ') = ' + it.gcf + ', ЕКОЕ(' + it.a + '; ' + it.b + ') = ' + it.lcm + '. Тексеру: ' + it.gcf + ' · ' + it.lcm + ' = ' + it.a + ' · ' + it.b + '.' };
      if (lvl < 3) Object.assign(q, choices4(nc(ans), [nc(wantG ? it.lcm : it.gcf), nc(it.a), nc(it.b), nc(ans + 1)]));
      else q.kind = 'input';
      return q;
    },

    /* ── FR-27…29 Ортақ бөлімге келтіру ────────────────────────
       Three stations, three classes, one new difficulty each: one denominator
       is already a multiple of the other → they share nothing → they share
       something but neither divides the other (the only case that needs ЕКОЕ). */
    lcd: function (p, lvl) {
      var it = U.pickLcd({ kind: p.kind, d: lvl === 1 ? [2, 8] : p.d }), L = it.lcd;
      var why = it.kind === 'multiple' ? (Math.max(it.d1, it.d2) + ' өзі ' + Math.min(it.d1, it.d2) + '-ге бөлінеді, сондықтан ортақ бөлім — сол.')
        : it.kind === 'coprime' ? (it.d1 + ' мен ' + it.d2 + '-нің ортақ бөлгіші жоқ, сондықтан көбейтіндісін аламыз: ' + it.d1 + ' · ' + it.d2 + ' = ' + L + '.')
          : ('Көбейтінді ' + it.d1 * it.d2 + ' де жарайды, бірақ ең кішісі — ЕКОЕ(' + it.d1 + '; ' + it.d2 + ') = ' + L + '.');
      var q = { stem: it.d1 + ' пен ' + it.d2 + ' үшін ең кіші ортақ бөлімді тап.',
        exprHTML: fracHTML('?', it.d1) + '<span>,</span>' + fracHTML('?', it.d2), ans: String(L),
        h1: 'Ортақ бөлім — екі бөлімге де бөлінетін сан. Ең кішісін іздейміз.',
        h2: Math.max(it.d1, it.d2) + ' еселіктері: ' + [1, 2, 3, 4].map(function (k) { return k * Math.max(it.d1, it.d2); }).join(', ') + ' …',
        steps: [{ label: 'ЕКОБ', expr: 'екеуіне де бөлінетін ең кіші сан', val: String(L) }], expl: why };
      if (lvl === 1) q.fig = { type: 'twobars', d1: it.d1, n1: 1, d2: it.d2, n2: 1, label1: '1/' + it.d1, label2: '1/' + it.d2 };
      else if (lvl === 2) q.hfig = { type: 'twobars', d1: L, n1: L / it.d1, d2: L, n2: L / it.d2 };
      if (lvl < 3) Object.assign(q, choices4(nc(L), [nc(it.d1 * it.d2), nc(it.d1 + it.d2), nc(Math.max(it.d1, it.d2)), nc(L * 2)]));
      else q.kind = 'input';
      return q;
    },

    /* ── FR-31…33 Әртүрлі бөлімдерді қосу/азайту ──────────────── */
    addsub_d: function (p, lvl) {
      var it = U.pickDiffDen({ op: p.op, kind: p.kind, d: lvl === 1 ? [2, 8] : p.d });
      var op = it.op === '+' ? '+' : '−', L = it.lcd;
      var ans = ansOf(it.ansW, it.ansN, it.ansD);
      var q = { stem: it.op === '+' ? 'Қосындыны тап.' : 'Айырманы тап.',
        exprHTML: fracHTML(it.n1, it.d1) + '<span>' + op + '</span>' + fracHTML(it.n2, it.d2) + '<span>=</span><span class="q">?</span>',
        ans: ans, ansHTML: ansHTMLOf(it.ansW, it.ansN, it.ansD), form: it.form,
        h1: 'Бөлімдері әртүрлі — алдымен ортақ бөлімге келтір.',
        h2: 'Ортақ бөлім: ' + L + '.',
        steps: [{ label: 'Ортақ бөлім', expr: it.d1 + ' және ' + it.d2, val: String(L) },
          { label: 'Бірінші бөлшек', expr: it.n1 + '/' + it.d1 + ' → ?/' + L, val: it.a + '/' + L },
          { label: 'Екінші бөлшек', expr: it.n2 + '/' + it.d2 + ' → ?/' + L, val: it.b + '/' + L },
          { label: 'Алымдары', expr: it.a + ' ' + op + ' ' + it.b, val: String(it.sumN) }],
        expl: it.n1 + '/' + it.d1 + ' ' + op + ' ' + it.n2 + '/' + it.d2 + ' = ' + it.a + '/' + L + ' ' + op + ' ' + it.b + '/' + L + ' = ' + it.sumN + '/' + L + (ans !== F(it.sumN, L) ? ' = ' + ans : '') + '.' };
      if (lvl === 1) q.fig = { type: 'twobars', d1: it.d1, n1: it.n1, d2: it.d2, n2: it.n2, label1: it.n1 + '/' + it.d1, label2: it.n2 + '/' + it.d2 };
      else if (lvl === 2) q.hfig = { type: 'twobars', d1: L, n1: it.a, d2: L, n2: it.b };
      if (lvl < 3) Object.assign(q, choices4({ v: ans, h: q.ansHTML },
        [fc(it.n1 + (it.op === '+' ? it.n2 : -it.n2), it.d1 + (it.op === '+' ? it.d2 : 0)),   /* the classic error: add the denominators too */
          fc(it.sumN, L), fc(it.a, L), fc(it.sumN + 1, L)]));
      else q.kind = 'input';
      return q;
    },

    /* ── FR-34…37 Аралас сандармен амалдар ─────────────────────
       carry (FR-35) and borrow (FR-37) are each a station of their own; the
       station before it is guaranteed free of them, so a child who fails 37 has
       failed borrowing and nothing else. */
    mixed_ar: function (p, lvl) {
      var it = U.pickMixed({ op: p.op, carry: p.carry, borrow: p.borrow, d: lvl === 1 ? [3, 6] : p.d });
      var op = it.op === '+' ? '+' : '−';
      var ans = ansOf(it.ansW, it.ansN, it.ansD);
      var carry = it.op === '+' && it.n1 + it.n2 >= it.d, borrow = it.op === '-' && it.n1 < it.n2;
      var q = { stem: it.op === '+' ? 'Аралас сандарды қос.' : 'Аралас сандарды азайт.',
        exprHTML: mixedHTML(it.w1, it.n1, it.d) + '<span>' + op + '</span>' + mixedHTML(it.w2, it.n2, it.d) + '<span>=</span><span class="q">?</span>',
        ans: ans, ansHTML: ansHTMLOf(it.ansW, it.ansN, it.ansD), form: it.form,
        h1: 'Бүтіндерін бөлек, бөлшек бөліктерін бөлек ' + (it.op === '+' ? 'қос' : 'азайт') + '.',
        h2: carry ? ('Бөлшек бөліктерінің қосындысы ' + (it.n1 + it.n2) + '/' + it.d + ' — бұл бүтіннен үлкен, бір бүтінді бөліп ал.')
          : borrow ? (it.n1 + '/' + it.d + ' кіші, ' + it.n2 + '/' + it.d + '-ны одан алу мүмкін емес: бір бүтінді ' + it.d + '/' + it.d + ' етіп бөлшекте.')
            : 'Мұнда бүтінге көшудің қажеті жоқ.',
        steps: [{ label: 'Бүтіндері', expr: it.w1 + ' ' + op + ' ' + it.w2, val: String(it.op === '+' ? it.w1 + it.w2 : it.w1 - it.w2) },
          { label: 'Бөлшектері', expr: it.n1 + '/' + it.d + ' ' + op + ' ' + it.n2 + '/' + it.d, val: (it.op === '+' ? it.n1 + it.n2 : it.n1 - it.n2 + (borrow ? it.d : 0)) + '/' + it.d },
          { label: 'Жауабы', expr: carry ? 'бір бүтінді қос' : borrow ? 'бір бүтінді бөлшектеп ал' : 'біріктір', val: ans }],
        expl: it.w1 + ' ' + it.n1 + '/' + it.d + ' ' + op + ' ' + it.w2 + ' ' + it.n2 + '/' + it.d + ' = ' + ans + '.' };
      if (lvl === 1) q.fig = { type: 'circles', whole: it.w1, rem: it.n1, d: it.d };
      else if (lvl === 2) q.hfig = { type: 'twobars', d1: it.d, n1: it.n1, d2: it.d, n2: it.n2 };
      if (lvl < 3) {
        var wrongW = it.op === '+' ? it.w1 + it.w2 : it.w1 - it.w2;      /* forgot to carry / borrow */
        Object.assign(q, choices4({ v: ans, h: q.ansHTML },
          [mc(wrongW, Math.abs(it.n1 - it.n2) || 1, it.d), mc(it.ansW + 1, it.ansN || 1, it.ansD || it.d), mc(Math.max(0, it.ansW - 1), it.ansN || 1, it.ansD || it.d), fc(it.n1 + it.n2, it.d)]));
      } else q.kind = 'input';
      return q;
    },

    /* ── FR-44…47 Көбейту ──────────────────────────────────────
       The area model is the only picture that actually shows why the
       denominators multiply: cut the square one way for one fraction, the other
       way for the other, and the overlap is the answer. */
    mul: function (p, lvl) {
      var it = U.pickMul({ mode: p.mode, reduce: p.reduce });
      var q = { form: it.form };
      if (it.mode === 'by_int') {
        var ans = ansOf(it.ansW, it.ansN, it.ansD);
        q.stem = 'Көбейтіндіні тап.';
        q.exprHTML = fracHTML(it.n, it.d) + '<span>·</span>' + it.k + '<span>=</span><span class="q">?</span>';
        q.ans = ans; q.ansHTML = ansHTMLOf(it.ansW, it.ansN, it.ansD);
        q.h1 = 'Бөлшекті санға көбейту — сол бөлшекті ' + it.k + ' рет қосу деген сөз.';
        q.h2 = it.n + '/' + it.d + ' · ' + it.k + ' = (' + it.n + ' · ' + it.k + ')/' + it.d;
        q.steps = [{ label: 'Алымы', expr: it.n + ' · ' + it.k, val: String(it.n * it.k) }, { label: 'Жауабы', expr: it.n * it.k + '/' + it.d, val: ans }];
        q.expl = it.n + '/' + it.d + ' · ' + it.k + ' = ' + it.n * it.k + '/' + it.d + (ans !== F(it.n * it.k, it.d) ? ' = ' + ans : '') + '.';
        if (lvl === 1) q.fig = { type: 'circles', whole: 0, rem: it.n, d: it.d };
        if (lvl < 3) Object.assign(q, choices4({ v: ans, h: q.ansHTML }, [fc(it.n * it.k, it.d * it.k), fc(it.n, it.d * it.k), fc(it.n + it.k, it.d)]));
        else q.kind = 'input';
        return q;
      }
      if (it.mode === 'mixed') {
        var a2 = ansOf(it.ansW, it.ansN, it.ansD), top = it.w * it.d + it.n;
        q.stem = 'Аралас санды көбейт.';
        q.exprHTML = mixedHTML(it.w, it.n, it.d) + '<span>·</span>' + fracHTML(it.n2, it.d2) + '<span>=</span><span class="q">?</span>';
        q.ans = a2; q.ansHTML = ansHTMLOf(it.ansW, it.ansN, it.ansD);
        q.h1 = 'Аралас санды алдымен бұрыс бөлшекке айналдыр, сонан соң көбейт.';
        q.h2 = '(' + it.w + ' · ' + it.d + ') + ' + it.n + ' = ' + top + ', демек ' + top + '/' + it.d + '.';
        q.steps = [{ label: 'Бұрыс бөлшек', expr: '(' + it.w + ' · ' + it.d + ') + ' + it.n, val: top + '/' + it.d },
          { label: 'Көбейт', expr: top + '/' + it.d + ' · ' + it.n2 + '/' + it.d2, val: top * it.n2 + '/' + it.d * it.d2 }, { label: 'Жауабы', expr: 'қысқарт', val: a2 }];
        q.expl = it.w + ' ' + it.n + '/' + it.d + ' · ' + it.n2 + '/' + it.d2 + ' = ' + top + '/' + it.d + ' · ' + it.n2 + '/' + it.d2 + ' = ' + a2 + '.';
        if (lvl < 3) Object.assign(q, choices4({ v: a2, h: q.ansHTML }, [fc(it.n * it.n2, it.d * it.d2), mc(it.w, it.n * it.n2, it.d * it.d2), fc(top * it.n2, it.d)]));
        else q.kind = 'input';
        return q;
      }
      q.stem = 'Бөлшектерді көбейт' + (p.reduce ? ' де, қысқарт.' : '.');
      q.exprHTML = fracHTML(it.n1, it.d1) + '<span>·</span>' + fracHTML(it.n2, it.d2) + '<span>=</span><span class="q">?</span>';
      q.ans = F(it.ansN, it.ansD); q.ansHTML = fracHTML(it.ansN, it.ansD);
      q.h1 = 'Алымын алымға, бөлімін бөлімге көбейт.';
      q.h2 = '(' + it.n1 + ' · ' + it.n2 + ')/(' + it.d1 + ' · ' + it.d2 + ')';
      q.steps = [{ label: 'Алымы', expr: it.n1 + ' · ' + it.n2, val: String(it.n1 * it.n2) }, { label: 'Бөлімі', expr: it.d1 + ' · ' + it.d2, val: String(it.d1 * it.d2) },
        { label: p.reduce ? 'Қысқарт' : 'Жауабы', expr: it.n1 * it.n2 + '/' + it.d1 * it.d2, val: F(it.ansN, it.ansD) }];
      q.expl = it.n1 + '/' + it.d1 + ' · ' + it.n2 + '/' + it.d2 + ' = ' + it.n1 * it.n2 + '/' + it.d1 * it.d2 + (p.reduce ? ' = ' + F(it.ansN, it.ansD) : '') + '.';
      if (lvl === 1) q.fig = { type: 'grid', d: it.d1 * it.d2, n: it.n1 * it.n2 };
      else if (lvl === 2) q.hfig = { type: 'grid', d: it.d1 * it.d2, n: it.n1 * it.n2 };
      if (lvl < 3) Object.assign(q, choices4({ v: q.ans, h: q.ansHTML },
        [fc(it.n1 + it.n2, it.d1 + it.d2), fc(it.n1 * it.n2, it.d1 + it.d2), fc(it.n1 * it.d2, it.d1 * it.n2)]));
      else q.kind = 'input';
      return q;
    },

    /* ── FR-48…50 Бөлу ─────────────────────────────────────────
       Measurement meaning first: "3-те неше 1/4 бар" is countable on a strip,
       and it is the only version of division by a fraction a child can see
       before the reciprocal rule turns up. */
    div: function (p, lvl) {
      var it = U.pickDiv({ mode: p.mode }), q = { form: it.form };
      if (it.mode === 'int_by_unit') {
        q.stem = it.k + ' бүтінде неше ' + '1/' + it.d + ' бар?';
        q.exprHTML = it.k + '<span>:</span>' + fracHTML(1, it.d) + '<span>=</span><span class="q">?</span>';
        q.ans = String(it.ans);
        q.h1 = 'Әр бүтінде ' + it.d + ' үлес бар. Барлығы неше?';
        q.h2 = it.k + ' · ' + it.d;
        q.steps = [{ label: 'Бір бүтінде', expr: '1 : 1/' + it.d, val: String(it.d) }, { label: 'Барлығы', expr: it.k + ' · ' + it.d, val: String(it.ans) }];
        q.expl = it.k + ' : 1/' + it.d + ' = ' + it.k + ' · ' + it.d + ' = ' + it.ans + '.';
        if (lvl < 3) { q.fig = { type: 'circles', whole: it.k, rem: 0, d: it.d }; Object.assign(q, choices4(nc(it.ans), [nc(it.k + it.d), nc(it.d), nc(Math.max(1, Math.round(it.k / it.d)))])); }
        else q.kind = 'input';
        return q;
      }
      if (it.mode === 'frac_by_int') {
        q.stem = 'Бөлшекті санға бөл.';
        q.exprHTML = fracHTML(it.n, it.d) + '<span>:</span>' + it.k + '<span>=</span><span class="q">?</span>';
        q.ans = F(it.ansN, it.ansD); q.ansHTML = fracHTML(it.ansN, it.ansD);
        q.h1 = it.n + '/' + it.d + '-ны ' + it.k + ' теңдей бөлікке бөлеміз — бөліктер ' + it.k + ' есе ұсақталады.';
        q.h2 = 'Бөлімін ' + it.k + '-ге көбейт: ' + it.d + ' · ' + it.k + ' = ' + it.d * it.k;
        q.steps = [{ label: 'Бөлімі', expr: it.d + ' · ' + it.k, val: String(it.d * it.k) }, { label: 'Жауабы', expr: '', val: F(it.ansN, it.ansD) }];
        q.expl = it.n + '/' + it.d + ' : ' + it.k + ' = ' + it.n + '/' + it.d * it.k + (F(it.ansN, it.ansD) !== F(it.n, it.d * it.k) ? ' = ' + F(it.ansN, it.ansD) : '') + '.';
        if (lvl === 1) q.fig = { type: 'bar', d: it.d * it.k, n: it.ansN * (it.d * it.k / it.ansD) };
        if (lvl < 3) Object.assign(q, choices4({ v: q.ans, h: q.ansHTML }, [fc(it.n * it.k, it.d), fc(it.n, it.d + it.k), fc(it.n * it.k, it.d * it.k)]));
        else q.kind = 'input';
        return q;
      }
      var a = ansOf(it.ansW, it.ansN, it.ansD);
      q.stem = 'Бөлшекті бөлшекке бөл.';
      q.exprHTML = fracHTML(it.n1, it.d1) + '<span>:</span>' + fracHTML(it.n2, it.d2) + '<span>=</span><span class="q">?</span>';
      q.ans = a; q.ansHTML = ansHTMLOf(it.ansW, it.ansN, it.ansD);
      q.h1 = 'Бөлуді көбейтуге айналдыр: екінші бөлшекті аударып жаз.';
      q.h2 = it.n1 + '/' + it.d1 + ' · ' + it.d2 + '/' + it.n2;
      q.steps = [{ label: 'Кері бөлшек', expr: it.n2 + '/' + it.d2 + ' → ', val: it.d2 + '/' + it.n2 },
        { label: 'Көбейт', expr: it.n1 + ' · ' + it.d2 + ' / ' + it.d1 + ' · ' + it.n2, val: it.n1 * it.d2 + '/' + it.d1 * it.n2 }, { label: 'Жауабы', expr: 'қысқарт', val: a }];
      q.expl = it.n1 + '/' + it.d1 + ' : ' + it.n2 + '/' + it.d2 + ' = ' + it.n1 + '/' + it.d1 + ' · ' + it.d2 + '/' + it.n2 + ' = ' + a + '.';
      if (lvl < 3) Object.assign(q, choices4({ v: a, h: q.ansHTML }, [fc(it.n1 * it.n2, it.d1 * it.d2), fc(it.n1, it.d1 * it.n2), fc(it.d1 * it.n2, it.n1 * it.d2)]));
      else q.kind = 'input';
      return q;
    },

    /* ── FR-39…42 Ондық бөлшек ─────────────────────────────────
       Place value itself belongs to AR-38; this track only builds the bridge
       between the two ways of writing the same number.  The decimal separator
       is a comma throughout, as in the Kazakh textbooks. */
    dec: function (p, lvl) {
      var it = U.pickDec({ mode: p.mode, dir: p.dir });
      var toDec = it.dir !== 'to_frac';
      var q = { form: toDec ? undefined : 'lowest' };
      if (it.mode === 'as_division') {
        q.stem = 'Бөлшекті бөлу амалы түрінде жазып, мәнін тап.';
        q.exprHTML = fracHTML(it.n, it.d) + '<span>=</span>' + it.n + '<span>:</span>' + it.d + '<span>=</span><span class="q">?</span>';
        q.ans = it.dec;
        q.h1 = 'Бөлшек сызығы — бөлу белгісі: ' + it.n + '/' + it.d + ' дегеніміз ' + it.n + ' : ' + it.d + '.';
        q.steps = [{ label: 'Бөлу', expr: it.n + ' : ' + it.d, val: it.dec }];
        q.expl = it.n + '/' + it.d + ' = ' + it.n + ' : ' + it.d + ' = ' + it.dec + '.';
        if (lvl < 3) Object.assign(q, choices4({ v: it.dec, h: it.dec }, [{ v: String(it.d) + ',' + it.n, h: it.d + ',' + it.n }, { v: '0,' + it.d, h: '0,' + it.d }, { v: '0,' + it.n, h: '0,' + it.n }]));
        else q.kind = 'input';
        return q;
      }
      var unit = it.d === 10 ? 'ондық' : it.d === 100 ? 'жүздік' : null;
      if (toDec) {
        q.stem = 'Жай бөлшекті ондық бөлшекпен жаз.';
        q.exprHTML = fracHTML(it.n, it.d) + '<span>=</span><span class="q">?</span>'; q.ans = it.dec;
        q.h1 = unit ? ('Бөлімі ' + it.d + ' — әр үлес бір ' + unit + ', үтірден кейін ' + (it.d === 10 ? 'бір' : 'екі') + ' таңба.') : ('Алдымен бөлімін 10 немесе 100 ет: ' + it.n + '/' + it.d + '.');
        q.steps = [{ label: 'Ондық түрі', expr: it.n + '/' + it.d, val: it.dec }];
        q.expl = it.n + '/' + it.d + ' = ' + it.dec + '.';
        if (lvl < 3) Object.assign(q, choices4({ v: it.dec, h: it.dec }, [{ v: '0,' + it.n, h: '0,' + it.n }, { v: '0,' + it.d, h: '0,' + it.d }, { v: it.n + ',' + it.d, h: it.n + ',' + it.d }]));
        else q.kind = 'input';
      } else {
        q.stem = 'Ондық бөлшекті жай бөлшекпен жаз (қысқартылған түрде).';
        q.exprHTML = it.dec + '<span>=</span><span class="q">?</span>';
        q.ans = F(it.n, it.d); q.ansHTML = fracHTML(it.n, it.d);
        q.h1 = 'Үтірден кейін неше таңба болса, бөлімі сонша нөлі бар сан: бір таңба — 10, екі таңба — 100. Сонан соң қысқарт.';
        q.steps = [{ label: 'Қысқартпай', expr: it.dec, val: (it.dec.split(',')[1].length === 1 ? it.dec.split(',')[1] + '/10' : it.dec.split(',')[1] + '/100') }, { label: 'Қысқартқанда', expr: '', val: F(it.n, it.d) }];
        q.expl = it.dec + ' = ' + F(it.n, it.d) + '.';
        if (lvl < 3) Object.assign(q, choices4(fc(it.n, it.d), [fc(it.n * 2, it.d * 2), fc(it.d, it.n), fc(it.n + 1, it.d)]));
        else q.kind = 'input';
      }
      if (lvl === 1) q.fig = { type: 'grid', d: it.d <= 10 ? 10 : 100, n: Math.round(it.n / it.d * (it.d <= 10 ? 10 : 100)) };
      return q;
    },


    /* ── helpers the original generators delegate to ───────────
       They live here so fr/generate.js keeps the shape it had: each of the
       seven live generators still answers its own default params exactly as
       before, and only branches out when a new station passes a new param. */

    /* FR-10 / FR-11 / ⚡ reading pool — proper, improper, whole and mixed mixed
       together, which is how Rocket Math's identifying-fractions track runs it
       from the first day rather than after proper fractions are "done". */
    _shadeKinds: function (p, lvl, kinds) {
      var it = U.pickRead({ d: lvl === 1 ? [2, 6] : p.d, kinds: kinds, w: p.w });
      var d = it.d, q = { h1: 'Бөлімі — бір бүтіндегі тең бөлік саны. Алымы — алынған бөлік саны. Бүтіннен асса — бұрыс бөлшек.' };
      if (it.kind === 'whole') {
        q.stem = 'Суретте неше бүтін боялған? Бөлшекпен жаз.';
        q.fig = { type: 'circles', whole: it.w, rem: 0, d: d };
        q.ans = String(it.w); q.ansHTML = String(it.w);
        q.steps = [{ label: 'Бүтін саны', expr: 'толық фигуралар', val: String(it.w) }];
        q.expl = it.w + ' бүтін толық боялған → ' + it.w + ' (немесе ' + it.w * d + '/' + d + ').';
        if (lvl < 3) Object.assign(q, choices4(nc(it.w), [fc(it.w, d), fc(d, it.w), nc(it.w + 1)]));
        else q.kind = 'input';
        return q;
      }
      if (it.kind === 'improper') {
        var w = Math.floor(it.n / d), rem = it.n % d;
        q.stem = 'Боялған бөлікті БҰРЫС бөлшекпен жаз.';
        q.fig = { type: 'circles', whole: w, rem: rem, d: d };
        q.ans = F(it.n, d); q.ansHTML = fracHTML(it.n, d); q.form = 'improper';
        q.steps = [{ label: 'Бір бүтінде', expr: 'бөлік саны', val: String(d) }, { label: 'Барлық боялған бөлік', expr: w + ' · ' + d + ' + ' + rem, val: String(it.n) }];
        q.expl = w + ' толық фигура (' + w * d + '/' + d + ') және ' + rem + '/' + d + ' → ' + it.n + '/' + d + '.';
        if (lvl < 3) Object.assign(q, choices4(fc(it.n, d), [fc(rem, d), fc(it.n, d + 1), mc(w, rem, d)]));
        else q.kind = 'input';
        return q;
      }
      if (it.kind === 'mixed') {
        q.stem = 'Боялған бөлікті АРАЛАС санмен жаз.';
        q.fig = { type: 'circles', whole: it.w, rem: it.n, d: d };
        q.ans = M(it.w, it.n, d); q.ansHTML = mixedHTML(it.w, it.n, d); q.form = 'mixed';
        q.steps = [{ label: 'Бүтіні', expr: 'толық фигуралар', val: String(it.w) }, { label: 'Бөлшек бөлігі', expr: 'қалғаны', val: F(it.n, d) }];
        q.expl = it.w + ' толық фигура және ' + it.n + '/' + d + ' → ' + M(it.w, it.n, d) + '.';
        if (lvl < 3) Object.assign(q, choices4(mc(it.w, it.n, d), [mc(it.w + 1, it.n, d), fc(it.n, d), mc(it.n, it.w, d)]));
        else q.kind = 'input';
        return q;
      }
      q.stem = 'Бұл дұрыс бөлшек пе, бұрыс бөлшек пе?';
      q.fig = { type: 'bar', d: d, n: it.n };
      q.exprHTML = fracHTML(it.n, d);
      q.ans = it.n < d ? 'дұрыс' : 'бұрыс'; q.kind = 'choice';
      q.choices = ['дұрыс', 'бұрыс']; q.choiceHTML = ['Дұрыс бөлшек', 'Бұрыс бөлшек'];
      q.steps = [{ label: 'Алымы мен бөлімі', expr: it.n + ' және ' + d, val: it.n < d ? 'алымы кіші' : 'алымы кіші емес' }];
      q.expl = 'Алымы бөлімінен кіші болса — дұрыс бөлшек, кіші болмаса — бұрыс. ' + it.n + ' < ' + d + ' → дұрыс.';
      if (lvl === 3) { q.stem = it.n + '/' + d + ' — дұрыс па, бұрыс па?'; delete q.fig; }
      return q;
    },

    /* FR-13 same numerator, FR-14 against a half, FR-43 against a decimal.
       same_num carries the biggest misconception in the topic: more pieces
       means smaller pieces, so 1/8 < 1/3 even though 8 > 3. */
    _compareMode: function (p, lvl) {
      var it = U.pickCompare({ mode: p.mode, d: lvl === 1 ? [2, 8] : p.d });
      /* Level 3 carries the numbers in the stem — see the note in generate.js's
         compare(): startTest dedupes by stem+ans and cannot see exprHTML. */
      var q = { stem: 'Бос орынға тиісті белгіні таңда.', kind: 'choice', choices: ['>', '<', '='], ans: it.rel };
      if (it.mode === 'same_num') {
        q.exprHTML = fracHTML(it.a, it.d1) + '<span class="q">?</span>' + fracHTML(it.b, it.d2);
        q.h1 = 'Алымдары бірдей. Бөлім неғұрлым ҮЛКЕН болса, бөлік соғұрлым ҰСАҚ.';
        q.h2 = 'Бөлімдерін салыстыр: ' + it.d1 + ' және ' + it.d2 + '.';
        q.steps = [{ label: 'Қай бөлік ұсақ', expr: '1/' + it.d1 + ' және 1/' + it.d2, val: '1/' + Math.max(it.d1, it.d2) }];
        q.expl = 'Бөлімі ' + Math.min(it.d1, it.d2) + ' кіші → бөлігі ірі: ' + it.a + '/' + it.d1 + ' ' + it.rel + ' ' + it.b + '/' + it.d2 + '.';
        if (lvl === 1) q.fig = { type: 'twobars', d1: it.d1, n1: it.a, d2: it.d2, n2: it.b, label1: it.a + '/' + it.d1, label2: it.b + '/' + it.d2 };
        else if (lvl === 2) q.hfig = { type: 'twobars', d1: it.d1, n1: it.a, d2: it.d2, n2: it.b };
        else q.stem = it.a + '/' + it.d1 + ' және ' + it.b + '/' + it.d2 + ' — салыстыр. Тиісті белгіні таңда.';
        return q;
      }
      if (it.mode === 'half') {
        q.stem = 'Бөлшекті жартымен салыстыр.';
        q.exprHTML = fracHTML(it.a, it.d1) + '<span class="q">?</span>' + fracHTML(1, 2);
        q.h1 = 'Жарты дегеніміз — алымы бөлімінің дәл жартысы. ' + it.d1 + '-нің жартысы — ' + (it.d1 / 2) + '.';
        q.steps = [{ label: 'Бөлімнің жартысы', expr: it.d1 + ' : 2', val: String(it.d1 / 2) }, { label: 'Алымы', expr: '', val: String(it.a) }];
        q.expl = it.a + ' ' + (it.rel === '>' ? '>' : '<') + ' ' + (it.d1 / 2) + ', демек ' + it.a + '/' + it.d1 + ' ' + it.rel + ' 1/2.';
        if (lvl === 1) q.fig = { type: 'twobars', d1: it.d1, n1: it.a, d2: 2, n2: 1, label1: it.a + '/' + it.d1, label2: '1/2' };
        else if (lvl === 3) q.stem = it.a + '/' + it.d1 + ' пен 1/2 — салыстыр. Тиісті белгіні таңда.';
        return q;
      }
      q.stem = lvl === 3 ? (it.a + '/' + it.d1 + ' пен ' + it.dec + ' — салыстыр. Тиісті белгіні таңда.')
        : 'Жай бөлшек пен ондық бөлшекті салыстыр.';
      q.exprHTML = fracHTML(it.a, it.d1) + '<span class="q">?</span>' + it.dec;
      q.h1 = 'Екеуін бір түрге келтір: жай бөлшекті ондыққа айналдыр.';
      q.steps = [{ label: 'Ондық түрі', expr: it.a + '/' + it.d1, val: String(it.a / it.d1).replace('.', ',') }];
      q.expl = it.a + '/' + it.d1 + ' = ' + String(it.a / it.d1).replace('.', ',') + ', ал ' + it.dec + ' — ' + (it.rel === '=' ? 'дәл сол.' : 'басқа сан.');
      return q;
    },

    /* FR-21 / FR-22 / FR-23.  One station per number of steps, plus the one
       that asks whether there is anything to do at all — Rocket Math's
       equivalent-fractions track has that item type on purpose, because a child
       who always finds something to cancel has not understood cancelling. */
    _reduce: function (p, lvl) {
      var it = U.pickEquiv({ mode: p.mode, d: lvl === 1 ? [4, 12] : p.d });
      if (it.mode === 'irreducible') {
        var g = U.gcd(it.n, it.d);
        return { stem: lvl === 3 ? (it.n + '/' + it.d + ' бөлшегін қысқартуға бола ма?') : 'Бұл бөлшекті қысқартуға бола ма?',
          exprHTML: fracHTML(it.n, it.d),
          kind: 'choice', choices: ['иә', 'жоқ'], choiceHTML: ['Иә, қысқарады', 'Жоқ, қысқармайды'],
          ans: it.lowest ? 'жоқ' : 'иә',
          fig: lvl === 1 ? { type: 'bar', d: it.d, n: it.n } : undefined,
          h1: 'Алымы мен бөліміне ортақ бөлгіш (1-ден басқа) бар ма? Болмаса — қысқармайды.',
          h2: it.n + ' бөлгіштері: ' + U.divisors(it.n).join(', ') + ' · ' + it.d + ' бөлгіштері: ' + U.divisors(it.d).join(', '),
          steps: [{ label: 'ЕҮОБ', expr: '(' + it.n + '; ' + it.d + ')', val: String(g) }],
          expl: 'ЕҮОБ(' + it.n + '; ' + it.d + ') = ' + g + (it.lowest ? ' — тек 1, сондықтан бөлшек қысқармайды.' : ', сондықтан ' + it.n + '/' + it.d + ' = ' + U.reduce(it.n, it.d).join('/') + '.') };
      }
      var one = it.mode === 'reduce1';
      var q = { stem: 'Бөлшекті ең қысқа түрге келтір.', exprHTML: fracHTML(it.n, it.d) + '<span>=</span><span class="q">?</span>',
        ans: F(it.ansN, it.ansD), ansHTML: fracHTML(it.ansN, it.ansD), form: 'lowest',
        h1: one ? 'Алымы мен бөлімін ортақ бөлгішке бөл.' : 'Бір-екі рет бөлу жеткіліксіз: ЕҮОБ-ты тап та, бірден соған бөл.',
        h2: 'ЕҮОБ(' + it.n + '; ' + it.d + ') = ' + it.gcf,
        steps: [{ label: 'Ортақ бөлгіш', expr: '(' + it.n + '; ' + it.d + ')', val: String(it.gcf) },
          { label: 'Алымы', expr: it.n + ' : ' + it.gcf, val: String(it.ansN) },
          { label: 'Бөлімі', expr: it.d + ' : ' + it.gcf, val: String(it.ansD) }],
        expl: it.n + '/' + it.d + ' = (' + it.n + ' : ' + it.gcf + ')/(' + it.d + ' : ' + it.gcf + ') = ' + F(it.ansN, it.ansD) + '.' };
      if (lvl === 1) q.fig = { type: 'twobars', d1: it.d, n1: it.n, d2: it.ansD, n2: it.ansN, label1: F(it.n, it.d), label2: F(it.ansN, it.ansD) };
      else if (lvl === 2) q.hfig = { type: 'twobars', d1: it.d, n1: it.n, d2: it.ansD, n2: it.ansN };
      if (lvl < 3) Object.assign(q, choices4(fc(it.ansN, it.ansD),
        [fc(it.n - it.gcf, it.d - it.gcf), fc(it.ansN, it.d), fc(it.n, it.ansD), fc(it.ansD, it.ansN)]));
      else q.kind = 'input';
      return q;
    },

    /* FR-06, the other direction.  The station is about FORM: 7/4 and 1 3/4 are
       the same number, so without q.form core accepts either and the question
       asks nothing. */
    _toImproper: function (it, lvl) {
      var q = { stem: 'Аралас санды бұрыс бөлшек түрінде жаз.', form: 'improper',
        exprHTML: mixedHTML(it.w, it.n, it.d) + '<span>=</span><span class="q">?</span>',
        ans: F(it.top, it.d), ansHTML: fracHTML(it.top, it.d),
        h1: 'Бүтіндерді үлеске айналдыр: әр бүтінде ' + it.d + ' үлес бар.',
        h2: '(' + it.w + ' · ' + it.d + ') + ' + it.n,
        steps: [{ label: 'Бүтіндер үлесі', expr: it.w + ' · ' + it.d, val: String(it.w * it.d) },
          { label: 'Барлық үлес', expr: it.w * it.d + ' + ' + it.n, val: String(it.top) }],
        expl: it.w + ' ' + it.n + '/' + it.d + ' = (' + it.w + ' · ' + it.d + ' + ' + it.n + ')/' + it.d + ' = ' + it.top + '/' + it.d + '.' };
      if (lvl === 1) q.fig = { type: 'circles', whole: it.w, rem: it.n, d: it.d };
      else if (lvl === 2) q.hfig = { type: 'circles', whole: it.w, rem: it.n, d: it.d };
      if (lvl < 3) Object.assign(q, choices4(fc(it.top, it.d), [fc(it.w * it.n, it.d), fc(it.top + 1, it.d), fc(it.w + it.n, it.d)]));
      else q.kind = 'input';
      return q;
    },

    /* ── ⚡ stations ───────────────────────────────────────────
       Modelled on ar/generate.js's G.speed, deliberately: the platform already
       has a working answer to "practise to automaticity", it lives in the ROUTE
       as a custom widget, and it needs nothing from core.  An earlier draft of
       this route proposed a core flag (mastery:'fluency') for the same job —
       that was written without reading ar/generate.js and is not needed.

       What carries over unchanged: ten problems a round, the correction
       procedure (show the whole fact, type it three times, back up three), a
       budget on how many problems a round may SHOW so a borderline child's
       round always ends, a visible countdown rather than an invisible clock, a
       button beside Enter, and — the one that matters most — SLOW IS NOT WRONG.

       What changes for fractions:
         - an answer can be a/b, so the widget puts up two boxes and moves the
           focus itself; the child never types "/" on a tablet keyboard
         - the pause limit is 8 s, not 6: two boxes and a focus hop is a slower
           channel again than one number box
         - the level-3 test measures the child's own hand speed on FRACTION
           items, never integers, or the bar it sets is one no fraction answer
           could clear
         - the round's FOCUS is named in the stem. core/runner.js's startTest
           dedupes ten drawn items by stem+ans, and every drill answers 'иә', so
           without a varying focus a drill station offers ONE distinct item and
           the level test silently refuses to open. ar/stages.js hit exactly
           this and fixed it the same way. */
    frspeed: function (p, lvl) {
      var pool = p.pool;

      /* The slices a round can drill.  Each one is a different stem, which is
         also what keeps the level test openable — see the note above. */
      function focusList() {
        if (pool === 'read') {
          var kinds = p.kinds || ['proper'], out = [];
          var shapes = [['bar', 'жолақ'], ['pie', 'дөңгелек'], ['grid', 'тор']];
          var spans = [[2, 4, 'ұсақ бөлік'], [5, 8, 'ірі бөлік'], [2, 12, 'бәрі']];
          kinds.forEach(function (k) {
            shapes.forEach(function (sh) {
              out.push({ n: sh[1] + ' · ' + { proper: 'дұрыс', improper: 'бұрыс', mixed: 'аралас', whole: 'бүтін' }[k], kinds: [k], shape: sh[0] });
            });
          });
          /* Span × shape, not span alone: exactly six distinct stems clears
             startTest's floor but hands the child a six-question level test
             instead of ten. */
          spans.forEach(function (sp) {
            shapes.forEach(function (sh) { out.push({ n: sp[2] + ' · ' + sh[1], kinds: kinds, shape: sh[0], d: [sp[0], sp[1]] }); });
          });
          if (kinds.length > 1) out.push({ n: 'бәрі аралас', kinds: kinds, shape: 'pie' });
          return out;
        }
        if (pool === 'equiv') return [
          { n: 'қысқарту · бір қадам', mode: 'reduce1' }, { n: 'қысқарту · ЕҮОБ-пен', mode: 'reduce_gcf' },
          { n: 'кеңейту', mode: 'expand' }, { n: 'жарты отбасы', mode: 'reduce1', fam: 2 },
          { n: 'ширек отбасы', mode: 'reduce1', fam: 4 }, { n: 'үштен бір отбасы', mode: 'reduce1', fam: 3 },
          { n: 'бестен бір отбасы', mode: 'reduce1', fam: 5 }, { n: 'ондық отбасы', mode: 'reduce1', fam: 10 },
          { n: 'кеңейту · үлкен', mode: 'expand', d: [6, 12] }, { n: 'аралас', mode: null }];
        if (pool === 'lcd') return [
          { n: 'еселік бөлімдер', kind: 'multiple' }, { n: 'өзара жай', kind: 'coprime' },
          { n: 'ЕКОБ керек', kind: 'general' }, { n: 'аралас', kind: null },
          { n: 'кіші бөлімдер', kind: null, d: [2, 8] }, { n: 'үлкен бөлімдер', kind: null, d: [6, 12] },
          { n: 'еселік · кіші', kind: 'multiple', d: [2, 8] }, { n: 'өзара жай · кіші', kind: 'coprime', d: [2, 8] },
          { n: 'ЕКОБ · үлкен', kind: 'general', d: [6, 12] }];
        if (pool === 'gcf_lcm') return [
          { n: 'ЕҮОБ', want: 'gcf' }, { n: 'ЕКОЕ', want: 'lcm' }, { n: 'екеуі аралас', want: null },
          { n: 'ЕҮОБ · кіші сандар', want: 'gcf', a: [2, 8], b: [2, 8] },
          { n: 'ЕКОЕ · кіші сандар', want: 'lcm', a: [2, 8], b: [2, 8] },
          { n: 'аралас · үлкен сандар', want: null, a: [6, 12], b: [6, 12] },
          { n: 'ЕҮОБ · үлкен сандар', want: 'gcf', a: [6, 12], b: [6, 12] },
          { n: 'ЕКОЕ · үлкен сандар', want: 'lcm', a: [6, 12], b: [6, 12] },
          { n: 'екеуі · кіші сандар', want: null, a: [2, 8], b: [2, 8] }];
        return [
          { n: 'бөлшек → ондық', dir: 'to_dec' }, { n: 'ондық → бөлшек', dir: 'to_frac' },
          { n: 'екі бағытта', dir: null }, { n: 'ондық үлес', mode: 'tenths' },
          { n: 'жүздік үлес', mode: 'hundredths' }, { n: 'жиі кездесетіндері', mode: 'equiv' },
          { n: 'ондық үлес → бөлшек', mode: 'tenths', dir: 'to_frac' },
          { n: 'жүздік үлес → бөлшек', mode: 'hundredths', dir: 'to_frac' },
          { n: 'жиі кездесетіндері → ондық', mode: 'equiv', dir: 'to_dec' }];
      }
      var f = pick(focusList());

      /* One drawn item: what the child reads, what they type. */
      function fact() {
        if (pool === 'read') {
          var it = U.pickRead({ d: f.d || p.d, kinds: f.kinds, w: p.w });
          var ans = it.kind === 'whole' ? String(it.w)
            : it.kind === 'mixed' ? M(it.w, it.n, it.d) : F(it.n, it.d);
          var fig = it.kind === 'proper' ? { type: f.shape || 'bar', d: it.d, n: it.n }
            : { type: 'circles', whole: it.kind === 'whole' ? it.w : Math.floor((it.n || it.w * it.d + it.n) / it.d), rem: it.kind === 'mixed' ? it.n : (it.n || 0) % it.d, d: it.d };
          return { prompt: '', fig: fig, ans: ans };
        }
        if (pool === 'equiv') {
          var mode = f.mode || pick(['reduce1', 'reduce_gcf', 'expand']);
          var e = U.pickEquiv({ mode: mode, d: f.fam ? [f.fam * 2, f.fam * 6] : (p.d || [2, 24]) });
          if (e.mode === 'expand') return { prompt: F(e.n, e.d) + ' = ?/' + e.outD, ans: String(e.outN) };
          return { prompt: 'қысқарт: ' + F(e.n, e.d), ans: F(e.ansN, e.ansD) };
        }
        if (pool === 'lcd') {
          var l = U.pickLcd({ kind: f.kind || pick(['multiple', 'coprime', 'general']), d: f.d || p.d });
          return { prompt: l.d1 + ' пен ' + l.d2 + ' → ортақ бөлім?', ans: String(l.lcd) };
        }
        if (pool === 'gcf_lcm') {
          var g = U.pickGcfLcm({ a: f.a || p.a, b: f.b || p.b });
          var want = f.want || pick(['gcf', 'lcm']);
          return { prompt: (want === 'gcf' ? 'ЕҮОБ (' : 'ЕКОЕ (') + g.a + '; ' + g.b + ')', ans: String(want === 'gcf' ? g.gcf : g.lcm) };
        }
        var d0 = U.pickDec({ mode: f.mode || pick(['tenths', 'hundredths', 'equiv']), dir: 'both' });
        var dir = f.dir || d0.dir || pick(['to_dec', 'to_frac']);
        return dir === 'to_dec'
          ? { prompt: F(d0.n, d0.d) + ' = ?', ans: d0.dec }
          : { prompt: d0.dec + ' = ?', ans: F(d0.n, d0.d) };
      }

      /* Two boxes for a fraction, one for everything else.  The child never has
         to find "/" on a tablet keyboard, and the focus hops by itself. */
      var SHELL =
        '<div style="display:flex;flex-direction:column;gap:10px;align-items:center">' +
        '<div class="sp-head note" style="font-weight:800;text-align:center"></div>' +
        '<div class="sp-fig"></div>' +
        '<div class="sp-q" style="font-family:var(--disp);font-size:1.6rem;font-weight:600;text-align:center"></div>' +
        '<div class="sp-row" style="display:flex;gap:8px;align-items:center">' +
        '<span class="sp-boxes" style="display:inline-flex;flex-direction:column;align-items:center;gap:2px"></span>' +
        '<button class="btn sp-ok" type="button">Қою</button></div>' +
        '<div class="sp-msg" style="min-height:1.5em;font-weight:800;text-align:center"></div>' +
        '<div class="sp-bar" style="width:100%;max-width:260px;height:8px;border-radius:5px;' +
        'background:var(--line);overflow:hidden"><i style="display:block;height:100%;width:100%;' +
        'background:var(--accent);border-radius:5px"></i></div>' +
        '<button class="btn sp-go" type="button">Бастау</button></div>';

      function wire(el) {
        var o = {
          head: el.querySelector('.sp-head'), fig: el.querySelector('.sp-fig'),
          q: el.querySelector('.sp-q'), boxes: el.querySelector('.sp-boxes'),
          bar: el.querySelector('.sp-bar i'), go: el.querySelector('.sp-go'),
          row: el.querySelector('.sp-row'), msg: el.querySelector('.sp-msg')
        };
        o.say = function (t, c) { o.msg.textContent = t || ''; o.msg.style.color = c || 'var(--muted)'; };
        /* Lay out the boxes to match the shape of the answer, and read them back
           in the same shape, so "3/4" is typed as 3 then 4. */
        o.ask = function (ans, onSubmit) {
          var two = /\//.test(ans), mixed = /^\d+\s+\d+\/\d+$/.test(ans);
          o.boxes.innerHTML = two
            ? (mixed ? '<input class="big sp-w" inputmode="numeric" style="width:54px;text-align:center">' : '') +
              '<input class="big sp-n" inputmode="numeric" style="width:54px;text-align:center">' +
              '<i style="display:block;width:100%;height:2px;background:currentColor"></i>' +
              '<input class="big sp-d" inputmode="numeric" style="width:54px;text-align:center">'
            : '<input class="big sp-n" inputmode="decimal" style="width:110px;text-align:center">';
          var ins = [].slice.call(o.boxes.querySelectorAll('input'));
          ins.forEach(function (x, i) {
            x.addEventListener('input', function () { if (x.value.length >= 2 && ins[i + 1]) ins[i + 1].focus(); });
            x.addEventListener('keydown', function (e) { if (e.key === 'Enter') onSubmit(); });
          });
          o.read = function () {
            var w = o.boxes.querySelector('.sp-w'), n = o.boxes.querySelector('.sp-n'), d = o.boxes.querySelector('.sp-d');
            var v = (n && n.value.trim()) || '';
            if (d) v += '/' + d.value.trim();
            if (w) v = (w.value.trim() || '') + ' ' + v;
            return v.trim();
          };
          o.clear = function () { ins.forEach(function (x) { x.value = ''; }); if (ins[0]) ins[0].focus(); };
          o.clear();
        };
        o.draw = function (it, reveal) {
          o.fig.innerHTML = it.fig && typeof FIGS !== 'undefined' && FIGS[it.fig.type] ? FIGS[it.fig.type](it.fig) : '';
          o.q.textContent = it.prompt ? (it.prompt + (reveal ? ' = ' + it.ans : '')) : (reveal ? it.ans : '');
        };
        return o;
      }

      var LABEL = { read: 'оқу', equiv: 'мәндес бөлшектер', lcd: 'ортақ бөлім', gcf_lcm: 'ЕҮОБ / ЕКОЕ', dec: 'бөлшек ↔ ондық' }[pool];

      /* ── lvl 1–2 · practice, with the correction procedure ── */
      if (lvl < 3) {
        var LIMIT = lvl === 2 ? 8000 : 0, ROUND = 10, ALLOW = lvl === 1 ? 3 : 2, BUDGET = 26;
        return {
          stem: 'Жаттығу · ' + LABEL + ' · ' + f.n,
          kind: 'custom', ans: 'иә', ansHTML: '<b>раундты таза аяқтау</b>',
          h1: 'Қателессең — толық жауап көрсетіледі, оны ҮШ РЕТ жазасың, сосын ҮШ мысал артқа қайтасың.',
          h2: lvl === 2 ? 'Бұл деңгейде ' + (LIMIT / 1000) + ' секундтан ұзақ ойлансаң да түзету басталады.'
            : 'Бұл деңгейде уақыт шектелмейді — тек дұрыстығы маңызды.',
          expl: 'Раундта ' + ROUND + ' мысал. ' + ALLOW + ' түзетуден аспасаң — өттің. Түзету — жаза емес, есте сақтаудың жолы.',
          mount: function (el, submit) {
            var q = [], i = 0, fixes = 0, shown = 0, cur = null, rep = 0, mode = 'run',
              tmr = null, clk = null, over = false, t0 = 0, slips = 0;
            el.innerHTML = SHELL; var o = wire(el); o.row.style.display = 'none';
            function stop() { if (tmr) { clearTimeout(tmr); tmr = null; } if (clk) { clearInterval(clk); clk = null; } }
            function alive() { return !over && el.isConnected !== false; }
            function show() {
              stop();
              if (mode === 'run') {
                o.head.textContent = 'Мысал ' + Math.min(i + 1, ROUND) + ' / ' + ROUND + (fixes ? ' · түзету: ' + fixes : '');
                o.draw(cur, false);
              } else {
                /* A figure-only item has no text prompt, and "Қайтала:  = 1 1/2"
                   with nothing before the equals sign reads as a glitch. */
                o.head.innerHTML = '<span style="color:var(--bad)">Қайтала: ' +
                  (cur.prompt ? cur.prompt + ' = ' : '') + cur.ans + '</span> · ' + rep + '/3' +
                  (slips ? ' · қате теру: ' + slips + '/3' : '');
                o.draw(cur, true);
              }
              o.ask(cur.ans, answer); t0 = Date.now();
              if (mode === 'run' && LIMIT) {
                o.bar.style.background = 'var(--gold)';
                clk = setInterval(function () {
                  if (!alive()) return stop();
                  o.bar.style.width = Math.max(0, (LIMIT - (Date.now() - t0)) / LIMIT * 100) + '%';
                }, 80);
                tmr = setTimeout(function () { miss('slow'); }, LIMIT);
              } else { o.bar.style.background = 'var(--accent)'; o.bar.style.width = Math.min(100, i / ROUND * 100) + '%'; }
            }
            function nextFact() { if (i >= ROUND || shown >= BUDGET) return finish(); shown++; cur = q[i]; mode = 'run'; show(); }
            function miss(why, typed) {
              stop(); fixes++; rep = 0; slips = 0; mode = 'fix';
              /* A correct answer that arrived late must never read as a wrong one. */
              if (why === 'slow') o.say('Жауабың дұрыс болуы мүмкін, бірақ уақыт бітті — мақсат ойланбай жазу.', 'var(--gold)');
              else o.say('Сенің жауабың: ' + typed + '. Дұрысы: ' + cur.ans + '.', 'var(--bad)');
              show();
            }
            function finish() {
              if (over) return; over = true; stop();
              o.row.style.display = 'none'; o.q.textContent = ''; o.fig.innerHTML = '';
              var ok = fixes <= ALLOW;
              o.bar.style.background = ok ? 'var(--good)' : 'var(--bad)'; o.bar.style.width = '100%';
              o.head.innerHTML = 'Раунд бітті · түзету: <b>' + fixes + '</b> (рұқсат: ' + ALLOW + ')';
              o.say(ok ? 'Өттің ✓' : (LIMIT ? 'Жауаптарың дұрыс болса да, ' + (LIMIT / 1000) + ' секундтан ұзаққа созылды. Тағы бір раунд жаса.' : 'Тағы бір раунд жаса.'),
                ok ? 'var(--good)' : 'var(--bad)');
              o.go.textContent = 'Қайта бастау'; o.go.style.display = '';
              submit(ok ? 'иә' : 'жоқ');
            }
            function answer() {
              if (!cur || over) return;
              var v = o.read();
              if (!v || /^\s*\/?\s*$/.test(v)) { o.say('Жауабын жаз.', 'var(--muted)'); return; }
              if (mode === 'fix') {
                if (v !== cur.ans) {
                  /* There has to be a way out.  A mixed number is three boxes, and a
                     child who keeps mistyping one of them would otherwise never leave
                     this screen — the round would not end, which is the exact failure
                     ar-fluency-design.md records from the AR speed station.  Three
                     mistypes and the repetition counts: the value was in reading and
                     writing the whole fact, not in hitting it character-perfect. */
                  slips++;
                  if (slips < 3) { o.say('Қайталауда дәл «' + cur.ans + '» деп жаз.', 'var(--bad)'); o.clear(); show(); return; }
                  o.say('Жарайды, есіңде сақта: ' + cur.ans, 'var(--gold)');
                  slips = 0; rep = 3;
                } else rep++;
                if (rep < 3) { o.say('Тағы ' + (3 - rep) + ' рет.', 'var(--gold)'); show(); return; }
                slips = 0; i = Math.max(0, i - 3);
                if (fixes > ALLOW) return finish();      /* the round is already lost — end it now */
                nextFact(); return;
              }
              stop();
              if (v === cur.ans) { o.say('✓', 'var(--good)'); i++; nextFact(); } else miss('wrong', v);
            }
            el.querySelector('.sp-ok').addEventListener('click', answer);
            o.go.addEventListener('click', function () {
              if (over) return;
              q = []; for (var n = 0; n < ROUND; n++) q.push(fact());
              i = 0; fixes = 0; shown = 0; o.say('');
              o.row.style.display = ''; o.go.style.display = 'none'; nextFact();
            });
          }
        };
      }

      /* ── lvl 3 · the timed test: copy sets your own bar, then compute ──
         Longer than AR's 8 s / 12 s because the answer is two boxes, and the
         baseline is measured on FRACTION items for the same reason. */
      var T = { copy: 10, calc: 15, need: 0.6, floor: 4 };
      return {
        stem: 'Жылдамдық сынағы · ' + LABEL + ' · ' + f.n,
        kind: 'custom', ans: 'иә', ansHTML: '<b>өз жылдамдығыңа жеттің</b>',
        h1: 'Алдымен ' + T.copy + ' секунд көшіресің — бұл сенің қол жылдамдығың.',
        h2: 'Сосын ' + T.calc + ' секунд есептейсің. Өз жылдамдығыңның ' + Math.round(T.need * 100) + '%-іне жетсең — өттің.',
        expl: 'Мұнда дұрыс жауап жеткіліксіз — ойланбай жазу керек. Талап басқа баламен емес, сенің өз қол жылдамдығыңмен салыстырылады.',
        mount: function (el, submit) {
          var phase = 0, left = 0, done = 0, base = 0, cur = null, timer = null, over = false,
            endAt = 0, backstop = null;
          /* Every clock in here goes through these two.  A round that leaves a
             timer running is how AR's speed station once produced a round that
             could not end: the widget gets replaced, its interval keeps firing
             against detached nodes, and a second clock starts underneath the
             first.  Nothing in the runner unmounts a custom component, so the
             component has to look after its own clock. */
          function clearClock() {
            if (timer) { clearInterval(timer); timer = null; }
            if (backstop) { clearTimeout(backstop); backstop = null; }
          }
          function alive() { return !over && el.isConnected !== false; }
          el.innerHTML = SHELL; var o = wire(el); o.row.style.display = 'none';
          function next() {
            cur = fact();
            o.draw(cur, phase === 1);            /* phase 1 shows the answer: it is a copying task */
            o.ask(cur.ans, answer);
          }
          /* The clock reads the wall clock; it does not count its own ticks.
             Decrementing by 0.1 every 100 ms assumes every tick arrives, and a
             browser that throttles timers in a background tab — which is what
             happens the moment a child switches apps — makes the phase stall or
             drift instead of ending. endAt plus a backstop timeout means the
             phase ends on time whatever the ticks do. */
          function tick(total) {
            if (!alive()) return clearClock();        /* the question was replaced under us */
            left = (endAt - Date.now()) / 1000;
            o.bar.style.width = Math.max(0, left / total * 100) + '%';
            o.head.textContent = (phase === 1 ? 'Көшір: ' : 'Есепте: ') + Math.ceil(left) + ' с · ' + done;
            if (left <= 0) { clearClock(); endPhase(); }
          }
          function endPhase() {
            clearClock();
            if (phase === 1) {
              base = done; done = 0;
              o.say('Қол жылдамдығың: ' + base + '. Енді есепте.');
              start(2); return;
            }
            over = true; clearClock();
            o.row.style.display = 'none'; o.q.textContent = ''; o.fig.innerHTML = '';
            /* The floor is the sit-out gate, NOT the target: a child who types
               nothing in the copy phase must not end up with the easiest bar. */
            var bar = Math.max(T.floor, Math.round(Math.max(base, T.floor) * T.need));
            var ok = done >= bar;
            o.bar.style.background = ok ? 'var(--good)' : 'var(--bad)'; o.bar.style.width = '100%';
            o.head.innerHTML = 'Есептегенің: <b>' + done + '</b> · керек: ' + bar + ' (қол жылдамдығың ' + base + ')';
            o.say(ok ? 'Өттің ✓' : 'Әзірге жетпеді. Жаттығу деңгейіне қайтып, тағы бір-екі раунд жаса.', ok ? 'var(--good)' : 'var(--bad)');
            o.go.textContent = 'Қайта бастау'; o.go.style.display = '';
            submit(ok ? 'иә' : 'жоқ');
          }
          function start(ph) {
            clearClock();                            /* never leave a second clock running */
            if (over) return;
            var total = ph === 1 ? T.copy : T.calc;
            phase = ph; left = total; done = 0; endAt = Date.now() + total * 1000;
            o.row.style.display = ''; o.go.style.display = 'none';
            o.bar.style.background = 'var(--gold)';
            next();
            timer = setInterval(function () { tick(total); }, 100);
            backstop = setTimeout(function () { if (alive()) { clearClock(); endPhase(); } }, total * 1000 + 250);
          }
          function answer() {
            if (!alive() || !timer) return;
            var v = o.read();
            if (v === cur.ans) { done++; o.say('✓', 'var(--good)'); } else { o.say('✗', 'var(--bad)'); }
            next();
          }
          el.querySelector('.sp-ok').addEventListener('click', answer);
          o.go.addEventListener('click', function () { if (!over) start(1); });
        }
      };
    }
  };

  for (var k in G) if (Object.prototype.hasOwnProperty.call(G, k)) GENERATORS[k] = G[k];
})();
