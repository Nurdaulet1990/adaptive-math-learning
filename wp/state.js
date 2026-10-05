/* wp/state.js — route state (R), item pools, and the only wrappers that talk to Core. Owner: Nurdaulet.
   R = the WP state object returned by Core.start('WP'):  R.diag, R.stages[id] = {status,level,streak,wrong,l3streak,testUnlocked,tests,seenCard}
   log(ev)   → Core.answer for ev.ev==='answer', Core.event otherwise
   persist() → Core.save(R) */
'use strict';
const esc=s=>Core.esc(s);
const $=id=>document.getElementById(id);
const app=()=>$('app');
let R=null;

/* ── grade-based scaffold system (WP levels restructure, 2026-10) ── */
/* Grade 1: scaffold levels 1–3 (Сурет → Берілгені → Шешуі), numbers ≤ 10.
   Grade 2+: scaffold levels 2–4 (Берілгені → Шешуі → Мәтін), numbers ≤ 100.
   The scaffold level controls HOW the question is rendered (pictures, bar model, equation, pure text).
   Since 2026-10 the scaffold is tracked PER FAMILY (wp/families.js): every problem structure in a stage
   starts again at the grade's lowest level, so a new bar-model shape is always met with the bar model. */
function wpGrade(){
  const s=Core._session&&Core._session();
  const m=/^\s*(\d)/.exec((s&&s.klass)||'');
  return m?+m[1]:2; /* default to grade 2 if unknown */
}
function gradeMin(g){ return g===1?1:2; }
function gradeMax(g){ return g===1?3:4; }
/* legacy mapping scaffold level → template lvl, still used by the diagnostic and the old drawItem */
function tplLvl(g,scaff){ if(g===1) return 1; return scaff<=2?2:3; }
function isMaxLevel(g,lvl){ return lvl>=gradeMax(g); }
/* template lvls a grade may draw from (lvl = number range: 1 ≤10/20 · 2 ≤100 · 3 two/three-digit, G3+) */
function gradeLvls(g){ return g===1?[1]:g===2?[1,2]:[2,3]; }

/* ── per-family state ──
   R.stages[id].fam[F] = {level, streak, wrong, done}; R.stages[id].cur = family being learnt now.
   R.stages[id].level / streak mirror the current family (the map and Core helpers read them). */
function freshFam(minL){ return {level:minL,streak:0,wrong:0,done:false}; }
function famState(st,fid){ return st.fam&&st.fam[fid]; }
function curFam(stId,st){
  const fams=famsOf(stId); if(!fams.length) return null;
  if(st.cur&&st.fam[st.cur]&&!st.fam[st.cur].done) return st.cur;
  const nx=fams.find(f=>!st.fam[f.id].done); st.cur=nx?nx.id:null; return st.cur;
}
function doneFams(stId,st){ return famsOf(stId).filter(f=>st.fam[f.id]&&st.fam[f.id].done).map(f=>f.id); }
function allFamsDone(stId,st){ const fams=famsOf(stId); return fams.length>0&&fams.every(f=>st.fam[f.id]&&st.fam[f.id].done); }
/* keep the legacy mirror fields in step with the current family */
function syncFam(stId,st){
  const fid=curFam(stId,st); const g=wpGrade();
  if(fid){ const f=st.fam[fid]; st.level=f.level; st.streak=f.streak; st.wrong=f.wrong; }
  else { st.level=gradeMax(g); st.streak=0; st.wrong=0; }
  st.testUnlocked=allFamsDone(stId,st);
  return st;
}
function freshStages(st){ st=st||{}; const g=wpGrade(); const minL=gradeMin(g), maxL=gradeMax(g);
  STAGES.forEach(([id])=>{
    if(!st[id]) st[id]={status:'locked',level:minL,streak:0,wrong:0,l3streak:0,testUnlocked:false,tests:[],seenCard:false,l3win:[],cool:0};
    const s=st[id]; const fams=famsOf(id);
    /* migration (2026-10): a row saved before families existed restarts every family at the bottom —
       a passed station keeps its pass and its families count as finished */
    if(!s.fam){ s.fam={}; s.cur=null; s.seenCard=false; }
    fams.forEach(f=>{ if(!s.fam[f.id]) s.fam[f.id]=s.status==='passed'?{level:maxL,streak:0,wrong:0,done:true}:freshFam(minL); });
    Object.values(s.fam).forEach(f=>{ if(f.level<minL) f.level=minL; if(f.level>maxL) f.level=maxL; });
    if(Core.gateMigrate) Core.gateMigrate(s);
    syncFam(id,s);
  }); return st; }
function initState(state){ R=state; R.stages=freshStages(R.stages); R.diag=R.diag||null;
  if(Core.tester) testerUnlock(); return R; }
/* the tester account — see Core.tester in core/core.js. WP keeps its own copy of the runner,
   so it needs its own copy of this too. */
