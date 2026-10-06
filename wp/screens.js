/* wp/screens.js — home screen, teaching card, question view, answer handling. Owner: Nurdaulet.
   finishAnswer() is the single place a final answer is judged; it calls o.onAnswer(ok), which logs via log({ev:'answer',…}).
   Level-specific renderers (L1–L4) added 2026-10 for WP levels restructure. */
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
  { const qp=new URLSearchParams(location.search), tk=qp.get('task');
    if(tk&&STAGES.some(s=>s[0]===tk)){ history.replaceState(null,'',location.pathname+location.hash); return qp.get('test')?startTest(tk,true):startPractice(tk); } }
  clearResume();   /* the pupil chose the map: a refresh now stays on the map */
  if(Core.reviewGate&&R.diag&&Core.reviewGate(app(),topbar())) return;
  const cur=currentStage();
  let html=topbar();
  if(!R.diag){
    html+=`<div class="card"><h2>Алдымен — диагностика</h2><p>Қысқа тест. Ең оңай кезеңнен басталады: екі есебін де тапсаң — келесі кезең, қателессең — сол кезеңнен бастайсың. Есеп саны алдын ала белгісіз — көбіне 4–16. Сурет жоқ, тек мәтін. Білмесең — «Білмеймін» деп бас.</p><button class="btn wide" onclick="startDiag()">Диагностиканы бастау</button>
    <button class="btn plain wide" onclick="skipDiag()" style="margin-top:8px">Диагностикасыз бастау</button><p class="note">Диагностикасыз бастасаң — ең бірінші кезеңнен (WP‑01) бастайсың. Диагностиканы кейін де өтуге болады.</p></div>`;
  } else {
    const st=R.stages[cur]; const done=STAGES.filter(s=>R.stages[s[0]].status==='passed').length;
    const totStars=STAGES.reduce((a,s)=>a+Core.mapStars(R.stages[s[0]]),0);
    const g=wpGrade(); const maxL=gradeMax(g);
    html+=`<div class="strip"><div class="pill"><b>${done}/${STAGES.length}</b><span>станция</span></div><div class="pill"><b>★ ${totStars}</b><span>жұлдыз</span></div><div class="pill"><b>${R.nAns?acc()+'%':'–'}</b><span>дұрыс</span></div></div>`;
    html+=Core.map({color:'var(--wp)', colorDark:'var(--wp-d)', avatar:Core.avatar(), label:'Мәтінді есептер жолы', go:'Жаттығу',
      action:wpStationAction(cur,st),
      stages:STAGES.map(([id,name,,,,gr])=>{ const s=R.stages[id];
        return {id,name,status:s.status,stars:Core.mapStars(s),icon:(typeof ICONS!=='undefined'?ICONS[id]:''),
          sub:s.status==='current'?wpStageSub(id,s,maxL):s.status==='passed'?'Өтілді':(gr?`${gr}-сынып`:id)}; })})
      ;
  }
  app().innerHTML=html; persist();
  app().querySelectorAll('[data-pr]').forEach(b=>b.onclick=()=>startPractice(b.dataset.pr));
  app().querySelectorAll('[data-test]').forEach(b=>b.onclick=()=>startTest(b.dataset.test));
  app().querySelectorAll('[data-rediag]').forEach(b=>b.onclick=()=>askRediag());
  if(Core.mapScroll) Core.mapScroll();
  if(Core.mapBind) Core.mapBind(id=>{ if(Core.tester) testerUnlock(id); startPractice(id); });
}


/* ── map texts (per-family scaffold, 2026-10) ── */
function wpStageSub(id,s,maxL){
  const fams=famsOf(id); if(!fams.length) return `Деңгей ${s.level}/${maxL} · қатарынан ${s.streak}/3`;
  const fid=curFam(id,s); const done=doneFams(id,s).length;
  if(!fid) return `Барлық ${fams.length} түрі меңгерілді · тест`;
  const f=s.fam[fid]; return `${famName(id,fid)} · деңгей ${f.level}/${maxL} · түр ${done+1}/${fams.length}`;
}
/* level glyphs: Сурет (picture) · Берілгені (bar) · Шешуі (equation) · Мәтін (text) */
const LVL_NAME={1:'Сурет',2:'Берілгені',3:'Шешуі',4:'Мәтін'};
const LVL_ICON={
 1:'<svg viewBox="0 0 16 12"><rect x="1" y="1" width="14" height="10" rx="2" fill="none" stroke-width="1.6"/><circle cx="5" cy="5" r="1.6" stroke="none"/><path d="M3 10l4-3 3 2 3-3 0 4z" stroke="none"/></svg>',
 2:'<svg viewBox="0 0 16 12"><rect x="1" y="2" width="8" height="8" rx="1.5" stroke="none"/><rect x="10" y="2" width="5" height="8" rx="1.5" opacity=".5" stroke="none"/></svg>',
 3:'<svg viewBox="0 0 16 12" fill="none" stroke-width="2"><path d="M2 4h12M2 8h12"/></svg>',
 4:'<svg viewBox="0 0 16 12" fill="none" stroke-width="2" stroke-linecap="round"><path d="M2 3h12M2 6h8M2 9h10"/></svg>'};
