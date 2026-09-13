/* Есеп жолы · core/map.js v1.0 — the route map: a road through the steppe with one station per stage.
   Owner: platform owner. Used by core/runner.js (FR, …) and wp/screens.js. Routes never draw it themselves.

   Core.map(opts) → HTML string (a scrollable <div class="mapbox"> with one SVG inside)
     opts.stages : [{id, name, sub, status:'passed'|'current'|'locked', stars:0..3, icon:'<svg markup>'}]  bottom → top
     opts.color  : CSS colour for the route (e.g. 'var(--fr)')
     opts.avatar : emoji standing on the current station (default 🦊)
   Core.mapScroll() — call once after the HTML is in the DOM: scrolls the current station into view.

   Station icons come from the route (see wp/icons.js, fr/icons.js): markup drawn around (0,0), ~24×24.
   Everything is SVG + emoji: no images, no libraries, works offline, follows the light/dark tokens. */
(function(){
'use strict';
const W=360, TOP=250, STEP=78, PADB=76;          // landscape zone, spacing between stations
const XS=[0.20,0.50,0.80,0.50];                   // serpentine
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* smooth curve through the points (Catmull-Rom → cubic bezier) */
function curve(p){
  if(p.length<2) return '';
  let d=`M${p[0].x},${p[0].y}`;
  for(let i=0;i<p.length-1;i++){
    const p0=p[i-1]||p[i], p1=p[i], p2=p[i+1], p3=p[i+2]||p[i+1];
    const c1={x:p1.x+(p2.x-p0.x)/6, y:p1.y+(p2.y-p0.y)/6};
    const c2={x:p2.x-(p3.x-p1.x)/6, y:p2.y-(p3.y-p1.y)/6};
    d+=`C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}
const star=(x,y,on)=>`<use href="#mp-star" x="${x}" y="${y}" width="11" height="11" ${on?'fill="var(--gold)"':'fill="none" stroke="var(--gold)" stroke-width="1.4"'}/>`;

function map(o){
  const st=o.stages||[], n=st.length; if(!n) return '';
  const C=o.color||'var(--accent)', ava=o.avatar||'🦊';
  const H=TOP+n*STEP+PADB;
  const pts=st.map((s,i)=>({x:Math.round(W*XS[i%4]+(i%2?6:-6)), y:H-PADB-i*STEP}));
  const path=curve(pts);
  // the walked part of the road ends at the current station (or at the last passed one)
  const curIdx=st.findIndex(s=>s.status==='current');
  const doneIdx=curIdx>=0?curIdx:st.reduce((a,s,i)=>s.status==='passed'?i:a,-1);
  const donePath=doneIdx>0?curve(pts.slice(0,doneIdx+1)):'';

  let g='';
  st.forEach((s,i)=>{
    const p=pts[i], cur=s.status==='current', passed=s.status==='passed';
    const R=cur?28:23;
    const right=p.x<W/2;                                   // label on the roomier side
    const lw=118, lx=right?p.x+R+9:p.x-R-9-lw, ly=p.y-17;
    const icon=s.icon||`<text x="0" y="6" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="600" font-size="16" fill="${cur?'#fff':passed?'var(--good)':'var(--muted)'}">${i+1}</text>`;
    g+=`<g${cur?' id="mp-cur"':''}${!cur&&!passed?' opacity=".62"':''}>`;
    if(cur) g+=`<circle class="mp-halo" cx="${p.x}" cy="${p.y}" r="${R+11}" fill="${C}"/>`;
    g+=`<circle cx="${p.x}" cy="${p.y}" r="${R}" fill="${cur?C:'var(--panel)'}" stroke="${cur?'var(--panel)':passed?'var(--good)':'var(--line)'}" stroke-width="${cur?3.5:passed?3.5:2.5}"/>`;
    g+=`<g transform="translate(${p.x},${p.y})" ${cur?'style="color:#fff"':passed?'style="color:var(--good)"':'style="color:var(--muted)"'}>${icon}</g>`;
    if(cur) g+=`<g class="mp-ava"><text x="${p.x}" y="${p.y-R-12}" text-anchor="middle" font-size="30">${ava}</text></g>`;
    if(passed&&s.stars!==undefined){ const sx=p.x-17; for(let k=0;k<3;k++) g+=star(sx+k*11.5, p.y+R-2, k<s.stars); }
    g+=`<rect x="${lx}" y="${ly}" width="${lw}" height="${cur?36:32}" rx="10" fill="var(--plate)"/>`;
    g+=`<text class="mp-name" x="${lx+9}" y="${ly+15}">${esc(s.name)}</text>`;
    g+=`<text class="mp-sub" x="${lx+9}" y="${ly+27}">${esc(s.sub||s.id)}</text></g>`;
  });

  return `<div class="mapbox"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label||'Жол картасы')}">
  <defs>
    <linearGradient id="mp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky1)"/><stop offset="1" stop-color="var(--sky2)"/></linearGradient>
    <linearGradient id="mp-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--g1)"/><stop offset="1" stop-color="var(--g2)"/></linearGradient>
    <radialGradient id="mp-sun"><stop offset="0" stop-color="var(--sun)" stop-opacity=".95"/><stop offset="1" stop-color="var(--sun)" stop-opacity="0"/></radialGradient>
    <symbol id="mp-star" viewBox="0 0 12 12"><path d="M6,0 7.6,4.1 12,4.5 8.7,7.5 9.7,12 6,9.6 2.3,12 3.3,7.5 0,4.5 4.4,4.1Z"/></symbol>
    <g id="mp-tulip"><path d="M0,0 L0,-15" stroke="var(--hill2)" stroke-width="1.6" stroke-linecap="round"/><path d="M-4,-8 q4,4 8,0" stroke="var(--hill2)" stroke-width="1.3" fill="none"/><path d="M-4,-15 q0,-7 4,-8 q4,1 4,8 q-4,3 -8,0Z" fill="var(--tulip)"/></g>
    <g id="mp-grass" stroke="var(--hill2)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".7"><path d="M0,0 v-8 M4,0 q-1,-6 4,-9 M-4,0 q1,-6 -4,-9"/></g>
  </defs>

  <rect width="${W}" height="${TOP+20}" fill="url(#mp-sky)"/>
  <g fill="#FFFFFF" opacity="var(--starop)"><circle cx="42" cy="40" r="1.3"/><circle cx="96" cy="22" r="1"/><circle cx="150" cy="52" r="1.4"/><circle cx="214" cy="30" r="1"/><circle cx="268" cy="60" r="1.3"/><circle cx="318" cy="34" r="1"/><circle cx="70" cy="88" r="1"/><circle cx="240" cy="96" r="1.2"/></g>
  <circle cx="292" cy="66" r="46" fill="url(#mp-sun)"/><circle cx="292" cy="66" r="17" fill="var(--sun)"/>
  <g stroke="var(--mtn)" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".75"><path d="M64,74 q6,-6 12,0"/><path d="M80,64 q6,-6 12,0"/><path d="M50,96 q5,-5 10,0"/></g>
  <path d="M0,252 L44,170 L78,204 L118,138 L158,196 L196,152 L236,206 L276,158 L316,202 L360,166 L360,252Z" fill="var(--mtn-far)"/>
  <path d="M118,138 L104,158 L134,158Z" fill="var(--snow)"/><path d="M276,158 L264,176 L290,176Z" fill="var(--snow)"/>
  <path d="M0,258 L52,206 L92,236 L140,192 L188,238 L232,200 L286,244 L330,212 L360,236 L360,258Z" fill="var(--mtn)" opacity=".85"/>
  <rect y="248" width="${W}" height="${H-248}" fill="url(#mp-gr)"/>
  <path d="M0,268 C58,246 108,278 168,262 C228,246 292,274 360,254 L360,300 L0,300Z" fill="var(--hill)"/>
  <path d="M0,292 C70,276 120,300 190,288 C258,276 300,296 360,284 L360,330 L0,330Z" fill="var(--hill2)" opacity=".55"/>

  <g transform="translate(300,214)">
    <path d="M-19,26 L-15,6 q15,-13 30,0 L19,26Z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-15,6 q15,-13 30,0" fill="none" stroke="var(--tulip)" stroke-width="2.4"/>
    <path d="M-4,26 L-4,15 q4,-4 8,0 L4,26Z" fill="var(--gold)" stroke="var(--ink)" stroke-width="1.2"/>
    <path d="M0,-7 L0,-19 L11,-15 L0,-11" fill="var(--tulip)" stroke="var(--ink)" stroke-width="1.1" stroke-linejoin="round"/>
  </g>

  <path d="${path}" fill="none" stroke="var(--road-edge)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${path}" fill="none" stroke="var(--road)" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${path}" fill="none" stroke="var(--road-line)" stroke-width="2.4" stroke-dasharray="9 13" stroke-linecap="round" opacity=".85"/>
  ${donePath?`<path d="${donePath}" fill="none" stroke="${C}" stroke-width="25" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`:''}

  <g transform="translate(26,${H-24})"><use href="#mp-tulip"/></g>
  <g transform="translate(336,${H-70}) scale(.85)"><use href="#mp-tulip"/></g>
  <g transform="translate(300,${H-40})"><use href="#mp-grass"/></g>
  <g transform="translate(38,${H-160})"><use href="#mp-grass"/></g>
  <g transform="translate(322,${H-260})"><use href="#mp-grass"/></g>
  ${g}
</svg></div>`;
}
function mapScroll(){ const el=document.getElementById('mp-cur'); const box=document.querySelector('.mapbox');
  if(!el||!box) return; const r=el.getBoundingClientRect(), b=box.getBoundingClientRect();
  box.scrollTop += (r.top-b.top) - box.clientHeight/2 + r.height/2; }

/* stars for a finished stage: best test result → 8/10 = ★, 9/10 = ★★, 10/10 = ★★★ */
function stars(stage){ const t=(stage&&stage.tests)||[]; if(!t.length) return 0;
  const best=t.reduce((a,x)=>Math.max(a,x.n?x.ok/x.n:0),0);
  return best>=1?3:best>=0.9?2:best>=0.8?1:0; }

window.Core=window.Core||{}; Core.map=map; Core.mapScroll=mapScroll; Core.mapStars=stars;
})();
