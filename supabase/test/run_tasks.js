// Rehearses 16_tasks.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_tasks.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
// Who sees a task, what counts towards it, and who may touch it.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_tasks_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };
(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query(`select set_config('request.headers','{}',false)`);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => Array.isArray(args[x]) ? args[x] : typeof args[x] === 'object' && args[x] !== null ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };
  await file('test/00_baseline_guess.sql'); await file('01_additive.sql'); await file('08_classes.sql');
  await pg.query(`insert into esep_private.classes(name) values ('3А'),('3Ә') on conflict do nothing`);
  await file('16_tasks.sql'); await file('16_tasks.sql');
  T('16 installs on 01 + 08 and is re-runnable', true);
  const login = (n, p, k) => rpc('esep_login', { p_name: n, p_pin: p, p_klass: k, p_code: '' });
  const A = await login('Айгүл С.', '1111', '3А'), E = await login('Ерлан Б.', '2222', '3А'), D = await login('Дана К.', '3333', '3Ә');
  const id = async n => (await pg.query(`select id::text v from students where name=$1`, [n])).rows[0].v;
  const [ia, ie, id_] = [await id('Айгүл С.'), await id('Ерлан Б.'), await id('Дана К.')];
  await pg.query(`select esep_private.set_teacher_secret('a long teacher phrase')`);
  const tt = (await rpc('esep_t_login', { p_secret: 'a long teacher phrase' })).token;
  const ev = (sid, ev, minsAgo) => pg.query(`insert into public.events(student_id, t, ev) values ($1::uuid, now() - ($3 || ' minutes')::interval, $2::jsonb)`, [sid, JSON.stringify(ev), String(minsAgo)]);
  // work BEFORE the task: must not count
  for (let i = 0; i < 5; i++) await ev(ia, { ev: 'answer', stage: 'TE-08', ok: true, route: 'TE' }, 60);
  const mk = a => rpc('esep_t_task_create', Object.assign({ p_token: tt, p_route: 'TE', p_stages: ['TE-08'], p_kind: 'answers', p_goal: 3, p_due: null, p_note: 'жұмаға дейін', p_klasses: [], p_students: [] }, a));
  const t1 = await mk({ p_klasses: ['3а'] });                         // class 3А
  const t2 = await mk({ p_students: [id_], p_kind: 'test', p_stages: ['TE-05', 'TE-06'] });   // Дана alone, two tests
  T('the teacher publishes to a class and to a single pupil', t1 && t1.id && t2 && t2.id, { t1, t2 });
  T('refused: wrong route prefix / no one / an unknown class / an unknown pupil / goal 0',
    (await mk({ p_klasses: ['3А'], p_stages: ['AR-01'] })).error === 'stages' && (await mk({})).error === 'nobody' &&
    (await mk({ p_klasses: ['9Z'] })).error === 'klass' && (await mk({ p_students: ['00000000-0000-0000-0000-000000000000'] })).error === 'student' &&
    (await mk({ p_klasses: ['3А'], p_goal: 0 })).error === 'goal');
  const mine = async tok => (await rpc('esep_my_tasks', { p_token: tok })) || [];
  const a0 = await mine(A.token), e0 = await mine(E.token), d0 = await mine(D.token);
  T('3А pupils see the class task; Дана (3Ә) sees only hers', a0.length === 1 && a0[0].id === t1.id && e0.length === 1 && d0.length === 1 && d0[0].id === t2.id, { a0, e0, d0 });
  T('answers from before the task do not count', a0[0].p.n === 0 && a0[0].p.of === 3 && a0[0].p.done === false, a0[0].p);
  await ev(ia, { ev: 'answer', stage: 'TE-08', ok: true }, 0); await ev(ia, { ev: 'answer', stage: 'TE-08', ok: false }, 0);
  await ev(ia, { ev: 'answer', stage: 'TE-09', ok: true }, 0); await ev(ia, { ev: 'answer', stage: 'TE-08', ok: true }, 0);
  const a1 = (await mine(A.token))[0].p;
  T('only RIGHT answers on the task\'s station count (2 of 3)', a1.n === 2 && !a1.done, a1);
  await ev(ia, { ev: 'answer', stage: 'TE-08', ok: true }, 0);
  const a2 = (await mine(A.token))[0].p;
  T('…and at the goal it is done', a2.n === 3 && a2.done === true, a2);
  await ev(id_, { ev: 'test', stage: 'TE-05', pass: true, ok: 9, n: 10 }, 0); await ev(id_, { ev: 'test', stage: 'TE-06', pass: false, ok: 6, n: 10 }, 0);
  const d1 = (await mine(D.token))[0].p;
  T('test task: one of two stations passed → 1/2, not done', d1.n === 1 && d1.of === 2 && !d1.done, d1);
  await ev(id_, { ev: 'test', stage: 'TE-06', pass: true, ok: 8, n: 10 }, 0);
  T('…both passed → done', (await mine(D.token))[0].p.done === true);
  const list = await rpc('esep_t_tasks', { p_token: tt });
  const L1 = list.find(x => x.id === t1.id);
  T('the teacher sees each task with its pupils and their progress', L1 && L1.pupils.length === 2 && L1.pupils.find(p => p.name === 'Айгүл С.').p.done && !L1.pupils.find(p => p.name === 'Ерлан Б.').p.done, L1);
  await rpc('esep_t_task_close', { p_token: tt, p_id: t1.id });
  T('a closed task disappears from the pupils\' list', (await mine(E.token)).length === 0 && (await rpc('esep_t_tasks', { p_token: tt })).find(x => x.id === t1.id).closed === true);
  await rpc('esep_t_task_delete', { p_token: tt, p_id: t2.id });
  T('a deleted task is gone', (await mine(D.token)).length === 0);
  let denied = 0; for (const f of ['esep_t_tasks']) { try { await rpc(f, { p_token: A.token }); } catch (e) { if (/teacher session required/.test(e.message)) denied++; } }
  try { await rpc('esep_t_task_create', { p_token: A.token, p_route: 'TE', p_stages: ['TE-01'], p_kind: 'answers', p_goal: 5, p_due: null, p_note: '', p_klasses: ['3А'], p_students: [] }); } catch (e) { if (/teacher session required/.test(e.message)) denied++; }
  T('a pupil\'s token can neither list nor create tasks', denied === 2);
  T('a dead token gets nothing', (await rpc('esep_my_tasks', { p_token: 'nope' })) === null);
  await file('02_lock.sql');
  let hidden = false; try { await asAnon(`select * from esep_private.tasks`); } catch (e) { hidden = true; }
  T('with the lock on: anon cannot read the task table, the pupil can still read her tasks', hidden && Array.isArray(await rpc('esep_my_tasks', { p_token: A.token })));
  T('the public functions are VOLATILE', (await pg.query(`select bool_and(provolatile='v') v from pg_proc where proname like 'esep_%task%'`)).rows[0].v === true);
  const failed = out.filter(x => !x).length; console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end(); const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
