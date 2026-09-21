-- Есеп жолы · challenge rooms («жарыс бөлмесі») — ADDITIVE, re-runnable. Needs 01_additive.sql and 04_challenges.sql
-- (sessions, helpers, ch_stage / ch_tables). Nothing else depends on it: until it is installed the portal and the
-- teacher page simply show no room card.
--
-- What a room is: one pupil — or the teacher — opens it and picks the table; a four-digit code appears; anyone in the
-- school who types the code is in (classmates also see the room on their portal and need no code). The host presses
-- «Бастау»: everybody gets THE SAME ten facts at the same moment, three minutes at most. Then the podium.
--
-- The rules, all enforced here and not in the browser:
--   · the facts are generated and stored on the server; the server marks the answers; a browser never reports a score;
--   · a pupil may open a room only on a table whose AR station they have passed (or «аралас» = a mix of the tables
--     they have passed, two at least); the teacher may pick any table. Joining is open to everyone — a pupil who has
--     not passed that table is told so, not shut out (in class the whole class plays);
--   · ranking: answers right first, time only breaks a tie — guessing fast never beats knowing. The time is the
--     SERVER's (start → hand-in); the browser's clock is never believed, so reloading the page gains nothing;
--   · pupils see the top three and their own place, never who came last. The teacher sees the whole list;
--   · pupils see first names only (the code lets the whole school in); ten wrong codes in ten minutes and a pupil
--     has to wait — the 9000 codes cannot be swept;
--   · one live room per host, ten a day per pupil; a room nobody starts closes after 30 minutes; nobody can join
--     after the start; at most 60 players. The host (or the teacher, for any room) can end a race early: whoever has
--     not handed in is ranked last, so one closed tab cannot hold the podium hostage.

set search_path = public, extensions;

do $$ begin
  if to_regprocedure('esep_private.ch_tables(jsonb)') is null or to_regprocedure('esep_private.student_of(text)') is null then
    raise exception 'Run 01_additive.sql and 04_challenges.sql first: 05_rooms.sql uses their helpers.';
  end if;
end $$;

do $$ declare idt text; begin
  select format_type(atttypid, atttypmod) into idt from pg_attribute where attrelid='public.students'::regclass and attname='id';
  execute format($f$
    create table if not exists esep_private.rooms(
      id          bigserial primary key,
      code        text not null,
      host_id     %1$s references public.students(id) on delete cascade,   -- null = opened by the teacher
      host_name   text not null,
      klass       text not null default '',                                -- the class whose portal lists it; '' = by code only
      tbl         int  not null,                                           -- 2…10, or 0 = a mix
      items       jsonb not null,                                          -- [[a,b], …] ten facts, the same for everybody
      status      text not null default 'lobby' check (status in ('lobby','running','done')),
      created_at  timestamptz not null default now(),
      started_at  timestamptz, ends_at timestamptz, closed_at timestamptz)$f$, idt);
  execute format($f$
    create table if not exists esep_private.room_players(
      room_id     bigint not null references esep_private.rooms(id) on delete cascade,
      student_id  %1$s   not null references public.students(id) on delete cascade,
      joined_at   timestamptz not null default now(),
      ok int, ms int, done_at timestamptz,
      primary key (room_id, student_id))$f$, idt);
end $$;
create unique index if not exists rooms_code_live  on esep_private.rooms(code)  where status <> 'done';
create index        if not exists rooms_live        on esep_private.rooms(status) where status <> 'done';
create index        if not exists rooms_host        on esep_private.rooms(host_id, created_at desc);
create index        if not exists room_players_who  on esep_private.room_players(student_id);

-- a session check that does not write: esep_room_state is polled every couple of seconds by a whole class
create or replace function esep_private.student_peek(p_token text) returns text
language sql stable security definer set search_path = extensions, pg_temp as $$
  select student_id::text from esep_private.sessions
   where p_token is not null and length(p_token) = 48 and token_hash = sha256(convert_to(p_token,'UTF8'))
     and role = 'student' and last_used > now() - interval '180 days' $$;

