/* te/figs2.js — the multi-step equation drawings, built to the signed-off 《多步方程画法》 grammar.
   Owner: platform owner (the grammar is the owner's; this file only draws it).

   NOT YET WIRED INTO THE ROUTE. te/index.html does not load this file; te/_sample.html does, so the
   drawings can be looked at on a phone before any question starts using them. Wiring = one <script>
   tag plus the fig types in te/generate.js.

   The five drawings, and the equation shape each one is for:

     s1     x : b + a = e            two rows: cut, then take one part out and append to it
     s1b    (x + a) : b = c          two rows: the same strip divided two ways
     s1c    (x + a) · b = e          b copies side by side, in ONE row
     s1cp   e : (x + a) = c          the unknown is the DIVISOR: show the deadlock, rewrite, then s1c
     s1d    (x + a) · b + k = e      three levels, three brackets

   The ten rules the grammar sets, and where each one is in this file:

     ① jagged = taken away (minus), straight = shared out (divide)   — no jagged edge appears here: none
        of these five equations takes anything away. Subtraction keeps lid/torn in te/figs.js.
     ② cut = ×÷, append = +−. A cut changes the structure, not the total; an append changes the total,
        not the structure. In s1 the two rows ARE those two actions, which is why there are two rows.
     ③ a bracket means compose first, then cut. The composing row is on top, the cutting row below, and
        the two rows are the same strip — so they must be flush at BOTH ends (`W` is shared).
     ④ the two ways of dividing do not line up, and that has to be drawn: `redLine()`.
     ⑤ × and ÷ are the same picture; the difference is which level the bracket hangs on. s1b spans the
        whole strip, s1c spans one copy. That is the only difference between them.
     ⑥ ×N is always N copies in one row, never stacked.
     ⑦ two line weights only: a dividing line is 2.5 (the same as the frame), a composing line is 1.5.
     ⑧ when the unknown lands on the divisor, rewrite with the fact family first — s1cp.
     ⑨ three levels are three brackets, never three line weights.
     ⑩ a segment containing the unknown is filled, a pure number is not.

   And the one that is not about drawing at all: a demonstration number may not coincide with a part
   boundary. That is enforced in te/generate.js, not here — a drawing cannot defend itself against
   numbers that lie. */
