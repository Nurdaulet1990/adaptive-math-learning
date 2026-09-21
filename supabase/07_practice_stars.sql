-- Есеп жолы · practice earns stars too — ADDITIVE, re-runnable. Needs 01_additive.sql and 06_stars.sql.
--
-- Why: the very first app (pv/index.html, still live) gave a star for every correct answer — `state.stars++`.
-- When the platform layer was built the star was redefined as a stage-test result and that counter was left
-- behind in PV's own header, where nothing else reads it. So a child could practise for a whole lesson and
-- watch the number on the portal not move. Owner decision, 2026-09-21, after seeing what each rate adds up to:
--
--   · five answers with no hint, right the first time → 1 star   (NOT one per answer: that came to ~80 a week
--     and would have drowned everything else; this comes to ~15)
--   · the daily goal met (15 answers in a day)        → 1 star
--   · a stage test stays as it was: 10/10 → 3, 9/10 → 2, 8/10 → 1
--
-- Where the numbers come from: `esep_private.day_stats`, which the server already fills on every event batch —
-- one row per pupil per day. Nothing new for the client to keep, nothing that can drift, and the week's gain is
-- exact because the rows are dated. `score` there is already «right first time, no hints, outside the placement
-- test» (esep_private.scores), which is exactly the practice star's condition.
--
-- The one thing missing was a count of ANSWERS per day: day_stats had `events` (every logged event — hints and
-- retries included) and `score` (the perfect ones). The daily goal is neither. So this script adds an `answers`
-- column, fills it from the event log, and teaches esep_events to keep it.
--
-- ⚠ This script REPLACES public.esep_events from 01_additive.sql — the body is 01's with one counter added.
--   If that function is ever changed in 01, run this file again afterwards.

-- ═════════════════════ the missing count ═════════════════════
alter table esep_private.day_stats add column if not exists answers int not null default 0;

-- 01's esep_events, plus `answers`. Everything else — the 4000-a-day ceiling, the (pupil, u) de-duplication,
-- the «an answer that needed a retry does not score» rule — is unchanged.
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
           -- what the portal's daily ring counts: every finished answer, a skipped placement item excepted
           count(*) filter (where i.ev->>'ev' = 'answer' and i.ev->>'skip' is null)::int as answers,
           count(*) filter (where esep_private.scores(i.ev)
             and not exists (select 1 from ins a where a.ev->>'ev' = 'attempt' and a.ev->>'id' is not null and a.ev->>'id' = i.ev->>'id')
             and not exists (select 1 from public.events a where a.student_id = v_id and a.ev->>'ev' = 'attempt'
                              and i.ev->>'id' is not null and a.ev->>'id' = i.ev->>'id'))::int as score
      from ins i group by 1),
  up as (
    insert into esep_private.day_stats as d (student_id, day, events, answers, score)
    select v_id, day, events, answers, score from per_day
    on conflict (student_id, day) do update set events = d.events + excluded.events,
                                                answers = d.answers + excluded.answers,
                                                score = d.score + excluded.score
    returning 1)
  select coalesce(sum(events),0)::int into n from per_day;
  return n;
end $$;

-- fill the new column from the log. Recomputed from scratch, so running this file twice cannot double anything.
update esep_private.day_stats d
   set answers = coalesce(x.n, 0)
  from (select student_id, esep_private.kz_day(t) as day, count(*)::int as n
          from public.events where ev->>'ev' = 'answer' and ev->>'skip' is null
         group by 1, 2) x
 where x.student_id = d.student_id and x.day = d.day and d.answers is distinct from x.n;

-- ═════════════════════ what a day of practice is worth ═════════════════════
-- The goal must be the same number the portal's ring draws (index.html: GOAL). Change it here and there together.
create or replace function esep_private.day_goal() returns int
language sql immutable set search_path = pg_catalog, pg_temp as $$ select 15 $$;