/* the station card under the map: WP draws its own (Core.stationAction assumes 3 levels and the old gate) */
function wpStationAction(id,st){
  const g=wpGrade(); const minL=gradeMin(g), maxL=gradeMax(g); const fams=famsOf(id); const n=STAGES.findIndex(x=>x[0]===id)+1;
  const fid=fams.length?curFam(id,st):null; const f=fid?st.fam[fid]:null; const lv=f?f.level:st.level;
  const need=(FAM_NEED[lv]||5); const streak=f?f.streak:st.streak; const open=fams.length?allFamsDone(id,st):!!st.testUnlocked;
  const nL=maxL-minL+1;
  /* whole-station progress: cells = families × levels, the current cell counts by its streak */
  let cells=0, got=0;
  fams.forEach(x=>{ const s=st.fam[x.id]; cells+=nL; if(!s) return; if(s.done) got+=nL; else { got+=(s.level-minL)+Math.min(1,s.streak/(FAM_NEED[s.level]||5)); } });
  const pct=cells?Math.round(100*got/cells):0; const off=(138.2*(1-(cells?got/cells:0))).toFixed(1);
  const ring=`<div class="ring${open?' full':''}"><svg viewBox="0 0 54 54"><circle class="tr" cx="27" cy="27" r="22"/><circle class="pr" cx="27" cy="27" r="22" style="stroke-dashoffset:${open?0:off}"/></svg><span>${open?'✓':pct+'%'}</span></div>`;
  const famRows=fams.map(x=>{ const s=st.fam[x.id]||{level:minL,streak:0,done:false}; const cls=s.done?'done':x.id===fid?'on':'wait';
    let lad=''; for(let l=minL;l<=maxL;l++){ const c=s.done||l<s.level?'p':(l===s.level&&!s.done&&x.id===fid)?'c':''; const w=c==='c'?` style="--w:${Math.round(100*Math.min(1,s.streak/(FAM_NEED[l]||5)))}%"`:''; lad+=`<span class="lv ${c}"${w}>${LVL_ICON[l]}</span>`; }
    const meta=s.done?`${nL}/${nL}`:x.id===fid?`${s.streak}/${FAM_NEED[s.level]||5}`:(s.level>minL||s.streak?`${s.level-minL}/${nL}`:'—');
    return `<div class="fam-row ${cls}"><span class="fam-name">${esc(x.name)}</span><span class="lad">${lad}</span><span class="fam-meta">${meta}</span></div>`; }).join('');
  const info=open?`${fams.length} түр меңгерілді · аралас тест`:(f?`${esc(famName(id,fid))} · ${LVL_NAME[lv]} · ${streak}/${need}`:`Деңгей ${lv}/${maxL} · қатарынан ${streak}/${need}`);
  const pr=`<button type="button" class="btn${open?' ghost sm':''}" data-pr="${esc(id)}">Жаттығу</button>`;
  const nTest=fams.length?fams.length*Math.max(FAM_TEST_PER,Math.ceil(10/fams.length)):10; const needT=Math.ceil(nTest*0.8);
  const te=open?`<button type="button" class="btn gold" data-test="${esc(id)}">Кезең тесті</button>`:`<button type="button" class="btn ghost sm" disabled>Тест · ${fams.length?doneFams(id,st).length+'/'+fams.length+' түр':'жабық'}</button>`;
  const sub=open?`Аралас тест · ${nTest} есеп · ${needT}+ дұрыс → келесі станция`:(f?`Қатарынан ${need} дұрыс → келесі деңгей`:'Барлық түрді меңгер → аралас тест ашылады');
  return `<div class="mapgo mg2"><div class="mg-row">${fams.length?ring:''}<div class="mg-info"><b>${n}-станция · ${esc(stageName(id))}</b><i>${info}</i></div>${open?te:pr}</div>
    ${fams.length?`<div class="fam">${famRows}</div>`:''}
    <div class="mg-sub">${open?pr:te}<span>${sub}</span>
      <button type="button" class="mg-link" data-rediag>Тым оңай ма?</button></div></div>`;
}
/* the quiz top bar: in practice a family chip with a segmented streak bar; elsewhere the plain progress bar */
function qtopHTML(o,prog){
  const home=Core.root?`<a class="qhome" href="${Core.root}" aria-label="Басты бет" title="Басты бет">${Core.homeSVG}</a>`:'';
  if(!o.famLabel) return `<div class="qtop">${home}<button class="qx" onclick="showHome()" aria-label="Шығу">✕</button><div class="qprog"><i style="width:${(prog*100).toFixed(0)}%"></i></div><span class="qmeta">${esc(o.meta||'')}</span></div>`;
  const need=o.need||5, streak=o.review?need:Math.min(need,o.streak||0);
  let seg=''; for(let i=0;i<need;i++) seg+=`<i class="${i<streak?'f':''}"></i>`;
  return `<div class="qtop">${home}<button class="qx" onclick="showHome()" aria-label="Шығу">✕</button><div class="qchip"><b>${esc(o.famLabel)}${o.review?'<span class="rev">қайталау</span>':''}</b><div class="seg">${seg}</div></div><span class="qmeta">${esc(o.meta||'')}</span></div>`;
}

/* ── teaching card ── */
function showCard(stId,cards,i,done){
  const c=cards[i]; const fig=c.fig&&c.fp?renderFig(c.fig,c.fp):'';
  app().innerHTML=topbar()+`<div class="card teach"><div class="qbar"><span>Үйрену картасы ${i+1}/${cards.length}</span><span class="chip gold">${stId}</span></div>
  <div class="stem">${esc(c.stem)}</div>${fig?`<div class="fig">${fig}</div>`:''}<div class="fb ok" style="margin-top:0"><span class="expl">${esc(c.expl)}</span></div>
  <div style="height:12px"></div><button class="btn wide" onclick="cardNext()">${i+1<cards.length?'Келесі':'Түсіндім, бастаймын'}</button></div>`;
  window.cardNext=()=>{ if(i+1<cards.length) showCard(stId,cards,i+1,done); else done(); };
}

/* ═══════════════════════════════════════════════════════════════════
   LEVEL-SPECIFIC RENDERERS (WP levels restructure, 2026-10)
   Level 1 (Сурет): concrete objects picture + choice buttons — Grade 1 only
   Level 2 (Берілгені): text + bar model + қысқаша жазу + equation (ops pre-filled)
   Level 3 (Шешуі): text + қысқаша жазу + equation (ops as inputs) + answer
   Level 4 (Мәтін): pure text + equation (ops as inputs) + answer
   ═══════════════════════════════════════════════════════════════════ */

