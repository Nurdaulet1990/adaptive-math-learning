// Rehearses 17_observations.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_obs.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
// The observer code, its throttle, what the assistant can and cannot do, what the teacher reads.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_obs_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };
(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_obs%'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  const ip = { v: '10.0.0.1' };
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query(`select set_config('request.headers',$1,false)`, [JSON.stringify({ 'x-forwarded-for': ip.v })]);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => typeof args[x] === 'object' && args[x] !== null ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };
  await file('test/00_baseline_guess.sql'); await file('01_additive.sql'); await file('08_classes.sql');
  await file('17_observations.sql'); await file('17_observations.sql');
  T('17 installs on 01 and is re-runnable', true);
  await pg.query(`select esep_private.set_teacher_secret('a long teacher phrase')`);
  const tt = (await rpc('esep_t_login', { p_secret: 'a long teacher phrase' })).token;
  const form = { kind: 'lesson', klass: '3а', routes: ['AR'], n: 12, mins: 40, devices: ['phone'], login: 'some', nlogin: 2, loginwhy: ['pin'], net: 'some', mood: 3, solo: 'half', good: 'жарыс ұнады', issues: [{ type: 'bug', who: 'Айгүл', where: 'AR-05', what: 'бет қатып қалды', did: 'жаңарттым' }], sugg: '' };

  // 1 ─ no code set: nothing goes in
  let r = await rpc('esep_obs_add', { p_code: 'anything', p_author: 'Көмекші', p_form: form });
  T('with no observer code set, a form is refused (code)', r && r.error === 'code', r);
  T('the teacher sees: code not set, 0 forms', (await rpc('esep_t_observer_status', { p_token: tt })).set === false, await rpc('esep_t_observer_status', { p_token: tt }));

  // 2 ─ the teacher sets the code; only the teacher can
  r = await rpc('esep_t_observer_code', { p_token: tt, p_code: ' Қыран2026 ' });
  T('the teacher sets the code (trimmed, case-insensitive)', r && r.set === true, r);
  T('a code of three characters is refused', (await rpc('esep_t_observer_code', { p_token: tt, p_code: 'abc' })).error === 'bad_input');
  let threw = false; try { await rpc('esep_t_observer_code', { p_token: 'x'.repeat(48), p_code: 'hacker' }); } catch (e) { threw = /teacher session/.test(e.message); }
  T('a stranger cannot set the code', threw);

  // 3 ─ the assistant adds a form
  r = await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'Көмекші', p_form: form });
  T('the right code (any case) stores the form and returns its id', r && r.id > 0, r);
  r = await rpc('esep_obs_add', { p_code: 'Қыран2026', p_author: 'Көмекші', p_form: { kind: 'feedback', period: 'аптасы', top: ['кіру қиын'], score: 4 } });
  T('a feedback sheet is stored with kind=feedback', r && r.id > 0, r);
  const list = await rpc('esep_t_observations', { p_token: tt });
  T('the teacher reads both, newest first, class upper-cased, the form as it came', list.length === 2 && list[0].kind === 'feedback' && list[1].klass === '3А' && list[1].form.issues[0].where === 'AR-05' && list[1].author === 'Көмекші', list.map(x => [x.kind, x.klass]));
  T('a pupil token / no token cannot read them', await (async () => { try { await rpc('esep_t_observations', { p_token: 'x'.repeat(48) }); return false; } catch (e) { return /teacher session/.test(e.message); } })());
  T('an oversized form is refused', (await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'К', p_form: { kind: 'lesson', good: 'x'.repeat(31000) } })).error === 'bad_input');
  T('a form that is not an object is refused', (await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'К', p_form: [1, 2] })).error === 'bad_input');
  T('an unknown kind is stored as a lesson', (await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'К', p_form: { kind: 'zzz' } })).id > 0 && (await rpc('esep_t_observations', { p_token: tt }))[0].kind === 'lesson');

  // 4 ─ the wrong code is throttled per address
  ip.v = '10.0.0.9';
  for (let i = 0; i < 10; i++) await rpc('esep_obs_add', { p_code: 'wrong' + i, p_author: 'К', p_form: form });
  r = await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'К', p_form: form });
  T('ten wrong codes from one address lock that address — even the right code is refused (locked)', r && r.error === 'locked', r);
  ip.v = '10.0.0.10';
  r = await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'К', p_form: form });
  T('…another address is not locked', r && r.id > 0, r);

  // 5 ─ delete, switch off
  const last = (await rpc('esep_t_observations', { p_token: tt }))[0].id;
  await rpc('esep_t_obs_delete', { p_token: tt, p_id: last });
  T('the teacher deletes a form', !(await rpc('esep_t_observations', { p_token: tt })).some(x => x.id === last));
  await rpc('esep_t_observer_code', { p_token: tt, p_code: '' });
  T('an empty code switches the form off', (await rpc('esep_obs_add', { p_code: 'қыран2026', p_author: 'К', p_form: form })).error === 'code' && (await rpc('esep_t_observer_status', { p_token: tt })).set === false);

  // 6 ─ the table is not reachable directly
  let denied = false; try { await asAnon(`select * from esep_private.observations`); } catch (e) { denied = /permission denied/.test(e.message); }
  T('anon cannot read esep_private.observations', denied);

  await pg.end(); const a2 = conn('postgres'); await a2.connect(); await a2.query(`drop database ${DB} with (force)`); await a2.query(`drop role if exists anon`); await a2.query(`drop role if exists authenticated`); await a2.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.stack || e.message); process.exit(2); });
