// The stage-test gate (core/map.js · Core.testGate): the test opens only when the practice says the pupil is ready.
// Real pages, headless Chromium, an in-memory stand-in for the database (nothing reaches Supabase).
//   node tests/gate.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const stage = (status, level = 1, extra = {}) => Object.assign({ status, level, streak: 0, wrong: 0, l3streak: 0, testUnlocked: false, tests: [], seenCard: true }, extra);
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8769);
  const browser = await chromium.launch();
  async function open(url, state, klass = '3А') { const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const page = await ctx.newPage();
    await ctx.route(/supabase\.co/, r => { const q = r.request(); if (q.method() === 'GET' || /rpc\/esep_resume/.test(q.url())) { const row = { id: 's1', name: 'Сынақ О.', klass, state, time_ms: 0 }; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(row) }); }
      return r.fulfill({ status: 200, contentType: 'application/json', body: /esep_save/.test(q.url()) ? 'true' : /esep_events/.test(q.url()) ? '1' : 'null' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(k => localStorage.setItem('esep_session_v1', JSON.stringify({ id: 's1', name: 'Сынақ О.', klass: k, token: 'a'.repeat(48) })), klass);
    const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto('http://localhost:8769/' + url); return { page, ctx, errs }; }
  const waitQ = page => page.waitForFunction(() => window._Q && !window._Q.done && document.querySelector('.choice,#ans'));
  async function answer(page, ok) { await waitQ(page);
    const v = await page.evaluate(ok => { const a = String(window._Q.q.ans); if (ok) return a; const c = [...document.querySelectorAll('.choice')].map(b => b.dataset.v).find(v => v !== a); return c || (a === '0' ? '1' : '0'); }, ok);
    if (await page.locator('#ans').count()) await page.fill('#ans', v); else await page.locator('.choice').evaluateAll((bs, a) => bs.find(b => b.dataset.v === a).click(), v);
    await page.click('#ansBtn'); await page.waitForTimeout(250);
    if (!ok && await page.locator('#retryMsg').count()) { // the free second try: give the same wrong answer again so the miss stands
      if (await page.locator('#ans').count()) await page.fill('#ans', v); else await page.locator('.choice').evaluateAll((bs, a) => { const b = bs.find(x => x.dataset.v === a && !x.disabled); (b || bs.find(x => !x.disabled)).click(); }, v);
      await page.click('#ansBtn'); await page.waitForTimeout(250); } }
  const next = async page => { await page.click('#nextBtn'); };
  const gate = page => page.evaluate(() => { const R = window.R || (window.Runner && window.Runner.state()); const st = R.stages[Object.keys(R.stages).find(k => R.stages[k].status === 'current')]; return Object.assign({ unlocked: st.testUnlocked, l3win: st.l3win, cool: st.cool }, Core.testGate(st)); });
  const card = async page => { await page.waitForSelector('.mapgo'); return { gold: await page.locator('.mapgo [data-test].gold').count(), grey: await page.locator('.mapgo button[disabled]').count(), greyText: await page.locator('.mapgo button[disabled]').first().innerText().catch(() => ''), sub: await page.locator('.mg-sub span').innerText() }; };

  // ── 1 · level 1: no test button at all ──
  { const seed = { 'FR-08': stage('passed'), 'FR-01': stage('current', 1) };
    const { page, ctx, errs } = await open('fr/', { FR: { diag: { placed: 'FR-01', t: 1 }, stages: seed } });
    const c = await card(page);
    T('level 1: the card offers practice only — no test button, not even a small one', c.gold === 0 && c.grey === 0 && /3-деңгейге/.test(c.sub), c);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 2 · level 3, nothing practised yet: a grey button that counts; the URL cannot skip the gate ──
  { const seed = { 'FR-08': stage('passed'), 'FR-01': stage('current', 3) };
    const { page, ctx, errs } = await open('fr/', { FR: { diag: { placed: 'FR-01', t: 1 }, stages: seed } });
    let c = await card(page);
    T('level 3, 0/8: the test button is grey and says «Тест · 0/8»', c.gold === 0 && c.grey === 1 && /0\/8/.test(c.greyText) && /8 дұрыс/.test(c.sub), c);
    T('a stage seeded with testUnlocked:false is shut (the old flag alone opens nothing)', !(await gate(page)).open);
    await page.evaluate(() => Runner.test('FR-01')); await page.waitForTimeout(300);
    T('calling the test directly bounces back to the map', await page.locator('.mapgo').count() === 1 && await page.locator('.choice,#ans').count() === 0);
    // 7 right, no hints → still shut; the 8th opens it
    await page.click('.mapgo [data-pr]'); for (let i = 0; i < 7; i++) { await answer(page, true); await next(page); }
    let g = await gate(page); T('seven clean answers: 7/8, still shut', g.wins === 7 && !g.open, g);
    await answer(page, true);
    g = await gate(page); T('the eighth opens the test — «Кезең тесті ашылды!» is shown and the state agrees', g.open && g.unlocked && /тесті ашылды/.test(await page.locator('#fb').innerText()) && await page.locator('#testBtn').count() === 1, g);
    await page.evaluate(() => Runner.home()); c = await card(page);
    T('…and the card now leads with the gold «Кезең тесті»', c.gold === 1 && c.grey === 0, c);
    // a hint on a right answer is a miss for the gate: 8 right + 1 hinted-right + 1 wrong = 8/10 still open; one more wrong → 7/10 shut
    await page.click('.mapgo [data-test]'); for (let i = 0; i < 10; i++) { await answer(page, i < 5); await page.waitForTimeout(900); }   // 5/10: fail
    await page.waitForFunction(() => /Әзірге өтпеді|Кезең өтілді/.test(document.body.innerText), null, { timeout: 20000 }); g = await gate(page);
    T('a failed test: 5 more practice answers are demanded (cool=5), the window is kept', g.cool === 5 && !g.open && g.wins === 8 && /тағы 5 есеп/.test(await page.locator('.card').innerText()), g);
    await page.click('#homeBtn'); c = await card(page);
    T('the card says so: grey «Тест · тағы 5 есеп»', c.grey === 1 && /тағы 5 есеп/.test(c.greyText) && /өтпеді/.test(c.sub), c);
    await page.click('.mapgo [data-pr]');
    for (let i = 0; i < 4; i++) { await answer(page, true); await next(page); } g = await gate(page); T('four answers later: cool=1, still shut', g.cool === 1 && !g.open, g);
    await answer(page, true); g = await gate(page); T('the fifth reopens it (window 10/10 ≥ 8)', g.cool === 0 && g.open, g);
    await next(page);
    // hints count as misses: use a hint, answer right → window entry 0
    await waitQ(page); await page.click('#hintBtn').catch(() => page.evaluate(() => nextHint())); await page.waitForTimeout(200); await answer(page, true);
    g = await gate(page); T('a right answer WITH a hint enters the window as a miss (9/10, still open)', g.wins === 9 && g.l3win[g.l3win.length - 1] === 0, g);
    await next(page); await answer(page, false); await next(page); await answer(page, false);
    g = await gate(page); T('two wrong ones push it to 7/10 → shut again (and the level dropped to 2)', !g.open && g.level === 2, g);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 3 · a saved stage that was unlocked under the old rule stays open once (migration) ──
  { const seed = { 'FR-08': stage('passed'), 'FR-01': stage('current', 3, { testUnlocked: true }) };
    const { page, ctx, errs } = await open('fr/', { FR: { diag: { placed: 'FR-01', t: 1 }, stages: seed } });
    const c = await card(page); const g = await gate(page);
    T('old testUnlocked:true (no window yet) → window seeded 8/8, the gold button is there', g.open && g.wins === 8 && c.gold === 1, { g, c });
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 4 · the teacher's task opens the test regardless ──
  { const seed = { 'FR-08': stage('passed'), 'FR-01': stage('current', 1) };
    const { page, ctx, errs } = await open('fr/?task=FR-01&test=1', { FR: { diag: { placed: 'FR-01', t: 1 }, stages: seed } });
    await waitQ(page);
    T('?task=FR-01&test=1 goes straight into the test on a level-1 pupil (the teacher chose it)', (await page.evaluate(() => window._Q.o.mode)) === 'test' && /1\/10/.test(await page.locator('.qmeta').innerText()));
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 5 · WP runs the same gate ──
  { const seed = { 'WP-01': stage('current', 3) };
    const { page, ctx, errs } = await open('wp/', { WP: { diag: { placed: 'WP-01', t: 1 }, stages: seed } });
    let c = await card(page); T('WP, level 3, 0/8: grey button', c.gold === 0 && c.grey === 1 && /0\/8/.test(c.greyText), c);
    await page.click('.mapgo [data-pr]'); for (let i = 0; i < 8; i++) { await answer(page, true); if (i < 7) await page.click('#fb .row .btn'); }
    const g = await page.evaluate(() => Core.testGate(R.stages['WP-01']));
    T('WP: eight clean answers open the test', g.open && g.wins === 8 && /тесті ашылды/.test(await page.locator('#fb').innerText()), g);
    T('no page errors', errs.length === 0, errs); await ctx.close(); }

  await browser.close(); srv.close();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
