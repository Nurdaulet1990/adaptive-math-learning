// Rehearses 15_klass_lock.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_klass_lock.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
// A pupil's class is set once; only the teacher moves her afterwards.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_kl_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

(async () => {
  // ── 0. 15's esep_login is 08's, apart from the one marked line ──
  const grab = f => /create or replace function public\.esep_login[\s\S]*?\nend \$\$;/.exec(fs.readFileSync(path.join(DIR, f), 'utf8'))[0].split('\n');
  const a = grab('08_classes.sql'), b = grab('15_klass_lock.sql');
  const da = a.filter(x => !b.includes(x)), db = b.filter(x => !a.includes(x));
  T('15\'s esep_login differs from 08\'s only in the class line', da.length === 1 && /klass = case when v_klass/.test(da[0]) && db.length === 2 && db.some(l => /← 15/.test(l)), { da, db });
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const one = async (sql, args) => (await pg.query(sql, args)).rows[0];
  const val = async (sql, args) => (await one(sql, args)).v;
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  let IP = '10.0.0.1';
  const rpc = async (fn, args) => { const k = Object.keys(args);
    await pg.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'cf-connecting-ip': IP })]);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => typeof args[x] === 'object' && args[x] !== null ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };
  await file('test/00_baseline_guess.sql'); await file('01_additive.sql'); await file('08_classes.sql'); await file('10_my_class.sql');
  await pg.query(`insert into esep_private.classes(name) values ('3А'),('3Ә') on conflict do nothing`);
  await file('15_klass_lock.sql'); await file('15_klass_lock.sql');
  T('15 installs on 01 + 08 + 10 and is re-runnable', true);
  const login = (n, p, k) => rpc('esep_login', { p_name: n, p_pin: p, p_klass: k || '', p_code: '' });
  const r1 = await login('Жаңа Оқушы', '1234', '3А');
  T('a new pupil gets the class she chose at registration', r1.token && r1.student && r1.student.klass === '3А', r1);
  const r2 = await login('Жаңа Оқушы', '1234', '3Ә');
  T('logging in again with another class does NOT move her', r2.token && r2.student.klass === '3А' && (await val(`select klass v from students where name='Жаңа Оқушы'`)) === '3А', r2);
  await pg.query(`insert into students(name, klass, pin_hash, state) values ('Ескі Оқушы', '', crypt('5555', gen_salt('bf',4)), '{}')`);
  const r3 = await login('Ескі Оқушы', '5555', '3Ә');
  T('an old account with no class takes one on its first choice', r3.student.klass === '3Ә', r3);
  const r4 = await login('Ескі Оқушы', '5555', '3А');
  T('…and keeps it after that', r4.student.klass === '3Ә', r4);
  const my = await rpc('esep_my_class', { p_token: r2.token, p_klass: '3Ә' });
  T('esep_my_class still refuses a pupil who has a class', my && my.error === 'already', my);
  const bad = await login('Жаңа Оқушы', '1234', 'ЖОҚ');
  T('a class that is not in the list is still refused', bad && bad.error === 'klass', bad);
  await pg.query(`select esep_private.set_teacher_secret('a long teacher phrase')`);
  const tt = (await rpc('esep_t_login', { p_secret: 'a long teacher phrase' })).token;
  const id = await val(`select id::text v from students where name='Жаңа Оқушы'`);
  const mv = await rpc('esep_t_set_klass', { p_token: tt, p_student: id, p_klass: '3ә' });
  T('the teacher moves a pupil (case-insensitive)', mv && mv.klass === '3Ә' && (await val(`select klass v from students where id::text=$1`, [id])) === '3Ә', mv);
  T('…to listed classes only', (await rpc('esep_t_set_klass', { p_token: tt, p_student: id, p_klass: '9Z' })).error === 'klass');
  T('…and can clear it', (await rpc('esep_t_set_klass', { p_token: tt, p_student: id, p_klass: '' })).klass === '');
  let denied = false; try { await rpc('esep_t_set_klass', { p_token: r2.token, p_student: id, p_klass: '3А' }); } catch (e) { denied = /teacher session required/.test(e.message); }
  T('a pupil\'s token cannot move anyone', denied);
  T('esep_login and esep_t_set_klass stay VOLATILE', (await val(`select bool_and(provolatile='v') v from pg_proc where proname in ('esep_login','esep_t_set_klass')`)) === true);
  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end(); const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
