// Competitions wait 25 minutes (Core.playLock, core/core.js): the first time in today starts the clock; until it runs
// out a pupil cannot open or join a classmate's room or a challenge — a room the TEACHER opened is open at any time.
// Real pages (portal, challenge/, room/), headless Chromium, an in-memory stand-in for the database (nothing reaches Supabase).
//   node tests/playlock.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const MIN = 60000, now = Date.now();
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = ymd(new Date()), YDAY = ymd(new Date(now - 86400000));
const passed = { status: 'passed', level: 3, streak: 0, wrong: 0, l3streak: 0, testUnlocked: true, tests: [{ t: now - 5 * 86400000, ok: 10, n: 10, pass: true }], seenCard: true };
/* one AR station passed (so a room can be opened) and today's review already done (so nothing else stands in the way) */
const base = inn => Object.assign({ AR: { diag: { placed: 'AR-03', t: now - 9 * 86400000 }, stages: { 'AR-03': passed } }, _review: { day: TODAY, items: [], per: 2, done: true, ok: 0, n: 0, t: null } }, inn ? { _in: inn } : {});
const ROOMS = { 7: { id: 7, code: '1234', route: 'AR', stage: 'AR-03', by_teacher: false, host_name: 'Ерасыл Т.', n: 2 }, 8: { id: 8, code: '5678', route: 'AR', stage: 'AR-03', by_teacher: true, host_name: '', n: 5 } };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8779);
  const browser = await chromium.launch();
  async function world(state, name = 'Сынақ О.') { const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const calls = []; let st = state;
    const answer = (fn, b) => {
      if (fn === 'esep_save') { if (b && b.p_state) st = b.p_state; return true; }
      if (fn === 'esep_events') return 1;
      if (fn === 'esep_ch_list') return { stars: 3, today: 0, limit: 3, incoming: [{ id: 5, from_name: 'Ерасыл Т.', table: 4 }], waiting: [], results: [] };
      if (fn === 'esep_ch_options') return { klass: '3А', mine: [4], classmates: [{ id: 's2', name: 'Ерасыл Т.', tables: [4] }] };
      if (fn === 'esep_ch_open') return { id: 5, table: 4, opp_name: 'Ерасыл Т.', items: [[4, 3], [4, 5], [4, 7], [4, 2], [4, 9], [4, 4], [4, 6], [4, 8], [4, 1], [4, 10]] };
      if (fn === 'esep_room_list') return { mine: null, open: [ROOMS[7], ROOMS[8]], can_host: [{ route: 'AR', stage: 'AR-03' }], record: {}, last: [] };
      if (fn === 'esep_room_join') return { id: b.p_code === '5678' ? 8 : 7 };
      if (fn === 'esep_room_leave') return true;
      if (fn === 'esep_room_state') { const r = ROOMS[b.p_id]; return { status: 'lobby', route: r.route, stage: r.stage, code: r.code, by_teacher: r.by_teacher, is_host: false, host_name: r.host_name, n_items: 10, secs: 180, n: r.n, players: ['Ерасыл Т.', 'Сынақ О.'] }; }
      return null; };
    await ctx.route(/supabase\.co/, r => { const q = r.request(); let body = null; try { body = JSON.parse(q.postData() || 'null'); } catch (e) {}
      if (q.method() === 'GET' || /rpc\/esep_resume/.test(q.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 's1', name, klass: '3А', state: st, time_ms: 0 }) });
      const fn = (q.url().match(/rpc\/(esep_[a-z_]+)/) || [])[1]; calls.push({ fn, body });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(answer(fn, body)) }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(k => localStorage.setItem('esep_session_v1', JSON.stringify({ id: 's1', name: k, klass: '3А', token: 'a'.repeat(48) })), name);
    const errs = [];
    const open = async url => { const page = await ctx.newPage(); page.on('pageerror', e => errs.push(url + ': ' + e.message)); await page.goto('http://localhost:8779/' + url); await page.waitForTimeout(900); return page; };
    return { ctx, calls, open, errs, state: () => st }; }
  const txt = async p => (await p.locator('#app').innerText()).replace(/\s+/g, ' ');

  // ── 1 · first time in today: everything competitive waits ──
  { const W = await world(base(null));
    let p = await W.open('#jarys'); await p.waitForSelector('#duel .card', { timeout: 10000 }); await p.waitForSelector('#rooms .card', { timeout: 10000 });
    await p.waitForTimeout(3000); const st = W.state();   // saved with the next sync (2.5 s)
    T('the first entry of the day is stamped and saved (STATE._in: today, now)', st._in && st._in.day === TODAY && Math.abs(st._in.t - Date.now()) < 60000, st._in);
    const lock = await p.evaluate(() => Core.playLock());
    T('Core.playLock: about 25 minutes', lock > 24 * MIN && lock <= 25 * MIN, lock);
    const t = await txt(p);
    T('the portal\'s Жарыс tab says when: «… 25 минуттан кейін ашылады (HH:MM)»', /25 минуттан кейін ашылады \(\d\d:\d\d\)/.test(t) && (await p.locator('#plock').count()) === 1, t.slice(0, 300));
    T('portal: the challenge waiting for me has no «Қабылдау» button', (await p.locator('a[href^="challenge/?id="]').count()) === 0);
    T('portal: the classmate\'s room has no «Қосылу», the teacher\'s room has', (await p.locator('a[href="room/?code=1234"]').count()) === 0 && (await p.locator('a[href="room/?code=5678"]').count()) >= 1);
    await p.close();

    p = await W.open('challenge/'); await p.waitForSelector('#newBtn');
    T('challenge/: «Жаңа жарыс» is disabled, the time is shown, no «Қабылдау»', await p.locator('#newBtn').isDisabled() && /минуттан кейін ашылады/.test(await p.locator('#lockNote').innerText()) && (await p.locator('a[href="?id=5"]').count()) === 0);
    await p.close();
    p = await W.open('challenge/?id=5'); await p.waitForTimeout(300);
    T('challenge/?id=5 (straight link): «Жарыс әлі жабық», and the challenge is NOT opened on the server', /Жарыс әлі жабық/.test(await txt(p)) && !W.calls.some(c => c.fn === 'esep_ch_open'), W.calls.map(c => c.fn));
    await p.close();

    p = await W.open('room/'); await p.waitForSelector('#jcode');
    T('room/: no station to open a room from, the lock is said instead', (await p.locator('[data-new]').count()) === 0 && /минуттан кейін ашылады/.test(await p.locator('#lockNote').innerText()));
    T('room/: the classmate\'s open room cannot be joined, the teacher\'s can', (await p.locator('[data-code="1234"]').count()) === 0 && (await p.locator('[data-code="5678"]').count()) === 1);
    await p.fill('#jcode', '1234'); await p.click('#jgo'); await p.waitForSelector('#jcode'); await p.waitForTimeout(800);
    T('room/: the classmate\'s code typed in → straight out again (esep_room_leave), with the reason', W.calls.some(c => c.fn === 'esep_room_leave' && c.body.p_id === 7) && /минуттан кейін ашылады/.test(await p.locator('#jmsg').innerText()) && (await p.locator('#rcode').count()) === 0, await p.locator('#jmsg').innerText());
    await p.close();
    const nLeave = W.calls.filter(c => c.fn === 'esep_room_leave').length;
    p = await W.open('room/?code=5678'); await p.waitForSelector('#rcode', { timeout: 8000 });
    T('room/?code= of the TEACHER\'s room: in the lobby, not sent away', (await p.locator('#rcode').innerText()) === '5678' && W.calls.filter(c => c.fn === 'esep_room_leave').length === nLeave);
    await p.close();
    T('no page errors', W.errs.length === 0, W.errs);
    await W.ctx.close(); }

  // ── 2 · in for 26 minutes: everything open ──
  { const W = await world(base({ day: TODAY, t: now - 26 * MIN }));
    let p = await W.open('challenge/'); await p.waitForSelector('#newBtn');
    T('26 minutes in: «Жаңа жарыс» enabled, «Қабылдау» there, no lock note', !(await p.locator('#newBtn').isDisabled()) && (await p.locator('a[href="?id=5"]').count()) === 1 && (await p.locator('#lockNote').count()) === 0);
    await p.close();
    p = await W.open('room/'); await p.waitForSelector('#jcode'); await p.waitForTimeout(500);
    T('26 minutes in: a room can be opened and the classmate\'s room joined', (await p.locator('[data-new]').count()) >= 1 && (await p.locator('[data-code="1234"]').count()) === 1);
    await p.close();
    p = await W.open('#jarys'); await p.waitForSelector('#duel .card', { timeout: 10000 });
    T('26 minutes in: the portal has no lock card, «Қабылдау» is back', (await p.locator('#plock').count()) === 0 && (await p.locator('a[href^="challenge/?id="]').count()) >= 1);
    await p.close();
    T('the stamp is not moved by later visits the same day', W.state()._in.t === now - 26 * MIN);
    T('no page errors', W.errs.length === 0, W.errs);
    await W.ctx.close(); }

  // ── 3 · a stamp from yesterday does not count; the lock lifts by itself; the tester is never held ──
  { const W = await world(base({ day: YDAY, t: now - 20 * 3600000 }));
    const p = await W.open('challenge/'); await p.waitForSelector('#newBtn');
    T('yesterday\'s first entry: a new stamp today, locked again', await p.locator('#newBtn').isDisabled() && (await p.evaluate(() => Core._allState()._in.day)) === new Date().toLocaleDateString('sv'));
    await p.close(); await W.ctx.close(); }
  { const W = await world(base({ day: TODAY, t: Date.now() - 25 * MIN + 3000 }));
    const p = await W.open('challenge/'); await p.waitForSelector('#newBtn');
    const before = await p.locator('#newBtn').isDisabled(); await p.waitForTimeout(4500);
    T('the page opens by itself when the 25 minutes are up (no reload by the pupil)', before && !(await p.locator('#newBtn').isDisabled()), before);
    await p.close(); await W.ctx.close(); }
  { const W = await world(base(null), 'tester');
    const p = await W.open('challenge/'); await p.waitForSelector('#newBtn');
    T('the tester account is not held', !(await p.locator('#newBtn').isDisabled()) && (await p.evaluate(() => Core.playLock())) === 0);
    await p.close(); await W.ctx.close(); }

  await browser.close(); srv.close();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