-- ten facts. One table: that table against 1…10. A mix: ten different facts from the pool's tables against 2…9.
create or replace function esep_private.room_items(p_tbl int, p_pool int[]) returns jsonb
language plpgsql volatile set search_path = pg_catalog, pg_temp as $$
declare v jsonb;
begin
  if p_tbl <> 0 then
    select jsonb_agg(case when random() < 0.5 then jsonb_build_array(p_tbl, k) else jsonb_build_array(k, p_tbl) end order by r)
      into v from (select k, random() r from generate_series(1,10) k) g;
  else
    select jsonb_agg(case when random() < 0.5 then jsonb_build_array(t, k) else jsonb_build_array(k, t) end order by r)
      into v from (select t, k, random() r from (select distinct on (least(t,k), greatest(t,k)) t, k from unnest(p_pool) t cross join generate_series(2,9) k
                                                  order by least(t,k), greatest(t,k), random()) u order by random() limit 10) g;
  end if;
  return v;
end $$;

-- Rooms change state lazily, whenever anybody looks: a lobby nobody started lapses after 30 minutes; a race ends when
-- the clock runs out (10 s of grace for the last answer in flight) or when every player has handed in.
create or replace function esep_private.room_sweep(p_only bigint default null) returns void
language sql volatile security definer set search_path = extensions, pg_temp as $$
  update esep_private.rooms r set status = 'done', closed_at = now()
   where r.status <> 'done' and (p_only is null or r.id = p_only) and (
         (r.status = 'lobby'   and r.created_at < now() - interval '30 minutes')
      or (r.status = 'running' and (now() > r.ends_at + interval '10 seconds'
            or not exists (select 1 from esep_private.room_players p where p.room_id = r.id and p.done_at is null)))) $$;

-- the finished races, ranked: right answers first, then time; whoever did not hand in shares the last place.
-- `beaten` = how many players ended strictly below this one.
create or replace function esep_private.room_ranks(p_room bigint default null, p_student text default null)
returns table(room_id bigint, student_id text, name text, ok int, ms int, finished boolean, place int, n int, beaten int)
language sql stable security definer set search_path = extensions, pg_temp as $$
  select q.room_id, q.student_id, q.name, q.ok, q.ms, q.finished, q.place, q.n, (q.n - q.place - (q.peers - 1))::int
    from (select p.room_id, p.student_id::text as student_id, s.name, p.ok, p.ms, (p.done_at is not null) as finished,
                 (rank()   over (partition by p.room_id order by (p.done_at is null), p.ok desc nulls last, p.ms asc nulls last))::int as place,
                 (count(*) over (partition by p.room_id))::int as n,
                 (count(*) over (partition by p.room_id, (p.done_at is null), p.ok, p.ms))::int as peers
            from esep_private.room_players p
            join esep_private.rooms r on r.id = p.room_id and r.status = 'done' and r.started_at is not null
            join public.students s on s.id = p.student_id
           where (p_room is null or p.room_id = p_room)
             -- the window must still see the WHOLE room, so filter rooms, not players
             and (p_student is null or p.room_id in (select w.room_id from esep_private.room_players w where w.student_id::text = p_student))) q $$;

-- stars for a place: the winner 3; second and third 2 when at least four played; everyone who handed in 1
create or replace function esep_private.room_stars(p_place int, p_n int, p_finished boolean) returns int
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when not p_finished then 0 when p_place = 1 then 3 when p_place <= 3 and p_n >= 4 then 2 else 1 end $$;

create or replace function esep_private.room_code() returns text
language plpgsql volatile security definer set search_path = extensions, pg_temp as $$
declare v text;
begin
  for i in 1..40 loop
    v := (1000 + floor(random() * 9000))::int::text;
    if not exists (select 1 from esep_private.rooms where code = v and status <> 'done') then return v; end if;
  end loop;
  raise exception 'esep: no free room code';
end $$;

