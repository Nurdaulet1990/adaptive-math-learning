/* Есеп жолы · core/core.js  v1.0
   Shared layer for every route: student session, per-route state, event logging, offline queue.
   Same API as core-stub.js. Routes never talk to the database directly.
   Owner: platform owner only. Do not edit from a route. */
(function(){
  'use strict';
  const CFG={
    SB_URL:'https://qcegfpzvyhohsbxweaif.supabase.co',
    SB_KEY:'sb_publishable_K489qSbIMCL7yXYrQwrDnQ_4LxZ1nkH',
    TEACHER_PIN:'1234',
    ROUTES:[ // code, Kazakh name, url (folder relative to repo root, or full url while a route is still hosted elsewhere), status, grades
      ['WP','Мәтінді есептер','wp/','live','1–5'],
      ['FR','Бөлшектер','fr/','live','3–5'],
      ['PV','Орын мәні','pv/','live','1–4'],
    ],
  };
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
  async function sb(path,opt={}){
    const r=await fetch(CFG.SB_URL+'/rest/v1/'+path,{method:opt.method||'GET',
      headers:Object.assign({'apikey':CFG.SB_KEY,'Content-Type':'application/json','Prefer':opt.prefer||(opt.method&&opt.method!=='GET'?'return=representation':'')},opt.headers||{}),
      body:opt.body!==undefined?JSON.stringify(opt.body):undefined});
    const t=await r.text(); if(!r.ok) throw new Error(r.status+' '+t); return t?JSON.parse(t):null;
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
    const na=parseFloat(a), nb=parseFloat(b); return Number.isFinite(na)&&Number.isFinite(nb)&&Math.abs(na-nb)<1e-9;
  }

  /* ── session & state ── */
  let session=ls.get(SESSION_KEY);        // {id,name,klass}
  let cache=ls.get(CACHE_KEY)||{queue:[],state:null,time:0};
  let ROUTE=null, STATE=null, dirty=false, syncTimer=null, syncing=false, t0=Date.now(), lastTick=Date.now();

  function routeState(){ if(!STATE[ROUTE]) STATE[ROUTE]={}; return STATE[ROUTE]; }
  function schedule(ms){ if(!syncTimer) syncTimer=setTimeout(syncNow,ms||2500); }
  async function syncNow(){
    syncTimer=null; if(syncing||!session) return; syncing=true;
    try{
      if(dirty&&STATE){ dirty=false; STATE._t=Date.now(); await sb(`students?id=eq.${session.id}`,{method:'PATCH',prefer:'return=minimal',body:{state:STATE,time_ms:Math.round(cache.time),last_seen:new Date().toISOString()}}); }
      if(cache.queue.length){ const batch=cache.queue.slice(0,50); await sb('events',{method:'POST',prefer:'return=minimal',body:batch}); cache.queue.splice(0,batch.length); ls.set(CACHE_KEY,cache); }
      setOnline(true);
    }catch(e){ dirty=true; setOnline(false); }
    syncing=false; if(dirty||cache.queue.length) schedule(15000);
  }
  function setOnline(ok){ Core.online=ok; const el=document.getElementById('netdot'); if(el){ el.title=ok?'Байланыс бар':'Байланыс жоқ — деректер кейін жіберіледі'; el.style.background=ok?'var(--good,#2E9E5B)':'var(--bad,#CF4B3E)'; } }
  function pushEvent(e){ if(!session) return; cache.queue.push({student_id:session.id,t:new Date().toISOString(),ev:e}); if(cache.queue.length>3000) cache.queue.shift(); ls.set(CACHE_KEY,cache); schedule(); }
  window.addEventListener('pagehide',()=>{ try{ if(!session) return; if(cache.queue.length){ navigator.sendBeacon(`${CFG.SB_URL}/rest/v1/events?apikey=${CFG.SB_KEY}`,new Blob([JSON.stringify(cache.queue)],{type:'application/json'})); cache.queue=[]; } ls.set(CACHE_KEY,cache); }catch(e){} });
  setInterval(()=>{ const now=Date.now(); if(session&&document.visibilityState==='visible'&&now-lastTick<20000){ cache.time+=now-lastTick; if(ROUTE&&STATE){ const rs=routeState(); rs.time=(rs.time||0)+(now-lastTick); } } lastTick=now; },5000);
  setInterval(()=>{ if(session&&STATE){ dirty=true; schedule(10); } },60000);

  /* ── login (rendered by core so routes never do it) ── */
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  function loginUI(host,route){
    return new Promise(resolve=>{
      const known=ls.get('esep_known_v1')||{};
      host.innerHTML=`<div class="top"><div class="brand">Есеп жолы<small>Математика · 1–5 сынып</small></div><div class="who">${langLinks()}</div></div>
      <div class="card"><h1>Сәлем!</h1><p>Атыңды және 4 таңбалы PIN кодыңды жаз. Бірінші рет кірсең — PIN-ді өзің ойлап тап және есте сақта.</p>
      <input class="big" id="c_nm" placeholder="Аты-жөні (мысалы: Айгүл С.)" autocomplete="off">
      <div style="height:8px"></div><div class="row"><input class="big" id="c_pin" inputmode="numeric" maxlength="4" placeholder="PIN (4 сан)" autocomplete="off" style="flex:1"><input class="big" id="c_kl" placeholder="Сынып (3А)" autocomplete="off" style="flex:1"></div>
      <div style="height:10px"></div><button class="btn wide" id="c_go">Кіру</button><p class="note" id="c_msg" style="margin-top:8px"></p>
      ${Object.keys(known).length?`<p class="note" style="margin-top:10px">Бұл құрылғыда бұрын кірген:</p><div class="row" id="c_known">${Object.values(known).map(k=>`<button class="btn ghost" data-id="${esc(k.id)}">${esc(k.name)}</button>`).join('')}</div>`:''}
      </div>`;
      const $=id=>document.getElementById(id); const msg=t=>{ $('c_msg').textContent=t; };
      async function go(){
        const name=($('c_nm').value||'').trim().replace(/\s+/g,' '), pin=($('c_pin').value||'').trim(), klass=($('c_kl').value||'').trim().toUpperCase();
        if(!name) return msg('Атыңды жаз.'); if(!/^\d{4}$/.test(pin)) return msg('PIN — 4 сан болу керек.');
        $('c_go').disabled=true; msg('Қосылып жатыр…');
        try{
          const rows=await sb(`students?select=id,name,pin,klass,state,time_ms&name=ilike.${enc(name)}`);
          let row=rows.find(r=>r.pin===pin);
          if(!row&&rows.length){ $('c_go').disabled=false; return msg('Бұл атпен оқушы бар, бірақ PIN басқа. PIN-ді тексер немесе атыңа тегіңнің әрпін қос.'); }
          if(!row){ const ins=await sb('students',{method:'POST',body:{name,pin,klass,state:{}}}); row=ins[0]; }
          else if(klass&&row.klass!==klass){ await sb(`students?id=eq.${row.id}`,{method:'PATCH',prefer:'return=minimal',body:{klass}}); row.klass=klass; }
          finish(row);
        }catch(e){ console.error(e); $('c_go').disabled=false; msg('Қосылу мүмкін болмады. Интернетті тексер де, қайта бас.'); }
      }
      function finish(row){ session={id:row.id,name:row.name,klass:row.klass||''}; ls.set(SESSION_KEY,session); const kn=ls.get('esep_known_v1')||{}; kn[row.id]={id:row.id,name:row.name}; ls.set('esep_known_v1',kn); resolve(row); }
      $('c_go').onclick=go; $('c_pin').onkeydown=e=>{ if(e.key==='Enter') go(); }; $('c_kl').onkeydown=e=>{ if(e.key==='Enter') go(); };
      const kb=$('c_known'); if(kb) kb.onclick=async e=>{ const b=e.target.closest('button'); if(!b) return; try{ const rows=await sb(`students?select=id,name,pin,klass,state,time_ms&id=eq.${b.dataset.id}`); if(rows.length) finish(rows[0]); else msg('Бұл оқушы базада жоқ.'); }catch(err){ msg('Қосылу мүмкін болмады.'); } };
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
      if(session){ try{ const rows=await sb(`students?select=id,name,klass,state,time_ms&id=eq.${session.id}`); row=rows[0]||null; if(!row){ session=null; ls.del(SESSION_KEY); } }catch(e){ /* offline: use cache */ } }
      if(!session){ const host=document.getElementById('app')||document.body; row=await loginUI(host); host.innerHTML=''; }
      Core.student=session;
      STATE=(row&&row.state)||cache.state||{}; if(row) cache.time=row.time_ms||0;
      // migration: legacy WP state stored at top level (first trial version)
      if(!STATE.WP&&STATE.stages){ STATE.WP={diag:STATE.diag,stages:STATE.stages,nAns:STATE.nAns,nOk:STATE.nOk,nHint:STATE.nHint}; }
      cache.state=STATE; ls.set(CACHE_KEY,cache);
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
    save(state){ if(!ROUTE||!STATE) return console.warn('Core.save before start'); if(state) STATE[ROUTE]=state; cache.state=STATE; ls.set(CACHE_KEY,cache); dirty=true; schedule(); },
    /** Record one final answer. Keeps per-route counters so the teacher list is cheap. */
    answer(a){
      if(!ROUTE) return console.warn('Core.answer before start');
      const miss=['stage','lvl','ok'].filter(k=>a[k]===undefined); if(miss.length) console.warn('Core.answer missing:',miss.join(','),a);
      const rs=routeState(); rs.nAns=(rs.nAns||0)+1; if(a.ok) rs.nOk=(rs.nOk||0)+1; rs.nHint=(rs.nHint||0)+(a.hints||0); rs.last=Date.now();
      if(a.stem) a.stem=String(a.stem).slice(0,200);
      pushEvent(Object.assign({ev:'answer',route:ROUTE},a)); Core.save();
    },
    event(e){ if(!ROUTE) return console.warn('Core.event before start'); pushEvent(Object.assign({route:ROUTE},e)); },
    logout(){ dirty=true; syncNow(); session=null; Core.student=null; ls.del(SESSION_KEY); cache={queue:cache.queue,state:null,time:0}; ls.set(CACHE_KEY,cache); location.reload(); },
    /** Portal/teacher helpers (not for routes) */
    _sb:sb, _session:()=>session, _allState:()=>STATE,
    async _loadStateOnly(){ if(!session) return null; const rows=await sb(`students?select=state,time_ms&id=eq.${session.id}`); return rows[0]||null; },
    lang, setLang,
    topbar(sub){ return `<div class="top"><div class="brand">Есеп жолы<small>${esc(sub||'Математика · 1–5 сынып')}</small></div><div class="who">${session?`<b>${esc(session.name)}</b> <i id="netdot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--line);vertical-align:middle"></i><br>`:''}${langLinks()}${session?` · <a href="#" onclick="Core.logout();return false" class="muted">шығу</a>`:''}</div></div>`; },
  };
  window.Core=Core;
})();