/* CSS for қысқаша жазу and equation rows — injected once */
(function injectLevelCSS(){
  if(document.getElementById('wp-level-css')) return;
  const s=document.createElement('style'); s.id='wp-level-css';
  s.textContent=`
/* қысқаша жазу */
.qj{margin:0 0 10px}
.qj-title{font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px}
.qj-line{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;margin-bottom:3px}
.qj-line:nth-child(even){background:var(--fig)}
.qj-label{font-size:.82rem;font-weight:700;color:var(--muted);white-space:nowrap}
.qj-dash{color:var(--muted);font-weight:700;flex-shrink:0}
.qj-val{display:flex;align-items:center;gap:5px}
.qj-val span{font-size:.9rem;font-weight:700;color:var(--ink)}
.qj-line.question{background:var(--accent-soft);border-radius:8px}
.qj-line.question .qj-label{color:var(--rc)}
.qj-q{display:inline-flex;align-items:center;justify-content:center;font-size:1.1rem;color:var(--rc);border-style:dashed;background:transparent}
.qj-val span.qj-q{font-size:1.1rem;color:var(--rc)}
/* box input */
.box-input{width:52px;height:40px;text-align:center;border:2px solid var(--line);border-radius:10px;background:var(--fig);color:var(--ink);font-family:inherit;font-weight:800;font-size:1.1rem;outline:none}
.box-input:focus{border-color:var(--rc);background:var(--card)}
.box-input.ok{border-color:var(--good);background:var(--good-soft)}
.box-input.err{border-color:var(--bad)}
/* equation row */
.eq-section{margin:0 0 10px}
.eq-title{font-size:.72rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px}
.eq-row{display:flex;align-items:center;gap:6px;justify-content:center;flex-wrap:wrap;padding:8px 0}
.eq-op{font-size:1.3rem;font-weight:900;color:var(--ink)}
.eq-par{font-size:1.5rem;font-weight:700;color:var(--muted)}
.op-slot{width:44px;height:40px;border:2px dashed var(--line);border-radius:10px;background:var(--fig);color:var(--muted);font-family:inherit;font-weight:900;font-size:1.3rem;cursor:pointer}
.op-slot.picking{border-color:var(--rc);border-style:solid;background:var(--card)}
.op-slot[data-v]:not([data-v=""]){border-style:solid;border-color:var(--line);color:var(--ink);background:var(--card)}
.op-slot.ok{border-color:var(--good);background:var(--good-soft);color:var(--ink)}
.op-slot.err{border-color:var(--bad);color:var(--bad)}
.op-slot:focus{outline:none;border-color:var(--rc)}
.op-pad{display:flex;gap:8px;justify-content:center;padding:6px 0 10px}
.op-key{width:56px;height:48px;border:2px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);font-family:inherit;font-weight:900;font-size:1.4rem;cursor:pointer;box-shadow:0 3px 0 var(--line)}
.op-key:active{transform:translateY(2px);box-shadow:none}
.eq-num{min-width:36px;padding:0 6px;height:40px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:1.15rem;color:var(--ink);font-variant-numeric:tabular-nums}
.free-lines{display:flex;flex-direction:column;gap:8px;margin:4px 0 8px}
.box-line{width:100%;height:46px;padding:0 12px;border:2px solid var(--line);border-radius:12px;background:var(--fig);color:var(--ink);font-family:inherit;font-weight:800;font-size:1.15rem;letter-spacing:.03em;outline:none;box-sizing:border-box}
.box-line:focus{border-color:var(--rc);background:var(--card)}
.box-line.ok{border-color:var(--good);background:var(--good-soft)}
.box-line.err{border-color:var(--bad)}
.op-pad-static{flex-wrap:wrap;padding:0 0 6px}
.op-pad-static .op-key{width:44px;height:42px;font-size:1.2rem}
.op-pad-static .op-key-add{width:auto;padding:0 12px;font-size:.9rem;font-weight:900;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;padding:4px 0 8px}
.chip{min-width:44px;height:36px;padding:0 10px;border:2px solid var(--line);border-radius:999px;background:var(--card);color:var(--ink);font-family:inherit;font-weight:900;font-size:1rem;cursor:pointer}
.chip:active{background:var(--accent-soft);border-color:var(--rc)}
.eq-row.build .num-slot{width:56px}
.eq-row.row-ok .eq-op{color:var(--good)}
/* answer line */
.ans-section{margin:0 0 10px}
.ans-row{display:flex;align-items:center;gap:8px}
.ans-label{font-size:.82rem;font-weight:800;color:var(--rc)}
/* choice circles for L1 */
.l1-choices{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin:14px 0}
.l1-choice{width:54px;height:54px;border-radius:50%;border:3px solid var(--line);background:var(--card);color:var(--ink);font-family:inherit;font-weight:900;font-size:1.3rem;cursor:pointer;display:flex;align-items:center;justify-content:center}
.l1-choice:active{transform:translateY(3px)}
.l1-choice.ok{border-color:var(--good);background:var(--good);color:#fff}
.l1-choice.no{border-color:var(--bad);background:var(--bad);color:#fff}
/* step label */
.step-label{font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);text-align:center;margin-bottom:2px}
/* bar model scene */
.bar-scene{background:var(--fig);border-radius:16px;padding:14px;margin:0 0 14px;overflow-x:auto}
.bar-scene svg{display:block;max-width:100%;height:auto;margin:0 auto}
/* ── progress (per-family scaffold, 2026-10) ── */
.mapgo .ring{flex:none;width:54px;height:54px;position:relative}
.mapgo .ring svg{width:54px;height:54px;transform:rotate(-90deg)}
.mapgo .ring circle{fill:none;stroke-width:6;stroke-linecap:round}
.mapgo .ring .tr{stroke:var(--fig)}
.mapgo .ring .pr{stroke:var(--rc);stroke-dasharray:138.2;transition:stroke-dashoffset .4s}
.mapgo .ring.full .pr{stroke:var(--good)}
.mapgo .ring span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:.82rem;font-variant-numeric:tabular-nums;color:var(--ink)}
.mapgo .fam{display:flex;flex-direction:column;gap:7px}
.mapgo .fam-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:7px 10px;border-radius:12px;background:var(--fig)}
.mapgo .fam-row.on{background:var(--accent-soft);outline:2px solid var(--rc)}
.mapgo .fam-row.done{background:var(--good-soft)}
.mapgo .fam-row.wait{opacity:.55}
.mapgo .fam-name{font-size:.86rem;font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)}
.mapgo .fam-row.done .fam-name::after{content:' ✓';color:var(--good)}
.mapgo .lad{display:flex;gap:4px}
.mapgo .lv{width:28px;height:22px;border-radius:7px;background:var(--card);border:1.5px solid var(--line);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center}
.mapgo .lv svg{width:16px;height:12px;position:relative;z-index:1;stroke:var(--muted);fill:var(--muted)}
.mapgo .lv.p{background:var(--rc);border-color:var(--rc)} .mapgo .lv.p svg{stroke:#fff;fill:#fff}
.mapgo .fam-row.done .lv.p{background:var(--good);border-color:var(--good)}
.mapgo .lv.c{border-color:var(--rc);border-width:2px}
.mapgo .lv.c::before{content:'';position:absolute;left:0;top:0;bottom:0;width:var(--w,0%);background:var(--rc);opacity:.35}
.mapgo .lv.c svg{stroke:var(--rc);fill:var(--rc)}
.mapgo .fam-meta{font-size:.74rem;font-weight:900;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;min-width:34px;text-align:right}
.mapgo .fam-row.on .fam-meta{color:var(--rc)}
.qchip{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
.qchip b{font-size:.78rem;font-weight:900;color:var(--rc);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qchip .seg{display:flex;gap:3px}
.qchip .seg i{flex:1;height:7px;border-radius:4px;background:var(--fig)}
.qchip .seg i.f{background:var(--rc)}
.qchip .rev{display:inline-block;font-size:.66rem;font-weight:900;letter-spacing:.05em;text-transform:uppercase;background:var(--gold-soft);color:var(--gold);padding:1px 7px;border-radius:999px;margin-left:6px;vertical-align:middle}
`;
  document.head.appendChild(s);
})();

/* ── bar model (DM-style, for Level 2) ──
   Shape by the problem's structure, not by the operator alone (owner, 2026-10-05 — «12 − 5» was drawn as two parts + total):
   join (+, whole unknown)         : [ a ][ b ]  with a brace «?» under the whole
   whole − part (−, a part unknown): one bar = the whole, the known part shaded, «?» on the rest (S1, S9, A7, S7, A5…)
   compare (family CMP / «артық, кем, айырма…»): two bars; «?» on the difference, on the longer bar or on the shorter bar */