-- first name only: what one pupil may learn about another through a room
create or replace function esep_private.first_name(p text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$ select split_part(btrim(coalesce(p,'')), ' ', 1) $$;

-- ═════════════════════════ pupil API ═════════════════════════

-- Open a room. p_table = 2…10, or 0 for a mix of the tables I have passed. I am its first player.
create or replace function public.esep_room_create(p_token text, p_table int) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); me record; v_mine int[]; r record; v_id bigint; v_code text;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  if p_table is null or (p_table <> 0 and esep_private.ch_stage(p_table) is null) then return jsonb_build_object('error','table'); end if;
  select s.id, s.name, upper(btrim(coalesce(s.klass,''))) klass, coalesce(s.state,'{}'::jsonb) state into me from public.students s where s.id::text = v_sid;
  perform 1 from public.students where id = me.id for update;   -- one pupil, two devices: the checks below must not race
  v_mine := esep_private.ch_tables(me.state);
  if (p_table = 0 and cardinality(v_mine) < 2) or (p_table <> 0 and not p_table = any(v_mine)) then return jsonb_build_object('error','not_passed'); end if;
  perform esep_private.room_sweep();
  select id, code into r from esep_private.rooms where host_id = me.id and status <> 'done' limit 1;
  if r.id is not null then return jsonb_build_object('id', r.id, 'code', r.code, 'existing', true); end if;
  if exists (select 1 from esep_private.room_players p join esep_private.rooms x on x.id = p.room_id where p.student_id = me.id and x.status = 'running' and p.done_at is null) then
    return jsonb_build_object('error','playing'); end if;
  if (select count(*) from esep_private.rooms x where x.host_id = me.id and esep_private.kz_day(x.created_at) = esep_private.kz_day(now())) >= 10 then
    return jsonb_build_object('error','daily_limit'); end if;
  delete from esep_private.room_players p using esep_private.rooms x where x.id = p.room_id and p.student_id = me.id and x.status = 'lobby';   -- I was waiting in somebody else's lobby
  for i in 1..5 loop
    begin
      v_code := esep_private.room_code();
      insert into esep_private.rooms(code, host_id, host_name, klass, tbl, items)
        values (v_code, me.id, me.name, me.klass, p_table, esep_private.room_items(p_table, v_mine)) returning id into v_id;
      exit;
    exception when unique_violation then v_id := null; end;
  end loop;
  if v_id is null then return jsonb_build_object('error','busy'); end if;
  insert into esep_private.room_players(room_id, student_id) values (v_id, me.id);
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

