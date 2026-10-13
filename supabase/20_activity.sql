-- Есеп жолы · how many pupils of each class worked on a day — ADDITIVE, re-runnable. Needs 01_additive.sql and
-- 07_practice_stars.sql (the `answers` column of esep_private.day_stats).
--
-- The owner's request (2026-10-13): the principal wants to watch, every day, how many pupils of each class used the
-- app. He signs in on the teacher page (the teacher password) and opens the «Мектеп» tab. «Used» means: answered at
-- least N questions that day; N is picked on the page (1 / 5 / 10 / 20), so this function does not fix it — it
-- returns, per day and class, the answer count of every pupil who answered at least once, and nothing else.
-- No name, no id, no answer leaves the server: only numbers.
--
--   esep_t_activity(token, from, to) → {from, to, days: [{day, klass, n: [answers of each working pupil, high → low]}]}
--                                      | {error: 'range'}        (to < from, or more than 62 days)
--
--   · It reads esep_private.day_stats.answers — the very number the pupil's daily ring on the portal shows (07):
--     every finished answer, in practice, in a stage test and in the placement test; a skipped item («Білмеймін»)
--     does not count. Its day is the Kazakhstan day (UTC+5, esep_private.kz_day). The event log is not scanned.
--   · The tester account is left out. klass is upper(btrim(students.klass)), the key esep_t_classes uses;
--     '' is a pupil with no class yet.
--   · Both dates null → today; one of them null → that one day.
--
-- Install: run the whole file in the SQL editor. Re-running is safe. Verify (expect: t):
--   select exists(select 1 from pg_proc where proname = 'esep_t_activity');
-- Undo: 20_rollback.sql.

do $$ begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'esep_private' and table_name = 'day_stats' and column_name = 'answers') then
    raise exception 'esep: 20_activity.sql needs 07_practice_stars.sql first (esep_private.day_stats.answers is missing)';
  end if;
end $$;

create or replace function public.esep_t_activity(p_token text, p_from date default null, p_to date default null) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare
  v_from date := coalesce(p_from, p_to, esep_private.kz_day(now()));
  v_to   date := coalesce(p_to, p_from, esep_private.kz_day(now()));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v_to < v_from or v_to - v_from > 61 then return jsonb_build_object('error', 'range'); end if;
  return jsonb_build_object('from', v_from, 'to', v_to, 'days', (
    select coalesce(jsonb_agg(jsonb_build_object('day', q.day, 'klass', q.k, 'n', q.ns) order by q.day, q.k), '[]'::jsonb)
      from (select d.day, upper(btrim(coalesce(s.klass, ''))) as k, jsonb_agg(d.answers order by d.answers desc) as ns
              from esep_private.day_stats d join public.students s on s.id = d.student_id
             where d.day between v_from and v_to
               and d.answers > 0
               and s.name !~* '^\s*tester\s*$'
             group by 1, 2) q));
end $$;

-- ═════════════════════ privileges ═════════════════════
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esep_t_activity' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
