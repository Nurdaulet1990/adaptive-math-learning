/* wp/diag_test.js — diagnostic (binary search over stages, lvl-3 items) and the 10-item stage test. Owner: Nurdaulet. */
'use strict';
let DG=null;
function startDiag(again){
  const ids=STAGES.map(s=>s[0]).filter(stageL3);
  DG={ids, lo:0, hi:ids.length-1, n:0, results:{}, q:null, per:{}, start:Date.now(), again:!!again, cur:null};
  nextDiag();
}
/* A pupil who rushed the first diagnostic is parked below what they can do. The re-diagnostic is
   the way out, and it can only move them FORWARD (see finishDiag) — a second bad run must not cost
   a child stages they really passed. Same rule in core/runner.js; PV guards finishPlacement. */
function askRediag(){
  app().innerHTML=topbar()+`<div class="card"><h2>Қайта диагностика</h2>
    <p>Тағы бірнеше есеп (көбіне 8–16). Егер жақсы шығарсаң, әрі қарайғы станциядан бастайсың.</p>
    <p class="note">Артқа шегінбейсің: нәтиже нашар болса да, қазіргі станцияң мен жұлдыздарың сол күйінде қалады.</p>
    <div class="row"><button class="btn" onclick="startDiag(true)">Бастау</button><button class="btn plain" onclick="showHome()">Артқа</button></div></div>`;
}
function nextDiag(){
  /* Count a finished probe BEFORE anything may end the diagnostic — the question cap used to be checked
     first, which threw away a probe the pupil had already answered in full. It bit AR (41 stages, the cap
     landing exactly on the last probe: 12 right answers, placed on station 32); WP is short enough that it
     never showed, but the same code deserves the same fix. Same change in core/runner.js. (2026-09-22) */
  if(DG.cur!=null){ const st=DG.ids[DG.cur], p=DG.per[st]||{asked:0,ok:0};
    if(p.asked>=2){ const mid=DG.cur; DG.cur=null;
      if(p.ok===2){ DG.results[st]='pass'; DG.lo=mid+1; } else { DG.results[st]='fail'; DG.hi=mid-1; } } }
  /* No question cap — the search is what ends it. Same rule and same reason as core/runner.js. */
  if(DG.lo>DG.hi || Date.now()-DG.start>30*60000){ return finishDiag(); }
  const mid=Math.floor((DG.lo+DG.hi)/2); const st=DG.ids[mid]; DG.cur=mid;
  if(!DG.per[st]) DG.per[st]={asked:0,ok:0};
  const q=drawItem(st,3); if(!q){ DG.results[st]='pass'; DG.lo=mid+1; DG.cur=null; return nextDiag(); }
  DG.q=q; DG.st=st; DG.n++; const t0=Date.now();
  renderQuestion(q,{mode:'diag',title:'Диагностика',meta:`${DG.n}-сұрақ`,prog:1-((DG.hi-DG.lo+1)/DG.ids.length), sub:st, noHints:true,
    onAnswer:(ok)=>{ DG.per[st].asked++; if(ok) DG.per[st].ok++; log({ev:'answer',mode:'diag',stage:st,lvl:3,ok,ms:Date.now()-t0,id:q.id,type:'tpl',...qinfo(q)}); setTimeout(nextDiag,ok?700:1400); },
    onSkip:()=>{ DG.per[st].asked++; log({ev:'answer',mode:'diag',stage:st,lvl:3,ok:false,skip:true,id:q.id,type:'tpl',stem:String(q.stem).slice(0,200),ans:q.ans}); nextDiag(); }});
}
function finishDiag(){
  const ids=DG.ids; let place=Math.min(DG.lo, ids.length-1);
  let placed=ids[place]||ids[ids.length-1];
  const all=STAGES.map(s=>s[0]); const was=DG.again?all.indexOf(currentStage()):-1; let pi=all.indexOf(placed);
  const held=DG.again&&was>pi;            /* re-diagnostic: never move a pupil backwards */
  if(held){ pi=was; placed=all[pi]; }
  all.forEach((id,i)=>{ R.stages[id].status = i<pi?'passed':(i===pi?'current':'locked'); });
  R.diag={t:Date.now(),placed,results:DG.results,n:DG.n,again:DG.again||undefined};
  log({ev:'diag',placed,results:DG.results,again:DG.again||undefined,held:held||undefined});
  persist();
  app().innerHTML=topbar()+`<div class="card"><h2>Диагностика аяқталды</h2><p>Сен <b>${pi+1}-кезеңнен</b> бастайсың: <b>${esc(stageName(placed))}</b>.</p>
  ${held?`<p class="note">Бұл жолы жоғарырақ шықпады — станцияң өзгерген жоқ.</p>`:''}
  <p class="note">${Object.keys(DG.results).map(k=>`${k}: ${DG.results[k]==='pass'?'✓':'✗'}`).join(' · ')}</p><button class="btn wide" onclick="showHome()">Жалғастыру</button></div>`;
}

/* ── stage test ── */
let TS=null;
function startTest(stId){
  const qs=[]; const used=new Set();
  for(let i=0;i<10;i++){ let q=null; for(let k=0;k<8&&!q;k++){ const c=drawItem(stId,3); if(c&&!used.has(c.id)) q=c; } if(q){ used.add(q.id); qs.push(q); } }
  if(qs.length<6){ app().innerHTML=topbar()+`<div class="card"><h2>Бұл кезеңге тест есептері жеткіліксіз</h2><button class="btn wide" onclick="showHome()">Артқа</button></div>`; return; }
  TS={stId,qs,i:0,ok:0}; PR={stId,mode:'test'}; nextTest();
}
function nextTest(){
  if(TS.i>=TS.qs.length) return finishTest();
  const q=TS.qs[TS.i]; TS.t0=Date.now();
  renderQuestion(q,{mode:'test',title:'Кезең тесті',meta:`${TS.i+1}/${TS.qs.length}`,prog:TS.i/TS.qs.length,sub:TS.stId,noHints:true,onAnswer:(ok)=>{ if(ok) TS.ok++; log({ev:'answer',mode:'test',stage:TS.stId,lvl:3,ok,ms:Date.now()-TS.t0,id:q.id,type:'tpl',...qinfo(q)}); TS.i++; setTimeout(nextTest,ok?600:1300); }});
}
function finishTest(){
  const st=R.stages[TS.stId]; const need=Math.ceil(TS.qs.length*0.8); const pass=TS.ok>=need;
  st.tests.push({t:Date.now(),ok:TS.ok,n:TS.qs.length,pass}); log({ev:'test',stage:TS.stId,ok:TS.ok,n:TS.qs.length,pass});
  let html=topbar()+`<div class="card"><h2>${pass?'Кезең өтілді! 🎉':'Әзірге өтпеді'}</h2><p>Нәтиже: <b>${TS.ok}/${TS.qs.length}</b> (өту үшін ${need} керек).</p>`;
  if(pass){ st.status='passed'; const i=stageIdx(TS.stId); if(i+1<STAGES.length){ const nx=STAGES[i+1][0]; if(R.stages[nx].status==='locked') R.stages[nx].status='current';   /* re-passing an old station (to earn its stars) must not drag a later, already passed one back to 'current' */ html+=`<p>Келесі кезең: <b>${esc(stageName(nx))}</b></p>`; } }
  else { st.testUnlocked=false; st.l3streak=0; html+=`<p class="note">3-деңгейде тағы жаттығып, қайта тапсыр.</p>`; }
  html+=`<button class="btn wide" onclick="showHome()">Жалғастыру</button></div>`;
  persist(); TS=null; PR=null; app().innerHTML=html;
}