-- Come in by code. Open to the whole school; closed once the race has started.
create or replace function public.esep_room_join(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); me record; r record;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  if (select count(*) from esep_private.login_fails f where f.name_key = '#room|' || v_sid and f.t > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('error','locked'); end if;
  if coalesce(btrim(p_code),'') !~ '^\d{4}$' then return jsonb_build_object('error','not_found'); end if;
  perform esep_private.room_sweep();
  select s.id, coalesce(s.state,'{}'::jsonb) state into me from public.students s where s.id::text = v_sid for update;
  select * into r from esep_private.rooms where code = btrim(p_code) and status <> 'done' for update;
  if r.id is null then
    insert into esep_private.login_fails(name_key) values ('#room|' || v_sid);   -- ten misses in ten minutes and the guessing stops
    return jsonb_build_object('error','not_found');
  end if;
  if exists (select 1 from esep_private.room_players p where p.room_id = r.id and p.student_id = me.id) then return jsonb_build_object('id', r.id); end if;
  if r.status <> 'lobby' then return jsonb_build_object('error','started'); end if;
  if exists (select 1 from esep_private.rooms x where x.host_id = me.id and x.status <> 'done') then return jsonb_build_object('error','hosting'); end if;
  if exists (select 1 from esep_private.room_players p join esep_private.rooms x on x.id = p.room_id where p.student_id = me.id and x.status = 'running' and p.done_at is null) then
    return jsonb_build_object('error','playing'); end if;
  if (select count(*) from esep_private.room_players p where p.room_id = r.id) >= 60 then return jsonb_build_object('error','full'); end if;
  delete from esep_private.room_players p using esep_private.rooms x where x.id = p.room_id and p.student_id = me.id and x.status = 'lobby';
  insert into esep_private.room_players(room_id, student_id) values (r.id, me.id);
  return jsonb_build_object('id', r.id,
    'not_passed', r.tbl <> 0 and not r.tbl = any(esep_private.ch_tables(me.state)));
end $$;

-- Leave a lobby. When the host leaves, the room closes.
create or replace function public.esep_room_leave(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token);
begin
  if v_sid is null then return false; end if;
  update esep_private.rooms set status = 'done', closed_at = now() where id = p_id and status = 'lobby' and host_id::text = v_sid;
  if found then return true; end if;
  delete from esep_private.room_players p using esep_private.rooms x
   where x.id = p.room_id and p.room_id = p_id and p.student_id::text = v_sid and x.status = 'lobby';
  return found;
end $$;

-- The host starts the race. Two players at least. A four-second countdown lets every browser catch the start.
create or replace function public.esep_room_start(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); r record;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  select * into r from esep_private.rooms where id = p_id and host_id::text = v_sid for update;
  if r.id is null then return jsonb_build_object('error','not_found'); end if;
  if r.status <> 'lobby' then return jsonb_build_object('ok', true); end if;
  if (select count(*) from esep_private.room_players p where p.room_id = p_id) < 2 then return jsonb_build_object('error','alone'); end if;
  update esep_private.rooms set status = 'running', started_at = now() + interval '4 seconds', ends_at = now() + interval '184 seconds' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- The host ends a running race early (a classmate closed the tab and everyone else is waiting). Whoever has not handed
-- in is ranked last.
create or replace function public.esep_room_finish(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token);
begin
  if v_sid is null then return false; end if;
  update esep_private.rooms set status = 'done', closed_at = now()
   where id = p_id and host_id::text = v_sid and status = 'running' and now() > started_at + interval '20 seconds'
     and exists (select 1 from esep_private.room_players p where p.room_id = p_id and p.student_id::text = v_sid and p.done_at is not null);
  return found;
end $$;

-- What a player sees right now. Polled.
create or replace function public.esep_room_state(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_peek(p_token); r record; me record; v jsonb; mine record;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  perform esep_private.room_sweep();
  select * into r from esep_private.rooms where id = p_id;
  select * into me from esep_private.room_players p where p.room_id = p_id and p.student_id::text = v_sid;
  if r.id is null or me.room_id is null then return jsonb_build_object('error','not_found'); end if;
  v := jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status, 'table', r.tbl, 'host_name', esep_private.first_name(r.host_name),
         'is_host', coalesce(r.host_id::text = v_sid, false), 'by_teacher', r.host_id is null,
         'n', (select count(*) from esep_private.room_players p where p.room_id = p_id));
  if r.status = 'lobby' then
    return v || jsonb_build_object('players', (select coalesce(jsonb_agg(esep_private.first_name(s.name) order by p.joined_at), '[]'::jsonb)
             from esep_private.room_players p join public.students s on s.id = p.student_id where p.room_id = p_id));
  elsif r.status = 'running' then
    return v || jsonb_build_object('my_done', me.done_at is not null, 'my_ok', me.ok,
             'done_count', (select count(*) from esep_private.room_players p where p.room_id = p_id and p.done_at is not null),
             'starts_in', greatest(0, (extract(epoch from r.started_at - clock_timestamp()) * 1000)::int),
             'left',      greatest(0, (extract(epoch from r.ends_at    - clock_timestamp()) * 1000)::int),
             'items', case when me.done_at is null then r.items end);
  end if;
  if r.started_at is null then return v || jsonb_build_object('cancelled', true); end if;
  select * into mine from esep_private.room_ranks(p_id) k where k.student_id = v_sid;
  return v || jsonb_build_object(
    'top', (select coalesce(jsonb_agg(jsonb_build_object('name', esep_private.first_name(k.name), 'ok', k.ok, 'ms', k.ms, 'place', k.place, 'me', k.student_id = v_sid) order by k.place, k.name), '[]'::jsonb)
              from (select * from esep_private.room_ranks(p_id) x where x.finished order by x.place, x.name limit 3) k),
    'me', jsonb_build_object('place', mine.place, 'ok', mine.ok, 'ms', mine.ms, 'finished', mine.finished, 'beaten', mine.beaten,
                             'stars', esep_private.room_stars(mine.place, mine.n, mine.finished)));
end $$;

-- p_answers = [21, 56, null, …] in the order of the facts. Marked here. The time is the SERVER's: from the start of the
-- race to this call. p_ms (the browser's stopwatch) is accepted for compatibility and ignored — a reloaded page would
-- otherwise restart its stopwatch and win every tie.
create or replace function public.esep_room_submit(p_token text, p_id bigint, p_answers jsonb, p_ms int) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); r record; me record; v_ok int; v_ms int;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 10 then return jsonb_build_object('error','answers'); end if;
  perform esep_private.room_sweep();
  select * into r from esep_private.rooms where id = p_id for update;
  select * into me from esep_private.room_players p where p.room_id = p_id and p.student_id::text = v_sid;
  if r.id is null or me.room_id is null then return jsonb_build_object('error','not_found'); end if;
  if me.done_at is not null then return jsonb_build_object('ok', true, 'my_ok', me.ok, 'my_ms', me.ms); end if;
  if r.status <> 'running' then return jsonb_build_object('error', case when r.status = 'done' then 'closed' else 'not_started' end); end if;
  if now() < r.started_at then return jsonb_build_object('error','not_started'); end if;
  select count(*) into v_ok from jsonb_array_elements(r.items) with ordinality i(it, n)
    join jsonb_array_elements(p_answers) with ordinality a(ans, n) using (n)
   where jsonb_typeof(a.ans) = 'number' and (a.ans #>> '{}') ~ '^\d{1,4}$' and (a.ans #>> '{}')::int = (i.it->>0)::int * (i.it->>1)::int;
  v_ms := greatest(1000, least((extract(epoch from clock_timestamp() - r.started_at) * 1000)::bigint, 195000))::int;
  update esep_private.room_players set ok = v_ok, ms = v_ms, done_at = now() where room_id = p_id and student_id = me.student_id;
  perform esep_private.room_sweep(p_id);   -- only this room: its row is already locked here
  return jsonb_build_object('ok', true, 'my_ok', v_ok, 'my_ms', v_ms);
end $$;

-- The way in, for the portal and the room page: the room I am in, the open rooms of my class, what I may host, my record.
create or replace function public.esep_room_list(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); me record;
begin
  if v_sid is null then return null; end if;
  perform esep_private.room_sweep();
  select s.id, upper(btrim(coalesce(s.klass,''))) klass, coalesce(s.state,'{}'::jsonb) state into me from public.students s where s.id::text = v_sid;
  return jsonb_build_object(
    'mine', (select jsonb_build_object('id', x.id, 'code', x.code, 'status', x.status, 'table', x.tbl, 'is_host', coalesce(x.host_id = me.id, false))
               from esep_private.rooms x join esep_private.room_players p on p.room_id = x.id and p.student_id = me.id
              where x.status <> 'done' and not (x.status = 'running' and p.done_at is not null) order by x.created_at desc limit 1),
    'open', case when me.klass = '' then '[]'::jsonb else (
              select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'code', x.code, 'host_name', esep_private.first_name(x.host_name), 'table', x.tbl, 'by_teacher', x.host_id is null,
                       'n', (select count(*) from esep_private.room_players p where p.room_id = x.id)) order by x.created_at desc), '[]'::jsonb)
                from esep_private.rooms x where x.status = 'lobby' and x.klass = me.klass
                 and not exists (select 1 from esep_private.room_players p where p.room_id = x.id and p.student_id = me.id)) end,
    'can_host', to_jsonb(esep_private.ch_tables(me.state)),
    'today', (select count(*) from esep_private.rooms x where x.host_id = me.id and esep_private.kz_day(x.created_at) = esep_private.kz_day(now())),
    'limit', 10,
    'last', (select coalesce(jsonb_agg(jsonb_build_object('id', q.room_id, 'table', q.tbl, 'place', q.place, 'n', q.n, 'ok', q.ok) order by q.closed_at desc), '[]'::jsonb)
               from (select k.room_id, x.tbl, k.place, k.n, k.ok, x.closed_at from esep_private.room_ranks(null, v_sid) k join esep_private.rooms x on x.id = k.room_id
                      where k.student_id = v_sid and k.finished order by x.closed_at desc limit 5) q),
    'record', (select jsonb_build_object('played', count(*), 'wins', count(*) filter (where k.place = 1), 'podium', count(*) filter (where k.place <= 3),
                        'beaten', coalesce(sum(k.beaten), 0), 'stars', coalesce(sum(esep_private.room_stars(k.place, k.n, k.finished)), 0))
                 from esep_private.room_ranks(null, v_sid) k where k.student_id = v_sid and k.finished));
