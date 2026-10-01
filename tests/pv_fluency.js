// The PV fluency ladder (pv/fluency.js): learn with the picture → ⚡ round, timed per fact → picture corrections.
// Real pv/ page, headless Chromium, an in-memory stand-in for the database (nothing reaches Supabase).
//   node tests/pv_fluency.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8773);
  const browser = await chromium.launch();
  async function open(state) { const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const page = await ctx.newPage(); const posted = [];
    await ctx.route(/supabase\.co/, r => { const q = r.request(); if (q.method() === 'GET' || /rpc\/esep_resume/.test(q.url())) { const row = { id: 's1', name: 'Сынақ О.', klass: '2А', state, time_ms: 0 }; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) }); }
      try { posted.push({ url: q.url(), body: JSON.parse(q.postData() || 'null') }); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: /esep_save/.test(q.url()) ? 'true' : /esep_events/.test(q.url()) ? '1' : 'null' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(() => localStorage.setItem('esep_session_v1', JSON.stringify({ id: 's1', name: 'Сынақ О.', klass: '2А', token: 'a'.repeat(48) })));
    const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto('http://localhost:8773/pv/'); await page.waitForSelector('#pvmap', { timeout: 15000 }); await page.waitForTimeout(300);
    return { page, ctx, errs, posted }; }
  const flu = page => page.evaluate(() => ({ phase: state.flu && state.flu.phase, lv: state.level, streak: state.streak, need: state.streakNeed, round: state.flu && state.flu.round && { i: state.flu.round.i, hits: state.flu.round.hits, misses: state.flu.round.misses.length, from: state.flu.round.qs.map(q => q.lv) }, fix: state.flu && state.flu.fix && { n: state.flu.fix.queue.length, i: state.flu.fix.i }, back: state.flu && state.flu.backToLearn, done: Object.keys(state.completed), head: (document.getElementById('qCount') || {}).textContent }));
  const fact = page => page.evaluate(() => { const s = [...document.querySelectorAll('.equation-row span')].map(x => x.textContent); const a = +s[0], b = +s[2]; return s[1] === '+' ? a + b : a - b; });
  const learnAnswer = async (page, ok) => { const a = await fact(page); await page.fill('#ans', String(ok ? a : a + 1)); await page.click('.equation-row .check-btn'); await page.waitForSelector('.next-btn'); await page.click('.next-btn'); await page.waitForTimeout(80); };
  const roundAnswer = async (page, mode) => { await page.waitForSelector('#fluGo:not([disabled])'); const a = await fact(page);
    if (mode === 'timeout') { await page.waitForSelector('#fluBar.out', { timeout: 9000 }); } else { await page.fill('#ans', String(mode === 'ok' ? a : a + 1)); await page.click('#fluGo'); }
    await page.waitForTimeout(mode === 'ok' ? 750 : 1550); };
  const events = posted => posted.filter(p => /esep_events/.test(p.url)).flatMap(p => (p.body && p.body.p_events) || []).map(x => x.ev || x);

  // ── 1 · the ladder is on the map; f1: learn → round → fix → pass (gate off) ──
  { const { page, ctx, errs, posted } = await open({ PV: { completed: { c1: true }, started: true, unlockedUpTo: 1, stages: {} } });
    const m = await page.evaluate(() => ({ tap: [...document.querySelectorAll('[data-stn]')].map(s => s.dataset.stn), n: document.querySelectorAll('.stn').length, order: LEVEL_ORDER.slice(0, 9).map(e => e.levelId) }));
    T('the map: 79 stations; c1 (PV-01) is followed by the fluency ladder (PV-77 current), the retired a1/s1 are off the ladder', m.n === 79 && m.tap[0] === 'PV-01' && m.tap[1] === 'PV-77' && JSON.stringify(m.order) === JSON.stringify(['c1','f1','f2','f3','f4','fs1','fs2','fs3','u1']), m);
    await page.evaluate(() => selectLevel('d1', 'f1')); await page.waitForSelector('.equation-row');
    let s = await flu(page);
    T('f1 opens in the learn phase: a run of 6 with the picture and the strategy card', s.phase === 'learn' && s.need === 6 && /0\/6/.test(s.head) && await page.locator('.flu-card').count() === 1 && await page.locator('.block-display svg').count() === 1, s);
    for (let i = 0; i < 5; i++) await learnAnswer(page, true);
    s = await flu(page); T('five right: still learning (5/6)', s.phase === 'learn' && s.streak === 5, s);
    await learnAnswer(page, true);
    await page.waitForSelector('#fluBar'); s = await flu(page);
    T('the sixth starts the ⚡ round: 10 facts, all from f1 (nothing passed yet), a bar and no picture', s.phase === 'round' && s.round.from.length === 10 && s.round.from.every(x => x === 'f1') && /⚡ 0\/10/.test(s.head) && await page.locator('.block-display').count() === 0, s);
    // 8 right, one wrong, one timed out
    for (let i = 0; i < 10; i++) await roundAnswer(page, i === 3 ? 'wrong' : i === 6 ? 'timeout' : 'ok');
    await page.waitForSelector('.flu-card'); s = await flu(page);
    T('8/10 with two misses → the fix phase: 4 picture questions per missed fact = 8', s.phase === 'fix' && s.fix.n === 8 && s.fix.i === 0 && /түзету 1\/8/.test(s.head) && await page.locator('.block-display svg').count() === 1, s);
    for (let i = 0; i < 8; i++) await learnAnswer(page, true);
    await page.waitForSelector('.next-btn, button.check-btn'); s = await flu(page);
    const txt = (await page.locator('#workspace').innerText()).replace(/\s+/g, ' ');
    T('after the corrections the result: ⚡ 8/10, seconds shown, gate off → level passed anyway', s.phase === 'done' && s.done.includes('f1') && /⚡ 8\/10/.test(txt) && /есепке алынбайды/.test(txt) && /Келесі деңгей/.test(txt), txt.slice(0, 300));
    await page.waitForTimeout(3200);   // core.js syncs its event queue 2.5 s after the last write
    const ev = events(posted); const round = ev.filter(e => e.ev === 'answer' && e.mode === 'test' && e.stage === 'PV-77');
    T('every round answer is logged as a test answer with its time; the timeout says so', round.length === 10 && round.every(e => typeof e.ms === 'number' && e.ms > 0) && round.filter(e => !e.ok).length === 2 && round.some(e => e.given === '(уақыт бітті)') && round.some(e => e.ok && e.ms < 5000), round.map(e => [e.ok, e.ms, e.given]));
    T('the learn and fix answers are logged as practice (6 + 8)', ev.filter(e => e.ev === 'answer' && e.mode === 'practice' && e.stage === 'PV-77').length === 14);
    T('…and the level is recorded as a stage test, 8/10, passed', ev.some(e => e.ev === 'test' && e.stage === 'PV-77' && e.ok === 8 && e.n === 10 && e.pass === true), ev.filter(e => e.ev === 'test'));
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 2 · gate on: a bad round fails, three misses send the pupil back to the pictures; f2 reviews f1 ──
  { const { page, ctx, errs } = await open({ PV: { completed: { c1: true, f1: true }, started: true, unlockedUpTo: 2, stages: {} } });
    await page.evaluate(() => { FLU.gate = true; selectLevel('d1', 'f2'); }); await page.waitForSelector('.equation-row');
    for (let i = 0; i < 6; i++) await learnAnswer(page, true); await page.waitForSelector('#fluBar');
    let s = await flu(page);
    T('f2 round: 6 facts of f2 and 4 from the passed f1 (cumulative review)', s.round.from.filter(x => x === 'f2').length === 6 && s.round.from.filter(x => x === 'f1').length === 4, s.round);
    for (let i = 0; i < 10; i++) await roundAnswer(page, i < 3 ? 'wrong' : 'ok');
    await page.waitForSelector('.flu-card'); s = await flu(page);
    T('three misses: 12 corrections and «back to the pictures» afterwards', s.phase === 'fix' && s.fix.n === 12 && s.back === true, s);
    for (let i = 0; i < 12; i++) await learnAnswer(page, true);
    await page.waitForSelector('button.check-btn'); s = await flu(page);
    const txt = (await page.locator('#workspace').innerText()).replace(/\s+/g, ' ');
    T('7/10 with the gate on: not passed, the button says «Суретпен жаттығу»', s.phase === 'done' && !s.done.includes('f2') && /⚡ 7\/10/.test(txt) && /Суретпен жаттығу/.test(txt) && !/Келесі деңгей/.test(txt), txt.slice(0, 300));
    await page.click('button.check-btn'); await page.waitForSelector('.equation-row'); s = await flu(page);
    T('…and it does: the learn phase again, run 0/6, picture back', s.phase === 'learn' && s.streak === 0 && /0\/6/.test(s.head) && await page.locator('.block-display svg').count() === 1, s);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 3 · gate on: 9/10 passes, the one miss is still corrected (4 questions), then «Келесі деңгей» ──
  { const { page, ctx, errs } = await open({ PV: { completed: { c1: true }, started: true, unlockedUpTo: 1, stages: {} } });
    await page.evaluate(() => { FLU.gate = true; selectLevel('d1', 'f1'); }); await page.waitForSelector('.equation-row');
    for (let i = 0; i < 6; i++) await learnAnswer(page, true); await page.waitForSelector('#fluBar');
    for (let i = 0; i < 10; i++) await roundAnswer(page, i === 5 ? 'wrong' : 'ok');
    await page.waitForSelector('.flu-card'); let s = await flu(page);
    T('one miss → 4 picture questions', s.phase === 'fix' && s.fix.n === 4, s);
    for (let i = 0; i < 4; i++) await learnAnswer(page, true);
    await page.waitForSelector('button.check-btn'); s = await flu(page);
    T('9/10 with the gate on: passed, f1 completed, next level offered', s.done.includes('f1') && /Келесі деңгей/.test(await page.locator('#workspace').innerText()), s);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 4 · the placement ladder asks the fluency levels their own facts ──
  { const { page, ctx, errs } = await open({ PV: { completed: {}, started: false, unlockedUpTo: 0, stages: {} } });
    const qs = await page.evaluate(() => ['f1', 'fs2', 'f20n', 'fsr', 'f87'].map(lv => genPlacementQ(lv)));
    T('placement questions for f1/fs2/f20n/fsr/f87 are their facts, not the fallback', qs.every(q => /^\d+ [+−] \d+ = \?$/.test(q.q) && Number.isInteger(q.answer)) && !qs.some(q => q.q === '1 + 1 = ?'), qs);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  await browser.close(); srv.close();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
