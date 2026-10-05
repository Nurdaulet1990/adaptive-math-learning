/* wp/practice.js — practice loop, adaptive rules (§7 of ROUTE_CONVENTION), 5-step hint ladder, twin items. Owner: Nurdaulet.
   Since 2026-10 the scaffold level lives PER FAMILY (wp/families.js):
   right in a row FAM_NEED[level] → level+1 · at the top level → family finished, next family starts at the bottom ·
   2 wrong → level−1 · hints ≥3 don't count · step 5 → streak reset + twin ·
   FAM_REVIEW of questions come from finished families at their own level · all families finished → stage test. */
'use strict';
let PR=null;
function startPractice(stId){
  const st=R.stages[stId]; PR={stId,q:null,hints:0,step:0,twinOf:null};
  syncFam(stId,st);
  if(!st.seenCard){ const cards=CARDS(stId).filter(c=>c.lvl<=st.level||c.lvl===1); if(cards.length){ return showCard(stId,cards,0,()=>{ st.seenCard=true; persist(); nextPractice(); }); } st.seenCard=true; }
  nextPractice();
}
function nextPractice(){
  const stId=PR.stId; const st=R.stages[stId]; const g=wpGrade(); let q=null; const twin=PR.twinOf;
  const fid=curFam(stId,st); const done=doneFams(stId,st);
  let fam=fid;
  if(twin){ const t=tplById(twin); if(t){ for(let k=0;k<5&&!q;k++) q=generate(t); if(q){ fam=famOfTpl(twin)||fid; q.fam=fam; } } }
  if(!q){
    if(!fid){ fam=done.length?pick(done):null; }                                   /* everything finished: review at the top */
    else if(done.length&&Math.random()<FAM_REVIEW){ fam=pick(done); }               /* a look back at a finished family */
    else fam=fid;
    if(fam) q=drawFam(stId,fam,st.fam[fam].level,{mode:'practice'});
    if(!q&&fid&&fam!==fid){ fam=fid; q=drawFam(stId,fam,st.fam[fam].level,{mode:'practice'}); }
  }
  if(!q){ /* no family content for this stage: fall back to the old pool */ fam=null; q=drawItem(stId,st.level,{mode:'practice',tplLvl:tplLvl(g,st.level)}); }
  if(!q){ app().innerHTML=topbar()+`<div class="card"><h2>Бұл кезеңде әзірге есеп жоқ</h2><p class="note">Есептер дайындалып жатыр.</p><button class="btn wide" onclick="showHome()">Артқа</button></div>`; return; }
  const f=fam?st.fam[fam]:null; const scaff=f?f.level:st.level; const need=FAM_NEED[scaff]||5;
  PR.q=q; PR.fam=fam; PR.review=!!(fam&&(!fid||fam!==fid)); PR.scaff=scaff;
  PR.hints=0; PR.step=0; PR.stepIdx=0; PR.retried=false; PR.t0=Date.now(); PR.isTwin=!!twin;
  const streak=f?f.streak:st.streak;
  const famLabel=fam?`${famName(stId,fam)} · ${LVL_NAME[scaff]||''}${twin?' · ұқсас есеп':''}`:'';
  renderQuestion(q,{mode:'practice',title:stageName(stId),meta:PR.review?`✓ ${need}/${need}`:`🔥 ${streak}/${need}`,prog:streak/need,
    sub:twin?'ұқсас есеп':(fam?famName(stId,fam):stageName(stId)),scaffoldLevel:scaff,famLabel,need,streak,review:PR.review,
    onAnswer:(ok)=>onPracticeAnswer(ok),ladder:true});
}
function onPracticeAnswer(ok){
  const stId=PR.stId; const st=R.stages[stId]; const q=PR.q; const counted = ok && PR.hints<3; const g=wpGrade();
  const f=PR.fam?st.fam[PR.fam]:null;
  log({ev:'answer',mode:'practice',stage:stId,lvl:PR.scaff,fam:PR.fam||undefined,review:PR.review||undefined,ok,hints:PR.hints,twin:PR.isTwin||undefined,ms:Date.now()-PR.t0,id:q.id,tpl:q.tpl||null,type:'tpl',...qinfo(q)});
  let msg='';
  if(!f){ /* legacy pool (no families for this stage) — old per-stage rule */
    if(PR.hints>=5){ st.streak=0; PR.twinOf=q.tpl||null; msg='Енді ұқсас есепті өзің шығар.'; }
    else { if(counted){ st.streak++; st.wrong=0; } else if(ok){ st.wrong=0; } else { st.streak=0; st.wrong++; if(q.tpl) PR.twinOf=q.tpl; }
      if(st.streak>=3&&st.level<gradeMax(g)){ st.level++; st.streak=0; msg=`Жарайсың! ${st.level}-деңгейге көштің.`; Core.sound('up'); }
      if(st.wrong>=2&&st.level>gradeMin(g)){ st.level--; st.wrong=0; st.streak=0; } }
    persist(); showPracticeMsg(msg); return;
  }
  const need=FAM_NEED[f.level]||5; const minL=gradeMin(g), maxL=gradeMax(g);
  if(PR.hints>=5){ f.streak=0; PR.twinOf=q.tpl||null; msg='Енді ұқсас есепті өзің шығар.'; }
  else {
    if(counted){ if(!f.done) f.streak++; f.wrong=0; if(PR.isTwin) PR.twinOf=null; }
    else if(ok){ f.wrong=0; if(!f.done) msg='Дұрыс, бірақ кеңеспен — қатарға саналмайды.'; if(PR.isTwin&&PR.hints<4) PR.twinOf=null; }
    else { f.streak=0; f.wrong++; if(q.tpl) PR.twinOf=q.tpl; }
    if(f.done){ /* a finished family, met again as review: two misses reopen it one level down */
      if(f.wrong>=2){ f.done=false; f.level=Math.max(minL,f.level-1); f.wrong=0; f.streak=0; PR.twinOf=null; st.cur=PR.fam;
        msg=`«${famName(stId,PR.fam)}» түрін тағы бір қайталайық (${f.level}-деңгей).`; }
    } else {
      if(f.streak>=need){
        f.streak=0; f.wrong=0;
        if(f.level<maxL){ f.level++; msg=`Жарайсың! ${f.level}-деңгейге көштің.`; Core.sound('up'); }
        else { f.done=true; const nx=curFam(stId,st);
          msg=nx?`«${famName(stId,PR.fam)}» меңгерілді! Енді жаңа түр: «${famName(stId,nx)}».`:'Барлық түрі меңгерілді — кезең тесті ашылды!'; Core.sound('up'); }
      }
      if(f.wrong>=2){ f.wrong=0; f.streak=0; PR.twinOf=null;
        if(f.level>minL){ f.level--; msg=`Бір деңгей төмен түстік (${f.level}). Суретке қарап шығарайық.`; } }
    }
  }
  syncFam(stId,st); persist(); showPracticeMsg(msg);
}
function showPracticeMsg(msg){ const fbEl=document.querySelector('.fb'); if(fbEl&&msg){ const d=document.createElement('div'); d.className='hint'; d.innerHTML='<small>Жол</small>'+esc(msg); fbEl.after(d); } }
function afterAnswerNav(){ if(PR&&PR.mode!=='test'){ const st=R.stages[PR.stId]; if(!st.seenCard) return startPractice(PR.stId); nextPractice(); } }

