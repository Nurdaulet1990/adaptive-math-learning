/* wp/state.js — route state (R), item pools, and the only wrappers that talk to Core. Owner: Nurdaulet.
   R = the WP state object returned by Core.start('WP'):  R.diag, R.stages[id] = {status,level,streak,wrong,l3streak,testUnlocked,tests,seenCard}
   log(ev)   → Core.answer for ev.ev==='answer', Core.event otherwise
   persist() → Core.save(R) */
'use strict';
const esc=s=>Core.esc(s);
const $=id=>document.getElementById(id);
const app=()=>$('app');
let R=null;

function freshStages(st){ st=st||{}; const g=wpGrade(); const minL=gradeMin(g); STAGES.forEach(([id])=>{ if(!st[id]) st[id]={status:'locked',level:minL,streak:0,wrong:0,l3streak:0,testUnlocked:false,tests:[],seenCard:false,l3win:[],cool:0}; else if(st[id].level<minL) st[id].level=minL; if(Core.gateMigrate) Core.gateMigrate(st[id]); }); return st; }
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

/* ── grade-based level system (WP levels restructure, 2026-10) ── */
/* Grade 1: scaffold levels 1–3 (Сурет → Берілгені → Шешуі), numbers ≤ 10.
   Grade 2+: scaffold levels 2–4 (Берілгені → Шешуі → Мәтін), numbers ≤ 100.
   The scaffold level controls HOW the question is rendered (pictures, bar model, equation, pure text).
   The template lvl controls which number range to draw from. */
function wpGrade(){
  const s=Core._session&&Core._session();
  const m=/^\s*(\d)/.exec((s&&s.klass)||'');
  return m?+m[1]:2; /* default to grade 2 if unknown */
}
function gradeMin(g){ return g===1?1:2; }
function gradeMax(g){ return g===1?3:4; }
/* Map scaffold level → template lvl for item/template selection.
   Grade 1: all scaffold levels draw from template lvl 1 (small numbers ≤ 10).
   Grade 2+: scaffold 2 → tpl 2, scaffold 3–4 → tpl 3. */
function tplLvl(g,scaff){ if(g===1) return 1; return scaff<=2?2:3; }
/* The test-gate level — the highest scaffold level for this grade */
function isMaxLevel(g,lvl){ return lvl>=gradeMax(g); }

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
function tplById(id){ return BANK.templates.find(t=>t.id===id); }
function stageHasContent(st){ return BANK.items.some(i=>i.stage===st&&i.kind!=='教学卡') || BANK.templates.some(t=>t.stage===st); }
function stageL3(st){ const tl=tplLvl(wpGrade(),gradeMax(wpGrade())); return BANK.items.some(i=>i.stage===st&&i.lvl===tl&&i.kind!=='教学卡') || BANK.templates.some(t=>t.stage===st&&t.lvl===tl); }
function stageName(id){ const s=STAGES.find(x=>x[0]===id); return s?s[1]:id; }
function stageIdx(id){ return STAGES.findIndex(x=>x[0]===id); }
function currentStage(){ for(const [id] of STAGES){ if(R.stages[id].status==='current') return id; } return 'WP-01'; }
function acc(){ return R&&R.nAns?Math.round(100*(R.nOk||0)/R.nAns):0; }
