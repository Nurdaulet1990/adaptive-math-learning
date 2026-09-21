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
      ['FR','Бөлшектер','fr/','live','3–5'],
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
  function setAvatar(e){ ls.set('esep_ava',e); if(STATE){ STATE._ava=e; dirty=true; schedule(); } }
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
  function pushEvent(e){ if(!session) return; e.u=e.u||uid(); cache.queue.push({sid:session.id,t:new Date().toISOString(),ev:e}); if(cache.queue.length>3000) cache.queue.shift(); ls.set(CACHE_KEY,cache); schedule(); }
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
      <div style="height:8px"></div><div class="row"><input class="big" id="c_pin" inputmode="numeric" maxlength="4" placeholder="PIN (4 сан)" autocomplete="off" style="flex:1"><select class="big" id="c_kl" style="flex:1"><option value="">Сынып…</option></select></div>
      <div id="c_codebox" style="display:none"><div style="height:8px"></div><input class="big" id="c_code" placeholder="Мектеп коды" autocomplete="off" autocapitalize="off"></div>
      <div style="height:12px"></div><p class="note" style="margin:0 0 6px">Жолда сені кім ертіп жүреді?</p>
      <div class="avarow" id="c_ava">${AVATARS.map(a=>`<button type="button" class="ava${a===avatar()?' on':''}" data-a="${a}">${a}</button>`).join('')}</div>
      <div style="height:10px"></div><button class="btn wide" id="c_go">Кіру</button><p class="note" id="c_msg" style="margin-top:8px"></p>
      ${Object.keys(known).length?`<p class="note" style="margin-top:10px">Бұл құрылғыда бұрын кірген:</p><div class="row" id="c_known">${Object.values(known).map(k=>`<button class="btn ghost" data-id="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>`:''}
      </div>`;
      const $=id=>document.getElementById(id); const msg=t=>{ $('c_msg').textContent=t; };
      /* The class is chosen, never typed: one child's «5 БАРЫС» and another's «БАРЫС5» used to be two classes,
         which split every class board into groups of one. The list is the teacher's, from esep_classes(). */
      rpc('esep_classes',{}).then(list=>{ const sel=$('c_kl'); if(!sel||!Array.isArray(list)||!list.length) return;
        sel.innerHTML='<option value="">Сынып…</option>'+list.map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join('');
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

  /* ── public API ── */
  const Core={
    version:'1.0', online:true, student:null, config:CFG,
    isCorrect, esc,
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
    topbar(sub){ return `<div class="top"><div class="brand">Есеп жолы<small>${esc(sub||'Математика · 1–5 сынып')}</small></div><div class="who">${session?`<b>${esc(session.name)}</b> <i id="netdot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--line);vertical-align:middle"></i><br>`:''}${langLinks()} · <button type="button" class="mutebtn" data-mute onclick="Core.toggleMute()" title="Дыбыс">${muted?'🔇':'🔊'}</button>${session?` · <a href="#" onclick="Core.logout();return false" class="muted">шығу</a>`:''}</div>${session?`<span class="avachip">${avatar()}</span>`:''}</div>`; },
    /* topbar layout note: the avatar sits in normal flow (see .avachip) so a two-line route name can't collide with it */
  };
  window.Core=Core;
})();
