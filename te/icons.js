/* te/icons.js — one per stage. SVG around (0,0) in a 48×48 viewBox, artwork within ±12, currentColor only. */
'use strict';
const bar=(segs)=>{let x=-14,h='';segs.forEach(s=>{h+=`<rect x="${x}" y="-6" width="${s[0]}" height="12" fill="${s[1]?'currentColor':'none'}" stroke="currentColor" stroke-width="1.6"/>`;x+=s[0];});return h;};
const q=(x)=>`<text x="${x}" y="4" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">?</text>`;
const ICONS={
 'TE-01':bar([[16,0],[12,0]])+q(8),        'TE-02':bar([[12,0],[16,0]])+q(-8),
 'TE-03':bar([[12,0],[16,0]])+q(6),        'TE-04':bar([[12,0],[14,0]])+`<text x="0" y="16" text-anchor="middle" font-size="10" fill="currentColor">?</text>`,
 'TE-05':bar([[9,0],[9,0],[9,0]])+q(-9)+q(0)+q(9),
 'TE-06':bar([[9,0],[9,0]])+`<rect x="4" y="-6" width="9" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/>`,
 'TE-07':bar([[9,0],[9,0]])+`<rect x="4" y="-6" width="9" height="12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/><text x="0" y="16" text-anchor="middle" font-size="9" fill="currentColor">:</text>`,
 'TE-08':bar([[9,0],[9,0],[9,0]])+`<text x="0" y="16" text-anchor="middle" font-size="10" fill="currentColor">?</text>`,
 'TE-09':`<rect x="-14" y="-7" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6,-7 l8,0 M6,7 l8,0 M10,-7 l0,14" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" fill="none"/>`,
 'TE-10':`<rect x="-14" y="-7" width="8" height="14" fill="currentColor"/><rect x="-4" y="-7" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
 'TE-11':`<rect x="-14" y="-7" width="28" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M-5,-7 v14 M4,-7 v14" stroke="currentColor" stroke-width="1.6"/>`,
 'TE-12':`<rect x="-14" y="-7" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="6" y="-7" width="8" height="14" fill="currentColor"/>`,
 'TE-13':`<rect x="-14" y="-7" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="-3" y="-7" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="8" y="-7" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
 'TE-14':`<rect x="-14" y="-7" width="8" height="14" rx="2" fill="currentColor"/><rect x="-3" y="-7" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="8" y="-7" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
 'TE-15':`<rect x="-14" y="-7" width="28" height="14" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="0" y="-7" width="14" height="14" fill="currentColor"/>`,
 'TE-16':`<rect x="-14" y="-7" width="28" height="14" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M-5,-7 v14 M4,-7 v14" stroke="currentColor" stroke-width="1.4" stroke-dasharray="3 2"/>`,
 'TE-17':`<text x="0" y="6" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor">3x</text>`,
 'TE-18':`<text x="0" y="6" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">x+x</text>`,
 'TE-19':`<text x="0" y="6" text-anchor="middle" font-size="13" font-weight="700" fill="currentColor">4x−x</text>`,
 'TE-20':`<rect x="-14" y="-8" width="28" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="-9" y="-4" width="18" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
};
