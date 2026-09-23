// End-to-end rehearsal of the stars, with NO stand-in for any of our own code: the real core/core.js,
// the real pv/bridge.js wrapper and the real portal script run against a LOCAL Postgres carrying
// 01 + 04 + 05 + 06. Faked are only the browser (a small DOM, whose <script> tags really do load the
// file) and the legacy PV app's own functions, which bridge.js wraps.
//   node supabase/test/e2e_stars.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
// This is the companion of run_stars.js: that one pins the SQL, this one proves the three pieces meet —
// a stage test saved by core.js, a PV level written by the bridge, a room won on the server, and the
// portal painting one purse out of all three.
const { Client } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const SQL = f => fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
const JS  = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DB = 'esep_e2e_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? '  PASS' : '  FAIL', n, ok ? '' : JSON.stringify(x)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows)
    await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  await pg.query(SQL('test/00_baseline_guess.sql'));
  await pg.query(`insert into students(name,pin,klass) values ('Айгүл С.','1111','3А'),('Дана К.','3333','3А'),('Ерасыл Т.','2222','3А')`);
  for (const f of ['01_additive.sql','04_challenges.sql','05_rooms.sql','06_stars.sql','07_practice_stars.sql','09_my_stars.sql']) await pg.query(SQL(f));
  console.log('database ready: 01 + 04 + 05 + 06 + 07 + 09\n');

  let lock = Promise.resolve();                       // pg: one query at a time (the portal fires three RPCs at once)
  const serial = fn => (lock = lock.then(fn, fn));
  const asAnon = (sql, args) => serial(async () => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } });
  let calls = 0;
  const fetchShim = async (url, opt = {}) => {
    const m = /\/rest\/v1\/rpc\/([a-z_]+)/.exec(url); if (!m) throw new Error('unexpected url ' + url);
    calls++;
    const args = JSON.parse(opt.body || '{}'); const keys = Object.keys(args);
    await serial(() => pg.query(`select set_config('request.headers','{}',false)`));
    const r = await asAnon(`select public.${m[1]}(${keys.map((k,i)=>`${k} => $${i+1}`).join(', ')}) as v`,
      keys.map(k => typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k]));
    const body = JSON.stringify(r.rows[0].v);
    return { ok: true, status: 200, text: async () => body, headers: { get: () => null } };
  };
  const login = (name, pin) => fetchShim('/rest/v1/rpc/esep_login', { body: JSON.stringify({ p_name:name, p_pin:pin, p_klass:'', p_code:'' }) }).then(r=>r.text()).then(JSON.parse);

  function browser(session) {
    const store = {};
    if (session) store['esep_session_v1'] = JSON.stringify({ id: session.student.id, name: session.student.name, klass: session.student.klass || '', token: session.token });
    const els = {};
    const mk = id => ({ id, innerHTML:'', textContent:'', value:'', style:{}, className:'', dataset:{},
      querySelector:()=>null, querySelectorAll:()=>[], addEventListener(){}, appendChild(){}, remove(){},
      insertAdjacentHTML(){}, classList:{add(){},remove(){},toggle(){},contains:()=>false}, focus(){}, click(){} });
    const head = mk('head');
    head.appendChild = el => {                        // the real bridge.js loads core/map.js through a <script> tag
      if (el && el.src) {
        const f = String(el.src).replace(/\?.*$/, '').replace(/^\.\.\//, '');
        try { vm.runInContext(JS(f), ctx, { filename: f }); } catch (e) { console.log('    (script ' + f + ': ' + e.message + ')'); }
        setTimeout(() => el.onload && el.onload(), 0);
      }
    };
    const doc = { getElementById:id=>els[id]||(els[id]=mk(id)), querySelector:()=>null, querySelectorAll:()=>[],
      createElement:mk, head, documentElement:mk('html'), body:mk('body'), addEventListener(){}, removeEventListener(){} };
    let ctx; ctx = { console, JSON, Math, Date, Object, Array, String, Number, Boolean, Promise, Set, Map, RegExp, Error,
      setTimeout, clearTimeout, setInterval:()=>0, clearInterval:()=>{}, parseInt, parseFloat, isNaN,
      encodeURIComponent, decodeURIComponent, fetch: fetchShim,
      Blob: class { constructor(p){ this.size = Buffer.byteLength(String((p&&p[0])||'')); } },
      navigator: { sendBeacon: () => true }, location: { search:'', hash:'', reload(){} },
      localStorage: { getItem:k=>(k in store?store[k]:null), setItem:(k,v)=>{store[k]=String(v);}, removeItem:k=>{delete store[k];} },
      document: doc, els, store, addEventListener(){}, removeEventListener(){}, dispatchEvent(){} };
    ctx.window = ctx; vm.createContext(ctx);
    vm.runInContext(JS('core/core.js'), ctx, { filename:'core.js' });
    return ctx;
  }

  console.log('1 · a stage test is passed in AR, saved through the real core.js');
  const s1 = await login('Айгүл С.','1111');
  const b1 = browser(s1);
  const R = await b1.Core.start('AR');
  const mk = st => ({ status: st, level:3, streak:0, wrong:0, l3streak:0, testUnlocked:true, tests:[], seenCard:true });
  R.stages = { 'AR-01': mk('passed'), 'AR-02': mk('current') };
  R.diag = { t: Date.now(), placed:'AR-01', results:{}, n:6 };
  R.stages['AR-02'].tests.push({ t: Date.now(), ok:9, n:10, pass:true });
  b1.Core.save(R);
  await sleep(3200);
  let row = (await pg.query(`select state from students where name='Айгүл С.'`)).rows[0];
  T('the result reached the database through Core.save', !!(row.state.AR && row.state.AR.stages['AR-02'].tests.length === 1), row.state.AR);
  let board = await b1.Core.board();
  T('9/10 is two stars; the station the diagnostic handed out is worth none', board.me.n === 2, board.me);
  T('both of them count as this week', board.me.week === 2, board.me);

  console.log('\n2 · a PV level is finished — through the real pv/bridge.js');
  const s2 = await login('Дана К.','3333');
  const b2 = browser(s2);
  const LEVELS = ['c1','c20','ct10','c2','u1'];
  Object.assign(b2, {
    COMP_LVL: new Set(['u1']),
    LEVEL_ORDER: LEVELS.map(id => ({ moduleId:'m1', levelId:id })),
    // bridge.js asks pv/index.html for a station's number; the stand-in numbers its own short list
    stageNo: id => LEVELS.indexOf(id) + 1,
    MODULES: [{ id:'m1', name:'Санау', icon:'#', levels: LEVELS.map(id=>({id,name:id})) }],
    // streak/streakNeed/questionNum: since 2026-09-23 a PV level is passed by a RUN, and bridge.js reports
    // right answers over questions ASKED — so the stand-in state has to carry those, not questionsPerLevel.
    state: { level:null, module:null, score:0, questionsPerLevel:10, questionNum:0, streak:0, streakNeed:8,
             completed:{}, stars:0, unlockedUpTo:0, started:true, placement:null },
    saveProgress(){}, generateQuestion(){}, showVisualHint(){}, showFeedback(){}, showLevelComplete(){},
    finishPlacement(){}, startDiagnostic(){}, renderMain(){}, renderSidebar(){}, selectLevel(){}, isLevelUnlocked:()=>true,
  });
  vm.runInContext(JS('pv/bridge.js'), b2, { filename:'bridge.js' });
  await sleep(800);
  // a clean run: eight in a row, ten questions asked, ten right → 10/10 → three stars
  b2.state.level='c20'; b2.state.score=10; b2.state.questionNum=10; b2.state.streak=8; b2.state.streakNeed=8;
  b2.state.completed['c20']=true; b2.state.unlockedUpTo=2;
  b2.showLevelComplete({});
  // a Түсіну level: four in a row out of five asked → 4/5 = 0.8 → one star
  b2.state.level='u1'; b2.state.score=4; b2.state.questionNum=5; b2.state.streak=4; b2.state.streakNeed=4;
  b2.state.completed['u1']=true;
  b2.showLevelComplete({});
  await sleep(3200);
  row = (await pg.query(`select state from students where name='Дана К.'`)).rows[0];
  const pv = (row.state||{}).PV || {};
  T('PV wrote the level result into stages[].tests — the change itself',
    !!(pv.stages && pv.stages['PV-02'] && pv.stages['PV-02'].tests.length===1 && pv.stages['PV-02'].tests[0].ok===10), pv.stages && pv.stages['PV-02']);
  const board2 = await b2.Core.board();
  T('PV earns stars now: 10/10 → 3 and 4/5 → 1, four in all', board2.me.n === 4, board2.me);
  // PV's own home strip must print the SAME number. The legacy app keeps a `state.stars` on another
  // economy entirely (one per correct answer, three per level the placement skipped), and printing that
  // here meant the map said one thing and the portal another for the same child.
  b2.state.stars = 999;                              // whatever the legacy counter happens to hold
  b2.state.level = null; b2.renderMain();             // the bridge's wrapper draws the map when no level is open
  const strip = (b2.els.main && b2.els.main.innerHTML) || '';
  T('PV\'s map shows the platform star count, not the legacy one',
    /★ 4</.test(strip) && !/999/.test(strip), strip.slice(0, 300));

  console.log('\n3 · stars won against other children land in the same purse');
  const ids = Object.fromEntries((await pg.query(`select name, id::text from students`)).rows.map(r=>[r.name,r.id]));
  const rm = (await pg.query(`insert into esep_private.rooms(code,host_id,host_name,klass,status,created_at,started_at,ends_at,closed_at,route,stage,seed,n,secs)
     values ('4321',$1,'Дана','3А','done',now(),now(),now(),now(),'AR','AR-01',1,10,180) returning id`, [ids['Дана К.']])).rows[0].id;
  for (const [n, ok] of [['Дана К.',10],['Айгүл С.',6],['Ерасыл Т.',4]])
    await pg.query(`insert into esep_private.room_players(room_id,student_id,joined_at,ok,ms,done_at,total) values ($1,$2,now(),$3,1000,now(),10)`, [rm, ids[n], ok]);
  const board3 = await b2.Core.board();
  T('the room winner gets three more: 4 + 3 = 7', board3.me.n === 7, board3.me);
  const board1b = await b1.Core.board();
  T('second of three players is one star (fewer than four played): 2 + 1 = 3', board1b.me.n === 3, board1b.me);
  T('the board is ordered by the total (the third player was in that room too)',
    JSON.stringify(board3.top.map(x=>[x.name,x.n])) === JSON.stringify([['Дана К.',7],['Айгүл С.',3],['Ерасыл Т.',1]]), board3.top);

  console.log('\n4 · the portal page itself — real script, real state, real board');
  const portal = [...JS('index.html').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];
  const b3 = browser(await login('Дана К.','3333'));
  b3.RoomRoutes = { stageNames: async () => ({}) };
  vm.runInContext(portal, b3, { filename:'portal.js' });
  await sleep(1800);
  const txt = s => String(s).replace(/<[^>]+>/g,'|').replace(/\|+/g,' | ').replace(/\s+/g,' ').trim();
  const app = b3.els.app.innerHTML;
  const purseHTML = (/<a class="purse"[\s\S]*?<\/a>/.exec(app)||[''])[0];
  T('the purse is painted before the board answers (route stars only: 3 + 1 = 4)', /<b id="starTot">4<\/b>/.test(purseHTML), txt(purseHTML));
  T('the board then corrects it to the full total, 7', String(b3.els.starTot.textContent) === '7', b3.els.starTot.textContent);
  const brd = b3.els.board.innerHTML;
  T('the board card is in stars and shows the week gain', /★ жұлдыз/.test(brd) && /осы аптада \+7/.test(brd), txt(brd).slice(0,220));
  const feet = [...app.matchAll(/<div class="rt-foot">[\s\S]*?<\/div>/g)].map(m=>txt(m[0]));
  T('the PV route card carries its four stars', feet.some(s=>/★ 4/.test(s)), feet);

  // ── 5 · the purse must not depend on having a class ────────────────────
  console.log('\n5 · a pupil with no class still sees her stars');
  await pg.query(`update students set klass = '' where name = 'Дана К.'`);
  const b4 = browser(await login('Дана К.','3333'));
  b4.RoomRoutes = { stageNames: async () => ({}) };
  vm.runInContext(portal, b4, { filename:'portal.js' });
  await sleep(1800);
  T('the purse is filled from her own total, not from the board she cannot be on',
    String(b4.els.starTot.textContent) === '7', b4.els.starTot.textContent);
  T('and the board card stays empty, which is correct — there is no class to rank her in',
    !/Сынып тақтасы/.test(b4.els.board.innerHTML), txt(b4.els.board.innerHTML).slice(0,80));

  console.log(`\n(${calls} RPC calls went to the database)`);
  const failed = out.filter(x=>!x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end();
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(1); });
