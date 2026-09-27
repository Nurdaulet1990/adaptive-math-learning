-- Есеп жолы · the class board carries each pupil's animal — ADDITIVE, re-runnable. Needs 01, 06 and 07.
--
-- Why: the new Сынып tab stands the top three on a podium, each as the animal they chose (look v3, step 4).
-- The animal already lives in every pupil's state (state._ava, written by core.js when they pick it); the board
-- just never passed it on. This file adds one field, `ava`, to each row of `top` and to `me`. Nothing else.
--
-- Safety: state is written by the pupil's own browser, so `_ava` is whatever that browser sent. It reaches
-- other children's screens only if it is one of the eight animals of Core.AVATARS — anything else becomes
-- null and the page draws a letter instead. Keep this list in step with AVATARS in core/core.js.
--
-- ⚠ This REPLACES public.esep_board from 07_practice_stars.sql: the body is 07's with the `ava` lines marked
--   «← 14». If 07's board ever changes, run 07 and then this file again.
--
-- Install: run the whole file in the SQL editor. Re-running is safe. To undo, re-run 07_practice_stars.sql —
-- the portal treats a missing `ava` as «no animal» and draws the pupil's initial.

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
  m0 := (extract(epoch from w0) * 1000)::bigint;

  with sc as materialized (
    select s.id::text as id, s.name, upper(btrim(s.klass)) as klass,
           case when s.state->>'_ava' in ('🦊','🐻','🐣','🐬','🦉','🐯','🐢','🦋') then s.state->>'_ava' end as ava,   -- ← 14: the animal, from a closed list
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
  select (select coalesce(jsonb_agg(jsonb_build_object('rank', rk, 'name', name, 'n', n, 'week', week, 'me', id = v_sid, 'ava', ava) order by rk, name), '[]'::jsonb)   -- ← 14
            from mine where n > 0 and rk <= 5),
         (select jsonb_build_object('rank', rk, 'n', n, 'week', week, 'of', cnt, 'ava', ava) from mine where id = v_sid),   -- ← 14
         (select coalesce(jsonb_agg(jsonb_build_object('klass', klass, 'avg', av, 'pupils', pupils, 'mine', klass = v_klass) order by av desc, klass), '[]'::jsonb)
            from (select klass, round(avg(n))::int av, count(*)::int pupils from sc group by klass having count(*) >= 3) c)
    into v_top, v_me, v_classes;

  return jsonb_build_object('klass', v_klass, 'week_start', d0, 'top', v_top, 'me', v_me, 'classes', v_classes);
end $$;

-- ═════════════════════ privileges (as 07) ═════════════════════
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esep_board' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
