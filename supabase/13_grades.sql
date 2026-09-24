-- Есеп жолы · the class carries its GRADE — ADDITIVE, re-runnable. Needs 08_classes.sql.
--
-- Why: the school has two Samuryq classes and two Qyran classes — one of each in grade 2 and one in grade 3.
-- esep_private.classes keys a class by its name alone, so «SAMURYQ» typed for the second-graders and «SAMURYQ»
-- typed for the third-graders are ONE row. Both cohorts would land in one class board, ranked against each
-- other, and the teacher page would show them as a single class of ~50. The grade is not decoration here;
-- it is half of the class's identity.
--
-- It is also already half of the board's logic: 01_additive's esep_board reads the grade off the FRONT of the
-- class name — substring(klass from '^\d+') — to find the other classes worth comparing with («сенің сыныбың»
-- against the rest of your year). A name with no leading number has no grade, so its board has no neighbours.
--
-- So the rule this file makes explicit and enforces, instead of leaving it to whoever types the name:
--
--        a class name BEGINS with its grade.   «2 SAMURYQ»  «3 QYRAN»  «3Ә»
--
-- What changes:
--   · classes gains a grade column, backfilled from the names already there, with a constraint that keeps the
--     column and the name prefix from ever disagreeing. Existing classes that never had a number keep grade
--     null and behave exactly as before.
--   · esep_t_class_add takes the grade as its own field and composes the name, so a teacher types «SAMURYQ»
--     in one box and «2» in the other and cannot produce a nameless-grade class by accident.
--   · esep_t_classes reports the grade, so the teacher page can group by year.
--   · the four classes of this school are seeded.
--
-- Re-running is safe: every step is add-if-absent, and the seed is on-conflict-do-nothing.
--
-- ⚠ To give an EXISTING class its grade, do not rename it — the pupils' students.klass still reads the old
--   name. Add the new class, then merge the old into it from the teacher page: esep_t_class_merge moves every
--   pupil across and drops the old row. That is what merge was built for.

-- ═════════════════════ the column ═════════════════════
alter table esep_private.classes add column if not exists grade smallint;

update esep_private.classes
   set grade = nullif(substring(name from '^\d+'), '')::int
 where grade is null and substring(name from '^\d+') is not null;

-- The name is what the pupils carry (students.klass is a text copy of it), so the name stays the truth and the
-- column has to agree with it. coalesce(..., -1) because a NULL comparison would let the check pass silently —
-- «SAMURYQ» with grade 2 is exactly the row this constraint exists to refuse.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'classes_grade_matches_name') then
    alter table esep_private.classes add constraint classes_grade_matches_name check (
      grade is null
      or (grade between 1 and 11
          and coalesce(nullif(substring(name from '^\d+'), '')::int, -1) = grade));
  end if;
end $$;

-- ═════════════════════ the list the pupil picks from ═════════════════════
-- Same shape as before — an array of names, because core.js and index.html both render it straight into a
-- <select>. Only the order is now taken from the column rather than re-parsed out of the string each time.
create or replace function public.esep_classes() returns jsonb
language sql security definer set search_path = extensions, pg_temp as $$
  select coalesce(jsonb_agg(name order by coalesce(grade, 99), name), '[]'::jsonb)
    from esep_private.classes $$;

-- ═════════════════════ the teacher's side ═════════════════════
create or replace function public.esep_t_classes(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', k, 'grade', g, 'pupils', n, 'listed', listed)
                   order by coalesce(g, 99), k), '[]'::jsonb)
            from (select coalesce(c.name, upper(btrim(s.klass))) as k,
                         -- a stray class is not on the list and so has no column: read its grade off the name.
                         coalesce(c.grade, nullif(substring(upper(btrim(coalesce(s.klass,''))) from '^\d+'),'')::int) as g,
                         count(s.id) filter (where s.name !~* '^\s*tester\s*$')::int as n,
                         bool_or(c.name is not null) as listed
                    from esep_private.classes c
                    full outer join public.students s on upper(btrim(coalesce(s.klass,''))) = c.name
                   where coalesce(c.name, upper(btrim(coalesce(s.klass,'')))) <> ''
                   group by 1, 2) q);
end $$;

-- The 2-argument version is dropped rather than kept beside this one: a 3-argument function with a default
-- third argument already answers a 2-argument call, and two candidates would make that call ambiguous.
-- A cached teacher page still sends only p_name and still works.
drop function if exists public.esep_t_class_add(text, text);

create or replace function public.esep_t_class_add(p_token text, p_name text, p_grade int default null) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare
  v text := regexp_replace(upper(btrim(coalesce(p_name,''))), '\s+', ' ', 'g');
  g int  := p_grade;
  pfx int;
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v = '' then return jsonb_build_object('error','bad'); end if;
  if g is not null and (g < 1 or g > 11) then return jsonb_build_object('error','grade'); end if;

  pfx := nullif(substring(v from '^\d+'), '')::int;
  if g is null then
    g := pfx;                                     -- «3Ә» typed whole: the number in front IS the grade
  elsif pfx is null then
    v := g::text || ' ' || v;                     -- «SAMURYQ» + 2 → «2 SAMURYQ»
  elsif pfx <> g then
    return jsonb_build_object('error','grade');   -- «3Ә» filed under grade 2 — one of the two is a typo
  end if;

  -- students.klass is checked against 12 characters at login (01/08) and in esep_my_class (10). A name this
  -- function accepts but login would refuse is a class nobody can ever join.
  if length(v) > 12 then return jsonb_build_object('error','long'); end if;

  insert into esep_private.classes(name, grade) values (v, g) on conflict (name) do nothing;
  return public.esep_t_classes(p_token);
end $$;

-- ═════════════════════ this school ═════════════════════
-- Grade 2 and grade 3, Samuryq and Qyran in each. Uppercase because that is how every other class name is
-- stored and compared — login, the board and merge all normalise with upper(btrim(…)).
insert into esep_private.classes(name, grade) values
  ('2 SAMURYQ', 2), ('2 QYRAN', 2), ('3 SAMURYQ', 3), ('3 QYRAN', 3)
on conflict (name) do nothing;

-- ═════════════════════ privileges ═════════════════════
-- esep_t_class_add was dropped and recreated, so its grants went with it.
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('esep_classes','esep_t_classes','esep_t_class_add') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

-- ═════════════════════ proof ═════════════════════
-- Expect 0 rows: nothing on the list may carry a grade its name does not begin with.
select name, grade from esep_private.classes
 where grade is not null and coalesce(nullif(substring(name from '^\d+'),'')::int, -1) <> grade;

-- Expect the four: 2 QYRAN | 2 SAMURYQ | 3 QYRAN | 3 SAMURYQ
select name, grade from esep_private.classes where grade in (2,3) order by grade, name;
