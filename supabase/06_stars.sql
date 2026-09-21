-- Есеп жолы · the class board ranks by STARS — ADDITIVE, re-runnable. Needs 01_additive.sql.
-- Works with or without 04_challenges.sql / 05_rooms.sql: what is not installed simply contributes nothing.
--
-- Why: until now the board's number was «this week's answers, right first time, no hints» — invisible to a pupil
-- anywhere else in the app, and gone every Monday. Stars are the thing children already collect and already see on
-- every station. Owner decisions, 2026-09-21:
--   · route stars + challenge stars + room stars all count;
--   · the rank is the CUMULATIVE total, with this week's gain shown beside it;
--   · stations handed out by the diagnostic (or set by the teacher) carry no test and so are worth nothing —
--     a star is only ever earned by passing a stage test.
--
-- What a star is worth (unchanged, three places compute it the same way):
--   stage test  best result ever: 10/10 → 3, ≥9/10 → 2, ≥8/10 → 1      (core/map.js, the portal, here)
--   challenge   win 3 · draw 2 · loss 1                                 (04_challenges.sql, esep_private.ch_result)
--   room        1st 3 · 2nd–3rd 2 when ≥4 played · handed in 1          (05_rooms.sql, esep_private.room_stars)
--
-- Where the numbers come from: route stars are read out of `students.state` on the fly — the same jsonb the pupil's
-- own browser reads. No cache, no second copy that can drift, and nothing to backfill. Both numbers come out of one
-- pass (esep_private.route_stars2); measured below on 300 pupils each holding a finished 41-stage route.
--
-- ⚠ A function the browser calls must be VOLATILE (the default). PostgREST serves STABLE and IMMUTABLE
--   functions over GET only and answers a POST with 405 — and core.js posts everything. Marking esep_board
--   `stable` here (it is, logically) took the class board off the air for a day. Private helpers may be
--   stable; anything in `public` that the client calls may not.
--
-- Install: run this whole file in the SQL editor. Re-running is safe. To go back, re-run the esep_board block from
-- 01_additive.sql — no table or column here to undo, because this script creates none.

-- ═════════════════════ how many stars a stage is worth ═════════════════════
-- p_before (epoch ms, from the `t` the browser writes into each test record): count only tests taken BEFORE that
-- instant, which is how «stars as of Monday» is obtained. A record with no usable `t` counts as old, so a damaged
-- entry can never inflate this week's gain. Junk is skipped rather than raising: pupils can write this jsonb.
create or replace function esep_private.stage_stars(p_tests jsonb, p_before bigint default null) returns int
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case when b >= 1 then 3 when b >= 0.9 then 2 when b >= 0.8 then 1 else 0 end
    from (select coalesce(max((e->>'ok')::numeric / (e->>'n')::numeric), 0) as b
            from jsonb_array_elements(case when jsonb_typeof(p_tests) = 'array' then p_tests else '[]'::jsonb end) e
           where jsonb_typeof(e) = 'object'
             and jsonb_typeof(e->'ok') = 'number' and jsonb_typeof(e->'n') = 'number'
             and (e->>'n')::numeric > 0
             and (p_before is null or coalesce(jsonb_typeof(e->'t'), '') <> 'number' or (e->>'t')::numeric < p_before)) x $$;

-- every stage of every route in one pupil's state. A route key is two capitals (WP, FR, PV, AR, TE, …); `_t`, `_ava`
-- and anything else is skipped. The first trial version kept WP at the top level — that shape still counts, exactly
-- as the teacher page still reads it.
create or replace function esep_private.route_stars(p_state jsonb, p_before bigint default null) returns int
language sql stable set search_path = pg_catalog, pg_temp as $$
  select coalesce(sum(esep_private.stage_stars(st.value->'tests', p_before)), 0)::int
    from (select r.value as v
            from jsonb_each(case when jsonb_typeof(p_state) = 'object' then p_state else '{}'::jsonb end) r
           where r.key ~ '^[A-Z]{2}$' and jsonb_typeof(r.value) = 'object'
           union all
          select p_state
           where jsonb_typeof(p_state) = 'object' and jsonb_typeof(p_state->'stages') = 'object'
             and jsonb_typeof(p_state->'WP') is distinct from 'object') rt
    cross join lateral jsonb_each(case when jsonb_typeof(rt.v->'stages') = 'object' then rt.v->'stages' else '{}'::jsonb end) st
   where jsonb_typeof(st.value) = 'object' $$;

