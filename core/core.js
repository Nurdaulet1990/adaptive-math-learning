/* Есеп жолы · core/core.js  v1.1
   Shared layer for every route: student session, per-route state, event logging, offline queue.
   Same API as core-stub.js. Routes never talk to the database directly — and since v1.1 neither does core:
   it calls the esep_* functions (supabase/01_additive.sql), which check a session token on the server.
   The browser key alone can no longer read or change a row.
   Owner: platform owner only. Do not edit from a route. */
(function(){
  'use strict';
  const CFG={
    SB_URL:'https://qcegfpzvyhohsbxweaif.supabase.co',
    SB_KEY:'sb_publishable_K489qSbIMCL7yXYrQwrDnQ_4LxZ1nkH',
    ROUTES:[ // code, Kazakh name, url (folder relative to repo root, or full url while a route is still hosted elsewhere), status, grades
      ['WP','Мәтінді есептер','wp/','live','1–5'],
      ['FR','Бөлшектер','fr/','live','3–6'],
      ['PV','Орын мәні','pv/','live','1–4'],
      ['AR','Көбейту мен бөлу','ar/','live','2–5'],
      ['TE','Теңдеулер','te/','live','1–4'],
    ],
  };
  /* A page without <meta name="viewport"> is laid out at 980px and then shrunk on a phone — everything
     turns microscopic. core.js loads in <head>, so adding it here fixes any page that forgot it. */
  (function viewportGuard(){ try{ if(document.querySelector('meta[name="viewport"]')) return;
    const m=document.createElement('meta'); m.name='viewport'; m.content='width=device-width,initial-scale=1';
    (document.head||document.documentElement).appendChild(m); }catch(e){} })();

  /* Installable app + opens without a network once visited: ../sw.js next to the site root (see its header — it is
     network-first, so online nothing changes). Only on https or localhost; never under node (tests), where there is
     no navigator.serviceWorker and no currentScript. */
  (function registerSW(){ try{
    if(!('serviceWorker' in navigator)||!document.currentScript) return;
    if(location.protocol!=='https:'&&!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    const sw=new URL('../sw.js',document.currentScript.src);
    addEventListener('load',()=>{ navigator.serviceWorker.register(sw.href,{scope:new URL('./',sw).href}).catch(()=>{}); });
  }catch(e){} })();

  /* the site's home page, worked out from where core.js itself is served (…/core/core.js → …/), so it is right
     both on GitHub Pages (/adaptive-math-learning/) and on localhost; the top bar shows a home button on every
     page that is not it */
  const ROOT=(()=>{ try{ return new URL('../',document.currentScript.src).href; }catch(e){ return null; } })();
  const atHome=()=>{ try{ const h=new URL(ROOT).pathname, p=location.pathname.replace(/index\.html$/,''); return p===h; }catch(e){ return true; } };
  const HOME_SVG='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 4l8 7.5"/><path d="M6.5 10v9.5h4.2v-5.2h2.6v5.2h4.2V10"/></svg>';
  const SESSION_KEY='esep_session_v1', CACHE_KEY='esep_cache_v1';
  const ls={get(k){ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} }};
  const enc=encodeURIComponent;

  /* ── language lock ──────────────────────────────────────────────
     We do NOT translate anything ourselves. We only decide whether the browser
     is allowed to translate the page:
       kk (default) → <meta name="google" content="notranslate"> is present → Chrome never offers/auto-translates.
       ru           → the meta is removed → the pupil may switch the page to Russian with Chrome's own translator.
     Runs as early as core.js is parsed. Pages also carry the meta statically so the lock applies before this runs. */
  const LANG_KEY='esep_lang';
  const lang=()=>ls.get(LANG_KEY)||'kk';
  (function applyLangLock(){ try{
    const head=document.head||document.documentElement;
    const m=head.querySelector('meta[name="google"]');
    if(lang()==='ru'){ if(m) m.remove(); document.documentElement.removeAttribute('translate'); }
    else if(!m){ const el=document.createElement('meta'); el.name='google'; el.content='notranslate'; head.appendChild(el); }
  }catch(e){} })();
  function setLang(l){ ls.set(LANG_KEY,l); if(l==='ru') ls.set('esep_ruhint',1); location.reload(); }

  /* ── avatar (the animal that walks the road) and sound ── */
  const AVATARS=['🦊','🐻','🐣','🐬','🦉','🐯','🐢','🦋'];
  let pickAva=null;
  const avatar=()=>(STATE&&STATE._ava)||ls.get('esep_ava')||'🦊';
  function setAvatar(e){ ls.set('esep_ava',e); if(STATE){ STATE._ava=e; dirty=true; schedule(); } pal.redraw(); }
  /* the drawing of an animal (core/pets.js). A page still holding an older cached pets.js — or none — shows the emoji. */
  const petSVG=(a,o)=>window.Pets?window.Pets.svg(a||avatar(),o):`<span class="pet-emoji">${a||avatar()}</span>`;
  const petName=a=>window.Pets?window.Pets.name(a||avatar()):'';

  /* ── the companion: the pupil's animal floats in the corner of every page she is logged in on ──
     Mounted by Core.login(), so the teacher page and the login card never get one. It keeps above whatever is
     fixed to the bottom of the screen (a question's action bar, the feedback sheet, the Russian hint), reacts to
     the feedback sheet (#fb) — happy on «Дұрыс», thinking on a wrong answer — and, when tapped, jumps and says
     something. It never navigates: a tap in the middle of a question must not take the child away from it.
     Core.petSay(text[,ms]) and Core.petMood('idle'|'think'|'happy'[,ms]) let a page talk through it. */
  const pal=(function(){
    let el=null, mood='idle', moodT=0, sayT=0, lastFb='', raf=0;
    const CHEER=['Керемет!','Жарайсың!','Дұрыс!','Тамаша!'], TRY=['Қайта көрейік!','Асықпа, ойлан.','Бөліктерге қара!'], TAP=['Алға!','Сен істей аласың!','Мен осындамын!'];
    const pick=a=>a[Math.floor(Math.random()*a.length)];
    function draw(){ if(!el) return; el.querySelector('.pp-body').innerHTML=petSVG(null,{mood,size:64}); el.setAttribute('aria-label','Жолсерігің'+(petName()?': '+petName():'')); }
    function setMood(m,ms){ clearTimeout(moodT); mood=m; draw(); if(el){ el.dataset.mood=m; } if(ms) moodT=setTimeout(()=>setMood('idle'),ms); }
    function say(t,ms){ if(!el) return; const b=el.querySelector('.pp-say'); clearTimeout(sayT); b.textContent=t; b.hidden=false; b.classList.remove('in'); void b.offsetWidth; b.classList.add('in'); sayT=setTimeout(()=>{ b.hidden=true; },ms||2600); }
    /* keep clear of anything fixed to the bottom edge */
    function place(){ raf=0; if(!el) return; let h=0;
      document.querySelectorAll('.actbar,#fb,.ruhint,.tabbar').forEach(x=>{ if(!x.firstChild&&x.id==='fb') return; const cs=getComputedStyle(x);
        /* measured by size, not position: the feedback sheet slides in from below, so at the moment it appears its
           top is still off-screen and a position-based check would leave the animal standing behind it */
        if(cs.position==='fixed'&&cs.display!=='none'&&x.offsetHeight) h=Math.max(h,x.offsetHeight+(parseFloat(cs.bottom)||0)); });
      el.style.bottom=h?`${Math.round(h+10)}px`:'';
      /* something tappable underneath (a card's button on the home page)? then only peek in from the edge */
      el.classList.toggle('peek',covers());
      const tp=document.getElementById('taskpill'); if(tp) tp.style.bottom=h?`${Math.round(h+14)}px`:''; }
    function covers(){ const r=el.getBoundingClientRect(); if(!r.width) return false;
      const x0=r.left-(el.classList.contains('peek')||el.classList.contains('away')?46:0);   // test where it WOULD stand, or it flips back and forth
      const pts=[[x0+r.width*.3,r.top+r.height*.55],[x0+r.width*.6,r.top+r.height*.4],[x0+r.width*.5,r.bottom-12]];
      return pts.some(([x,y])=>document.elementsFromPoint(x,y).some(n=>n!==el&&!el.contains(n)&&n.closest&&n.closest('a,button,input,select,textarea,[role="button"],.choice'))); }
    const soon=()=>{ if(!raf) raf=requestAnimationFrame(place); };
    function watch(){
      const fb=document.getElementById('fb'), retry=document.getElementById('retryMsg');
      const now=(fb&&fb.querySelector('.fb')?(fb.querySelector('.fb.ok')?'ok':'no')+fb.children.length:'')+(retry?'r':'');
      /* on a route map the animal already stands on the pupil's station: one of it is enough */
      el.classList.toggle('onmap',!!document.querySelector('.stn .fox'));
      if(now!==lastFb){ if(fb&&fb.querySelector('.fb.ok')&&!/^ok/.test(lastFb)){ setMood('happy',2400); say(pick(CHEER),2200); }
        else if((fb&&fb.querySelector('.fb.no')&&!/^no/.test(lastFb))||(retry&&!/r$/.test(lastFb))){ setMood('think',3000); say(pick(TRY),2600); }
        lastFb=now; }
      soon(); }
    function mount(){ if(el||!document.body||ls.get('esep_pet_off')===1) return;
      el=document.createElement('button'); el.type='button'; el.id='petpal'; el.className='petpal';
      el.innerHTML='<span class="pp-say" hidden></span><span class="pp-body"></span><span class="pp-shade" aria-hidden="true"></span>';
      document.body.appendChild(el); document.body.classList.add('has-pet'); draw(); try{ task.draw(); }catch(e){}
      el.onclick=()=>{ el.classList.remove('jump'); void el.offsetWidth; el.classList.add('jump'); if(mood==='idle') say(pick(TAP),1800); };
      new MutationObserver(watch).observe(document.body,{childList:true,subtree:true});
      addEventListener('resize',soon);
      /* while the page scrolls it steps aside to the right edge, so it never sits on a button the child is scrolling to */
      let st=0; addEventListener('scroll',()=>{ el.classList.add('away'); clearTimeout(st); st=setTimeout(()=>{ if(el){ el.classList.remove('away'); soon(); } },650); },{passive:true});
      setInterval(()=>{ if(el&&!document.hidden) soon(); },1500);   // layout also moves without DOM changes (fonts, images, a keyboard)
      watch(); }
    return {mount, redraw:draw, say, mood:setMood, off(v){ ls.set('esep_pet_off',v?1:0); if(v&&el){ el.remove(); el=null; document.body.classList.remove('has-pet'); } else if(!v) mount(); }};
  })();

  /* ── changing the animal after login: the top-bar chip opens this ── */
  function pickPet(){
    if(document.getElementById('petpick')) return;
    const box=document.createElement('div'); box.id='petpick'; box.className='petpick';
    let cur=avatar();
    const grid=()=>AVATARS.map(a=>`<button type="button" class="ava${a===cur?' on':''}" data-a="${a}" aria-pressed="${a===cur}" aria-label="${petName(a)}">${petSVG(a,{head:true,size:44})}<small>${petName(a)}</small></button>`).join('');
    const hero=()=>`<div class="pk-hero">${petSVG(cur,{mood:'happy',size:120})}</div><h2 style="text-align:center;margin:0 0 10px">${petName(cur)}</h2>`;
    box.innerHTML=`<div class="pk-card" role="dialog" aria-modal="true" aria-label="Жолсерік таңдау"><div class="pk-top"></div><div class="avarow big">${grid()}</div>
      <div class="row" style="margin-top:14px"><button type="button" class="btn plain" data-x>Жабу</button><button type="button" class="btn" data-ok>Сақтау</button></div></div>`;
    const top=box.querySelector('.pk-top'), row=box.querySelector('.avarow'); top.innerHTML=hero();
    row.onclick=e=>{ const b=e.target.closest('button[data-a]'); if(!b) return; cur=b.dataset.a; row.innerHTML=grid(); top.innerHTML=hero(); };
    box.querySelector('[data-x]').onclick=()=>box.remove();
    box.onclick=e=>{ if(e.target===box) box.remove(); };
    box.querySelector('[data-ok]').onclick=()=>{ setAvatar(cur); document.querySelectorAll('.avachip').forEach(c=>c.innerHTML=petSVG(cur,{head:true,size:38})); box.remove(); pal.mood('happy',1600); };
    document.body.appendChild(box); box.querySelector('[data-ok]').focus();
  }
  let muted=ls.get('esep_mute')!==0;                 // silent by default: 20 pupils in one classroom
  const isMuted=()=>muted;
  function toggleMute(){ muted=!muted; ls.set('esep_mute',muted?1:0); document.querySelectorAll('[data-mute]').forEach(b=>b.textContent=muted?'🔇':'🔊'); if(!muted) sound('ok'); }
  let actx=null;
  function sound(kind){ if(muted) return; try{
    actx=actx||new (window.AudioContext||window.webkitAudioContext)(); if(actx.state==='suspended') actx.resume();
    const t=actx.currentTime, notes=kind==='ok'?[[660,0],[880,.09]]:kind==='up'?[[523,0],[659,.09],[880,.18]]:[[220,0]];
    notes.forEach(([f,dt])=>{ const o=actx.createOscillator(), g=actx.createGain();
      o.type=kind==='no'?'triangle':'sine'; o.frequency.setValueAtTime(f,t+dt);
      if(kind==='no') o.frequency.exponentialRampToValueAtTime(120,t+dt+.22);
      g.gain.setValueAtTime(0,t+dt); g.gain.linearRampToValueAtTime(.16,t+dt+.02); g.gain.exponentialRampToValueAtTime(.001,t+dt+.3);
      o.connect(g); g.connect(actx.destination); o.start(t+dt); o.stop(t+dt+.32); });
  }catch(e){} }
  function langLinks(){ const L=lang();
    return `<span class="langsw">${L==='kk'?'<b>ҚАЗ</b>':'<a href="#" onclick="Core.setLang(\'kk\');return false">ҚАЗ</a>'} · ${L==='ru'?'<b>РУС</b>':'<a href="#" onclick="Core.setLang(\'ru\');return false">РУС</a>'}</span>`; }
  /* one-time note (in Russian) telling the pupil to switch the page with the browser's own translate button */
  function ruHint(){ if(lang()!=='ru'||!ls.get('esep_ruhint')) return;
    const d=document.createElement('div'); d.className='ruhint';
    d.innerHTML=`<span>Перевод разрешён. Нажмите значок перевода в адресной строке браузера (или «Перевести» в меню) и выберите русский.</span><button aria-label="жабу">✕</button>`;
    d.querySelector('button').onclick=()=>{ ls.del('esep_ruhint'); d.remove(); };
    const put=()=>document.body&&document.body.appendChild(d);
    if(document.body) put(); else document.addEventListener('DOMContentLoaded',put);
  }
  ruHint();
  /* one way to the database: POST /rest/v1/rpc/<fn>. Every esep_* function checks the token it is given. */
  async function rpc(fn,args){
    const r=await fetch(CFG.SB_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{'apikey':CFG.SB_KEY,'Content-Type':'application/json'},body:JSON.stringify(args||{})});
    const t=await r.text(); if(!r.ok){ const e=new Error(r.status+' '+t); e.status=r.status; throw e; } return t?JSON.parse(t):null;
  }

  /* ── answer comparison (numbers, decimals with , or ., fractions, mixed numbers) ── */
  const norm=s=>String(s??'').trim().replace(/\s+/g,' ').replace(',','.').replace(/\s*%$/,'').toLowerCase();
  function fracVal(s){ let m=String(s).match(/^(-?)(\d+)\s+(\d+)\/(\d+)$/); if(m){ const w=+m[2],n=+m[3],d=+m[4]; return d?(m[1]==='-'?-1:1)*(w+n/d):NaN; }
    m=String(s).match(/^(-?)(\d+)\/(\d+)$/); if(m){ const n=+m[2],d=+m[3]; return d?(m[1]==='-'?-1:1)*n/d:NaN; } return NaN; }
  function isCorrect(q,given){
    const a=norm(given), b=norm(q&&q.ans);
    if(!a||!b) return false; if(a===b) return true;
    const fa=fracVal(a), fb=fracVal(b); if(Number.isFinite(fa)&&Number.isFinite(fb)) return Math.abs(fa-fb)<1e-9;
    if(/^-?\d+(\.\d+)?$/.test(b)){ const m=a.match(/-?\d+(\.\d+)?/); if(m) return Math.abs(parseFloat(m[0])-parseFloat(b))<1e-9; }
    // Every number in the expected answer must match, in order. A bare parseFloat compared only the
    // LEADING number, so '3 қ. 5' was accepted for '3 қ. 1' and '4 × 9' for '4 × 6' — and runner.js
    // marks EVERY choice isCorrect accepts, so several options could light up green at once.
    const na=a.match(/-?\d+(\.\d+)?/g)||[], nb=b.match(/-?\d+(\.\d+)?/g)||[];
    return nb.length>0 && na.length===nb.length && na.every((v,i)=>Math.abs(parseFloat(v)-parseFloat(nb[i]))<1e-9);
  }

  /* ── session & state ── */
  let session=ls.get(SESSION_KEY);        // {id,name,klass,token}
  if(session&&!session.token){ session=null; ls.del(SESSION_KEY); }   // a session from before v1.1 has no token: log in once more
  let cache=ls.get(CACHE_KEY)||{queue:[],state:null,time:0};
  let ROUTE=null, STATE=null, dirty=false, syncTimer=null, syncing=false, t0=Date.now(), lastTick=Date.now();

  function routeState(){ if(!STATE[ROUTE]) STATE[ROUTE]={}; return STATE[ROUTE]; }
  function schedule(ms){ if(!syncTimer) syncTimer=setTimeout(syncNow,ms||2500); }
  const mineQ=()=>session?cache.queue.filter(e=>(e.sid||e.student_id)===session.id):[];   // a shared device may still hold another pupil's unsent events
  async function syncNow(){
    syncTimer=null; if(syncing||!session) return; syncing=true;
    try{
      if(dirty&&STATE){ dirty=false; STATE._t=STATE._t||Date.now(); const ok=await rpc('esep_save',{p_token:session.token,p_state:STATE,p_time_ms:Math.round(cache.time)}); if(ok===false) return expired();
        if(!dirty){ cache.dirty=false; ls.set(CACHE_KEY,cache); } }
      const batch=mineQ().slice(0,50);
      if(batch.length){ const n=await rpc('esep_events',{p_token:session.token,p_events:batch.map(e=>({t:e.t,ev:e.ev}))}); if(n===-1) return expired();
        cache.queue=cache.queue.filter(e=>!batch.includes(e)); ls.set(CACHE_KEY,cache); }
      setOnline(true);
    }catch(e){ dirty=true; setOnline(false); }
    syncing=false; if(dirty||mineQ().length) schedule(15000);
  }
  /* the server no longer knows this token (teacher reset the PIN, or 180 days idle): keep the unsent work in the cache and ask for the PIN again */
  function expired(){ syncing=false; dirty=true; session=null; ls.del(SESSION_KEY); location.reload(); }
  function setOnline(ok){ Core.online=ok; const el=document.getElementById('netdot'); if(el){ el.title=ok?'Байланыс бар':'Байланыс жоқ — деректер кейін жіберіледі'; el.style.background=ok?'var(--good,#2E9E5B)':'var(--bad,#CF4B3E)'; } }
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,10);
  /* ── a teacher's task while the pupil works on it (owner, 2026-09-28: «I keep doing questions, it never says it
     is finished, and there is no count») ─────────────────────────────────────────────────────────────────────
     The portal's task card opens a route with ?task=ST&tid=…&tn=<done so far>&to=<goal>&tk=answers|test&ts=<stations>.
     Core reads that once (before the route drops the parameters) into sessionStorage, shows a small pill
     «Тапсырма 3 / 20» on every question screen, counts what the SERVER would count — right answers on the task's
     stations, or stage tests passed there — and at the goal shows «Тапсырма орындалды!» with a way home. The
     server stays the judge: the portal reloads the real progress. */
  const task=(function(){ const KEY='esep_task_v1'; let t=null;
    try{ t=JSON.parse(sessionStorage.getItem(KEY)||'null'); }catch(e){}
    try{ const q=new URLSearchParams(location.search); if(q.get('tid')){
      t={id:+q.get('tid')||0,kind:q.get('tk')==='test'?'test':'answers',n:Math.max(0,+q.get('tn')||0),of:Math.max(1,+q.get('to')||1),
         stages:String(q.get('ts')||q.get('task')||'').split(',').filter(x=>/^[A-Z]{2}-\d{2}$/.test(x)),passed:[],done:false};
      sessionStorage.setItem(KEY,JSON.stringify(t)); } }catch(e){}
    const save=()=>{ try{ t?sessionStorage.setItem(KEY,JSON.stringify(t)):sessionStorage.removeItem(KEY); }catch(e){} };
    function draw(){ if(!document.body) return; let el=document.getElementById('taskpill');
      if(!t||t.done||!session){ if(el) el.remove(); return; }
      if(!el){ el=document.createElement('div'); el.id='taskpill'; el.setAttribute('role','status'); document.body.appendChild(el); }
      el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M8.5 11l2 2 4-4"/></svg><span>Тапсырма</span><b>${t.n} / ${t.of}</b><i style="width:${Math.round(100*t.n/t.of)}%"></i>`; }
    function finish(){ const box=document.createElement('div'); box.className='petpick taskdone'; box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
      box.innerHTML=`<div class="pk-card" style="text-align:center"><div class="pk-hero">${petSVG(null,{mood:'happy',size:110})}</div>
        <h2 style="margin:6px 0 4px">Тапсырма орындалды!</h2><p class="note" style="margin:0 0 14px">${t.of} / ${t.of} · мұғалімің көреді</p>
        <div class="row"><button type="button" class="btn plain" data-x>Тағы жаттығамын</button><a class="btn" href="${ROOT||'../'}">Басты бетке</a></div></div>`;
      box.querySelector('[data-x]').onclick=()=>box.remove(); document.body.appendChild(box); pal.mood('happy',2600); try{ sound('up'); }catch(e){} }
    function observe(ev){ if(!t||t.done||!ev||!t.stages.includes(ev.stage)) return;
      if(t.kind==='answers'&&ev.ev==='answer'&&ev.ok&&ev.mode!=='diag') t.n++;
      else if(t.kind==='test'&&ev.ev==='test'&&ev.pass&&!t.passed.includes(ev.stage)){ t.passed.push(ev.stage); t.n=t.passed.length; }
      else return;
      if(t.n>=t.of){ t.n=t.of; t.done=true; save(); draw(); setTimeout(finish,900); return; }
      save(); draw(); const left=t.of-t.n; if(t.kind==='answers'&&(left===5||left===1)) pal.say(left===1?'Тағы бір есеп!':'Тағы 5 есеп қалды!',1800); }
    return {draw,observe,active:()=>!!(t&&!t.done)};
  })();

  function pushEvent(e){ if(!session) return; try{ task.observe(e); }catch(err){} e.u=e.u||uid(); cache.queue.push({sid:session.id,t:new Date().toISOString(),ev:e}); if(cache.queue.length>3000) cache.queue.shift(); ls.set(CACHE_KEY,cache); schedule(); }
  /* Leaving the page: try to hand the unsent events over with a keep-alive request — but do NOT take them out of
     the queue. The browser never tells us whether such a request arrived, so the queue stays until a normal sync
     confirms it. Every event carries a random `u`; the server ignores a (pupil, u) it already has, so sending
     twice is harmless and sending zero times is impossible. */
  window.addEventListener('pagehide',()=>{ try{ if(!session) return; ls.set(CACHE_KEY,cache); let take=[], size=0;
    for(const e of mineQ()){ const n=new Blob([JSON.stringify(e)]).size+2; if(size+n>48000) break; take.push(e); size+=n; }   // a keep-alive body may not exceed 64 KiB
    if(take.length) fetch(CFG.SB_URL+'/rest/v1/rpc/esep_events',{method:'POST',keepalive:true,headers:{'apikey':CFG.SB_KEY,'Content-Type':'application/json'},
      body:JSON.stringify({p_token:session.token,p_events:take.map(e=>({t:e.t,ev:e.ev}))})}).catch(()=>{});
  }catch(e){} });
  setInterval(()=>{ const now=Date.now(); if(session&&document.visibilityState==='visible'&&now-lastTick<20000){ cache.time+=now-lastTick; if(ROUTE&&STATE){ const rs=routeState(); rs.time=(rs.time||0)+(now-lastTick); } } lastTick=now; },5000);
  setInterval(()=>{ if(session&&STATE){ dirty=true; schedule(10); } },60000);

  /* ── answers per calendar day (device-local date) — feeds the portal's daily goal and day streak.
     Lives in STATE._days = {'2026-09-21': 14, …}, so it follows the pupil across devices like the rest
     of the state. Only the last 60 days are kept. Skipped items ("Білмеймін" in the placement test) don't count. */
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function bumpDay(){ if(!STATE) return; const D=STATE._days||(STATE._days={}); const k=ymd(new Date()); D[k]=(D[k]||0)+1;
    const ks=Object.keys(D).sort(); while(ks.length>60) delete D[ks.shift()]; }

  /* ── login (rendered by core so routes never do it) ── */
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function loginUI(host,route){
    return new Promise(resolve=>{
      const known=ls.get('esep_known_v1')||{};
      host.innerHTML=`<div class="top"><div class="brand">Есеп жолы<small>Математика · 1–5 сынып</small></div><div class="who">${langLinks()}</div></div>
      <div class="card"><h1>Сәлем!</h1><p>Атыңды және 4 таңбалы PIN кодыңды жаз. Бірінші рет кірсең — PIN-ді өзің ойлап тап және есте сақта.</p>
      <input class="big" id="c_nm" placeholder="Аты-жөні (мысалы: Айгүл С.)" autocomplete="off">
      <div style="height:8px"></div><div class="row"><input class="big" id="c_pin" inputmode="numeric" maxlength="4" placeholder="PIN (4 сан)" autocomplete="off" style="flex:1"><select class="big" id="c_kl" style="flex:1"><option value="">Сынып (тек бірінші рет)</option></select></div>
      <div id="c_codebox" style="display:none"><div style="height:8px"></div><input class="big" id="c_code" placeholder="Мектеп коды" autocomplete="off" autocapitalize="off"></div>
      <div style="height:12px"></div><p class="note" style="margin:0 0 6px">Жолда сені кім ертіп жүреді?</p>
      <div class="avarow" id="c_ava">${AVATARS.map(a=>`<button type="button" class="ava${a===avatar()?' on':''}" data-a="${a}" aria-label="${petName(a)}">${petSVG(a,{head:true,size:38})}</button>`).join('')}</div>
      <div style="height:10px"></div><button class="btn wide" id="c_go">Кіру</button><p class="note" id="c_msg" style="margin-top:8px"></p>
      ${Object.keys(known).length?`<p class="note" style="margin-top:10px">Бұл құрылғыда бұрын кірген:</p><div class="row" id="c_known">${Object.values(known).map(k=>`<button class="btn ghost" data-id="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>`:''}
      ${ROOT?`<p class="note tlink"><a href="${ROOT}teacher/">Мұғалімсіз бе? Мұғалім беті →</a></p>`:''}
      </div>`;
      const $=id=>document.getElementById(id); const msg=t=>{ $('c_msg').textContent=t; };
      /* The class is chosen, never typed: one child's «5 БАРЫС» and another's «БАРЫС5» used to be two classes,
         which split every class board into groups of one. The list is the teacher's, from esep_classes(). */
      rpc('esep_classes',{}).then(list=>{ const sel=$('c_kl'); if(!sel||!Array.isArray(list)||!list.length) return;
        sel.innerHTML='<option value="">Сынып (тек бірінші рет)</option>'+klassOptions(list);   // an existing pupil\'s class is kept by the server (15_klass_lock.sql); only the teacher moves her
        const last=ls.get('esep_klass'); if(last&&list.indexOf(last)>=0) sel.value=last;
      }).catch(()=>{});
      async function go(){
        const name=($('c_nm').value||'').trim().replace(/\s+/g,' '), pin=($('c_pin').value||'').trim(), klass=($('c_kl').value||'').trim().toUpperCase();
        if(!name) return msg('Атыңды жаз.'); if(!/^\d{4}$/.test(pin)) return msg('PIN — 4 сан болу керек.');
        $('c_go').disabled=true; msg('Қосылып жатыр…');
        try{
          const r=await rpc('esep_login',{p_name:name,p_pin:pin,p_klass:klass,p_code:($('c_code').value||'').trim()});
          if(r&&r.error==='code'){ $('c_go').disabled=false; const first=$('c_codebox').style.display==='none'; $('c_codebox').style.display=''; $('c_code').focus();
            return msg(first?'Бұл атпен оқушы әлі жоқ. Бірінші рет кіріп тұрсаң — мұғалім айтқан мектеп кодын жаз. Бұрын кірген болсаң — атыңды дәл бұрынғыдай жаз.':'Мектеп коды дұрыс емес. Мұғалімнен сұра.'); }
          if(r&&r.error){ $('c_go').disabled=false;
            return msg(r.error==='pin'?'Бұл атпен оқушы бар, бірақ PIN басқа. PIN-ді тексер немесе атыңа тегіңнің әрпін қос.'
                      :r.error==='locked'?'Қате PIN тым көп терілді. 10 минуттан кейін қайтала немесе мұғалімге айт.'
                      :r.error==='klass'?'Сыныпты тізімнен таңда. Тізімде жоқ болса — мұғалімге айт.'
                      :'Атың мен 4 санды PIN-ді тексер.'); }
          finish(r.student,r.token);
        }catch(e){ console.error(e); $('c_go').disabled=false; msg('Қосылу мүмкін болмады. Интернетті тексер де, қайта бас.'); }
      }
      function finish(row,token){ session={id:row.id,name:row.name,klass:row.klass||'',token}; ls.set(SESSION_KEY,session); const kn=ls.get('esep_known_v1')||{}; kn[row.id]={id:row.id,name:row.name}; ls.set('esep_known_v1',kn); resolve(row); }
      $('c_ava').onclick=e=>{ const b=e.target.closest('button[data-a]'); if(!b) return; pickAva=b.dataset.a; ls.set('esep_ava',pickAva); $('c_ava').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); };
      $('c_go').onclick=go; $('c_pin').onkeydown=e=>{ if(e.key==='Enter') go(); }; $('c_kl').onchange=()=>ls.set('esep_klass',$('c_kl').value);
      /* "was here before" is a shortcut for typing the name — the PIN is still asked, so a classmate can't walk in */
      const kb=$('c_known'); if(kb) kb.onclick=e=>{ const b=e.target.closest('button'); if(!b) return; $('c_nm').value=b.textContent; $('c_pin').value=''; $('c_pin').focus(); msg('PIN кодыңды жаз.'); };
      setTimeout(()=>{ const i=$('c_nm'); if(i) i.focus(); },50);
    });
  }

  /* <option> list for a class <select>, grouped by year.
     The school has a Samuryq and a Qyran in grade 2 AND in grade 3, so four names that read almost alike sit
     in one list. The grade is the front of the name («2 SAMURYQ») — that is also where esep_board reads it
     from — so grouping needs no extra field: split on the leading digits. Classes without one (old free-text
     names) keep their place at the end, ungrouped. With a single group the <optgroup> is dropped: a school
     with one year does not need a heading saying so. */
  function klassOptions(list){
    const opt=k=>`<option value="${esc(k)}">${esc(k)}</option>`;
    const gr=k=>{ const m=/^\d+/.exec(k); return m?+m[0]:null; };
    const years=[...new Set(list.map(gr))].sort((a,b)=>(a==null?99:a)-(b==null?99:b));
    if(years.length<2) return list.map(opt).join('');
    return years.map(g=>{ const ks=list.filter(k=>gr(k)===g).map(opt).join('');
      return g==null?ks:`<optgroup label="${g}-сынып">${ks}</optgroup>`; }).join('');
  }

  /* ── public API ── */
  const Core={
    version:'1.0', online:true, student:null, config:CFG,
    isCorrect, esc, klassOptions,
    /** Ensure a logged-in student and load the full state. Renders the login card into #app when needed. */
    async login(){
      let row=null;
      let offline=false;
      if(session){ try{ row=await rpc('esep_resume',{p_token:session.token}); if(!row){ session=null; ls.del(SESSION_KEY); }
        /* The cached session was written at login and never refreshed, so a pupil placed in a class afterwards —
           by the teacher, or by esep_my_class — kept looking classless to this device until she logged out. The
           server's row is the truth about who she is; only the token is ours. */
        else if(row.klass!==session.klass||row.name!==session.name){ session=Object.assign({},session,{name:row.name,klass:row.klass||''}); ls.set(SESSION_KEY,session); }
      }catch(e){ offline=true; /* use cache */ } }
      if(!session){ const host=document.getElementById('app')||document.body; row=await loginUI(host); host.innerHTML=''; }
      Core.student=session;
      /* The tester account. A pupil named "tester" (any PIN, any class) gets every stage of
         every route unlocked and the placement test skipped, so the route can be inspected
         station by station without playing through it. It is a name, not a role in the
         database, so nothing else in the system has to know about it — and the name is shown
         in the top bar, so nobody mistakes a tester's full map for a child's progress. */
      Core.tester=/^\s*tester\s*$/i.test((session&&session.name)||'');
      /* Work done offline (or in the seconds before a reload) lives only in this device's cache. It used to be thrown
         away here, because the server row always won. Now the cache wins when — and only when — it holds UNSENT work
         (cache.dirty, persisted) of THIS pupil that is newer than the server's copy. A cache that was synced never
         wins, so a device with a fast clock cannot keep overruling the others. */
      const STASH='esep_stash_'+session.id;
      if(cache.state&&cache.sid&&cache.sid!==session.id){ if(cache.dirty) ls.set('esep_stash_'+cache.sid,{state:cache.state,time:cache.time}); cache.state=null; cache.dirty=false; }   // a classmate's unsent work: set aside for their next login here
      const stash=ls.get(STASH); const local=cache.state&&cache.sid===session.id?{state:cache.state,time:cache.time,unsent:!!cache.dirty}:stash?{state:stash.state,time:stash.time,unsent:true}:null;
      if(local&&local.unsent&&(!row||(local.state._t||0)>((row.state&&row.state._t)||0))){ STATE=local.state; dirty=true; schedule(row?10:15000); }   // still unsent: keep the flag alive across page loads
      else STATE=(row&&row.state)||(offline&&local?local.state:null)||{};
      if(row){ cache.time=Math.max(row.time_ms||0,local&&local.unsent?local.time||0:0); ls.del(STASH); }
      // migration: legacy WP state stored at top level (first trial version)
      if(!STATE.WP&&STATE.stages){ STATE.WP={diag:STATE.diag,stages:STATE.stages,nAns:STATE.nAns,nOk:STATE.nOk,nHint:STATE.nHint}; }
      if(pickAva||!STATE._ava){ STATE._ava=pickAva||avatar(); pickAva=null; dirty=true; schedule(); }
      cache.state=STATE; cache.sid=session.id; cache.dirty=dirty; ls.set(CACHE_KEY,cache);
      if(mineQ().length) schedule(800);   // events left over from an offline spell or a closed tab
      pal.mount();
      return {student:session,state:STATE};
    },
    /** Route entry: login (if needed) and return this route's state object. */
    async start(route){
      if(!/^[A-Z]{2}$/.test(route||'')) throw new Error('Core.start: route code must be two capital letters');
      ROUTE=route; await Core.login(); return routeState();
    },
    /** Read-only view of another route's state (for prerequisites / portal). */
    stateOf(route){ if(!STATE) return {}; return STATE[route]||{}; },
    /** Save this route's state (the object returned by start, mutated). */
    save(state){ if(!ROUTE||!STATE) return console.warn('Core.save before start'); if(state) STATE[ROUTE]=state; STATE._t=Date.now(); cache.state=STATE; cache.sid=session&&session.id; cache.dirty=true; ls.set(CACHE_KEY,cache); dirty=true; schedule(); },
    /** Record one final answer. Keeps per-route counters so the teacher list is cheap. */
    answer(a){
      if(!ROUTE) return console.warn('Core.answer before start');
      const miss=['stage','lvl','ok'].filter(k=>a[k]===undefined); if(miss.length) console.warn('Core.answer missing:',miss.join(','),a);
      const rs=routeState(); rs.nAns=(rs.nAns||0)+1; if(a.ok) rs.nOk=(rs.nOk||0)+1; rs.nHint=(rs.nHint||0)+(a.hints||0); rs.last=Date.now();
      if(a.stem) a.stem=String(a.stem).slice(0,200);
      if(!a.skip) bumpDay();
      pushEvent(Object.assign({ev:'answer',route:ROUTE},a)); Core.save();
    },
    event(e){ if(!ROUTE) return console.warn('Core.event before start'); pushEvent(Object.assign({route:ROUTE},e)); },
    async logout(){ const tok=session&&session.token; dirty=true;
      try{ await Promise.race([syncNow(),new Promise(r=>setTimeout(r,2500))]); if(tok) await Promise.race([rpc('esep_logout',{p_token:tok}),new Promise(r=>setTimeout(r,1500))]); }catch(e){}
      const unsent=dirty; session=null; Core.student=null; ls.del(SESSION_KEY);
      cache=unsent?Object.assign(cache,{dirty:true}):{queue:cache.queue,state:null,sid:null,dirty:false,time:0};   // couldn't reach the server: keep this pupil's state for their next login on this device
      ls.set(CACHE_KEY,cache); location.reload(); },
    /** Portal/teacher helpers (not for routes) */
    _rpc:rpc, _session:()=>session, _allState:()=>STATE,
    async _loadStateOnly(){ if(!session) return null; return await rpc('esep_resume',{p_token:session.token}); },
    /** Call one of the esep_* server functions as the logged-in pupil (the session token is added here). For core-owned pages
        such as the portal and challenge/ — routes keep to start/save/answer/event. Throws when offline or not logged in. */
    async call(fn,args){ if(!session) throw new Error('not logged in'); if(!/^esep_[a-z_]+$/.test(fn)) throw new Error('Core.call: esep_* only'); return rpc(fn,Object.assign({p_token:session.token},args||{})); },
    /** This week's class board (top five of my class, my place, class averages). null when offline / not logged in. */
    async board(){ if(!session) return null; try{ return await rpc('esep_board',{p_token:session.token}); }catch(e){ return null; } },
    /** Answers per day, {'YYYY-MM-DD': n} (a copy). For the portal. */
    days(){ return Object.assign({},(STATE&&STATE._days)||{}); }, ymd,
    lang, setLang, avatar, setAvatar, AVATARS, sound, isMuted, toggleMute,
    /** After a PASSED stage test: the button fills up like a fuse and, unless the pupil taps it first or has
        left the screen, goes back to the map by itself — where the map plays the pass (map.js · celebrate). */
    autoGo(btn,fn,ms){ if(!btn||typeof fn!=='function') return; ms=ms||2600; btn.classList.add('autogo'); btn.style.setProperty('--autogo',ms+'ms');
      let done=false; const go=()=>{ if(done) return; done=true; fn(); };
      const t=setTimeout(()=>{ if(btn.isConnected) go(); },ms); btn.addEventListener('click',()=>{ clearTimeout(t); done=true; },{once:true}); },
    /** three stars, the earned ones gold and popping in turn — the result card of a passed test */
    winStars(n){ const P='<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>';
      return `<div class="winstars" aria-label="${n} жұлдыз">${[0,1,2].map(k=>`<svg viewBox="0 0 24 24" class="${k<n?'on':''}" style="animation-delay:${.15+k*.18}s" aria-hidden="true">${P}</svg>`).join('')}</div>`; },
    /** the tasks the teacher gave this pupil (supabase/16_tasks.sql): [{id,route,stages,kind,goal,due,note,p:{n,of,done}}], or null
        when the server has no such function yet / offline — the page then simply shows no task card */
    async myTasks(){ if(!session) return null; try{ const r=await rpc('esep_my_tasks',{p_token:session.token}); return Array.isArray(r)?r:null; }catch(e){ return null; } },
    /** the site's home page (…/core/core.js → …/): for «home» buttons in screens that do not use Core.topbar */
    root:ROOT, homeSVG:HOME_SVG,
    pet:petSVG, petName, pickPet, petSay:(t,ms)=>pal.say(t,ms), petMood:(m,ms)=>pal.mood(m,ms), petOff:v=>pal.off(v),
    topbar(sub){ return `<div class="top">${ROOT&&!atHome()?`<a class="homebtn" href="${ROOT}" aria-label="Басты бет" title="Басты бет">${HOME_SVG}</a>`:''}<div class="brand">Есеп жолы<small>${esc(sub||'Математика · 1–5 сынып')}</small></div><div class="who">${session?`<b>${esc(session.name)}</b> <i id="netdot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--line);vertical-align:middle"></i><br>`:''}${langLinks()} · <button type="button" class="mutebtn" data-mute onclick="Core.toggleMute()" title="Дыбыс">${muted?'🔇':'🔊'}</button>${session?` · <a href="#" onclick="Core.logout();return false" class="muted">шығу</a>`:''}</div>${session?`<button type="button" class="avachip" onclick="Core.pickPet()" aria-label="Жолсерігің${petName()?': '+petName():''}. Ауыстыру">${petSVG(null,{head:true,size:38})}</button>`:''}</div>`; },
    /* topbar layout note: the avatar sits in normal flow (see .avachip) so a two-line route name can't collide with it */
  };
  window.Core=Core;
})();
