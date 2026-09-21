// Rehearses 04_challenges.sql on a LOCAL throwaway Postgres, every call made as role anon.   node supabase/test/run_challenges.js
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_test_ch_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const passed = ts => ({ AR: { stages: Object.fromEntries(ts.map(t => [({ 2: 'AR-04', 5: 'AR-05', 10: 'AR-06', 3: 'AR-09', 4: 'AR-10', 6: 'AR-13', 7: 'AR-14', 8: 'AR-15', 9: 'AR-16' })[t], { status: 'passed' }])) } });
(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query('set role anon'); try { return (await pg.query(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) v`, k.map(x => args[x] !== null && typeof args[x] === 'object' ? JSON.stringify(args[x]) : args[x]))).rows[0].v; } finally { await pg.query('reset role'); } };
  for (const f of ['test/00_baseline_guess.sql', '01_additive.sql', '02_lock.sql', '04_challenges.sql', '04_challenges.sql']) await file(f);

  const tok = {}, id = {};
  for (const [n, k, ts] of [['Айгүл', '3А', [2, 5, 10, 3]], ['Ерасыл', '3А', [2, 5, 10]], ['Дана', '3А', []], ['Бөтен', '3Ә', [2, 5, 10, 3, 4]], ['tester', '3А', [2, 5]]]) {
    const r = await rpc('esep_login', { p_name: n, p_pin: '1111', p_klass: k }); tok[n] = r.token; id[n] = r.student.id;
    await pg.query(`update students set state=$2 where id=$1`, [id[n], JSON.stringify(passed(ts))]); }

  let o = await rpc('esep_ch_options', { p_token: tok['Айгүл'] });
  T('options: only classmates who share a passed table — Ерасыл [2,5,10]; not Дана (none), not the other class, not tester', JSON.stringify(o.classmates.map(c => [c.name, c.tables])) === JSON.stringify([['Ерасыл', [2, 5, 10]]]) && JSON.stringify(o.mine) === '[2,3,5,10]', o);
  T('create: a table the opponent has not passed', (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Ерасыл'], p_table: 3 })).error === 'not_passed');
  T('create: another class', (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Бөтен'], p_table: 2 })).error === 'classmate');
  T('create: myself / tester / nonsense table', (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Айгүл'], p_table: 2 })).error === 'classmate'
    && (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['tester'], p_table: 2 })).error === 'classmate' && (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Ерасыл'], p_table: 11 })).error === 'table');
  const c = await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Ерасыл'], p_table: 5 });
  T('create: ten facts of the 5 table, each of 1…10 once', c.items.length === 10 && c.items.every(([a, b]) => a === 5 || b === 5) && JSON.stringify(c.items.map(([a, b]) => a === 5 ? b : a).sort((x, y) => x - y)) === JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), c.items);
  T('create: a second open challenge to the same classmate is refused', (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Ерасыл'], p_table: 2 })).error === 'already_open');
  T('before the challenger has played, the challenged pupil sees nothing', (await rpc('esep_ch_list', { p_token: tok['Ерасыл'] })).incoming.length === 0 && (await rpc('esep_ch_open', { p_token: tok['Ерасыл'], p_id: c.id })).error === 'not_found');

  const right = c.items.map(([a, b]) => a * b);
  const mine = right.slice(); mine[3] = 0; mine[7] = null;                                   // 8 of 10
  let r = await rpc('esep_ch_submit', { p_token: tok['Айгүл'], p_id: c.id, p_answers: mine, p_ms: 40000 });
  T('submit (challenger): marked by the server 8/10; time capped by what the server saw pass', r.waiting === true && r.my_ok === 8 && r.my_ms >= 1000 && r.my_ms < 40000, r);
  T('submit twice', (await rpc('esep_ch_submit', { p_token: tok['Айгүл'], p_id: c.id, p_answers: right, p_ms: 1 })).error === 'done');
  T('a third pupil can neither open nor submit', (await rpc('esep_ch_open', { p_token: tok['Дана'], p_id: c.id })).error === 'not_found' && (await rpc('esep_ch_submit', { p_token: tok['Дана'], p_id: c.id, p_answers: right, p_ms: 5000 })).error === 'not_found');

  const l = await rpc('esep_ch_list', { p_token: tok['Ерасыл'] });
  T('list (challenged): one incoming, and NOTHING about the challenger\'s result anywhere', l.incoming.length === 1 && l.incoming[0].from_name === 'Айгүл' && l.results.length === 0 && !/"(my|opp)_ok"|from_ok|"8"/.test(JSON.stringify(l)), l);
  T('submit before opening is refused (the clock starts on open)', (await rpc('esep_ch_submit', { p_token: tok['Ерасыл'], p_id: c.id, p_answers: right, p_ms: 5000 })).error === 'not_opened');
  const op = await rpc('esep_ch_open', { p_token: tok['Ерасыл'], p_id: c.id });
  T('open: the SAME ten facts, still no result', JSON.stringify(op.items) === JSON.stringify(c.items) && op.opp_name === 'Айгүл' && JSON.stringify(Object.keys(op).sort()) === JSON.stringify(['id', 'items', 'opp_name', 'table']), op);
  await pg.query(`update esep_private.challenges set to_opened_at = now() - interval '50 seconds', created_at = created_at - interval '2 minutes', from_ms = 41000 where id=$1`, [c.id]);
  r = await rpc('esep_ch_submit', { p_token: tok['Ерасыл'], p_id: c.id, p_answers: right.map(String).map((x, i) => i < 9 ? Number(x) : 'junk'), p_ms: 30000 });
  T('submit (challenged): 9/10 (a junk answer is just wrong) → wins, 3 stars, now sees both results', r.outcome === 'win' && r.my_ok === 9 && r.opp_ok === 8 && r.stars === 3 && r.my_ms === 30000, r);
  const la = await rpc('esep_ch_list', { p_token: tok['Айгүл'], p_mark_seen: true });
  T('list (challenger): result is there, flagged new, 1 star for losing', la.results.length === 1 && la.results[0].outcome === 'lose' && la.results[0].new === true && la.stars === 1 && la.waiting.length === 0, la);
  T('…and not new the second time', (await rpc('esep_ch_list', { p_token: tok['Айгүл'] })).results[0].new === false);

  // tie-break on time, dead heat, daily limit
  await pg.query(`insert into esep_private.challenges(from_id,to_id,tbl,items,from_ok,from_ms,from_done_at,to_opened_at,to_ok,to_ms,to_done_at) values ($1,$2,2,'[]',7,30000,now(),now(),7,29000,now()), ($1,$2,2,'[]',7,30000,now(),now(),7,30000,now())`, [id['Айгүл'], id['Ерасыл']]);
  const rs = (await rpc('esep_ch_list', { p_token: tok['Ерасыл'] })).results.map(x => [x.outcome, x.stars]);
  T('equal score → faster wins; equal time → dead heat 2/2', JSON.stringify(rs.slice(0, 2).sort()) === JSON.stringify([['tie', 2], ['win', 3]]), rs);
  T('daily limit: the 4th challenge started today is refused', (await rpc('esep_ch_create', { p_token: tok['Айгүл'], p_to: id['Ерасыл'], p_table: 2 })).error === 'daily_limit');
  await pg.query(`update esep_private.challenges set created_at = now() - interval '8 days', to_done_at = null, to_ok = null where id = $1`, [c.id]);
  T('an unanswered challenge lapses after 7 days', (await rpc('esep_ch_open', { p_token: tok['Ерасыл'], p_id: c.id })).error === 'expired' && (await rpc('esep_ch_list', { p_token: tok['Ерасыл'] })).incoming.length === 0);
  await pg.query('set role anon'); let denied = false; try { await pg.query(`select * from esep_private.challenges`); } catch (e) { denied = /permission denied/.test(e.message); } await pg.query('reset role');
  T('the challenges table itself is unreachable for the browser role', denied);
  T('dead token', (await rpc('esep_ch_list', { p_token: 'f'.repeat(48) })) === null && (await rpc('esep_ch_create', { p_token: 'f'.repeat(48), p_to: id['Ерасыл'], p_table: 2 })).error === 'session');

  await pg.end(); await admin.query(`drop database ${DB}`); await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message, e.where || ''); process.exit(2); });
