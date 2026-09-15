/* fr/generate.js — part 1: FR_UTIL, the difficulty-class engine.
 *
 * Every station in fr/stages.js names exactly one new difficulty, and the
 * whole ladder is worth nothing unless the generator can PROVE an item belongs
 * to the class its station claims.  ar/generate2.js does this for columns with
 * carriesOf / hasInnerZero; this is the same move for fractions, where the
 * classes are reducing, common denominator, crossing one, and borrowing.
 *
 * Two rules the samplers never break:
 *   - a station that says "no reducing" never emits an item that reduces, and
 *     a station that says "reducing" never emits one that doesn't;
 *   - the operands a child reads are themselves in lowest terms unless the
 *     station is ABOUT un-reduced fractions, because 2/6 + 1/6 silently teaches
 *     that 2/6 is a normal way to write a third.
 *
 * Items carry `form` when the station is about the FORM of the answer rather
 * than its value (lowest terms, mixed, improper, whole).  core/core.js needs
 * owner-patch/core.js.patch for that field to mean anything — without it 6/8
 * is accepted for the answer 3/4 and the reducing stations are decorative.
 */
(function (root) {
  'use strict';

  /* ── arithmetic ─────────────────────────────────────────────── */
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
  function lcm(a, b) { return a / gcd(a, b) * b; }
  function isLowest(n, d) { return gcd(n, d) === 1; }
  function reduce(n, d) { var g = gcd(n, d) || 1; return [n / g, d / g]; }
  function primeFactorCount(n) { var c = 0, p = 2; while (p * p <= n) { while (n % p === 0) { n /= p; c++; } p++; } return n > 1 ? c + 1 : c; }
  function isPrime(n) { if (n < 2) return false; for (var i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
  function divisors(n) { var out = []; for (var i = 1; i * i <= n; i++) if (n % i === 0) { out.push(i); if (i !== n / i) out.push(n / i); } return out.sort(function (a, b) { return a - b; }); }

  /* ── the six class predicates ───────────────────────────────── */
  /* needsReduce — does the ANSWER have to be reduced?  This, not the size of
     the denominator, is what separates FR-13/15 from FR-25. */
  function needsReduce(n, d) { return gcd(n, d) > 1; }

  /* crossesOne — 'under' | 'exact' | 'over'.  FR-13 stays under, FR-14 lands
     exactly on 1 (and the answer is written 1, not 5/5), FR-26 goes over and
     has to become a mixed number. */
  function crossesOne(n, d) { return n < d ? 'under' : n === d ? 'exact' : 'over'; }

  /* lcdKind — how hard is the common denominator?
     'multiple': one denominator IS the other's multiple (2, 4) — just expand one side
     'coprime' : share nothing (2, 3) — the product works, no LCM needed
     'general' : share a factor but neither divides the other (4, 6) — LCM required */
  function lcdKind(d1, d2) {
    if (d1 === d2) return 'same';
    if (d2 % d1 === 0 || d1 % d2 === 0) return 'multiple';
    return gcd(d1, d2) === 1 ? 'coprime' : 'general';
  }

  /* reduceSteps — 1 when the common factor is prime (one division finishes it,
     FR-21), ≥2 when the child has to find the GCF first (FR-22). */
  function reduceSteps(n, d) { var g = gcd(n, d); return g <= 1 ? 0 : primeFactorCount(g); }

  /* carriesFrac / needsBorrow — the mixed-number pair, FR-34/35 and FR-36/37. */
  function carriesFrac(n1, n2, d) { return n1 + n2 >= d; }
  function needsBorrow(n1, n2) { return n1 < n2; }

  /* ── sampling ───────────────────────────────────────────────── */
  function rnd(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  /* Rejection sampling with a hard budget: a sampler that cannot meet its class
     must throw, never quietly hand back an item of the wrong class. */
  function until(test, draw, what) {
    for (var i = 0; i < 4000; i++) { var v = draw(); if (test(v)) return v; }
    throw new Error('FR_UTIL: no item satisfies ' + what);
  }
  function range(r, fb) { return Array.isArray(r) ? r : (fb || [2, 12]); }

  /* ── FR-01…09 reading ───────────────────────────────────────── */
  function pickRead(p) {
    var dr = range(p.d, [2, 8]), kinds = p.kinds || ['proper'];
    var kind = pick(kinds), d = rnd(dr[0], dr[1]);
    if (d < 2) d = 2;
    if (kind === 'whole') return { kind: 'whole', w: rnd(1, 3), d: d, n: 0 };
    if (kind === 'proper') return { kind: 'proper', n: rnd(1, d - 1), d: d };
    if (kind === 'improper') { var n = rnd(d + 1, d * 3); return { kind: 'improper', n: n, d: d }; }
    var w = rnd((p.w && p.w[0]) || 1, (p.w && p.w[1]) || 4);
    return { kind: 'mixed', w: w, n: rnd(1, d - 1), d: d };
  }

  /* FR-08 — improper ↔ mixed.  `form` is the whole point of the station:
     without it core accepts 7/4 for the answer 1 3/4 and back. */
  function pickImproper(p) {
    var dr = range(p.d, [2, 8]), wr = range(p.w, [1, 4]);
    var d = rnd(Math.max(2, dr[0]), dr[1]), w = rnd(wr[0], wr[1]), n = rnd(1, d - 1);
    var dir = p.dir === 'both' ? pick(['to_mixed', 'to_improper']) : p.dir || 'to_mixed';
    return { dir: dir, w: w, n: n, d: d, top: w * d + n, form: dir === 'to_mixed' ? 'mixed' : 'improper' };
  }

  /* ── FR-10…12, 43 comparison ────────────────────────────────── */
  function pickCompare(p) {
    var dr = range(p.d, [2, 12]);
    if (p.mode === 'same_den') {
      /* '=' must be reachable, or a child learns in three rounds that it never is —
         кпр.html excluded equality outright and so trained exactly that. */
      var d = rnd(Math.max(2, dr[0]), dr[1]);
      var a = rnd(1, d - 1), b = Math.random() < 0.15 ? a : rnd(1, d - 1);
      return { mode: 'same_den', a: a, b: b, d1: d, d2: d, rel: a > b ? '>' : a < b ? '<' : '=' };
    }
    if (p.mode === 'same_num') {
      var n = rnd(1, 5);
      var pr = until(function (x) { return x[0] !== x[1]; },
        function () { return [rnd(n + 1, dr[1]), rnd(n + 1, dr[1])]; }, 'same_num distinct denominators');
      return { mode: 'same_num', a: n, b: n, d1: pr[0], d2: pr[1], rel: pr[0] < pr[1] ? '>' : '<' };
    }
    if (p.mode === 'half') {
      var it = until(function (x) { return 2 * x.n !== x.d; },
        function () { var dd = rnd(3, dr[1]); return { n: rnd(1, dd - 1), d: dd }; }, 'half comparison');
      return { mode: 'half', a: it.n, d1: it.d, rel: 2 * it.n > it.d ? '>' : '<' };
    }
    var dec = pick([[1, 2, '0,5'], [1, 4, '0,25'], [3, 4, '0,75'], [1, 5, '0,2'], [3, 10, '0,3'], [1, 10, '0,1']]);
    var other = pick(['0,4', '0,6', '0,35', '0,8', dec[2]]);
    var v = parseFloat(other.replace(',', '.')), fv = dec[0] / dec[1];
    return { mode: 'dec', a: dec[0], d1: dec[1], dec: other, rel: fv > v ? '>' : fv < v ? '<' : '=' };
  }

  /* ── FR-13…16, 25, 26 same denominator ──────────────────────── */
  function pickSameDen(p) {
    var dr = range(p.d, [3, 12]), op = p.op === '+-' ? pick(['+', '-']) : (p.op || '+');
    if (p.from === 'whole') {                       // FR-16: 1 − 3/8
      var it = until(function (x) { return isLowest(x.n, x.d) && isLowest(x.d - x.n, x.d); },
        function () { var d = rnd(3, dr[1]); return { n: rnd(1, d - 1), d: d }; }, 'whole minus proper');
      return { op: '-', whole: 1, n1: it.d, n2: it.n, d: it.d, ansN: it.d - it.n, ansD: it.d, form: 'lowest' };
    }
    var cross = p.cross || 'under';
    var want = function (x) {
      var s = op === '+' ? x.n1 + x.n2 : x.n1 - x.n2;
      if (s <= 0) return false;
      if (op === '+' && crossesOne(s, x.d) !== cross) return false;
      if (op === '-' && s >= x.d === false && cross === 'over') return false;
      /* operands always in lowest terms — see the header */
      if (!isLowest(x.n1, x.d) || !isLowest(x.n2, x.d)) return false;
      var red = needsReduce(s % x.d === 0 ? x.d : s, x.d);
      if (s === x.d) return p.cross === 'exact';    // answer is the whole number 1
      return p.reduce ? red : !red;
    };
    var it2 = until(want, function () {
      var d = rnd(Math.max(3, dr[0]), dr[1]);
      var n1 = rnd(1, d - 1), n2 = rnd(1, d - 1);
      if (op === '-' && n2 >= n1) { var t = n1; n1 = n2; n2 = t; }
      return { n1: n1, n2: n2, d: d };
    }, 'same-denominator class ' + op + '/' + cross + '/reduce=' + !!p.reduce);

    var sum = op === '+' ? it2.n1 + it2.n2 : it2.n1 - it2.n2;
    var out = { op: op, n1: it2.n1, n2: it2.n2, d: it2.d, sumN: sum, sumD: it2.d };
    if (sum === it2.d) { out.ansWhole = 1; out.form = 'whole'; }
    else if (sum > it2.d) { out.ansW = Math.floor(sum / it2.d); var r = reduce(sum % it2.d, it2.d); out.ansN = r[0]; out.ansD = r[1]; out.form = 'mixed'; }
    else { var r2 = reduce(sum, it2.d); out.ansN = r2[0]; out.ansD = r2[1]; out.form = 'lowest'; }
    return out;
  }

  /* ── FR-17…19 factors ───────────────────────────────────────── */
  function pickFactors(p) { var r = range(p.n, [12, 60]); var n = until(function (x) { return !isPrime(x); }, function () { return rnd(r[0], r[1]); }, 'composite'); return { n: n, pairs: divisors(n).filter(function (x) { return x * x <= n; }).map(function (x) { return [x, n / x]; }) }; }
  function pickPrime(p) { var r = range(p.n, [2, 50]); var n = rnd(r[0], r[1]); return { n: n, prime: isPrime(n) }; }
  function pickGcfLcm(p) {
    var ar = range(p.a, [2, 12]), br = range(p.b, [2, 12]);
    var x = until(function (v) { return v[0] !== v[1]; }, function () { return [rnd(ar[0], ar[1]), rnd(br[0], br[1])]; }, 'two distinct numbers');
    return { a: x[0], b: x[1], gcf: gcd(x[0], x[1]), lcm: lcm(x[0], x[1]) };
  }

  /* ── FR-20…24 equivalence ───────────────────────────────────── */
  function pickEquiv(p) {
    var dr = range(p.d, [2, 12]);
    if (p.mode === 'expand') {
      var kr = range(p.k, [2, 4]);
      var e = until(function (x) { return isLowest(x.n, x.d); }, function () { var d = rnd(Math.max(2, dr[0]), dr[1]); return { n: rnd(1, d - 1), d: d }; }, 'lowest-terms base');
      var k = rnd(kr[0], kr[1]);
      return { mode: 'expand', n: e.n, d: e.d, k: k, outN: e.n * k, outD: e.d * k };
    }
    if (p.mode === 'irreducible') {
      var i = until(function (x) { return x.d > x.n; }, function () { var d = rnd(Math.max(2, dr[0]), dr[1]); return { n: rnd(1, d - 1), d: d }; }, 'irreducible candidate');
      return { mode: 'irreducible', n: i.n, d: i.d, lowest: isLowest(i.n, i.d) };
    }
    var oneStep = p.mode === 'reduce1';
    var r = until(function (x) {
      var st = reduceSteps(x.n, x.d);
      return oneStep ? st === 1 : st >= 2;
    }, function () { var d = rnd(Math.max(4, dr[0]), dr[1]); return { n: rnd(1, d - 1), d: d }; },
      'reduce in ' + (oneStep ? 'one step' : 'two or more'));
    var lo = reduce(r.n, r.d);
    return { mode: p.mode, n: r.n, d: r.d, gcf: gcd(r.n, r.d), ansN: lo[0], ansD: lo[1], form: 'lowest' };
  }

  /* ── FR-27…33 common denominator ────────────────────────────── */
  function pickLcd(p) {
    var dr = range(p.d, [2, 12]), kind = p.kind || 'multiple';
    var x = until(function (v) { return lcdKind(v[0], v[1]) === kind; },
      function () { return [rnd(Math.max(2, dr[0]), dr[1]), rnd(Math.max(2, dr[0]), dr[1])]; },
      'lcdKind ' + kind);
    return { kind: kind, d1: x[0], d2: x[1], lcd: lcm(x[0], x[1]) };
  }
  function pickDiffDen(p) {
    var op = p.op || '+', base = pickLcd({ kind: p.kind, d: p.d });
    var L = base.lcd;
    var it = until(function (v) {
      var s = op === '+' ? v.a + v.b : v.a - v.b;
      return s > 0 && s < L * 2 && isLowest(v.n1, base.d1) && isLowest(v.n2, base.d2);
    }, function () {
      var n1 = rnd(1, base.d1 - 1), n2 = rnd(1, base.d2 - 1);
      var a = n1 * (L / base.d1), b = n2 * (L / base.d2);
      if (op === '-' && b >= a) { var t = n1; n1 = n2; n2 = t; var td = a; a = b; b = td; }
      return { n1: n1, n2: n2, a: a, b: b };
    }, 'unlike denominators ' + op);
    var s = op === '+' ? it.a + it.b : it.a - it.b, lo = reduce(s % L === 0 ? L : s % L, L);
    return { op: op, kind: base.kind, n1: it.n1, d1: base.d1, n2: it.n2, d2: base.d2, lcd: L,
      a: it.a, b: it.b, sumN: s, ansW: Math.floor(s / L), ansN: s % L ? lo[0] : 0, ansD: s % L ? lo[1] : 0,
      form: s > L ? 'mixed' : s === L ? 'whole' : 'lowest' };
  }

  /* ── FR-34…37 mixed numbers ─────────────────────────────────── */
  function pickMixed(p) {
    var op = p.op || '+', dr = range(p.d, [3, 10]);
    var it = until(function (x) {
      if (!isLowest(x.n1, x.d) || !isLowest(x.n2, x.d)) return false;
      if (op === '+') return carriesFrac(x.n1, x.n2, x.d) === !!p.carry;
      return needsBorrow(x.n1, x.n2) === !!p.borrow && x.w1 > x.w2;
    }, function () {
      var d = rnd(Math.max(3, dr[0]), dr[1]);
      return { w1: rnd(2, 5), w2: rnd(1, 3), n1: rnd(1, d - 1), n2: rnd(1, d - 1), d: d };
    }, 'mixed ' + op + ' carry=' + !!p.carry + ' borrow=' + !!p.borrow);

    if (op === '+') {
      var sn = it.n1 + it.n2, w = it.w1 + it.w2 + (sn >= it.d ? 1 : 0), rn = sn % it.d, lo = reduce(rn, it.d);
      return { op: '+', w1: it.w1, n1: it.n1, w2: it.w2, n2: it.n2, d: it.d,
        ansW: w, ansN: rn ? lo[0] : 0, ansD: rn ? lo[1] : 0, form: rn ? 'mixed' : 'whole' };
    }
    var top = it.n1 + (it.n1 < it.n2 ? it.d : 0), w1 = it.w1 - (it.n1 < it.n2 ? 1 : 0);
    var rn2 = top - it.n2, lo2 = reduce(rn2, it.d);
    return { op: '-', w1: it.w1, n1: it.n1, w2: it.w2, n2: it.n2, d: it.d,
      ansW: w1 - it.w2, ansN: rn2 ? lo2[0] : 0, ansD: rn2 ? lo2[1] : 0, form: rn2 ? 'mixed' : 'whole' };
  }

  /* ── FR-38, 44…47 multiplication ────────────────────────────── */
  /* Keeps fr/generate.js's live shape: the total is built as d · k so it always
     divides exactly, which is what makes "12 : 4 = 3" sayable out loud. */
  function pickUnitOf(p) {
    var dr = range(p.d, [2, 10]), kr = range(p.k, [2, 9]);
    var nr = Array.isArray(p.num) ? p.num : null, num = nr ? null : (p.num || 1);
    var it = until(function (x) { return x.num >= 1 && x.num < x.d; }, function () {
      var d = rnd(Math.max(2, dr[0]), dr[1]), k = rnd(kr[0], kr[1]);
      return { d: d, k: k, tot: d * k, num: nr ? rnd(nr[0], Math.min(nr[1], d - 1)) : num };
    }, 'part_of with num < d');
    return { tot: it.tot, d: it.d, k: it.k, num: it.num, ans: it.k * it.num };
  }
  function pickMul(p) {
    if (p.mode === 'by_int') {
      var it = until(function (x) { return isLowest(x.n, x.d) && x.n * x.k !== x.d; }, function () { var d = rnd(3, 10); return { n: rnd(1, d - 1), d: d, k: rnd(2, 6) }; }, 'fraction × integer');
      var s = it.n * it.k, lo = reduce(s % it.d, it.d);
      return { mode: 'by_int', n: it.n, d: it.d, k: it.k, ansW: Math.floor(s / it.d), ansN: s % it.d ? lo[0] : 0, ansD: s % it.d ? lo[1] : 0, form: s > it.d ? 'mixed' : 'lowest' };
    }
    if (p.mode === 'mixed') {
      var m = until(function (x) { return isLowest(x.n, x.d); }, function () { var d = rnd(2, 6); return { w: rnd(1, 3), n: rnd(1, d - 1), d: d, n2: rnd(1, 5), d2: rnd(2, 6) }; }, 'mixed × fraction');
      var top = m.w * m.d + m.n, sn = top * m.n2, sd = m.d * m.d2, lo2 = reduce(sn % sd, sd);
      return { mode: 'mixed', w: m.w, n: m.n, d: m.d, n2: m.n2, d2: m.d2, ansW: Math.floor(sn / sd), ansN: sn % sd ? lo2[0] : 0, ansD: sn % sd ? lo2[1] : 0, form: sn > sd ? 'mixed' : 'lowest' };
    }
    var want = !!p.reduce;
    var f = until(function (x) { return needsReduce(x.n1 * x.n2, x.d1 * x.d2) === want && isLowest(x.n1, x.d1) && isLowest(x.n2, x.d2); },
      function () { var d1 = rnd(2, 9), d2 = rnd(2, 9); return { n1: rnd(1, d1 - 1), d1: d1, n2: rnd(1, d2 - 1), d2: d2 }; },
      'fraction × fraction reduce=' + want);
    var lo3 = reduce(f.n1 * f.n2, f.d1 * f.d2);
    return { mode: 'frac', n1: f.n1, d1: f.d1, n2: f.n2, d2: f.d2, ansN: lo3[0], ansD: lo3[1], form: 'lowest' };
  }

  /* ── FR-48…50 division ──────────────────────────────────────── */
  function pickDiv(p) {
    if (p.mode === 'int_by_unit') { var k = rnd(2, 6), d = rnd(2, 6); return { mode: 'int_by_unit', k: k, d: d, ans: k * d }; }
    if (p.mode === 'frac_by_int') {
      var it = until(function (x) { return isLowest(x.n, x.d); }, function () { var dd = rnd(2, 9); return { n: rnd(1, dd - 1), d: dd, k: rnd(2, 5) }; }, 'fraction ÷ integer');
      var lo = reduce(it.n, it.d * it.k);
      return { mode: 'frac_by_int', n: it.n, d: it.d, k: it.k, ansN: lo[0], ansD: lo[1], form: 'lowest' };
    }
    var f = until(function (x) { return isLowest(x.n1, x.d1) && isLowest(x.n2, x.d2); },
      function () { var d1 = rnd(2, 8), d2 = rnd(2, 8); return { n1: rnd(1, d1 - 1), d1: d1, n2: rnd(1, d2 - 1), d2: d2 }; }, 'fraction ÷ fraction');
    var sn = f.n1 * f.d2, sd = f.d1 * f.n2, lo2 = reduce(sn % sd || sd, sd);
    return { mode: 'frac_by_frac', n1: f.n1, d1: f.d1, n2: f.n2, d2: f.d2,
      ansW: Math.floor(sn / sd), ansN: sn % sd ? reduce(sn % sd, sd)[0] : 0, ansD: sn % sd ? reduce(sn % sd, sd)[1] : 0,
      form: sn > sd ? 'mixed' : 'lowest' };
  }

  /* ── FR-39…42 decimals.  Place value itself is AR-38's business. ── */
  var DEC = [[1, 2, '0,5'], [1, 4, '0,25'], [3, 4, '0,75'], [1, 5, '0,2'], [2, 5, '0,4'], [3, 5, '0,6'], [4, 5, '0,8'],
             [1, 10, '0,1'], [3, 10, '0,3'], [7, 10, '0,7'], [9, 10, '0,9'], [1, 20, '0,05'], [3, 20, '0,15'], [1, 100, '0,01'], [7, 100, '0,07']];
  function pickDec(p) {
    if (p.mode === 'tenths') { var n = rnd(1, 9); return { mode: 'tenths', n: n, d: 10, dec: '0,' + n, dir: pick(['to_dec', 'to_frac']) }; }
    if (p.mode === 'hundredths') { var h = rnd(1, 99); return { mode: 'hundredths', n: h, d: 100, dec: '0,' + (h < 10 ? '0' + h : h) }; }
    if (p.mode === 'as_division') { var c = pick(DEC); return { mode: 'as_division', n: c[0], d: c[1], dec: c[2], dir: pick(['to_dec', 'to_frac']) }; }
    var e = pick(DEC);
    return { mode: 'equiv', n: e[0], d: e[1], dec: e[2], dir: p.dir === 'both' ? pick(['to_dec', 'to_frac']) : 'to_dec', form: 'lowest' };
  }

  /* ── ⚡ stations ─────────────────────────────────────────────
     A fluency station's pool is CUMULATIVE — every fact its track has taught so
     far, not just the last station's class.  That is the Rocket Math rule, and
     it is also what keeps the pool wide enough for runner's startTest, which
     dedupes ten drawn items by stem+ans and silently refuses to open a level
     test if fewer than six survive.  The first version of this dispatched a ⚡
     station straight into its track's LAST sampler; the class self-check caught
     FR-24 at four distinct stems — below the floor, and silent. */
  function pickFluency(p) {
    var pool = p.pool;
    if (pool === 'read') return pickRead({ d: p.d, kinds: p.kinds, w: p.w });
    if (pool === 'gcf_lcm') return pickGcfLcm(p);
    if (pool === 'lcd') return pickLcd({ kind: pick(['multiple', 'coprime', 'general']), d: p.d });
    if (pool === 'equiv') {
      var mode = pick(['expand', 'reduce1', 'reduce_gcf', 'irreducible']);
      return pickEquiv({ mode: mode, d: p.d || [2, 24], k: p.k });
    }
    if (pool === 'dec') return pickDec({ mode: pick(['tenths', 'hundredths', 'equiv']), dir: p.dir });
    throw new Error('FR_UTIL.pickFluency: unknown pool ' + pool);
  }

  /* Distractors must be things Core would REJECT.  Value-distinctness is not
     enough on its own: Core has three acceptance rules, and the third one —
     "when the expected answer is a plain number, take the first number in what
     was typed" — means the answer 3 accepts 3/6, which is how a whole-number
     item ends up with two green buttons even though 3 ≠ 1/2.  So the test here
     is Core's own comparison, run in the UNPATCHED form, which is the more
     permissive of the two; anything it rejects, the patched one rejects too. */
  function coreNorm(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').replace(',', '.').replace(/\s*%$/, '').toLowerCase(); }
  function coreFracVal(s) {
    var m = String(s).match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/);
    if (m) { var w = +m[2], n = +m[3], d = +m[4]; return d ? (m[1] === '-' ? -1 : 1) * (w + n / d) : NaN; }
    m = String(s).match(/^(-?)(\d+)\/(\d+)$/);
    if (m) { var n2 = +m[2], d2 = +m[3]; return d2 ? (m[1] === '-' ? -1 : 1) * n2 / d2 : NaN; }
    return NaN;
  }
  function coreAccepts(ans, given) {
    var a = coreNorm(given), b = coreNorm(ans);
    if (!a || !b) return false; if (a === b) return true;
    var fa = coreFracVal(a), fb = coreFracVal(b);
    if (isFinite(fa) && isFinite(fb)) return Math.abs(fa - fb) < 1e-9;
    if (/^-?\d+(\.\d+)?$/.test(b)) { var m = a.match(/-?\d+(\.\d+)?/); if (m) return Math.abs(parseFloat(m[0]) - parseFloat(b)) < 1e-9; }
    var na = a.match(/-?\d+(\.\d+)?/g) || [], nb = b.match(/-?\d+(\.\d+)?/g) || [];
    if (!nb.length || na.length !== nb.length) return false;
    for (var i = 0; i < na.length; i++) if (Math.abs(parseFloat(na[i]) - parseFloat(nb[i])) > 1e-9) return false;
    return true;
  }
  function choices(correct, distractors) {
    var out = [correct];
    for (var i = 0; i < distractors.length && out.length < 4; i++) {
      var c = distractors[i]; if (!c || c.v === undefined) continue;
      var clash = coreAccepts(correct.v, c.v);
      for (var j = 1; j < out.length && !clash; j++) if (out[j].v === c.v || coreAccepts(out[j].v, c.v)) clash = true;
      if (!clash) out.push(c);
    }
    var mix = out.slice().sort(function () { return Math.random() - 0.5; });
    return { kind: 'choice', choices: mix.map(function (c) { return c.v; }), choiceHTML: mix.map(function (c) { return c.h; }) };
  }
  root.FR_CHOICES = choices;

  root.FR_UTIL = {
    coreAccepts: coreAccepts, choices: choices,
    gcd: gcd, lcm: lcm, isLowest: isLowest, reduce: reduce, isPrime: isPrime, divisors: divisors,
    needsReduce: needsReduce, crossesOne: crossesOne, lcdKind: lcdKind,
    reduceSteps: reduceSteps, carriesFrac: carriesFrac, needsBorrow: needsBorrow,
    rnd: rnd, pick: pick,
    pickRead: pickRead, pickImproper: pickImproper, pickCompare: pickCompare,
    pickSameDen: pickSameDen, pickFactors: pickFactors, pickPrime: pickPrime, pickGcfLcm: pickGcfLcm,
    pickEquiv: pickEquiv, pickLcd: pickLcd, pickDiffDen: pickDiffDen, pickMixed: pickMixed,
    pickUnitOf: pickUnitOf, pickMul: pickMul, pickDiv: pickDiv, pickDec: pickDec,
    pickFluency: pickFluency
  };
})(typeof window !== 'undefined' ? window : this);
