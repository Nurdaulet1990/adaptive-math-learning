-- Есеп жолы · a pupil's class is set once — ADDITIVE, re-runnable. Needs 01, 08 and 10.
--
-- The school's rule (owner, 2026-09-27): a pupil does NOT change her class herself. The class is chosen once, when
-- she registers (or, for an old account with no class, the first time she picks one); after that only the
-- teacher moves her.
--
-- Until now esep_login wrote whatever class the login form sent, on EVERY login — so choosing another class in
-- the form moved an existing pupil, and 10's «already placed» guard on esep_my_class was easy to walk around.
--
--   · esep_login: an existing pupil's class is written only if she has none yet. The line is marked «← 15»;
--     the rest is 08's function unchanged. A class sent for an existing pupil is otherwise ignored, and the
--     answer carries her real class, which the page then shows.
--   · esep_my_class (10) already refuses a pupil who has a class — unchanged, nothing to do.
--   · esep_t_set_klass(token, pupil, class): NEW — the teacher moves one pupil to a listed class ('' = no class).
--
-- Install: run the whole file in the SQL editor. Re-running is safe. Undo: re-run 08_classes.sql (and
-- `drop function public.esep_t_set_klass(text,text,text);`).

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
  -- ADDED BY 08_classes.sql, and the only line that differs from 01's copy of this function:
  -- the class is chosen from esep_classes(), never typed, so anything else is a stale page or a crafted call.
  if v_klass <> '' and not exists (select 1 from esep_private.classes c where c.name = v_klass) then
    return jsonb_build_object('error','klass'); end if;
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
             klass = case when btrim(coalesce(klass,'')) = '' and v_klass <> '' then v_klass else klass end,   -- ← 15: set once, never changed by the pupil
             last_seen = now()
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

create or replace function public.esep_t_set_klass(p_token text, p_student text, p_klass text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v text := upper(btrim(coalesce(p_klass,'')));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v <> '' and not exists (select 1 from esep_private.classes c where c.name = v) then return jsonb_build_object('error','klass'); end if;
  update public.students set klass = v where id::text = p_student;
  if not found then return jsonb_build_object('error','student'); end if;
  return jsonb_build_object('klass', v);
end $$;

-- ═════════════════════ privileges (as 08) ═════════════════════
do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('esep_login','esep_t_set_klass') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
