-- Есеп жолы · a pupil's own star total, with no class needed — ADDITIVE, re-runnable.
-- Needs 01_additive.sql, 06_stars.sql and 07_practice_stars.sql.
--
-- Why: the purse in the portal header was filled from esep_board, and the board's first rule is «no class, no
-- board» — it ranks a pupil against classmates, and without a class there are none. So a child with no class
-- saw 0 ★ for ever, even with eleven room stars sitting on the card below it. Seen in the wild on 2026-09-21:
-- 31 stations walked, the day's goal met, 3 wins in 5 races, ★ 11 on the room card — and 0 in the header.
--
-- A pupil's own total is not a ranking and must not depend on one. This is that number, on its own:
--   {n, week, parts:{route, practice, goal, challenge, room}}
-- The parts are what the portal can show a child who asks «where did my stars come from?», and what makes an
-- argument about a total answerable without opening the database.

create or replace function public.esep_stars(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare
  v_sid text := esep_private.student_of(p_token);
  v_state jsonb; d0 date; w0 timestamptz; m0 bigint;
  rs record; dy record; dw record; ch int; chw int; rm int; rmw int;
begin
  if v_sid is null then return null; end if;
  select state into v_state from public.students where id::text = v_sid;
  d0 := date_trunc('week', esep_private.kz_day(now()))::date;      -- Monday, Kazakh calendar day
  w0 := d0::timestamp - interval '5 hours';
  m0 := (extract(epoch from w0) * 1000)::bigint;

  select * into rs from esep_private.route_stars2(v_state, m0);
  select * into dy from esep_private.day_stars(v_sid, null);
  select * into dw from esep_private.day_stars(v_sid, d0);
  ch  := esep_private.ch_stars(v_sid, null); chw := esep_private.ch_stars(v_sid, w0);
  rm  := esep_private.rm_stars(v_sid, null); rmw := esep_private.rm_stars(v_sid, w0);

  return jsonb_build_object(
    'n',    rs.tot + dy.practice + dy.goal + ch + rm,
    'week', (rs.tot - rs.base) + dw.practice + dw.goal + chw + rmw,
    'parts', jsonb_build_object('route', rs.tot, 'practice', dy.practice, 'goal', dy.goal,
                                'challenge', ch, 'room', rm));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esep_stars' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
