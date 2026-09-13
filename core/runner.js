/* Есеп жолы · core/runner.js v1.0 — generic route runner. Owner: platform owner.
   A route supplies:  STAGES (rows [id,name,type,params,prereq,grade]),  GENERATORS {type: (params,lvl)=>question},
   optional CARDS {stageId:[{stem,expl,fig}]},  optional FIGS {type:(fig)=>html}.
   Then calls:  Runner.start({route:'FR', title:'Бөлшектер · 3–5 сынып'}).
   Question object: {stem, kind:'choice'|'input'|'custom', choices:[values], choiceHTML:[html] (optional), ans, fig (html string | {type,...}),
                     h1 (plan), h2 (expression), expl (full solution), steps:[{label,expr,val}], mount(el,submit) for kind 'custom'}
   Adaptive rules = ROUTE_CONVENTION §7 (same as wp/). */
(function(){
'use strict';
const esc=s=>Core.esc(s), $=id=>document.getElementById(id), app=()=>$('app');
let CFG=null, R=null, PR=null, DG=null, TS=null;
const stageRow=id=>STAGES.find(s=>s[0]===id);
const stageName=id=>{ const s=stageRow(id); return s?s[1]:id; };
const stageIdx=id=>STAGES.findIndex(s=>s[0]===id);
const topbar=()=>Core.topbar(CFG.title);
const KW=['артық','кем','қалды','барлығы','есе','неше','қанша','бөлігі','жартысы','ширегі','теңдей','үлкен','кіші','тең','бөлімі','алымы'];
function stemHTML(stem,hl){ let h=esc(stem); if(!hl) return h; h=h.replace(/(\d+([.,]\d+)?(\/\d+)?)/g,'<b class="hl-num">$1</b>'); const re=new RegExp('(^|[^а-яәіңғүұқөһА-ЯӘІҢҒҮҰҚӨҺ])('+KW.join('|')+')(?=[^а-яәіңғүұқөһ]|$)','g'); return h.replace(re,'$1<mark class="hl-kw">$2</mark>'); }
function figHTML(f){ if(!f) return ''; if(typeof f==='string') return f; if(window.FIGS&&FIGS[f.type]) return FIGS[f.type](f); if(window.renderFig) return renderFig(f.type,f.fp||''); return ''; }

/* ── state ── */
function freshStages(st){ st=st||{}; STAGES.forEach(([id])=>{ if(!st[id]) st[id]={status:'locked',level:1,streak:0,wrong:0,l3streak:0,testUnlocked:false,tests:[],seenCard:false}; }); return st; }
const persist=()=>Core.save(R);
function log(ev){ if(ev.ev==='answer'){ const a=Object.assign({},ev); delete a.ev; Core.answer(a); } else Core.event(ev); }
function currentStage(){ for(const [id] of STAGES){ if(R.stages[id].status==='current') return id; } return STAGES[0][0]; }
const acc=()=>R.nAns?Math.round(100*(R.nOk||0)/R.nAns):0;
function qinfo(q){ return {stem:String(q.stem||'').slice(0,200),ans:String(q.ans),given:(window._Q&&window._Q.given!==undefined)?String(window._Q.given).slice(0,30):undefined}; }

/* ── items ── */
function makeItem(stId,lvl){ const row=stageRow(stId); const gen=GENERATORS[row[2]]; if(!gen) return null;
  for(let k=0;k<8;k++){ try{ const q=gen(row[3]||{},lvl); if(q&&q.stem!==undefined&&q.ans!==undefined){ q.stage=stId; q.lvl=lvl; q.type=row[2]; q.kind=q.kind||(q.choices&&q.choices.length?'choice':'input'); q.choices=q.choices||[]; q.id=stId+'#'+Date.now().toString(36)+Math.floor(Math.random()*999); return q; } }catch(e){ console.error('generator',row[2],e); } }
  return null; }
const stageHasContent=st=>!!GENERATORS[stageRow(st)[2]];
function cardsOf(st){ return (window.CARDS&&CARDS[st])||[]; }

/* ── home ── */
function showHome(){
  const cur=currentStage(); let html=topbar();
  if(!R.diag){ html+=`<div class="card"><h2>Алдымен — диагностика</h2><p>Қысқа тест: 8–12 есеп. Сен қай кезеңнен бастайтыныңды анықтайды. Білмесең — «Білмеймін» деп бас.</p><button class="btn wide" id="b_diag">Диагностиканы бастау</button></div>`; }
  else { const st=R.stages[cur]; const done=STAGES.filter(s=>R.stages[s[0]].status==='passed').length;
    html+=`<div class="card"><div class="qbar"><span>Қазіргі кезең</span><span class="chip">${cur}</span></div><h2>${esc(stageName(cur))}</h2>
      <p>Деңгей ${st.level}/3 · <span class="dots">${[1,2,3].map(l=>`<i class="${l<st.level?'done':l===st.level?'on':''}"></i>`).join('')}</span> · қатарынан дұрыс: ${st.streak}</p>
      <div class="row"><button class="btn" data-pr="${cur}">Жаттығу</button><button class="btn gold" data-test="${cur}">Кезең тесті (10 есеп)</button></div>
      <p class="note" style="margin-top:10px">Келесі кезеңге өту үшін кезең тестінен 10 есептің 8-ін шығару керек.</p></div>`;
    html+=`<div class="card"><div class="qbar"><span>Жол картасы</span><span class="chip good">${done}/${STAGES.length} өтілді</span></div>`;
    STAGES.forEach(([id,name,,,,gr],i)=>{ const s=R.stages[id]; const cls=s.status==='passed'?'passed':id===cur?'current':''; const has=stageHasContent(id);
      html+=`<div class="stage ${cls}"><div class="num">${i+1}</div><div class="t"><b>${esc(name)}</b><span>${esc(gr||'')}${gr?'-сынып':''}${has?'':' · әзірге жоқ'}${s.status==='passed'?' · өтілді':''}</span></div><div class="go">${(id===cur||s.status==='passed')&&has?`<button class="btn ghost" data-pr="${id}">▶</button>`:''}</div></div>`; });
    html+='</div>'; }
  html+=`<div class="card"><div class="stat"><div><b>${Math.round((R.time||0)/60000)}</b><span>минут</span></div><div><b>${R.nAns||0}</b><span>есеп</span></div><div><b>${acc()}%</b><span>дұрыс</span></div></div><p class="note" style="margin:8px 0 0"><a href="../">← Барлық бағыттар</a></p></div>`;
  app().innerHTML=html; persist();
  const bd=$('b_diag'); if(bd) bd.onclick=startDiag;
  app().querySelectorAll('[data-pr]').forEach(b=>b.onclick=()=>startPractice(b.dataset.pr));
  app().querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>startTest(b.dataset.test));
}

/* ── question view ── */
function renderQuestion(q,o){
  const fig=figHTML(q.fig); let input='';
  if(q.kind==='choice'){ input=`<div class="choices${q.choices.length===3?' three':''}">${q.choices.map((c,i)=>`<button class="choice" data-v="${esc(c)}">${q.choiceHTML?q.choiceHTML[i]:esc(c)}</button>`).join('')}</div>`; }
  else if(q.kind==='input'){ input=`<div class="row"><input class="big" id="ans" inputmode="decimal" placeholder="Жауап" autocomplete="off"><button class="btn" id="ansBtn">Тексеру</button></div>`; }
  else input=`<div id="custom"></div>`;
  const ladder=o.ladder&&!o.noHints;
  app().innerHTML=topbar()+`<div class="card"><div class="qbar"><span>${esc(o.title)}</span><span class="chip muted">${esc(o.sub||'')}</span></div>
   <div class="stem">${stemHTML(q.stem,false)}</div>${q.exprHTML?`<div class="expr">${q.exprHTML}</div>`:''}${fig?`<div class="fig">${fig}</div>`:''}${input}
   <div id="hints"></div><div id="fb"></div>
   <div class="row" style="margin-top:12px">${ladder?`<button class="btn ghost" id="hintBtn">Кеңес 1/5</button><button class="btn plain" id="dkBtn">Білмеймін</button>`:''}${o.onSkip?`<button class="btn plain" id="skipBtn">Білмеймін</button>`:''}<button class="btn plain" id="homeBtn">Басты бет</button></div></div>`;
  window._Q={q,o,done:false};
  app().querySelectorAll('.choice').forEach(b=>b.onclick=()=>{ if(!window._Q.done) finishAnswer(b.dataset.v,b); });
  const ai=$('ans'); if(ai){ ai.onkeydown=e=>{ if(e.key==='Enter') answerInput(); }; $('ansBtn').onclick=answerInput; setTimeout(()=>ai.focus(),50); }
  if(q.kind==='custom'&&q.mount) q.mount($('custom'),v=>{ if(!window._Q.done) finishAnswer(v,null); });
  const hb=$('hintBtn'); if(hb) hb.onclick=nextHint; const dk=$('dkBtn'); if(dk) dk.onclick=dontKnow; const sk=$('skipBtn'); if(sk) sk.onclick=()=>{ if(window._Q.done) return; window._Q.done=true; o.onSkip(); }; $('homeBtn').onclick=showHome;
}
function answerInput(){ const v=$('ans').value.trim(); if(!v||window._Q.done) return; finishAnswer(v,null); }
function disableInputs(){ document.querySelectorAll('.choice').forEach(b=>b.disabled=true); const ai=$('ans'); if(ai) ai.disabled=true; const ab=$('ansBtn'); if(ab) ab.disabled=true; document.querySelectorAll('#custom button,#custom input').forEach(b=>b.disabled=true); }
function finishAnswer(v,btn){
  const {q,o}=window._Q; const ok=Core.isCorrect(q,v);
  if(o.mode==='practice' && !ok && !PR.retried && PR.step<5){ PR.retried=true; log({ev:'attempt',ok:false,id:q.id,stage:PR.stId});
    if(btn){ btn.disabled=true; btn.classList.add('no'); } const ai0=$('ans'); if(ai0){ ai0.value=''; ai0.style.borderColor='var(--bad)'; ai0.focus(); }
    $('fb').innerHTML=`<div class="fb no">Қате. Тағы бір рет ойлан немесе «Кеңес» бас.</div>`; return; }
  window._Q.done=true; window._Q.given=v;
  document.querySelectorAll('.choice').forEach(b=>{ b.disabled=true; if(Core.isCorrect(q,b.dataset.v)) b.classList.add('ok'); else if(b===btn) b.classList.add('no'); });
  const ai=$('ans'); if(ai){ ai.disabled=true; ai.style.borderColor=ok?'var(--good)':'var(--bad)'; } const ab=$('ansBtn'); if(ab) ab.disabled=true; disableInputs();
  const ansShow=q.ansHTML||esc(q.ans);
  $('fb').innerHTML=`<div class="fb ${ok?'ok':'no'}">${ok?'Дұрыс! ✓':'Қате. Дұрыс жауабы: '+ansShow}${o.mode==='practice'&&q.expl?`<span class="expl">${esc(q.expl)}</span>`:''}</div>`;
  o.onAnswer(ok);
  if(o.mode==='practice'){ const st=R.stages[PR.stId]; const hb=$('hintBtn'); if(hb) hb.disabled=true; const dk=$('dkBtn'); if(dk) dk.style.display='none';
    $('fb').insertAdjacentHTML('beforeend',`<div style="height:10px"></div><div class="row"><button class="btn" id="nextBtn">${PR.twin&&!ok?'Ұқсас есеп':'Келесі есеп'}</button>${st.testUnlocked?`<button class="btn gold" id="testBtn">Кезең тесті</button>`:''}</div>`);
    $('nextBtn').onclick=afterAnswerNav; const tb=$('testBtn'); if(tb) tb.onclick=()=>startTest(PR.stId); }
}

/* ── teaching card ── */
function showCard(stId,cards,i,done){
  const c=cards[i]; const fig=figHTML(c.fig);
  app().innerHTML=topbar()+`<div class="card teach"><div class="qbar"><span>Үйрену картасы ${i+1}/${cards.length}</span><span class="chip gold">${stId}</span></div>
  <div class="stem">${esc(c.stem)}</div>${fig?`<div class="fig">${fig}</div>`:''}<div class="fb ok" style="margin-top:0"><span class="expl">${esc(c.expl)}</span></div>
  <div style="height:12px"></div><button class="btn wide" id="cardNext">${i+1<cards.length?'Келесі':'Түсіндім, бастаймын'}</button></div>`;
  $('cardNext').onclick=()=>{ if(i+1<cards.length) showCard(stId,cards,i+1,done); else done(); };
}

/* ── practice ── */
function startPractice(stId){
  const st=R.stages[stId]; PR={stId,q:null,hints:0,step:0,twin:false};
  if(!st.seenCard){ const cards=cardsOf(stId); if(cards.length){ return showCard(stId,cards,0,()=>{ st.seenCard=true; persist(); nextPractice(); }); } st.seenCard=true; }
  nextPractice();
}
function nextPractice(){
  const st=R.stages[PR.stId]; const q=makeItem(PR.stId,st.level);
  if(!q){ app().innerHTML=topbar()+`<div class="card"><h2>Бұл кезеңде әзірге есеп жоқ</h2><button class="btn wide" id="homeBtn">Артқа</button></div>`; $('homeBtn').onclick=showHome; return; }
  PR.q=q; PR.hints=0; PR.step=0; PR.stepIdx=0; PR.retried=false; PR.t0=Date.now(); PR.isTwin=PR.twin; PR.twin=false;
  renderQuestion(q,{mode:'practice',title:`${PR.stId} · деңгей ${st.level}/3 · қатарынан ${st.streak}/3 ✓`,sub:PR.isTwin?'ұқсас есеп':(st.level===3?`тестке дейін ${Math.min(st.l3streak,3)}/3`:stageName(PR.stId)),onAnswer:onPracticeAnswer,ladder:true});
}
function onPracticeAnswer(ok){
  const st=R.stages[PR.stId]; const q=PR.q; const counted=ok&&PR.hints<3;
  log({ev:'answer',mode:'practice',stage:PR.stId,lvl:st.level,ok,hints:PR.hints,twin:PR.isTwin||undefined,ms:Date.now()-PR.t0,id:q.id,type:q.type,...qinfo(q)});
  let msg='';
  if(PR.hints>=5){ st.streak=0; if(st.level===3) st.l3streak=0; PR.twin=true; msg='Енді ұқсас есепті өзің шығар.'; }
  else {
    if(counted){ st.streak++; st.wrong=0; if(st.level===3) st.l3streak++; }
    else if(ok){ st.wrong=0; msg='Дұрыс, бірақ кеңеспен — қатарға саналмайды.'; }
    else { st.streak=0; st.wrong++; if(st.level===3) st.l3streak=0; PR.twin=true; }
    if(st.streak>=3&&st.level<3){ st.level++; st.streak=0; msg=`Жарайсың! ${st.level}-деңгейге көштің.`; }
    if(st.level===3&&st.l3streak>=3&&!st.testUnlocked){ st.testUnlocked=true; msg='Кезең тесті ашылды!'; }
    if(st.wrong>=2&&st.level>1){ st.level--; st.wrong=0; st.streak=0; PR.twin=false; msg=`Бір деңгей төмен түстік (${st.level}). Суретке қарап шығарайық.`; st.seenCard=false; }
  }
  persist();
  const fbEl=document.querySelector('.fb'); if(fbEl&&msg){ const d=document.createElement('div'); d.className='hint'; d.innerHTML='<small>Жол</small>'+esc(msg); fbEl.after(d); }
}
function afterAnswerNav(){ const st=R.stages[PR.stId]; if(!st.seenCard) return startPractice(PR.stId); nextPractice(); }

/* ── hint ladder ── */
function nextHint(){
  const {q,o}=window._Q; if(window._Q.done||PR.step>=5) return;
  PR.step++; PR.hints=PR.step; log({ev:'hint',n:PR.step,id:q.id,stage:PR.stId});
  const box=$('hints'); const add=h=>{ box.insertAdjacentHTML('beforeend',h); box.lastElementChild.scrollIntoView({behavior:'smooth',block:'nearest'}); };
  if(PR.step===1){ document.querySelector('.stem').innerHTML=stemHTML(q.stem,true); add(`<div class="hint"><small>1-қадам · Есепті қайта оқы</small>Сандар мен маңызды сөздерді белгіледім. Не белгілі, не сұралып тұр?</div>`); }
  else if(PR.step===2){ const hf=figHTML(q.hfig);
    if(hf) add(`<div class="hint"><small>2-қадам · Сұлба</small><div class="fig" style="margin:8px 0 0">${hf}</div>«?» — іздеп отырған сан.</div>`);
    else if(q.fig){ const f=document.querySelector('.fig'); if(f) f.classList.add('pulse'); add(`<div class="hint"><small>2-қадам · Суретке қара</small>Суреттен белгілі сандарды тап. Не сұралып тұр?</div>`); }
    else add(`<div class="hint"><small>2-қадам · Қысқаша жазба</small>Белгілі сандарды қатар-қатар жаз, іздеп отырғанның орнына «?» қой.</div>`); }
  else if(PR.step===3){ add(`<div class="hint"><small>3-қадам · Жоспар</small>${esc(q.h1||q.h2||'Қай амалды қолданасың? Неге?')}</div>`); }
  else if(PR.step===4){ const steps=(q.steps&&q.steps.length)?q.steps:(q.h2?[{label:'',expr:q.h2.replace(/\s*=\s*\?\s*$/,''),val:q.ans}]:[]);
    if(!steps.length){ add(`<div class="hint"><small>4-қадам</small>${esc(q.expl||'')}</div>`); }
    else { PR.stepsArr=steps; PR.stepIdx=0; add(`<div class="hint" id="guide"><small>4-қадам · Қадамдап есепте</small><div id="guideSteps"></div></div>`); renderGuideStep(); } }
  else if(PR.step===5){ add(`<div class="hint" style="background:var(--good-soft)"><small>5-қадам · Толық шешуі</small><span class="expl" style="display:block;white-space:pre-line">${esc(q.expl||('Жауабы: '+q.ans))}</span></div>`);
    window._Q.done=true; disableInputs(); $('fb').innerHTML=`<div class="fb no">Шешуін көрдің. Енді осындай есепті өзің шығарасың.</div>`; o.onAnswer(false);
    $('fb').insertAdjacentHTML('beforeend',`<div style="height:10px"></div><div class="row"><button class="btn" id="nextBtn">Ұқсас есеп</button></div>`); $('nextBtn').onclick=afterAnswerNav; }
  const hb=$('hintBtn'); if(hb){ hb.textContent=PR.step>=5?'Кеңес 5/5':`Кеңес ${PR.step+1}/5`; hb.disabled=PR.step>=5; }
  const dk=$('dkBtn'); if(dk) dk.style.display='none';
}
function renderGuideStep(){
  const st=PR.stepsArr[PR.stepIdx]; const box=$('guideSteps'); if(!box) return;
  const done=PR.stepsArr.slice(0,PR.stepIdx).map(s=>`<div class="gstep done">${s.label?esc(s.label)+': ':''}${esc(s.expr)} = <b>${esc(s.val)}</b> ✓</div>`).join('');
  box.innerHTML=done+`<div class="gstep"><span>${st.label?esc(st.label)+': ':''}${esc(st.expr)} =</span> <input class="big" id="gin" inputmode="decimal" style="width:110px;display:inline-block;padding:6px 10px;font-size:1.1rem"> <button class="btn ghost" id="gbtn" style="padding:8px 12px;min-height:40px">Тексеру</button><span id="gmsg" class="note"></span></div>`;
  $('gin').onkeydown=e=>{ if(e.key==='Enter') checkGuide(); }; $('gbtn').onclick=checkGuide; setTimeout(()=>$('gin').focus(),30);
}
function checkGuide(){
  const st=PR.stepsArr[PR.stepIdx]; const v=($('gin').value||'').trim(); if(!v) return;
  if(Core.isCorrect({ans:st.val},v)){ log({ev:'step',n:PR.stepIdx+1,ok:true,id:PR.q.id}); PR.stepIdx++;
    if(PR.stepIdx>=PR.stepsArr.length){ $('guideSteps').innerHTML=PR.stepsArr.map(s=>`<div class="gstep done">${s.label?esc(s.label)+': ':''}${esc(s.expr)} = <b>${esc(s.val)}</b> ✓</div>`).join(''); if(!window._Q.done){ const ai=$('ans'); if(ai) ai.value=st.val; finishAnswer(st.val,null); } }
    else renderGuideStep(); }
  else { log({ev:'step',n:PR.stepIdx+1,ok:false,id:PR.q.id}); $('gmsg').textContent=' Қате, қайта есепте.'; $('gin').select(); }
}
function dontKnow(){ if(window._Q.done) return; log({ev:'dontknow',id:PR.q.id,stage:PR.stId}); nextHint(); }

/* ── diagnostic ── */
function startDiag(){ const ids=STAGES.map(s=>s[0]).filter(stageHasContent); DG={ids,lo:0,hi:ids.length-1,n:0,results:{},per:{},start:Date.now()}; nextDiag(); }
function nextDiag(){
  if(DG.n>=12||DG.lo>DG.hi||Date.now()-DG.start>15*60000) return finishDiag();
  const mid=Math.floor((DG.lo+DG.hi)/2); const st=DG.ids[mid]; if(!DG.per[st]) DG.per[st]={asked:0,ok:0};
  if(DG.per[st].asked>=2){ if(DG.per[st].ok===2){ DG.results[st]='pass'; DG.lo=mid+1; } else { DG.results[st]='fail'; DG.hi=mid-1; } return nextDiag(); }
  const q=makeItem(st,3); if(!q){ DG.results[st]='pass'; DG.lo=mid+1; return nextDiag(); }
  DG.n++; const t0=Date.now();
  renderQuestion(q,{mode:'diag',title:`Диагностика · ${DG.n}-есеп`,sub:st,noHints:true,
    onAnswer:ok=>{ DG.per[st].asked++; if(ok) DG.per[st].ok++; log({ev:'answer',mode:'diag',stage:st,lvl:3,ok,ms:Date.now()-t0,id:q.id,type:q.type,...qinfo(q)}); setTimeout(nextDiag,ok?700:1400); },
    onSkip:()=>{ DG.per[st].asked++; log({ev:'answer',mode:'diag',stage:st,lvl:3,ok:false,skip:true,id:q.id,type:q.type,stem:String(q.stem).slice(0,200),ans:String(q.ans)}); nextDiag(); }});
}
function finishDiag(){
  const ids=DG.ids; const placed=ids[Math.min(DG.lo,ids.length-1)]; const all=STAGES.map(s=>s[0]); const pi=all.indexOf(placed);
  all.forEach((id,i)=>{ R.stages[id].status=i<pi?'passed':(i===pi?'current':'locked'); });
  R.diag={t:Date.now(),placed,results:DG.results,n:DG.n}; log({ev:'diag',placed,results:DG.results}); persist();
  app().innerHTML=topbar()+`<div class="card"><h2>Диагностика аяқталды</h2><p>Сен <b>${pi+1}-кезеңнен</b> бастайсың: <b>${esc(stageName(placed))}</b>.</p><p class="note">${Object.keys(DG.results).map(k=>`${k}: ${DG.results[k]==='pass'?'✓':'✗'}`).join(' · ')}</p><button class="btn wide" id="homeBtn">Жалғастыру</button></div>`; $('homeBtn').onclick=showHome;
}

/* ── stage test ── */
function startTest(stId){
  const qs=[]; const seen=new Set(); for(let i=0;i<10;i++){ let q=null; for(let k=0;k<8&&!q;k++){ const c=makeItem(stId,3); if(c&&!seen.has(c.stem+c.ans)) q=c; } if(q){ seen.add(q.stem+q.ans); qs.push(q); } }
  if(qs.length<6){ app().innerHTML=topbar()+`<div class="card"><h2>Бұл кезеңге тест есептері жеткіліксіз</h2><button class="btn wide" id="homeBtn">Артқа</button></div>`; $('homeBtn').onclick=showHome; return; }
  TS={stId,qs,i:0,ok:0}; PR={stId,mode:'test'}; nextTest();
}
function nextTest(){
  if(TS.i>=TS.qs.length) return finishTest(); const q=TS.qs[TS.i]; TS.t0=Date.now();
  renderQuestion(q,{mode:'test',title:`Кезең тесті · ${TS.i+1}/${TS.qs.length}`,sub:TS.stId,noHints:true,onAnswer:ok=>{ if(ok) TS.ok++; log({ev:'answer',mode:'test',stage:TS.stId,lvl:3,ok,ms:Date.now()-TS.t0,id:q.id,type:q.type,...qinfo(q)}); TS.i++; setTimeout(nextTest,ok?600:1300); }});
}
function finishTest(){
  const st=R.stages[TS.stId]; const need=Math.ceil(TS.qs.length*0.8); const pass=TS.ok>=need;
  st.tests.push({t:Date.now(),ok:TS.ok,n:TS.qs.length,pass}); log({ev:'test',stage:TS.stId,ok:TS.ok,n:TS.qs.length,pass});
  let html=topbar()+`<div class="card"><h2>${pass?'Кезең өтілді! 🎉':'Әзірге өтпеді'}</h2><p>Нәтиже: <b>${TS.ok}/${TS.qs.length}</b> (өту үшін ${need} керек).</p>`;
  if(pass){ st.status='passed'; const i=stageIdx(TS.stId); if(i+1<STAGES.length){ const nx=STAGES[i+1][0]; R.stages[nx].status='current'; html+=`<p>Келесі кезең: <b>${esc(stageName(nx))}</b></p>`; } }
  else { st.testUnlocked=false; st.l3streak=0; html+=`<p class="note">3-деңгейде тағы жаттығып, қайта тапсыр.</p>`; }
  html+=`<button class="btn wide" id="homeBtn">Жалғастыру</button></div>`; persist(); TS=null; PR=null; app().innerHTML=html; $('homeBtn').onclick=showHome;
}

/* ── entry ── */
window.Runner={
  async start(cfg){ CFG=cfg; R=await Core.start(cfg.route); R.stages=freshStages(R.stages); R.diag=R.diag||null;
    const pv=new URLSearchParams(location.search).get('preview'); // ?preview=FR-03&lvl=2 → show one generated item (for authors)
    if(pv&&R.stages[pv]){ const lvl=+(new URLSearchParams(location.search).get('lvl')||2); PR={stId:pv,hints:0,step:0}; const q=makeItem(pv,lvl); PR.q=q; PR.t0=Date.now(); renderQuestion(q,{mode:'practice',title:`Алдын ала қарау · ${pv} · L${lvl}`,sub:'preview',onAnswer:()=>{},ladder:true}); $('nextBtn')&&($('nextBtn').onclick=()=>location.reload()); return; }
    showHome(); },
  home:()=>showHome(), state:()=>R,
};
})();
