/* wp/diag_test.js — diagnostic (binary search over stages, lvl-3 items) and the 10-item stage test. Owner: Nurdaulet. */
'use strict';
let DG=null;
function startDiag(){
  const ids=STAGES.map(s=>s[0]).filter(stageL3);
  DG={ids, lo:0, hi:ids.length-1, n:0, results:{}, q:null, per:{}, start:Date.now()};
  nextDiag();
}
function nextDiag(){
  if(DG.n>=12 || DG.lo>DG.hi || Date.now()-DG.start>15*60000){ return finishDiag(); }
  const mid=Math.floor((DG.lo+DG.hi)/2); const st=DG.ids[mid];
  if(!DG.per[st]) DG.per[st]={asked:0,ok:0};
  if(DG.per[st].asked>=2){
    if(DG.per[st].ok===2){ DG.results[st]='pass'; DG.lo=mid+1; } else { DG.results[st]='fail'; DG.hi=mid-1; }
    return nextDiag();
  }
  const q=drawItem(st,3); if(!q){ DG.results[st]='pass'; DG.lo=mid+1; return nextDiag(); }
  DG.q=q; DG.st=st; DG.n++; const t0=Date.now();
  renderQuestion(q,{mode:'diag',title:'Диагностика',meta:`${DG.n}/12`,prog:DG.n/12, sub:st, noHints:true,
    onAnswer:(ok)=>{ DG.per[st].asked++; if(ok) DG.per[st].ok++; log({ev:'answer',mode:'diag',stage:st,lvl:3,ok,ms:Date.now()-t0,id:q.id,type:'tpl',...qinfo(q)}); setTimeout(nextDiag,ok?700:1400); },
    onSkip:()=>{ DG.per[st].asked++; log({ev:'answer',mode:'diag',stage:st,lvl:3,ok:false,skip:true,id:q.id,type:'tpl',stem:String(q.stem).slice(0,200),ans:q.ans}); nextDiag(); }});
}
function finishDiag(){
  const ids=DG.ids; let place=Math.min(DG.lo, ids.length-1);
  const placed=ids[place]||ids[ids.length-1];
  const all=STAGES.map(s=>s[0]); const pi=all.indexOf(placed);
  all.forEach((id,i)=>{ R.stages[id].status = i<pi?'passed':(i===pi?'current':'locked'); });
  R.diag={t:Date.now(),placed,results:DG.results,n:DG.n};
  log({ev:'diag',placed,results:DG.results});
  persist();
  app().innerHTML=topbar()+`<div class="card"><h2>Диагностика аяқталды</h2><p>Сен <b>${pi+1}-кезеңнен</b> бастайсың: <b>${esc(stageName(placed))}</b>.</p>
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
  if(pass){ st.status='passed'; const i=stageIdx(TS.stId); if(i+1<STAGES.length){ const nx=STAGES[i+1][0]; R.stages[nx].status='current'; html+=`<p>Келесі кезең: <b>${esc(stageName(nx))}</b></p>`; } }
  else { st.testUnlocked=false; st.l3streak=0; html+=`<p class="note">3-деңгейде тағы жаттығып, қайта тапсыр.</p>`; }
  html+=`<button class="btn wide" onclick="showHome()">Жалғастыру</button></div>`;
  persist(); TS=null; PR=null; app().innerHTML=html;
}
