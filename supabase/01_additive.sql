-- Есеп жолы · database step 1 of 3 — ADDITIVE. Safe to run while the current site is live:
-- it only adds things (a private schema, two columns' worth of data, functions). Nothing the
-- old client uses is changed or removed, so nothing breaks until step 2.
--
-- What it sets up: the browser stops reading and writing the tables directly. It calls a few
-- functions instead; each one checks a session token (or the teacher secret) on the server and
-- touches only the rows that token is allowed to touch. PINs are compared on the server.
--
-- Run in the Supabase SQL editor (role postgres). Re-runnable.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;   -- pgcrypto (crypt, gen_salt, gen_random_bytes) lives in `extensions` on Supabase

-- ── private schema: never exposed through the API (PostgREST only serves `public`) ──
create schema if not exists esep_private;
revoke all on schema esep_private from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then execute 'revoke all on schema esep_private from anon'; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then execute 'revoke all on schema esep_private from authenticated'; end if;
end $$;

alter table public.students add column if not exists pin_hash text;
-- the live table declares `pin text NOT NULL`; pupils registered through esep_login have only a hash, so the plain column must allow null
-- (old clients always write a pin, so this changes nothing for them; guarded so the script still runs after 03 has dropped the column)
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='students'
              and column_name='pin' and is_nullable='NO') then
    alter table public.students alter column pin drop not null;
  end if;
end $$;
create index if not exists students_name_lower on public.students (lower(name));
create index if not exists events_student_t on public.events (student_id, t);
-- new clients stamp every event with a random `u`; the same (pupil, u) is stored once, so a client may safely resend
create unique index if not exists events_student_u on public.events (student_id, (ev->>'u')) where ev ? 'u';
-- "was this answer a second try?" is one index lookup: the runner logs an `attempt` with the item's id on the first miss
create index if not exists events_attempt on public.events (student_id, (ev->>'id')) where ev->>'ev' = 'attempt';

-- sessions.student_id must have the same type as students.id (uuid or bigint — we don't assume)
do $$ declare idt text; begin
  select format_type(atttypid, atttypmod) into idt from pg_attribute
   where attrelid='public.students'::regclass and attname='id';
  execute format($f$
    create table if not exists esep_private.sessions(
      token_hash bytea primary key,
      role       text not null check (role in ('student','teacher')),
      student_id %s references public.students(id) on delete cascade,
      created_at timestamptz not null default now(),
      last_used  timestamptz not null default now())$f$, idt);
  -- one row per pupil per day (UTC+5): how many events they sent, and how many of them scored for the class board.
  -- esep_events keeps it up to date; esep_board only ever reads this — so opening the portal costs the same
  -- whether the events table has a thousand rows or ten million.
  execute format($f$
    create table if not exists esep_private.day_stats(
      student_id %s not null references public.students(id) on delete cascade,
      day    date not null,
      events int  not null default 0,
      score  int  not null default 0,
      primary key (student_id, day))$f$, idt);
end $$;
create index if not exists sessions_student on esep_private.sessions(student_id);
create table if not exists esep_private.login_fails(name_key text not null, t timestamptz not null default now());
create index if not exists login_fails_key_t on esep_private.login_fails(name_key, t);
create table if not exists esep_private.config(key text primary key, value text not null);

-- hash the PINs that exist today (the plaintext column stays until step 3, the old client still needs it)
update public.students set pin_hash = crypt(to_jsonb(students)->>'pin', gen_salt('bf', 6))
 where pin_hash is null and to_jsonb(students)->>'pin' ~ '^\d{4}$';

-- ── helpers (private) ──
create or replace function esep_private.new_session(p_role text, p_student text) returns text
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_token text := encode(gen_random_bytes(24), 'hex'); v_id public.students.id%type;
begin
  if p_student is not null then select id into v_id from public.students where id::text = p_student; end if;
  insert into esep_private.sessions(token_hash, role, student_id) values (sha256(convert_to(v_token,'UTF8')), p_role, v_id);
  if random() < 0.02 then   -- housekeeping, not on every login
    delete from esep_private.sessions where (role='student' and last_used < now() - interval '180 days')
                                          or (role='teacher' and created_at < now() - interval '12 hours');
  end if;
  return v_token;
end $$;

-- returns the student id (as text) behind a student token, or null
create or replace function esep_private.student_of(p_token text) returns text
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v text;
begin
  if p_token is null or length(p_token) <> 48 then return null; end if;
  update esep_private.sessions set last_used = now()
   where token_hash = sha256(convert_to(p_token,'UTF8')) and role='student' and last_used > now() - interval '180 days'
   returning student_id::text into v;
  return v;
end $$;

create or replace function esep_private.is_teacher(p_token text) returns boolean
language sql security definer set search_path = extensions, pg_temp as $$
  select exists (select 1 from esep_private.sessions
                  where p_token is not null and length(p_token) = 48
                    and token_hash = sha256(convert_to(p_token,'UTF8')) and role='teacher'
                    and created_at > now() - interval '12 hours');
$$;

create or replace function esep_private.student_json(p_student text) returns jsonb
language sql security definer set search_path = extensions, pg_temp as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'klass', coalesce(s.klass,''),
                            'state', coalesce(s.state,'{}'::jsonb), 'time_ms', coalesce(s.time_ms,0))
    from public.students s where s.id::text = p_student;
