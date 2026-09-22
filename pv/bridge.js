/* pv/bridge.js — connects the legacy "Орын мәні" app (pv/index.html, unchanged logic) to the platform core.
   Owner: platform owner. What it does:
   1. shows the platform login (Core) in an overlay before the app is usable;
   2. loads/saves PV progress through Core instead of localStorage (state.completed / stars / unlockedUpTo / started);
   3. mirrors progress into the platform format (stages PV-01…PV-48, diag) so the teacher page works;
   4. logs every answer via Core.answer and level results / placement via Core.event.
   The app's own functions are wrapped, not edited: saveProgress, showFeedback, showLevelComplete, finishPlacement, generateQuestion, showVisualHint. */
(function(){
'use strict';
const stageId=lv=>{ const i=LEVEL_ORDER.findIndex(x=>x.levelId===lv); return 'PV-'+String(i+1).padStart(2,'0'); };
const levelName=lv=>{ for(const m of MODULES){ const l=m.levels.find(x=>x.id===lv); if(l) return m.name+' · '+l.name; } return lv; };
let R=null, qT0=Date.now(), qHints=0;

/* overlay with the platform login (scoped copy of the few ui.css rules the login card needs) */
const css=`#app{position:fixed;inset:0;z-index:9999;background:#F7F7F3;color:#1B2733;font-family:Nunito,system-ui,sans-serif;font-size:17px;overflow:auto;padding:14px}
#app .top{display:flex;justify-content:space-between;padding:6px 0 12px;max-width:560px;margin:0 auto}#app .brand{font-weight:900;color:#0E7C9B}#app .brand small{display:block;font-size:.72rem;color:#5E6B7A;text-transform:uppercase;letter-spacing:.06em}
#app .card{max-width:560px;margin:0 auto 12px;background:#fff;border:1px solid #DCE0E4;border-radius:14px;padding:16px}#app h1{font-size:1.5rem;margin:0 0 6px}#app p{margin:0 0 10px}
#app input.big{width:100%;font:inherit;font-size:1.3rem;font-weight:800;padding:12px 14px;border:2px solid #DCE0E4;border-radius:12px;box-sizing:border-box}#app .row{display:flex;gap:10px;flex-wrap:wrap}#app .row>*{flex:1}
#app .btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:12px;padding:13px 18px;font:inherit;font-weight:800;cursor:pointer;background:#0E7C9B;color:#fff;min-height:48px}#app .btn.wide{width:100%}#app .btn.ghost{background:#E3F1F6;color:#0E7C9B}#app .note{font-size:.85rem;color:#5E6B7A}`;
const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
let host=document.getElementById('app'); if(!host){ host=document.createElement('div'); host.id='app'; document.body.appendChild(host); }

/* platform-format mirror of the progress (for portal + teacher) */
function mirror(){
  const cur=Math.min(R.unlockedUpTo||0,LEVEL_ORDER.length-1); R.stages=R.stages||{};
  LEVEL_ORDER.forEach((e,i)=>{ const id='PV-'+String(i+1).padStart(2,'0'); const s=R.stages[id]||(R.stages[id]={level:3,streak:0,wrong:0,l3streak:0,testUnlocked:true,tests:[],seenCard:true}); s.status=R.completed[e.levelId]?'passed':(i===cur&&R.started?'current':'locked'); s.level=3; });
  if(R.started&&!R.diag) R.diag={t:Date.now(),placed:'PV-'+String(cur+1).padStart(2,'0'),results:{},n:0,manual:true};
}
function pull(){ state.completed=R.completed||{}; state.stars=R.stars||0; state.unlockedUpTo=R.unlockedUpTo!==undefined?R.unlockedUpTo:0; state.started=!!R.started;
  /* the tester account — see Core.tester in core/core.js. PV counts unlocked levels rather than
     marking each one, so here it is one number. */
  if(Core.tester){ state.unlockedUpTo=LEVEL_ORDER.length-1; state.started=true; } }
function push(){ R.completed=state.completed; R.stars=state.stars; R.unlockedUpTo=state.unlockedUpTo; R.started=state.started; mirror(); Core.save(R); }

/* wrap app functions (function declarations are global bindings → reassignable) */
const _save=saveProgress; saveProgress=function(){ try{ _save(); }catch(e){} if(R) push(); };
const _gen=generateQuestion; generateQuestion=function(){ qT0=Date.now(); qHints=0; return _gen.apply(this,arguments); };
const _hint=showVisualHint; showVisualHint=function(){ qHints=Math.min(5,qHints+1); if(R&&state.level) Core.event({ev:'hint',n:qHints,stage:stageId(state.level)}); return _hint.apply(this,arguments); };
const _fb=showFeedback; showFeedback=function(correct,hint){
  if(state.fbShown) return;   // a repeated tap on «Тексеру»: the app ignores it (pv/index.html showFeedback) — so must the log
  if(R&&state.level){ const ws=document.getElementById('workspace'); const stem=ws?(ws.querySelector('.question,.q-text,h2,h3,p')||ws).textContent.trim().replace(/\s+/g,' ').slice(0,160):'';
    const ansM=hint?String(hint).replace(/^Дұрыс( жауап)?:\s*/,''):'';
    Core.answer({stage:stageId(state.level),lvl:3,ok:!!correct,mode:'practice',hints:qHints,ms:Date.now()-qT0,type:state.level,stem:levelName(state.level)+(stem?' — '+stem:''),ans:correct?undefined:ansM,given:undefined}); }
  return _fb.apply(this,arguments); };
/* Finishing a PV level is a stage test, and is recorded as one. Until 2026-09-21 the result went out as an
   event only, so `stages[].tests` stayed empty for all 48 stations — and stars are counted from that array
   everywhere outside PV (the portal, the map, the class board). A child who worked only in PV was therefore
   worth nought stars anywhere but PV's own header, which kept a private counter of its own.
   Shape and rule are core/runner.js finishTest's: keep every attempt, the best ratio is what scores
   (10/10 → 3, ≥9/10 → 2, ≥8/10 → 1). PV's short levels are 5 questions to pass 4 — 0.8, so one star. */
const _lc=showLevelComplete; showLevelComplete=function(ws){ const lv=state.level, score=state.score, n=state.questionsPerLevel; const r=_lc.apply(this,arguments);
  if(R&&lv){ const id=stageId(lv), pass=score>=(COMP_LVL.has(lv)?4:8);
    Core.event({ev:'test',stage:id,ok:score,n,pass});
    push();                                                   // mirror() runs here, so the stage row exists below
    const st=R.stages&&R.stages[id];
    if(st&&n>0){ st.tests=Array.isArray(st.tests)?st.tests:[];
      st.tests.push({t:Date.now(),ok:score,n,pass});
      if(st.tests.length>20) st.tests.splice(0,st.tests.length-20);   // one row per station, not a diary
      Core.save(R); } }
  return r; };
/* the re-diagnostic may only move a pupil forward — PV's own placement is free to land lower,
   so the ceiling is restored here. Same rule as core/runner.js and wp/diag_test.js. */
const _fp=finishPlacement; finishPlacement=function(){ const hist=(state.placement&&state.placement.history)||[]; const before=state.unlockedUpTo||0; const r=_fp.apply(this,arguments);
  if((state.unlockedUpTo||0)<before) state.unlockedUpTo=before;
  if(R){ const results={}; hist.forEach(h=>{ results[stageId(LEVEL_ORDER[h.idx].levelId)]=h.correct?'pass':'fail'; }); const cur=Math.min(state.unlockedUpTo,LEVEL_ORDER.length-1); R.diag={t:Date.now(),placed:'PV-'+String(cur+1).padStart(2,'0'),results,n:hist.length}; Core.event({ev:'diag',placed:R.diag.placed,results}); push(); } return r; };

/* ── the platform map as PV's home screen ──────────────────────────────────
   PV keeps its own question screens (48 levels of tested code), but the way in is the same as every
   other route: the road with one station per level, grouped by the app's own five modules. This is
   also the only navigation on a phone — pv's own stylesheet hides its sidebar under 768px. */
const mapCSS=document.createElement('link'); mapCSS.rel='stylesheet'; mapCSS.href='../core/map.css?v=7'; document.head.appendChild(mapCSS);
const mapWrap=document.createElement('style'); mapWrap.textContent=
 /* width:100% matters: #main is a flex container, so without it the map shrinks to its content
     (~340px) and sits in a narrow column instead of filling the 560px reading measure. */
 `#pvmap{width:100%;max-width:560px;box-sizing:border-box;margin:0 auto;padding:12px 12px 28px;font-family:Nunito,system-ui,sans-serif}
  /* the legacy module sidebar is PV's alone — no other route has one. The map replaced it. */
  .sidebar{display:none!important}
  #pvmap .top{position:relative;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0 12px}
  #pvmap .brand{flex:1;min-width:0;font-family:Fredoka,system-ui,sans-serif;font-weight:600;font-size:1.12rem;color:var(--pv,#3D6DB5)}
  #pvmap .brand small{display:block;font-family:Nunito,system-ui,sans-serif;font-weight:700;font-size:.68rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase}
  #pvmap .who{flex:none;font-size:.85rem;color:var(--muted);text-align:right;line-height:1.5}
  #pvmap .who b{color:var(--ink)}
  #pvmap .who a{color:var(--muted);text-decoration:none}
  #pvmap .mutebtn{border:0;background:transparent;font-size:.95rem;cursor:pointer;padding:0 2px;line-height:1}
  #pvmap .avachip{flex:none;font-size:24px;line-height:1;align-self:center}
  #pvmap .strip{display:flex;gap:8px;margin-bottom:12px}
  #pvmap .strip div{flex:1;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:9px 4px;text-align:center}
  #pvmap .strip b{display:block;font-family:Fredoka,system-ui,sans-serif;font-weight:600;font-size:1.2rem;color:var(--ink)}
  #pvmap .strip span{font-size:.6rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  #pvmap .hint{font-size:.8rem;color:var(--muted);font-weight:600;text-align:center;margin:8px 0 0}
  #pvmap .hint a{color:var(--pv,#3D6DB5);text-decoration:none}
  /* PV's own level screens keep their widgets, but sit on the same 560px measure as every other route,
     instead of stretching across the whole window now that the sidebar is gone. */
  #main>*{width:100%;max-width:560px;box-sizing:border-box;margin:0 auto}
  /* narrow screens: keep the header text clear of the fixed «← Карта» button */
  @media (max-width:660px){ #main>.header{padding-left:96px} }
  #pvback{position:fixed;left:10px;top:8px;z-index:999;font:700 13px Nunito,system-ui,sans-serif;background:var(--card);
    border:1px solid var(--line);border-radius:999px;padding:7px 13px;color:var(--ink);cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.08)}`;
document.head.appendChild(mapWrap);

/* one small glyph per level, from what the level actually practises */
function pvIcon(id){
  const c='currentColor';
  if(/^c/.test(id)||id==='ct10') return `<g fill="${c}"><circle cx="-8" cy="-6" r="3.4"/><circle cx="0" cy="-6" r="3.4"/><circle cx="8" cy="-6" r="3.4"/><circle cx="-8" cy="4" r="3.4"/><circle cx="0" cy="4" r="3.4"/><circle cx="8" cy="4" r="3.4"/></g>`;
  if(/^(p|pv)/.test(id)) return `<g fill="none" stroke="${c}" stroke-width="2.2"><rect x="-13" y="-9" width="26" height="18" rx="2"/><line x1="-4.5" y1="-9" x2="-4.5" y2="9"/><line x1="4.5" y1="-9" x2="4.5" y2="9"/></g>`;
  if(/^m/.test(id)) return `<text x="0" y="8" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="600" font-size="24" fill="${c}">&lt;</text>`;
  if(/^a/.test(id)) return `<path d="M-10,0 H10 M0,-10 V10" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>`;
  if(/^s/.test(id)) return `<path d="M-10,0 H10" stroke="${c}" stroke-width="3.4" stroke-linecap="round"/>`;
  if(/^u/.test(id)) return `<text x="0" y="9" text-anchor="middle" font-family="Fredoka,sans-serif" font-weight="600" font-size="26" fill="${c}">?</text>`;
  return `<circle r="6" fill="${c}"/>`;
}
function showMap(){
  const main=document.getElementById('main'); if(!main) return;
  const cur=Math.min(state.unlockedUpTo,LEVEL_ORDER.length-1);
  const done=LEVEL_ORDER.filter(e=>state.completed[e.levelId]).length;
  const stages=LEVEL_ORDER.map((e,i)=>{ const mod=MODULES.find(m=>m.id===e.moduleId); const lvl=mod.levels.find(l=>l.id===e.levelId);
    return {id:stageId(e.levelId), name:lvl.name, unit:`${mod.icon} ${mod.name}`, icon:pvIcon(e.levelId), stars:null,
      status:state.completed[e.levelId]?'passed':(i===cur?'current':(i<cur?'passed':'locked')),
      sub:state.completed[e.levelId]?'Өтілді':(i===cur?'Осы жерден жалғастыр':mod.name)}; });
  const fresh=done===0&&cur===0;
  /* ★ on this strip is the PLATFORM's number, the one the portal and the class board use: earned from
     level results (Core.mapStars over the mirrored stages), nothing else. The legacy app keeps its own
     `state.stars` on a quite different economy — one per correct answer, plus three per level the
     placement test skipped — so showing that here meant a child read ★ 200 on this page and ★ 14 on the
     portal. A number a child is ranked by must be the same number everywhere it appears. (2026-09-22) */
  const stars=(R&&R.stages)?Object.keys(R.stages).reduce((a,k)=>a+Core.mapStars(R.stages[k]),0):0;
  main.innerHTML=`<div id="pvmap">${Core.topbar('Орын мәні · 1–4 сынып')}
    <div class="strip"><div><b>${done}/${LEVEL_ORDER.length}</b><span>станция</span></div><div><b>★ ${stars}</b><span>жұлдыз</span></div><div><b>${MODULES.length}</b><span>бөлім</span></div></div>
    <button id="pvdiag" style="width:100%;min-height:50px;margin-bottom:12px;border:2px solid var(--line);background:var(--card);color:var(--ink);border-radius:14px;font:600 1rem Fredoka,system-ui,sans-serif;cursor:pointer">${fresh?'🎯 Диагностика — қай жерден бастау керек?':'🎯 Қайта диагностика — бәрі тым оңай ма?'}</button>
    ${Core.map({stages, color:'var(--pv,#3D6DB5)', colorDark:'var(--pv-d,#2E538B)', avatar:Core.avatar(), go:'Жаттығу', label:'Орын мәні жолы'})}
    <p class="hint">Станцияны басып көр · <a href="../">барлық бағыттар</a></p></div>`;
  showBack(false); Core.mapScroll();
  Core.mapBind(id=>{ const idx=parseInt(id.slice(3),10)-1; const e=LEVEL_ORDER[idx]; if(!e) return;
    selectLevel(e.moduleId,e.levelId); });
  const dg=document.getElementById('pvdiag'); if(dg) dg.onclick=()=>{ showBack(true); startDiagnostic(); };
}
/* Off the map, PV shows its own level screens. They carry only «← Карта», the same way the other
   routes' question screens carry only ✕ — name, language and exit live on the map's Core.topbar. */
const showBack=on=>{ const b=document.getElementById('pvback'); if(b) b.style.display=on?'block':'none'; };
/* whichever way a level is entered (map, sidebar, «next level» after a result), offer the way back */
const _sl=selectLevel; selectLevel=function(){ showBack(true); return _sl.apply(this,arguments); };
/* PV renders its own welcome screen whenever no level is picked — show the map there instead */
const _rm=renderMain; renderMain=function(){ if(R&&!state.level){ showMap(); return; } return _rm.apply(this,arguments); };

/* boot: pull in the map component (pv/index.html only loads core.js), then login → load → re-render */
const loadScript=src=>new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
host.style.display='block';
loadScript('../core/map.js?v=7').then(()=>Core.start('PV')).then(rs=>{ R=rs; if(!R.completed) R.completed={}; pull(); mirror(); Core.save(R); host.innerHTML=''; host.style.display='none';
  const back=document.createElement('button'); back.id='pvback'; back.textContent='← Карта'; back.style.display='none';
  back.onclick=()=>{ state.module=null; state.level=null; state.diagnostic=false; state.placement=null; showBack(false); renderSidebar(); showMap(); };
  document.body.appendChild(back);
  state.module=null; state.level=null; renderSidebar(); showMap(); });
})();
