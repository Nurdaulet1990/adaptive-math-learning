// The login card (core/core.js loginUI) with 18_login_klass.sql: the class is chosen on every login, never pre-filled.
// Real portal page, headless Chromium, an in-memory stand-in for the database (nothing reaches Supabase).
//   node tests/login_form.js
const { chromium } = require(process.env.PW_MODULE || 'playwright'); const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'); const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
(async () => {
  const srv = http.createServer((q, s) => { let f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    fs.readFile(f, (e, b) => e ? (s.writeHead(404), s.end()) : (s.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }), s.end(b))); }).listen(8780);
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } }); const calls = []; let reply = { error: 'klass_wrong' };
  await ctx.route(/supabase\.co/, r => { const q = r.request(); const fn = (q.url().match(/rpc\/(esep_[a-z_]+)/) || [])[1]; let body = null; try { body = JSON.parse(q.postData() || 'null'); } catch (e) {}
    calls.push({ fn, body });
    const ans = fn === 'esep_classes' ? ['2 SAMURYQ', '3 QYRAN'] : fn === 'esep_login' ? reply : null;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ans) }); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.addInitScript(() => { try { localStorage.setItem('esep_klass', '2 SAMURYQ'); } catch (e) {} });   // what an older page left behind on a classroom tablet
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:8780/'); await page.waitForSelector('#c_kl'); await page.waitForFunction(() => document.getElementById('c_kl').options.length > 1);
  T('the class list is there, and nothing is pre-filled from the last pupil on this device', (await page.inputValue('#c_kl')) === '' && /Сыныбың/.test(await page.locator('#c_kl option').first().innerText()));
  await page.fill('#c_nm', 'Аружан'); await page.fill('#c_pin', '1111'); await page.click('#c_go'); await page.waitForTimeout(300);
  T('no class chosen: «Сыныбыңды таңда.», and nothing is sent', /Сыныбыңды таңда/.test(await page.locator('#c_msg').innerText()) && !calls.some(c => c.fn === 'esep_login'));
  await page.selectOption('#c_kl', '3 QYRAN'); await page.click('#c_go'); await page.waitForFunction(() => /сыныбыңды тексер/.test(document.getElementById('c_msg').textContent));
  const sent = calls.find(c => c.fn === 'esep_login');
  T('the chosen class is sent with the name and PIN', sent && sent.body.p_klass === '3 QYRAN' && sent.body.p_name === 'Аружан');
  T('klass_wrong: the pupil is told to check her class, or add her surname\'s first letter if she is new', /сыныбыңды тексер[\s\S]*тегіңнің бірінші әрпін/.test(await page.locator('#c_msg').innerText()));
  reply = { error: 'klass_needed' }; await page.click('#c_go'); await page.waitForFunction(() => /^Сыныбыңды таңда\.$/.test(document.getElementById('c_msg').textContent));
  T('klass_needed from the server: «Сыныбыңды таңда.»', true);
  T('no page errors', errs.length === 0, errs);
  await browser.close(); srv.close();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