end $$;

-- ═════════════════════════ teacher API ═════════════════════════

-- The teacher opens a room on any table (0 = a mix of 2…9). p_klass lists it on that class's portal; the code lets anyone else in.
create or replace function public.esep_t_room_create(p_token text, p_table int, p_klass text default '') returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_id bigint; v_code text;
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if p_table is null or (p_table <> 0 and esep_private.ch_stage(p_table) is null) then return jsonb_build_object('error','table'); end if;
  perform esep_private.room_sweep();
  if (select count(*) from esep_private.rooms where host_id is null and status <> 'done') >= 10 then return jsonb_build_object('error','too_many'); end if;
  for i in 1..5 loop
    begin
      v_code := esep_private.room_code();
      insert into esep_private.rooms(code, host_id, host_name, klass, tbl, items)
        values (v_code, null, 'Мұғалім', upper(btrim(coalesce(p_klass,''))), p_table, esep_private.room_items(p_table, array[2,3,4,5,6,7,8,9])) returning id into v_id;
      exit;
    exception when unique_violation then v_id := null; end;
  end loop;
  if v_id is null then return jsonb_build_object('error','busy'); end if;
  return jsonb_build_object('id', v_id, 'code', v_code);
end $$;

create or replace function public.esep_t_room_start(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare r record;
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  select * into r from esep_private.rooms where id = p_id and host_id is null for update;
  if r.id is null then return jsonb_build_object('error','not_found'); end if;
  if r.status <> 'lobby' then return jsonb_build_object('ok', true); end if;
  if (select count(*) from esep_private.room_players p where p.room_id = p_id) < 2 then return jsonb_build_object('error','alone'); end if;
  update esep_private.rooms set status = 'running', started_at = now() + interval '4 seconds', ends_at = now() + interval '184 seconds' where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.esep_t_room_close(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  update esep_private.rooms set status = 'done', closed_at = now() where id = p_id and status <> 'done';   -- any room, a pupil's too
  return found;
end $$;

-- The teacher's view of one room (any room): who is in, who has handed in, and at the end the WHOLE ranking.
create or replace function public.esep_t_room_state(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare r record; v jsonb;
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  perform esep_private.room_sweep();
  select * into r from esep_private.rooms where id = p_id;
  if r.id is null then return jsonb_build_object('error','not_found'); end if;
  v := jsonb_build_object('id', r.id, 'code', r.code, 'status', r.status, 'table', r.tbl, 'klass', r.klass, 'host_name', r.host_name, 'by_teacher', r.host_id is null,
         'cancelled', r.status = 'done' and r.started_at is null,
         'starts_in', case when r.status = 'running' then greatest(0, (extract(epoch from r.started_at - clock_timestamp()) * 1000)::int) end,
         'left',      case when r.status = 'running' then greatest(0, (extract(epoch from r.ends_at    - clock_timestamp()) * 1000)::int) end);
  if r.status = 'done' and r.started_at is not null then
    return v || jsonb_build_object('ranking', (select coalesce(jsonb_agg(jsonb_build_object('name', k.name, 'ok', k.ok, 'ms', k.ms, 'place', k.place, 'finished', k.finished)
                                                       order by k.place, k.name), '[]'::jsonb) from esep_private.room_ranks(p_id) k));
  end if;
  return v || jsonb_build_object('players', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'done', p.done_at is not null) order by p.joined_at), '[]'::jsonb)
                                               from esep_private.room_players p join public.students s on s.id = p.student_id where p.room_id = p_id));
