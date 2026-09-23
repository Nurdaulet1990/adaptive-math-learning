/* pv/discs.js — the Dimensions Math place-value disc chart, with the exchange drawn.
   Owner: platform owner. Built from the two textbook pages the owner supplied on 2026-09-23.

   NOT YET WIRED INTO THE APP. pv/index.html does not load this file; pv/_discs.html does, so the chart can
   be looked at before any level starts using it. Wiring = one <script> tag plus swapping the figure in
   genOps for a7…a10, s4…s7, a4d1…a4d4, s4d1…s4d4 (16 levels).

   Why it exists: the chart itself is already in pv/index.html (renderPVCell draws the two addends into
   .pv-chart columns) — and it does not draw the one thing at these levels worth drawing, the REGROUPING.
   A child looking at it sees two rows of discs and no account of where the carry came from or what the
   borrow did. The textbook's answer is three marks:

     · a disc being spent is drawn DASHED, in the column it leaves
     · a blue arrow curves from it to the column it lands in
     · what it becomes is drawn there, inside a light box, so it reads as «this is the ten that arrived»

   and for subtraction, every disc taken away is CROSSED OUT rather than removed, so the picture still
   shows what the number was.

   Two entry points, both returning one SVG string:
     DISCS.sub(a, b)   628 − 356
     DISCS.add(a, b)   685 + 207
   Both work for 2, 3 and 4 places; the place count follows the larger number. */
