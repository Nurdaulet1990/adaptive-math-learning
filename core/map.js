/* Есеп жолы · core/map.js v2 — the route map: a road through the steppe, one station per stage.
   Owner: platform owner. Used by core/runner.js and wp/screens.js. Routes never draw it themselves.

   The landscape and the road are one SVG (scales with the width); every station is HTML positioned on top
   in the same coordinate system, so names wrap properly and each station is tappable.

   Core.map(opts) → HTML string
     opts.stages : [{id, name, sub, status:'passed'|'current'|'locked', stars:0..3, icon:'<svg markup>'}]  bottom → top
     opts.color  : route colour, e.g. 'var(--fr)'
     opts.avatar : emoji standing on the current station
   Core.mapBind(fn) — after inserting: fn(stageId) fires when a passed/current station is tapped.
   Core.mapScroll() — scrolls the current station into view.
   Core.mapStars(stage) — 0..3 from the stage's best test result. */
(function(){
'use strict';
const W=360, TOP=250, STEP=98, PADB=84;
const XS=[0.24,0.56,0.78,0.44];
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');

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

function map(o){
  const st=o.stages||[], n=st.length; if(!n) return '';
  const C=o.color||'var(--accent)', ava=o.avatar||'🦊';
  const H=TOP+n*STEP+PADB;
  const pts=st.map((s,i)=>({x:Math.round(W*XS[i%4]), y:H-PADB-i*STEP}));
  const road=curve(pts);
  const curIdx=st.findIndex(s=>s.status==='current');
  const doneIdx=curIdx>=0?curIdx:st.reduce((a,s,i)=>s.status==='passed'?i:a,-1);
  const done=doneIdx>0?curve(pts.slice(0,doneIdx+1)):'';

  /* stations as HTML on top of the SVG — same coordinate system, so % maps exactly */
  const nodes=st.map((s,i)=>{
    const p=pts[i], cur=s.status==='current', passed=s.status==='passed';
    const cls=cur?'cur':passed?'passed':'locked';
    const side=p.x<W/2?'':' rev';                       // label goes to the roomier side
    const stars=passed?`<span class="stars">${'★'.repeat(s.stars||0)}${'☆'.repeat(3-(s.stars||0))}</span>`:'';
    const icon=s.icon||`<span class="num">${i+1}</span>`;
    return `<div class="stn ${cls}${side}" style="left:${(p.x/W*100).toFixed(2)}%;top:${(p.y/H*100).toFixed(3)}%"${cur||passed?` data-stn="${esc(s.id)}" role="button" tabindex="0"`:''}>
      <span class="dot"><svg viewBox="-24 -24 48 48" aria-hidden="true">${icon}</svg>${cur?`<span class="fox">${ava}</span>`:''}</span>
      <span class="lbl"><b>${esc(s.name)}</b><i>${esc(s.sub||s.id)}</i>${stars}</span></div>`;
  }).join('');

  return `<div class="mapbox"><div class="mapinner" style="--rc:${C}">
  <svg class="maproad" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label||'Жол картасы')}">
    <defs>
      <linearGradient id="mp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky1)"/><stop offset="1" stop-color="var(--sky2)"/></linearGradient>
      <linearGradient id="mp-gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--g1)"/><stop offset="1" stop-color="var(--g2)"/></linearGradient>
      <radialGradient id="mp-sun"><stop offset="0" stop-color="var(--sun)" stop-opacity=".95"/><stop offset="1" stop-color="var(--sun)" stop-opacity="0"/></radialGradient>
      <g id="mp-tulip"><path d="M0,0 L0,-15" stroke="var(--hill2)" stroke-width="1.6" stroke-linecap="round"/><path d="M-4,-8 q4,4 8,0" stroke="var(--hill2)" stroke-width="1.3" fill="none"/><path d="M-4,-15 q0,-7 4,-8 q4,1 4,8 q-4,3 -8,0Z" fill="var(--tulip)"/></g>
      <g id="mp-grass" stroke="var(--hill2)" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".6"><path d="M0,0 v-8 M4,0 q-1,-6 4,-9 M-4,0 q1,-6 -4,-9"/></g>
    </defs>

    <rect width="${W}" height="${TOP+20}" fill="url(#mp-sky)"/>
    <g fill="#FFFFFF" opacity="var(--starop)"><circle cx="42" cy="40" r="1.3"/><circle cx="96" cy="22" r="1"/><circle cx="150" cy="52" r="1.4"/><circle cx="214" cy="30" r="1"/><circle cx="268" cy="60" r="1.3"/><circle cx="318" cy="34" r="1"/><circle cx="70" cy="88" r="1"/><circle cx="240" cy="96" r="1.2"/></g>
    <circle cx="292" cy="62" r="44" fill="url(#mp-sun)"/><circle cx="292" cy="62" r="16" fill="var(--sun)"/>
    <g stroke="var(--mtn)" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"><path d="M62,74 q6,-6 12,0"/><path d="M78,64 q6,-6 12,0"/><path d="M48,96 q5,-5 10,0"/></g>
    <path d="M0,252 L44,170 L78,204 L118,138 L158,196 L196,152 L236,206 L276,158 L316,202 L360,166 L360,252Z" fill="var(--mtn-far)"/>
    <path d="M118,138 L104,158 L134,158Z" fill="var(--snow)"/><path d="M276,158 L264,176 L290,176Z" fill="var(--snow)"/>
    <path d="M0,258 L52,206 L92,236 L140,192 L188,238 L232,200 L286,244 L330,212 L360,236 L360,258Z" fill="var(--mtn)" opacity=".8"/>
    <rect y="248" width="${W}" height="${H-248}" fill="url(#mp-gr)"/>
    <path d="M0,268 C58,246 108,278 168,262 C228,246 292,274 360,254 L360,300 L0,300Z" fill="var(--hill)"/>
    <path d="M0,292 C70,276 120,300 190,288 C258,276 300,296 360,284 L360,330 L0,330Z" fill="var(--hill2)" opacity=".5"/>

    <g transform="translate(300,214)">
      <path d="M-18,25 L-14,6 q14,-12 28,0 L18,25Z" fill="var(--panel)" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M-14,6 q14,-12 28,0" fill="none" stroke="var(--tulip)" stroke-width="2.2"/>
      <path d="M-4,25 L-4,14 q4,-4 8,0 L4,25Z" fill="var(--gold)" stroke="var(--ink)" stroke-width="1.1"/>
      <path d="M0,-7 L0,-18 L10,-14 L0,-10" fill="var(--tulip)" stroke="var(--ink)" stroke-width="1" stroke-linejoin="round"/>
    </g>

    <path d="${road}" fill="none" stroke="var(--road-edge)" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>
    <path d="${road}" fill="none" stroke="var(--road)" stroke-width="19" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${road}" fill="none" stroke="var(--road-line)" stroke-width="2" stroke-dasharray="8 12" stroke-linecap="round" opacity=".8"/>
    ${done?`<path d="${done}" fill="none" stroke="${C}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>`:''}

    <g transform="translate(24,${H-26})"><use href="#mp-tulip"/></g>
    <g transform="translate(338,${H-92}) scale(.85)"><use href="#mp-tulip"/></g>
    <g transform="translate(24,${H-300})"><use href="#mp-grass"/></g>
    <g transform="translate(340,${H-460})"><use href="#mp-grass"/></g>
    <g transform="translate(20,${H-620})"><use href="#mp-grass"/></g>
  </svg>
  ${nodes}
</div></div>`;
}

function mapBind(fn){ const box=document.querySelector('.mapbox'); if(!box) return;
  const go=e=>{ const el=e.target.closest('[data-stn]'); if(el) fn(el.dataset.stn); };
  box.addEventListener('click',go);
  box.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' ') go(e); });
}
function mapScroll(){ const el=document.querySelector('.stn.cur'), box=document.querySelector('.mapbox');
  if(!el||!box) return; const r=el.getBoundingClientRect(), b=box.getBoundingClientRect();
  box.scrollTop += (r.top-b.top) - box.clientHeight/2; }
function stars(stage){ const t=(stage&&stage.tests)||[]; if(!t.length) return 0;
  const best=t.reduce((a,x)=>Math.max(a,x.n?x.ok/x.n:0),0);
  return best>=1?3:best>=0.9?2:best>=0.8?1:0; }

window.Core=window.Core||{}; Core.map=map; Core.mapBind=mapBind; Core.mapScroll=mapScroll; Core.mapStars=stars;
})();
