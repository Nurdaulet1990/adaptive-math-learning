/* Есеп жолы · core-stub.js  v1.0
   Development stand-in for core/core.js. SAME API. Stores everything in localStorage under one key
   so a route can be built and tested standalone; swapping this file for core.js needs no route changes.
   Route authors: load this file, never edit it. */
(function(){
  'use strict';
  const KEY='esep_stub_v1';
  const load=()=>{ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ return {}; } };
  const save=(d)=>{ try{ localStorage.setItem(KEY,JSON.stringify(d)); }catch(e){} };
  let DB=load(); DB.states=DB.states||{}; DB.events=DB.events||[];
  let ROUTE=null;

  const norm=s=>String(s).trim().replace(/\s+/g,' ').replace(',','.').replace(/\s*%$/,'').toLowerCase();
  function fracVal(s){ const m=String(s).match(/^(-?\d+)\s+(\d+)\/(\d+)$/)||String(s).match(/^(-?)(\d+)\/(\d+)$/);
    if(!m) return NaN; if(m.length===4&&m[0].includes(' ')){ const w=+m[1],n=+m[2],d=+m[3]; return d?Math.sign(w||1)*(Math.abs(w)+n/d):NaN; }
    const n=+m[2],d=+m[3]; return d?(m[1]==='-'?-1:1)*n/d:NaN; }
  function isCorrect(q,given){
    const a=norm(given), b=norm(q.ans);
    if(a===b) return true;
    const fa=fracVal(a), fb=fracVal(b); if(Number.isFinite(fa)&&Number.isFinite(fb)) return Math.abs(fa-fb)<1e-9;
    const na=parseFloat(a), nb=parseFloat(b);
    if(/^-?\d+(\.\d+)?$/.test(b)){ const m=a.match(/-?\d+(\.\d+)?/); if(m&&Number.isFinite(nb)) return Math.abs(parseFloat(m[0])-nb)<1e-9; }
    return Number.isFinite(na)&&Number.isFinite(nb)&&Math.abs(na-nb)<1e-9;
  }

  const Core={
    version:'stub-1.0',
    student:{id:'stub-student',name:'Тест Оқушы',klass:'0А'},
    online:false,
    async start(route){ if(!/^[A-Z]{2}$/.test(route||'')) throw new Error('Core.start: route code must be two capital letters, e.g. "FR"'); ROUTE=route; DB.states[route]=DB.states[route]||{}; return DB.states[route]; },
    save(state){ if(!ROUTE) return console.warn('Core.save before Core.start'); DB.states[ROUTE]=state||{}; save(DB); },
    answer(a){ if(!ROUTE) return console.warn('Core.answer before Core.start');
      const miss=['stage','lvl','ok'].filter(k=>a==null||a[k]===undefined); if(miss.length) console.warn('Core.answer missing fields:',miss.join(','),a);
      if(a&&a.stage&&!String(a.stage).startsWith(ROUTE+'-')) console.warn('Core.answer: stage id should start with '+ROUTE+'-', a.stage);
      DB.events.push(Object.assign({t:Date.now(),route:ROUTE,ev:'answer'},a)); if(DB.events.length>2000) DB.events.shift(); save(DB); },
    event(e){ if(!ROUTE) return console.warn('Core.event before Core.start'); DB.events.push(Object.assign({t:Date.now(),route:ROUTE},e)); save(DB); },
    isCorrect,
    /* stub-only helpers (not in core.js): */
    _events(){ return DB.events.slice(); },
    _reset(){ DB={states:{},events:[]}; save(DB); },
  };
  window.Core=Core;
})();
