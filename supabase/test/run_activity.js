// Rehearses 20_activity.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_activity.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
// Who may call it, what it returns (numbers only), what counts as an answer — the events go in through the pupils'
// own esep_events, exactly as the app sends them — the Kazakhstan day boundary, the range rules, the rollback.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_activity_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };
(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_activity%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  const rpc = async (fn, args) => { const k = Object.keys(args);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => args[x] !== null && typeof args[x] === 'object' ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };
  const refused = async (fn, args) => { try { await rpc(fn, args); return false; } catch (e) { return /teacher session required/.test(e.message); } };

  await file('test/00_baseline_guess.sql');
  const P = [['Айгүл С.', '3 QYRAN'], ['Дана К.', '3 qyran '], ['Ерасыл Т.', '3 QYRAN'], ['Сәуле М.', '2 BARYS'], ['Нұрлан Б.', ''], ['tester', '3 QYRAN'], ['Бекзат Р.', '2 BARYS']];
  for (const [n, k] of P) await pg.query(`insert into students(name,pin,klass) values ($1,'1111',$2)`, [n, k]);
  await file('01_additive.sql'); await file('02_lock.sql');
  let early = ''; try { await file('20_activity.sql'); } catch (e) { early = e.message; }
  T('without 07, 20 stops with a clear message and installs nothing', /needs 07_practice_stars/.test(early)
    && (await pg.query(`select count(*)::int n from pg_proc where proname='esep_t_activity'`)).rows[0].n === 0, early);
  await file('06_stars.sql'); await file('07_practice_stars.sql');
  await file('20_activity.sql'); await file('20_activity.sql');
  T('20 installs on 01+02+06+07 and is re-runnable', true);
  T('esep_t_activity is VOLATILE (a STABLE public function answers POST with 405 — see 12)',
    (await pg.query(`select provolatile from pg_proc where proname='esep_t_activity'`)).rows[0].provolatile === 'v');

  const kz = async (n) => (await pg.query(`select (esep_private.kz_day(now()) + $1::int)::text d`, [n])).rows[0].d;
  const TODAY = await kz(0), YEST = await kz(-1), D2 = await kz(-2);
  const tok = {}; for (const [n] of P) tok[n] = (await rpc('esep_login', { p_name: n, p_pin: '1111', p_klass: '' })).token;
  let u = 0; const e = (t, ev) => ({ t, ev: Object.assign({ u: 'u' + (++u), route: 'AR', stage: 'AR-01' }, ev) });
  const send = (who, evs) => rpc('esep_events', { p_token: tok[who], p_events: evs });
  const many = (n, t, ev) => [...Array(n)].map(() => e(t, ev));
  const at = (day, hm) => `${day}T${hm}:00+05:00`;
  // what the app really logs (core/runner.js): practice {ev:'answer'}, a stage-test question {ev:'answer',mode:'test'},
  // the test result {ev:'test'}, a placement question {ev:'answer',mode:'diag'}, a skipped placement item {…,skip:true},
  // a practice «Білмеймін» {ev:'dontknow'}, hints and attempts as their own events
  await send('Айгүл С.', [...many(8, at(TODAY, '00:01'), { ev: 'answer', ok: true }), ...many(3, at(TODAY, '00:02'), { ev: 'answer', mode: 'test', ok: true }),
    e(at(TODAY, '00:03'), { ev: 'test', pass: true, ok: 3, n: 3 }), ...many(1, at(TODAY, '00:04'), { ev: 'answer', mode: 'diag', ok: false }),
    ...many(4, at(TODAY, '00:05'), { ev: 'answer', mode: 'diag', ok: false, skip: true }), ...many(2, at(TODAY, '00:06'), { ev: 'dontknow' }), e(at(TODAY, '00:07'), { ev: 'hint' })]);
  await send('Дана К.', [...many(4, at(TODAY, '00:00'), { ev: 'answer', ok: true }), ...many(7, at(YEST, '23:59'), { ev: 'answer', ok: true })]);
  await send('Ерасыл Т.', many(1, at(TODAY, '00:10'), { ev: 'answer', ok: false }));
  await send('Ерасыл Т.', many(9, at(D2, '12:00'), { ev: 'answer', ok: true }));
  await send('tester', many(50, at(TODAY, '00:20'), { ev: 'answer', ok: true }));
  await send('Сәуле М.', many(20, at(TODAY, '00:30'), { ev: 'answer', ok: true }));
  await send('Нұрлан Б.', many(3, at(TODAY, '00:40'), { ev: 'answer', ok: true }));
  await send('Бекзат Р.', many(5, at(TODAY, '00:50'), { ev: 'dontknow' }));   // only «Білмеймін»: did not answer anything

  await pg.query(`select esep_private.set_teacher_secret('a long teacher phrase')`);
  const tt = (await rpc('esep_t_login', { p_secret: 'a long teacher phrase' })).token;
  T('no token: refused', await refused('esep_t_activity', { p_token: null, p_from: TODAY, p_to: TODAY }));
  T('a PUPIL token: refused', !!tok['Айгүл С.'] && await refused('esep_t_activity', { p_token: tok['Айгүл С.'], p_from: TODAY, p_to: TODAY }));
  T('a made-up token: refused', await refused('esep_t_activity', { p_token: 'x'.repeat(48), p_from: TODAY, p_to: TODAY }));
  let direct = false; try { await asAnon(`select * from esep_private.day_stats limit 1`); } catch (er) { direct = /permission denied/.test(er.message); }
  T('anon still cannot read day_stats directly', direct);

  const r = await rpc('esep_t_activity', { p_token: tt, p_from: TODAY, p_to: TODAY });
  const day = (res, d, k) => ((res.days || []).find(x => x.day === d && x.klass === k) || {}).n;
  T('today, 3 QYRAN: Айгүл 12, Дана 4, Ерасыл 1 — high to low', JSON.stringify(day(r, TODAY, '3 QYRAN')) === '[12,4,1]', r);
  T('Айгүл 12 = 8 practice + 3 stage-test + 1 placement answers; skipped placement items, «Білмеймін», the test summary and a hint do not count', day(r, TODAY, '3 QYRAN')[0] === 12);
  T('the same number the pupil\'s daily ring reads (day_stats.answers)', (await pg.query(`select answers from esep_private.day_stats d join students s on s.id=d.student_id where s.name='Айгүл С.' and day=$1`, [TODAY])).rows[0].answers === 12);
  T('the tester account is left out', !JSON.stringify(r).includes('50'));
  T('«3 qyran » and «3 QYRAN» are one class', !(r.days || []).some(x => x.klass !== x.klass.trim().toUpperCase()));
  T('2 BARYS: Сәуле 20; Бекзат only pressed «Білмеймін» and is not in the list', JSON.stringify(day(r, TODAY, '2 BARYS')) === '[20]', day(r, TODAY, '2 BARYS'));
  T('a pupil with no class comes under klass ""', JSON.stringify(day(r, TODAY, '')) === '[3]');
  T('only numbers leave the server: no name, no id', !/Айгүл|Дана|Сәуле|Нұрлан|[0-9a-f]{8}-[0-9a-f]{4}/.test(JSON.stringify(r)), JSON.stringify(r));
  T('the reply carries from/to', r.from === TODAY && r.to === TODAY);

  const w = await rpc('esep_t_activity', { p_token: tt, p_from: D2, p_to: TODAY });
  T('day boundary is Kazakhstan midnight: Дана 7 yesterday (23:59), 4 today (00:00)', JSON.stringify(day(w, YEST, '3 QYRAN')) === '[7]' && day(w, TODAY, '3 QYRAN').includes(4), w);
  T('…and Ерасыл 9 two days ago', JSON.stringify(day(w, D2, '3 QYRAN')) === '[9]');
  T('days are ordered by day, then class', (w.days || []).every((x, i, a) => !i || a[i - 1].day < x.day || (a[i - 1].day === x.day && a[i - 1].klass <= x.klass)));
  const one = await rpc('esep_t_activity', { p_token: tt, p_from: YEST });
  T('from without to → that one day', one.from === YEST && one.to === YEST && one.days.length === 1, one);
  const onlyTo = await rpc('esep_t_activity', { p_token: tt, p_to: D2 });
  T('to without from → that one day too (not «today … to», which would be a range error)', onlyTo.from === D2 && onlyTo.to === D2 && !onlyTo.error, onlyTo);
  const td = await rpc('esep_t_activity', { p_token: tt });
  T('no dates → today (Kazakhstan)', td.from === TODAY && td.to === TODAY, td);
  T('an empty day → days: []', JSON.stringify((await rpc('esep_t_activity', { p_token: tt, p_from: '2026-01-05' })).days) === '[]');
  T('to before from → error range', (await rpc('esep_t_activity', { p_token: tt, p_from: TODAY, p_to: YEST })).error === 'range');
  T('62 days is allowed, 63 is not', !(await rpc('esep_t_activity', { p_token: tt, p_from: '2026-01-01', p_to: '2026-03-03' })).error
    && (await rpc('esep_t_activity', { p_token: tt, p_from: '2026-01-01', p_to: '2026-03-04' })).error === 'range');

  // size and speed: a term of day_stats for 150 pupils, a week asked for
  await pg.query(`insert into students(name,pin,klass) select 'Оқушы '||g, '1111', (array['2 QYRAN','2 SAMURYQ','3 QYRAN','3 SAMURYQ','4 BARYS'])[1+g%5] from generate_series(1,150) g`);
  await pg.query(`insert into esep_private.day_stats(student_id, day, events, answers, score)
    select s.id, esep_private.kz_day(now()) - g, 30, (random()*60)::int, 0 from students s, generate_series(0,90) g where s.name like 'Оқушы %' on conflict do nothing`);
  const t0 = Date.now(); const wk = await rpc('esep_t_activity', { p_token: tt, p_from: await kz(-6), p_to: TODAY }); const ms = Date.now() - t0;
  T(`speed: one week of 150 pupils in ${ms} ms (limit 500)`, ms < 500 && wk.days.length >= 35, { ms, n: wk.days.length });
  const wkSize = JSON.stringify(wk).length;
  T(`the reply for that week is small (${wkSize} bytes < 20 kB)`, wkSize < 20000);

  // rollback, then install again
  await file('20_rollback.sql'); await file('20_rollback.sql');
  T('rollback removes the function and is re-runnable', (await pg.query(`select count(*)::int n from pg_proc where proname='esep_t_activity'`)).rows[0].n === 0);
  T('…and leaves day_stats alone', (await pg.query(`select count(*)::int n from esep_private.day_stats`)).rows[0].n > 1000);
  await file('20_activity.sql');
  T('…and 20 installs again after the rollback', !!(await rpc('esep_t_activity', { p_token: tt, p_from: TODAY })).days);

  await pg.end(); const a2 = conn('postgres'); await a2.connect(); await a2.query(`drop database ${DB} with (force)`); await a2.query(`drop role if exists anon`); await a2.query(`drop role if exists authenticated`); await a2.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASSED`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