function drawBarModelWP(q){
  if(!q.given||q.given.length<2) return '';
  /* only for rows with an authored equation (WP-01, grade-1 templates): the knowns of the other stages hold relations
     («3 есе кем», «5 артық»), not parts of a whole — those stages draw their own hfig instead */
  if(!(q.eq&&q.eq.length)) return '';
  if(q.steps&&q.steps.length>1) return drawBarMulti(q);
  const eq=(q.eq||[]).map(p=>typeof p==='string'?(OP_NORM[p]||p):p); const op=eq.find(p=>typeof p==='string'&&p!=='=');
  if(op!=='+'&&op!=='−') return '';
  const g=q.given; const vals=g.map(l=>+String(l.val).replace(',','.')); if(vals.some(isNaN)) return '';
  const ans=+String(q.ans).replace(',','.'); const ql=(q.qline&&q.qline.label)||'';
  const cmpWord=/артық|кем|айырма|ұзын|қысқа|үлкен|кіші|қымбат|арзан|есе/i;
  const isCmp=q.fam==='CMP'||cmpWord.test(ql)||g.some(l=>cmpWord.test(l.label||''));
  const W=320, bh=28, px=12, font='font-family="Nunito,system-ui,sans-serif" font-weight="800"';
  const rect=(x,y,w,fill,stroke)=>`<rect x="${x}" y="${y}" width="${Math.max(w,2)}" height="${bh}" rx="4" fill="${fill}" opacity="0.4"/><rect x="${x}" y="${y}" width="${Math.max(w,2)}" height="${bh}" rx="4" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
  const txt=(x,y,t,fill,size)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${size||14}" ${font} fill="${fill}">${esc(String(t))}</text>`;
  const brace=(x1,x2,y,label)=>`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="var(--accent)" stroke-width="2"/><line x1="${x1}" y1="${y-4}" x2="${x1}" y2="${y+4}" stroke="var(--accent)" stroke-width="2"/><line x1="${x2}" y1="${y-4}" x2="${x2}" y2="${y+4}" stroke="var(--accent)" stroke-width="2"/>`+txt((x1+x2)/2,y+16,label,'var(--accent)',13);
  let inner='', H=100;
  if(isCmp){
    const a=vals[0], b=vals[1];
    /* three cases: the difference is asked (bars a and b); the longer bar is asked (a, then a + b); the shorter is asked (a, then a − b) */
    const kind=/айырма/i.test(ql)||(!cmpWord.test(g[1].label||'')&&!cmpWord.test(g[0].label||''))?'diff':op==='+'?'long':'short';
    const lab1=(g[0].label||'').slice(0,10), lab2=(kind==='diff'?(g[1].label||''):ql).slice(0,10);
    const lx=px, bx=px+64; const maxV=kind==='long'?a+b:a; const unit=(W-bx-px-24)/Math.max(maxV,1);
    const y1=14, y2=y1+bh+10;
    inner+=`<text x="${lx}" y="${y1+bh/2+5}" font-size="12" ${font} fill="var(--muted)">${esc(lab1)}</text>`+rect(bx,y1,a*unit,'var(--seg2)','var(--seg2)')+txt(bx+a*unit/2,y1+bh/2+5,a,'var(--ink)');
    inner+=`<text x="${lx}" y="${y2+bh/2+5}" font-size="12" ${font} fill="var(--muted)">${esc(lab2)}</text>`;
    if(kind==='diff'){ inner+=rect(bx,y2,b*unit,'var(--good)','var(--good)')+txt(bx+b*unit/2,y2+bh/2+5,b,'var(--ink)'); inner+=brace(bx+Math.min(a,b)*unit,bx+Math.max(a,b)*unit,y2+bh+8,'?'); }
    else if(kind==='long'){ inner+=rect(bx,y2,a*unit,'var(--good)','var(--good)')+rect(bx+a*unit,y2,b*unit,'var(--gold)','var(--gold)')+txt(bx+a*unit+b*unit/2,y2+bh/2+5,b,'var(--ink)'); inner+=brace(bx,bx+(a+b)*unit,y2+bh+8,'?'); }
    else { inner+=rect(bx,y2,ans*unit,'var(--good)','var(--good)')+txt(bx+ans*unit/2,y2+bh/2+5,'?','var(--accent)'); inner+=brace(bx+ans*unit,bx+a*unit,y2+bh+8,b); }
    H=y2+bh+30;
  } else if(op==='+'){
    const a=vals[0], b=vals[1]; const unit=(W-2*px)/(a+b); const y1=16;
    inner+=rect(px,y1,a*unit,'var(--seg2)','var(--seg2)')+txt(px+a*unit/2,y1+bh/2+5,a,'var(--ink)');
    inner+=rect(px+a*unit,y1,b*unit,'var(--good)','var(--good)')+txt(px+a*unit+b*unit/2,y1+bh/2+5,b,'var(--ink)');
    inner+=brace(px,px+(a+b)*unit,y1+bh+8,'?'); H=y1+bh+30;
  } else {
    const whole=Math.max(vals[0],vals[1]), part=Math.min(vals[0],vals[1]), rest=whole-part; const unit=(W-2*px)/whole; const y1=22;
    inner+=txt(px+whole*unit/2,y1-8,whole,'var(--ink)',12);
    inner+=rect(px,y1,rest*unit,'var(--seg2)','var(--seg2)')+txt(px+rest*unit/2,y1+bh/2+5,'?','var(--accent)');
    inner+=`<rect x="${px+rest*unit}" y="${y1}" width="${Math.max(part*unit,2)}" height="${bh}" rx="4" fill="var(--bad)" opacity="0.15"/><rect x="${px+rest*unit}" y="${y1}" width="${Math.max(part*unit,2)}" height="${bh}" rx="4" fill="none" stroke="var(--bad)" stroke-width="1.5"/>`+txt(px+rest*unit+part*unit/2,y1+bh/2+5,part,'var(--bad)');
    inner+=`<line x1="${px}" y1="${y1-14}" x2="${px+whole*unit}" y2="${y1-14}" stroke="var(--ink)" stroke-width="1" opacity="0.35"/>`; H=y1+bh+16;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}
/* several steps: the known values as segments, «?» under the whole (kept from the first version) */
function drawBarMulti(q){
  const vals=q.given.map(l=>+l.val).filter(n=>!isNaN(n)); const ans=+q.ans; if(vals.length<2||isNaN(ans)) return '';
  const W=320, bh=28, px=12, font='font-family="Nunito,system-ui,sans-serif" font-weight="800"';
  const total=vals.reduce((s,v)=>s+v,0)+ans; const unit=(W-2*px-40)/total; const y1=20; let x=px, svg=`<svg viewBox="0 0 ${W} 100" width="${W}" xmlns="http://www.w3.org/2000/svg">`;
  vals.forEach((v,i)=>{ const w=v*unit; const fills=['var(--seg2)','var(--good)','var(--gold)'];
    svg+=`<rect x="${x}" y="${y1}" width="${w}" height="${bh}" rx="4" fill="${fills[i%3]}" opacity="0.3"/><rect x="${x}" y="${y1}" width="${w}" height="${bh}" rx="4" fill="none" stroke="${fills[i%3]}" stroke-width="1.5"/><text x="${x+w/2}" y="${y1+bh/2+5}" text-anchor="middle" font-size="13" ${font} fill="var(--ink)">${v}</text>`; x+=w; });
  const by=y1+bh+8;
  svg+=`<line x1="${px}" y1="${by}" x2="${x}" y2="${by}" stroke="var(--accent)" stroke-width="2"/><line x1="${px}" y1="${by-4}" x2="${px}" y2="${by+4}" stroke="var(--accent)" stroke-width="2"/><line x1="${x}" y1="${by-4}" x2="${x}" y2="${by+4}" stroke="var(--accent)" stroke-width="2"/><text x="${(px+x)/2}" y="${by+16}" text-anchor="middle" font-size="13" ${font} fill="var(--accent)">?</text></svg>`;
  return svg;
}

/* ── build equation row ── */
/* parts: [{v:'3'},'+',{v:'4'},'=',{v:'7'}] or string from h2 like "3 + 4 = ?"
   fillOps: true → operators become input boxes (L3/L4)
   prefix: unique id prefix for inputs */
/* Textbook notation in the bank: `·` and `:` (also × ÷ * / x), compact `5·5`, parentheses, several operators in one step.
   tokenizeExpr("(40 + 50) · 2") → [{p:'('},{v:'40'},'+',{v:'50'},{p:')'},'×',{v:'2'}] */
const OP_NORM={'+':'+','−':'−','-':'−','–':'−','×':'×','·':'×','*':'×','x':'×','х':'×','X':'×','÷':'÷',':':'÷','/':'÷'};
function tokenizeExpr(str){
  const out=[]; const re=/\d+(?:[.,]\d+)?%?|[()]|[+\-−–×·*xхX÷:\/=?]/g; let m;
  while((m=re.exec(String(str)))){ const t=m[0];
    if(t==='('||t===')') out.push({p:t});
    else if(t==='='||t==='?') out.push(t);
    else if(OP_NORM[t]) out.push(OP_NORM[t]);
    else out.push({v:t}); }
  return out;
}
function parseEq(q){
  /* Build eq array from q.eq (structured) or q.h2 (string) */
  if(q.eq&&q.eq.length) return q.eq.map(p=>typeof p==='string'?(OP_NORM[p]||p):p);
  if(!q.h2) return [];
  return tokenizeExpr(q.h2).map(p=>p==='?'?{v:String(q.ans)}:p);
}
function stepEq(s){ return (s.eq&&s.eq.length)?s.eq:(s.toks||tokenizeExpr(s.expr)).concat(['=',{v:String(s.val)}]); }
/* Some bank steps repeat earlier steps inside the expression — «120 : (5 + 1) · 5» after «5 + 1 = 6» and «120 : 6 = 20».
   For the boxes a child fills, an earlier step's result stands in for its expression: a parenthesised group equal to an
   earlier step, or a leading run equal to one when the next operator is + or −, becomes that step's value;
   a step that becomes identical to an earlier one is dropped. */
function simplifySteps(steps){
  const key=t=>t.map(p=>typeof p==='string'?p:(p.p?p.p:'#'+p.v)).join(' ');
  const done=[]; const out=[];
  steps.forEach(s=>{
    let toks=(s.eq&&s.eq.length)?null:tokenizeExpr(s.expr);
    if(toks){
      const orig=toks.slice();
      let changed=true, guard=0;
      while(changed&&guard++<12){ changed=false;
        for(const d of done){ for(const dt of [d.orig,d.toks]){ const k=key(dt); const n=dt.length; if(n>=toks.length) continue;
          for(let i=0;i+n<=toks.length;i++){
            if(key(toks.slice(i,i+n))!==k) continue;
            const before=toks[i-1], after=toks[i+n];
            const isAdd=x=>x==='+'||x==='−';
            const inParens=before&&before.p==='('&&after&&after.p===')';
            const mulOnly=!dt.some(isAdd);
            const openL=before===undefined||(before&&before.p==='(');
            const edgeR=after===undefined||isAdd(after)||(after&&after.p===')');
            /* a run of × ÷ is a unit unless it follows a ÷ (a ÷ b·c ≠ a ÷ (b·c)); a run with + − is one only at the start */
            const safe=inParens||(mulOnly&&before!=='÷')||(!mulOnly&&openL&&edgeR);
            if(!safe) continue;
            if(inParens) toks.splice(i-1,n+2,{v:d.val}); else toks.splice(i,n,{v:d.val});
            changed=true; break;
          }
          if(changed) break; }
          if(changed) break; }
      }
      if(done.some(d=>key(d.toks)===key(toks)||key(d.orig)===key(toks))) return;   /* a pure repeat of an earlier step */
      done.push({toks:toks.slice(),orig,val:String(s.val)});
    }
    out.push(Object.assign({},s,toks?{toks}:{}));
  });
  return out;
}
/* L2/L3 rows (owner, 2026-10-05): the operands are printed — the child has already met them in the stem and the
   қысқаша жазу — and only the result after «=» is a box, so the row tests the calculation (L2) or the choice of
   operation (L3), not copying. */
function buildEqRowHTML(parts,prefix,fillOps,prevResults){
  let html='<div class="eq-row">';
  let bIdx=0, oIdx=0; const eqAt=parts.indexOf('='); let seenEq=false; const prev=prevResults||new Set();
  parts.forEach(p=>{
    if(p==='=') seenEq=true;
    if(typeof p==='string'){
      if(fillOps&&p!=='='){
        html+=`<button type="button" class="op-slot" id="${prefix}_op${oIdx}" data-ans="${esc(p)}" data-v="" onclick="pickOp(this)" aria-label="Амал таңда">?</button>`;
        oIdx++;
      } else {
        html+=`<span class="eq-op">${esc(p)}</span>`;
      }
    } else if(p.p){
      html+=`<span class="eq-op eq-par">${esc(p.p)}</span>`;
    } else if(eqAt>0&&!seenEq&&!prev.has(String(p.v))){   /* an operand that is an earlier step's result stays a box — printing it would give that step away */
      html+=`<span class="eq-num">${esc(p.v)}</span>`;
    } else {
      html+=`<input class="box-input" autocomplete="off" type="text" inputmode="decimal" id="${prefix}_${bIdx}" data-ans="${esc(p.v)}">`;
      bIdx++;
    }
  });
  html+='</div>';
  return html;
}
/* L3 (owner, 2026-10-05): the child WRITES each step. We give the shape of the row (number · operation · number = result,
   parentheses where the step has them) and the tools: a strip of the numbers known from the stem, and the operator keys.
   Nothing is pre-filled. A row counts when it is arithmetically true and its result is the step's result. */
function buildRowHTML(parts,prefix){
  let html=`<div class="eq-row build" data-row="${prefix}">`; let n=0, o=0; let seenEq=false;
  parts.forEach(p=>{
    if(p==='='){ seenEq=true; html+='<span class="eq-op">=</span>'; }
    else if(typeof p==='string') html+=`<button type="button" class="op-slot" id="${prefix}_op${o++}" data-v="" onclick="pickOp(this)" aria-label="Амал таңда">?</button>`;
    else if(p.p) html+=`<span class="eq-op eq-par">${esc(p.p)}</span>`;
    else if(!seenEq) html+=`<input class="box-input num-slot" autocomplete="off" type="text" inputmode="decimal" id="${prefix}_n${n++}">`;
    else html+=`<input class="box-input" autocomplete="off" type="text" inputmode="decimal" id="${prefix}_r" data-ans="${esc(p.v)}">`;
  });
  return html+'</div>';
}
function stemNumbers(q){ const seen=new Set(); const out=[]; (String(q.stem).match(/\d+(?:[.,]\d+)?%?/g)||[]).forEach(x=>{ if(!seen.has(x)){ seen.add(x); out.push(x); } }); return out; }
function chipsHTML(q){ const nums=stemNumbers(q); if(!nums.length) return ''; return `<div class="chips">${nums.map(x=>`<button type="button" class="chip" tabindex="-1" onmousedown="event.preventDefault()" onclick="useChip('${esc(x)}')">${esc(x)}</button>`).join('')}</div>`; }
function useChip(v){ const el=document.activeElement; const slots=[...document.querySelectorAll('.num-slot')];
  const t=(el&&el.classList&&el.classList.contains('num-slot'))?el:slots.find(x=>!x.value); if(!t) return; t.value=v; t.classList.remove('err'); t.style.borderColor=''; focusFirstEmpty(); }
/* read a build row back into tokens; null when a slot is still empty */
function rowTokens(row){ const toks=[]; let empty=false;
  row.childNodes.forEach(el=>{ if(el.nodeType!==1) return;
    if(el.classList.contains('op-slot')){ const v=el.dataset.v; if(!v) empty=true; toks.push(v||'?'); }
    else if(el.classList.contains('eq-par')) toks.push({p:el.textContent});
    else if(el.classList.contains('eq-op')) toks.push('=');
    else if(el.tagName==='INPUT'){ const v=(el.value||'').trim(); if(!v) empty=true; toks.push({v}); } });
  return empty?null:toks; }
/* evaluate a token list (numbers, + − × ÷, parentheses) — tokens come from tokenizeExpr, so the string is safe */
function evalToks(t){
  if(!t.length) return NaN;
  const js=t.map(p=>typeof p==='string'?({'+':'+','−':'-','×':'*','÷':'/'})[p]||'':(p.p||('('+String(p.v).replace(',','.').replace(/%$/,'/100')+')'))).join(' ');
  try{ const v=Function('"use strict";return ('+js+')')(); return typeof v==='number'&&isFinite(v)?v:NaN; }catch(e){ return NaN; }
}
/* L4: a line the child wrote — «120:6·5=100», «120 : 6 = 20» or just «20 · 5». True when every «=» holds. */
function checkFreeLine(str){
  const t=tokenizeExpr(str); if(!t.length) return null;
  const parts=[]; let cur=[]; t.forEach(p=>{ if(p==='='){ parts.push(cur); cur=[]; } else if(p!=='?') cur.push(p); }); parts.push(cur);
  if(parts.some(x=>!x.length)) return false;
  const vals=parts.map(evalToks); if(vals.some(v=>isNaN(v))) return false;
  return vals.every(v=>Math.abs(v-vals[0])<1e-6);
}
function addFreeLine(){ const box=document.getElementById('l4lines'); if(!box) return; const n=box.querySelectorAll('.box-line').length; if(n>=5) return;
  box.insertAdjacentHTML('beforeend',`<input class="box-line" autocomplete="off" type="text" id="l4line${n}" placeholder="…">`); box.lastElementChild.focus(); }
function insertSym(sym){ const el=document.activeElement; const lines=[...document.querySelectorAll('.box-line')]; const t=(el&&el.classList&&el.classList.contains('box-line'))?el:lines.find(l=>!l.value)||lines[lines.length-1]; if(!t) return;
  const a=t.selectionStart||t.value.length, b=t.selectionEnd||a; t.value=t.value.slice(0,a)+sym+t.value.slice(b); t.focus(); t.setSelectionRange(a+sym.length,a+sym.length); }
/* the operator picker: a slot is tapped → four keys appear under that row; a key fills the slot and moves on */
function pickOp(btn){
  if(window._Q&&window._Q.done) return;
  document.querySelectorAll('.op-pad').forEach(x=>x.remove());
  const pad=document.createElement('div'); pad.className='op-pad';
  ['+','−','×','÷'].forEach(op=>{ const k=document.createElement('button'); k.type='button'; k.className='op-key'; k.textContent=op;
    k.onclick=()=>{ setOp(btn,op); pad.remove(); focusFirstEmpty(); }; pad.appendChild(k); });
  btn.closest('.eq-row').after(pad);
  btn.classList.add('picking');
}
function setOp(btn,op){ btn.dataset.v=op; btn.textContent=op; btn.classList.remove('picking','err'); btn.style.borderColor=''; }
document.addEventListener('keydown',e=>{ const t=document.activeElement; if(!t||!t.classList||!t.classList.contains('op-slot')) return;
  const op=OP_NORM[e.key]; if(op){ e.preventDefault(); setOp(t,op); document.querySelectorAll('.op-pad').forEach(x=>x.remove()); focusFirstEmpty(); } });
/* value of any answer slot: an input's text or an op-slot's chosen symbol */
function slotVal(el){ return el.classList.contains('op-slot')?(el.dataset.v||''):(el.value||'').trim(); }
function slotOk(el){ const exp=el.getAttribute('data-ans'); const v=slotVal(el); if(!v) return false; return el.classList.contains('op-slot')?(OP_NORM[v]||v)===(OP_NORM[exp]||exp):isCorrect({ans:exp},v); }
function slotClear(el){ if(el.classList.contains('op-slot')){ el.dataset.v=''; el.textContent='?'; } else el.value=''; }
function slotFill(el,v){ if(el.classList.contains('op-slot')) setOp(el,v); else el.value=v; }

/* ── build қысқаша жазу HTML ── */
function buildQJHTML(q,prefix){
  if(!q.given||!q.given.length) return '';
  let html='<div class="qj"><div class="qj-title">Қысқаша жазу</div>';
  q.given.forEach((ln,i)=>{
    html+=`<div class="qj-line"><span class="qj-label">${esc(ln.label)}</span><span class="qj-dash">—</span><div class="qj-val">`;
    html+=`<input class="box-input" autocomplete="off" type="text" inputmode="decimal" id="${prefix}v${i}" data-ans="${esc(ln.val)}">`;
    if(ln.unit) html+=`<span>${esc(ln.unit)}</span>`;
    html+=`</div></div>`;
  });
  if(q.qline){
    html+=`<div class="qj-line question"><span class="qj-label">${esc(q.qline.label)}</span><span class="qj-dash">—</span><div class="qj-val">`;
    /* the question line only shows «?» — nothing is typed here (owner, 2026-10-06); the answer goes in its own box */
    html+=`<span class="box-input qj-q" aria-hidden="true">?</span>`;
    if(q.qline.unit) html+=`<span>${esc(q.qline.unit)}</span>`;
    html+=`</div></div>`;
  }
  html+='</div>';
  return html;
}

/* ── L1 scene: concrete objects (reuses existing figs.js objects renderer or draws inline) ── */
function drawL1Scene(q){
  if(q.fig&&q.fp) return renderFig(q.fig,q.fp);
  return '';
}

/* ── question view ── */
function renderQuestion(q,o){
  const g=wpGrade();
  const scaff=o.scaffoldLevel||(R&&R.stages[o.sub]?R.stages[o.sub].level:gradeMax(g));
  /* For diagnostic and test modes, or when no level data: use legacy render */
  if(o.mode==='diag'||o.mode==='test'||o.noHints){ return renderLegacy(q,o); }
  /* a fixed item without an equation has no boxes to fill at L2–L4 → legacy render */
  if(!(q.eq&&q.eq.length)&&!q.h2&&!(q.given&&q.given.length)) return renderLegacy(q,o);
  /* Level-specific rendering */
  if(scaff===1) return renderL1(q,o);
  if(scaff===2) return renderL2(q,o);
  if(scaff===3) return renderL3(q,o);
  return renderL4(q,o);
}

/* ── Level 1: picture + choice buttons ── */
function renderL1(q,o){
  const fig=drawL1Scene(q);
  /* Generate choices from the question's choices or create them */
  let choices=q.choices&&q.choices.length?q.choices:null;
  if(!choices){
    const ans=+q.ans; const ds=new Set([ans]);
    while(ds.size<4){ const v=ans+Math.floor(Math.random()*5+1)*(Math.random()<.5?1:-1); if(v>0) ds.add(v); }
    choices=[...ds].sort(()=>Math.random()-.5).map(String);
  }
  const prog=Math.max(0,Math.min(1,o.prog||0));
  app().innerHTML=`<div class="quiz">
   ${qtopHTML(o,prog)}
   <div class="stem">${stemHTML(q.stem,false)}</div>
   ${fig?`<div class="fig">${fig}</div>`:''}
   <div class="l1-choices" id="l1choices"></div>
   </div>
   <div class="actbar" id="qbar"><button class="btn plain" id="dkBtn" onclick="dontKnow()">Білмеймін</button><button class="btn plain" id="hintBtn" onclick="nextHint()">Кеңес 1/5</button></div>
   <div id="hints"></div><div id="fb"></div>`;
  const box=document.getElementById('l1choices');
  choices.forEach(c=>{
    const btn=document.createElement('button');
    btn.className='l1-choice'; btn.textContent=c; btn.dataset.v=c;
    btn.onclick=()=>{
      if(window._Q.done) return;
      if(isCorrect(q,c)){ btn.classList.add('ok'); window._Q.done=true; window._Q.given=c;
        Core.sound('ok'); o.onAnswer(true);
        document.querySelectorAll('.l1-choice').forEach(b=>{ b.disabled=true; if(!isCorrect(q,b.dataset.v)) b.style.opacity='0.3'; });
        const qb=document.getElementById('qbar'); if(qb) qb.style.display='none';
        document.getElementById('fb').innerHTML=`<div class="fb ok">Дұрыс! ✓</div>`;
        document.getElementById('fb').insertAdjacentHTML('beforeend',`<div class="row"><button class="btn good" onclick="afterAnswerNav()">Жалғастыру</button></div>`);
      } else {
        btn.classList.add('no'); Core.sound('no');
        setTimeout(()=>btn.classList.remove('no'),600);
      }
    };
    box.appendChild(btn);
  });
  window._Q={q,o,done:false,sel:null,selBtn:null};
}

/* ── Level 2: text + bar model + қысқаша жазу + equation (ops pre-filled) ── */
function renderL2(q,o){
  const barSvg=drawBarModelWP(q)||(q.fig&&q.fp?renderFig(q.fig,q.fp):'')||(q.hfig&&q.hfp?renderFig(q.hfig,q.hfp):'');
  const qjHTML=buildQJHTML(q,'l2_');
  const eqParts=parseEq(q);
  let eqHTML='';
  if(eqParts.length){
    eqHTML='<div class="eq-section"><div class="eq-title">Шешуі</div>';
    if(q.steps&&q.steps.length){
      const prev=new Set(); simplifySteps(q.steps).forEach((s,i)=>{
        eqHTML+=(s.label?`<div class="step-label">${esc(s.label)}</div>`:'')+buildEqRowHTML(stepEq(s),'l2s'+i,false,prev); prev.add(String(s.val));
      });
    } else {
      eqHTML+=buildEqRowHTML(eqParts,'l2eq',false);
    }
    eqHTML+='</div>';
  }
  const prog=Math.max(0,Math.min(1,o.prog||0));
  app().innerHTML=`<div class="quiz">
   ${qtopHTML(o,prog)}
   <div class="stem">${stemHTML(q.stem,false)}</div>
   ${barSvg?`<div class="bar-scene">${barSvg}</div>`:''}
   ${qjHTML}${eqHTML}
   <div id="hints"></div></div>
   <div class="actbar" id="qbar"><button class="btn plain" id="dkBtn" onclick="dontKnow()">Білмеймін</button><button class="btn plain" id="hintBtn" onclick="nextHint()">Кеңес 1/5</button><button class="btn" id="ansBtn" onclick="checkLevelInputs()">Тексеру</button></div>
   <div id="fb"></div>`;
  window._Q={q,o,done:false,sel:null,selBtn:null};
  focusFirstEmpty();
}

/* ── Level 3: text + қысқаша жазу + equation (ops as inputs) + answer ── */
function renderL3(q,o){
  const qjHTML=buildQJHTML(q,'l3_');
  const eqParts=parseEq(q);
  let eqHTML='';
  if(eqParts.length){
    eqHTML='<div class="eq-section"><div class="eq-title">Шешуі</div>';
    if(q.steps&&q.steps.length){
      simplifySteps(q.steps).forEach((s,i)=>{ eqHTML+=(s.label?`<div class="step-label">${esc(s.label)}</div>`:'')+buildRowHTML(stepEq(s),'l3s'+i); });
    } else {
      eqHTML+=buildRowHTML(eqParts,'l3eq');
    }
    eqHTML+=chipsHTML(q)+'</div>';
  }
  const ansHTML=`<div class="ans-section"><div class="ans-row"><span class="ans-label">Жауабы:</span><input class="box-input" autocomplete="off" type="text" inputmode="decimal" id="l3ans" data-ans="${esc(String(q.ans))}"><span style="font-size:.9rem;font-weight:700">${esc(q.unit||'')}</span></div></div>`;
  const prog=Math.max(0,Math.min(1,o.prog||0));
  app().innerHTML=`<div class="quiz">
   ${qtopHTML(o,prog)}
   <div class="stem">${stemHTML(q.stem,false)}</div>
   ${qjHTML}${eqHTML}${ansHTML}
   <div id="hints"></div></div>
   <div class="actbar" id="qbar"><button class="btn plain" id="dkBtn" onclick="dontKnow()">Білмеймін</button><button class="btn plain" id="hintBtn" onclick="nextHint()">Кеңес 1/5</button><button class="btn" id="ansBtn" onclick="checkLevelInputs()">Тексеру</button></div>
   <div id="fb"></div>`;
  window._Q={q,o,done:false,sel:null,selBtn:null};
  focusFirstEmpty();
}

/* ── Level 4: pure text + equation (ops as inputs) + answer ── */
/* L4 (owner, 2026-10-05): no boxes — the child writes the working in their own lines, any correct way, then the answer.
   Each line must be arithmetically true; the answer must match. The bank's own steps are not the measure here. */
function renderL4(q,o){
  const eqHTML=`<div class="eq-section"><div class="eq-title">Шешуі</div>
    <div class="free-lines" id="l4lines"><input class="box-line" autocomplete="off" type="text" id="l4line0"></div>
    <div class="op-pad op-pad-static">${['+','−','×','÷','=','(',')'].map(k=>`<button type="button" class="op-key" tabindex="-1" onmousedown="event.preventDefault()" onclick="insertSym('${k}')">${k}</button>`).join('')}<button type="button" class="op-key op-key-add" tabindex="-1" onmousedown="event.preventDefault()" onclick="addFreeLine()" aria-label="Тағы бір жол">+ жол</button></div>
  </div>`;
  const ansHTML=`<div class="ans-section"><div class="ans-row"><span class="ans-label">Жауабы:</span><input class="box-input" autocomplete="off" type="text" inputmode="decimal" id="l4ans" data-ans="${esc(String(q.ans))}"><span style="font-size:.9rem;font-weight:700">${esc(q.unit||'')}</span></div></div>`;
  const prog=Math.max(0,Math.min(1,o.prog||0));
  app().innerHTML=`<div class="quiz">
   ${qtopHTML(o,prog)}
   <div class="stem">${stemHTML(q.stem,false)}</div>
   ${eqHTML}${ansHTML}
   <div id="hints"></div></div>
   <div class="actbar" id="qbar"><button class="btn plain" id="dkBtn" onclick="giveUp()">Білмеймін</button><button class="btn" id="ansBtn" onclick="checkLevelInputs()">Тексеру</button></div>
   <div id="fb"></div>`;
  window._Q={q,o,done:false,sel:null,selBtn:null};
  focusFirstEmpty();
}

/* ── multi-input checker for L2/L3/L4 ── */
function checkLevelInputs(){
  if(window._Q.done) return;
  const boxes=document.querySelectorAll('[data-ans]');
  let allOk=true, anyEmpty=false;
  boxes.forEach(inp=>{
    if(!slotVal(inp)){ anyEmpty=true; return; }
    if(slotOk(inp)){ inp.classList.add('ok'); inp.classList.remove('err'); }
    else { inp.classList.add('err'); inp.classList.remove('ok'); allOk=false; }
  });
  /* L3: every built row must be complete and true, and its result must be the step's */
  let rowsOk=true;
  document.querySelectorAll('.eq-row.build').forEach(row=>{
    const toks=rowTokens(row); if(!toks){ anyEmpty=true; row.querySelectorAll('.num-slot, .op-slot').forEach(x=>{ if(!slotVal(x)) x.style.borderColor='var(--gold)'; }); return; }
    const i=toks.indexOf('='); const left=evalToks(toks.slice(0,i)), right=evalToks(toks.slice(i+1));
    const ok=!isNaN(left)&&!isNaN(right)&&Math.abs(left-right)<1e-6;
    row.classList.toggle('row-ok',ok); row.classList.toggle('row-err',!ok);
    row.querySelectorAll('.num-slot, .op-slot').forEach(x=>{ x.classList.toggle('ok',ok); x.classList.toggle('err',!ok); });
    if(!ok){ rowsOk=false; allOk=false; }
  });
  /* L4: every written line must hold, and at least one line must be written */
  const lines=[...document.querySelectorAll('.box-line')]; let linesOk=true;
  if(lines.length){ const filled=lines.filter(l=>l.value.trim());
    const hasOp=filled.some(l=>tokenizeExpr(l.value).some(p=>typeof p==='string'&&p!=='='));
    if(!filled.length||!hasOp){ (filled[0]||lines[0]).style.borderColor='var(--gold)'; anyEmpty=true; }   /* an answer alone is not a working */
    filled.forEach(l=>{ const r=checkFreeLine(l.value); l.classList.toggle('ok',r===true); l.classList.toggle('err',r===false); if(r!==true) linesOk=false; });
    if(!linesOk) allOk=false; }
  if(anyEmpty&&allOk){ /* some empty slots remain — highlight them */
    boxes.forEach(inp=>{ if(!slotVal(inp)) inp.style.borderColor='var(--gold)'; });
    return;
  }
  /* The final answer is what matters for the adaptive engine */
  const ansInp=document.getElementById('l2_q')||document.getElementById('l3ans')||document.getElementById('l4ans');
  const finalOk=(ansInp?isCorrect(window._Q.q,(ansInp.value||'').trim()):allOk)&&linesOk&&rowsOk;
  finishAnswer(ansInp?(ansInp.value||'').trim():String(window._Q.q.ans),null,finalOk);
}

function focusFirstEmpty(){
  setTimeout(()=>{
    const boxes=document.querySelectorAll('.num-slot, .op-slot, [data-ans], .box-line');
    for(const b of boxes){ if(!slotVal(b)){ b.focus(); return; } }
  },50);
}

/* ── legacy render (diagnostic, test, fallback) ── */
function renderLegacy(q,o){
  const fig=q.fig&&q.fp?renderFig(q.fig,q.fp):'';
  let input;
  if(q.qtype==='选择' && q.choices.length){ input=`<div class="choices">${q.choices.map(c=>`<button class="choice" data-v="${esc(c)}" onclick="answerChoice(this)">${esc(c)}</button>`).join('')}</div>`; }
  else { input=`<input class="big" id="ans" inputmode="decimal" placeholder="Жауап" autocomplete="off" oninput="document.getElementById('ansBtn').disabled=!this.value.trim()" onkeydown="if(event.key==='Enter')answerInput()">`; }
  const ladder=o.ladder&&!o.noHints;
  const prog=Math.max(0,Math.min(1,o.prog||0));
  app().innerHTML=`<div class="quiz">
   ${qtopHTML(o,prog)}
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
function disableInputs(){ document.querySelectorAll('.choice').forEach(b=>b.disabled=true); document.querySelectorAll('.box-input, .op-slot, .box-line, .chip').forEach(b=>b.disabled=true); document.querySelectorAll('.op-pad-static, .chips').forEach(x=>x.remove()); const ai=$('ans'); if(ai) ai.disabled=true; const ab=$('ansBtn'); if(ab) ab.disabled=true; }
function finishAnswer(v,btn,forceOk){
  const {q,o}=window._Q; const ok=forceOk!==undefined?forceOk:isCorrect(q,v);
  if(o.mode==='practice' && !ok && !PR.retried && PR.step<5){ PR.retried=true; log({ev:'attempt',ok:false,id:q.id,stage:PR.stId});
    Core.sound('no');
    if(btn){ btn.disabled=true; btn.classList.add('no'); btn.classList.remove('pick'); }
    window._Q.sel=null; window._Q.selBtn=null; const ab0=$('ansBtn'); if(ab0&&($('ans')||document.querySelector('.choice'))) ab0.disabled=true;   /* legacy render only — a choice/typing re-enables it; level rows keep «Тексеру» live for the retry */
    const ai0=$('ans'); if(ai0){ ai0.value=''; ai0.style.borderColor='var(--bad)'; ai0.focus(); }
    /* For level inputs: highlight wrong ones, let pupil retry */
    document.querySelectorAll('.box-input.err, .op-slot.err').forEach(b=>{ slotClear(b); b.style.borderColor='var(--bad)'; });
    document.querySelectorAll('.box-line.err').forEach(b=>{ b.style.borderColor='var(--bad)'; });
    document.querySelectorAll('.eq-row.row-err .num-slot.err, .eq-row.row-err .op-slot.err').forEach(b=>{ b.classList.remove('err'); b.style.borderColor='var(--bad)'; });
    const hbox=$('hints')||document.getElementById('hints'); if(hbox) hbox.insertAdjacentHTML('beforeend',`<div class="fb no" id="retryMsg">${$('hintBtn')?'Қате. Тағы бір рет ойлан немесе «Кеңес» бас.':'Қате. Тағы бір рет ойлан.'}</div>`); return; }
  const rm=$('retryMsg'); if(rm) rm.remove();
  window._Q.done=true; window._Q.given=v;
  /* disable all inputs */
  disableInputs();
  document.querySelectorAll('.choice').forEach(b=>{ b.classList.remove('pick'); if(isCorrect(q,b.dataset.v)) b.classList.add('ok'); else if(b===btn) b.classList.add('no'); });
  const ai=$('ans'); if(ai){ ai.style.borderColor=ok?'var(--good)':'var(--bad)'; }
  /* Mark all box inputs as ok/err */
  document.querySelectorAll('.op-pad').forEach(x=>x.remove());
  document.querySelectorAll('[data-ans]').forEach(inp=>{
    const expected=inp.getAttribute('data-ans'); const val=slotVal(inp);
    if(val&&slotOk(inp)) inp.classList.add('ok');
    else if(val) inp.classList.add('err');
    else { slotFill(inp,expected); inp.classList.add('ok'); inp.style.opacity='0.6'; }
  });
  const qb=$('qbar'); if(qb) qb.style.display='none';
  const showExpl = o.mode==='practice';
  Core.sound(ok?'ok':'no');
  $('fb').innerHTML=`<div class="fb ${ok?'ok':'no'}">${ok?'Дұрыс! ✓':'Қате. Дұрыс жауабы: '+esc(q.ans)}${showExpl&&q.expl?`<span class="expl">${esc(q.expl)}</span>`:''}</div>`;
  o.onAnswer(ok);
  if(o.mode==='practice'){ const st=R.stages[PR.stId];
    $('fb').insertAdjacentHTML('beforeend',`<div class="row"><button class="btn ${ok?'good':''}" onclick="afterAnswerNav()">${PR.twinOf&&!ok?'Ұқсас есеп':'Жалғастыру'}</button>${(st.status==='passed'||(Core.testGate?Core.testGate(st).open:st.testUnlocked))?`<button class="btn gold" onclick="startTest('${PR.stId}')">Тест</button>`:''}</div>`); }
}
