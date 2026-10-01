/* pv/facts.js — the fact tables of PV's fluency ladder (claude/pv-fluency-proposal.md), on their own so that a page
   other than pv/ can ask for them: the daily review (review/) draws the facts of the stations a pupil has passed.
   Published as window.PVFACTS. Loaded by pv/index.html before fluency.js, and by review/index.html.
     PVFACTS.order        the 15 level ids in ladder order
     PVFACTS.stage[lv]    the station id (PV-77…) of a level; PVFACTS.level['PV-77'] the reverse
     PVFACTS.pick(lv)     one fact {a,b,op,ans,lv}; PVFACTS.distinct(lv,n,avoidSet) n different ones
     PVFACTS.limitMs(lv)  the ⚡ time per fact on that level (ms) */
(function(){
'use strict';
const rnd = (a,b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const add = pairs => pairs.flatMap(([a, b]) => a === b ? [{ a, b, op: '+' }] : [{ a, b, op: '+' }, { a: b, b: a, op: '+' }]);
const sub = pairs => pairs.map(([m, s]) => ({ a: m, b: s, op: '−' }));
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const key = f => `${f.a}${f.op}${f.b}`;
const ans = f => f.op === '+' ? f.a + f.b : f.a - f.b;
const F = {};
F.f1  = add(range(1, 9).map(n => [1, n]));
F.f2  = add(range(2, 8).map(n => [2, n]));
F.f3  = add([[3,3],[4,4],[5,5],[3,7],[4,6]]);
F.f4  = add([[3,4],[3,5],[3,6],[4,5]]);
F.fs1 = sub([...range(2, 10).map(m => [m, 1]), ...range(3, 10).map(m => [m, 2])]);
F.fs2 = sub([[6,3],[8,4],[10,5],[10,3],[10,7],[10,4],[10,6]]);
F.fs3 = sub(range(4, 9).flatMap(m => range(3, m - 1).map(s => [m, s])).filter(([m, s]) => !(m === 6 && s === 3) && !(m === 8 && s === 4)));
F.f20n = () => { if (Math.random() < 0.4) { const n = rnd(1, 9); return Math.random() < 0.5 ? { a: 10, b: n, op: '+' } : { a: n, b: 10, op: '+' }; }
  let a, b; do { a = rnd(11, 18); b = rnd(1, 8); } while (a % 10 + b > 9); return Math.random() < 0.5 ? { a, b, op: '+' } : { a: b, b: a, op: '+' }; };
F.fd  = add([[6,6],[7,7],[8,8],[9,9],[5,6],[6,7],[7,8],[8,9]]);
F.f9  = add([[2,9],[3,9],[4,9],[5,9],[6,9],[7,9]]);
F.f87 = add([[3,8],[4,8],[5,8],[6,8],[4,7],[5,7]]);
F.fs20n = () => { let a; do { a = rnd(11, 19); } while (a % 10 === 0); const b = rnd(1, a % 10); return { a, b, op: '−' }; };
F.fsd  = sub([[12,6],[14,7],[16,8],[18,9],[11,5],[11,6],[13,6],[13,7],[15,7],[15,8],[17,8],[17,9]]);
F.fs98 = sub([[11,9],[12,9],[13,9],[14,9],[15,9],[16,9],[11,8],[12,8],[13,8],[14,8]]);
F.fsr  = sub([[11,2],[11,3],[11,4],[11,7],[12,3],[12,4],[12,5],[12,7],[13,4],[13,5],[14,5],[14,6],[15,6],[16,7]]);
Object.keys(F).forEach(lv => { if (Array.isArray(F[lv])) F[lv].forEach(x => { x.ans = ans(x); }); });
const order = ['f1','f2','f3','f4','fs1','fs2','fs3','f20n','fd','f9','f87','fs20n','fsd','fs98','fsr'];
const stage = {}, level = {}; order.forEach((lv, i) => { const id = 'PV-' + (77 + i); stage[lv] = id; level[id] = lv; });   // STAGE_NO in pv/index.html: f1 = 77 … fsr = 91
const W10 = ['f1','f2','f3','f4','fs1','fs2','fs3'], PL = ['f20n','fs20n'];
const MS = { within10: 5000, within20: 6000, place: 8000 };
const pick = lv => { const f = F[lv]; const x = Array.isArray(f) ? f[Math.floor(Math.random() * f.length)] : f(); return Object.assign({}, x, { ans: ans(x), lv }); };
const distinct = (lv, n, avoid) => { const f = F[lv]; avoid = avoid || new Set(); const out = [];
  if (Array.isArray(f)) { const pool = shuffle(f.filter(x => !avoid.has(key(x)))); while (out.length < n && pool.length) { const x = pool.pop(); out.push(Object.assign({}, x, { lv })); }
    while (out.length < n && f.length) out.push(Object.assign({}, f[Math.floor(Math.random() * f.length)], { lv })); }
  else { let guard = 0; while (out.length < n && guard++ < 200) { const x = pick(lv); if (!avoid.has(key(x)) && !out.some(y => key(y) === key(x))) out.push(x); } }
  return out; };
window.PVFACTS = { facts: F, order, stage, level, pick, distinct, key, ans, MS, limitMs: lv => W10.includes(lv) ? MS.within10 : PL.includes(lv) ? MS.place : MS.within20 };
})();
