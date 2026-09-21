// Rehearses the migration on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run.js            (expects a server on /tmp:54329, superuser postgres, trust auth)
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_test_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };
(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);   // leftovers of a crashed run
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  let IP = ''; const rpc = async (fn, args) => { const keys = Object.keys(args); await pg.query(`select set_config('request.headers', $1, false)`, [JSON.stringify(IP ? { 'cf-connecting-ip': IP } : {})]); const r = await asAnon(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`, keys.map(k => typeof args[k] === 'object' && args[k] !== null ? JSON.stringify(args[k]) : args[k])); return r.rows[0].v; };
  const denied = async (sql, args) => { try { await asAnon(sql, args); return false; } catch (e) { return /permission denied|row-level security/.test(e.message) ? true : e.message; } };

  await file('test/00_baseline_guess.sql');
  // today's data: plaintext PINs, one pupil per class, a tester
  await pg.query(`insert into students(name,pin,klass) values ('Айгүл С.','1111','3А'),('Ерасыл Т.','2222','3А'),('Дана К.','3333','3А'),('Нұрлан Б.','4444','3А'),
     ('Мадина Ә.','5555','3Ә'),('Әлихан Ж.','6666','3Ә'),('Сәуле М.','7777','3Ә'),('tester','0000','3А'),('Бөтен Сынып','8888','4А')`);
  T('before: anon can read every PIN (the hole)', (await asAnon(`select pin from students`)).rowCount === 9);

  await file('01_additive.sql'); await file('01_additive.sql');            // re-runnable
  T('step 1 hashed all PINs, kept plaintext for the old client', (await pg.query(`select count(*)::int n from students where pin_hash is not null and pin is not null`)).rows[0].n === 9);
  T('old client still works after step 1', (await asAnon(`select id from students where name ilike 'айгүл с.'`)).rowCount === 1);
  T('private schema unreachable for anon', (await denied(`select * from esep_private.sessions`)) === true);
  T('owner-only function unreachable for anon', (await denied(`select esep_private.set_teacher_secret('hunter2hunter2')`)) === true);
  T('private helper unreachable for anon', (await denied(`select esep_private.student_json('x')`)) === true);

  // ── pupil API ──
  let r = await rpc('esep_login', { p_name: '  айгүл   с. ', p_pin: '1111', p_klass: '3а' });
  T('login: case/space-insensitive name, right PIN', !!r.token && r.student.name === 'Айгүл С.' && r.student.klass === '3А' && r.student.pin === undefined && r.student.pin_hash === undefined, r);
  const tok = r.token, me = r.student.id;
  T('login: wrong PIN', (await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '9999', p_klass: '' })).error === 'pin');
  T('login: wildcard name is just a name now (registers "*", matches nobody)', (await rpc('esep_login', { p_name: '*', p_pin: '1111', p_klass: '' })).student.name === '*');
  T('login: % and _ do not match', (await rpc('esep_login', { p_name: 'Айгүл _.', p_pin: '1111', p_klass: '' })).student.id !== me);
  T('login: bad input', (await rpc('esep_login', { p_name: 'X', p_pin: '12a4', p_klass: '' })).error === 'bad_input');
  r = await rpc('esep_login', { p_name: 'Жаңа Оқушы', p_pin: '4321', p_klass: '2б' });
  T('login: first use registers, no plaintext PIN stored', !!r.token && (await pg.query(`select pin, pin_hash from students where name='Жаңа Оқушы'`)).rows[0].pin === null);
  IP = '10.0.0.66'; for (let i = 0; i < 8; i++) await rpc('esep_login', { p_name: 'Дана К.', p_pin: '0000', p_klass: '' });
  T('login: 8 misses lock THAT address out, even with the right PIN', (await rpc('esep_login', { p_name: 'Дана К.', p_pin: '3333', p_klass: '' })).error === 'locked');
  IP = '10.0.0.7'; T('login: …but the child, elsewhere, still gets in (a stranger cannot lock her out)', !!(await rpc('esep_login', { p_name: 'Дана К.', p_pin: '3333', p_klass: '' })).token);
  for (let k = 0; k < 5; k++) { IP = '10.1.0.' + k; for (let i = 0; i < 8; i++) await rpc('esep_login', { p_name: 'Нұрлан Б.', p_pin: '0000', p_klass: '' }); }
  IP = '10.9.9.9'; T('login: 40 misses from many addresses lock the name everywhere (bounds distributed guessing)', (await rpc('esep_login', { p_name: 'Нұрлан Б.', p_pin: '4444', p_klass: '' })).error === 'locked');
  IP = '';
  await pg.query(`select esep_private.set_join_code('Алма27')`);
  T('join code: a NEW name without the code is refused', (await rpc('esep_login', { p_name: 'Бейтаныс', p_pin: '0000', p_klass: '3А' })).error === 'code' && (await pg.query(`select count(*)::int n from students where name='Бейтаныс'`)).rows[0].n === 0);
  T('join code: existing pupils never need it', !!(await rpc('esep_login', { p_name: 'Ерасыл Т.', p_pin: '2222', p_klass: '' })).token);
  T('join code: new name + code registers', !!(await rpc('esep_login', { p_name: 'Кодпен Келген', p_pin: '1212', p_klass: '3А', p_code: ' алма27 ' })).token);
  await pg.query(`select esep_private.set_join_code('')`); await pg.query(`delete from students where name='Кодпен Келген'`);
  await pg.query(`delete from esep_private.login_fails`);

  T('resume: good token', (await rpc('esep_resume', { p_token: tok })).id === me);
  T('resume: bad token → null', (await rpc('esep_resume', { p_token: 'f'.repeat(48) })) === null);
  T('save: own state', (await rpc('esep_save', { p_token: tok, p_state: { AR: { nAns: 3 }, _days: { '2026-09-20': 3 } }, p_time_ms: 1234 })) === true
    && (await pg.query(`select state->'AR'->>'nAns' v, time_ms from students where id=$1`, [me])).rows[0].v === '3');
  T('save: bad token changes nothing', (await rpc('esep_save', { p_token: 'a'.repeat(48), p_state: { hacked: 1 }, p_time_ms: 1 })) === false
    && (await pg.query(`select count(*)::int n from students where state ? 'hacked'`)).rows[0].n === 0);
  let threw = false; try { await rpc('esep_save', { p_token: tok, p_state: [1, 2], p_time_ms: 1 }); } catch (e) { threw = true; }
  T('save: non-object state rejected', threw);

  const other = (await pg.query(`select id from students where name='Ерасыл Т.'`)).rows[0].id;
  const n = await rpc('esep_events', { p_token: tok, p_events: [
    { t: new Date().toISOString(), ev: { ev: 'answer', ok: true, hints: 0, id: 'q1', student_id: other } },
    { t: 'garbage', ev: { ev: 'answer', ok: true, id: 'q2' } }, { t: '2026-13-45T99:00:00Z', ev: { ev: 'hint' } }, { t: null, ev: 'not-an-object' } ] });
  T('events: 3 stored (bad times → now, non-object dropped), all under MY id', n === 3 && (await pg.query(`select count(*)::int n from events where student_id=$1`, [me])).rows[0].n === 3
    && (await pg.query(`select count(*)::int n from events where student_id=$1`, [other])).rows[0].n === 0);
  const dup = [{ t: null, ev: { ev: 'hint', u: 'abc123' } }, { t: null, ev: { ev: 'hint', u: 'abc123' } }, { t: null, ev: { ev: 'hint', u: 'zzz999' } }];
  T('events: a resent event (same u) is stored once', (await rpc('esep_events', { p_token: tok, p_events: dup })) === 2 && (await rpc('esep_events', { p_token: tok, p_events: dup })) === 0);
  T('events: bad token stores nothing', (await rpc('esep_events', { p_token: 'b'.repeat(48), p_events: [{ t: null, ev: { ev: 'answer' } }] })) === -1);

  // scoring through the API: a retried item and a hinted item do not score, a clean one does
  await pg.query(`delete from events`); await pg.query(`delete from esep_private.day_stats`);
  await rpc('esep_events', { p_token: tok, p_events: [{ t: null, ev: { ev: 'attempt', id: 'A1', u: 'u1' } }] });
  await rpc('esep_events', { p_token: tok, p_events: [{ t: null, ev: { ev: 'answer', ok: true, hints: 0, id: 'A1', u: 'u2' } }, { t: null, ev: { ev: 'attempt', id: 'A2', u: 'u3' } }, { t: null, ev: { ev: 'answer', ok: true, hints: 0, id: 'A2', u: 'u4' } },
    { t: null, ev: { ev: 'answer', ok: true, hints: 1, id: 'A3', u: 'u5' } }, { t: null, ev: { ev: 'answer', ok: true, hints: 0, id: 'A4', u: 'u6' } }, { t: null, ev: { ev: 'answer', ok: true, hints: 0, id: 'A4', u: 'u6' } }] });
  T('counters: 6 events, score 1 (retry in an earlier batch, retry in the same batch, hinted, duplicate all excluded)', (r => r.events === 6 && r.score === 1)((await pg.query(`select sum(events)::int events, sum(score)::int score from esep_private.day_stats where student_id=$1`, [me])).rows[0]));
  await pg.query(`update esep_private.day_stats set events = 4000 where student_id=$1`, [me]);
  T('quota: past 4000 events a day the rest are dropped, nothing stored', (await rpc('esep_events', { p_token: tok, p_events: [{ t: null, ev: { ev: 'answer', ok: true, u: 'over' } }] })) === 0 && (await pg.query(`select count(*)::int n from events where ev->>'u'='over'`)).rows[0].n === 0);

  // ── board ── seed this week's events directly, then let 01's one-off backfill build the counters
  await pg.query(`delete from events`); await pg.query(`delete from esep_private.day_stats`);
  const ids = Object.fromEntries((await pg.query(`select name,id from students`)).rows.map(x => [x.name, x.id]));
  const add = async (name, k, ev, when = `now()`) => { for (let i = 0; i < k; i++) await pg.query(`insert into events(student_id,t,ev) values ($1, ${when}, $2)`, [ids[name], JSON.stringify(Object.assign({ id: name + i + Math.random() }, ev))]); };
  const good = { ev: 'answer', ok: true, hints: 0, mode: 'practice' };
  await add('Дана К.', 12, good); await add('Ерасыл Т.', 9, good); await add('Айгүл С.', 5, good); await add('tester', 50, good);
  await add('Айгүл С.', 4, { ev: 'answer', ok: true, hints: 2, mode: 'practice' });            // hinted → no
  await add('Айгүл С.', 3, { ev: 'answer', ok: false, hints: 0, mode: 'practice' });           // wrong → no
  await add('Айгүл С.', 6, { ev: 'answer', ok: true, hints: 0, mode: 'diag' });                // placement → no
  await add('Айгүл С.', 2, { ev: 'answer', ok: true, hints: 'x); drop table', mode: 'test' }); // junk hints → no, and no crash
  await pg.query(`insert into events(student_id,t,ev) values ($1,now(),$2),($1,now(),$3)`, [ids['Айгүл С.'], JSON.stringify({ ev: 'attempt', ok: false, id: 'R1' }), JSON.stringify({ ev: 'answer', ok: true, hints: 0, mode: 'practice', id: 'R1' })]); // right on the retry → no
  await add('Айгүл С.', 7, good, `now() - interval '8 days'`);                                  // last week, not this week
  await add('Мадина Ә.', 30, good); await add('Бөтен Сынып', 99, good);
  await file('01_additive.sql');   // backfill
  const b = await rpc('esep_board', { p_token: tok });
  T('board: top = Дана 12, Ерасыл 9, me 5; tester and other classes absent', JSON.stringify(b.top.map(x => [x.name, x.n, x.me])) === JSON.stringify([['Дана К.', 12, false], ['Ерасыл Т.', 9, false], ['Айгүл С.', 5, true]]), b.top);
  T('board: me = rank 3 of 4, hinted/wrong/diag/retried/junk excluded', b.me.rank === 3 && b.me.n === 5 && b.me.of === 4, b.me);
  T('board: classes = same grade only, ≥3 pupils, per-pupil average', JSON.stringify(b.classes.map(c => [c.klass, c.avg, c.pupils, c.mine])) === JSON.stringify([['3Ә', 10, 3, false], ['3А', 7, 4, true]]), b.classes);
  T('board: leaks nothing but names and counts', !/pin|state|"id"/.test(JSON.stringify(b)), b);
  T('board: bad token → null', (await rpc('esep_board', { p_token: 'c'.repeat(48) })) === null);

  // ── scale: a whole grade, a busy week, a flooder — under the 3-second limit Supabase puts on the browser role ──
  await pg.query(`insert into students(name,pin_hash,klass) select 'Оқушы '||g, 'x', '3'||chr(1040 + g % 5) from generate_series(1,140) g`);
  await pg.query(`insert into events(student_id,t,ev) select s.id, now() - (random()*interval '3 days'), jsonb_build_object('ev','answer','ok',true,'hints',0,'id',s.id::text||k) from students s, generate_series(1,570) k where s.name like 'Оқушы %'`);
  await pg.query(`insert into events(student_id,t,ev) select $1, now(), jsonb_build_object('ev','answer','ok',true,'junk',repeat('x',200)) from generate_series(1,30000)`, [ids['Мадина Ә.']]);
  await pg.query(`delete from esep_private.day_stats`); await file('01_additive.sql');
  await pg.query(`alter role anon set statement_timeout = '3s'`); await pg.query(`set statement_timeout = '3s'`);
  const t0 = Date.now(); const big = await rpc('esep_board', { p_token: tok }); const ms = Date.now() - t0; await pg.query(`reset statement_timeout`);
  T(`scale: board over ${(await pg.query(`select count(*)::int n from events`)).rows[0].n} events answers in ${ms} ms (limit 3000)`, ms < 500 && big.classes.length >= 5, { ms, classes: big.classes.length });
  await pg.query(`delete from students where name like 'Оқушы %'`);

  // ── teacher API ──
  T('teacher: not configured yet', (await rpc('esep_t_login', { p_secret: 'whatever' })).error === 'not_configured');
  await pg.query(`select esep_private.set_teacher_secret('ұзын құпия сөз 2026')`);
  T('teacher: wrong secret', (await rpc('esep_t_login', { p_secret: '1234' })).error === 'secret');
  IP = '10.6.6.6'; for (let i = 0; i < 9; i++) await rpc('esep_t_login', { p_secret: 'nope' });
  T('teacher: a hammering stranger locks only himself', (await rpc('esep_t_login', { p_secret: 'ұзын құпия сөз 2026' })).error === 'locked'); IP = '';
  const tt = (await rpc('esep_t_login', { p_secret: 'ұзын құпия сөз 2026' })).token;
  T('teacher: login', !!tt);
  const list = await rpc('esep_t_students', { p_token: tt });
  T('teacher: students list has no PIN fields', list.length >= 9 && !/pin/.test(JSON.stringify(list)));
  let t1 = false; try { await rpc('esep_t_students', { p_token: tok }); } catch (e) { t1 = /teacher session required/.test(e.message); }
  T('teacher: a PUPIL token is refused', t1);
  const evs = await rpc('esep_t_events', { p_token: tt, p_students: [me], p_from: null, p_to: null, p_limit: 1000 });
  T('teacher: events of one pupil, oldest first', evs.length > 20 && evs.every(e => e.student_id === me) && evs[0].t <= evs[evs.length - 1].t);
  T('teacher: set state (stamped with _t so an older pupil cache cannot undo it)', (await rpc('esep_t_set_state', { p_token: tt, p_student: other, p_state: { AR: { diag: null } } })) === true
    && Math.abs((await pg.query(`select (state->>'_t')::bigint t from students where id=$1`, [other])).rows[0].t - Date.now()) < 60000);
  T('teacher: reset PIN kills the old PIN and sessions', (await rpc('esep_t_reset_pin', { p_token: tt, p_student: me, p_pin: '2468' })) === true
    && (await rpc('esep_resume', { p_token: tok })) === null
    && (await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '1111', p_klass: '' })).error === 'pin'
    && !!(await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '2468', p_klass: '' })).token);
  T('teacher: delete pupil + events', (await rpc('esep_t_delete', { p_token: tt, p_student: ids['Бөтен Сынып'] })) === true
    && (await pg.query(`select count(*)::int n from events where student_id=$1`, [ids['Бөтен Сынып']])).rows[0].n === 0);

  // ── step 2: lock ──
  await pg.query(`create policy "allow all" on students for all to anon using (true) with check (true)`);   // a leftover permissive policy must go too
  await file('02_lock.sql');
  T('locked: anon SELECT students', (await denied(`select * from students`)) === true);
  T('locked: anon SELECT pin', (await denied(`select pin from students`)) === true);
  T('locked: anon UPDATE students', (await denied(`update students set state='{}'`)) === true);
  T('locked: anon DELETE students', (await denied(`delete from students`)) === true);
  T('locked: anon INSERT events', (await denied(`insert into events(student_id,ev) values ($1,'{}')`, [me])) === true);
  T('locked: anon SELECT events', (await denied(`select * from events`)) === true);
  r = await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '2468', p_klass: '' });
  T('locked: the API still works (login/save/events/board)', !!r.token && (await rpc('esep_save', { p_token: r.token, p_state: { ok: 1 }, p_time_ms: 5 })) === true
    && (await rpc('esep_events', { p_token: r.token, p_events: [{ t: null, ev: { ev: 'answer', ok: true } }] })) === 1 && !!(await rpc('esep_board', { p_token: r.token })).me);
  T('locked: legacy pupil who never used the new client can still log in (hashed in step 1)', !!(await rpc('esep_login', { p_name: 'Сәуле М.', p_pin: '7777', p_klass: '' })).token);

  // ── step 3 ──
  await file('03_drop_plain_pin.sql');
  T('step 3: plaintext column gone, login still works', (await pg.query(`select count(*)::int n from information_schema.columns where table_name='students' and column_name='pin'`)).rows[0].n === 0
    && !!(await rpc('esep_login', { p_name: 'Мадина Ә.', p_pin: '5555', p_klass: '' })).token
    && !!(await rpc('esep_login', { p_name: 'Тағы Жаңа', p_pin: '1357', p_klass: '1А' })).token);

  await file('01_additive.sql'); await file('02_lock.sql'); await file('03_drop_plain_pin.sql');
  T('after step 3 every script can be run again (to ship a function fix later)', !!(await rpc('esep_login', { p_name: 'Мадина Ә.', p_pin: '5555', p_klass: '' })).token);
  await pg.query(`alter table students add column pin text`); await pg.query(`insert into students(name,pin,klass) values ('ПИНсіз', null, '3А')`);
  let guard = false; try { await pg.query(`begin`); await file('03_drop_plain_pin.sql'); } catch (e) { guard = /no pin_hash/.test(e.message); } await pg.query(`rollback`);
  T('step 3 refuses — and drops nothing — while a pupil has no hash', guard && (await pg.query(`select count(*)::int n from information_schema.columns where table_name='students' and column_name='pin'`)).rows[0].n === 1);
  await pg.query(`delete from students where name='ПИНсіз'`);

  // ── rollback works too ──
  await file('02_rollback.sql');
  T('rollback: anon can read students again', (await asAnon(`select id from students`)).rowCount > 0);

  await pg.end(); await admin.query(`drop database ${DB}`); await admin.query(`drop role if exists anon`).catch(()=>{}); await admin.query(`drop role if exists authenticated`).catch(()=>{}); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message, e.where || ''); process.exit(2); });
