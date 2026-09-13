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
function pull(){ state.completed=R.completed||{}; state.stars=R.stars||0; state.unlockedUpTo=R.unlockedUpTo!==undefined?R.unlockedUpTo:0; state.started=!!R.started; }
function push(){ R.completed=state.completed; R.stars=state.stars; R.unlockedUpTo=state.unlockedUpTo; R.started=state.started; mirror(); Core.save(R); }

/* wrap app functions (function declarations are global bindings → reassignable) */
const _save=saveProgress; saveProgress=function(){ try{ _save(); }catch(e){} if(R) push(); };
const _gen=generateQuestion; generateQuestion=function(){ qT0=Date.now(); qHints=0; return _gen.apply(this,arguments); };
const _hint=showVisualHint; showVisualHint=function(){ qHints=Math.min(5,qHints+1); if(R&&state.level) Core.event({ev:'hint',n:qHints,stage:stageId(state.level)}); return _hint.apply(this,arguments); };
const _fb=showFeedback; showFeedback=function(correct,hint){
  if(R&&state.level){ const ws=document.getElementById('workspace'); const stem=ws?(ws.querySelector('.question,.q-text,h2,h3,p')||ws).textContent.trim().replace(/\s+/g,' ').slice(0,160):'';
    const ansM=hint?String(hint).replace(/^Дұрыс( жауап)?:\s*/,''):'';
    Core.answer({stage:stageId(state.level),lvl:3,ok:!!correct,mode:'practice',hints:qHints,ms:Date.now()-qT0,type:state.level,stem:levelName(state.level)+(stem?' — '+stem:''),ans:correct?undefined:ansM,given:undefined}); }
  return _fb.apply(this,arguments); };
const _lc=showLevelComplete; showLevelComplete=function(ws){ const lv=state.level, score=state.score, n=state.questionsPerLevel; const r=_lc.apply(this,arguments);
  if(R&&lv){ const mastery=COMP_LVL.has(lv)?4:8; Core.event({ev:'test',stage:stageId(lv),ok:score,n,pass:score>=mastery}); push(); } return r; };
const _fp=finishPlacement; finishPlacement=function(){ const hist=(state.placement&&state.placement.history)||[]; const r=_fp.apply(this,arguments);
  if(R){ const results={}; hist.forEach(h=>{ results[stageId(LEVEL_ORDER[h.idx].levelId)]=h.correct?'pass':'fail'; }); const cur=Math.min(state.unlockedUpTo,LEVEL_ORDER.length-1); R.diag={t:Date.now(),placed:'PV-'+String(cur+1).padStart(2,'0'),results,n:hist.length}; Core.event({ev:'diag',placed:R.diag.placed,results}); push(); } return r; };

/* boot: login → load → re-render */
host.style.display='block';
Core.start('PV').then(rs=>{ R=rs; if(!R.completed) R.completed={}; pull(); mirror(); Core.save(R); host.innerHTML=''; host.style.display='none';
  const bar=document.createElement('div'); bar.style.cssText='position:fixed;right:10px;top:8px;z-index:999;font:700 12px Nunito,system-ui,sans-serif;background:#fff;border:1px solid #DCE0E4;border-radius:999px;padding:5px 10px;color:#1B2733;box-shadow:0 2px 6px rgba(0,0,0,.08)';
  bar.innerHTML=`${Core.esc(Core.student.name)} · <a href="../" style="color:#0E7C9B;text-decoration:none">барлық бағыттар</a> · <a href="#" id="pvout" style="color:#5E6B7A;text-decoration:none">шығу</a>`; document.body.appendChild(bar); document.getElementById('pvout').onclick=e=>{ e.preventDefault(); Core.logout(); };
  state.module=null; state.level=null; renderSidebar(); renderMain(); });
})();