$$;

-- a client-supplied event time: null unless it parses and is plausible (a bad one must not reject the whole batch)
create or replace function esep_private.safe_ts(p text) returns timestamptz
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare v timestamptz;
begin
  begin v := p::timestamptz; exception when others then return null; end;
  if v between now() - interval '60 days' and now() + interval '10 minutes' then return v; end if;
  return null;
end $$;

-- the school day a moment falls on (Kazakhstan is UTC+5 all year)
create or replace function esep_private.kz_day(p timestamptz) returns date
language sql immutable set search_path = pg_catalog, pg_temp as $$ select ((p at time zone 'UTC') + interval '5 hours')::date $$;

-- best guess at the caller's address, for rate limits only (PostgREST exposes the request headers as a setting)
create or replace function esep_private.client_ip() returns text
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare h jsonb;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  return left(coalesce(h->>'cf-connecting-ip', btrim(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1)), ''), 60);
end $$;

-- THE scoring rule of the class board, in one place: right, no hints, not the placement test, not skipped.
-- (Whether it was a second try is checked by the caller against the `attempt` events.)
create or replace function esep_private.scores(ev jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(ev->>'ev' = 'answer' and ev->>'ok' = 'true' and coalesce(ev->>'hints','0') = '0'
              and coalesce(ev->>'mode','') <> 'diag' and ev->>'skip' is null, false) $$;

-- OWNER ONLY (SQL editor):  select esep_private.set_teacher_secret('a long phrase, not 1234');
create or replace function esep_private.set_teacher_secret(p_secret text) returns void
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if length(coalesce(p_secret,'')) < 12 then raise exception 'teacher secret: at least 12 characters (it is the only thing between the internet and every pupil''s record)'; end if;
  insert into esep_private.config(key, value) values ('teacher_secret', crypt(p_secret, gen_salt('bf', 10)))
  on conflict (key) do update set value = excluded.value;
  delete from esep_private.sessions where role='teacher';
end $$;

-- OWNER ONLY:  select esep_private.set_join_code('алма27');   -- '' switches it off again
-- With a join code set, a NEW name can only be registered by someone who knows the code (the teacher tells the
-- class once). Existing pupils never need it. Without it anyone on the internet can register into any class,
-- see that class's top five on the board, and clutter the teacher's list.
create or replace function esep_private.set_join_code(p_code text) returns void
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if coalesce(btrim(p_code),'') = '' then delete from esep_private.config where key = 'join_code';
  else insert into esep_private.config(key, value) values ('join_code', lower(btrim(p_code)))
       on conflict (key) do update set value = excluded.value; end if;
end $$;

-- ═════════════════════════ pupil API ═════════════════════════

-- Log in, or register on first use. Same rule as before: a name is one pupil; a second pupil with
-- the same name has to add a letter. Name match is exact (case-insensitive) — no wildcards.
create or replace function public.esep_login(p_name text, p_pin text, p_klass text default '', p_code text default '') returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare
  v_name  text := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_klass text := upper(btrim(coalesce(p_klass,'')));
  v_key   text;  v_ip text := esep_private.client_ip();  v_found boolean := false;  v_id text;  v_join text;  r record;
begin
  v_key := lower(v_name);
  if v_name = '' or length(v_name) > 60 or coalesce(p_pin,'') !~ '^\d{4}$' or length(v_klass) > 12 then
    return jsonb_build_object('error','bad_input'); end if;
  -- Misses are counted per (name, caller address): 8 in 10 minutes locks THAT address out of THAT name, so a stranger
  -- cannot lock a child out from elsewhere. A much higher cap per name alone bounds guessing from many addresses.
  if (select count(*) from esep_private.login_fails where name_key = v_key || '|' || v_ip and t > now() - interval '10 minutes') >= 8
  or (select count(*) from esep_private.login_fails where name_key like replace(replace(replace(v_key,'\','\\'),'%','\%'),'_','\_') || '|%' and t > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('error','locked'); end if;

  for r in select s.id::text as id, s.pin_hash, to_jsonb(s)->>'pin' as pin from public.students s where lower(s.name) = v_key loop
    v_found := true;
    if (r.pin_hash is not null and r.pin_hash = crypt(p_pin, r.pin_hash)) or (r.pin_hash is null and r.pin = p_pin) then
      v_id := r.id;
      update public.students set pin_hash = coalesce(pin_hash, crypt(p_pin, gen_salt('bf', 6))),
             klass = case when v_klass <> '' then v_klass else klass end, last_seen = now()
       where id::text = v_id;
      exit;
    end if;
  end loop;

  if v_id is null and v_found then
    insert into esep_private.login_fails(name_key) values (v_key || '|' || v_ip);
    if random() < 0.05 then delete from esep_private.login_fails where t < now() - interval '1 day'; end if;
    return jsonb_build_object('error','pin');
  end if;
  if v_id is null then
    select value into v_join from esep_private.config where key = 'join_code';
    if v_join is not null and lower(btrim(coalesce(p_code,''))) <> v_join then
      if coalesce(btrim(p_code),'') <> '' then
        if (select count(*) from esep_private.login_fails where name_key = '#code|' || v_ip and t > now() - interval '10 minutes') >= 8 then
          return jsonb_build_object('error','locked'); end if;
        insert into esep_private.login_fails(name_key) values ('#code|' || v_ip);
      end if;
      return jsonb_build_object('error','code');
    end if;
    insert into public.students(name, pin_hash, klass, state) values (v_name, crypt(p_pin, gen_salt('bf', 6)), v_klass, '{}'::jsonb)
    returning id::text into v_id;
  end if;
  return jsonb_build_object('token', esep_private.new_session('student', v_id), 'student', esep_private.student_json(v_id));
end $$;

-- A page load with a stored token: returns the pupil's row, or null when the token is dead.
create or replace function public.esep_resume(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_id text := esep_private.student_of(p_token);
begin if v_id is null then return null; end if; return esep_private.student_json(v_id); end $$;

create or replace function public.esep_save(p_token text, p_state jsonb, p_time_ms bigint default null) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_id text := esep_private.student_of(p_token);
begin
  if v_id is null then return false; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 300000 then
    raise exception 'esep_save: state must be a JSON object under 300 KB'; end if;
  update public.students set state = p_state, last_seen = now(),
         time_ms = case when p_time_ms is null or p_time_ms < 0 then time_ms else least(p_time_ms, 2000000000) end   -- fits an int4 column too
   where id::text = v_id;
  return true;
end $$;

-- p_events = [{ "t": "<iso>", "ev": {…} }, …]. The student id comes from the token, never from the client.
-- Returns how many were NEW (-1 = dead token). Resending the same events is fine: see events_student_u.
-- A pupil answers a few hundred items on a busy day; past 4000 events in a day the rest are dropped.
create or replace function public.esep_events(p_token text, p_events jsonb) returns int
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); v_id public.students.id%type; n int := 0; v_today int;
begin
  if v_sid is null then return -1; end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  select id into v_id from public.students where id::text = v_sid;
  select coalesce(sum(events),0) into v_today from esep_private.day_stats where student_id = v_id and day >= esep_private.kz_day(now()) - 1;
  if v_today >= 4000 then return 0; end if;

  with ins as (
    insert into public.events(student_id, t, ev)
    select v_id, coalesce(esep_private.safe_ts(e->>'t'), now()), e->'ev'
      from (select e from jsonb_array_elements(p_events) e limit 500) x
     where jsonb_typeof(e->'ev') = 'object' and pg_column_size(e->'ev') < 6000
    on conflict (student_id, (ev->>'u')) where ev ? 'u' do nothing
    returning t, ev),
  per_day as (
    select esep_private.kz_day(i.t) as day, count(*)::int as events,
           count(*) filter (where esep_private.scores(i.ev)
             and not exists (select 1 from ins a where a.ev->>'ev' = 'attempt' and a.ev->>'id' is not null and a.ev->>'id' = i.ev->>'id')
             and not exists (select 1 from public.events a where a.student_id = v_id and a.ev->>'ev' = 'attempt'
                              and i.ev->>'id' is not null and a.ev->>'id' = i.ev->>'id'))::int as score
      from ins i group by 1),
  up as (
    insert into esep_private.day_stats as d (student_id, day, events, score)
    select v_id, day, events, score from per_day
    on conflict (student_id, day) do update set events = d.events + excluded.events, score = d.score + excluded.score
    returning 1)
  select coalesce(sum(events),0)::int into n from per_day;
  return n;
end $$;

create or replace function public.esep_logout(p_token text) returns void
language sql security definer set search_path = extensions, pg_temp as $$
  delete from esep_private.sessions where p_token is not null and token_hash = sha256(convert_to(p_token,'UTF8'));
$$;

-- This week's class board. Score = answers that were right on the first try with no hints, outside the
-- placement test, since Monday (UTC+5). The caller sees only: the top five of THEIR class, their own place, and
-- per-class averages for their grade. Nobody's state, PIN or history leaves the server. Reads day_stats only.
create or replace function public.esep_board(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare
  v_sid text := esep_private.student_of(p_token);
  v_klass text; v_grade text; d0 date; v_today date := esep_private.kz_day(now()); v_top jsonb; v_me jsonb; v_classes jsonb; v_prev int;
begin
  if v_sid is null then return null; end if;
  select upper(btrim(coalesce(klass,''))) into v_klass from public.students where id::text = v_sid;
  d0 := date_trunc('week', v_today)::date;                                   -- Monday
  if v_klass = '' then return jsonb_build_object('klass', null, 'week_start', d0); end if;
  v_grade := substring(v_klass from '^\d+');

  -- last week, Monday up to the same weekday: "+11 on this day last week" compares like with like
  select coalesce(sum(d.score),0)::int into v_prev from esep_private.day_stats d join public.students s on s.id = d.student_id
   where s.id::text = v_sid and d.day >= d0 - 7 and d.day <= v_today - 7;

  with sc as materialized (
    select s.id::text as id, s.name, upper(btrim(s.klass)) as klass,
           coalesce((select sum(d.score) from esep_private.day_stats d where d.student_id = s.id and d.day >= d0), 0)::int as n
      from public.students s
     where s.name !~* '^\s*tester\s*$' and (s.last_seen > now() - interval '30 days' or s.id::text = v_sid)
       and (upper(btrim(coalesce(s.klass,''))) = v_klass
            or (v_grade is not null and substring(upper(btrim(coalesce(s.klass,''))) from '^\d+') = v_grade))),
  mine as (select *, rank() over (order by n desc) rk, count(*) over () cnt from sc where klass = v_klass)
  select (select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'name', name, 'n', n, 'me', id = v_sid) order by rk, name), '[]'::jsonb)
            from mine where n > 0 and rk <= 5),
         (select jsonb_build_object('rank', rk, 'n', n, 'of', cnt, 'prev_same_point', v_prev) from mine where id = v_sid),
         (select coalesce(jsonb_agg(jsonb_build_object('klass', klass, 'avg', av, 'pupils', pupils, 'mine', klass = v_klass) order by av desc, klass), '[]'::jsonb)
            from (select klass, round(avg(n))::int av, count(*)::int pupils from sc group by klass having count(*) >= 3) c)
    into v_top, v_me, v_classes;

  return jsonb_build_object('klass', v_klass, 'week_start', d0, 'top', v_top, 'me', v_me, 'classes', v_classes);
end $$;

-- ═════════════════════════ teacher API ═════════════════════════

create or replace function public.esep_t_login(p_secret text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_hash text; v_ip text := esep_private.client_ip();
begin
  -- per caller address only: a stranger hammering this must not be able to lock the real teacher out
  if (select count(*) from esep_private.login_fails where name_key = '#teacher|' || v_ip and t > now() - interval '10 minutes') >= 8 then
    return jsonb_build_object('error','locked'); end if;
  select value into v_hash from esep_private.config where key = 'teacher_secret';
  if v_hash is null then return jsonb_build_object('error','not_configured'); end if;
  if coalesce(p_secret,'') = '' or v_hash <> crypt(p_secret, v_hash) then
    insert into esep_private.login_fails(name_key) values ('#teacher|' || v_ip);
    return jsonb_build_object('error','secret'); end if;
  return jsonb_build_object('token', esep_private.new_session('teacher', null));
end $$;

create or replace function public.esep_t_students(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'klass', s.klass, 'state', s.state,
             'time_ms', s.time_ms, 'last_seen', s.last_seen, 'created_at', s.created_at) order by s.klass, s.name), '[]'::jsonb)
            from public.students s);
end $$;

-- p_students = ["<id>", …]; events in [p_from, p_to), oldest first
create or replace function public.esep_t_events(p_token text, p_students jsonb, p_from timestamptz default null, p_to timestamptz default null, p_limit int default 10000) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('student_id', q.student_id, 't', q.t, 'ev', q.ev) order by q.t), '[]'::jsonb)
            from (select e.student_id, e.t, e.ev from public.events e
                   where e.student_id in (select s.id from public.students s where s.id::text in (select jsonb_array_elements_text(p_students)))
                     and (p_from is null or e.t >= p_from) and (p_to is null or e.t < p_to)
                   order by e.t asc limit least(greatest(coalesce(p_limit,10000),1),20000)) q);
