// Three pupils and a teacher, four browsers, two rooms on two different routes — real pages against a LOCAL throwaway
// Postgres as role anon.   node supabase/test/e2e_rooms.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const { Client, Pool } = require(process.env.PG_MODULE || 'pg');
const fs = require('fs'), path = require('path'), http = require('http');
const ROOT = path.join(__dirname, '..', '..'), DIR = path.join(__dirname, '..'), DB = 'esep_test_e2erm_' + Date.now();
const cfg = db => ({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const st = (...ids) => Object.fromEntries(ids.map(i => [i, { status: 'passed', level: 3, tests: [] }]));
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8769);
  const admin = new Client(cfg('postgres')); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = new Client(cfg(DB)); await pg.connect(); const pool = new Pool(Object.assign(cfg(DB), { max: 8 })); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  for (const f of ['test/00_baseline_guess.sql', '01_additive.sql', '02_lock.sql', '04_challenges.sql']) await file(f);
  await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  const anon = async (sql, args) => { const c = await pool.connect(); try { await c.query('set role anon'); return await c.query(sql, args); } finally { await c.query('reset role').catch(() => {}); c.release(); } };
  const STATES = { 'Айгүл С.': { AR: { diag: { placed: 'AR-01', t: 1 }, stages: st('AR-05', 'AR-07') }, FR: { diag: { placed: 'FR-01', t: 1 }, stages: st('FR-02', 'FR-03') } }, 'Ерасыл Т.': { AR: { stages: st('AR-05') } }, 'Дана К.': {} };
  const who = {}; for (const [n, k] of [['Айгүл С.', '3А'], ['Ерасыл Т.', '3А'], ['Дана К.', '4Б']]) { const r = (await anon(`select public.esep_login($1,'1111',$2) v`, [n, k])).rows[0].v; who[n] = { id: r.student.id, name: n, klass: k, token: r.token }; await pg.query(`update students set state=$2 where id=$1`, [r.student.id, JSON.stringify(STATES[n])]); }

  let slowStart = 0;
  const backend = async route => { const rq = route.request(), m = new URL(rq.url()).pathname.match(/^\/rest\/v1\/rpc\/(esep_[a-z_]+)$/); if (!m) return route.fulfill({ status: 401, body: '{}' });
    try { const args = JSON.parse(rq.postData() || '{}'), k = Object.keys(args);
      const r = await anon(`select public.${m[1]}(${k.map((x, i) => `${x.replace(/\W/g, '')} => $${i + 1}`).join(', ')}) v`, k.map(x => args[x] !== null && typeof args[x] === 'object' ? JSON.stringify(args[x]) : args[x]));
      if (m[1] === 'esep_room_start' && slowStart) await new Promise(z => setTimeout(z, slowStart));   // the reply to «Бастау» arrives AFTER the next poll has already seen 'running'
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.rows[0].v) }).catch(() => {});
    } catch (e) { return route.fulfill({ status: /does not exist/.test(e.message) ? 404 : 400, contentType: 'application/json', body: JSON.stringify({ message: e.message }) }).catch(() => {}); } };
  const browser = await chromium.launch(); const errs = [];
  const ctxOf = async (vp) => { const ctx = await browser.newContext({ viewport: vp || { width: 390, height: 860 }, deviceScaleFactor: 2 }); await ctx.route(/supabase\.co/, backend); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); return ctx; };
  const as = async n => { const ctx = await ctxOf(); await ctx.addInitScript(s => localStorage.setItem('esep_session_v1', JSON.stringify(s)), who[n]); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(n + ': ' + e.message)); return p; };
  const B = 'http://localhost:8769/'; const A = await as('Айгүл С.'), E = await as('Ерасыл Т.'), D = await as('Дана К.');
  const shot = (p, f) => p.screenshot({ path: path.join(__dirname, f), fullPage: true });
  // the answer key of a room, worked out the way every browser works it out: the route's own generator + the room's seed
  const keyOf = async (p, roomId) => { const r = (await pg.query(`select route, stage, seed, n from esep_private.rooms where id=$1`, [roomId])).rows[0];
    return p.evaluate(async ([route, stage, seed, n]) => { const m = await RoomRoutes.load(route); return RoomRoutes.sheet(m, route, stage, seed, n).map(q => ({ kind: q.kind, ans: String(q.ans), choices: q.choices, stem: q.stem })); }, [r.route, r.stage, r.seed, r.n]); };
  const answer = async (p, k, bad) => { if (k.kind === 'choice') { const v = bad ? k.choices.find(c => String(c) !== k.ans) : k.ans; await p.locator('.choice').filter({ has: p.locator(`xpath=self::*[@data-v=${JSON.stringify(String(v))}]`) }).first().click(); await p.click('#ansBtn'); } else { await p.fill('#ans', bad ? '0' : k.ans); await p.keyboard.press('Enter'); } };
  const playAll = async (p, K, wrong = 0) => { await p.waitForSelector('#qn', { timeout: 12000 }); const from = parseInt(await p.locator('#qn').innerText(), 10) - 1; for (let i = from; i < K.length; i++) { await p.waitForFunction(n => (document.getElementById('qn') || {}).textContent.trim().startsWith(n + ' /'), i + 1); await answer(p, K[i], i >= K.length - wrong); } };
  const roomId = async p => +new URL(p.url()).searchParams.get('id');

  await A.goto(B); await A.waitForSelector('.ring'); await A.waitForTimeout(500);
  T('before 05_rooms.sql is installed the portal shows no room card, and no errors', (await A.locator('#rooms').innerText()).trim() === '' && errs.length === 0, errs);
  await file('05_rooms.sql');
  await A.reload(); await A.waitForSelector('#roomGo');
  T('portal: «Жарыс бөлмесі» card with a button', /Жарыс бөлмесі/.test(await A.locator('#roomGo').innerText()) && (await A.locator('#roomGo a.btn').count()) === 1);

  // ── a pupil opens a room on a FRACTIONS station she has passed
  await A.click('#roomGo a.btn'); await A.waitForSelector('[data-new]');
  T('hub: a tab per route I have passed something in (AR, FR); the AR list has AR-05 but not the speed drill AR-07', JSON.stringify(await A.locator('[data-tab]').evaluateAll(b => b.map(x => x.dataset.tab))) === '["AR","FR"]'
    && JSON.stringify(await A.locator('[data-new]').evaluateAll(b => b.map(x => x.dataset.new))) === '["AR-05"]');
  await A.click('[data-tab="FR"]');
  T('…the FR tab lists FR-03 and FR-02 by their own names, with «6 есеп · 7 минут»', JSON.stringify(await A.locator('[data-new]').evaluateAll(b => b.map(x => x.dataset.new))) === '["FR-03","FR-02"]' && /6 есеп · 7 минут/.test(await A.locator('[data-new="FR-03"]').innerText()), await A.locator('.pick').innerText());
  await D.goto(B + 'room/'); await D.waitForSelector('#jcode');
  T('hub: a pupil who has passed nothing cannot host — but can come in by code', (await D.locator('[data-new]').count()) === 0 && /кодпен басқаның бөлмесіне кіре аласың/.test(await D.locator('#app').innerText()));
  await A.locator('[data-new="FR-03"]').click(); await A.waitForSelector('#rcode'); const code = (await A.locator('#rcode').innerText()).trim(); const rid = await roomId(A);
  T('lobby: a four-digit code, the station by name, «Бастау» disabled while alone', /^\d{4}$/.test(code) && await A.locator('#startBtn').isDisabled() && /Бөлшектер/.test(await A.locator('#app').innerText()), await A.locator('#app').innerText());
  await shot(A, 'room-lobby.png');

  // ── a classmate sees it on the portal; another class comes in by code
  let failed = 0; await E.context().route(/\/fr\/generate\.js/, r => failed++ < 2 ? r.fulfill({ status: 503, body: 'x' }) : r.continue());   // his first download of the generators fails — both tries of it
  await E.goto(B); await E.waitForSelector('#rooms .card');
  T('portal of a classmate: «Айгүл жарыс бөлмесін ашты» with the station\'s name + «Қосылу»', /Айгүл жарыс бөлмесін ашты/.test(await E.locator('#rooms').innerText()) && !/FR-03/.test(await E.locator('#rooms .card').first().innerText()), await E.locator('#rooms').innerText());
  await E.locator('#rooms a.btn', { hasText: 'Қосылу' }).click(); await E.waitForSelector('#rcode');
  T('…one tap and he is in the lobby, no code typed — and told he has not passed this station', (await E.locator('#rcode').innerText()).trim() === code && /Айгүл ашқан бөлме/.test(await E.locator('#app').innerText()) && /әлі өткен жоқсың/.test(await E.locator('#app').innerText()));
  await D.fill('#jcode', '0000'); await D.click('#jgo'); await D.waitForFunction(() => /жоқ/.test(document.getElementById('jmsg').textContent));
  T('wrong code: a plain message, still on the hub', (await D.locator('#jcode').count()) === 1);
  await D.fill('#jcode', code); await D.click('#jgo'); await D.waitForSelector('#rcode');
  await A.waitForFunction(() => document.querySelectorAll('.plist span').length === 3, null, { timeout: 8000 });
  T('the host sees all three names arrive; «Бастау» is live', !(await A.locator('#startBtn').isDisabled()) && /Ерасыл/.test(await A.locator('.plist').innerText()) && /Дана/.test(await A.locator('.plist').innerText()));

  // ── the race
  const K = await keyOf(A, rid);
  slowStart = 2600; await A.click('#startBtn');
  await Promise.all([A, E, D].map(p => p.waitForSelector('#cnt, #qt', { timeout: 8000 })));
  await Promise.all([A, E, D].map(p => p.waitForSelector('#qt', { timeout: 12000 })));
  const same = await Promise.all([A, E, D].map(p => p.locator('.quiz').evaluate(el => (el.querySelector('#qt').textContent + '|' + ((el.querySelector('.expr') || {}).textContent || '')).replace(/\s+/g, ' '))));
  slowStart = 0;
  T('the host plays although the reply to «Бастау» came late; a pupil whose first download of the generators failed plays too (a failure is not remembered)', failed >= 3 && (await A.locator('#qt').count()) === 1 && (await E.locator('#qt').count()) === 1, { failed });
  T('three browsers, one seed: the same first question on every screen — a fraction question, drawn by the route\'s own code', same[0] === same[1] && same[1] === same[2] && (await A.locator('.expr, .fig').count()) >= 1, same);
  await shot(E, 'room-play.png');
  await playAll(E, K, 0); await E.waitForSelector('text=Жауаптарың қабылданды');
  T('first to finish waits: «1 / 3 ойыншы аяқтады», his own score, no ranking yet', /1 \/ 3 ойыншы аяқтады/.test(await E.locator('#app').innerText()) && /сен 6 \/ 6/.test(await E.locator('#app').innerText()) && !/орын/.test(await E.locator('#app').innerText()), await E.locator('#app').innerText());
  // a reload in the middle of the race: she is back at the question she had reached, and the clock did not restart for her
  for (let i = 0; i < 2; i++) { await D.waitForFunction(n => document.getElementById('qn').textContent.trim().startsWith(n + ' /'), i + 1); await answer(D, K[i], false); }
  await D.reload(); await D.waitForSelector('#qt', { timeout: 12000 });
  T('reload mid-race: back at question 3 with the first two kept', /^3 \/ 6$/.test((await D.locator('#qn').innerText()).trim()) && (await D.locator('#marks i.ok').count()) === 2, await D.locator('#qn').innerText());
  await A.waitForTimeout(1200); await playAll(A, K, 0); await playAll(D, K, 3);
  await Promise.all([A, E, D].map(p => p.waitForSelector('.res', { timeout: 9000 })));
  const tE = await E.locator('#app').innerText(), tA = await A.locator('#app').innerText(), tD = await D.locator('#app').innerText();
  T('podium: Ерасыл won (6/6, fastest), Айгүл second, Дана third with 3/6', /Жеңдің!/.test(tE) && /сен 2 ойыншыдан оздың/.test(tE) && /2-орын!/.test(tA) && /3-орын!/.test(tD) && /3 \/ 6/.test(tD), { tE, tA, tD });
  T('stars: three for the winner; the missed questions come back for revision with their answers', /Саған 3 жұлдыз/.test(tE) && /Қайталап ал/.test(tD) && tD.includes('→ ' + K[5].ans) && !/Қайталап ал/.test(tE));
  await shot(D, 'room-podium.png');
  await E.goto(B + 'room/'); await E.waitForSelector('.rec');
  T('hub record: 1 жарыс · 1 жеңіс · озған адам 2', JSON.stringify(await E.locator('.rec b').allInnerTexts()) === '["1","1","1","2"]', await E.locator('.rec').innerText());

  // ── the teacher: ANY station (word problems here), the code on the board, every answer, what the class missed
  const tctx = await ctxOf({ width: 1100, height: 800 }); const P = await tctx.newPage(); P.on('pageerror', e => errs.push('teacher: ' + e.message));
  await P.goto(B + 'teacher/'); await P.fill('#tpin', 'мұғалім-құпиясы-2026'); await P.click('#tgo'); await P.waitForSelector('#roomEntry');
  await P.click('#roomEntry button'); await P.waitForSelector('#rnew');
  T('teacher: four routes to choose from; the station list follows the route', JSON.stringify(await P.locator('#rroute option').evaluateAll(o => o.map(x => x.value))) === '["AR","FR","TE","WP"]'
    && (await P.selectOption('#rroute', 'WP'), (await P.locator('#rstage option').count()) === 13));
  await P.selectOption('#rstage', 'WP-01'); await P.selectOption('#rkl', '3А'); await P.click('#rnew'); await P.waitForSelector('#rstart');
  const tcode = ((await P.locator('#roomView').innerText()).match(/\b\d{4}\b/) || [])[0];
  T('teacher opens a room on WP-01 (nobody has passed it): a big code, 5 questions · 8 minutes, «Бастау» disabled', /^\d{4}$/.test(tcode) && await P.locator('#rstart').isDisabled() && /5 есеп · 8 минут/.test(await P.locator('#roomView').innerText()), tcode);
  await shot(P, 'room-teacher-lobby.png');
  await A.goto(B); await A.waitForSelector('#rooms .card');
  T('class 3А sees «Мұғалім жарыс бөлмесін ашты» on the portal', /Мұғалім жарыс бөлмесін ашты/.test(await A.locator('#rooms').innerText()));
  await A.locator('#rooms a.btn', { hasText: 'Қосылу' }).click(); await A.waitForSelector('#rcode'); const trid = await roomId(A);
  await E.goto(B + 'room/?code=' + tcode); await E.waitForSelector('#rcode');
  T('pupils in the teacher\'s room have no «Бастау»', (await A.locator('#startBtn').count()) === 0 && /Мұғалім бастағанша күт/.test(await A.locator('#app').innerText()));
  await P.waitForFunction(() => { const b = document.getElementById('rstart'); return b && !b.disabled; }, null, { timeout: 8000 });
  const K2 = await keyOf(A, trid);
  await P.click('#rstart'); await A.waitForSelector('#qt', { timeout: 12000 }); await shot(A, 'room-play-wp.png');
  await playAll(A, K2, 2); await playAll(E, K2, 0);
  await P.waitForSelector('#roomView table', { timeout: 12000 }); const rank = await P.locator('#roomView').innerText();
  T('teacher gets the WHOLE ranking: Ерасыл 5/5 first, Айгүл 3/5 second — with what she typed and the right answers', /1\s+Ерасыл Т\.\s+5 \/ 5/.test(rank) && /2\s+Айгүл С\.\s+3 \/ 5/.test(rank) && rank.includes('(' + K2[4].ans + ')'), rank);
  T('…and «Сынып жиі қателескен есептер»: the two questions she missed, 1 / 2 wrong each; no device is flagged', /Сынып жиі қателескен есептер/.test(rank) && (rank.match(/1 \/ 2 қате/g) || []).length === 2 && (await P.locator('#roomView table .chip').count()) === 0, rank);
  await shot(P, 'room-teacher-ranking.png');
  // «← бөлмелер» while a poll is in the air must not bounce the teacher back into the room
  await P.click('text=Тағы бір бөлме'); await P.waitForSelector('#rnew'); await P.click('text=← тізім'); await P.waitForSelector('#roomEntry'); await P.waitForTimeout(2600);
  T('teacher: leaving the room views stays left (no stale poll repaints them)', (await P.locator('#roomEntry').count()) === 1 && (await P.locator('#roomView').count()) === 0);
  // a station whose questions are widgets of their own (kind:'custom', AR-31): the widget mounts in the room page and hands its value back
  const cust = await A.evaluate(async () => { const m = await RoomRoutes.load('AR'); const q = RoomRoutes.sheet(m, 'AR', 'AR-31', 5, 6)[0]; const el = document.createElement('div'); document.body.appendChild(el); let got; q.mount(el, v => { got = v; });
    const n = el.querySelectorAll('button,input').length; const b = el.querySelector('button'); if (b) b.click(); el.remove(); return { kind: q.kind, n, html: el.innerHTML.length > 20 }; });
  T('custom-widget stations work outside their route page too', cust.kind === 'custom' && cust.n > 0 && cust.html, cust);
  T('no page errors', errs.length === 0, errs);

  await browser.close(); srv.close(); await pool.end(); await pg.end(); await admin.query(`drop database ${DB}`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
