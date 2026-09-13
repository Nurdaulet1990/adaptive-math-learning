/* fr/icons.js — the little picture inside each station on the route map (core/map.js).
   ICONS[stageId] = SVG markup drawn around (0,0), about 24×24. `currentColor` follows the station state
   (white on the current station, green on a passed one, grey on a locked one). Owner: assistant. */
const ICONS={
 'FR-01':'<circle r="11" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M0,0 L0,-11 A11,11 0 0,1 11,0Z" fill="currentColor"/>',
 'FR-02':'<rect x="-12" y="-10" width="24" height="7" rx="1.5" fill="currentColor"/><rect x="-12" y="2" width="14" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
 'FR-03':'<rect x="-12" y="-10" width="24" height="7" rx="1.5" fill="currentColor"/><rect x="-12" y="2" width="24" height="7" rx="1.5" fill="currentColor" opacity=".45"/><line x1="0" y1="-12" x2="0" y2="11" stroke="var(--panel)" stroke-width="1.4"/>',
 'FR-04':'<line x1="-12" y1="2" x2="12" y2="2" stroke="currentColor" stroke-width="2.2"/><line x1="-12" y1="-3" x2="-12" y2="7" stroke="currentColor" stroke-width="2.2"/><line x1="12" y1="-3" x2="12" y2="7" stroke="currentColor" stroke-width="2.2"/><circle cx="0" cy="2" r="3.6" fill="currentColor"/>',
 'FR-05':'<rect x="-12" y="-9" width="14" height="6" rx="1.5" fill="currentColor"/><rect x="-12" y="1" width="9" height="6" rx="1.5" fill="currentColor" opacity=".5"/><path d="M7,-1 h8 M11,-5 v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
 'FR-06':'<text x="0" y="5" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="600" font-size="15" fill="currentColor">1½</text>',
 'FR-07':'<circle cx="-6" cy="-6" r="3.6" fill="currentColor"/><circle cx="6" cy="-6" r="3.6" fill="currentColor" opacity=".35"/><circle cx="-6" cy="6" r="3.6" fill="currentColor" opacity=".35"/><circle cx="6" cy="6" r="3.6" fill="currentColor" opacity=".35"/>',
};
