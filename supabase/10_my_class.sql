-- Есеп жолы · a pupil without a class can choose one, once — ADDITIVE, re-runnable.
-- Needs 01_additive.sql and 08_classes.sql.
--
-- Why: on 2026-09-21, after the spellings were merged, class «5» held 34 pupils with 510 stars between
-- them — and 16 children had no class at all. No class means no board: esep_board has nobody to rank them
-- against, so it returns nothing and the portal drew nothing. Correct, and completely silent; from the
-- child's side the board had simply vanished.
--
-- The teacher can place them one by one (esep_t_set_class), but sixteen children is sixteen clicks for
-- something each of them knows. So: a pupil whose class is empty may set it herself, once.
--
-- «Once» is the whole security model here. A pupil who already has a class cannot change it — otherwise a
-- child could hop into whichever class she is top of, and the board would stop meaning anything. Moving a
-- pupil between classes stays the teacher's, where it can be seen.

create or replace function public.esep_my_class(p_token text, p_klass text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); v text := upper(btrim(coalesce(p_klass,''))); v_now text;
begin
  if v_sid is null then return jsonb_build_object('error','token'); end if;
  if v = '' or length(v) > 12 then return jsonb_build_object('error','bad'); end if;

  -- already placed is answered FIRST, and the same way whatever class was asked for: whether the request
  -- is refused must not depend on the target, or the refusal itself tells a pupil which classes exist.
  select upper(btrim(coalesce(klass,''))) into v_now from public.students where id::text = v_sid;
  if coalesce(v_now,'') <> '' then return jsonb_build_object('error','already', 'klass', v_now); end if;

  if not exists (select 1 from esep_private.classes c where c.name = v) then
    return jsonb_build_object('error','klass'); end if;

  update public.students set klass = v where id::text = v_sid;
  return jsonb_build_object('klass', v);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esep_my_class' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
