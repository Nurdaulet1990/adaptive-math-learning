/* wp/screens.js — home screen, teaching card, question view, answer handling. Owner: Nurdaulet.
   finishAnswer() is the single place a final answer is judged; it calls o.onAnswer(ok), which logs via log({ev:'answer',…}). */
'use strict';
const KW=['артық','кем','қалды','барлығы','барлық','есе','неше','қанша','нешеу','бірге','екеуінде','үшеуі','жетпейді','керек','пайыз','бөлігі','жартысы','ширегі','теңдей','әрқайсысында','бұл'];
function stemHTML(stem,hl){
  let h=esc(stem); if(!hl) return h;
  h=h.replace(/(\d+([.,]\d+)?(\/\d+)?)/g,'<b class="hl-num">$1</b>');
  const re=new RegExp('(^|[^а-яәіңғүұқөһА-ЯӘІҢҒҮҰҚӨҺ])('+KW.join('|')+')(?=[^а-яәіңғүұқөһ]|$)','g');
  return h.replace(re,'$1<mark class="hl-kw">$2</mark>');
}

/* ── home ── */
function showHome(){
  const cur=currentStage();
  let html=topbar();
  if(!R.diag){
    html+=`<div class="card"><h2>Алдымен — диагностика</h2><p>Қысқа тест: 8–12 есеп, 10–15 минут. Сен қай кезеңнен бастайтыныңды анықтайды. Сурет жоқ, тек мәтін. Білмесең — «Білмеймін» деп бас.</p><button class="btn wide" onclick="startDiag()">Диагностиканы бастау</button></div>`;
  } else {
    const st=R.stages[cur]; const done=STAGES.filter(s=>R.stages[s[0]].status==='passed').length;
    html+=`<div class="card"><div class="qbar"><span>Қазіргі кезең</span><span class="chip">${cur}</span></div><h2>${esc(stageName(cur))}</h2>
      <p>Деңгей ${st.level}/3 · <span class="dots">${[1,2,3].map(l=>`<i class="${l<st.level?'done':l===st.level?'on':''}"></i>`).join('')}</span> · қатарынан дұрыс: ${st.streak}</p>
      <div class="row"><button class="btn" onclick="startPractice('${cur}')">Жаттығу</button><button class="btn gold" onclick="startTest('${cur}')">Кезең тесті (10 есеп)</button></div>
      <p class="note" style="margin-top:10px">Келесі кезеңге өту үшін кезең тестінен 10 есептің 8-ін шығару керек. Тестті кез келген уақытта тапсыруға болады; ұсыныс: 3-деңгейге жеткен соң.</p></div>`;
    html+=`<div class="card"><div class="qbar"><span>Жол картасы</span><span class="chip good">${done}/${STAGES.length} өтілді</span></div>`;
    STAGES.forEach(([id,name,,,,gr],i)=>{ const s=R.stages[id]; const cls=s.status==='passed'?'passed':id===cur?'current':''; const has=stageHasContent(id);
      html+=`<div class="stage ${cls}"><div class="num">${i+1}</div><div class="t"><b>${esc(name)}</b><span>${esc(gr)}-сынып${has?'':' · есептер әлі дайын емес'}${s.status==='passed'?' · өтілді':''}</span></div><div class="go">${(id===cur||s.status==='passed')&&has?`<button class="btn ghost" onclick="startPractice('${id}')">▶</button>`:''}</div></div>`; });
    html+=`</div>`;
  }
  html+=`<div class="card"><div class="stat"><div><b>${Math.round((R.time||0)/60000)}</b><span>минут</span></div><div><b>${R.nAns||0}</b><span>есеп</span></div><div><b>${acc()}%</b><span>дұрыс</span></div></div><p class="note" style="margin:8px 0 0"><a href="../">← Барлық бағыттар</a></p></div>`;
  app().innerHTML=html; persist();
}

/* ── teaching card ── */
function showCard(stId,cards,i,done){
  const c=cards[i]; const fig=c.fig&&c.fp?renderFig(c.fig,c.fp):'';
  app().innerHTML=topbar()+`<div class="card teach"><div class="qbar"><span>Үйрену картасы ${i+1}/${cards.length}</span><span class="chip gold">${stId}</span></div>
  <div class="stem">${esc(c.stem)}</div>${fig?`<div class="fig">${fig}</div>`:''}<div class="fb ok" style="margin-top:0"><span class="expl">${esc(c.expl)}</span></div>
  <div style="height:12px"></div><button class="btn wide" onclick="cardNext()">${i+1<cards.length?'Келесі':'Түсіндім, бастаймын'}</button></div>`;
  window.cardNext=()=>{ if(i+1<cards.length) showCard(stId,cards,i+1,done); else done(); };
}

