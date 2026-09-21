// Rehearses 06_stars.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_stars.js          (expects a server on /tmp:54329, superuser postgres, trust auth)
// Covers the star arithmetic, the board's new ranking, the week gain, and that nothing here is reachable by anon.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_stars_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

const MS = { day: 864e5 };
const test = (t, ok, n) => ({ t, ok, n });
const stage = (status, tests = []) => ({ status, level: 3, streak: 0, wrong: 0, l3streak: 0, testUnlocked: true, tests, seenCard: true });

(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);   // leftovers of a crashed run, of any suite
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const one = async (sql, args) => (await pg.query(sql, args)).rows[0];
  const val = async (sql, args) => (await one(sql, args)).v;
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query(`select set_config('request.headers','{}',false)`);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => typeof args[x] === 'object' && args[x] !== null ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };
  const denied = async (sql, args) => { try { await asAnon(sql, args); return false; } catch (e) { return /permission denied|does not exist/.test(e.message) ? true : e.message; } };

  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values
    ('Айгүл С.','1111','3А'),('Ерасыл Т.','2222','3А'),('Дана К.','3333','3А'),('Нұрлан Б.','4444','3А'),
    ('Мадина Ә.','5555','3Ә'),('Әлихан Ж.','6666','3Ә'),('Сәуле М.','7777','3Ә'),
    ('tester','0000','3А'),('Бөтен Сынып','8888','4А')`);
  await file('01_additive.sql');

  // ── 1. the script itself ────────────────────────────────────────────────
  await file('06_stars.sql'); await file('06_stars.sql');
  T('06 installs on 01 alone, and is re-runnable', true);
  T('without 04/05 the two competition sums are stubs that return 0',
    (await val(`select (esep_private.ch_stars('x') + esep_private.rm_stars('x')) v`)) === 0);

  // ── 2. what one stage is worth ─────────────────────────────────────────
  const ss = (tests, before) => val(`select esep_private.stage_stars($1::jsonb, $2) v`, [JSON.stringify(tests), before ?? null]);
  T('10/10 → 3, 9/10 → 2, 8/10 → 1, 7/10 → 0',
    (await ss([test(1, 10, 10)])) === 3 && (await ss([test(1, 9, 10)])) === 2 &&
    (await ss([test(1, 8, 10)])) === 1 && (await ss([test(1, 7, 10)])) === 0);
  T('a short test is judged by the ratio, not by the count: 6/7 = 0.857 is one star, 7/7 is three',
    (await ss([test(1, 6, 7)])) === 1 && (await ss([test(1, 7, 7)])) === 3);
  T('the BEST attempt counts, not the last', (await ss([test(1, 10, 10), test(2, 6, 10)])) === 3);
  T('a station with no test at all is worth nothing (this is the diagnostic case)', (await ss([])) === 0);
  T('junk a pupil could write does not raise and is worth nothing',
    (await ss([{ ok: 'x', n: 0 }, 7, null, { ok: 5 }])) === 0);

  // ── 3. one pupil's whole state ─────────────────────────────────────────
  const rs = (state, before) => val(`select esep_private.route_stars($1::jsonb, $2) v`, [JSON.stringify(state), before ?? null]);
  const mixed = {
    _t: 1, _ava: '🦊',
    AR: { stages: { 'AR-01': stage('passed'), 'AR-02': stage('passed', [test(1000, 8, 10)]), 'AR-03': stage('current', [test(9000, 10, 10)]) } },
    PV: { stages: { 'PV-01': stage('passed', [test(9000, 9, 10)]) } },
  };
  T('routes are added up; a station passed by the diagnostic adds nothing', (await rs(mixed)) === 6);
  T('PV counts like every other route once its bridge writes the test', (await rs({ PV: mixed.PV })) === 2);
  T('as-of-an-instant: only tests taken before it count', (await rs(mixed, 5000)) === 1);
  T('a test with no timestamp counts as old, so it can never inflate this week',
    (await rs({ AR: { stages: { 'AR-01': stage('passed', [{ ok: 10, n: 10 }]) } } }, 5000)) === 3);
  T('the first trial version kept WP at the top level — that shape still counts',
    (await rs({ stages: { 'WP-01': stage('passed', [test(1, 10, 10)]) } })) === 3);
  T('_t / _ava and anything that is not a route code are skipped',
    (await rs({ _t: 7, _ava: '🐻', hello: { stages: { 'XX-01': stage('passed', [test(1, 10, 10)]) } } })) === 0);
  T('a state that is not an object does not raise',
    (await rs(null)) === 0 && (await val(`select esep_private.route_stars('[1,2]'::jsonb) v`)) === 0);

  // ── 4. the board ───────────────────────────────────────────────────────
  const id = async name => (await one(`select id::text v from students where name = $1`, [name])).v;
  const setState = async (name, state) => pg.query(`update students set state = $2::jsonb, last_seen = now() where name = $1`, [name, JSON.stringify(state)]);
  const now = Date.now();
  const monday = (() => { const d = new Date(now + 5 * 3600e3); const dow = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow) - 5 * 3600e3; })();
  const old = monday - 3 * MS.day, fresh = monday + 60e3;
  const st = (...tests) => ({ AR: { stages: Object.fromEntries(tests.map((t, i) => [`AR-${String(i + 1).padStart(2, '0')}`, stage('passed', [t])])) } });

  await setState('Дана К.', st(test(old, 10, 10), test(old, 10, 10), test(fresh, 10, 10)));   // 9, of which 3 this week
  await setState('Ерасыл Т.', st(test(old, 9, 10), test(fresh, 8, 10)));                       // 3, of which 1 this week
  await setState('Айгүл С.', st(test(fresh, 8, 10)));                                          // 1, all of it this week
  await setState('Нұрлан Б.', st());                                                           // 0
  await setState('tester', st(test(old, 10, 10), test(old, 10, 10), test(old, 10, 10)));       // 9 but must never appear
  await setState('Бөтен Сынып', st(test(old, 10, 10), test(old, 10, 10), test(old, 10, 10)));  // another grade
  for (const n of ['Мадина Ә.', 'Әлихан Ж.', 'Сәуле М.']) await setState(n, st(test(old, 10, 10), test(old, 5, 10)));  // 3 each, class 3Ә

  const tok = async name => (await rpc('esep_login', { p_name: name, p_pin: { 'Айгүл С.': '1111', 'Ерасыл Т.': '2222', 'Дана К.': '3333', 'Нұрлан Б.': '4444' }[name], p_klass: '', p_code: '' })).token;
  const boardOf = async name => rpc('esep_board', { p_token: await tok(name) });

  let b = await boardOf('Айгүл С.');
  T('board: ranked by the star total, highest first', JSON.stringify((b.top || []).map(x => [x.name, x.n])) === JSON.stringify([['Дана К.', 9], ['Ерасыл Т.', 3], ['Айгүл С.', 1]]), b.top);
  T('board: every row carries this week\'s gain', JSON.stringify((b.top || []).map(x => x.week)) === JSON.stringify([3, 1, 1]), b.top);
  T('board: a pupil with no star is left out of the top five', !(b.top || []).some(x => x.n === 0));
  T('board: tester never appears', !(b.top || []).some(x => /tester/i.test(x.name)));
  T('board: another class of the same grade is not in my list', !(b.top || []).some(x => x.name === 'Мадина Ә.'));
  T('board: me = my rank, my total, my week, how many of us', b.me && b.me.rank === 3 && b.me.n === 1 && b.me.week === 1 && b.me.of === 4, b.me);
  T('board: the class averages are averages of the star totals, ≥3 pupils only',
    JSON.stringify((b.classes || []).map(c => [c.klass, c.avg, c.pupils]).sort()) === JSON.stringify([['3А', 3, 4], ['3Ә', 3, 3]].sort()), b.classes);
  T('board: a pupil from another grade is nowhere', !(b.classes || []).some(c => c.klass === '4А'));

  b = await boardOf('Дана К.');
  T('board: the leader sees herself first and flagged as me', b.top[0].me === true && b.me.rank === 1 && b.me.n === 9, b.me);
  await pg.query(`update students set klass = '' where name = 'Нұрлан Б.'`);
  T('board: a pupil with no class gets the empty answer, not an error',
    (await boardOf('Нұрлан Б.')).klass === null);
  await pg.query(`update students set klass = '3А' where name = 'Нұрлан Б.'`);

  // stars earned before this week must not show up as this week's gain
  await setState('Айгүл С.', st(test(old, 10, 10)));
  b = await boardOf('Айгүл С.');
  T('week gain is 0 for a pupil who has not passed a test since Monday', b.me.n === 3 && b.me.week === 0, b.me);

  // ── 5. challenge stars (04) ────────────────────────────────────────────
  await file('04_challenges.sql'); await file('06_stars.sql');
  T('re-running 06 after 04 replaces the stub with the real sum',
    (await val(`select esep_private.ch_stars($1) v`, [await id('Айгүл С.')])) === 0);
  const [A, E] = [await id('Айгүл С.'), await id('Ерасыл Т.')];
  await pg.query(`insert into esep_private.challenges(from_id,to_id,tbl,items,created_at,from_ok,from_ms,from_done_at,to_ok,to_ms,to_done_at)
                  values ($1,$2,5,'[]'::jsonb, now()-interval '20 days', 10,1000, now()-interval '20 days', 4,1000, now()-interval '20 days')`, [A, E]);
  await pg.query(`insert into esep_private.challenges(from_id,to_id,tbl,items,created_at,from_ok,from_ms,from_done_at,to_ok,to_ms,to_done_at)
                  values ($1,$2,5,'[]'::jsonb, now(), 3,1000, now(), 3,1000, now())`, [A, E]);
  await pg.query(`insert into esep_private.challenges(from_id,to_id,tbl,items,created_at,from_ok,from_ms,from_done_at)
                  values ($1,$2,5,'[]'::jsonb, now(), 9,1000, now())`, [A, E]);     // the other side has not played
  T('challenge stars: a win is 3 and a draw is 2 — 5 in all', (await val(`select esep_private.ch_stars($1) v`, [A])) === 5);
  T('challenge stars: the loser of the same pair gets 1 + 2', (await val(`select esep_private.ch_stars($1) v`, [E])) === 3);
  T('challenge stars: a challenge the opponent has not played is worth nothing yet',
    (await val(`select esep_private.ch_stars($1) v`, [A])) === 5);
  b = await boardOf('Айгүл С.');
  T('board: challenge stars are in the total and in the week gain', b.me.n === 3 + 5 && b.me.week === 0 + 2, b.me);

  // ── 6. room stars (05) ────────────────────────────────────────────────
  await file('05_rooms.sql'); await file('06_stars.sql');
  const room = async (when, rows) => {
    const r = await one(`insert into esep_private.rooms(code,host_id,host_name,klass,status,created_at,started_at,ends_at,closed_at,route,stage,seed,n,secs)
                         values ('1234',$1,'h','3А','done',$2,$2,$2,$2,'AR','AR-01',1,10,180) returning id`, [A, when]);
    for (const [sid, ok, ms] of rows)
      await pg.query(`insert into esep_private.room_players(room_id,student_id,joined_at,ok,ms,done_at,total) values ($1,$2,$3,$4,$5,$3,10)`, [r.id, sid, when, ok, ms]);
    return r.id;
  };
  const [D, N] = [await id('Дана К.'), await id('Нұрлан Б.')];
  await room(new Date(Date.now() - 20 * MS.day), [[A, 10, 100], [E, 8, 100], [D, 7, 100], [N, 6, 100]]);   // A first, E second, D third
  await room(new Date(), [[A, 5, 100], [E, 9, 100]]);                                                        // A second of two
  T('room stars: 1st is 3, 2nd of four is 2, 4th is 1 — and only when at least four played',
    (await val(`select esep_private.rm_stars($1) v`, [A])) === 4 &&
    (await val(`select esep_private.rm_stars($1) v`, [E])) === 2 + 3 &&
    (await val(`select esep_private.rm_stars($1) v`, [N])) === 1,
    { A: await val(`select esep_private.rm_stars($1) v`, [A]), E: await val(`select esep_private.rm_stars($1) v`, [E]), N: await val(`select esep_private.rm_stars($1) v`, [N]) });
  T('room stars: only what was closed since Monday counts as this week',
    (await val(`select esep_private.rm_stars($1, date_trunc('week', esep_private.kz_day(now()))::timestamp - interval '5 hours') v`, [A])) === 1);
  b = await boardOf('Айгүл С.');
  T('board: route + challenge + room, all three, in one number', b.me.n === 3 + 5 + 4 && b.me.week === 0 + 2 + 1, b.me);

  // ── 7. the browser role ───────────────────────────────────────────────
  T('anon may call the board', typeof (await boardOf('Айгүл С.')).klass === 'string');
  T('anon may not call the star helpers directly',
    (await denied(`select esep_private.route_stars('{}'::jsonb)`)) === true &&
    (await denied(`select esep_private.stage_stars('[]'::jsonb)`)) === true &&
    (await denied(`select esep_private.ch_stars('x')`)) === true &&
    (await denied(`select esep_private.rm_stars('x')`)) === true);
  T('a dead token gets nothing', (await rpc('esep_board', { p_token: 'nope' })) === null);

  // ── ties ───────────────────────────────────────────────────────────────
  // Ties share a rank and every one of them is shown — owner decision, 2026-09-21. «Top five» therefore
  // means «everyone down to fifth place», which in a class where eight children are level is eight rows.
  // Pinned here so it is not later mistaken for a bug and trimmed to five. Its own class, so that the
  // fixtures above keep meaning what they meant.
  await pg.query(`insert into students(name,pin,klass) values ('Бір','1001','6В'),('Екі','1002','6В'),('Үш','1003','6В'),('Төрт','1004','6В')`);
  await pg.query(`update students set pin_hash = crypt(pin, gen_salt('bf', 8)) where pin_hash is null`);
  for (const nm of ['Бір','Екі','Үш','Төрт']) await setState(nm, st(test(fresh, 10, 10)));      // 3 stars each
  const tieTok = (await rpc('esep_login', { p_name: 'Бір', p_pin: '1001', p_klass: '', p_code: '' })).token;
  const tb = await rpc('esep_board', { p_token: tieTok });
  T('four pupils on the same number share rank 1, and all four are listed',
    (tb.top || []).length === 4 && (tb.top || []).every(x => x.rank === 1 && x.n === 3), tb.top);
  T('and each of them is told they are first of four', tb.me.rank === 1 && tb.me.of === 4, tb.me);

  // ── 8. is it fast enough to sit in front of a child ──────────────────
  await pg.query(`
    insert into students(name, pin, klass, state, last_seen)
    select 'Оқушы ' || g, lpad(g::text, 4, '0'), '3А',
           jsonb_build_object('AR', jsonb_build_object('stages', (
             select jsonb_object_agg('AR-' || lpad(i::text, 2, '0'),
                      jsonb_build_object('status', 'passed', 'tests',
                        jsonb_build_array(jsonb_build_object('t', $1::bigint, 'ok', 8 + (i % 3), 'n', 10))))
               from generate_series(1, 41) i))),
           now()
      from generate_series(1, 300) g`, [old]);
  await pg.query(`update students set pin_hash = crypt(pin, gen_salt('bf', 8)) where pin_hash is null`);
  const t0 = Date.now(); await boardOf('Айгүл С.'); const took = Date.now() - t0;
  T(`board over 300 pupils × 41 stations stays quick (${took} ms)`, took < 400, { took });

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  // take the throwaway database with us: the other suites drop the anon role, which a leftover database blocks
  await pg.end();
  const gone = conn('postgres'); await gone.connect(); await gone.query(`drop database ${DB} with (force)`); await gone.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
