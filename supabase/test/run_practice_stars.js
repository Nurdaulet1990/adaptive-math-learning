// Rehearses 07_practice_stars.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_practice_stars.js     (expects a server on /tmp:54329, superuser postgres, trust auth)
// Pins the two rates the owner chose on 2026-09-21 — five perfect answers make a star, a day that meets the
// goal makes a star — and that they reach the board without disturbing what 06 already counted.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_pr_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const one = async (sql, args) => (await pg.query(sql, args)).rows[0];
  const val = async (sql, args) => (await one(sql, args)).v;
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query(`select set_config('request.headers','{}',false)`);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => typeof args[x] === 'object' && args[x] !== null ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };
  const denied = async (sql) => { try { await asAnon(sql); return false; } catch (e) { return /permission denied|does not exist/.test(e.message); } };

  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values ('Айгүл С.','1111','3А'),('Ерасыл Т.','2222','3А'),('Дана К.','3333','3А'),('tester','0000','3А')`);
  await file('01_additive.sql'); await file('06_stars.sql');
  await file('07_practice_stars.sql'); await file('07_practice_stars.sql');
  T('07 installs on 01 + 06 and is re-runnable', true);
  T('day_stats gained the answers column', (await val(`select count(*)::int v from information_schema.columns
      where table_schema='esep_private' and table_name='day_stats' and column_name='answers'`)) === 1);

  const id = async n => (await one(`select id::text v from students where name=$1`, [n])).v;
  const A = await id('Айгүл С.'), E = await id('Ерасыл Т.'), D = await id('Дана К.');
  const day = (sid, back, answers, score) => pg.query(
    `insert into esep_private.day_stats(student_id,day,events,answers,score) values ($1, esep_private.kz_day(now()) - ($2)::int, $3, $3, $4)
     on conflict (student_id,day) do update set answers=excluded.answers, score=excluded.score`, [sid, back, answers, score]);
  const stars = async (sid, since) => one(`select * from esep_private.day_stars($1,$2)`, [sid, since ?? null]);
  const monday = await val(`select date_trunc('week', esep_private.kz_day(now()))::date v`);
  const backTo = async d => val(`select (esep_private.kz_day(now()) - $1::date)::int v`, [d]);   // days from Monday to today
  const sinceMon = await backTo(monday);

  // ── the practice star: five perfect answers ─────────────────────────────
  await day(A, 0, 20, 12);
  T('twelve perfect answers make two stars, and the remainder is kept, not dropped', (await stars(A)).practice === 2, await stars(A));
  await day(A, 1, 20, 3);
  T('three more the day before carries the remainder over the night: 15 → three stars',
    (await stars(A)).practice === 3, await stars(A));
  await day(E, 0, 10, 4);
  T('four perfect answers are not yet a star', (await stars(E)).practice === 0, await stars(E));
  T('a pupil with no day at all is zero, not null', (await stars(D)).practice === 0, await stars(D));

  // ── the daily-goal star ────────────────────────────────────────────────
  T('a day that met the goal of 15 answers is one star, the 10-answer day none',
    (await stars(A)).goal === 2 && (await stars(E)).goal === 0, [await stars(A), await stars(E)]);
  await day(E, 2, 15, 0);
  T('the goal counts ANSWERS, not perfect ones: 15 answers and nothing right is still the star',
    (await stars(E)).goal === 1, await stars(E));
  T('the goal is the number the portal draws', (await val(`select esep_private.day_goal() v`)) === 15);

  // ── the week's gain ────────────────────────────────────────────────────
  await pg.query(`delete from esep_private.day_stats where student_id=$1`, [A]);
  await day(A, sinceMon + 3, 20, 8);                     // three days before Monday
  await day(A, 0, 20, 7);                                // today
  const all = await stars(A), wk = await stars(A, monday);
  T('all time: 15 perfect answers → three stars; two days met the goal', all.practice === 3 && all.goal === 2, all);
  // 8 before Monday is one star with 3 left over; the 7 since complete two more. A remainder carried across
  // Monday therefore lands in this week's gain — which is the honest reading of a cumulative counter.
  T('this week: 8 were banked before Monday (one star, 3 over), the 7 since make two more',
    wk.practice === 2 && wk.goal === 1, wk);

  // ── it reaches the board, and 06's three sources still count ───────────
  const tok = async (n, p) => (await rpc('esep_login', { p_name: n, p_pin: p, p_klass: '', p_code: '' })).token;
  const board = async (n, p) => rpc('esep_board', { p_token: await tok(n, p) });
  await pg.query(`update students set state = $2::jsonb, last_seen = now() where id::text = $1`, [A,
    JSON.stringify({ AR: { stages: { 'AR-01': { status: 'passed', tests: [{ t: Date.now(), ok: 10, n: 10 }] } } } })]);
  let b = await board('Айгүл С.', '1111');
  T('the board adds practice and the goal to the stage test: 3 + 3 + 2 = 8', b.me.n === 8, b.me);
  await pg.query(`update students set last_seen = now() where id::text = any($1)`, [[E, D]]);
  b = await board('Ерасыл Т.', '2222');
  T('a pupil who only practised is on the board too', b.me.n === 1, b.me);

  // ── tester, and the browser role ───────────────────────────────────────
  const Ttr = await id('tester');
  await day(Ttr, 0, 40, 40); await pg.query(`update students set last_seen = now() where id::text = $1`, [Ttr]);
  b = await board('Айгүл С.', '1111');
  T('tester still never appears, however much it practises', !(b.top || []).some(x => /tester/i.test(x.name)), b.top);
  T('anon cannot call the day helpers', (await denied(`select esep_private.day_stars('x')`)) && (await denied(`select esep_private.day_goal()`)));

  // ── esep_events still works, and now keeps `answers` ───────────────────
  const t2 = await tok('Дана К.', '3333');
  const ev = (o) => ({ t: null, ev: Object.assign({ u: Math.random().toString(36).slice(2) }, o) });
  const n = await rpc('esep_events', { p_token: t2, p_events: [
    ev({ ev: 'answer', ok: true, hints: 0, mode: 'practice', stage: 'AR-01' }),
    ev({ ev: 'answer', ok: false, hints: 2, mode: 'practice', stage: 'AR-01' }),
    ev({ ev: 'hint', n: 1 }),
    ev({ ev: 'answer', ok: true, hints: 0, mode: 'diag', skip: true, stage: 'AR-02' }) ] });
  T('esep_events still returns how many it took', n === 4, n);
  const row = await one(`select events, answers, score from esep_private.day_stats where student_id=$1 and day = esep_private.kz_day(now())`, [D]);
  T('it counted 4 events, 2 answers (the skipped placement item excluded) and 1 perfect one',
    row.events === 4 && row.answers === 2 && row.score === 1, row);

  // ── 09: a pupil's own total, which must not depend on having a class ────
  await file('09_my_stars.sql'); await file('09_my_stars.sql');
  const mine = async (n, p) => rpc('esep_stars', { p_token: await tok(n, p) });
  let my = await mine('Айгүл С.', '1111');
  T('esep_stars gives the same total the board does, and breaks it down',
    my.n === 8 && my.parts.route === 3 && my.parts.practice === 3 && my.parts.goal === 2, my);
  await pg.query(`update students set klass = '' where name = 'Айгүл С.'`);
  my = await mine('Айгүл С.', '1111');
  T('a pupil with NO class still gets her total — the bug that showed 0 ★ beside a room card saying 11',
    my.n === 8, my);
  T('…while the board still, rightly, has nothing to rank her against',
    (await board('Айгүл С.', '1111')).klass === null);
  await pg.query(`update students set klass = '3А' where name = 'Айгүл С.'`);
  T('a dead token gets nothing', (await rpc('esep_stars', { p_token: 'nope' })) === null);

  // ── 11: the practice stars a child already earned, before day_stats existed ──
  // 01 backfilled only fifteen days, so everything older sat in public.events uncounted.
  const OLD = await val(`select (now() - interval '90 days')::text v`);
  const oldEv = (o, i) => pg.query(`insert into public.events(student_id, t, ev) values ($1, $2::timestamptz, $3::jsonb)`,
    [D, OLD, JSON.stringify(Object.assign({ u: 'old' + i }, o))]);
  for (let i = 0; i < 12; i++) await oldEv({ ev: 'answer', ok: true, hints: 0, mode: 'practice', stage: 'AR-01', id: 'q' + i }, i);
  await oldEv({ ev: 'answer', ok: true, hints: 2, mode: 'practice', stage: 'AR-01', id: 'h1' }, 90);   // hinted: never scores
  await oldEv({ ev: 'attempt', ok: false, id: 'q0' }, 91);                                             // q0 needed a retry
  const before = (await stars(D)).practice;
  await file('11_backfill_days.sql'); await file('11_backfill_days.sql');
  const after = await stars(D);
  T('11 counts the days that were never aggregated: 11 perfect answers → two more stars',
    after.practice === before + 2, { before, after });
  T('…and applies the same rules — a hinted answer and a retried one still score nothing',
    (await one(`select score, answers from esep_private.day_stats where student_id=$1 and day = esep_private.kz_day($2::timestamptz)`, [D, OLD])).score === 11);
  T('running it twice changes nothing (it recomputes, it does not add)',
    (await stars(D)).practice === after.practice);

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end();
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
