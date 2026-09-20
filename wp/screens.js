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
    const totStars=STAGES.reduce((a,s)=>a+Core.mapStars(R.stages[s[0]]),0);
    html+=`<div class="strip"><div class="pill"><b>${done}/${STAGES.length}</b><span>станция</span></div><div class="pill"><b>★ ${totStars}</b><span>жұлдыз</span></div><div class="pill"><b>${Math.round((R.time||0)/60000)}</b><span>минут</span></div></div>`;
    html+=Core.map({color:'var(--wp)', colorDark:'var(--wp-d)', avatar:Core.avatar(), label:'Мәтінді есептер жолы', go:'Жаттығу',
      stages:STAGES.map(([id,name,,,,gr])=>{ const s=R.stages[id];
        return {id,name,status:s.status,stars:Core.mapStars(s),icon:(typeof ICONS!=='undefined'?ICONS[id]:''),
          sub:s.status==='current'?`Деңгей ${s.level}/3 · қатарынан ${s.streak}/3`:s.status==='passed'?'Өтілді':id}; })})
      +`<p class="maphint">Станцияны басып көр.</p>`;
    html+=`<div class="card" style="margin-top:12px"><div class="qbar"><span>Қазіргі станция</span><span class="chip">${cur}</span></div><h2>${esc(stageName(cur))}</h2>
      <p>Деңгей ${st.level}/3 · <span class="dots">${[1,2,3].map(l=>`<i class="${l<st.level?'done':l===st.level?'on':''}"></i>`).join('')}</span> · қатарынан дұрыс: ${st.streak}</p>
      <div class="row"><button class="btn" onclick="startPractice('${cur}')">Жаттығу</button><button class="btn gold" onclick="startTest('${cur}')">Кезең тесті (10 есеп)</button></div>
      <p class="note" style="margin-top:10px">Келесі станцияға өту үшін тесттен 10 есептің 8-ін шығару керек. 10/10 — үш жұлдыз.</p>
      <p class="note" style="margin-top:10px"><button class="btn plain" onclick="askRediag()">Бәрі тым оңай ма? Қайта диагностика</button></p></div>`;
  }
  html+=`<div class="card"><div class="stat"><div><b>${Math.round((R.time||0)/60000)}</b><span>минут</span></div><div><b>${R.nAns||0}</b><span>есеп</span></div><div><b>${acc()}%</b><span>дұрыс</span></div></div><p class="note" style="margin:8px 0 0"><a href="../">← Барлық бағыттар</a></p></div>`;
  app().innerHTML=html; persist();
  if(Core.mapScroll) Core.mapScroll();
  if(Core.mapBind) Core.mapBind(id=>{ if(Core.tester) testerUnlock(id); startPractice(id); });
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
  else { input=`<input class="big" id="ans" inputmode="decimal" placeholder="Жауап" autocomplete="off" oninput="document.getElementById('ansBtn').disabled=!this.value.trim()" onkeydown="if(event.key==='Enter')answerInput()">`; }
  const ladder=o.ladder&&!o.noHints;
  const prog=Math.max(0,Math.min(1,o.prog||0));
  app().innerHTML=`<div class="quiz">
   <div class="qtop"><button class="qx" onclick="showHome()" aria-label="Шығу">✕</button><div class="qprog"><i style="width:${(prog*100).toFixed(0)}%"></i></div><span class="qmeta">${esc(o.meta||'')}</span></div>
   <div class="stem">${stemHTML(q.stem,false)}</div>${fig?`<div class="fig">${fig}</div>`:''}${input}
   <div id="hints"></div></div>
   <div class="actbar" id="qbar">${ladder?`<button class="btn plain" id="dkBtn" onclick="dontKnow()">Білмеймін</button><button class="btn plain" id="hintBtn" onclick="nextHint()">Кеңес 1/5</button>`:''}${o.onSkip?`<button class="btn plain" onclick="skipQ()">Білмеймін</button>`:''}<button class="btn" id="ansBtn" onclick="answerInput()" disabled>Тексеру</button></div>
   <div id="fb"></div>`;
  window._Q={q,o,done:false,sel:null,selBtn:null};
  if(!q.choices.length) setTimeout(()=>{ const i=$('ans'); if(i) i.focus(); },50);
}
function skipQ(){ if(window._Q.done) return; window._Q.done=true; window._Q.o.onSkip(); }
function answerChoice(btn){ if(window._Q.done) return;
  document.querySelectorAll('.choice').forEach(x=>x.classList.remove('pick')); btn.classList.add('pick');
  window._Q.sel=btn.dataset.v; window._Q.selBtn=btn; $('ansBtn').disabled=false; }
function answerInput(){ if(window._Q.done) return; const ai=$('ans'); const v=ai?ai.value.trim():window._Q.sel; if(!v) return; finishAnswer(v,window._Q.selBtn); }
function disableInputs(){ document.querySelectorAll('.choice').forEach(b=>b.disabled=true); const ai=$('ans'); if(ai) ai.disabled=true; const ab=$('ansBtn'); if(ab) ab.disabled=true; }
function finishAnswer(v,btn){
  const {q,o}=window._Q; const ok=isCorrect(q,v);
  if(o.mode==='practice' && !ok && !PR.retried && PR.step<5){ PR.retried=true; log({ev:'attempt',ok:false,id:q.id,stage:PR.stId});
    Core.sound('no');
    if(btn){ btn.disabled=true; btn.classList.add('no'); btn.classList.remove('pick'); }
    window._Q.sel=null; window._Q.selBtn=null; const ab0=$('ansBtn'); if(ab0) ab0.disabled=true;
    const ai0=$('ans'); if(ai0){ ai0.value=''; ai0.style.borderColor='var(--bad)'; ai0.focus(); }
    $('hints').insertAdjacentHTML('beforeend',`<div class="fb no" id="retryMsg">Қате. Тағы бір рет ойлан немесе «Кеңес» бас.</div>`); return; }
  const rm=$('retryMsg'); if(rm) rm.remove();
  window._Q.done=true; window._Q.given=v;
  document.querySelectorAll('.choice').forEach(b=>{ b.disabled=true; b.classList.remove('pick'); if(isCorrect(q,b.dataset.v)) b.classList.add('ok'); else if(b===btn) b.classList.add('no'); });
  const ai=$('ans'); if(ai){ ai.disabled=true; ai.style.borderColor=ok?'var(--good)':'var(--bad)'; }
  const qb=$('qbar'); if(qb) qb.style.display='none';
  const showExpl = o.mode==='practice';
  Core.sound(ok?'ok':'no');
  $('fb').innerHTML=`<div class="fb ${ok?'ok':'no'}">${ok?'Дұрыс! ✓':'Қате. Дұрыс жауабы: '+esc(q.ans)}${showExpl&&q.expl?`<span class="expl">${esc(q.expl)}</span>`:''}</div>`;
  o.onAnswer(ok);
  if(o.mode==='practice'){ const st=R.stages[PR.stId];
    $('fb').insertAdjacentHTML('beforeend',`<div class="row"><button class="btn ${ok?'good':''}" onclick="afterAnswerNav()">${PR.twinOf&&!ok?'Ұқсас есеп':'Жалғастыру'}</button>${st.testUnlocked?`<button class="btn gold" onclick="startTest('${PR.stId}')">Тест</button>`:''}</div>`); }
}