/* ── hint ladder ── */
function nextHint(){
  const {q,o}=window._Q; if(window._Q.done&&PR.step<5) return; if(PR.step>=5) return;
  PR.step++; PR.hints=PR.step; log({ev:'hint',n:PR.step,id:q.id,stage:PR.stId,tpl:q.tpl||null});
  const box=$('hints'); const add=(html)=>{ box.insertAdjacentHTML('beforeend',html); box.lastElementChild.scrollIntoView({behavior:'smooth',block:'nearest'}); };
  if(PR.step===1){ document.querySelector('.stem').innerHTML=stemHTML(q.stem,true); add(`<div class="hint"><small>1-қадам · Есепті қайта оқы</small>Сандар мен маңызды сөздерді белгіледім. Не белгілі, не сұралып тұр?</div>`); }
  else if(PR.step===2){
    if(q.hfig&&q.hfp){ add(`<div class="hint"><small>2-қадам · Сұлба</small><div class="fig" style="margin:8px 0 0">${renderFig(q.hfig,q.hfp)}</div>«?» — іздеп отырған сан.</div>`); }
    else if(q.fig&&q.fp){ const f=document.querySelector('.fig'); if(f) f.classList.add('pulse'); add(`<div class="hint"><small>2-қадам · Суретке қара</small>Суреттегі «?» — іздеп отырған сан. Белгілі сандарды суреттен тап.</div>`); }
    else add(`<div class="hint"><small>2-қадам · Қысқаша жазба</small>Белгілі сандарды қатар-қатар жаз, іздеп отырғанның орнына «?» қой.</div>`);
  }
  else if(PR.step===3){ add(`<div class="hint"><small>3-қадам · Жоспар</small>${esc(q.h1||q.h2||'Қай амалды қолданасың? Неге?')}</div>`); }
  else if(PR.step===4){
    const steps=(q.steps&&q.steps.length)?q.steps:(q.h2?[{label:'',expr:q.h2.replace(/\s*=\s*\?\s*$/,''),val:q.ans}]:[]);
    if(!steps.length){ add(`<div class="hint"><small>4-қадам</small>${esc(q.expl||'')}</div>`); return; }
    PR.stepsArr=steps; PR.stepIdx=0;
    add(`<div class="hint" id="guide"><small>4-қадам · Қадамдап есепте</small><div id="guideSteps"></div></div>`); renderGuideStep();
  }
  else if(PR.step===5){
    add(`<div class="hint" style="background:var(--good-soft)"><small>5-қадам · Толық шешуі</small><span class="expl" style="display:block;white-space:pre-line">${esc(q.expl)}</span></div>`);
    if(!window._Q.done){ window._Q.done=true; disableInputs(); const qb=$('qbar'); if(qb) qb.style.display='none';
      $('fb').innerHTML=`<div class="fb no">Шешуін көрдің. Енді осындай есепті өзің шығарасың.</div>`; o.onAnswer(false);
      $('fb').insertAdjacentHTML('beforeend',`<div class="row"><button class="btn" onclick="afterAnswerNav()">Ұқсас есеп</button></div>`); }
  }
  const hb=$('hintBtn'); if(hb){ hb.textContent=PR.step>=5?'Кеңес 5/5':`Кеңес ${PR.step+1}/5`; hb.disabled=PR.step>=5; }
  const dk=$('dkBtn'); if(dk) dk.style.display='none';
}
function renderGuideStep(){
  const st=PR.stepsArr[PR.stepIdx]; const box=$('guideSteps'); if(!box) return;
  const done=PR.stepsArr.slice(0,PR.stepIdx).map(s=>`<div class="gstep done">${s.label?esc(s.label)+': ':''}${esc(s.expr)} = <b>${esc(s.val)}</b> ✓</div>`).join('');
  box.innerHTML=done+`<div class="gstep"><span>${st.label?esc(st.label)+': ':''}${esc(st.expr)} =</span> <input class="big" id="gin" inputmode="decimal" style="width:110px;display:inline-block;padding:6px 10px;font-size:1.1rem" onkeydown="if(event.key==='Enter')checkGuide()"> <button class="btn ghost" style="padding:8px 12px;min-height:40px" onclick="checkGuide()">Тексеру</button><span id="gmsg" class="note"></span></div>`;
  setTimeout(()=>{ const i=$('gin'); if(i) i.focus(); },30);
}
function checkGuide(){
  const st=PR.stepsArr[PR.stepIdx]; const v=($('gin').value||'').trim(); if(!v) return;
  if(isCorrect({ans:st.val},v)){ log({ev:'step',n:PR.stepIdx+1,ok:true,id:PR.q.id}); PR.stepIdx++;
    if(PR.stepIdx>=PR.stepsArr.length){ $('guideSteps').innerHTML=PR.stepsArr.map(s=>`<div class="gstep done">${s.label?esc(s.label)+': ':''}${esc(s.expr)} = <b>${esc(s.val)}</b> ✓</div>`).join('');
      if(!window._Q.done){ const ai=$('ans');
        /* The last step's value is submitted as the answer ONLY when it IS the answer. Where the answer has more
           parts than the last step (3/8 + 2/8: the step is the numerator 5, the answer is 5/8; 7/4: the step is the
           remainder 3, the answer is 1 3/4) the old code submitted the fragment, and a pupil who had done every
           step right was told «Қате» and lost the streak. Now they are told to write the whole answer. */
        if(isCorrect(PR.q,st.val)){ if(ai) ai.value=st.val; finishAnswer(st.val,null); }
        else { const g=$('guide')||$('guideSteps'); if(g&&!$('guideDone')) g.insertAdjacentHTML('beforeend','<div class="note" id="guideDone" style="margin-top:8px;font-weight:800">Барлық қадам дұрыс! Енді толық жауапты өзің бер.</div>'); if(ai) ai.focus(); } } }
    else renderGuideStep(); }
  else { log({ev:'step',n:PR.stepIdx+1,ok:false,id:PR.q.id}); $('gmsg').textContent=' Қате, қайта есепте.'; $('gin').select(); }
}
function dontKnow(){ if(window._Q.done) return; log({ev:'dontknow',id:PR.q.id,stage:PR.stId}); nextHint(); }
/* L4 has no hint ladder: «Білмеймін» goes straight to the full solution (step 5 → streak reset, twin follows) */
function giveUp(){ if(window._Q.done) return; log({ev:'dontknow',id:PR.q.id,stage:PR.stId,l4:true}); PR.step=4; PR.hints=4; nextHint(); }
