// The daily review (review/, Core.reviewPlan in core/core.js): compulsory, once a day, from the stations passed.
// Real pages, headless Chromium, an in-memory stand-in for the database that keeps what the pages save (nothing reaches Supabase).
//   node tests/review.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const passed = t => ({ status: 'passed', level: 3, streak: 0, wrong: 0, l3streak: 0, testUnlocked: true, tests: [{ t, ok: 9, n: 10, pass: true }], seenCard: true });
const cur = () => ({ status: 'current', level: 1, streak: 0, wrong: 0, l3streak: 0, testUnlocked: false, tests: [], seenCard: true });
const DAY = 86400000, now = Date.now();
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8776);
  const browser = await chromium.launch();
  async function world(state, name = 'Сынақ О.') { const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const posted = []; let st = state;
    await ctx.route(/supabase\.co/, r => { const q = r.request(); let body = null; try { body = JSON.parse(q.postData() || 'null'); } catch (e) {}
      if (q.method() === 'GET' || /rpc\/esep_resume/.test(q.url())) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 's1', name, klass: '3А', state: st, time_ms: 0 }) });
      if (/esep_save/.test(q.url()) && body && body.p_state) st = body.p_state;
      posted.push({ url: q.url(), body }); return r.fulfill({ status: 200, contentType: 'application/json', body: /esep_save/.test(q.url()) ? 'true' : /esep_events/.test(q.url()) ? '1' : 'null' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.addInitScript(k => localStorage.setItem('esep_session_v1', JSON.stringify({ id: 's1', name: k, klass: '3А', token: 'a'.repeat(48) })), name);
    const open = async url => { const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto('http://localhost:8776/' + url); await page.waitForTimeout(600); return { page, errs }; };
    return { ctx, posted, open, state: () => st }; }
  const S = { AR: { diag: { placed: 'AR-02', t: now - 20 * DAY }, stages: { 'AR-02': passed(now - 20 * DAY), 'AR-03': passed(now - 12 * DAY), 'AR-04': passed(now - 2 * DAY), 'AR-05': cur() } },
    FR: { diag: { placed: 'FR-08', t: now - 9 * DAY }, stages: { 'FR-08': passed(now - 9 * DAY), 'FR-01': passed(now - 1 * DAY), 'FR-04': cur() } },
    PV: { diag: { placed: 'PV-77', t: now - 5 * DAY }, started: true, completed: { c1: true, f1: true, f2: true }, stages: { 'PV-01': passed(now - 5 * DAY), 'PV-77': passed(now - 5 * DAY), 'PV-78': passed(now - 4 * DAY), 'PV-79': cur() } } };

  // ── 1 · the gate: a route shows the review instead of its map; the plan is five stations, the long-unvisited first ──
  { const W = await world(JSON.parse(JSON.stringify(S)));
    let { page, errs } = await W.open('fr/'); await page.waitForSelector('.card');
    const txt = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
    T('fr/: today\'s review stands in front of the map — «Бүгінгі қайталау», 10 есеп, 5 станция, a «Бастау» link to review/', /Бүгінгі қайталау/.test(txt) && /10 есеп/.test(txt) && /5 станциядан/.test(txt) && (await page.locator('.mapbox').count()) === 0 && /review\/$/.test(await page.locator('a.btn.gold').getAttribute('href')), txt.slice(0, 200));
    const plan = await page.evaluate(() => Core.reviewPlan());
    T('the plan: 5 of the 7 passed stations, AR-02 (20 days ago) first, FR-01 (yesterday) and AR-04 (2 days) left out; PV-01 (no facts) never', plan.items.length === 5 && plan.items[0].stage === 'AR-02' && !plan.items.some(i => i.stage === 'FR-01' || i.stage === 'AR-04' || i.stage === 'PV-01') && plan.items.some(i => i.route === 'PV'), plan.items);
    T('no page errors', errs.length === 0, errs); await page.close();
    // ── 2 · the review itself ──
    ({ page, errs } = await W.open('review/')); await page.waitForSelector('.quiz', { timeout: 15000 });
    const n = await page.evaluate(() => RV.qs.length), who = await page.evaluate(() => RV.qs.map(q => q.route + ' ' + q.stage));
    T('review/: 10 questions, two per station, drawn by the routes\' own generators and the PV facts', n === 10 && new Set(who).size === 5 && who.filter(w => /^PV/.test(w)).length === 4, who);
    let timed = 0;
    for (let i = 0; i < n; i++) { await page.waitForFunction(i => RV.rec.length === i && document.querySelector('.choice,#ans,#custom'), i);
      const q = await page.evaluate(() => { const q = RV.qs[RV.rec.length]; return { kind: q.kind, ans: String(q.ans), route: q.route, limit: q.limit, choices: q.choices }; });
      if (q.limit) timed++;
      const wrong = i === 0;   // the very first one wrong, the rest right
      if (q.kind === 'choice') { const v = wrong ? q.choices.find(c => String(c) !== q.ans) : q.ans; await page.locator('.choice').evaluateAll((bs, v) => bs.find(b => b.dataset.v === String(v)).click(), v); await page.click('#ansBtn'); }
      else if (q.kind === 'input') { await page.fill('#ans', wrong ? q.ans + '1' : q.ans); await page.click('#ansBtn'); }
      else { await page.evaluate(() => RV.qs[RV.rec.length].mount && null); await page.waitForTimeout(100); }
      await page.waitForFunction(i => RV.rec.length === i + 1, i); }
    await page.waitForSelector('.res'); const txt2 = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
    T('the PV facts (two stations × two) ran with a time bar', timed === 4, timed);
    T('the result: 9 / 10, the station with the miss marked «жартылай» 1 / 2, five rows', /9 \/ 10/.test(txt2) && /жартылай 1 \/ 2/.test(txt2) && (await page.locator('.res').count()) === 5, txt2.slice(0, 300));
    await page.waitForTimeout(3200);
    const st = W.state(); const rv = st._review; const ev = W.posted.filter(p => /esep_events/.test(p.url)).flatMap(p => (p.body && p.body.p_events) || []).map(x => x.ev || x).filter(e => e.ev === 'answer' && e.mode === 'review');
    T('saved: the plan is done 9/10, the missed station remembers 1/2, the others 2/2', rv && rv.done && rv.ok === 9 && rv.n === 10 && Object.values(st).some(s => s && s.stages && Object.values(s.stages).some(x => x.rv && x.rv.ok === 1 && x.rv.n === 2)), rv);
    T('every answer is logged as a review answer under its OWN route and station, with the time', ev.length === 10 && ev.every(e => /^(AR|FR|PV)$/.test(e.route) && /^(AR|FR|PV)-\d\d$/.test(e.stage) && typeof e.ms === 'number') && ev.filter(e => !e.ok).length === 1, ev.map(e => [e.route, e.stage, e.ok]));
    T('no page errors', errs.length === 0, errs); await page.close();
    // ── 3 · afterwards the map is back, and review/ says «done» ──
    ({ page, errs } = await W.open('fr/')); await page.waitForSelector('.mapbox', { timeout: 10000 });
    T('fr/ after the review: the map', (await page.locator('.mapbox').count()) === 1); await page.close();
    ({ page } = await W.open('review/')); await page.waitForSelector('.card');
    T('review/ again today: «орындалды», 9 / 10', /орындалды/.test(await page.locator('#app').innerText()) && /9 \/ 10/.test(await page.locator('#app').innerText())); await page.close();
    ({ page } = await W.open('')); await page.waitForSelector('#tasks', { state: 'attached', timeout: 10000 }); await page.waitForTimeout(400);
    T('the portal: «✓ Бүгінгі қайталау: 9/10», no review card', /✓ Бүгінгі қайталау: 9\/10/.test(await page.locator('#app').innerText()) && !/Бастау/.test((await page.locator('.tk').allInnerTexts()).join(' ')));
    await W.ctx.close(); }

  // ── 4 · too little passed → no review; a teacher's task and the tester are not gated ──
  { const W = await world({ AR: { diag: { placed: 'AR-02', t: now }, stages: { 'AR-02': passed(now - 3 * DAY), 'AR-03': passed(now - 2 * DAY), 'AR-04': cur() } } });
    let { page } = await W.open('ar/'); await page.waitForSelector('.mapbox', { timeout: 10000 });
    T('two passed stations: no review, the map opens', (await page.locator('.mapbox').count()) === 1 && (await page.evaluate(() => Core.reviewPending())) === false); await page.close();
    await W.ctx.close(); }
  { const W = await world({ AR: { diag: { placed: 'AR-05', t: now - 60000, manual: true }, stages: { 'AR-01': passed(now - 60000), 'AR-02': passed(now - 60000), 'AR-03': passed(now - 60000), 'AR-04': passed(now - 60000), 'AR-05': cur() } } });
    let { page } = await W.open('ar/'); await page.waitForSelector('.mapbox', { timeout: 10000 });
    T('placed by the teacher (or the diagnostic) today over four stations: nothing to review today, the map opens', (await page.locator('.mapbox').count()) === 1 && (await page.evaluate(() => Core.reviewPending())) === false); await page.close();
    await W.ctx.close(); }
  { const W = await world(JSON.parse(JSON.stringify(S)));
    let { page } = await W.open('fr/?task=FR-04'); await page.waitForSelector('.choice,#ans', { timeout: 10000 });
    T('a teacher\'s task opens the station straight away, review or not', true); await page.close();
    ({ page } = await W.open('')); await page.waitForSelector('.tk', { timeout: 10000 });
    T('the portal\'s Бүгін starts with the review card', /Бүгінгі қайталау/.test(await page.locator('.tk').first().innerText())); await page.close();
    await W.ctx.close(); }
  { const W = await world(JSON.parse(JSON.stringify(S)), 'tester');
    const { page } = await W.open('fr/'); await page.waitForSelector('.mapbox', { timeout: 10000 });
    T('the tester account is not gated', (await page.locator('.mapbox').count()) === 1); await page.close(); await W.ctx.close(); }

  await browser.close(); srv.close();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