end $$;

create or replace function public.esep_t_set_state(p_token text, p_student text, p_state jsonb) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then raise exception 'esep: state must be a JSON object'; end if;
  -- stamp it: a pupil device holding older unsent work must lose to this (core.js keeps the state with the newer _t)
  update public.students set state = p_state || jsonb_build_object('_t', (extract(epoch from clock_timestamp()) * 1000)::bigint) where id::text = p_student;
  return found;
end $$;

create or replace function public.esep_t_reset_pin(p_token text, p_student text, p_pin text) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_ok boolean;
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if coalesce(p_pin,'') !~ '^\d{4}$' then raise exception 'esep: PIN is four digits'; end if;
  delete from esep_private.sessions where student_id::text = p_student;      -- sessions first, then the pupil row: the order esep_save locks in
  update public.students set pin_hash = crypt(p_pin, gen_salt('bf', 6)) where id::text = p_student;
  v_ok := found;
  delete from esep_private.login_fails where name_key like (select replace(replace(replace(lower(name),'\\','\\\\'),'%','\\%'),'_','\\_') from public.students where id::text = p_student) || '|%';
  return v_ok;
end $$;

create or replace function public.esep_t_delete(p_token text, p_student text) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  delete from public.events where student_id in (select id from public.students where id::text = p_student);
  delete from public.students where id::text = p_student;
  return found;
end $$;

create or replace function public.esep_t_logout(p_token text) returns void
language sql security definer set search_path = extensions, pg_temp as $$
  delete from esep_private.sessions where p_token is not null and token_hash = sha256(convert_to(p_token,'UTF8'));
$$;

-- ── one-off: fill the counters for the last 14 days from the events that already exist ──
insert into esep_private.day_stats(student_id, day, events, score)
select e.student_id, esep_private.kz_day(e.t), count(*)::int,
       count(*) filter (where esep_private.scores(e.ev) and not exists (
         select 1 from public.events a where a.student_id = e.student_id and a.ev->>'ev' = 'attempt'
            and e.ev->>'id' is not null and a.ev->>'id' = e.ev->>'id'))::int
  from public.events e
 where e.student_id is not null and e.t >= now() - interval '15 days'
   and exists (select 1 from public.students s where s.id = e.student_id)
 group by 1, 2
on conflict (student_id, day) do nothing;

-- ── who may call what ──
-- Postgres lets PUBLIC execute every new function; take that away, then grant the API to the browser role.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'esep_private') or (n.nspname = 'public' and p.proname like 'esep\_%') loop
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
