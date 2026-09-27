/* Есеп жолы · core/map.js v5 — v5 (look v3, redesign after the owner's review): an illustrated landscape
   (rolling bands, river, trees, rocks, flowers, clouds), a smooth S-shaped road with a side and a walked
   trail, stations as coins — passed in the route colour with stars, current gold with the pupil's animal
   standing on it, locked in stone with a lock — and the current station's button pinned in a card at the
   bottom of the map instead of a bubble over the road. Bubbles still open for passed stations.
   Before: core/map.js v4 — the route map: a mountain road through the steppe, one big station per stage.
   v4 (look v3, step 3): the road has a side, stations stand on plinths, hills and trees line the road,
   stars are drawn, locked stations carry a lock, the walked part of the road draws itself in, the current
   station pulses. Same API and markup hooks (.stn[data-stn], [data-go], .bub) as v3.
   Owner: platform owner. Used by core/runner.js and wp/screens.js. Routes never draw it themselves.

   Landscape + road are one SVG (scales with the width); stations are HTML on top in the same coordinate
   system, so nothing can overflow and every station is tappable. Only ONE bubble is open at a time:
   the current station by default, or whichever station the pupil taps.

   Core.map(opts) → HTML string
     opts.stages : [{id, name, sub, unit, status:'passed'|'current'|'locked', stars:0..3, icon}]  bottom → top
     opts.color / opts.colorDark : route colour and its pressed shade
     opts.avatar : emoji standing on the current station
     opts.go     : label of the button inside the bubble (default «Бастау»)
   Core.mapBind(fn) — fn(stageId) fires when the bubble's button is pressed.
   Core.mapScroll() — scrolls the current station into view.
   Core.mapStars(stage) — 0..3 from the stage's best test result. */
