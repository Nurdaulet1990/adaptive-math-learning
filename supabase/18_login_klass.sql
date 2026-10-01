-- Есеп жолы · a pupil signs in with her name, her PIN AND her class — ADDITIVE, re-runnable. Needs 01, 08, 10 and 15.
--
-- Found on 2026-10-01: esep_login looked a pupil up by her NAME alone and checked the PIN; the class in the form
-- was ignored. So two children with the same name in two classes, who had both chosen the same easy PIN (1111),
-- were ONE account: the second one walked straight into the first one's progress, whatever class she picked —
-- and two such accounts that already existed always opened the older one for both. Owner's decision: the class
-- must be chosen, and must be right, on every login.
--
--   · No class in the form → 'klass_needed'. (The page asks for it before sending; this is for a stale page.)
--   · The account is looked for IN THE CHOSEN CLASS (or among old accounts that have no class yet, which take the
--     chosen one, as 15 does). Name + PIN right in that class → in.
--   · Name + PIN right, but the account is in ANOTHER class → 'klass_wrong', not in. Not counted as a failed PIN:
--     the PIN was right, the pupil only picked the wrong row of the list.
--   · Name exists but the PIN is wrong (in any class) → 'pin', counted towards the lock exactly as before.
--   · Name nowhere → a new pupil, with the school code, as before.
--   A new pupil whose name is already taken in another class is still told to add the first letter of her
--   surname ('pin', as before) — two children with one name stay two different names, which is also what the
--   teacher page and the class board need.
--
-- Install: run the whole file in the SQL editor, AFTER the pages with core.js v26 are live (they send the class
-- every time; an older page that does not would get 'klass_needed'). Re-running is safe.
-- Undo: re-run 15_klass_lock.sql.

create or replace function public.esep_login(p_name text, p_pin text, p_klass text default '', p_code text default '') returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare
  v_name  text := regexp_replace(btrim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_klass text := upper(btrim(coalesce(p_klass,'')));
  v_key   text;  v_ip text := esep_private.client_ip();  v_found boolean := false;  v_other boolean := false;  v_id text;  v_join text;  r record;
begin
  v_key := lower(v_name);
  if v_name = '' or length(v_name) > 60 or coalesce(p_pin,'') !~ '^\d{4}$' or length(v_klass) > 12 then
    return jsonb_build_object('error','bad_input'); end if;
  if v_klass = '' then return jsonb_build_object('error','klass_needed'); end if;                       -- ← 18
  if not exists (select 1 from esep_private.classes c where c.name = v_klass) then
    return jsonb_build_object('error','klass'); end if;
  if (select count(*) from esep_private.login_fails where name_key = v_key || '|' || v_ip and t > now() - interval '10 minutes') >= 8
  or (select count(*) from esep_private.login_fails where name_key like replace(replace(replace(v_key,'\','\\'),'%','\%'),'_','\_') || '|%' and t > now() - interval '10 minutes') >= 40 then
    return jsonb_build_object('error','locked'); end if;

  -- ← 18: the chosen class first (and old accounts with no class), oldest first; another class only to say so
  for r in select s.id::text as id, s.pin_hash, to_jsonb(s)->>'pin' as pin, upper(btrim(coalesce(s.klass,''))) as k
             from public.students s where lower(s.name) = v_key
            order by (upper(btrim(coalesce(s.klass,''))) in (v_klass, '')) desc, s.created_at loop
    v_found := true;
    if (r.pin_hash is not null and r.pin_hash = crypt(p_pin, r.pin_hash)) or (r.pin_hash is null and r.pin = p_pin) then
      if r.k <> '' and r.k <> v_klass then v_other := true; continue; end if;                            -- ← 18: right PIN, wrong class
      v_id := r.id;
      update public.students set pin_hash = coalesce(pin_hash, crypt(p_pin, gen_salt('bf', 6))),
             klass = case when btrim(coalesce(klass,'')) = '' then v_klass else klass end,               -- as 15: set once
             last_seen = now()
       where id::text = v_id;
      exit;
    end if;
  end loop;

  if v_id is null and v_other then return jsonb_build_object('error','klass_wrong'); end if;            -- ← 18
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

do $$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'esep_login' loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