/* ── question view ── */
function renderQuestion(q,o){
  const fig=q.fig&&q.fp?renderFig(q.fig,q.fp):'';
  let input;
  if(q.qtype==='选择' && q.choices.length){ input=`<div class="choices">${q.choices.map(c=>`<button class="choice" data-v="${esc(c)}" onclick="answerChoice(this)">${esc(c)}</button>`).join('')}</div>`; }
  else { input=`<div class="row"><input class="big" id="ans" inputmode="decimal" placeholder="Жауап" autocomplete="off" onkeydown="if(event.key==='Enter')answerInput()"><button class="btn" id="ansBtn" onclick="answerInput()">Тексеру</button></div>`; }
  const ladder=o.ladder&&!o.noHints;
  app().innerHTML=topbar()+`<div class="card"><div class="qbar"><span>${esc(o.title)}</span><span class="chip muted">${esc(o.sub||'')}</span></div>
   <div class="stem">${stemHTML(q.stem,false)}</div>${fig?`<div class="fig">${fig}</div>`:''}${input}
   <div id="hints"></div><div id="fb"></div>
   <div class="row" style="margin-top:12px">${ladder?`<button class="btn ghost" id="hintBtn" onclick="nextHint()">Кеңес 1/5</button><button class="btn plain" id="dkBtn" onclick="dontKnow()">Білмеймін</button>`:''}${o.onSkip?`<button class="btn plain" onclick="skipQ()">Білмеймін</button>`:''}<button class="btn plain" onclick="showHome()">Басты бет</button></div></div>`;
  window._Q={q,o,done:false};
  if(!q.choices.length) setTimeout(()=>{ const i=$('ans'); if(i) i.focus(); },50);
}
function skipQ(){ if(window._Q.done) return; window._Q.done=true; window._Q.o.onSkip(); }
function answerChoice(btn){ if(window._Q.done) return; finishAnswer(btn.dataset.v, btn); }
function answerInput(){ if(window._Q.done) return; const v=$('ans').value.trim(); if(!v) return; finishAnswer(v,null); }
function disableInputs(){ document.querySelectorAll('.choice').forEach(b=>b.disabled=true); const ai=$('ans'); if(ai) ai.disabled=true; const ab=$('ansBtn'); if(ab) ab.disabled=true; }
function finishAnswer(v,btn){
  const {q,o}=window._Q; const ok=isCorrect(q,v);
  if(o.mode==='practice' && !ok && !PR.retried && PR.step<5){ PR.retried=true; log({ev:'attempt',ok:false,id:q.id,stage:PR.stId});
    if(btn){ btn.disabled=true; btn.classList.add('no'); } const ai0=$('ans'); if(ai0){ ai0.value=''; ai0.style.borderColor='var(--bad)'; ai0.focus(); }
    $('fb').innerHTML=`<div class="fb no">Қате. Тағы бір рет ойлан немесе «Кеңес» бас.</div>`; return; }
  window._Q.done=true; window._Q.given=v;
  document.querySelectorAll('.choice').forEach(b=>{ b.disabled=true; if(isCorrect(q,b.dataset.v)) b.classList.add('ok'); else if(b===btn) b.classList.add('no'); });
  const ai=$('ans'); if(ai){ ai.disabled=true; ai.style.borderColor=ok?'var(--good)':'var(--bad)'; } const ab=$('ansBtn'); if(ab) ab.disabled=true;
  const showExpl = o.mode==='practice';
  $('fb').innerHTML=`<div class="fb ${ok?'ok':'no'}">${ok?'Дұрыс! ✓':'Қате. Дұрыс жауабы: '+esc(q.ans)}${showExpl&&q.expl?`<span class="expl">${esc(q.expl)}</span>`:''}</div>`;
  o.onAnswer(ok);
  if(o.mode==='practice'){ const st=R.stages[PR.stId]; const hb=$('hintBtn'); if(hb) hb.disabled=true; const dk=$('dkBtn'); if(dk) dk.style.display='none';
    $('fb').insertAdjacentHTML('beforeend',`<div style="height:10px"></div><div class="row"><button class="btn" onclick="afterAnswerNav()">${PR.twinOf&&!ok?'Ұқсас есеп':'Келесі есеп'}</button>${st.testUnlocked?`<button class="btn gold" onclick="startTest('${PR.stId}')">Кезең тесті</button>`:''}</div>`); }
}