'use strict';
const FIGS2 = (function () {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const W = 340, L = 16, R = 16, AW = W - L - R;       // one phone-width column
  const HEAVY = 2.5, LIGHT = 1.5;                       // rule ⑦ — the only two weights there are
  const FILL_X = 'var(--seg2)', FILL_N = 'var(--card)';// rule ⑩ — filled holds the unknown, plain is a number
  const UNK = 'var(--te, #A5642A)';                     // the unknown bracket: dashed, ochre
  const KNOWN = 'var(--stroke)';                        // the known bracket: solid, ink

  const svg = (h, inner) => `<svg viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" xmlns="http://www.w3.org/2000/svg" `
    + `font-family="Nunito,system-ui,sans-serif" font-weight="800" style="max-width:100%;height:auto">${inner}</svg>`;
  const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.a || 'middle'}" fill="${o.c || 'var(--ink)'}" `
    + `font-size="${o.s || 14}"${o.w ? ` font-weight="${o.w}"` : ''}>${esc(s)}</text>`;
  const box = (x, y, w, h, fill, weight) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="var(--stroke)" stroke-width="${weight}"/>`;
  const vline = (x, y, h, weight) =>
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="var(--stroke)" stroke-width="${weight}"/>`;

  /* A bracket over or under a span. Unknown = dashed + ochre (rule: unknown above, known below). */
  function brace(x1, x2, y, label, o = {}) {
    const up = o.up !== false, d = up ? -1 : 1, c = o.unknown ? UNK : KNOWN;
    const dash = o.unknown ? ' stroke-dasharray="6 4"' : '';
    const mid = (x1 + x2) / 2, ly = y + d * 15;
    return `<path d="M${x1},${y + d * 10} V${y} H${x2} V${y + d * 10}" fill="none" stroke="${c}" stroke-width="2"${dash}/>`
      + `<line x1="${mid}" y1="${y}" x2="${mid}" y2="${y - d * 0}" stroke="${c}" stroke-width="2"${dash}/>`
      + (o.label === '' ? '' : t(mid, up ? ly - 2 : ly + 12, label, { c, s: o.fs || 15 }));
  }
  /* rule ④ — where the composing boundary falls inside a part, in red, so it cannot be read as a part edge */
  const redLine = (x, y, h) =>
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + h}" stroke="var(--bad)" stroke-width="2" stroke-dasharray="5 4"/>`;
  const scaleNote = y => t(W - R, y, 'масштаб емес', { a: 'end', c: 'var(--muted)', s: 11, w: 600 });

  /* One copy of «x + a»: a filled cell for x beside a plain cell for a, split by a LIGHT line (they are
     composed, not divided). The x cell is a neutral width — it is unknown, so its length means nothing. */
  function copy(x, y, w, h, a, o = {}) {
    const xw = Math.round(w * 0.58), aw = w - xw;
    /* The fills carry NO stroke of their own. Two stroked boxes side by side put two heavy edges on the
       x∣a boundary, which is a composing line and must be LIGHT — the drawing would then say the copy is
       divided there, when it is composed there. One frame, one light divider inside it. (rule ⑦) */
    return `<rect x="${x}" y="${y}" width="${xw}" height="${h}" fill="${FILL_X}"/>`
      + `<rect x="${x + xw}" y="${y}" width="${aw}" height="${h}" fill="${FILL_N}"/>`
      + vline(x + xw, y, h, LIGHT)
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="var(--stroke)" stroke-width="${HEAVY}"/>`
      + t(x + xw / 2, y + h / 2 + 5, 'x', { s: 15 }) + t(x + xw + aw / 2, y + h / 2 + 5, a, { s: 14 })
      + (o.red ? redLine(x + xw, y - 4, h + 8) : '');
  }

  return {

    /* ── s1 · x : b + a = e ────────────────────────────────────────────────────────────────
       Row 1 cuts x into b parts. Row 2 takes ONE of them out and appends a to it; the bracket
       under row 2 is e. The two rows are one action each — rule ②. The part in row 2 is the
       same object as the marked part in row 1: the marked frame and the leader line together
       say so, and neither alone is enough. */
    s1(f) {
      const b = +f.b, a = f.a, e = f.e, H = 40;
      const pw = Math.min(56, Math.floor(AW / b)), rowW = pw * b;
      const y1 = 44, y2 = 146;
      let s = brace(L, L + rowW, y1 - 8, 'x', { unknown: true, up: true });
      for (let i = 0; i < b; i++) s += box(L + i * pw, y1, pw, H, FILL_X, HEAVY);
      for (let i = 1; i < b; i++) s += vline(L + i * pw, y1, H, HEAVY);      // rule ⑦: dividing lines are heavy
      s += t(L + rowW, y1 + H + 15, `${b} тең бөлік`, { a: 'end', c: 'var(--muted)', s: 12 });

      // the chosen part: a bold ochre frame and a triangle pointing down at it — never hatching,
      // which already means «unknown» elsewhere in the course
      const cx = L + pw / 2;
      s += `<rect x="${L + 1}" y="${y1 + 1}" width="${pw - 2}" height="${H - 2}" fill="none" stroke="${UNK}" stroke-width="3"/>`;
      s += `<path d="M${cx - 7},${y1 - 14} h14 l-7,10 Z" fill="${UNK}"/>`;
      /* the leader line has to LAND: it is the only thing saying the cell below is the cell above */
      s += `<line x1="${cx}" y1="${y1 + H + 2}" x2="${cx}" y2="${y2 - 2}" stroke="${UNK}" stroke-width="2" stroke-dasharray="4 4"/>`;

      // row 2 — that one part, with a appended BESIDE IT. Appending a to the right of the whole
      // strip instead would draw x + a, which is a different equation; this is the one fatal slip.
      const aw = Math.round(pw * 1.25);
      s += `<rect x="${L}" y="${y2}" width="${pw}" height="${H}" fill="${FILL_X}" stroke="${UNK}" stroke-width="3"/>`;
      s += box(L + pw, y2, aw, H, FILL_N, HEAVY) + t(L + pw + aw / 2, y2 + 26, a, { s: 15 });
      s += brace(L, L + pw + aw, y2 + H + 10, e, { up: false });
      s += scaleNote(y2 + H + 46);
      return svg(y2 + H + 54, s);
    },

    /* ── s1b · (x + a) : b = c ─────────────────────────────────────────────────────────────
       One strip, divided two ways. Top: how it is composed (x and a, LIGHT line). Bottom: how it
       is shared out (b equal parts, HEAVY lines), every part labelled c — «: b = c» says each
       part is c, and writing all of them lets the child assemble b × c without being told.
       The ends are flush because it is the same strip; the red line is the whole point. */
    s1b(f) {
      const b = +f.b, a = f.a, c = f.c, H = 40, rowW = AW;
      const y1 = 42, y2 = 112;
      /* 0.68 of four parts lands inside part three and away from its centre. At 0.62 it sat exactly on
         that part's label and the red line struck through the digit. Neither the edge nor the middle. */
      const xw = Math.round(rowW * 0.68);
      let s = brace(L, L + rowW, y1 - 8, `x + ${a}`, { unknown: true, up: true });
      s += box(L, y1, xw, H, FILL_X, HEAVY) + box(L + xw, y1, rowW - xw, H, FILL_N, HEAVY) + vline(L + xw, y1, H, LIGHT);
      s += t(L + xw / 2, y1 + 26, 'x', { s: 16 }) + t(L + xw + (rowW - xw) / 2, y1 + 26, a, { s: 15 });
      s += t(L, y1 + H + 15, 'құрамы', { a: 'start', c: 'var(--muted)', s: 12 });

      const pw = rowW / b;
      s += box(L, y2, rowW, H, 'none', HEAVY);
      for (let i = 1; i < b; i++) s += vline(L + i * pw, y2, H, HEAVY);
      for (let i = 0; i < b; i++) s += t(L + i * pw + pw / 2, y2 + 26, c, { s: 14 });
      s += t(L, y2 + H + 15, `${b} тең бөлік`, { a: 'start', c: 'var(--muted)', s: 12 });
      s += redLine(L + xw, y1 - 4, (y2 + H + 4) - (y1 - 4));   // it crosses BOTH rows: that is the claim
      s += scaleNote(y2 + H + 36);
      return svg(y2 + H + 44, s);
    },

    /* ── s1c · (x + a) · b = e ─────────────────────────────────────────────────────────────
       The same strip as s1b, divided into the same b parts — the ONLY difference is that the
       unknown bracket hangs over one copy instead of over the whole (rule ⑤). Every copy is
       drawn out in full: «b of the same thing» is said by the repetition, not by writing ×b. */
    s1c(f) {
      const b = +f.b, a = f.a, e = f.e, H = 40;
      const cw = Math.min(64, Math.floor(AW / b)), rowW = cw * b, y = 46;
      let s = '';
      for (let i = 0; i < b; i++) s += copy(L + i * cw, y, cw, H, a);
      for (let i = 1; i < b; i++) s += vline(L + i * cw, y, H, HEAVY);
      s += brace(L, L + cw, y - 8, `x + ${a}`, { unknown: true, up: true, fs: 14 });
      s += brace(L, L + rowW, y + H + 8, e, { up: false });
      s += t(L + rowW / 2, y + H + 50, `${b} рет`, { c: 'var(--muted)', s: 12 });
      s += scaleNote(y + H + 50);
      return svg(y + H + 58, s);
    },

    /* ── s1cp · e : (x + a) = c ────────────────────────────────────────────────────────────
       The unknown is the divisor, so the number of parts is unknown: there is no honest number of
       cells to draw. The top half draws that deadlock on purpose — a child has to meet it before
       the rewrite means anything. One fact-family rewrite (a : b = c ⟺ a : c = b) makes the count
       known, and the bottom half is then the ordinary s1c. No new drawing is needed, only a rewrite. */
    s1cp(f) {
      const a = f.a, c = +f.c, e = f.e, H = 38, y1 = 44;
      let s = t(L, 18, 'Неше бөлік? Белгісіз —', { a: 'start', c: 'var(--bad)', s: 13 });
      s += `<rect x="${L}" y="${y1}" width="${AW}" height="${H}" fill="none" stroke="var(--bad)" stroke-width="2" stroke-dasharray="7 5"/>`;
      for (let i = 1; i < 4; i++) s += `<line x1="${L + i * AW / 4}" y1="${y1}" x2="${L + i * AW / 4}" y2="${y1 + H}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
      for (let i = 0; i < 4; i++) s += t(L + i * AW / 4 + AW / 8, y1 + 25, '?', { c: 'var(--bad)', s: 17 });
      const cx = L + AW / 2, cy = y1 + H + 22;
      s += `<line x1="${cx - 9}" y1="${cy - 9}" x2="${cx + 9}" y2="${cy + 9}" stroke="var(--bad)" stroke-width="3"/>`
        + `<line x1="${cx + 9}" y1="${cy - 9}" x2="${cx - 9}" y2="${cy + 9}" stroke="var(--bad)" stroke-width="3"/>`;

      const y2 = cy + 30;
      s += t(L, y2, `${e} : ${c} = x + ${a}`, { a: 'start', s: 15, c: 'var(--good)' });
      s += t(L + AW, y2, 'отбасын пайдаландық', { a: 'end', c: 'var(--muted)', s: 11, w: 600 });

      const y3 = y2 + 40, cw = Math.min(64, Math.floor(AW / c)), rowW = cw * c;
      let g = '';
      for (let i = 0; i < c; i++) g += copy(L + i * cw, y3 + 14, cw, H, a);
      for (let i = 1; i < c; i++) g += vline(L + i * cw, y3 + 14, H, HEAVY);
      s += g + brace(L, L + cw, y3 + 6, `x + ${a}`, { unknown: true, up: true, fs: 14 });
      s += brace(L, L + rowW, y3 + 14 + H + 8, e, { up: false });
      s += scaleNote(y3 + 14 + H + 46);
      return svg(y3 + 14 + H + 54, s);
    },

    /* ── s1d · (x + a) · b + k = e ─────────────────────────────────────────────────────────
       Three levels, three brackets (rule ⑨): innermost over one copy, middle over the b copies —
       left EMPTY on purpose, because naming the middle quantity would be giving it a second
       letter — and outermost over everything. Read the brackets outside in and they are the three
       steps. k is a plain number appended at the outermost level, so it is unfilled and the line
       between it and the copies is a structural one. */
    s1d(f) {
      const b = +f.b, a = f.a, k = f.k, e = f.e, H = 38, y = 62;
      const kw = 52, cw = Math.min(56, Math.floor((AW - kw - 4) / b)), grpW = cw * b;
      let s = '';
      for (let i = 0; i < b; i++) s += copy(L + i * cw, y, cw, H, a);
      for (let i = 1; i < b; i++) s += vline(L + i * cw, y, H, HEAVY);
      s += box(L + grpW, y, kw, H, FILL_N, HEAVY) + t(L + grpW + kw / 2, y + 25, k, { s: 15 });
      s += brace(L, L + cw, y - 8, `x + ${a}`, { unknown: true, up: true, fs: 13 });
      s += brace(L, L + grpW, y - 34, '', { up: true, label: '' });      // the middle quantity keeps no name
      s += t(L + grpW / 2, y - 40, '?', { c: KNOWN, s: 15 });
      s += brace(L, L + grpW + kw, y + H + 8, e, { up: false });
      s += t(L + grpW + kw / 2, y - 12, 'қосылды', { c: 'var(--muted)', s: 11 });
      s += t(L, y + H + 46, `${b} рет`, { a: 'start', c: 'var(--muted)', s: 11 });
      s += scaleNote(y + H + 46);
      return svg(y + H + 56, s);
    },
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FIGS2;