end $$;

-- live rooms (the teacher's and the pupils') and the last finished ones
create or replace function public.esep_t_rooms(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  perform esep_private.room_sweep();
  return (select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'code', q.code, 'status', q.status, 'table', q.tbl, 'klass', q.klass, 'host_name', q.host_name,
                   'by_teacher', q.host_id is null, 'n', (select count(*) from esep_private.room_players p where p.room_id = q.id), 't', q.created_at) order by q.created_at desc), '[]'::jsonb)
            from (select * from esep_private.rooms x where x.status <> 'done' or (x.started_at is not null and x.created_at > now() - interval '14 days')
                   order by x.created_at desc limit 25) q);
end $$;

-- ── who may call what (same rule as 01 and 04: nothing for PUBLIC, the public API for the browser roles) ──
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'esep_private' and (p.proname like 'room\_%' or p.proname in ('student_peek','first_name')))
               or (n.nspname = 'public' and (p.proname like 'esep\_room\_%' or p.proname like 'esep\_t\_room%')) loop   -- only what THIS script created
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname='anon') then
      execute format('revoke all on function %s from anon', f.sig);
      if f.nspname = 'public' then execute format('grant execute on function %s to anon', f.sig); end if;
    end if;
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      if f.nspname = 'public' then execute format('grant execute on function %s to authenticated', f.sig); end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
