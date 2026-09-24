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

  // ── 10: a pupil places herself, once ──────────────────────────────────
  await file('10_my_class.sql'); await file('10_my_class.sql');
  const malTok = (await rpc('esep_login', { p_name: 'Малика', p_pin: '5555', p_klass: '', p_code: '' })).token;
  await pg.query(`update students set klass = '' where name = 'Малика'`);   // as she was: sixteen children were
  T('a pupil with no class may choose one from the list',
    (await rpc('esep_my_class', { p_token: malTok, p_klass: '5' })).klass === '5' &&
    (await val(`select klass v from students where name='Малика'`)) === '5');
  T('…and may not then move herself — that is the teacher\'s, or the board stops meaning anything',
    (await rpc('esep_my_class', { p_token: malTok, p_klass: '3Ә' })).error === 'already');
  await pg.query(`update students set klass = '' where name = 'Малика'`);
  T('a class that is not on the list is refused here too',
    (await rpc('esep_my_class', { p_token: malTok, p_klass: 'ЖОҚ' })).error === 'klass' &&
    (await val(`select coalesce(klass,'') v from students where name='Малика'`)) === '');
  T('a dead token gets nothing', (await rpc('esep_my_class', { p_token: 'nope', p_klass: '5' })).error === 'token');
  T('the teacher may still move anyone, placed or not',
    (await tcl('esep_t_set_class', { p_student: await one(`select id::text v from students where name='Малика'`).then(r => r.v), p_klass: '5' })) === true);

  // ── 13: the class carries its grade ───────────────────────────────────
  // The school has a Samuryq and a Qyran in grade 2 AND in grade 3. classes.name is the primary key, so
  // without the grade in front of the name the two Samuryqs are one row: one board, one average, ~50 pupils.
  await pg.query(`insert into esep_private.classes(name) values ('ARLAN') on conflict do nothing`);  // a name with no number in front, as a free-text era class could be
  await file('13_grades.sql'); await file('13_grades.sql');          // additive and re-runnable
  const gradeOf = async n => (await one(`select grade v from esep_private.classes where name=$1`, [n])).v;
  T('the four classes of this school are there, two per year',
    (await val(`select count(*)::int v from esep_private.classes where name in ('2 SAMURYQ','2 QYRAN','3 SAMURYQ','3 QYRAN')`)) === 4);
  T('Samuryq in grade 2 and Samuryq in grade 3 are two different classes',
    (await gradeOf('2 SAMURYQ')) === 2 && (await gradeOf('3 SAMURYQ')) === 3);
  T('the classes that were already there kept their number as their grade', (await gradeOf('5')) === 5);
  T('…and one whose name never began with a number has no grade, as before', (await gradeOf('ARLAN')) === null);

  const badGrade = async () => { try { await pg.query(`insert into esep_private.classes(name,grade) values ('QYRAN',2)`); return false; }
    catch (e) { return /classes_grade_matches_name/.test(e.message); } };
  T('the column can never disagree with the name: «QYRAN» filed under grade 2 is refused', await badGrade());

  T('the teacher types the name and picks the year; the stored name gets the year in front',
    (await tcl('esep_t_class_add', { p_name: 'Bürkit', p_grade: 4 })) && (await gradeOf('4 BÜRKIT')) === 4);
  T('a name that already starts with its year is not given a second one',
    (await tcl('esep_t_class_add', { p_name: '4 Sunqar', p_grade: 4 })) && (await gradeOf('4 SUNQAR')) === 4 &&
    (await val(`select count(*)::int v from esep_private.classes where name like '%SUNQAR%'`)) === 1);
  T('a name and a year that contradict each other are refused, not guessed at',
    (await tcl('esep_t_class_add', { p_name: '3Ә', p_grade: 2 })).error === 'grade' &&
    (await val(`select count(*)::int v from esep_private.classes where name='3Ә'`)) === 0);
  T('a cached teacher page that sends no year at all still works, and the year is read off the name',
    (await tcl('esep_t_class_add', { p_name: '1А' })) && (await gradeOf('1А')) === 1);
  T('a name login would refuse for length is refused here, not left for a pupil to fail on',
    (await tcl('esep_t_class_add', { p_name: 'QARLYGASHTAR', p_grade: 2 })).error === 'long' &&
    (await val(`select count(*)::int v from esep_private.classes where name like '%QARLYG%'`)) === 0);
  T('the list a pupil picks from comes back in year order',
    JSON.stringify((await rpc('esep_classes', {})).slice(0, 3)) === JSON.stringify(['1А', '2 QYRAN', '2 SAMURYQ']),
    await rpc('esep_classes', {}));
  T('the teacher\'s list reports the year for every class',
    ((await tcl('esep_t_classes', {})) || []).filter(c => c.name === '2 QYRAN')[0].grade === 2);

  // and the payoff: «2 SAMURYQ» is 9 characters, so a child can actually log into it, and the board then
  // compares her class with the OTHER class of her year — not with the third-graders.
  await pg.query(`insert into students(name,pin,klass) values
    ('Аяна','1010','2 SAMURYQ'),('Бекзат','1011','2 SAMURYQ'),('Дамир','1012','2 SAMURYQ'),
    ('Ерке','1013','2 QYRAN'),('Жанель','1014','2 QYRAN'),('Зере','1015','2 QYRAN'),
    ('Иман','1016','3 SAMURYQ'),('Küläş','1017','3 SAMURYQ'),('Лаура','1018','3 SAMURYQ')`);
  await pg.query(`update students s set last_seen = now(),
    state = jsonb_build_object('AR', jsonb_build_object('stages', (
      select jsonb_object_agg('AR-' || lpad(i::text,2,'0'),
               jsonb_build_object('status','passed','tests', jsonb_build_array(jsonb_build_object('t', $1::bigint, 'ok', 10, 'n', 10))))
        from generate_series(1, q.k) i)))
    from (select id, row_number() over (order by name)::int as k from students where name !~* 'tester') q
   where q.id = s.id`, [Date.now()]);
  const ayanaLogin = await rpc('esep_login', { p_name: 'Аяна', p_pin: '1010', p_klass: '2 SAMURYQ', p_code: '' });
  T('a nine-character class name passes the login check', !!ayanaLogin.token && ayanaLogin.student.klass === '2 SAMURYQ', ayanaLogin);
  const brd2 = await rpc('esep_board', { p_token: ayanaLogin.token });
  const seen = (brd2.classes || []).map(c => c.klass).sort();
  T('her board compares her class with the other class of her year, and with no other year',
    JSON.stringify(seen) === JSON.stringify(['2 QYRAN', '2 SAMURYQ']), seen);
  T('and she is ranked inside her own three, not across the whole year', brd2.me.of === 3, brd2.me);

  // ── the 405: a public esep_* function must be VOLATILE ──────────────────
  // PostgREST serves a STABLE or IMMUTABLE function over GET only and answers a POST with 405, before the
  // function runs. core.js posts everything. On 2026-09-21 this took the class board and the star purse off
  // the air with a perfectly correct database underneath — the two dead functions were precisely the two
  // marked `stable`. Nothing in SQL can see this, so it is checked here, on the catalog.
  const nonVolatile = async () => (await pg.query(`select p.oid::regprocedure::text as sig,
        case p.provolatile when 's' then 'stable' else 'immutable' end as vol
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname like 'esep\\_%' and p.provolatile <> 'v'`)).rows;
  T('every public esep_* function is volatile — a stable one is a 405 in the browser',
    (await nonVolatile()).length === 0, await nonVolatile());
  await pg.query(`alter function public.esep_classes() stable`);          // break it on purpose…
  T('…and the check really would catch one', (await nonVolatile()).length === 1);
  await file('12_volatile.sql'); await file('12_volatile.sql');     // …and 12 heals it, twice over
  T('12 turns them all back, and running it again is a no-op', (await nonVolatile()).length === 0, await nonVolatile());

  const failed = out.filter(x => !x).length;
  console.log(failed ? `${failed} FAILED of ${out.length}` : `ALL ${out.length} PASS`);
  await pg.end();
  const g = conn('postgres'); await g.connect(); await g.query(`drop database ${DB} with (force)`); await g.end();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
