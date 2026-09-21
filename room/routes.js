/* room/routes.js — lets a page that is NOT a route (the room page, the portal, the teacher page) use a route's own
   stage table and generators, so a challenge room can be held on ANY station a pupil has passed — not on a second,
   hand-copied set of question rules. Owner: platform owner.

   How a room gets the same questions on every screen without anybody sending questions around:
   the server hands out one random SEED; every browser runs the route's own generator with Math.random replaced by a
   generator started from that seed → the same sheet everywhere. Nothing a pupil's browser produced is ever shown
   to another pupil (no HTML travels between pupils), and a new station needs no work here at all.

   Two things make "the same seed → the same sheet" hold across browsers:
   · Math.random is replaced for the duration (mulberry32);
   · Array.prototype.sort is replaced for the duration too: engines are free to call the comparator in a different
     order, and `arr.sort(()=>Math.random()-.5)` would then eat the random stream differently in Chrome and Safari.
   Each browser also reports a fingerprint of its sheet, so a device that did get something else is flagged.

   PV is a legacy single-file route with no generator module: it cannot be used here. */
(function(){
  'use strict';
  const V='1';                                   // BUMP whenever ANY route's stages / figs / generators change: two devices holding
                                                 // different cached copies would build different sheets from the same seed
  const ROOT=(document.currentScript&&document.currentScript.src||'').replace(/room\/routes\.js.*$/,'');
  const FILES=Object.assign(Object.create(null),{ AR:['stages.js','figs.js','figs2.js','generate.js','generate2.js'], FR:['stages.js','figs.js','generate.js'],
                TE:['stages.js','figs.js','generate.js'], WP:['stages.js','bank.js','generate.js'] });
  const FOLDER={AR:'ar',FR:'fr',TE:'te',WP:'wp'};
  const NO_ROOM=new Set(['speed']);              // a whole timed drill inside one "question" — it is a game of its own
  const FAST=new Set(['table','divfact']);       // recall facts: ten of them, three minutes
  const cache=Object.create(null), names=Object.create(null);

  /* a static file over school wifi: never wait more than 8 s, and try once more before giving up */
  async function get(u){ let err; for(let k=0;k<2;k++){ const ac=typeof AbortController!=='undefined'?new AbortController():null, t=ac&&setTimeout(()=>ac.abort(),8000);
      try{ const r=await fetch(u,ac?{signal:ac.signal}:undefined); if(!r.ok) throw new Error(u+' '+r.status); return await r.text(); }catch(e){ err=e; } finally{ if(t) clearTimeout(t); } }
    throw err; }
  const TAIL='\n;return {STAGES:typeof STAGES!=="undefined"?STAGES:null,GENERATORS:typeof GENERATORS!=="undefined"?GENERATORS:null,'
            +'FIGS:typeof FIGS!=="undefined"?FIGS:null,BANK:typeof BANK!=="undefined"?BANK:null,generate:typeof generate==="function"?generate:null};';
  /* Two routes on one page would collide: some declare top-level consts (STAGES, GENERATORS, …), AR publishes the same
     names on `window`. So each route's files are evaluated together in a scope of their own, where `window` is a
     stand-in: what the files PUBLISH on it stays with this route (and is found again by the route's later files);
     everything else — Math, document, renderFig, setTimeout — is not the stand-in's business and resolves to the real
     page as usual. (A plain Object.create(window) would not do: a browser refuses window's accessors on any other
     receiver — "Illegal invocation".) */
  function evalRoute(src){ const own=Object.create(null), me=k=>k==='window'||k==='self'||k==='globalThis';
    const W=new Proxy(own,{ has:(t,k)=>me(k)||k in t, get:(t,k)=>me(k)?W:k in t?t[k]:typeof k==='string'?window[k]:undefined, set:(t,k,v)=>{ t[k]=v; return true; } });
    return new Function('window','with(window){\n'+src+TAIL+'\n}')(W); }
  /* a failed download must not be remembered: the next try has to fetch again */
  const once=(store,key,make)=>store[key]||(store[key]=make().catch(e=>{ delete store[key]; throw e; }));
  function load(route){ if(!FILES[route]) return Promise.reject(new Error('no such route'));
    return once(cache,route,()=>Promise.all(FILES[route].map(f=>get(ROOT+FOLDER[route]+'/'+f+'?r='+V))).then(src=>evalRoute(src.join('\n;\n')))); }
  function stageNames(route){ if(!FILES[route]) return Promise.resolve({});
    return once(names,route,()=>get(ROOT+FOLDER[route]+'/stages.js?r='+V).then(t=>{ const S=evalRoute(t).STAGES||[]; const o=Object.create(null); S.forEach(r=>{ o[r[0]]={name:r[1],type:r[2],grade:r[5]||''}; }); return o; })); }

  const usable=(route,type)=>!!FILES[route]&&!NO_ROOM.has(type);
  /* how many questions, how long: recall facts are quick; a word problem has to be read */
  const rule=(route,type)=>route==='WP'?{n:5,secs:480}:FAST.has(type)?{n:10,secs:180}:{n:6,secs:420};

  function mergeSort(a,cmp){ if(a.length<2) return a; const m=a.length>>1, l=mergeSort(a.slice(0,m),cmp), r=mergeSort(a.slice(m),cmp), o=[]; let i=0,j=0;
    while(i<l.length&&j<r.length) o.push(cmp(l[i],r[j])<=0?l[i++]:r[j++]); while(i<l.length) o.push(l[i++]); while(j<r.length) o.push(r[j++]); return o; }
  function withSeed(seed,fn){ const R=Math.random, S=Array.prototype.sort; let a=(seed>>>0)||1;
    Math.random=function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
    Array.prototype.sort=function(cmp){ const c=cmp||((x,y)=>{ x=String(x); y=String(y); return x<y?-1:x>y?1:0; }); const s=mergeSort(Array.prototype.slice.call(this),c); for(let i=0;i<s.length;i++) this[i]=s[i]; return this; };
    try{ return fn(); } finally{ Math.random=R; Array.prototype.sort=S; } }

  function one(mod,route,row){
    if(route==='WP'){ const all=mod.BANK.templates.filter(t=>t.stage===row[0]), l3=all.filter(t=>t.lvl===3), pool=l3.length?l3:all; if(!pool.length||!mod.generate) return null;
      const q=mod.generate(pool[Math.floor(Math.random()*pool.length)]); if(!q) return null; q.kind=q.choices&&q.choices.length?'choice':'input'; q.choices=q.choices||[]; q.wpFig=q.fig?{type:q.fig,fp:q.fp||''}:null; q.fig=null; return q; }
    const gen=mod.GENERATORS&&mod.GENERATORS[row[2]]; if(!gen) return null;
    const q=gen(row[3]||{},3); if(!q||q.stem===undefined||q.ans===undefined) return null;
    q.kind=q.kind||(q.choices&&q.choices.length?'choice':'input'); q.choices=q.choices||[]; return q; }
  /* the sheet for (route, stage, seed): level 3, no two alike — the same rule as a stage test */
  function sheet(mod,route,stageId,seed,n){ const row=(mod.STAGES||[]).find(s=>s[0]===stageId); if(!row||!usable(route,row[2])) return [];
    return withSeed(seed,()=>{ const out=[], seen=new Set();
      for(let i=0;i<n;i++){ let q=null; for(let k=0;k<12&&!q;k++){ let c=null; try{ c=one(mod,route,row); }catch(e){ c=null; } if(c&&!seen.has(c.stem+'|'+c.ans)) q=c; }
        if(q){ seen.add(q.stem+'|'+q.ans); q.stage=stageId; q.type=row[2]; q.lvl=3; out.push(q); } }
      return out; }); }
  function figHTML(mod,q){ if(q.wpFig) return window.renderFig?window.renderFig(q.wpFig.type,q.wpFig.fp):''; const f=q.fig; if(!f) return ''; if(typeof f==='string') return f;
    if(mod.FIGS&&mod.FIGS[f.type]) return mod.FIGS[f.type](f); return window.renderFig?window.renderFig(f.type,f.fp||''):''; }
  /* a short fingerprint of what this browser generated, reported with the answers */
  function print(qs){ let h=5381; const s=qs.map(q=>q.stem+'|'+q.ans+'|'+(q.choices||[]).join(',')).join('\n'); for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(16)+'.'+qs.length; }

  window.RoomRoutes={ROUTES:Object.keys(FILES),load,stageNames,usable,rule,sheet,figHTML,print,withSeed};
})();