-- p_since: count only days from that Kazakh calendar day on — that is how the week's gain is taken.
-- The practice star is cumulative, not per-day: four perfect answers today and one tomorrow is still a star.
-- Per-day rounding would have thrown away the remainder every evening, which a child would read as unfair.
-- One consequence, deliberate: a remainder left over on Sunday completes a star on Monday, so that star counts
-- as this week's gain. The alternative — dropping it — would punish the child for where the week boundary fell.
create or replace function esep_private.day_stars(p_sid text, p_since date default null, out practice int, out goal int)
language sql stable security definer set search_path = extensions, pg_temp as $$
  select (floor(coalesce(sum(score), 0) / 5)
          - floor(coalesce(sum(score) filter (where p_since is not null and day < p_since), 0) / 5))::int,
         count(*) filter (where answers >= esep_private.day_goal()
                            and (p_since is null or day >= p_since))::int
    from esep_private.day_stats d
    join public.students s on s.id = d.student_id and s.id::text = p_sid $$;

-- ═════════════════════ the board, now with all five sources ═════════════════════
-- 06 built this out of route + challenge + room stars; practice and the daily goal join them here.
create or replace function public.esep_board(p_token text) returns jsonb
language plpgsql stable security definer set search_path = extensions, pg_temp as $$
declare
  v_sid text := esep_private.student_of(p_token);
  v_klass text; v_grade text; d0 date; v_today date := esep_private.kz_day(now());
  w0 timestamptz; m0 bigint; v_top jsonb; v_me jsonb; v_classes jsonb;
begin
  if v_sid is null then return null; end if;
  select upper(btrim(coalesce(klass,''))) into v_klass from public.students where id::text = v_sid;
  d0 := date_trunc('week', v_today)::date;                                   -- Monday, Kazakh calendar day
  if v_klass = '' then return jsonb_build_object('klass', null, 'week_start', d0); end if;
  v_grade := substring(v_klass from '^\d+');
  w0 := d0::timestamp - interval '5 hours';                                  -- that Monday, 00:00 in UTC+5
  m0 := (extract(epoch from w0) * 1000)::bigint;

  with sc as materialized (
    select s.id::text as id, s.name, upper(btrim(s.klass)) as klass,
           (rs.tot + ch.all_ + rm.all_ + dy.practice + dy.goal)::int                       as n,
           (rs.tot - rs.base + ch.wk + rm.wk + dw.practice + dw.goal)::int                 as week
      from public.students s
      cross join lateral esep_private.route_stars2(s.state, m0) rs
      cross join lateral (select esep_private.ch_stars(s.id::text, null) as all_,
                                 esep_private.ch_stars(s.id::text, w0)   as wk) ch
      cross join lateral (select esep_private.rm_stars(s.id::text, null) as all_,
                                 esep_private.rm_stars(s.id::text, w0)   as wk) rm
      cross join lateral esep_private.day_stars(s.id::text, null) dy
      cross join lateral esep_private.day_stars(s.id::text, d0)   dw
     where s.name !~* '^\s*tester\s*$' and (s.last_seen > now() - interval '30 days' or s.id::text = v_sid)
       and (upper(btrim(coalesce(s.klass,''))) = v_klass
            or (v_grade is not null and substring(upper(btrim(coalesce(s.klass,''))) from '^\d+') = v_grade))),
  mine as (select *, rank() over (order by n desc) rk, count(*) over () cnt from sc where klass = v_klass)
  select (select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'name', name, 'n', n, 'week', week, 'me', id = v_sid) order by rk, name), '[]'::jsonb)
            from mine where n > 0 and rk <= 5),
         (select jsonb_build_object('rank', rk, 'n', n, 'week', week, 'of', cnt) from mine where id = v_sid),
         (select coalesce(jsonb_agg(jsonb_build_object('klass', klass, 'avg', av, 'pupils', pupils, 'mine', klass = v_klass) order by av desc, klass), '[]'::jsonb)
            from (select klass, round(avg(n))::int av, count(*)::int pupils from sc group by klass having count(*) >= 3) c)
    into v_top, v_me, v_classes;

  return jsonb_build_object('klass', v_klass, 'week_start', d0, 'top', v_top, 'me', v_me, 'classes', v_classes);
end $$;

-- ═════════════════════ privileges ═════════════════════
do $$ declare f record; begin
  for f in select n.nspname, p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'esep_private' and p.proname in ('day_stars','day_goal'))
               or (n.nspname = 'public' and p.proname in ('esep_board','esep_events')) loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
      if f.nspname = 'public' then execute format('grant execute on function %s to anon', f.sig); end if;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      if f.nspname = 'public' then execute format('grant execute on function %s to authenticated', f.sig); end if;
    end if;
  end loop;
end $$;
