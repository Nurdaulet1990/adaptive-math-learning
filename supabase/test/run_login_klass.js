// Rehearses 18_login_klass.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_login_klass.js      (expects a server on /tmp:54329, superuser postgres, trust auth)
// A pupil signs in with her name, her PIN and her class; two children with one name in two classes are two accounts.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_lk_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const val = async (sql, args) => (await pg.query(sql, args)).rows[0].v;
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  let IP = '10.0.0.1';
  const rpc = async (fn, args) => { const k = Object.keys(args);
    await pg.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'cf-connecting-ip': IP })]);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => args[x])); return r.rows[0].v; };
  await file('test/00_baseline_guess.sql'); await file('01_additive.sql'); await file('08_classes.sql'); await file('10_my_class.sql');
  await pg.query(`insert into esep_private.classes(name) values ('2 SAMURYQ'),('3 QYRAN') on conflict do nothing`);
  await pg.query(`insert into esep_private.config(key,value) values ('join_code','mektep') on conflict (key) do update set value=excluded.value`);
  await file('15_klass_lock.sql'); await file('18_login_klass.sql'); await file('18_login_klass.sql');
  T('18 installs on 01 + 08 + 10 + 15 and is re-runnable', true);
  const login = (n, p, k, c) => rpc('esep_login', { p_name: n, p_pin: p, p_klass: k || '', p_code: c || '' });
  const id = r => r && r.student && r.student.id;
  const fails = () => val(`select count(*)::int v from esep_private.login_fails where name_key not like '#%'`);

  T('no class → klass_needed', (await login('Аружан', '1111', '', 'mektep')).error === 'klass_needed');
  T('a class that is not on the list → klass', (await login('Аружан', '1111', '9 Ж', 'mektep')).error === 'klass');
  const a = await login('Аружан', '1111', '2 SAMURYQ', 'mektep');
  T('a new pupil registers in her class', id(a) && a.student.klass === '2 SAMURYQ', a);
  T('she signs in again: same account', id(await login('Аружан', '1111', '2 SAMURYQ')) === id(a));
  T('…with her name in lower case and extra spaces: same account', id(await login('  аружан ', '1111', '2 SAMURYQ')) === id(a));
  const f0 = await fails(); const w = await login('Аружан', '1111', '3 QYRAN');
  T('right name and PIN, WRONG class → klass_wrong, no token', w.error === 'klass_wrong' && !w.token, w);
  T('…and it is not counted as a failed PIN', (await fails()) === f0);
  T('…and her class is unchanged', (await val(`select klass v from students where id::text=$1`, [id(a)])) === '2 SAMURYQ');

  // the case that was found: another child with the same name and the same PIN, in another class
  IP = '10.0.0.2';
  const b = await login('Аружан', '1111', '3 QYRAN', 'mektep');
  T('ANOTHER Аружан, same PIN 1111, in 3 QYRAN: does NOT get the first one\'s account', !b.token && b.error === 'klass_wrong', b);
  const b2 = await login('Аружан', '7777', '3 QYRAN', 'mektep');
  T('…with another PIN: told to change her name (pin), as before', b2.error === 'pin', b2);
  const b3 = await login('Аружан С.', '1111', '3 QYRAN', 'mektep');
  T('«Аружан С.» registers in 3 QYRAN: a different account', id(b3) && id(b3) !== id(a) && b3.student.klass === '3 QYRAN', b3);

  // two same-name accounts that already exist (made before this rule) with the same PIN: each class opens its own
  await pg.query(`insert into students(name, klass, pin_hash, state, created_at) values ('Дана', '3 QYRAN', crypt('1234', gen_salt('bf',4)), '{}', now() - interval '2 days'), ('Дана', '2 SAMURYQ', crypt('1234', gen_salt('bf',4)), '{}', now() - interval '1 day')`);
  const d3 = await login('Дана', '1234', '3 QYRAN'), d2 = await login('Дана', '1234', '2 SAMURYQ');
  T('two existing «Дана», both PIN 1234: 3 QYRAN opens the 3 QYRAN one', d3.student && d3.student.klass === '3 QYRAN', d3);
  T('…and 2 SAMURYQ opens the 2 SAMURYQ one (it used to open the older one for both)', d2.student && d2.student.klass === '2 SAMURYQ' && id(d2) !== id(d3), d2);

  // an old account with no class
  await pg.query(`insert into students(name, klass, pin_hash, state) values ('Ескі Оқушы', '', crypt('5555', gen_salt('bf',4)), '{}')`);
  const o = await login('Ескі Оқушы', '5555', '3 QYRAN');
  T('an old account with no class signs in with the class she picks, and keeps it', o.student && o.student.klass === '3 QYRAN', o);
  T('…after that, another class is wrong for her too', (await login('Ескі Оқушы', '5555', '2 SAMURYQ')).error === 'klass_wrong');

  // a plain account (the PIN still in clear, from before 01) in her class
  await pg.query(`insert into students(name, klass, pin, state) values ('Пин Ескі', '2 SAMURYQ', '4321', '{}')`).catch(() => pg.query(`insert into students(name, klass, pin_hash, state) values ('Пин Ескі', '2 SAMURYQ', crypt('4321', gen_salt('bf',4)), '{}')`));
  T('an old account in her class still signs in', !!id(await login('Пин Ескі', '4321', '2 SAMURYQ')));

  // the lock still works, and klass_wrong never feeds it
  IP = '10.0.0.3';
  for (let i = 0; i < 9; i++) await login('Аружан', '1111', '3 QYRAN');
  T('nine wrong-class tries do not lock her out', !!id(await login('Аружан', '1111', '2 SAMURYQ')));
  for (let i = 0; i < 8; i++) await login('Аружан', '0000', '2 SAMURYQ');
  T('eight wrong PINs still lock that name from that address', (await login('Аружан', '1111', '2 SAMURYQ')).error === 'locked');
  T('anon may call it', (await val(`select has_function_privilege('anon','public.esep_login(text,text,text,text)','execute') v`)) === true);

  await pg.end(); const ad = conn('postgres'); await ad.connect(); await ad.query(`drop database ${DB} with (force)`); await ad.query('drop role if exists anon'); await ad.query('drop role if exists authenticated'); await ad.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
