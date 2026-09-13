/* ar/figs2.js — AR route drawings, part 2 of 2: the algorithm-layer models
 * (place-value discs, the уголком long-division frame, the divisor helper table,
 * base-ten blocks with the unit redefined for decimals, the ×10 shift, remainder bar).
 * Loads AFTER figs.js, which publishes the drawing primitives as AR_DRAW.
 */
(function (root) {
  'use strict';

  var D = root.AR_DRAW;
  if (!D) throw new Error('ar/figs2.js: load figs.js first');
  var C = D.C, svg = D.svg, txt = D.txt, rect = D.rect, line = D.line, dot = D.dot, num = D.num;

  var FIGS = {

    /* ── AR-24 / AR-27 · бағаналап көбейту — the column itself ──
     * The stages are named after this layout but nothing drew it: the area model
     * shows WHY it works, the column shows WHAT to write. Digits are right-
     * aligned, carries sit above, and for a multi-digit multiplier each partial
     * product gets its own row with the trailing place-holder zeros highlighted —
     * the second row is × tens, not × units, which is the whole point.
     * {a, b, carry:true, blank:true, hiZero:true} */
    colmul: function (f) {
      var A = String(f.a), B = String(f.b), prod = f.a * f.b;
      var CW = 22, pad = 10, top = f.carry ? 22 : 8;
      // partial products, ones digit first
      var parts = [];
      if (B.length > 1) {
        for (var j = B.length - 1; j >= 0; j--) {
          var d = +B[j], sh = B.length - 1 - j;
          if (d === 0 && sh > 0) continue;
          parts.push({ s: String(f.a * d) + new Array(sh + 1).join('0'), z: sh });
        }
      }
      var cols = Math.max(A.length, B.length + 1, String(prod).length,
        parts.reduce(function (m, p) { return Math.max(m, p.s.length); }, 0)) + 1;
      var W = pad * 2 + cols * CW;
      var rows = 2 + parts.length + 1;                 // a, b, [partials], result
      var H = top + rows * 26 + (parts.length ? 30 : 12) + 14;
      var s = '', y = top;
      function put(str, yy, fill, hiN) {          // right-aligned digit run
        var out = '';
        for (var i = 0; i < str.length; i++) {
          var fromRight = str.length - 1 - i;
          var x = pad + (cols - 1 - fromRight) * CW + CW / 2;
          var isHi = hiN && fromRight < hiN;
          if (isHi) {
            out += rect(x - CW / 2 + 2, yy - 17, CW - 4, 22,
              { fill: C.bLite, stroke: C.b, sw: 1.5, r: 4 });
          }
          out += txt(x, yy, str[i], { size: 19, mono: true, fill: isHi ? C.b : (fill || C.ink) });
        }
        return out;
      }
      // carry row (single-digit multiplier only — that is where carries are taught)
      if (f.carry && B.length === 1) {
        var c = 0, cs = '';
        for (var i2 = A.length - 1; i2 >= 0; i2--) {
          var t = +A[i2] * f.b + c; c = Math.floor(t / 10);
          cs = (i2 > 0 && c ? String(c) : ' ') + cs;
        }
        for (var k = 0; k < cs.length; k++) {
          if (cs[k] === ' ') continue;
          var fr = cs.length - 1 - k;
          s += txt(pad + (cols - 1 - fr) * CW + CW / 2, top - 6, cs[k],
            { size: 12, mono: true, fill: C.b });
        }
      }
      s += put(A, y + 18); y += 26;
      s += txt(pad + (cols - B.length - 1) * CW + CW / 2, y + 18, '×',
        { size: 19, mono: true, fill: C.a });
      s += put(B, y + 18, C.a); y += 26;
      s += line(pad + 4, y + 2, W - pad - 2, y + 2, { stroke: C.ink, sw: 2 });
      y += 10;                                         // gap under the rule
      parts.forEach(function (p) {                     // draw, THEN advance
        s += put(p.s, y + 18, C.dim, f.hiZero ? p.z : 0);
        y += 26;
      });
      if (parts.length) {
        y += 4;
        s += line(pad + 4, y + 2, W - pad - 2, y + 2, { stroke: C.ink, sw: 2 });
        y += 10;
      }
      s += put(f.blank ? new Array(String(prod).length + 1).join('?') : String(prod),
        y + 18, f.blank ? C.dim : C.ok);
      return svg(W, H, s, Math.min(W, 300));
    },


    /* ── AR-07 / AR-11 · place-value discs (100 / 10 / 1) ──
     * {h, t, o, ring: 'h'|'t'|'o' highlights the place being regrouped} */
    discs: function (f) {
      var sets = [['h', f.h || 0, '100', C.a], ['t', f.t || 0, '10', C.b], ['o', f.o || 0, '1', C.ok]];
      var R = 17, gap = 6, colGap = 26, pad = 10;
      var W = pad, maxN = 1;
      sets.forEach(function (S) { if (S[1] > maxN) maxN = S[1]; });
      var perCol = Math.min(Math.max(maxN, 1), 5);
      sets.forEach(function (S) {
        if (S[1] > 0) W += Math.ceil(S[1] / perCol) * (2 * R + gap) + colGap;
      });
      var H = perCol * (2 * R + gap) + 30;
      var s = '', x = pad;
      sets.forEach(function (S) {
        if (!S[1]) return;
        var cols = Math.ceil(S[1] / perCol);
        for (var i = 0; i < S[1]; i++) {
          var cc = Math.floor(i / perCol), rr = i % perCol;
          var cx = x + cc * (2 * R + gap) + R, cy = 14 + rr * (2 * R + gap) + R;
          s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + C.card +
            '" stroke="' + S[3] + '" stroke-width="' + (f.ring === S[0] ? 3.5 : 2) + '"/>';
          s += txt(cx, cy + 4, S[2], { size: 11, mono: true, fill: S[3] });
        }
        x += cols * (2 * R + gap) + colGap;
      });
      return svg(W, H, s, Math.min(W, 460));
    },

    /* ── AR-11 / AR-14 / AR-15 · «баған түрінде бөлу» — the уголком layout used in
     * Kazakh / Russian textbooks: dividend on the LEFT, vertical bar, divisor
     * top-right, quotient written UNDER the divisor. (Not the Anglo form with
     * the quotient on top.)
     * {a: dividend, b: divisor, q: quotient or null, blank:true, rows:[{sub, at}]} */
    longdiv: function (f) {
      var a = String(f.a), b = String(f.b);
      var q = f.q == null ? '' : String(f.q);
      var qlen = q.length || String(Math.floor(f.a / f.b)).length;
      var CW = 20, pad = 12, top = 18;
      var rows = f.rows || [];
      var barX = pad + a.length * CW + 10;
      var rightW = Math.max(b.length, qlen) * CW + 16;
      var W = barX + rightW + pad;
      var H = top + 26 + rows.length * 28 + 22;
      var s = '';
      // dividend
      for (var i = 0; i < a.length; i++) {
        s += txt(pad + i * CW + CW / 2, top + 18, a[i], { size: 18, mono: true });
      }
      // corner: vertical bar + line under the divisor
      s += line(barX, top - 2, barX, top + 22 + rows.length * 28, { stroke: C.ink, sw: 2 });
      s += line(barX, top + 26, barX + rightW - 6, top + 26, { stroke: C.ink, sw: 2 });
      // divisor (top right)
      for (var j = 0; j < b.length; j++) {
        s += txt(barX + 10 + j * CW + CW / 2, top + 18, b[j], { size: 18, mono: true, fill: C.a });
      }
      // quotient (under the divisor)
      for (var k = 0; k < qlen; k++) {
        var ch = f.blank ? '?' : q[k];
        if (ch == null) continue;
        s += txt(barX + 10 + k * CW + CW / 2, top + 48, ch,
          { size: 18, mono: true, fill: f.blank ? C.dim : C.ok });
      }
      // worked subtraction rows under the dividend
      var y = top + 26;
      rows.forEach(function (r) {
        var sub = String(r.sub), off = (r.at || 0);
        for (var m = 0; m < sub.length; m++) {
          s += txt(pad + (off + m) * CW + CW / 2, y + 16, sub[m], { size: 16, mono: true, fill: C.b });
        }
        s += line(pad + off * CW, y + 22, pad + (off + sub.length) * CW, y + 22, { stroke: C.ink, sw: 1.5 });
        y += 28;
      });
      return svg(W, H, s, Math.min(W, 320));
    },

    /* ── AR-12 / AR-14 · helper table: divisor × 1..9 (the scaffold that fades) ──
     * {b: divisor, upto: last row shown, blanks: rows left empty} */
    helper: function (f) {
      var b = f.b, upto = f.upto || 9, blanks = f.blanks || [];
      // width = padding + "b × n =" label + gap + widest product + padding
      var CW = 9 + (String(b).length + 6) * 8 + 12 + String(b * upto).length * 8 + 9;
      var CH = 26, pad = 8;
      var W = CW + pad * 2, H = pad * 2 + upto * CH;
      var s = '';
      for (var i = 1; i <= upto; i++) {
        var y = pad + (i - 1) * CH;
        var hid = blanks.indexOf(i) >= 0;
        s += rect(pad, y, CW, CH, { fill: hid ? C.card : C.aLite, stroke: C.line, sw: 1, r: 3 });
        s += txt(pad + 9, y + CH / 2 + 5, b + ' × ' + i + ' =',
          { anchor: 'start', size: 13, mono: true, fill: C.dim });
        s += txt(pad + CW - 9, y + CH / 2 + 5, hid ? '?' : String(b * i),
          { anchor: 'end', size: 13, mono: true, fill: hid ? C.dim : C.a });
      }
      return svg(W, H, s, Math.min(W, 220));
    },

    /* ── AR-16..18 · base-ten blocks with the unit REDEFINED ──
     * 100-grid = 1 · strip = 0.1 · small square = 0.01
     * {ones, tenths, hundredths} — visually identical to the PV route's blocks. */
    decblocks: function (f) {
      var o = f.ones || 0, t = f.tenths || 0, h = f.hundredths || 0;
      var U = 11, G = 100, pad = 8, gap = 18;
      var W = pad, H = G + 34;
      W += o * (G + 10) + (o ? gap : 0);
      W += t * (U + 5) + (t ? gap : 0);
      W += Math.ceil(h / 5) * (U + 5) + (h ? gap : 0);
      var s = '', x = pad, base = 16 + G;
      var i, r, c;
      for (i = 0; i < o; i++) {
        for (r = 0; r < 10; r++) for (c = 0; c < 10; c++) {
          s += rect(x + c * (G / 10), 16 + r * (G / 10), G / 10 - 0.8, G / 10 - 0.8,
            { fill: C.a, stroke: C.card, sw: 0.5, r: 0.5 });
        }
        s += txt(x + G / 2, base + 16, '1', { size: 12, mono: true, fill: C.a });
        x += G + 10;
      }
      if (o) x += gap - 10;
      var tStart = x;
      for (i = 0; i < t; i++) {
        for (r = 0; r < 10; r++) {
          s += rect(x, 16 + r * (G / 10), U - 0.8, G / 10 - 0.8, { fill: C.b, stroke: C.card, sw: 0.5, r: 0.5 });
        }
        x += U + 5;
      }
      // one label under the whole group, not one per strip
      if (t) s += txt((tStart + x - 5) / 2, base + 16, '0.1', { size: 10, mono: true, fill: C.b });
      if (t) x += gap - 5;
      for (i = 0; i < h; i++) {
        c = Math.floor(i / 5); r = i % 5;
        s += rect(x + c * (U + 5), base - U - r * (U + 4), U - 0.8, U - 0.8,
          { fill: C.ok, stroke: C.card, sw: 0.5, r: 0.5 });
      }
      if (h) s += txt(x + (Math.ceil(h / 5) * (U + 5) - 5) / 2, base + 16, '0.01',
        { size: 10, mono: true, fill: C.ok });
      return svg(Math.max(W, 120), H, s, Math.min(Math.max(W, 120), 480));
    },

    /* ── AR-18 · the shift: both numbers ×10^k, the quotient does not change ──
     * {a, b, k} */
    shift: function (f) {
      var k = f.k, m = Math.pow(10, k);
      var W = 420, H = 118;
      var A = num(f.a), B = num(f.b);
      var A2 = num(Math.round(f.a * m * 1e6) / 1e6), B2 = num(Math.round(f.b * m * 1e6) / 1e6);
      var s = '';
      s += txt(110, 34, A + ' ÷ ' + B, { size: 20, mono: true });
      s += txt(310, 34, A2 + ' ÷ ' + B2, { size: 20, mono: true, fill: C.ok });
      s += '<path d="M175 28 Q 210 6 245 28" fill="none" stroke="' + C.b + '" stroke-width="2"/>';
      s += txt(210, 16, '× ' + m, { size: 12, mono: true, fill: C.b });
      s += '<path d="M175 42 Q 210 66 245 42" fill="none" stroke="' + C.b + '" stroke-width="2"/>';
      s += txt(210, 82, '× ' + m, { size: 12, mono: true, fill: C.b });
      s += line(40, 96, 380, 96, { stroke: C.line, sw: 1, dash: '4 4' });
      s += txt(210, 112, 'Бөлінді өзгермейді', { size: 13, fill: C.dim });
      return svg(W, H, s, 420);
    },

    /* ── AR-09 · bar model for remainder interpretation ──
     * {total, per, groups, rem} */
    rembar: function (f) {
      var n = f.groups, rem = f.rem, per = f.per;
      var W = 460, H = 78, pad = 14;
      var unit = (W - pad * 2) / (n + (rem ? rem / per : 0));
      var s = '', x = pad;
      for (var i = 0; i < n; i++) {
        s += rect(x, 18, unit - 2, 34, { fill: C.aLite, stroke: C.a, sw: 1.5, r: 3 });
        s += txt(x + unit / 2 - 1, 40, String(per), { size: 13, mono: true, fill: C.a });
        x += unit;
      }
      if (rem) {
        var rw = unit * rem / per;
        s += rect(x, 18, rw - 2, 34, { fill: C.card, stroke: C.bad, sw: 1.5, r: 3, dash: '4 3' });
        s += txt(x + rw / 2 - 1, 40, String(rem), { size: 13, mono: true, fill: C.bad });
      }
      s += txt(W / 2, 68, 'барлығы ' + f.total, { size: 12, fill: C.dim });
      return svg(W, H, s, 460);
    }
  };

  root.FIGS = Object.assign(root.FIGS || {}, FIGS);
})(typeof window !== 'undefined' ? window : this);