function testerUnlock(stId){
  const at=stId||STAGES[0][0];
  STAGES.forEach(([id])=>{ R.stages[id].status=id===at?'current':'passed'; });
  R.diag=R.diag||{t:Date.now(),placed:at,results:{},n:0,tester:true};
}
function persist(){ if(R) Core.save(R); }
function log(ev){ if(!R) return; if(ev.ev==='answer'){ const a=Object.assign({},ev); delete a.ev; Core.answer(a); } else Core.event(ev); }
function qinfo(q){ return {stem:String(q.stem||'').slice(0,200),ans:q.ans,given:(window._Q&&window._Q.given!==undefined)?String(window._Q.given).slice(0,30):undefined}; }
const isCorrect=(q,v)=>Core.isCorrect(q,v);
const topbar=()=>Core.topbar('Мәтінді есептер · 1–5 сынып');

/* ── item pools ── */
const ITEMS_BY=(st,lvl,kind)=>BANK.items.filter(i=>i.stage===st&&i.lvl===lvl&&(kind?i.kind===kind:i.kind!=='教学卡'));
const TPL_BY=(st,lvl)=>BANK.templates.filter(t=>t.stage===st&&t.lvl===lvl);
const CARDS=(st)=>BANK.items.filter(i=>i.stage===st&&i.kind==='教学卡');
const recent=[];
function drawItem(st,lvl,opts={}){
  /* lvl here is the scaffold level; map to template lvl for item/template selection */
  const tlvl=opts.tplLvl||lvl;
  const items=ITEMS_BY(st,tlvl,opts.kind).filter(i=>!recent.includes(i.id)); const tpls=TPL_BY(st,tlvl);
  const useTpl = tpls.length && (opts.mode==='practice' || items.length===0 || Math.random()<0.6);
  let q=null;
  if(useTpl){ for(let k=0;k<5&&!q;k++) q=generate(pick(tpls)); }
  if(!q && items.length) q=pick(items);
  if(!q){ const alt=BANK.items.filter(i=>i.stage===st&&i.kind!=='教学卡'&&!recent.includes(i.id)); if(alt.length) q=pick(alt); }
  if(!q){ const t=BANK.templates.filter(t=>t.stage===st); if(t.length) q=generate(pick(t)); }
  if(q){ recent.push(q.id); if(recent.length>40) recent.shift(); }
  return q;
}
/* draw one practice question from a family: templates of that family within the grade's number range.
   At the grade's top scaffold level the smallest range is dropped (if the family has a bigger one),
   so numbers grow as the scaffold fades. */
function drawFam(stId,fid,scaff,opts={}){
  const fam=famsOf(stId).find(f=>f.id===fid); if(!fam) return null;
  const g=wpGrade(); let lvls=gradeLvls(g);
  let pool=BANK.templates.filter(t=>t.stage===stId&&fam.tpls.includes(t.id));
  let inRange=pool.filter(t=>lvls.includes(t.lvl));
  if(inRange.length&&scaff>=gradeMax(g)&&lvls.length>1){ const hi=inRange.filter(t=>t.lvl>lvls[0]); if(hi.length) inRange=hi; }
  if(!inRange.length){ /* nothing in range: nearest lvl above, then anything in the family */
    const above=pool.filter(t=>t.lvl>lvls[lvls.length-1]).sort((x,y)=>x.lvl-y.lvl); inRange=above.length?above.filter(t=>t.lvl===above[0].lvl):pool; }
  if(!inRange.length) return null;
  const fresh=inRange.filter(t=>!recent.includes(t.id)); const use=fresh.length?fresh:inRange;
  let q=null; for(let k=0;k<6&&!q;k++) q=generate(pick(use));
  if(q){ q.fam=fid; recent.push(q.tpl||q.id); if(recent.length>40) recent.shift(); }
  return q;
}
function tplById(id){ return BANK.templates.find(t=>t.id===id); }
function stageHasContent(st){ return BANK.items.some(i=>i.stage===st&&i.kind!=='教学卡') || BANK.templates.some(t=>t.stage===st); }
function stageL3(st){ const tl=tplLvl(wpGrade(),gradeMax(wpGrade())); return BANK.items.some(i=>i.stage===st&&i.lvl===tl&&i.kind!=='教学卡') || BANK.templates.some(t=>t.stage===st&&t.lvl===tl); }
function stageName(id){ const s=STAGES.find(x=>x[0]===id); return s?s[1]:id; }
function stageIdx(id){ return STAGES.findIndex(x=>x[0]===id); }
function currentStage(){ for(const [id] of STAGES){ if(R.stages[id].status==='current') return id; } return 'WP-01'; }
function acc(){ return R&&R.nAns?Math.round(100*(R.nOk||0)/R.nAns):0; }
