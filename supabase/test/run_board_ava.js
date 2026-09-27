// Rehearses 14_board_ava.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_board_ava.js     (expects a server on /tmp:54329, superuser postgres, trust auth)
// The board now carries each pupil's animal. What must hold: the ranking is exactly 07's, the field is there
// for the top rows and for me, and a state that says anything but one of the eight animals shows nobody anything.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_ava_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep\\_%' escape '\\'`)).rows) await admin.query(`drop database ${d.datname} with (force)`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`);
  await admin.query(`create database ${DB}`); await admin.end();
  const pg = conn(DB); await pg.connect();
  const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const asAnon = async (sql, args) => { await pg.query('set role anon'); try { return await pg.query(sql, args); } finally { await pg.query('reset role'); } };
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query(`select set_config('request.headers','{}',false)`);
    const r = await asAnon(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) as v`, k.map(x => typeof args[x] === 'object' && args[x] !== null ? JSON.stringify(args[x]) : args[x])); return r.rows[0].v; };

  await file('test/00_baseline_guess.sql');
  await pg.query(`insert into students(name,pin,klass) values ('Айгүл С.','1111','3А'),('Ерасыл Т.','2222','3А'),('Дана К.','3333','3А'),('Нұрлан Б.','4444','3А'),('Әли Ж.','5555','3А')`);
  await file('01_additive.sql'); await file('06_stars.sql'); await file('07_practice_stars.sql');
  const tok = async (n, p) => (await rpc('esep_login', { p_name: n, p_pin: p, p_klass: '', p_code: '' })).token;
  const t = { A: await tok('Айгүл С.', '1111') };
  // one passed stage test each, different scores so the ranking is fixed; animals set the way core.js writes them
  const set = (name, ok, ava) => pg.query(`update students set last_seen = now(), state = $2::jsonb where name = $1`,
    [name, JSON.stringify(Object.assign({ AR: { stages: { 'AR-01': { status: 'passed', tests: [{ t: Date.now(), ok, n: 10 }] } } } }, ava === undefined ? {} : { _ava: ava }))]);
  await set('Дана К.', 10, '🦉'); await set('Ерасыл Т.', 9, '🐻'); await set('Нұрлан Б.', 8, '<img src=x onerror=alert(1)>');
  await set('Айгүл С.', 8, '🦊'); await set('Әли Ж.', 10, '🐙');
  const before = await rpc('esep_board', { p_token: t.A });

  await file('14_board_ava.sql'); await file('14_board_ava.sql');
  T('14 installs on 01 + 06 + 07 and is re-runnable', true);
  const b = await rpc('esep_board', { p_token: t.A });
  const strip = x => JSON.parse(JSON.stringify(x, (k, v) => k === 'ava' ? undefined : v));
  T('the ranking is exactly 07\'s — only `ava` was added', JSON.stringify(strip(b)) === JSON.stringify(before), { before, b });
  const by = n => (b.top || []).find(x => x.name === n) || {};
  T('the top rows carry the animals', by('Дана К.').ava === '🦉' && by('Ерасыл Т.').ava === '🐻', b.top);
  T('me carries my animal', b.me && b.me.ava === '🦊', b.me);
  T('markup in _ava never leaves the server', by('Нұрлан Б.').ava === null && !JSON.stringify(b).includes('<img'), by('Нұрлан Б.'));
  T('an animal outside the eight is null too', by('Әли Ж.').ava === null, by('Әли Ж.'));
  const vol = (await pg.query(`select provolatile v from pg_proc where proname='esep_board'`)).rows[0].v;
  T('esep_board stays VOLATILE (a stable one answers the browser 405)', vol === 'v', vol);
  await file('02_lock.sql');                                    // production has the lock on: rehearse with it
  let denied = false; try { await asAnon(`select * from public.students`); } catch (e) { denied = true; }
  T('anon still cannot read the table', denied);
  T('with the lock on, anon can still call the board and it still carries animals', ((await rpc('esep_board', { p_token: t.A })) || {}).me.ava === '🦊');

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end();
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
