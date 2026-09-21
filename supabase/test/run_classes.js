// Rehearses 08_classes.sql on a LOCAL throwaway Postgres (never the real project):
//   node supabase/test/run_classes.js        (expects a server on /tmp:54329, superuser postgres, trust auth)
// The class stops being a free-text box. Most of what is checked here is that the REST of esep_login — which
// this script replaces to add one line — still behaves exactly as 01 wrote it: the legacy plaintext-PIN path,
// the two rate limits, the join code, duplicate names. Retyping that function by hand quietly broke four of
// those before this file existed, which is why the first test compares the two bodies character by character.
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_cls_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (name, ok, extra) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(extra)); };

(async () => {
  // ── 0. the splice itself: 08's esep_login must be 01's, plus only the added block ──
  const grab = f => { const s = fs.readFileSync(path.join(DIR, f), 'utf8');
    return /create or replace function public\.esep_login[\s\S]*?\nend \$\$;\n/.exec(s)[0]; };
  const a = grab('01_additive.sql').split('\n');
  const b = grab('08_classes.sql').split('\n').filter(l => !/ADDED BY 08_classes\.sql|never typed, so anything else|c\.name = v_klass|'error','klass'/.test(l));
  T('08\'s copy of esep_login is 01\'s, line for line, apart from the added class check',
    a.join('\n') === b.join('\n'), { only_in_01: a.filter(x => !b.includes(x)).slice(0, 3), only_in_08: b.filter(x => !a.includes(x)).slice(0, 3) });

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

  await file('test/00_baseline_guess.sql');
  // the mess as it stands today: one real class spelled four ways, one child with no class at all
  await pg.query(`insert into students(name,pin,klass) values
    ('Айгүл С.','1111','5'),('Ерасыл Т.','2222','5 БАРЫС'),('Дана К.','3333','БАРЫС5'),
    ('Нұрлан Б.','4444','5БАРЫС'),('Малика','5555',''),('tester','0000','9Z')`);
  await file('01_additive.sql');
  await file('08_classes.sql'); await file('08_classes.sql');
  T('08 installs on 01 and is re-runnable', true);

  const list = async () => rpc('esep_classes', {});
  T('the list is seeded from the pupils who already exist, tester excluded',
    JSON.stringify(await list()) === JSON.stringify(['5', '5 БАРЫС', '5БАРЫС', 'БАРЫС5']), await list());
  T('anyone may read the list — the login card needs it before there is a session', Array.isArray(await list()));

  // ── login only accepts a class from the list ──────────────────────────
  T('a class from the list is accepted', !!(await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '1111', p_klass: '5', p_code: '' })).token);
  T('a class that is not on the list is refused, and the pupil is not created',
    (await rpc('esep_login', { p_name: 'Жаңа Бала', p_pin: '9999', p_klass: '7Г', p_code: '' })).error === 'klass' &&
    (await val(`select count(*)::int v from students where name='Жаңа Бала'`)) === 0);
  T('an empty class is still allowed — a child can be placed by the teacher later',
    !!(await rpc('esep_login', { p_name: 'Жаңа Бала', p_pin: '9999', p_klass: '', p_code: '' })).token);
  T('the check is case- and space-insensitive, like everything else about a class',
    !!(await rpc('esep_login', { p_name: 'Дана К.', p_pin: '3333', p_klass: ' барыс5 ', p_code: '' })).token);

  // ── the rest of 01's login still works ────────────────────────────────
  await pg.query(`insert into students(name,pin,klass) values ('Ескі Оқушы','7777','5')`);   // no pin_hash: a pupil from before step 1
  await pg.query(`update students set pin_hash = null where name='Ескі Оқушы'`);
  const legacy = await rpc('esep_login', { p_name: 'Ескі Оқушы', p_pin: '7777', p_klass: '', p_code: '' });
  T('a pupil who never used the new client can still log in, and is hashed on the way through',
    !!legacy.token && (await val(`select (pin_hash is not null) v from students where name='Ескі Оқушы'`)) === true, legacy);
  T('a wrong PIN is still a wrong PIN', (await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '0000', p_klass: '', p_code: '' })).error === 'pin');
  IP = '10.0.0.9';
  for (let i = 0; i < 8; i++) await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '0001', p_klass: '', p_code: '' });
  T('eight misses from one address still lock that address out of that name',
    (await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '1111', p_klass: '', p_code: '' })).error === 'locked');
  IP = '10.0.0.1';
  T('…and only that address: the real child elsewhere is unaffected',
    !!(await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '1111', p_klass: '', p_code: '' })).token);
  await pg.query(`select esep_private.set_join_code('алма27')`);
  T('the join code still gates a new name', (await rpc('esep_login', { p_name: 'Тағы Бала', p_pin: '4321', p_klass: '', p_code: 'wrong' })).error === 'code');
  T('…and lets it through when right', !!(await rpc('esep_login', { p_name: 'Тағы Бала', p_pin: '4321', p_klass: '', p_code: 'АЛМА27' })).token);
  await pg.query(`select esep_private.set_join_code('')`);

  // ── the teacher's tools ───────────────────────────────────────────────
  await pg.query(`select esep_private.set_teacher_secret('a long teacher phrase')`);
  const tt = (await rpc('esep_t_login', { p_secret: 'a long teacher phrase' })).token;
  const tcl = async (fn, args) => rpc(fn, Object.assign({ p_token: tt }, args));
  let cl = await tcl('esep_t_classes', {});
  T('the teacher sees every class with its pupil count', cl.find(c => c.name === '5').pupils === 2 && cl.find(c => c.name === 'БАРЫС5').pupils === 1, cl);
  cl = await tcl('esep_t_class_add', { p_name: '3ә' });
  T('a class can be created before anyone is in it', cl.some(c => c.name === '3Ә' && c.pupils === 0), cl);
  cl = await tcl('esep_t_class_merge', { p_from: '5 БАРЫС', p_into: '5' });
  cl = await tcl('esep_t_class_merge', { p_from: 'БАРЫС5', p_into: '5' });
  cl = await tcl('esep_t_class_merge', { p_from: '5БАРЫС', p_into: '5' });
  T('merging moves the pupils and removes the spelling: one class of five, not four of one',
    cl.find(c => c.name === '5').pupils === 5 && !cl.some(c => /БАРЫС/.test(c.name)), cl);
  T('the merged spellings are gone from what a pupil can pick', !(await list()).some(k => /БАРЫС/.test(k)), await list());
  T('merging into a class that does not exist is refused', (await tcl('esep_t_class_merge', { p_from: '5', p_into: 'НЕТУ' })).error === 'into');
  T('a class with pupils in it cannot be deleted', (await tcl('esep_t_class_delete', { p_name: '5' })).error === 'not_empty');
  cl = await tcl('esep_t_class_delete', { p_name: '3Ә' });
  T('an empty one can', !cl.some(c => c.name === '3Ә'), cl);
  const mal = await val(`select id::text v from students where name='Малика'`);
  T('the teacher can put the classless child into a class', (await tcl('esep_t_set_class', { p_student: mal, p_klass: '5' })) === true &&
    (await val(`select klass v from students where name='Малика'`)) === '5');
  T('…but not into one that is not on the list', (await tcl('esep_t_set_class', { p_student: mal, p_klass: 'ЖОҚ' })) === false);

  // ── and the board, which is what all of this was for ──────────────────
  await file('06_stars.sql');
  // distinct totals, or every pupil ties at rank 1 and «top five» honestly returns all of them
  await pg.query(`update students s set last_seen = now(),
    state = jsonb_build_object('AR', jsonb_build_object('stages', (
      select jsonb_object_agg('AR-' || lpad(i::text,2,'0'),
               jsonb_build_object('status','passed','tests', jsonb_build_array(jsonb_build_object('t', $1::bigint, 'ok', 10, 'n', 10))))
        from generate_series(1, q.k) i)))
    from (select id, row_number() over (order by name)::int as k from students where name !~* 'tester') q
   where q.id = s.id`, [Date.now()]);
  const brd = await rpc('esep_board', { p_token: (await rpc('esep_login', { p_name: 'Айгүл С.', p_pin: '1111', p_klass: '', p_code: '' })).token });
  T('the class board finally has a class to show: six pupils in one, not one pupil in each of six',
    brd.me.of === 6 && brd.top.length === 5, { of: brd.me && brd.me.of, top: (brd.top || []).length });
  T('a pupil sees where she stands among them', brd.me.rank >= 1 && brd.me.rank <= 6, brd.me);

  // ── the browser role ──────────────────────────────────────────────────
  const denied = async sql => { try { await asAnon(sql); return false; } catch (e) { return /permission denied|does not exist/.test(e.message); } };
  T('the class table itself is out of reach', await denied(`select * from esep_private.classes`));
  T('a pupil cannot call the teacher\'s class tools', (await rpc('esep_t_class_add', { p_token: 'nope', p_name: 'X' }).catch(e => ({ err: e.message }))).err !== undefined);

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end();
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