'use strict';
const DISCS = (function () {
  const PLACES = [1000, 100, 10, 1];
  const NAME = { 1000: 'Мыңдық', 100: 'Жүздік', 10: 'Ондық', 1: 'Бірлік' };
  /* One colour per place, as the textbook has them. These are the route's own tokens where they exist, so
     the chart follows light/dark with everything else. */
  const FILL = { 1000: 'var(--pv-th, #7E57C2)', 100: 'var(--pv-h, #E8A33D)', 10: 'var(--pv-t, #D9534F)', 1: 'var(--pv-o, #90A4AE)' };
  const W = 340, R = 13, GAP = 3, PER_ROW = 5;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const digitsOf = (n, k) => String(n).padStart(k, '0').split('').map(Number);
  const placesFor = (...ns) => Math.max(...ns.map(n => String(n).length));

  // one disc; `state` is 'solid' | 'gone' (crossed out) | 'ghost' (dashed — it is being spent)
  function disc(cx, cy, place, state) {
    const f = FILL[place];
    if (state === 'ghost')
      return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${f}" stroke-width="2" stroke-dasharray="4 3"/>`
        + `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="${f}">${place}</text>`;
    let s = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${f}" opacity="${state === 'gone' ? 0.35 : 1}"/>`
      + `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" opacity="${state === 'gone' ? 0.6 : 1}">${place}</text>`;
    if (state === 'gone') {
      const d = R - 2;
      s += `<line x1="${cx - d}" y1="${cy - d}" x2="${cx + d}" y2="${cy + d}" stroke="var(--bad, #CF4B3E)" stroke-width="2.5" stroke-linecap="round"/>`
        + `<line x1="${cx + d}" y1="${cy - d}" x2="${cx - d}" y2="${cy + d}" stroke="var(--bad, #CF4B3E)" stroke-width="2.5" stroke-linecap="round"/>`;
    }
    return s;
  }

  // a run of discs laid out in rows of five inside a column; returns {svg, h}
  function pile(x, y, w, place, states) {
    let s = '', step = 2 * R + GAP;
    const cols = Math.min(PER_ROW, Math.max(1, Math.floor(w / step)));
    states.forEach((st, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      s += disc(x + c * step + R + 2, y + r * step + R, place, st);
    });
    const rows = Math.max(1, Math.ceil(states.length / cols));
    return { svg: s, h: states.length ? rows * step : 0 };
  }

  /* The blue arrow that carries a unit from one column to another. It is the only curved line in the
     whole course, and it means exactly one thing: this became that. */
  function arrow(x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 26;
    return `<path d="M${x1},${y1} Q${mx},${my} ${x2},${y2}" fill="none" stroke="var(--accent, #0E7C9B)" stroke-width="2.5" marker-end="url(#dq)"/>`;
  }
  const DEFS = `<defs><marker id="dq" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">`
    + `<path d="M0,0 L10,5 L0,10 z" fill="var(--accent, #0E7C9B)"/></marker></defs>`;

  function frame(nP, bodyH, headH = 22) {
    const colW = (W - 8) / nP;
    let s = '';
    for (let i = 0; i < nP; i++) {
      const x = 4 + i * colW;
      s += `<rect x="${x}" y="2" width="${colW}" height="${headH + bodyH}" fill="none" stroke="var(--line, #DDE1E6)" stroke-width="1.5"/>`;
    }
    return { svg: s, colW, headH };
  }

  return {
    /* ── subtraction ──────────────────────────────────────────────────────────────────
       Every disc of the first number is drawn. The ones being taken away are crossed out, not
       removed — the picture has to keep saying what the number was. Where a column cannot pay,
       one disc of the column to its left is drawn dashed and an arrow carries it right, where it
       arrives as ten discs in a box of their own. */
    sub(a, b) {
      const nP = placesFor(a, b), P = PLACES.slice(4 - nP);
      const A = digitsOf(a, nP), B = digitsOf(b, nP);
      const have = A.slice(), lent = new Array(nP).fill(0), got = new Array(nP).fill(0);
      for (let i = nP - 1; i >= 0; i--) {
        if (have[i] < B[i]) {
          let j = i - 1; while (j >= 0 && have[j] === 0) j--;
          if (j >= 0) { have[j]--; lent[j]++; for (let k = j + 1; k <= i; k++) { got[k] += 10; have[k] += (k === i ? 10 : 9); if (k < i) lent[k]++; } }
        }
        have[i] -= B[i];
      }
      /* Each column's discs, as states, before anything is drawn. A column can lend from discs it never
         had: 4072 − 1385 gives the hundreds ten from the thousand and then lends one of THOSE on to the
         tens. Ghosting only the original discs left that loan invisible — the hundreds read 7 left when
         6 was the truth. So the ghosts are taken from the original pile first and from the arrived pile
         after it, and the crossings then fall on what is actually still there. */
      const cols = [];
      for (let i = 0; i < nP; i++) {
        const fromOrig = Math.min(lent[i], A[i]), fromGot = lent[i] - fromOrig;
        const orig = Array.from({ length: A[i] }, (_, k) => k < A[i] - fromOrig ? 'solid' : 'ghost');
        const arrived = Array.from({ length: got[i] }, (_, k) => k < got[i] - fromGot ? 'solid' : 'ghost');
        let toCross = B[i];                       // cross the last of what is still there, reading orig then arrived
        for (const pile of [arrived, orig]) for (let k = pile.length - 1; k >= 0 && toCross > 0; k--)
          if (pile[k] === 'solid') { pile[k] = 'gone'; toCross--; }
        cols.push({ orig, arrived });
      }

      const { colW, headH } = frame(nP, 0);
      let body = '', maxH = 0; const anchors = [];
      for (let i = 0; i < nP; i++) {
        const x = 4 + i * colW, place = P[i], c = cols[i];
        const p1 = pile(x + 4, headH + 4, colW - 8, place, c.orig);
        let h = p1.h, col = p1.svg;
        anchors.push({ x: x + colW / 2, yBot: headH + 4 + h });
        if (c.arrived.length) {
          const boxY = headH + 8 + h;
          const p2 = pile(x + 6, boxY + 4, colW - 12, place, c.arrived);
          col += `<rect x="${x + 3}" y="${boxY}" width="${colW - 6}" height="${p2.h + 8}" rx="5" fill="none" stroke="var(--accent, #0E7C9B)" stroke-width="1.5" stroke-dasharray="5 3"/>` + p2.svg;
          h += p2.h + 12;
          anchors[i].yBox = boxY + 4 + R;
          anchors[i].yBoxBot = boxY + p2.h;
        }
        body += col; maxH = Math.max(maxH, h);
      }
      /* The arrow leaves from wherever the lent disc actually is — the original pile, or the box of ones
         that arrived a moment ago. Starting it at the column's edge would hide exactly that. */
      let arrows = '';
      for (let i = 0; i < nP; i++) {
        if (!lent[i] || !anchors[i + 1] || anchors[i + 1].yBox === undefined) continue;
        const lentFromBox = lent[i] > A[i];
        const y1 = lentFromBox ? anchors[i].yBoxBot - R : anchors[i].yBot - R;
        arrows += arrow(anchors[i].x, y1, anchors[i + 1].x, anchors[i + 1].yBox - R - 4);
      }
      const f = frame(nP, maxH + 10);
      let head = '';
      for (let i = 0; i < nP; i++) head += `<text x="${4 + i * colW + colW / 2}" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="var(--muted, #5E6B7A)">${esc(NAME[P[i]])}</text>`;
      const H = headH + maxH + 14;
      return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,system-ui,sans-serif" style="max-width:100%;height:auto">`
        + DEFS + f.svg + head + body + arrows + '</svg>';
    },

    /* ── addition ─────────────────────────────────────────────────────────────────────
       One row per addend. Where a column reaches ten, those ten are boxed and an arrow carries
       one unit to the column on the left, where it arrives dashed — it is not yet counted with
       the rest, and the child is the one who counts it. */
    add(a, b) {
      const nP = placesFor(a, b, a + b), P = PLACES.slice(4 - nP);
      const A = digitsOf(a, nP), B = digitsOf(b, nP);
      const { colW, headH } = frame(nP, 0);
      const rowGap = 8;
      let rowsSvg = '', hA = 0, hB = 0;
      const anchors = [];
      for (let i = 0; i < nP; i++) {
        const x = 4 + i * colW, place = P[i];
        const pA = pile(x + 4, headH + 4, colW - 8, place, new Array(A[i]).fill('solid'));
        hA = Math.max(hA, pA.h); rowsSvg += pA.svg;
        anchors.push({ x: x + colW / 2 });
      }
      const yB = headH + 4 + hA + rowGap;
      for (let i = 0; i < nP; i++) {
        const x = 4 + i * colW, place = P[i];
        const pB = pile(x + 4, yB, colW - 8, place, new Array(B[i]).fill('solid'));
        hB = Math.max(hB, pB.h); rowsSvg += pB.svg;
        anchors[i].yBot = yB + pB.h;
      }
      // the dotted rule between the two addends, as in the book
      let sep = `<line x1="6" y1="${yB - rowGap / 2}" x2="${W - 6}" y2="${yB - rowGap / 2}" stroke="var(--line, #DDE1E6)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
      let marks = '', arrows = '';
      for (let i = nP - 1; i > 0; i--) {
        if (A[i] + B[i] < 10) continue;
        const x = 4 + i * colW, step = 2 * R + GAP;
        const cols = Math.min(PER_ROW, Math.max(1, Math.floor((colW - 8) / step)));
        /* Exactly TEN discs are enclosed, not the whole column: ten is what becomes the one that moves.
           The ten run across the two addend rows, so it takes two outlines — all of the first row, and as
           much of the second as is needed to reach ten. Boxing the whole column would say «all of these
           become one», which is only true when the column holds exactly ten. */
        const inA = Math.min(A[i], 10), inB = 10 - inA;
        const boxOf = (n, y0) => { const r = Math.ceil(n / cols), w = Math.min(n, cols) * step + 4;
          return `<rect x="${x + 2}" y="${y0 - 2}" width="${w}" height="${r * step + 4}" rx="6" fill="none" stroke="var(--accent, #0E7C9B)" stroke-width="1.5" stroke-dasharray="5 3"/>`; };
        if (inA) marks += boxOf(inA, headH + 4);
        if (inB > 0) marks += boxOf(inB, yB);
        // it arrives in the column on the left, dashed, ABOVE the chart — clear of the column headings
        const lx = 4 + (i - 1) * colW + colW / 2, cy = -12;
        marks += disc(lx, cy, P[i - 1], 'ghost');
        arrows += arrow(x + colW / 2, headH + 2, lx + R + 6, cy);
      }
      const maxH = yB + hB + 10 - headH;
      const f = frame(nP, maxH);
      let head = '';
      for (let i = 0; i < nP; i++) head += `<text x="${4 + i * colW + colW / 2}" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="var(--muted, #5E6B7A)">${esc(NAME[P[i]])}</text>`;
      const H = headH + maxH + 22;
      return `<svg viewBox="0 -26 ${W} ${H + 26}" width="${W}" height="${H + 26}" xmlns="http://www.w3.org/2000/svg" font-family="Nunito,system-ui,sans-serif" style="max-width:100%;height:auto">`
        + DEFS + f.svg + head + sep + rowsSvg + marks + arrows + '</svg>';
    },
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = DISCS;
