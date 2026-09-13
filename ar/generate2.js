/* ar/generate2.js — AR route question generators, part 2 of 2: the ALGORITHM layer
 * (AR-10 … AR-18 — column multiplication, long division, trial quotient, decimals).
 * Loads AFTER generate.js, which publishes the shared helpers as AR_UTIL. Same
 * contract as part 1 (§5 pure, §6 three CPA levels, §7 question shape); answers are
 * single numbers for the reason given in generate.js's header.
 */
(function (root) {
  'use strict';

  var U = root.AR_UTIL;
  if (!U) throw new Error('ar/generate2.js: load generate.js first');
  var R = U.R, pick = U.pick, num = U.num, THING = U.THING, opts = U.opts, near = U.near;

  var G = {};

  /* ── how many carries does a × b produce, column-wise ── */
  /* Carries the pupil actually has to WRITE and carry into a next column.
   * The overflow out of the leftmost digit is not one: 71 × 7 = 497 has nothing
   * above the line, so counting it would put a carry-free item in a carry stage. */
  function carriesOf(a, b) {
    var c = 0, n = 0, str = String(a);
    for (var i = str.length - 1; i >= 0; i--) {
      var t = +str[i] * b + c; c = Math.floor(t / 10);
      if (c && i > 0) n++;
    }
    return n;
  }
  /* A zero that is neither the leading nor the trailing digit — 305 yes, 390 no.
   * A trailing zero makes the column EASIER, so it must not stand in for this class. */
  function hasInnerZero(n) {
    var s = String(n);
    return s.length > 2 && s.slice(1, -1).indexOf('0') >= 0;
  }
  /* Build a number meeting a difficulty class instead of rejecting for ever.
   * want: 'none' | 'one' | 'many' | undefined ; zero: a 0 inside the digits */
  function pickPair(dig, want, zero, bRange) {
    var lo = Math.pow(10, dig - 1), hi = Math.pow(10, dig) - 1;
    for (var t = 0; t < 400; t++) {
      var b = R(bRange[0], bRange[1]);
      var a = R(Math.max(lo, dig === 1 ? 2 : lo), hi);
      if (dig > 1 && a % 10 === 0) continue;                // a trailing 0 is a different, easier case
      if (zero ? !hasInnerZero(a) : hasInnerZero(a)) continue;   // keep the classes disjoint
      var c = carriesOf(a, b);
      if (want === 'none' && c !== 0) continue;
      if (want === 'one' && c !== 1) continue;
      if (want === 'many' && c < 2) continue;
      return { a: a, b: b };
    }
    return { a: dig === 1 ? 4 : (zero ? 405 : (dig === 2 ? 23 : 214)), b: 3 };
  }

  /* place-value decomposition, biggest first, zeros dropped: 214 → [200, 10, 4] */
  function places(n) {
    var s = String(n), out = [];
    for (var i = 0; i < s.length; i++) {
      var v = +s[i] * Math.pow(10, s.length - 1 - i);
      if (v) out.push(v);
    }
    return out.length ? out : [0];
  }

  /* ══ AR-24…28 · Бағаналап көбейту (× 1 таңба) ══════════
   * Split by what actually makes a column hard — carrying and interior zeros —
   * not by digit count, because "three digits" is easy without carries and
   * "two digits" is hard with them. params: { dig, carry:'none'|'one'|'many', zero } */
  G.mul_col = function (p, lvl) {
    var bR = p.b || (lvl === 1 ? [2, 4] : [2, 9]);
    var pr = pickPair(p.dig || 2, p.carry, p.zero, bR);
    var a = pr.a, b = pr.b;
    var pv = places(a);
    var nC = carriesOf(a, b);
    var h1 = p.dig === 1 ? 'Бағанаға жазғанда бірлік бірліктің дәл астында тұрады.'
      : p.carry === 'none' ? 'Әр разряд 10-нан аспайды — ауысу жоқ, тікелей жаза бер.'
        : p.zero ? 'Нөл де көбейтіледі: 0 × ' + b + ' = 0. Бірақ есте тұрған сан соған қосылады.'
          : 'Бірліктен баста. 10-нан асса — артығы ЕСТЕ, келесі разрядқа қосылады.';
    var steps = [];
    if (p.dig === 1) {
      steps.push({ label: 'Кестеден', expr: a + ' × ' + b + ' = ?', val: String(a * b) });
    } else {
      for (var i = pv.length - 1; i >= 0; i--) {
        steps.push({
          label: pv[i] >= 100 ? 'Жүздіктер' : pv[i] >= 10 ? 'Ондықтар' : 'Бірліктер',
          expr: pv[i] + ' × ' + b + ' = ?', val: String(pv[i] * b)
        });
      }
      steps.push({ label: 'Қос', expr: 'бөліктерді қос', val: String(a * b) });
    }
    return {
      stem: a + ' × ' + b + ' = ?',
      kind: 'input',
      ans: String(a * b),
      /* The area model shows WHY it works; the column shows WHAT to write.
       * At dig 1 an area model of a fact the pupil already recalls is noise, so
       * lvl 1 falls back to the array that gave the fact its meaning — and the
       * column (blank, never filled: a filled one would hand over the answer)
       * arrives at lvl 2 as it does in every other stage of this block. */
      fig: lvl === 1
        ? (p.dig > 1 ? { type: 'area', rows: [b], cols: pv } : { type: 'array', r: b, c: a })
        : lvl === 2 ? { type: 'colmul', a: a, b: b, carry: true, blank: true } : null,
      hfig: { type: 'colmul', a: a, b: b, carry: true },
      h1: h1,
      h2: p.dig === 1 ? a + ' × ' + b
        : pv.map(function (v) { return v + ' × ' + b; }).join(' + '),
      steps: steps,
      expl: a + ' × ' + b + ' = ' + a * b + '.' +
        (nC ? ' Ауысу саны: ' + nC + '.' : ' Ауысу жоқ.')
    };
  };

  /* ══ AR-11 · Баған түрінде бөлу (÷ 1 таңба) ═════════════════ */
  G.div_long = function (p, lvl) {
    var b = lvl === 1 ? R(2, 5) : R(2, 9);
    var q = lvl === 1 ? R(11, 49) : lvl === 2 ? R(12, 99) : R(102, 499);
    var a = b * q;
    return {
      stem: a + ' ÷ ' + b + ' = ?',
      kind: 'input',
      ans: String(q),
      fig: lvl === 1 ? { type: 'discs', h: Math.floor(a / 100), t: Math.floor(a / 10) % 10, o: a % 10, ring: 't' }
        : lvl === 2 ? { type: 'longdiv', a: a, b: b, blank: true } : null,
      hfig: lvl === 3 ? { type: 'longdiv', a: a, b: b, q: q } : null,
      // Framed the way Kazakh textbooks do it — by place value, around the
      // толымсыз бөлінгіш — not as the Anglo divide/multiply/subtract/bring-down chant.
      h1: 'Жоғары разрядтан баста. Бөлінбесе — келесі цифрды қосып, толымсыз бөлінгішті құр.',
      h2: 'Толымсыз бөлінгіш: ' + String(a).slice(0, String(a).length - String(q).length + 1),
      steps: [
        {
          label: 'Толымсыз бөлінгіш', expr: 'Бөлуге келетін бірінші сан',
          val: String(a).slice(0, String(a).length - String(q).length + 1)
        },
        { label: 'Бөлемін', expr: String(a).slice(0, String(a).length - String(q).length + 1) + ' ÷ ' + b + ' (толық)', val: String(String(q)[0]) },
        { label: 'Көбейтемін', expr: b + ' × ' + String(q)[0] + ' = ?', val: String(b * +String(q)[0]) },
        { label: 'Бүкіл бөлінді', expr: a + ' ÷ ' + b + ' = ?', val: String(q) }
      ],
      expl: a + ' ÷ ' + b + ' = ' + q + '. Тексеру: ' + b + ' × ' + q + ' = ' + a + '.'
    };
  };

  /* ══ AR-12 · Бөліндінің цифрын таңдау (试商) ═══════════════════ */
  G.estimate = function (p, lvl) {
    // Divisor must not be a round ten — rounding it would be a no-op and the
    // "таңда → тексер → түзет" loop would have nothing to teach.
    var b = lvl === 1 ? R(11, 39) : lvl === 2 ? R(11, 79) : R(11, 99);
    while (b % 10 === 0) b += R(1, 3);
    var d = R(2, 9);
    var a = b * d + R(0, b - 1);
    var rb = Math.round(b / 10) * 10 || 10;
    return {
      stem: a + ' ÷ ' + b + ' — бөліндінің цифрын таңда.',
      kind: 'custom',
      ans: String(d),
      fig: lvl === 1 ? { type: 'helper', b: b, upto: 9 }
        : lvl === 2 ? { type: 'helper', b: b, upto: 9, blanks: [3, 4, 6, 7, 8, 9] } : null,
      hfig: lvl === 3 ? { type: 'helper', b: b, upto: 9 } : null,
      h1: 'Бөлгішті дөңгелекте: ' + b + ' ≈ ' + rb + '. Сонда ' + a + ' ÷ ' + rb + ' шамамен қанша?',
      h2: b + ' × ' + d + ' = ' + b * d + ' ≤ ' + a + ' < ' + b + ' × ' + (d + 1) + ' = ' + b * (d + 1),
      expl: 'Цифр — ' + d + ': ' + b + ' × ' + d + ' = ' + b * d + ' (≤ ' + a + '), ал ' +
        b + ' × ' + (d + 1) + ' = ' + b * (d + 1) + ' (> ' + a + ').',
      /* Submits on every press; core/runner.js owns "one final answer" and the
       * one-retry rule (§7). The Үлкен ↓ / Кіші ↑ line is exactly the feedback a
       * pupil cannot get on paper — it turns the platform's retry into a taught
       * adjust-the-estimate step instead of a blind second guess. */
      mount: function (el, submit) {
        el.innerHTML =
          '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">' +
          '<span style="font-family:var(--disp);font-size:1.5rem;font-weight:600">' +
          b + ' × ? ≤ ' + a + '</span>' +
          '<input class="big ar-in" inputmode="numeric" maxlength="1" style="width:84px">' +
          '<button class="btn ar-go" type="button">Қою</button>' +
          '<span class="ar-msg note" style="font-weight:800"></span></div>';
        var inp = el.querySelector('.ar-in'), msg = el.querySelector('.ar-msg');
        el.querySelector('.ar-go').addEventListener('click', function () {
          var v = parseInt(inp.value, 10);
          if (isNaN(v)) return;
          if (b * v > a) { msg.style.color = 'var(--bad)'; msg.textContent = 'Үлкен ↓ (' + b + ' × ' + v + ' = ' + b * v + ')'; }
          else if (b * (v + 1) <= a) { msg.style.color = 'var(--gold)'; msg.textContent = 'Кіші ↑ — тағы сыяды'; }
          else { msg.style.color = 'var(--good)'; msg.textContent = 'Дұрыс ✓'; }
          submit(String(v));
        });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.querySelector('.ar-go').click(); });
      }
    };
  };

  /* ══ AR-31…34 · Көп таңбалы × көп таңбалы ══════════════
   * params: { ad, bd, carry:'none'|'any', zero:true (a 0 inside the MULTIPLIER) } */
  G.mul_col2 = function (p, lvl) {
    var ad = p.ad || 2, bd = p.bd || 2;
    var a = ad === 3 ? 213 : 23, b = p.zero ? 304 : (bd === 3 ? 213 : 14);
    for (var t0 = 0; t0 < 500; t0++) {
      var ca = R(Math.pow(10, ad - 1), Math.pow(10, ad) - 1);
      var cb = R(Math.pow(10, bd - 1), Math.pow(10, bd) - 1);
      if (ca % 10 === 0 || cb % 10 === 0) continue;
      if (p.zero && !hasInnerZero(cb)) continue;
      if (!p.zero && hasInnerZero(cb)) continue;
      if (p.carry === 'none' || p.carry === 'some') {
        var any = false;
        String(cb).split('').forEach(function (d) { if (+d && carriesOf(ca, +d)) any = true; });
        // 'some' must GUARANTEE a carry — a station called «ауысумен» that hands
        // out 71 × 47 is not teaching the thing it is named after.
        if (p.carry === 'none' ? any : !any) continue;
      }
      a = ca; b = cb; break;
    }
    var Bs = String(b), ao = a % 10, bo = b % 10;
    if (lvl === 1 || lvl === 2) {
      /* Ask what ONE row of the column equals. Never the units row — the whole
       * difficulty of a multi-digit multiplier is that row 2 is × tens, not × units.
       * With a zero in the multiplier we ask about the zero row on purpose. */
      // With a 0 in the multiplier the textbook column has NO row for it, so the
      // next row jumps two places — the classic error is shifting it only one.
      var sh = p.zero ? Bs.length - 1 : (Bs.length > 2 && Math.random() < 0.5 ? 2 : 1);
      var dg = +Bs[Bs.length - 1 - sh];
      var val = a * dg * Math.pow(10, sh);
      var wrong = [a * dg, a * dg * Math.pow(10, sh - 1), a * bo, a * dg * Math.pow(10, sh + 1), val + a];
      /* Name the row by the place it multiplies, not by its number: with a 0 in
       * the multiplier that row is not written at all, so "3-жол" would point at
       * a row the drawing does not have. */
      // stored case forms — §8 forbids assembling Kazakh endings (ондыққа / жүздікке)
      var pvDat = sh === 1 ? 'ондыққа' : 'жүздікке';
      return {
        stem: a + ' × ' + b + ' — бағаналағанда ' + pvDat + ' көбейтетін жол неге тең?',
        kind: 'choice',
        choices: opts(String(val), function () { return pick(wrong); }),
        ans: String(val),
        fig: lvl === 1 ? { type: 'area', rows: places(b), cols: places(a) }
          : { type: 'grid', rows: places(b), cols: places(a) },
        // the filled column IS the answer here, so it belongs in the hint (step 2)
        hfig: { type: 'colmul', a: a, b: b, hiZero: true },
        h1: 'Бұл жол ' + (dg * Math.pow(10, sh)) + '-ға көбейту, ' + dg + '-ға емес.',
        h2: a + ' × ' + (dg * Math.pow(10, sh)) + ' = ' + val +
          ' — соңында ' + sh + ' нөл тұрады',
        expl: 'Ол жол — ' + a + ' × ' + (dg * Math.pow(10, sh)) + ' = ' + val + '. ' +
          (p.zero ? 'Көбейткіштегі 0 үшін жол жазылмайды, сондықтан бұл жол бір емес, ' +
            sh + ' разрядқа жылжиды — соңында ' + sh + ' нөл.'
            : 'Сондықтан соңына ' + sh + ' нөл жазылады: ол ' + dg + '-ға емес, ' +
            (dg * Math.pow(10, sh)) + '-ға көбейту.')
      };
    }
    var rows = [];
    for (var j = String(b).length - 1; j >= 0; j--) {
      var d = +String(b)[j];
      rows.push({ label: (String(b).length - j) + '-жол', expr: a + ' × ' + d + (j < String(b).length - 1 ? ' (×10' + (String(b).length - 1 - j > 1 ? '^' + (String(b).length - 1 - j) : '') + ')' : ''), val: String(a * d * Math.pow(10, String(b).length - 1 - j)) });
    }
    rows.push({ label: 'Қос', expr: 'жолдарды қос', val: String(a * b) });
    return {
      stem: a + ' × ' + b + ' = ?',
      kind: 'input',
      ans: String(a * b),
      hfig: { type: 'colmul', a: a, b: b, hiZero: true },
      h1: p.zero ? 'Көбейткіште нөл бар: ол жол түгел нөл болады, бірақ орын алады.'
        : 'Әр разряд үшін бір жол. Жол неше разрядқа жылжыса, соңында сонша нөл.',
      h2: places(b).map(function (v) { return a + ' × ' + v; }).join(' + '),
      steps: rows,
      expl: a + ' × ' + b + ' = ' + a * b + '.'
    };
  };

  /* ══ Көп таңбалы бөлгішке бөлу ═════════════════════════
   * Same толымсыз бөлінгіш framing as div_long; what changes is that the
   * quotient digit can no longer be recalled from a table, so the helper table
   * built in `estimate` is carried in as the scaffold and then withdrawn.
   * params: { b: [lo, hi] divisor range, qd: quotient digits } */
  G.div_long2 = function (p, lvl) {
    var bR = p.b || [11, 99];
    var b = R(bR[0], bR[1]);
    while (b % 10 === 0) b += R(1, 3);
    var qd = p.qd || (lvl === 1 ? 2 : lvl === 2 ? 2 : 3);
    var q = R(Math.pow(10, qd - 1), Math.pow(10, qd) - 1);
    // A 0 inside the quotient is its own trap (the digit that must still be written);
    // hold it back until lvl 3 rather than springing it on the first attempt.
    while (lvl < 3 && String(q).slice(1).indexOf('0') >= 0) q = R(Math.pow(10, qd - 1), Math.pow(10, qd) - 1);
    var a = b * q;
    var As = String(a), Qs = String(q);
    var pdLen = As.length - Qs.length + 1;
    var pd = +As.slice(0, pdLen);                        // толымсыз бөлінгіш
    var d1 = +Qs[0];
    var rb = Math.round(b / 10) * 10 || 10;
    return {
      stem: a + ' ÷ ' + b + ' = ?',
      kind: 'input',
      ans: String(q),
      fig: lvl === 1 ? { type: 'helper', b: b, upto: 9 }
        : lvl === 2 ? { type: 'longdiv', a: a, b: b, blank: true } : null,
      hfig: lvl === 3 ? { type: 'longdiv', a: a, b: b, q: q }
        : { type: 'helper', b: b, upto: 9 },
      h1: 'Алдымен толымсыз бөлінгішті тап: ' + b + '-ға бөлінетін ең кіші бастапқы сан.',
      h2: b + ' ≈ ' + rb + ' деп таңда, сосын ' + b + ' × цифр ≤ ' + pd + ' екенін тексер.',
      steps: [
        { label: 'Толымсыз бөлінгіш', expr: 'Бөлуге келетін бірінші сан', val: String(pd) },
        { label: 'Цифрды таңда', expr: b + ' × ? ≤ ' + pd, val: String(d1) },
        { label: 'Көбейт', expr: b + ' × ' + d1 + ' = ?', val: String(b * d1) },
        { label: 'Бүкіл бөлінді', expr: a + ' ÷ ' + b + ' = ?', val: String(q) }
      ],
      expl: a + ' ÷ ' + b + ' = ' + q + '. Бөліндіде ' + Qs.length +
        ' цифр, себебі толымсыз бөлінгіш — ' + pd + '. Тексеру: ' + b + ' × ' + q + ' = ' + a + '.'
    };
  };

  /* ══ AR-16 · Ондық бөлшек (орын мәні) ══════════════════
   * Owner ruled 2026-09-13 that AR owns decimal place value rather than PV.
   * Uses the SAME base-ten blocks as the whole-number routes, with the unit
   * redefined (100-grid = 1, strip = 0.1, small square = 0.01) — the pupil sees
   * continuity, not a new rule. */
  G.dec_pv = function (p, lvl) {
    var PLACE = { 1: 'оннан бір', 2: 'жүзден бір' };
    if (lvl === 1) {                              // read the blocks
      // always show at least one whole block: the unit is what this stage redefines
      var o = R(1, 3), t = R(1, 9), h = Math.random() < 0.5 ? 0 : R(1, 9);
      var v = +(o + t / 10 + h / 100).toFixed(2);
      return {
        stem: 'Сурет қай санды көрсетеді?',
        kind: 'input',
        ans: num(v),
        fig: { type: 'decblocks', ones: o, tenths: t, hundredths: h },
        h1: 'Үлкен тақта — бір бүтін, жолақ — оннан бір, шағын шаршы — жүзден бір.',
        h2: o + ' бүтін, ' + t + ' оннан бір' + (h ? ', ' + h + ' жүзден бір' : ''),
        steps: [{ label: 'Бүтіні', expr: 'Толық тақта саны', val: String(o) },
                { label: 'Оннан бірі', expr: 'Жолақ саны', val: String(t) }],
        expl: o + ' бүтін, ' + t + ' оннан бір' + (h ? ' және ' + h + ' жүзден бір' : '') +
          ' → ' + num(v) + '.'
      };
    }
    if (lvl === 2) {                              // compare two decimals
      var a = +(R(1, 9) + R(0, 9) / 10 + R(0, 9) / 100).toFixed(2);
      var b = Math.random() < 0.45
        ? +(Math.floor(a) + R(0, 9) / 10 + R(0, 9) / 100).toFixed(2)   // same whole part
        : +(R(1, 9) + R(0, 9) / 10 + R(0, 9) / 100).toFixed(2);
      var ans = a > b ? '>' : a < b ? '<' : '=';
      return {
        stem: num(a) + ' … ' + num(b) + ' — тиісті белгіні таңда.',
        kind: 'choice',
        choices: ['>', '<', '='],
        ans: ans,
        exprHTML: '<b>' + num(a) + '</b><span class="q">?</span><b>' + num(b) + '</b>',
        hfig: { type: 'decblocks', ones: Math.floor(a), tenths: Math.round((a - Math.floor(a)) * 10) },
        h1: 'Алдымен бүтін бөліктерін салыстыр. Тең болса — оннан бірлерін.',
        h2: 'Ұзын жазылған сан әрқашан үлкен емес: 4.7 > 4.68.',
        expl: num(a) + ' ' + ans + ' ' + num(b) + '. Салыстыру разрядпен жүреді: бүтін → оннан бір → жүзден бір.'
      };
    }
    // lvl 3 — build the number from its places, in words
    var wh = R(0, 40), te = R(0, 9), hu = R(1, 9);
    var val = +(wh + te / 10 + hu / 100).toFixed(2);
    return {
      stem: 'Бүтіні ' + wh + ', оннан бірі ' + te + ', жүзден бірі ' + hu +
        ' болатын санды жаз.',
      kind: 'input',
      ans: num(val),
      hfig: { type: 'decblocks', ones: Math.min(wh, 3), tenths: te, hundredths: hu },
      h1: 'Үтірден кейінгі бірінші орын — ' + PLACE[1] + ', екінші орын — ' + PLACE[2] + '.',
      h2: wh + ' . ' + te + ' ' + hu,
      steps: [{ label: 'Оннан бір орны', expr: 'Үтірден кейінгі 1-цифр', val: String(te) },
              { label: 'Жүзден бір орны', expr: 'Үтірден кейінгі 2-цифр', val: String(hu) }],
      expl: num(val) + ' — бүтіні ' + wh + ', оннан бірі ' + te + ', жүзден бірі ' + hu + '.'
    };
  };

  /* ══ AR-16 · Ондық бөлінді (дәл бөлінеді) ══════════════ */
  G.div_dec = function (p, lvl) {
    // Divisors whose only prime factors are 2 and 5 → the quotient always terminates.
    // Deriving a from an exact remainder keeps a an integer and q exact (no rounding).
    var b = pick(lvl === 1 ? [2, 5, 10] : lvl === 2 ? [2, 4, 5, 10] : [4, 5, 20, 25]);
    var iq = lvl === 1 ? R(1, 9) : R(2, 40);
    var rem = R(1, b - 1);
    var a = iq * b + rem;
    var q = a / b;
    return {
      stem: a + ' ÷ ' + b + ' = ?',
      kind: 'input',
      ans: num(q),
      fig: lvl === 1 ? { type: 'decblocks', ones: iq, tenths: Math.round((q - iq) * 10) } : null,
      hfig: { type: 'decblocks', ones: iq, tenths: Math.round((q - iq) * 10) },
      h1: 'Бүтінді бөлген соң қалдықты тоқтатпа — ондық үлеске айырбаста.',
      h2: a + ' ÷ ' + b + ' = ' + iq + ' қалдық ' + rem + '  →  үтірден кейін жалғастыр',
      steps: [
        { label: 'Бүтін бөлігі', expr: a + ' ÷ ' + b + ' = ? (бүтін)', val: String(iq) },
        { label: 'Қалдық', expr: a + ' − ' + b + ' × ' + iq + ' = ?', val: String(rem) },
        { label: 'Ондық үлес', expr: rem + '0 ÷ ' + b + ' = ?', val: num(q - iq) }
      ],
      expl: a + ' ÷ ' + b + ' = ' + num(q) + '. Тексеру: ' + b + ' × ' + num(q) + ' = ' + a + '.'
    };
  };

  /* ══ AR-17 · Дөңгелектеп бөлу (2 таңбаға дейін) ════════ */
  G.div_round = function (p, lvl) {
    var dp = p.dp || 2;
    var b = lvl === 1 ? R(3, 9) : lvl === 2 ? R(6, 29) : R(11, 99);
    var a = R(b * 2 + 1, b * 40);
    if (a % b === 0) a += 1;
    var exact = a / b;
    var f = Math.pow(10, dp);
    var q = Math.round(exact * f) / f;
    var third = Math.round(exact * f * 10) / (f * 10);
    return {
      stem: a + ' ÷ ' + b + ' = ?  (жүзден бірге дейін дөңгелект)',
      kind: 'input',
      ans: num(q),
      hfig: { type: 'longdiv', a: a, b: b, blank: true },
      h1: 'Дөңгелектеу үшін бір разряд АРТЫҚ есепте — мыңнан бірге дейін.',
      h2: '≈ ' + num(third) + '  →  жүзден бірге дөңгелект',
      steps: [
        { label: 'Артық разрядпен', expr: a + ' ÷ ' + b + ' ≈ ?', val: num(third) },
        { label: 'Дөңгелект', expr: num(third) + ' ≈ ?', val: num(q) }
      ],
      expl: a + ' ÷ ' + b + ' = ' + num(third) + '… ≈ ' + num(q) +
        '. Үшінші ондық таңбаға қарап дөңгелектейміз.'
    };
  };

  /* ══ AR-18 · Ондық санға бөлу (жылжыту) ════════════════ */
  G.div_by_dec = function (p, lvl) {
    var b = pick(lvl === 1 ? [0.5, 0.2, 0.1] : lvl === 2 ? [0.25, 0.5, 1.5, 2.5] : [0.25, 0.75, 1.25, 0.04, 0.16]);
    var k = (String(b).split('.')[1] || '').length;
    var m = Math.pow(10, k);
    var q = lvl === 1 ? R(2, 9) : R(4, 60);
    var a = Math.round(b * q * m) / m;
    return {
      stem: num(a) + ' ÷ ' + num(b) + ' = ?',
      kind: 'input',
      ans: String(q),
      fig: lvl <= 2 ? { type: 'shift', a: a, b: b, k: k } : null,
      hfig: { type: 'shift', a: a, b: b, k: k },
      h1: 'Бөлгіш ондық болса, екеуін де ' + m + ' есе үлкейт — бөлінді өзгермейді.',
      h2: num(a) + ' ÷ ' + num(b) + ' = ' + num(a * m) + ' ÷ ' + num(b * m),
      steps: [
        { label: 'Жылжыт', expr: 'Екеуін де × ' + m, val: num(a * m) + ' ÷ ' + num(b * m) },
        { label: 'Бөл', expr: num(a * m) + ' ÷ ' + num(b * m) + ' = ?', val: String(q) }
      ],
      expl: num(a) + ' ÷ ' + num(b) + ' = ' + num(a * m) + ' ÷ ' + num(b * m) + ' = ' + q +
        '. Екі санды да бірдей есе үлкейткенде бөлінді өзгермейді.'
    };
  };


  root.GENERATORS = Object.assign(root.GENERATORS || {}, G);
})(typeof window !== 'undefined' ? window : this);
