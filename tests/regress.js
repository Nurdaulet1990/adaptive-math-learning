// Regression checks for bugs that stranded a pupil or marked right work wrong.
// Real pages, headless Chromium, an in-memory stand-in for the database (nothing reaches Supabase).
//   npm i playwright && node tests/regress.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const stage = (status, level = 1, extra = {}) => Object.assign({ status, level, streak: 0, wrong: 0, l3streak: 0, testUnlocked: false, tests: [], seenCard: true }, extra);
const stages = (pre, n, cur, lvl = 1) => { const o = {}; for (let i = 1; i <= n; i++) o[`${pre}-${String(i).padStart(2, '0')}`] = stage(i < cur ? 'passed' : i === cur ? 'current' : 'locked', i === cur ? lvl : 1); return o; };

(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8767);
  const browser = await chromium.launch();
  async function open(url, state) { const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const page = await ctx.newPage(); const posted = [];
    await ctx.route(/supabase\.co/, r => { const q = r.request(); if (q.method() === 'GET' || /rpc\/esep_resume/.test(q.url())) { const row = { id: 's1', name: 'Сынақ О.', klass: '3А', state, time_ms: 0 }; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(/rpc\//.test(q.url()) ? row : [row]) }); }
      try { posted.push(JSON.parse(q.postData() || 'null')); } catch (e) {} return r.fulfill({ status: 200, contentType: 'application/json', body: /esep_save/.test(q.url()) ? 'true' : /esep_events/.test(q.url()) ? '1' : 'null' }); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.addInitScript(() => localStorage.setItem('esep_session_v1', JSON.stringify({ id: 's1', name: 'Сынақ О.', klass: '3А', token: 'a'.repeat(48) })));
    const errs = []; page.on('pageerror', e => errs.push(e.message)); await page.goto('http://localhost:8767/' + url); return { page, ctx, errs, posted }; }
  // answer the question on screen correctly, whatever its kind
  async function right(page) { await page.waitForFunction(() => window._Q && !window._Q.done && document.querySelector('.choice,#ans'));
    const ans = await page.evaluate(() => String(window._Q.q.ans));
    if (await page.locator('#ans').count()) await page.fill('#ans', ans); else await page.locator('.choice').evaluateAll((bs, a) => bs.find(b => b.dataset.v === a).click(), ans);
    await page.click('#ansBtn'); }

  // ── 1 · AR ⚡ drill: after a failed round «Қайта бастау» must start a new round ──
  { const st = stages('AR', 41, 7, 2); const { page, ctx, errs } = await open('ar/', { AR: { diag: { placed: 'AR-07', t: 1 }, stages: st } });
    await page.locator('[data-pr]').first().click(); await page.waitForSelector('.sp-go'); await page.click('.sp-go');
    const fact = async () => { const t = await page.locator('.sp-q').innerText(); const m = t.match(/(\d+)\s*([×÷:])\s*(\d+)\s*=\s*(\d+|\?)/); return { a: +m[1], op: m[2], b: +m[3], shown: m[4] }; };
    const solve = f => f.op === '×' ? f.a * f.b : f.a / f.b;
    for (let guard = 0; guard < 80 && await page.locator('.sp-row').isVisible(); guard++) { const f = await fact();   // fail the round: always wrong first, then copy the shown answer
      await page.fill('.sp-in', f.shown === '?' ? '0' : f.shown); await page.click('.sp-ok'); await page.waitForTimeout(30); }
    const label = await page.locator('.sp-go').innerText();
    T('⚡ a failed round offers «Қайта бастау» and the runner keeps the question open (free second try)', /Қайта бастау/.test(label) && !(await page.evaluate(() => window._Q.done)), label);
    await page.click('.sp-go'); await page.waitForTimeout(150);
    T('⚡ «Қайта бастау» really starts a new round (it was a dead button)', await page.locator('.sp-row').isVisible() && /Мысал 1 \/ /.test(await page.locator('.sp-head').innerText()), await page.locator('.sp-head').innerText());
    for (let guard = 0; guard < 40 && await page.locator('.sp-row').isVisible(); guard++) { const f = await fact(); await page.fill('.sp-in', String(f.shown === '?' ? solve(f) : f.shown)); await page.click('.sp-ok'); await page.waitForTimeout(30); }
    await page.waitForSelector('#nextBtn');
    T('⚡ a clean second round is accepted and the pupil can go on', /Дұрыс/.test(await page.locator('#fb').innerText()) && await page.locator('.sp-go').isDisabled());
    T('⚡ no page errors', errs.length === 0, errs); await ctx.close(); }

  // ── 2 · hint step 4: finishing the guided steps must not submit a fragment of the answer ──
  for (const [sid, idx, expectAuto] of [['FR-05', 5, false], ['FR-06', 6, false], ['FR-07', 7, true]]) {
    const { page, ctx } = await open('fr/', { FR: { diag: { placed: sid, t: 1 }, stages: stages('FR', 7, idx, 3) } });
    await page.locator('[data-pr]').first().click(); await page.waitForSelector('#hintBtn');
    for (let i = 0; i < 4; i++) await page.click('#hintBtn');
    const steps = await page.evaluate(() => window._Q.q.steps.map(s => String(s.val)));
    for (const v of steps) { await page.waitForSelector('#gin'); await page.fill('#gin', v); await page.click('#gbtn'); }
    await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ done: window._Q.done, retry: !!document.getElementById('retryMsg'), fb: document.getElementById('fb').innerText, note: !!document.getElementById('guideDone'), ans: String(window._Q.q.ans) }));
    if (expectAuto) T(`${sid}: last step IS the answer → still submitted for the pupil, marked right`, s.done && /Дұрыс/.test(s.fb), s);
    else { T(`${sid}: every step right → NOT told «Қате», asked for the whole answer instead`, !s.done && !s.retry && s.note && !/Қате/.test(s.fb), s);
      await page.fill('#ans', s.ans); await page.click('#ansBtn'); await page.waitForSelector('#nextBtn');
      T(`${sid}: …and the whole answer is then accepted`, /Дұрыс/.test(await page.locator('#fb').innerText())); }
    await ctx.close(); }

  // ── 3 · re-passing an old station must not drag a later passed one back ──
  { const { page, ctx } = await open('fr/', { FR: { diag: { placed: 'FR-03', t: 1 }, stages: stages('FR', 7, 3, 1) } });
    await page.waitForSelector('.stn[data-stn="FR-01"] [data-go]', { state: 'attached' }); await page.evaluate(() => document.querySelector('.stn[data-stn="FR-01"] [data-go]').click());   // the bubble's own «Жаттығу» button
    for (let i = 0; i < 9; i++) { await right(page); await page.waitForSelector('#nextBtn'); if (i < 8) await page.click('#nextBtn'); }
    await page.click('#testBtn'); for (let i = 0; i < 10; i++) { await right(page); await page.waitForTimeout(750); }
    await page.waitForSelector('#homeBtn'); const stt = await page.evaluate(() => { const s = Runner.state().stages; return Object.keys(s).sort().map(k => s[k].status); });
    T('runner: re-passing FR-01 (for its stars) leaves FR-02 passed and FR-03 the only current', JSON.stringify(stt) === JSON.stringify(['passed', 'passed', 'current', 'locked', 'locked', 'locked', 'locked']), stt); await ctx.close(); }
  { const { page, ctx } = await open('wp/', { WP: { diag: { placed: 'WP-03', t: 1 }, stages: stages('WP', 13, 3, 1) } });
    await page.waitForFunction(() => typeof startTest === 'function' && document.querySelector('.stn')); await page.evaluate(() => startTest('WP-01'));
    for (let i = 0; i < 10; i++) { await page.waitForFunction(() => window._Q && !window._Q.done); await page.evaluate(() => { const q = window._Q.q; if (typeof answerInput === 'function' && document.getElementById('ans')) { document.getElementById('ans').value = String(q.ans); document.getElementById('ans').dispatchEvent(new Event('input')); } }); 
      if (await page.locator('#ans').count()) await page.click('#ansBtn'); else { await page.locator('.choice').evaluateAll((bs, a) => (bs.find(b => b.dataset.v === a) || bs[0]).click(), await page.evaluate(() => String(window._Q.q.ans))); if (await page.locator('#ansBtn').count()) await page.click('#ansBtn'); }
      await page.waitForTimeout(1450); }
    const stt = await page.evaluate(() => Object.keys(R.stages).sort().slice(0, 4).map(k => R.stages[k].status));
    T('wp engine: same — WP-02 stays passed, WP-03 stays the only current', JSON.stringify(stt) === JSON.stringify(['passed', 'passed', 'current', 'locked']), stt); await ctx.close(); }

  // ── 4 · PV: one verdict per question; the c20 placement item ──
  { const { page, ctx, posted } = await open('pv/', { PV: { started: true, completed: {}, stars: 0, unlockedUpTo: 0 } });
    await page.waitForFunction(() => typeof showFeedback === 'function' && typeof Core !== 'undefined' && Core.student);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => { let logged = 0; const a = Core.answer; Core.answer = function () { logged++; return a.apply(this, arguments); };
      selectLevel('d1', 'c1'); if (!document.getElementById('fb')) generateQuestion(); const s0 = state.score, n0 = state.questionNum; for (let i = 0; i < 10; i++) showFeedback(true); const one = { score: state.score - s0, num: state.questionNum - n0, logged };
      generateQuestion(); showFeedback(true); return { one, two: { score: state.score - s0, num: state.questionNum - n0, logged } }; });
    T('PV: ten taps on «Тексеру» count ONE answer (score, question number and the teacher log)', r.one.score === 1 && r.one.num === 1 && r.one.logged === 1, r.one);
    T('PV: the next question counts again', r.two.score === 2 && r.two.num === 2 && r.two.logged === 2, r.two);
    const bad = await page.evaluate(() => { let bad = 0; for (let i = 0; i < 3000; i++) { const q = genPlacementQ('c20'); const ones = +q.q.match(/және (\d+) бірлік/)[1]; if (q.answer !== 10 + ones) bad++; } return bad; });
    T('PV: «1 ондық және N бірлік» is always keyed 10 + N (n = 20 used to print N = 0 with key 20)', bad === 0, bad); await ctx.close(); }

  // ── 5 · WP-12-P01 answer key ──
  { const ctx = { window: {}, console }; vm.createContext(ctx); const core = fs.readFileSync(path.join(ROOT, 'core/core.js'), 'utf8');
    vm.runInContext(core.slice(core.indexOf('const norm='), core.indexOf('/* ── session & state')) + ';this.isCorrect=isCorrect;', ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'wp/bank.js'), 'utf8').replace(/^\s*const BANK/m, 'this.BANK'), ctx);
    const it = ctx.BANK.items.find(x => x.id === 'WP-12-P01'); const [hens, goats] = it.ans.match(/\d+/g).map(Number);
    T('WP-12-P01: the keyed answer satisfies the problem (14 heads, 44 legs) and the old key is rejected', hens + goats === 14 && 2 * hens + 4 * goats === 44 && ctx.isCorrect(it, '6 тауық, 8 лақ') && !ctx.isCorrect(it, '8 тауық, 6 лақ'), it.ans); }

  await browser.close(); srv.close(); const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