(function(){
'use strict';
const W=360, TOP=250, STEP=118, PADB=96;
const XS=[0.50,0.30,0.50,0.70];                 // gentle zig-zag around the middle
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
  const C=o.color||'var(--accent)', CD=o.colorDark||'var(--accent-d)', ava=o.avatar||'🦊', go=o.go||'Бастау';
  const H=TOP+n*STEP+PADB;
  /* a smooth S through the stations (v5): x swings on a sine instead of four fixed columns */
  const pts=st.map((s,i)=>({x:Math.round(W/2+W*0.27*Math.sin(i*1.05+0.4)), y:H-PADB-i*STEP}));
  const road=curve(pts);
  const curIdx=st.findIndex(s=>s.status==='current');
  const doneIdx=curIdx>=0?curIdx:st.reduce((a,s,i)=>s.status==='passed'?i:a,-1);
  const done=doneIdx>0?curve(pts.slice(0,doneIdx+1)):'';

  /* unit bands: a route may name them itself, otherwise every 4 stations is one «бөлім» */
  const unitOf=(s,i)=>s.unit||`${Math.floor(i/4)+1}-бөлім`;
  let units='';
  st.forEach((s,i)=>{ const u=unitOf(s,i); if(i&&unitOf(st[i-1],i-1)===u) return;
    const y=pts[i].y+STEP*0.4;   // below the unit's first coin, clear of the stars over the coin before it
    units+=`<div class="unit" style="top:${(y/H*100).toFixed(3)}%"><span>${esc(u)}</span></div>`; });

  /* ── the land (v5): rolling bands down the whole map, a river now and then, trees, rocks and flowers kept
     off the road. Deterministic — the same route always draws the same landscape. ── */
  let rs=7; const rnd=()=>{ rs=(rs*9301+49297)%233280; return rs/233280; };
  const nearRoad=(x,y,m)=>pts.some(p=>Math.abs(p.y-y)<STEP*0.7&&Math.abs(p.x-x)<m);
  const wave=(y,amp,ph)=>{ let d=`M0,${H} L0,${y.toFixed(0)}`; for(let x=0;x<=W;x+=12) d+=` L${x},${(y+amp*Math.sin(x/56+ph)).toFixed(1)}`; return d+` L${W},${H}Z`; };
  let land='';
  for(let y=300,k=0;y<H;y+=STEP*1.35,k++) land+=`<path d="${wave(y,11,k*1.3)}" fill="var(--${['hill','g1','hill2','g2'][k%4]})"${k%2?'':' opacity=".55"'}/>`;
  let river=''; for(let y=TOP+STEP*2.5;y<H-STEP;y+=STEP*6){ const d=`M-10,${y} C${W*0.2},${y+18} ${W*0.3},${y-14} ${W*0.45},${y+8} S${W*0.8},${y+40} ${W+10},${y+22}`;
    river+=`<path d="${d}" fill="none" stroke="var(--river)" stroke-width="15" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2.2" stroke-dasharray="6 14" opacity=".6"/>`; }
  let deco='';
  for(let y=TOP+40;y<H-30;y+=40){ for(let t=0;t<3;t++){ const x=Math.round(18+rnd()*(W-36)), yy=Math.round(y+rnd()*30), r=rnd();
    if(nearRoad(x,yy,66)) continue;
    if(r<0.45){ const k=(0.7+rnd()*0.4).toFixed(2);
      deco+=`<g transform="translate(${x},${yy}) scale(${k})"><ellipse cy="16" rx="13" ry="4" fill="#3E5A2A" opacity=".18"/><rect x="-2.5" y="4" width="5" height="12" rx="2" fill="var(--trunk)"/><path d="M0,-26 L15,6 L-15,6Z" fill="var(--tree)"/><path d="M0,-26 L15,6 L0,6Z" fill="var(--tree-d)"/><path d="M0,-38 L11,-10 L-11,-10Z" fill="var(--tree)"/><path d="M0,-38 L11,-10 L0,-10Z" fill="var(--tree-d)"/></g>`; }
    else if(r<0.6) deco+=`<g transform="translate(${x},${yy})"><path d="M-13,6 L-8,-6 L3,-9 L12,-2 L14,6Z" fill="var(--rock)"/><path d="M3,-9 L12,-2 L14,6 L2,6Z" fill="var(--rock-d)"/></g>`;
    else if(r<0.8) deco+=`<g transform="translate(${x},${yy})"><path d="M0,0 v-9" stroke="var(--hill2)" stroke-width="1.6"/><circle cy="-11" r="3.4" fill="${['#E86F9A','#F4B942','#9B7FD4'][Math.floor(rnd()*3)]}"/><circle cy="-11" r="1.3" fill="#FFE08A"/></g>`; } }

  const STAR='<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>';
  const LOCK='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="3"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.8"/></svg>';

  /* ── celebration: the station that was current the last time THIS map was drawn on this device is now passed,
     and the one right after it is current → the pupil has just passed it. Remembered per map in localStorage,
     so it works for every route (runner, wp, pv) without them telling the map anything, and plays once. ── */
  const celFrom=(()=>{ const c=st.findIndex(s=>s.status==='current'); let pv=null; try{ pv=localStorage.getItem('esep_mapcur:'+(o.label||'map')); }catch(e){}
    const f=pv&&c>=0&&pv!==st[c].id?st.findIndex(s=>s.id===pv):-1; return f>=0&&f===c-1&&st[f].status==='passed'?f:-1; })();
  const nodes=st.map((s,i)=>{
    const p=pts[i], cur=s.status==='current', passed=s.status==='passed', locked=!cur&&!passed;
    const cls=`stn ${cur?'cur':passed?'passed':'locked'}${celFrom>=0&&i===celFrom?' justdone':''}${celFrom>=0&&cur?' unlocking':''}`;
    // stars:null means "this route keeps no star score" (PV) — draw nothing rather than three empty stars
    const stars=(passed&&s.stars!=null)?`<span class="stars" aria-label="${s.stars} жұлдыз">${[0,1,2].map(k=>`<svg viewBox="0 0 24 24" class="${k<s.stars?'on':''}" aria-hidden="true">${STAR}</svg>`).join('')}</span>`:'';
    const face=locked?`<span class="lk">${LOCK}</span>`:(s.icon&&!passed&&!cur?`<svg viewBox="-24 -24 48 48" aria-hidden="true">${s.icon}</svg>`:`<span class="num">${i+1}</span>`);
    const tap=cur||passed;
    const d=Math.max(0,Math.min(18,i-Math.max(0,doneIdx-6)))*45;   // stations pop in from the pupil's part of the road upward
    return `<div class="${cls}" style="left:${(p.x/W*100).toFixed(2)}%;top:${(p.y/H*100).toFixed(3)}%;--d:${d}ms"${tap?` data-stn="${esc(s.id)}"`:''}>
      ${cur?`<span class="fox">${window.Pets?window.Pets.svg(ava,{size:64}):ava}</span>`:''}
      <div class="bub"><b>${esc(s.name)}</b><i>${esc(s.sub||s.id)}</i>${tap?`<button type="button" class="btn" data-go="${esc(s.id)}">${esc(go)}</button>`:''}</div>
      <span class="dot"${tap?' role="button" tabindex="0"':''} aria-label="${i+1}. ${esc(s.name)}">${face}${celFrom>=0&&cur?`<span class="unlk">${LOCK}</span><i class="spark" aria-hidden="true"></i>`:''}</span>
      ${stars}</div>`;
  }).join('');
  const cs=curIdx>=0?st[curIdx]:null;
  const cel=celFrom>=0, fromIdx=celFrom;   // worked out above, before the nodes, from the value remembered last time
  try{ if(cs) localStorage.setItem('esep_mapcur:'+(o.label||'map'),cs.id); }catch(e){}
  /* the current station's action lives in a card pinned to the bottom of the map, not in a bubble over the road */
  const card=cs?`<div class="mapgo"><div><b>${curIdx+1}-станция · ${esc(cs.name)}</b><i>${esc(cs.sub||cs.id)}</i></div><button type="button" class="btn" data-go="${esc(cs.id)}">${esc(go)}</button></div>`:'';

  return `<div class="mapbox v5" style="--rc:${C};--rc-d:${CD}"${cel?` data-cel="${fromIdx},${curIdx}"`:''}><div class="mapinner">
  <svg class="maproad" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label||'Жол картасы')}">
    <defs>
      <linearGradient id="mp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--sky1)"/><stop offset="1" stop-color="var(--sky2)"/></linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="var(--g1)"/>
    <rect width="${W}" height="${TOP+60}" fill="url(#mp-sky)"/>
    <g fill="#FFFFFF" opacity="var(--starop)"><circle cx="42" cy="40" r="1.3"/><circle cx="96" cy="22" r="1"/><circle cx="150" cy="52" r="1.4"/><circle cx="214" cy="30" r="1"/><circle cx="268" cy="60" r="1.3"/><circle cx="318" cy="34" r="1"/></g>
    <g fill="var(--cloud)" opacity=".9"><g transform="translate(70,70)"><ellipse rx="26" ry="11"/><ellipse cx="-14" cy="3" rx="16" ry="9"/><ellipse cx="14" cy="-4" rx="15" ry="12"/></g><g transform="translate(290,112) scale(.8)"><ellipse rx="26" ry="11"/><ellipse cx="-14" cy="3" rx="16" ry="9"/><ellipse cx="14" cy="-4" rx="15" ry="12"/></g></g>
    <path d="M0,250 L46,172 L86,210 L146,122 L200,200 L246,150 L296,214 L344,160 L360,176 L360,330 L0,330Z" fill="var(--mtn-far)"/>
    <path d="M146,122 L130,146 L142,143 L149,151 L159,141 L166,147Z M46,172 L34,190 L46,186 L56,192Z M344,160 L332,178 L344,174 L356,180Z" fill="var(--snow)"/>
    <path d="${wave(292,10,0.3)}" fill="var(--hill)"/>
    ${land}${river}${deco}
    <path d="${road}" transform="translate(3,12)" fill="none" stroke="#5A4420" stroke-opacity=".16" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${road}" transform="translate(0,9)" fill="none" stroke="var(--road-side)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${road}" fill="none" stroke="var(--road-edge)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${road}" fill="none" stroke="var(--road)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${road}" fill="none" stroke="var(--road-line)" stroke-width="2.6" stroke-dasharray="9 13" stroke-linecap="round" opacity=".85"/>
    ${done?`<path class="mp-done" d="${done}" pathLength="100" fill="none" stroke="${C}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" opacity=".28"/>
    <path class="mp-done" d="${done}" pathLength="100" fill="none" stroke="${C}" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 3.2" opacity=".9"/>`:''}
  </svg>
  ${units}${nodes}
</div>${card}</div>`;
}

function mapBind(fn){
  const box=document.querySelector('.mapbox'); if(!box) return;
  box.addEventListener('click',e=>{
    const goBtn=e.target.closest('[data-go]');
    if(goBtn){ fn(goBtn.dataset.go); return; }
    const stn=e.target.closest('.stn[data-stn]');
    if(!stn) return;
    const wasOpen=stn.classList.contains('open');
    box.querySelectorAll('.stn.open').forEach(x=>x.classList.remove('open'));
    if(!wasOpen) stn.classList.add('open');
  });
}
function mapScroll(){ const el=document.querySelector('.stn.cur')||document.querySelector('.stn.open'), box=document.querySelector('.mapbox');
  if(!el||!box) return; const r=el.getBoundingClientRect(), b=box.getBoundingClientRect();
  box.scrollTop += (r.top-b.top) - box.clientHeight*(box.dataset.cel?0.42:0.62);
  if(box.dataset.cel) celebrate(box); }
/* A station has just been passed: its stars pop in; the next coin loses its lock and turns gold in a ring of
   sparks (owner, 2026-09-27: no green flash — gold is the colour of «where you are»);
   the pupil's animal hops along the road from one to the other; «up» plays if sound is on.
   Everything is on classes and the Web Animations API; with «reduce motion» the map simply shows the end state. */
function celebrate(box){
  const [a,b]=box.dataset.cel.split(',').map(Number); delete box.dataset.cel;
  const nodes=box.querySelectorAll('.stn'), from=nodes[a], to=nodes[b]; if(!from||!to) return;
  const done=()=>{ to.classList.remove('unlocking','unlock'); from.classList.remove('justdone'); };
  if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){ done(); return; }
  const fox=to.querySelector('.fox'), fd=from.querySelector('.dot'), td=to.querySelector('.dot');
  setTimeout(()=>{ to.classList.add('unlock'); try{ window.Core&&Core.sound&&Core.sound('up'); }catch(e){} },650);
  if(fox&&fd&&td&&fox.animate){ const f=fd.getBoundingClientRect(), t=td.getBoundingClientRect(), dx=f.left+f.width/2-(t.left+t.width/2), dy=f.top-t.top;
    fox.style.animationPlayState='paused';
    fox.animate([{transform:`translate(${dx}px,${dy}px)`},
                 {transform:`translate(${dx*0.55}px,${dy*0.55-80}px) rotate(-8deg)`,offset:.5},
                 {transform:'translate(0,6px) scale(1.08,.9)',offset:.85},
                 {transform:'translate(0,0)'}],
      {duration:900,delay:1250,easing:'cubic-bezier(.35,0,.3,1)',fill:'backwards'}).onfinish=()=>{ fox.style.animationPlayState=''; };
  }
  setTimeout(done,2300);
}
function stars(stage){ const t=(stage&&stage.tests)||[]; if(!t.length) return 0;
  const best=t.reduce((a,x)=>Math.max(a,x.n?x.ok/x.n:0),0);
  return best>=1?3:best>=0.9?2:best>=0.8?1:0; }

window.Core=window.Core||{}; Core.map=map; Core.mapBind=mapBind; Core.mapScroll=mapScroll; Core.mapStars=stars;
})();