-- Both numbers the board needs — «stars now» and «stars as of Monday» — in ONE pass over the state. The two
-- single-value functions above are the readable definition and what the tests pin; this is what the board calls,
-- because calling them per stage per pupil cost 425 ms over 300 pupils and the board sits in front of a child.
create or replace function esep_private.route_stars2(p_state jsonb, p_before bigint, out tot int, out base int)
language sql stable set search_path = pg_catalog, pg_temp as $$
  select coalesce(sum(case when b  >= 1 then 3 when b  >= 0.9 then 2 when b  >= 0.8 then 1 else 0 end), 0)::int,
         coalesce(sum(case when b0 >= 1 then 3 when b0 >= 0.9 then 2 when b0 >= 0.8 then 1 else 0 end), 0)::int
    from (select max(z.ratio) as b, coalesce(max(z.ratio) filter (where z.old), 0) as b0
            from (select (e->>'ok')::numeric / (e->>'n')::numeric as ratio,
                         (p_before is null or coalesce(jsonb_typeof(e->'t'), '') <> 'number'
                          or (e->>'t')::numeric < p_before) as old,
                         rt.k, st.key as stage
                    from (select r.key as k, r.value as v
                            from jsonb_each(case when jsonb_typeof(p_state) = 'object' then p_state else '{}'::jsonb end) r
                           where r.key ~ '^[A-Z]{2}$' and jsonb_typeof(r.value) = 'object'
                           union all
                          select 'WP', p_state
                           where jsonb_typeof(p_state) = 'object' and jsonb_typeof(p_state->'stages') = 'object'
                             and jsonb_typeof(p_state->'WP') is distinct from 'object') rt
                    cross join lateral jsonb_each(case when jsonb_typeof(rt.v->'stages') = 'object' then rt.v->'stages' else '{}'::jsonb end) st
                    cross join lateral jsonb_array_elements(case when jsonb_typeof(st.value->'tests') = 'array' then st.value->'tests' else '[]'::jsonb end) e
                   where jsonb_typeof(st.value) = 'object' and jsonb_typeof(e) = 'object'
                     and jsonb_typeof(e->'ok') = 'number' and jsonb_typeof(e->'n') = 'number'
                     and (e->>'n')::numeric > 0) z
           group by z.k, z.stage) y $$;

-- ═════════════════════ stars won against other children ═════════════════════
-- These two are created against whatever is installed. Without 04 / 05 they are stubs returning 0, and running the
-- missing script later and re-running this one turns them into the real thing.
do $$ begin
  if to_regclass('esep_private.challenges') is not null then
    execute $f$
      create or replace function esep_private.ch_stars(p_sid text, p_since timestamptz default null) returns int
      language sql stable security definer set search_path = extensions, pg_temp as $b$
        select coalesce(sum(case when x.w = 0 then 2 when (x.w = 1) = x.mine then 3 else 1 end), 0)::int
          from esep_private.challenges c
          cross join lateral (select c.from_id::text = p_sid as mine,
                 case when c.from_ok > c.to_ok then 1 when c.from_ok < c.to_ok then 2
                      when c.from_ms < c.to_ms then 1 when c.from_ms > c.to_ms then 2 else 0 end as w) x
         where (c.from_id::text = p_sid or c.to_id::text = p_sid)
           and c.from_done_at is not null and c.to_done_at is not null
           and (p_since is null or greatest(c.from_done_at, c.to_done_at) >= p_since) $b$;
    $f$;
  else
    execute $f$ create or replace function esep_private.ch_stars(p_sid text, p_since timestamptz default null) returns int
                language sql immutable set search_path = pg_catalog, pg_temp as $b$ select 0 $b$; $f$;
  end if;

  if to_regprocedure('esep_private.room_ranks(bigint,text)') is not null then
    execute $f$
      create or replace function esep_private.rm_stars(p_sid text, p_since timestamptz default null) returns int
      language sql stable security definer set search_path = extensions, pg_temp as $b$
        select coalesce(sum(esep_private.room_stars(k.place, k.n, k.finished)), 0)::int
          from esep_private.room_ranks(null, p_sid) k
          join esep_private.rooms x on x.id = k.room_id and x.route is not null
         where k.student_id = p_sid and k.finished
           and (p_since is null or coalesce(x.closed_at, x.ends_at, x.started_at) >= p_since) $b$;
    $f$;
  else
    execute $f$ create or replace function esep_private.rm_stars(p_sid text, p_since timestamptz default null) returns int
                language sql immutable set search_path = pg_catalog, pg_temp as $b$ select 0 $b$; $f$;
  end if;
end $$;

-- ═════════════════════ the board ═════════════════════
-- Same shape as before — {klass, week_start, top, me, classes} — so an old cached portal keeps working; `n` is now
-- the star total and every row carries `week`, this week's gain. `prev_same_point` is gone: the main number no
-- longer resets, so the useful companion is what was added since Monday. An old portal reads it as undefined and
-- simply shows nothing extra.
create or replace function public.esep_board(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
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
  m0 := (extract(epoch from w0) * 1000)::bigint;                             -- the same instant as the browser writes it

  with sc as materialized (
    select s.id::text as id, s.name, upper(btrim(s.klass)) as klass,
           (rs.tot + ch.all_ + rm.all_)::int              as n,
           (rs.tot - rs.base + ch.wk + rm.wk)::int        as week
      from public.students s
      cross join lateral esep_private.route_stars2(s.state, m0) rs
      cross join lateral (select esep_private.ch_stars(s.id::text, null) as all_,
                                 esep_private.ch_stars(s.id::text, w0)   as wk) ch
      cross join lateral (select esep_private.rm_stars(s.id::text, null) as all_,
                                 esep_private.rm_stars(s.id::text, w0)   as wk) rm
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
-- Same rule as 01 and 05: the browser role may call what is in `public` and nothing in `esep_private`.
do $$ declare f record; begin
  for f in select n.nspname, p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'esep_private' and p.proname in ('stage_stars','route_stars','route_stars2','ch_stars','rm_stars'))
               or (n.nspname = 'public' and p.proname = 'esep_board') loop
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
