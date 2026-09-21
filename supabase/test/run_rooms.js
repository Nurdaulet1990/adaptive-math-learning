// Rehearses 05_rooms.sql on a LOCAL throwaway Postgres, every call made as role anon.   node supabase/test/run_rooms.js
const { Client } = require(process.env.PG_MODULE || 'pg'); const fs = require('fs'), path = require('path');
const DIR = path.join(__dirname, '..'); const DB = 'esep_test_rm_' + Date.now();
const conn = db => new Client({ host: process.env.PGHOST || '/tmp', port: +(process.env.PGPORT || 54329), user: 'postgres', database: db });
const out = []; const T = (n, ok, x) => { out.push(ok); console.log(ok ? 'PASS' : 'FAIL', n, ok ? '' : JSON.stringify(x)); };
const st = (...ids) => Object.fromEntries(ids.map(i => [i, { status: 'passed' }]));
(async () => {
  const admin = conn('postgres'); await admin.connect();
  for (const d of (await admin.query(`select datname from pg_database where datname like 'esep_test_%'`)).rows) await admin.query(`drop database ${d.datname}`);
  await admin.query(`drop role if exists anon`); await admin.query(`drop role if exists authenticated`); await admin.query(`create database ${DB}`);
  const pg = conn(DB); await pg.connect(); const file = f => pg.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const rpc = async (fn, args) => { const k = Object.keys(args); await pg.query('set role anon'); try { return (await pg.query(`select public.${fn}(${k.map((x, i) => `${x} => $${i + 1}`).join(', ')}) v`, k.map(x => args[x] !== null && typeof args[x] === 'object' ? JSON.stringify(args[x]) : args[x]))).rows[0].v; } finally { await pg.query('reset role'); } };
  const denied = async sql => { await pg.query('set role anon'); try { await pg.query(sql); return false; } catch (e) { return /permission denied|does not exist/.test(e.message); } finally { await pg.query('reset role'); } };
  for (const f of ['test/00_baseline_guess.sql', '01_additive.sql', '02_lock.sql']) await file(f);
  await file('05_rooms.sql'); await file('05_rooms.sql');   // 04 is NOT installed: rooms no longer need it
  await pg.query(`select esep_private.set_teacher_secret('мұғалім-құпиясы-2026')`);
  const TT = (await rpc('esep_t_login', { p_secret: 'мұғалім-құпиясы-2026' })).token;

  const tok = {}, id = {};
  const STATES = { 'Айгүл': { AR: { stages: st('AR-05', 'AR-14') }, FR: { stages: Object.assign(st('FR-03'), { 'FR-04': { status: 'current' } }) }, TE: { stages: st('TE-02') } },
    'Ерасыл': { AR: { stages: st('AR-05') } }, 'Дана Қасымова': {}, 'Бөтен': { stages: st('WP-02'), diag: {} },   // a WP state from before the routes were split: at the top level
    'Санжар': { AR: { stages: st('AR-05') } }, 'Мадина': { AR: { stages: st('AR-05') } } };
  for (const [n, k] of [['Айгүл', '3А'], ['Ерасыл', '3А'], ['Дана Қасымова', '3А'], ['Бөтен', '4Б'], ['Санжар', '3А'], ['Мадина', '3А']]) {
    const r = await rpc('esep_login', { p_name: n, p_pin: '1111', p_klass: k }); tok[n] = r.token; id[n] = r.student.id; await pg.query(`update students set state=$2 where id=$1`, [id[n], JSON.stringify(STATES[n])]); }
  const mk = (n, route, stage, extra) => rpc('esep_room_create', Object.assign({ p_token: tok[n], p_route: route, p_stage: stage }, extra || {}));
  // a sheet as the page reports it: `right` of `total` marked right
  const sheet = (right, total = 10) => Array.from({ length: total }, (_, i) => ({ q: `${i + 2} × 5`, a: String((i + 2) * 5), g: i < right ? String((i + 2) * 5) : '1', ok: i < right }));

  // ── opening a room: any station I have passed, in any route
  T('create: a station I have not passed / one I am only working on / junk / a route without generators / no session',
    (await mk('Ерасыл', 'AR', 'AR-14')).error === 'not_passed' && (await mk('Айгүл', 'FR', 'FR-04')).error === 'not_passed' && (await mk('Айгүл', 'AR', 'AR-5')).error === 'stage'
    && (await mk('Айгүл', 'FR', 'AR-05')).error === 'stage' && (await mk('Айгүл', 'PV', 'PV-01')).error === 'stage' && (await mk('Дана Қасымова', 'AR', 'AR-05')).error === 'not_passed'
    && (await rpc('esep_room_create', { p_token: 'x'.repeat(48), p_route: 'AR', p_stage: 'AR-05' })).error === 'session');
  let l = await rpc('esep_room_list', { p_token: tok['Айгүл'] });
  T('list: what I may host = every passed station of every route (AR-05, AR-14, FR-03, TE-02 — not FR-04)', JSON.stringify(l.can_host.map(c => c.stage)) === JSON.stringify(['AR-05', 'AR-14', 'FR-03', 'TE-02']), l.can_host);
  T('…including a WP state that still lives at the top level', JSON.stringify((await rpc('esep_room_list', { p_token: tok['Бөтен'] })).can_host) === JSON.stringify([{ route: 'WP', stage: 'WP-02' }]) && (await mk('Бөтен', 'WP', 'WP-02')).id > 0);
  await rpc('esep_room_leave', { p_token: tok['Бөтен'], p_id: (await rpc('esep_room_list', { p_token: tok['Бөтен'] })).mine.id });
  const R = await mk('Айгүл', 'FR', 'FR-03', { p_n: 99, p_secs: 5 });
  T('create: a four-digit code; the host is the first player', /^\d{4}$/.test(R.code) && R.id > 0, R);
  T('create again while it is live: the same room comes back, no second one', (await mk('Айгүл', 'AR', 'AR-05')).id === R.id);
  let s = await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id });
  T('state (lobby): route + station, the page\'s wishes kept within 3…12 questions and 1…10 minutes, NO seed yet', s.status === 'lobby' && s.is_host && s.n === 1 && s.route === 'FR' && s.stage === 'FR-03'
    && s.n_items === 12 && s.secs === 60 && !('seed' in s) && JSON.stringify(s.players) === '["Айгүл"]', s);
  T('start alone is refused', (await rpc('esep_room_start', { p_token: tok['Айгүл'], p_id: R.id })).error === 'alone');

  // ── finding it, joining it
  l = await rpc('esep_room_list', { p_token: tok['Ерасыл'] });
  T('list: a classmate sees the open room (no code needed); the host sees it as «mine»; another class sees nothing', l.open.length === 1 && l.open[0].host_name === 'Айгүл' && l.open[0].stage === 'FR-03'
    && (await rpc('esep_room_list', { p_token: tok['Айгүл'] })).mine.id === R.id && (await rpc('esep_room_list', { p_token: tok['Бөтен'] })).open.length === 0, l);
  T('join: wrong code / junk', (await rpc('esep_room_join', { p_token: tok['Ерасыл'], p_code: '0000' })).error === 'not_found' && (await rpc('esep_room_join', { p_token: tok['Ерасыл'], p_code: "1' or 1=1" })).error === 'not_found');
  const je = await rpc('esep_room_join', { p_token: tok['Ерасыл'], p_code: R.code });
  T('join by code: a classmate who has NOT passed this station is let in, and told so; another class too; twice is harmless', je.id === R.id && je.not_passed === true
    && (await rpc('esep_room_join', { p_token: tok['Бөтен'], p_code: R.code })).id === R.id && (await rpc('esep_room_join', { p_token: tok['Ерасыл'], p_code: ' ' + R.code + ' ' })).id === R.id, je);
  await rpc('esep_room_join', { p_token: tok['Дана Қасымова'], p_code: R.code }); await rpc('esep_room_join', { p_token: tok['Санжар'], p_code: R.code });
  T('an outsider cannot look into the room', (await rpc('esep_room_state', { p_token: tok['Мадина'], p_id: R.id })).error === 'not_found');
  T('a host cannot wander into another room', (await mk('Мадина', 'AR', 'AR-05')).id > 0 && (await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: R.code })).error === 'hosting');
  await rpc('esep_room_leave', { p_token: tok['Мадина'], p_id: (await rpc('esep_room_list', { p_token: tok['Мадина'] })).mine.id });
  T('…after closing her own lobby she can', (await rpc('esep_room_list', { p_token: tok['Мадина'] })).mine === null && (await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: R.code })).id === R.id);
  T('pupils see first names only — the code lets the whole school in', JSON.stringify((await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id })).players).includes('"Дана"') && !JSON.stringify(await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id })).includes('Қасымова'));
  T('leave: a guest walks out of the lobby', (await rpc('esep_room_leave', { p_token: tok['Мадина'], p_id: R.id })) === true && (await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id })).n === 5);
  T('only the host can start', (await rpc('esep_room_start', { p_token: tok['Ерасыл'], p_id: R.id })).error === 'not_found');
  T('nothing can be handed in before the start', (await rpc('esep_room_submit', { p_token: tok['Ерасыл'], p_id: R.id, p_detail: sheet(10) })).error === 'not_started');

  // ── the race
  await pg.query(`update esep_private.rooms set secs = 180 where id=$1`, [R.id]);
  T('start', (await rpc('esep_room_start', { p_token: tok['Айгүл'], p_id: R.id })).ok === true);
  s = await rpc('esep_room_state', { p_token: tok['Ерасыл'], p_id: R.id });
  T('state (running): ONE seed for everybody (the browsers build the same sheet from it), a countdown, a clock', s.status === 'running' && s.seed > 0 && s.seed === (await rpc('esep_room_state', { p_token: tok['Дана Қасымова'], p_id: R.id })).seed
    && s.starts_in > 0 && s.starts_in <= 4000 && s.left > 170000 && !('items' in s), s);
  T('nobody comes in after the start', (await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: R.code })).error === 'started');
  T('nothing can be handed in during the countdown either', (await rpc('esep_room_submit', { p_token: tok['Ерасыл'], p_id: R.id, p_detail: sheet(10) })).error === 'not_started');
  const at = sec => pg.query(`update esep_private.rooms set started_at = now() - make_interval(secs => $2) where id=$1`, [R.id, sec]);   // «sec seconds into the race»
  await at(20); const a2 = await rpc('esep_room_submit', { p_token: tok['Айгүл'], p_id: R.id, p_detail: sheet(10), p_sheet: 'abc.10' });
  T('submit: the score is COUNTED from the sheet; the time is the SERVER\'s — the 20 s that really passed', a2.ok === true && a2.my_ok === 10 && a2.my_total === 10 && a2.my_ms >= 20000 && a2.my_ms < 23000, a2);
  await at(40); const a1 = await rpc('esep_room_submit', { p_token: tok['Ерасыл'], p_id: R.id, p_detail: sheet(10), p_sheet: 'abc.10' });
  T('submit twice: the first result stands', a1.my_ms >= 40000 && (await rpc('esep_room_submit', { p_token: tok['Ерасыл'], p_id: R.id, p_detail: sheet(0) })).my_ok === 10, a1);
  const junk = await rpc('esep_room_submit', { p_token: tok['Дана Қасымова'], p_id: R.id, p_detail: [{ q: '<img src=x onerror=1>'.repeat(40), a: 'x'.repeat(500), g: { x: 1 }, ok: 'true' }, 'text', null, { ok: 1 }, { ok: true, q: 'бір дұрыс' }], p_sheet: 'zzz.5' });
  T('a hostile sheet: only ok === true counts, texts are cut short, junk rows are dropped', junk.my_ok === 1 && junk.my_total === 3
    && (await pg.query(`select max(length(e->>'q')) q, max(length(e->>'a')) a from esep_private.room_players p, jsonb_array_elements(p.detail) e where p.student_id=$1`, [id['Дана Қасымова']])).rows[0].q <= 160, junk);
  T('a sheet that is too big or not a list is refused', (await rpc('esep_room_submit', { p_token: tok['Санжар'], p_id: R.id, p_detail: sheet(13, 13) })).error === 'answers'
    && (await rpc('esep_room_submit', { p_token: tok['Санжар'], p_id: R.id, p_detail: { ok: true } })).error === 'answers');
  const a4 = await rpc('esep_room_submit', { p_token: tok['Санжар'], p_id: R.id, p_detail: sheet(8), p_sheet: 'abc.10' });
  T('8 of 10 at 40 s', a4.my_ok === 8 && a4.my_ms >= 40000 && a4.my_ms <= 45000, a4);
  s = await rpc('esep_room_state', { p_token: tok['Ерасыл'], p_id: R.id });
  T('state while others still play: no ranking, no scores of others', s.status === 'running' && s.my_done && s.done_count === 4 && !('top' in s), s);
  T('a guest cannot end the race; the host can — but not in the first 20 seconds', (await rpc('esep_room_finish', { p_token: tok['Ерасыл'], p_id: R.id })) === false
    && (await at(10), await rpc('esep_room_finish', { p_token: tok['Айгүл'], p_id: R.id })) === false && (await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id })).status === 'running');
  await at(25); await rpc('esep_room_submit', { p_token: tok['Бөтен'], p_id: R.id, p_detail: sheet(8), p_sheet: 'abc.10' });

  // ── the podium
  s = await rpc('esep_room_state', { p_token: tok['Дана Қасымова'], p_id: R.id });
  T('the race ends by itself when the last player hands in', s.status === 'done');
  T('ranking: right answers first, time only breaks ties — Айгүл (10, 20 s), Ерасыл (10, 40 s), Бөтен (8, 25 s) ahead of Санжар (8, 40 s)', JSON.stringify(s.top.map(t => [t.name, t.ok, t.place])) === JSON.stringify([['Айгүл', 10, 1], ['Ерасыл', 10, 2], ['Бөтен', 8, 3]]), s.top);
  T('a pupil sees the top three and her own place — not the names below', s.top.length === 3 && s.me.place === 5 && s.me.ok === 1 && s.me.beaten === 0 && s.me.stars === 1 && !JSON.stringify(s).includes('Санжар'), s);
  const s1 = await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id });
  T('winner: place 1 of 5, beat 4, three stars; second place two stars', s1.me.place === 1 && s1.me.beaten === 4 && s1.me.stars === 3 && s1.n === 5 && (await rpc('esep_room_state', { p_token: tok['Ерасыл'], p_id: R.id })).me.stars === 2, s1.me);
  l = await rpc('esep_room_list', { p_token: tok['Айгүл'] });
  T('record: 1 played · 1 win · 1 podium · 4 beaten · ★3; the finished room is no longer «mine»', l.record.played === 1 && l.record.wins === 1 && l.record.podium === 1 && l.record.beaten === 4 && l.record.stars === 3 && l.mine === null && l.last.length === 1 && l.last[0].place === 1 && l.last[0].stage === 'FR-03', l);
  const tr = await rpc('esep_t_room_state', { p_token: TT, p_id: R.id });
  T('teacher: the whole ranking with what every pupil typed, each device\'s sheet fingerprint, and the SEED — the teacher page rebuilds the questions itself; nothing a pupil CLAIMS about a question is aggregated here', tr.ranking.length === 5 && tr.ranking[0].detail.length === 10
    && tr.seed > 0 && JSON.stringify(tr.ranking.map(k => k.sheet)) === JSON.stringify(['abc.10', 'abc.10', 'abc.10', 'abc.10', 'zzz.5']) && !('missed' in tr) && !('seed' in (await rpc('esep_t_room_state', { p_token: TT, p_id: R.id })).ranking[0]), tr.ranking.map(k => [k.name, k.sheet]));
  T('a pupil never gets the seed of a finished room (the podium needs none)', !('seed' in (await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R.id }))));
  T('after the end nothing more can be handed in; an outsider still sees nothing', (await rpc('esep_room_submit', { p_token: tok['Мадина'], p_id: R.id, p_detail: sheet(10) })).error === 'not_found'
    && (await rpc('esep_room_state', { p_token: tok['Мадина'], p_id: R.id })).error === 'not_found');

  // ── the clock, ties, and a player who never hands in
  const R2 = await mk('Айгүл', 'AR', 'AR-14');
  await rpc('esep_room_join', { p_token: tok['Ерасыл'], p_code: R2.code }); await rpc('esep_room_join', { p_token: tok['Санжар'], p_code: R2.code }); await rpc('esep_room_start', { p_token: tok['Айгүл'], p_id: R2.id });
  T('another room, another seed', (await rpc('esep_room_state', { p_token: tok['Айгүл'], p_id: R2.id })).seed !== (await pg.query(`select seed from esep_private.rooms where id=$1`, [R.id])).rows[0].seed);
  await pg.query(`update esep_private.rooms set started_at = now() - interval '60 seconds' where id=$1`, [R2.id]);
  await rpc('esep_room_submit', { p_token: tok['Айгүл'], p_id: R2.id, p_detail: sheet(10) }); await rpc('esep_room_submit', { p_token: tok['Ерасыл'], p_id: R2.id, p_detail: sheet(10) });
  await pg.query(`update esep_private.room_players set ms = 20000 where room_id=$1 and done_at is not null`, [R2.id]);   // a dead heat (two server times are never equal by themselves)
  await pg.query(`update esep_private.rooms set ends_at = now() - interval '31 seconds' where id=$1`, [R2.id]);   // the time is up, and the 30 s of grace too
  T('time is up: late sheets are refused', (await rpc('esep_room_submit', { p_token: tok['Санжар'], p_id: R2.id, p_detail: sheet(10) })).error === 'closed');
  s = await rpc('esep_room_state', { p_token: tok['Санжар'], p_id: R2.id });
  T('a dead heat shares first place; the one who never handed in is last, no stars, and not on the podium', s.status === 'done' && s.top.length === 2 && s.top.every(t => t.place === 1) && s.me.place === 3 && s.me.finished === false && s.me.stars === 0, s);
  l = await rpc('esep_room_list', { p_token: tok['Айгүл'] });
  T('record adds up across rooms (2 played, 2 wins, beaten 4 + 1); an unfinished race is not «played»', l.record.played === 2 && l.record.wins === 2 && l.record.beaten === 5 && (await rpc('esep_room_list', { p_token: tok['Санжар'] })).record.played === 1, l.record);

  // ── lobbies lapse; limits
  const R3 = await mk('Ерасыл', 'AR', 'AR-05');
  await pg.query(`update esep_private.rooms set created_at = now() - interval '31 minutes' where id=$1`, [R3.id]);
  s = await rpc('esep_room_state', { p_token: tok['Ерасыл'], p_id: R3.id });
  T('a lobby nobody starts closes after 30 minutes — and counts for nothing', s.status === 'done' && s.cancelled === true && (await rpc('esep_room_list', { p_token: tok['Ерасыл'] })).record.played === 2, s);   // his two real races, not this one
  for (let i = 0; i < 9; i++) { const x = await mk('Ерасыл', 'AR', 'AR-05'); await rpc('esep_room_leave', { p_token: tok['Ерасыл'], p_id: x.id }); }
  T('ten rooms a day', (await mk('Ерасыл', 'AR', 'AR-05')).error === 'daily_limit');

  // ── one closed tab must not hold the podium hostage
  const R4 = await mk('Санжар', 'AR', 'AR-05'); await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: R4.code }); await rpc('esep_room_start', { p_token: tok['Санжар'], p_id: R4.id });
  await pg.query(`update esep_private.rooms set started_at = now() - interval '30 seconds' where id=$1`, [R4.id]);
  T('the host cannot end a race he has not finished himself', (await rpc('esep_room_finish', { p_token: tok['Санжар'], p_id: R4.id })) === false);
  await rpc('esep_room_submit', { p_token: tok['Санжар'], p_id: R4.id, p_detail: sheet(9) });
  T('…once he has handed in he can: the silent player is ranked last', (await rpc('esep_room_finish', { p_token: tok['Санжар'], p_id: R4.id })) === true
    && (s = await rpc('esep_room_state', { p_token: tok['Мадина'], p_id: R4.id })).status === 'done' && s.me.finished === false && s.me.place === 2, s);
  T('a pupil who has handed in is free to go elsewhere while the others still play; the teacher can close a pupil\'s room', await (async () => {
    const x = await mk('Санжар', 'AR', 'AR-05'); await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: x.code }); await rpc('esep_room_join', { p_token: tok['Бөтен'], p_code: x.code });
    await rpc('esep_room_start', { p_token: tok['Санжар'], p_id: x.id });
    await pg.query(`update esep_private.rooms set started_at = now() - interval '30 seconds' where id=$1`, [x.id]); await rpc('esep_room_submit', { p_token: tok['Мадина'], p_id: x.id, p_detail: sheet(10) });
    const y = await mk('Мадина', 'AR', 'AR-05'); const okk = y.id > 0; await rpc('esep_room_leave', { p_token: tok['Мадина'], p_id: y.id });
    const tclose = await rpc('esep_t_room_close', { p_token: TT, p_id: x.id });
    return okk && tclose === true && (await rpc('esep_t_room_state', { p_token: TT, p_id: x.id })).status === 'done'; })());

  // ── the 9000 codes cannot be swept
  for (let i = 0; i < 10; i++) await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: '0001' });
  const live = await mk('Санжар', 'AR', 'AR-05');
  T('ten wrong codes in ten minutes → locked, even with the right code; other pupils are not affected', (await rpc('esep_room_join', { p_token: tok['Мадина'], p_code: live.code })).error === 'locked'
    && (await rpc('esep_room_join', { p_token: tok['Бөтен'], p_code: live.code })).id === live.id);
  await rpc('esep_room_leave', { p_token: tok['Санжар'], p_id: live.id });

  // ── the teacher
  T('teacher functions need the teacher token', await (async () => { try { await rpc('esep_t_room_create', { p_token: tok['Айгүл'], p_route: 'TE', p_stage: 'TE-11' }); return false; } catch (e) { return /teacher session required/.test(e.message); } })());
  const TR = await rpc('esep_t_room_create', { p_token: TT, p_route: 'TE', p_stage: 'TE-11', p_klass: ' 3а ', p_n: 6, p_secs: 420 });
  T('the teacher opens a room on ANY station (TE-11 — nobody here has passed it), listed for class 3А', /^\d{4}$/.test(TR.code) && (await rpc('esep_room_list', { p_token: tok['Дана Қасымова'] })).open.some(o => o.id === TR.id && o.by_teacher && o.stage === 'TE-11')
    && !(await rpc('esep_room_list', { p_token: tok['Бөтен'] })).open.length && (await rpc('esep_t_room_create', { p_token: TT, p_route: 'PV', p_stage: 'PV-01' })).error === 'stage', TR);
  for (const n of ['Айгүл', 'Дана Қасымова', 'Бөтен']) await rpc('esep_room_join', { p_token: tok[n], p_code: TR.code });
  T('a pupil cannot start the teacher\'s room', (await rpc('esep_room_start', { p_token: tok['Айгүл'], p_id: TR.id })).error === 'not_found');
  let ts = await rpc('esep_t_room_state', { p_token: TT, p_id: TR.id });
  T('teacher state (lobby): every name', ts.status === 'lobby' && JSON.stringify(ts.players.map(p => p.name)) === JSON.stringify(['Айгүл', 'Дана Қасымова', 'Бөтен']), ts);
  await rpc('esep_t_room_start', { p_token: TT, p_id: TR.id });
  await pg.query(`update esep_private.rooms set started_at = now() - interval '50 seconds' where id=$1`, [TR.id]);
  await rpc('esep_room_submit', { p_token: tok['Дана Қасымова'], p_id: TR.id, p_detail: sheet(6, 6), p_sheet: 's.6' }); await rpc('esep_room_submit', { p_token: tok['Айгүл'], p_id: TR.id, p_detail: sheet(5, 6), p_sheet: 's.6' });
  ts = await rpc('esep_t_room_state', { p_token: TT, p_id: TR.id });
  T('teacher state (running): who has handed in, no scores yet', ts.status === 'running' && JSON.stringify(ts.players.map(p => p.done)) === '[true,true,false]' && !('ranking' in ts), ts);
  await rpc('esep_t_room_close', { p_token: TT, p_id: TR.id });
  ts = await rpc('esep_t_room_state', { p_token: TT, p_id: TR.id });
  T('teacher closes the race early → the WHOLE ranking, including who did not finish', ts.status === 'done' && JSON.stringify(ts.ranking.map(k => [k.name, k.ok, k.total, k.place, k.finished])) === JSON.stringify([['Дана Қасымова', 6, 6, 1, true], ['Айгүл', 5, 6, 2, true], ['Бөтен', null, null, 3, false]]), ts.ranking);
  T('teacher list shows it', (await rpc('esep_t_rooms', { p_token: TT })).some(x => x.id === TR.id && x.status === 'done' && x.n === 3 && x.stage === 'TE-11'));

  // ── the tables themselves stay closed; re-running is safe and touches only its own functions
  T('the browser role cannot read the room tables or call the private helpers', await denied('select * from esep_private.rooms') && await denied('select * from esep_private.room_players')
    && await denied('select esep_private.room_sweep()') && await denied(`select * from esep_private.room_ranks()`) && await denied(`select esep_private.student_peek('x')`));
  await pg.query(`revoke execute on function public.esep_t_delete(text,text) from anon`); await file('05_rooms.sql');
  T('re-running 05 touches only its own functions: a privilege somebody closed on an OLDER function stays closed', (await pg.query(`select has_function_privilege('anon','public.esep_t_delete(text,text)','execute') v`)).rows[0].v === false
    && (await pg.query(`select has_function_privilege('anon','public.esep_room_join(text,text)','execute') v`)).rows[0].v === true);
  T('exactly one function of each name (PostgREST cannot choose between overloads)', (await pg.query(`select count(*)::int n from (select proname from pg_proc where pronamespace='public'::regnamespace and proname like 'esep\\_%room%' group by proname having count(*) > 1) q`)).rows[0].n === 0);
  await pg.query(`delete from students where id=$1`, [id['Айгүл']]);
  T('deleting a pupil takes her rooms and results with her, nothing breaks', (await pg.query(`select count(*)::int n from esep_private.rooms where host_name='Айгүл'`)).rows[0].n === 0
    && (await rpc('esep_room_state', { p_token: tok['Ерасыл'], p_id: R.id })).error === 'not_found' && (await rpc('esep_room_list', { p_token: tok['Ерасыл'] })).record.played >= 0);

  await pg.end(); await admin.query(`drop database ${DB}`); await admin.end();
  const bad = out.filter(x => !x).length; console.log(bad ? `${bad} FAILED of ${out.length}` : `ALL ${out.length} PASS`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
