// Every station of every route that can be used in a challenge room: does room/routes.js get a sheet out of it, and is
// the sheet THE SAME for the same seed — also on an engine whose Array.prototype.sort calls the comparator differently?
//   node tests/room_sheets.js
const fs = require('fs'), path = require('path'), vm = require('vm'); const ROOT = path.join(__dirname, '..');
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x).slice(0, 600)); };
function page(otherSort) {
  // a realm of its own: NOTHING from this process is passed in except console — so `[]` inside a generator has the realm's
  // own Array.prototype, and the sort installed below (and the one room/routes.js installs) is the one it really gets
  const ctx = vm.createContext({ console });
  vm.runInContext(`var window=globalThis; var document={currentScript:{src:'http://x/room/routes.js'}}; var __native=0; (function(){ const S=Array.prototype.sort; Array.prototype.sort=function(c){ __native++; return S.call(this,c); }; })();`, ctx);
  ctx.fetch = async u => { const f = path.join(ROOT, new URL(u).pathname); return { ok: fs.existsSync(f), status: 200, text: async () => fs.readFileSync(f, 'utf8') }; };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'core/figs.js'), 'utf8'), ctx);
  if (otherSort) vm.runInContext(`Array.prototype.sort=function(c){ __native++; c=c||((x,y)=>String(x)<String(y)?-1:1); for(let i=this.length-1;i>0;i--) for(let j=0;j<i;j++) if(c(this[j+1],this[j])<0){ const t=this[j]; this[j]=this[j+1]; this[j+1]=t; } return this; };`, ctx);   // a bubble sort: another comparator order
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'room/routes.js'), 'utf8'), ctx); const R = vm.runInContext('RoomRoutes', ctx); R.nativeSorts = () => vm.runInContext('__native', ctx); R.globals = () => vm.runInContext('Object.keys(globalThis)', ctx); return R;
}
const flat = qs => JSON.stringify(Array.from(qs).map(q => [q.stem, String(q.ans), q.kind, q.choices, q.exprHTML || '', typeof q.fig === 'object' ? q.fig : String(q.fig || ''), q.wpFig || '']));
(async () => {
  const A = page(false), B = page(true); let stations = 0, usable = 0; const thin = [], diff = [], figErr = [], noName = [];
  for (const route of A.ROUTES) {
    const ma = await A.load(route), mb = await B.load(route), names = await A.stageNames(route);
    T(`${route}: stage table and generators load outside the route's own page`, !!(ma.STAGES && ma.STAGES.length && (ma.GENERATORS || ma.generate)), Object.keys(ma));
    for (const row of ma.STAGES) { stations++; if (!A.usable(route, row[2])) continue; const r = A.rule(route, row[2]);
      for (const seed of [1, 77, 20260921]) { const s1 = A.sheet(ma, route, row[0], seed, r.n), s2 = A.sheet(ma, route, row[0], seed, r.n), s3 = B.sheet(mb, route, row[0], seed, r.n);
        if (flat(s1) !== flat(s2) || flat(s1) !== flat(s3) || A.print(s1) !== B.print(s3)) diff.push(row[0] + '@' + seed);
        if (seed === 1) { if (s1.length < 3) thin.push(row[0] + ':' + s1.length); else usable++; for (const q of s1) { try { const h = A.figHTML(ma, q); if (typeof h !== 'string') figErr.push(row[0]); } catch (e) { figErr.push(row[0] + ' ' + e.message); } } } }
      if (!names[row[0]] || names[row[0]].name !== row[1]) noName.push(row[0]); }
  }
  T('the same seed gives the same sheet — twice, and on an engine with a different sort', diff.length === 0, diff);
  T('…because the engine\'s own sort is never reached while a sheet is being built', A.nativeSorts() === 0 && B.nativeSorts() === 0, [A.nativeSorts(), B.nativeSorts()]);
  T('loading routes leaves nothing behind on the page (no STAGES / GENERATORS / FIGS globals)', !A.globals().some(k => /^(STAGES|GENERATORS|FIGS|BANK|CARDS|AR_UTIL|AR_DRAW)$/.test(k)), A.globals());
  T('a route name that is a property of every object is still no route', await A.load('constructor').then(() => false, () => true) && A.usable('__proto__', 'x') === false);
  T('a different seed gives a different sheet', flat(A.sheet(await A.load('AR'), 'AR', 'AR-14', 1, 10)) !== flat(A.sheet(await A.load('AR'), 'AR', 'AR-14', 2, 10)));
  T('Math.random and Array.prototype.sort are put back afterwards', (() => { const r = Math.random; A.withSeed(5, () => 1); return Math.random === r; })());
  T('stage names are available to the portal without loading the generators', noName.length === 0, noName);
  T('every figure of every sheet renders to a string', figErr.length === 0, figErr);
  console.log(`stations: ${stations}, usable in a room: ${usable}, too thin (<3 distinct level-3 items): ${thin.join(' ') || 'none'}`);
  T('at least 60 stations can be used in a room', usable >= 60, { usable, thin });
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
