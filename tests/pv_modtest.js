// The PV module test (pv/modtest.js): two questions from every level of the module, a miss reopens that level.
// Real pv/ page, headless Chromium, an in-memory stand-in for the database (nothing reaches Supabase).
//   node tests/pv_modtest.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const D1 = ['c1', 'f1', 'f2', 'f3', 'f4', 'fs1', 'fs2', 'fs3'];
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8775);
  const browser = await chromium.launch();
  const today = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  async function open(state) { const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const page = await ctx.newPage(); const posted = [];
    if (!state._review) state._review = { day: today(new Date()), items: [], per: 2, done: true, ok: 0, n: 0, t: null };   // today's review already done — otherwise the review gate (core.js) stands where the map should be
    await ctx.route(/supabase\.co/, r => { const q = r.request(); if (q.method() === 'GET' || /rpc\/esep_resume/.test(q.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 's1', name: 'Сынақ О.', klass: '2А', state, time_ms: 0 }) });
      try { posted.push({ url: q.url(), body: JSON.parse(q.postData() || 'null') }); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: /esep_save/.test(q.url()) ? 'true' : /esep_events/.test(q.url()) ? '1' : 'null' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(() => localStorage.setItem('esep_session_v1', JSON.stringify({ id: 's1', name: 'Сынақ О.', klass: '2А', token: 'a'.repeat(48) })));
    const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto('http://localhost:8775/pv/'); await page.waitForSelector('#pvmap', { timeout: 15000 }); await page.waitForTimeout(300);
    return { page, ctx, errs, posted }; }
  const done = obj => Object.fromEntries(Object.keys(obj).map(k => [k, true]));
  const mt = page => page.evaluate(() => ({ lv: state.level, mt: state.mt && { n: state.mt.qs.length, i: state.mt.i, per: state.mt.qs.reduce((o, q) => (o[q.lv] = (o[q.lv] || 0) + 1, o), {}), wrong: state.mt.wrong }, done: Object.keys(state.completed), up: state.unlockedUpTo, head: (document.getElementById('qCount') || {}).textContent }));
  const answerTest = async (page, wrongLv) => { const item = await page.evaluate(() => state.mt.qs[state.mt.i]); const ok = item.lv !== wrongLv;
    await page.fill('#ans', String(ok ? item.answer : item.answer + 1)); await page.click('#mtGo'); await page.waitForSelector('.next-btn'); await page.click('.next-btn'); await page.waitForTimeout(60); return item.lv; };

  // ── 1 · with a level of the module missing, the test is shut ──
  { const c = done({ c1: 1, f1: 1, f2: 1, f4: 1, fs1: 1, fs2: 1, fs3: 1 });   // f3 missing
    const { page, ctx, errs } = await open({ PV: { completed: c, started: true, unlockedUpTo: 3, stages: {} } });
    T('bridge: the position is the first gap in `completed` (f3, index 3), not the last done + 1', (await page.evaluate(() => state.unlockedUpTo)) === 3);
    await page.evaluate(() => selectLevel('d1', 'u1')); await page.waitForTimeout(200);
    const txt = (await page.locator('#main').innerText()).replace(/\s+/g, ' ');
    T('u1 refused: «Модуль тесті әлі жабық», the missing level named, a button to it', /әлі жабық/.test(txt) && /қос сандар, 10-ға толықтыру/.test(txt) && (await page.evaluate(() => state.level)) === null, txt.slice(0, 200));
    await page.click('.welcome .check-btn'); await page.waitForSelector('.equation-row');
    T('…which opens f3', (await page.evaluate(() => state.level)) === 'f3');
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 2 · all levels done: 16 questions, two per level; all right → passed ──
  { const { page, ctx, errs, posted } = await open({ PV: { completed: done(Object.fromEntries(D1.map(k => [k, 1]))), started: true, unlockedUpTo: 8, stages: {} } });
    await page.evaluate(() => selectLevel('d1', 'u1')); await page.waitForSelector('#mtGo'); let s = await mt(page);
    T('the module test: 16 questions, exactly two from each of the 8 levels, no picture, header «тест 1/16»', s.mt.n === 16 && Object.keys(s.mt.per).length === 8 && Object.values(s.mt.per).every(v => v === 2) && /тест 1\/16/.test(s.head) && await page.locator('.block-display').count() === 0, s);
    for (let i = 0; i < 16; i++) await answerTest(page, null);
    await page.waitForSelector('.next-btn, button.check-btn'); s = await mt(page);
    const txt = (await page.locator('#workspace').innerText()).replace(/\s+/g, ' ');
    T('all right: passed, u1 completed, «бәрі дұрыс», next level offered', s.done.includes('u1') && /16\/16 — бәрі дұрыс/.test(txt) && /Келесі деңгей/.test(txt), txt.slice(0, 200));
    await page.click('.next-btn'); await page.waitForTimeout(300);
    T('«Келесі деңгей» goes on to c20 (module 2)', (await page.evaluate(() => state.level)) === 'c20');
    await page.waitForTimeout(3200); const ev = posted.filter(p => /esep_events/.test(p.url)).flatMap(p => (p.body && p.body.p_events) || []).map(x => x.ev || x);
    T('the 16 answers are logged under PV-04 with the level each came from; the test is recorded 16/16 passed', ev.filter(e => e.ev === 'answer' && e.stage === 'PV-04' && e.mode === 'test').length === 16 && ev.some(e => e.ev === 'test' && e.stage === 'PV-04' && e.ok === 16 && e.pass), ev.filter(e => e.ev === 'test'));
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 3 · a miss on c1's questions reopens c1; after c1 is redone, «next» is the test again ──
  { const { page, ctx, errs } = await open({ PV: { completed: done(Object.fromEntries(D1.map(k => [k, 1]))), started: true, unlockedUpTo: 8, stages: {} } });
    await page.evaluate(() => selectLevel('d1', 'u1')); await page.waitForSelector('#mtGo');
    for (let i = 0; i < 16; i++) await answerTest(page, 'c1');
    await page.waitForSelector('button.next-btn'); let s = await mt(page);
    const txt = (await page.locator('#workspace').innerText()).replace(/\s+/g, ' ');
    T('two misses from c1: not passed, «Қайта өту керек: Санау (1–9)», c1 reopened, the position back at c1', /Әзірге өтпеді/.test(txt) && /14 \/ 16/.test(txt) && /Санау \(1–9\)/.test(txt) && !s.done.includes('c1') && !s.done.includes('u1') && s.up === 0, { txt: txt.slice(0, 200), s });
    await page.click('#pvback'); await page.waitForSelector('#pvmap'); await page.waitForTimeout(300);
    const cur = await page.evaluate(() => (document.querySelector('.stn.cur') || {}).dataset && document.querySelector('.stn.cur').dataset.stn);
    T('the map shows PV-01 as the current station again', cur === 'PV-01', cur);
    await page.evaluate(() => selectLevel('d1', 'c1')); await page.waitForSelector('#ans');
    for (let i = 0; i < 8; i++) { const a = +(await page.locator('.check-btn').first().getAttribute('onclick')).match(/checkAnswer\((\d+)\)/)[1]; await page.fill('#ans', String(a)); await page.click('.check-btn'); await page.waitForSelector('.next-btn'); await page.click('.next-btn'); await page.waitForTimeout(60); }
    await page.waitForSelector('.next-btn'); s = await mt(page);
    T('c1 redone: completed again, and the unlock skips the done levels straight to the test (position = u1, index 8)', s.done.includes('c1') && s.up === 8 && /Түсіну/.test(await page.locator('#workspace').innerText()), s);
    await page.click('.next-btn'); await page.waitForSelector('#mtGo'); s = await mt(page);
    T('«Келесі деңгей» opens the module test, not f1', s.lv === 'u1' && s.mt.n === 16, s);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 4 · the pupils who had passed the retired within-20 levels go back to where they were (owner, 2026-10-01) ──
  { const OLD = ['c1', 'a1', 'a1_n', 's1', 's1_n', 'u1', 'c20', 'pv20', 'a20n', 'a20n_n', 'a2', 'a2_n', 's20n', 's20n_n', 's20b', 's20b_n', 'u2', 'ct10', 'c2', 'p1', 'm1', 'a3', 'a3_n'];
    const { page, ctx, errs } = await open({ PV: { completed: done(Object.fromEntries(OLD.map(k => [k, 1]))), started: true, unlockedUpTo: 0, stars: 40, stages: {} } });
    const r = await page.evaluate(() => ({ cur: LEVEL_ORDER[state.unlockedUpTo].levelId, flu: [...FLU_LVL].every(l => state.completed[l]), stars: state.stars }));
    T('a pupil who had passed everything up to «100 ішінде · қосу, ауыссыз» is back on a4 (PV-17), not on f1 «+1»', r.cur === 'a4', r);
    T('…the 15 ladder rungs count as passed, and no stars are given for them', r.flu && r.stars === 40, r);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }
  { const { page, ctx } = await open({ PV: { completed: done({ c1: 1 }), started: true, unlockedUpTo: 1, stages: {} } });
    T('a pupil who had not reached the old within-10 levels still starts the ladder on f1', (await page.evaluate(() => LEVEL_ORDER[state.unlockedUpTo].levelId)) === 'f1'); await ctx.close(); }
  { const C = done(Object.fromEntries(['c1', 'a1', 's1', 'f1', 'f3', 'f4', 'fs1', 'fs2', 'fs3'].map(k => [k, 1])));   // f2 reopened by a module test AFTER the carry
    const { page, ctx } = await open({ PV: { completed: C, started: true, unlockedUpTo: 2, fluCarry: 1, stages: {} } });
    T('the carry happens once: a rung reopened later (f2) stays open', (await page.evaluate(() => LEVEL_ORDER[state.unlockedUpTo].levelId)) === 'f2'); await ctx.close(); }

  await browser.close(); srv.close();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
