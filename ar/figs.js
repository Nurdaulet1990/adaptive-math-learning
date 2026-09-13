/* ar/figs.js — AR route drawings, part 1 of 2: the models the fact layer uses
 * (equal groups, dot array, number line, area model, grid method).
 * Part 2 — long-division frame, helper table, place-value discs, decimal blocks,
 * the ×10 shift, remainder bar — is in figs2.js. Both merge into the same global
 * FIGS object; the drawing primitives below are published as AR_DRAW for figs2.js,
 * so THIS FILE MUST LOAD FIRST.
 * Split from one 381-line file with the owner's approval (§2, §1 rule 5) — see MAP.md.
 *
 * §2: prefer core/figs.js; only AR-specific figures live here.
 * Each function takes the fig spec object and returns an SVG string. No DOM, no Core.
 */
(function (root) {
  'use strict';

  // Tokens are the ones core/ui.css actually defines, so figures follow the
  // light/dark theme and match the other routes. Fallbacks are for standalone
  // (file://) preview without ui.css.
  var C = {
    ink: 'var(--ink, #1B2733)',
    dim: 'var(--muted, #5E6B7A)',
    a: 'var(--accent, #0E7C9B)',
    aLite: 'var(--accent-soft, #E3F1F6)',
    b: 'var(--gold, #D99A1E)',
    bLite: 'var(--gold-soft, #FBF0D8)',
    ok: 'var(--good, #2E9E5B)',
    okLite: 'var(--good-soft, #E2F4E9)',
    bad: 'var(--bad, #CF4B3E)',
    line: 'var(--line, #DDE1E6)',
    card: 'var(--card, #FFFFFF)',
    seg1: 'var(--seg1, #F3B5AE)',
    seg2: 'var(--seg2, #A9C9F0)',
    whole: 'var(--whole, #B9E0C4)',
    stroke: 'var(--stroke, #1B2733)'
  };

  var MONO = 'ui-monospace, "Space Mono", Menlo, Consolas, monospace';
  var SANS = 'inherit';

  function svg(w, h, body, maxW) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" ' +
      'style="max-width:' + (maxW || Math.min(w, 520)) + 'px;height:auto;display:block;margin:0 auto" ' +
      'role="img" aria-hidden="true">' + body + '</svg>';
  }
  function txt(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '"' +
      ' text-anchor="' + (o.anchor || 'middle') + '"' +
      ' font-family="' + (o.mono ? MONO : SANS) + '"' +
      ' font-size="' + (o.size || 14) + '"' +
      ' font-weight="' + (o.weight || 600) + '"' +
      ' fill="' + (o.fill || C.ink) + '">' + s + '</text>';
  }
  function rect(x, y, w, h, o) {
    o = o || {};
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' +
      ' rx="' + (o.r == null ? 3 : o.r) + '"' +
      ' fill="' + (o.fill || 'none') + '"' +
      ' stroke="' + (o.stroke || C.line) + '"' +
      ' stroke-width="' + (o.sw || 1.5) + '"' +
      (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
  }
  function line(x1, y1, x2, y2, o) {
    o = o || {};
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"' +
      ' stroke="' + (o.stroke || C.ink) + '" stroke-width="' + (o.sw || 2) + '"' +
      ' stroke-linecap="round"' +
      (o.dash ? ' stroke-dasharray="' + o.dash + '"' : '') + '/>';
  }
  function dot(cx, cy, r, fill) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '"/>';
  }
  // Decimal separator: a DOT. (ROUTE_CONVENTION.md §8 currently says comma —
  // overridden by the platform owner on 2026-09-13; §8 needs amending.)
  function num(n) {
    return String(n);
  }

  var FIGS = {

    /* ── AR-01…03 · what the symbol MEANS: the expression on top, the quantity
     * under it, matching one to one.  Kazakh reads a × b as "a taken b times"
     * (3·4 = 3+3+3+3, per the Grade-2 textbook), so a × b draws **b rows of a**.
     * {a, b, icon, show:'expr'|'sum'|'both', answer:true} */
    meaning: function (f) {
      var a = f.a, b = f.b, ic = f.icon || '🍎';
      var rows = '';
      for (var r = 0; r < b; r++) {
        var cells = '';
        for (var i = 0; i < a; i++) cells += '<span>' + ic + '</span>';
        rows += '<div class="emoji-row" style="justify-content:center;gap:6px;' +
          'background:' + C.aLite + ';border-radius:10px;padding:4px 10px">' + cells + '</div>';
      }
      var head = '';
      if (f.show !== 'sum') {
        head += '<div class="expr" style="margin:0 0 4px">' + a + ' × ' + b +
          (f.answer ? ' = <b>' + a * b + '</b>' : '') + '</div>';
      }
      if (f.show === 'sum' || f.show === 'both') {
        var sum = []; for (var k = 0; k < b; k++) sum.push(a);
        head += '<div class="note" style="font-size:1rem;font-weight:800;margin:0 0 6px">' +
          sum.join(' + ') + (f.answer ? ' = ' + a * b : '') + '</div>';
      }
      return '<div style="display:flex;flex-direction:column;align-items:center;gap:6px">' +
        head + rows + '</div>';
    },

    /* ── AR-01 / AR-05 / AR-09 · equal groups, optionally with a remainder ──
     * {g: groups, n: per group, left: leftover count, hide: draw empty circles} */
    groups: function (f) {
      var g = f.g, n = f.n, left = f.left || 0;
      var R = 32, gap = 16, pad = 8;
      var perRow = Math.min(g, 5);
      var rows = Math.ceil(g / perRow);
      var W = perRow * (2 * R + gap) + pad * 2;
      var H = rows * (2 * R + gap) + pad * 2 + (left ? 46 : 0);
      var s = '';
      for (var i = 0; i < g; i++) {
        var col = i % perRow, row = Math.floor(i / perRow);
        var cx = pad + col * (2 * R + gap) + R + gap / 2;
        var cy = pad + row * (2 * R + gap) + R + gap / 2;
        s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + C.aLite +
          '" stroke="' + C.a + '" stroke-width="2"/>';
        if (!f.hide) {
          for (var j = 0; j < n; j++) {
            var ang = (j / Math.max(n, 1)) * 2 * Math.PI - Math.PI / 2;
            var rr = n <= 1 ? 0 : R * 0.52;
            s += dot((cx + rr * Math.cos(ang)).toFixed(1), (cy + rr * Math.sin(ang)).toFixed(1), 6, C.b);
          }
        }
      }
      if (left) {
        var ly = H - 24;
        s += txt(pad + 4, ly - 16, 'қалдық', { anchor: 'start', size: 12, fill: C.bad });
        for (var k = 0; k < left; k++) {
          s += dot(pad + 12 + k * 20, ly, 6, C.bad);
        }
      }
      return svg(W, H, s, Math.min(W, 480));
    },

    /* ── AR-03 / AR-04 / AR-07 · dot array, optional vertical split (distributive) ──
     * {r: rows, c: cols, split: cols in the first block} */
    array: function (f) {
      var r = f.r, c = f.c, sp = f.split || 0;
      var u = 20, pad = 26;
      var W = c * u + pad + 10, H = r * u + pad + 10;
      var s = '';
      if (sp > 0 && sp < c) {
        s += rect(pad - 4, pad - 4, sp * u, r * u, { fill: C.aLite, stroke: C.a, sw: 2, r: 6 });
        s += rect(pad - 4 + sp * u, pad - 4, (c - sp) * u, r * u, { fill: C.bLite, stroke: C.b, sw: 2, r: 6 });
      }
      for (var i = 0; i < r; i++) {
        for (var j = 0; j < c; j++) {
          s += dot(pad + j * u + u / 2 - 4, pad + i * u + u / 2 - 4, 6,
            (sp > 0 && j >= sp) ? C.b : C.a);
        }
      }
      s += txt(pad - 14, pad + r * u / 2, String(r), { size: 13, fill: C.dim, mono: true });
      s += txt(pad + c * u / 2 - 4, pad - 12, String(c), { size: 13, fill: C.dim, mono: true });
      return svg(W, H, s, Math.min(W, 400));
    },

    /* ── AR-01 / AR-04 · number line with equal jumps ──
     * {k: jump size, times: how many jumps, upto: axis max} */
    numline: function (f) {
      var k = f.k, t = f.times, max = f.upto || k * t;
      var W = 500, H = 96, x0 = 30, x1 = W - 20;
      var sc = (x1 - x0) / max;
      var s = line(x0, 64, x1, 64, { stroke: C.ink, sw: 2 });
      for (var v = 0; v <= max; v += k) {
        var x = x0 + v * sc;
        s += line(x, 58, x, 70, { stroke: C.ink, sw: 2 });
        s += txt(x, 86, String(v), { size: 12, mono: true, fill: C.dim });
      }
      for (var i = 0; i < t; i++) {
        var xa = x0 + i * k * sc, xb = x0 + (i + 1) * k * sc, mid = (xa + xb) / 2;
        s += '<path d="M' + xa + ' 60 Q ' + mid + ' 22 ' + xb + ' 60" fill="none" stroke="' +
          C.b + '" stroke-width="2.5"/>';
        s += txt(mid, 34, '+' + k, { size: 12, fill: C.b, mono: true });
      }
      return svg(W, H, s, 500);
    },

    /* ── AR-08 / AR-10 / AR-13 · area model, proportional rectangles ──
     * {rows:[n,...], cols:[n,...]} — 1×2 for AR-10, 2×2 for AR-13 */
    area: function (f) {
      var rs = f.rows, cs = f.cols;
      var totR = rs.reduce(function (a, b) { return a + b; }, 0);
      var totC = cs.reduce(function (a, b) { return a + b; }, 0);
      var BW = 300, BH = 170, pad = 34;
      var W = BW + pad + 14, H = BH + pad + 14;
      /* Strictly proportional bands collapse when the split is lopsided —
       * 60 + 2 gave the units band 10px and its label "8" fell outside the
       * rectangle. Every band keeps a readable minimum; the rest of the space
       * is still shared in proportion, so the picture stays ordered and only
       * stops being exactly to scale when it otherwise could not be read. */
      function bands(vals, total, span, min) {
        var thin = vals.some(function (v) { return span * v / total < min; });
        if (!thin) return vals.map(function (v) { return span * v / total; });
        var free = span - min * vals.length;
        return vals.map(function (v) { return min + free * v / total; });
      }
      var cw = bands(cs, totC, BW, 42), rh = bands(rs, totR, BH, 30);
      var s = '', y = pad;
      var fills = [C.seg2, C.seg1, C.whole, C.card];   // core/ui.css segment palette
      var fi = 0;
      for (var i = 0; i < rs.length; i++) {
        var hh = rh[i], x = pad;
        for (var j = 0; j < cs.length; j++) {
          var ww = cw[j];
          s += rect(x, y, ww, hh,{ fill: fills[fi % fills.length], stroke: C.ink, sw: 1.5, r: 2 });
          s += txt(x + ww / 2, y + hh / 2 + 5, String(rs[i] * cs[j]), { size: 15, mono: true });
          x += ww; fi++;
        }
        s += txt(pad - 8, y + hh / 2 + 5, String(rs[i]), { anchor: 'end', size: 13, mono: true, fill: C.dim });
        y += hh;
      }
      var cx = pad;
      for (var m = 0; m < cs.length; m++) {
        s += txt(cx + cw[m] / 2, pad - 10, String(cs[m]), { size: 13, mono: true, fill: C.dim });
        cx += cw[m];
      }
      return svg(W, H, s, Math.min(W, 420));
    },

    /* ── AR-13 · grid ("тор") method: equal boxes, the bridge to the column form ── */
    grid: function (f) {
      var rs = f.rows, cs = f.cols;
      var CW = 74, CH = 46, pad = 46;
      var W = pad + cs.length * CW + 12, H = pad + rs.length * CH + 12;
      var s = '';
      for (var j = 0; j < cs.length; j++) {
        s += txt(pad + j * CW + CW / 2, pad - 12, String(cs[j]), { size: 14, mono: true, fill: C.a });
      }
      for (var i = 0; i < rs.length; i++) {
        s += txt(pad - 10, pad + i * CH + CH / 2 + 5, String(rs[i]),
          { anchor: 'end', size: 14, mono: true, fill: C.b });
        for (var k = 0; k < cs.length; k++) {
          var x = pad + k * CW, y = pad + i * CH;
          s += rect(x, y, CW, CH, { fill: C.card, stroke: C.line, sw: 1.5, r: 4 });
          s += txt(x + CW / 2, y + CH / 2 + 5,
            f.blank ? '?' : String(rs[i] * cs[k]),
            { size: 15, mono: true, fill: f.blank ? C.dim : C.ink });
        }
      }
      return svg(W, H, s, Math.min(W, 400));
    },

  };

  root.FIGS = Object.assign(root.FIGS || {}, FIGS);
  root.AR_DRAW = { C: C, svg: svg, txt: txt, rect: rect, line: line, dot: dot, num: num };
})(typeof window !== 'undefined' ? window : this);
