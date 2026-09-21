-- Есеп жолы · the class is CHOSEN, never typed — ADDITIVE, re-runnable. Needs 01_additive.sql.
--
-- Why: the class was a free-text box. The 3А that one child typed as «5», another as «5 БАРЫС», a third as
-- «БАРЫС5» and a fourth as «5БАРЫС» is four different classes to the server, because all it ever did was
-- upper(btrim(…)). So the class board — top five of YOUR class, and your own place — quietly broke for almost
-- everyone: each child was ranked inside a class of one, the per-class average needs three pupils and so
-- appeared for nobody, and a child who left the box empty (it happened) got no board at all, for ever.
--
-- What changes: the teacher keeps a list of classes; the pupil picks one from it and cannot type anything else.
-- The list is seeded here from what is already in the database, so nothing is lost and nobody has to be
-- re-registered — the teacher then merges the duplicates from the teacher page, which moves the pupils too.
--
-- ⚠ This script REPLACES public.esep_login from 01_additive.sql — the body is 01's with one check added:
--   a class that is not on the list is refused. Without that, a stale cached page could still write junk.
--   If esep_login is ever changed in 01, run this file again afterwards.

-- ═════════════════════ the list ═════════════════════
create table if not exists esep_private.classes(
  name       text primary key,
  created_at timestamptz not null default now());

-- seed from the pupils that exist, normalised the way the board normalises. Re-running adds nothing new.
insert into esep_private.classes(name)
select distinct upper(btrim(klass)) from public.students
 where coalesce(btrim(klass),'') <> '' and name !~* '^\s*tester\s*$'
on conflict (name) do nothing;

-- The login card needs this BEFORE anyone is logged in, so it takes no token. It gives away the class names
-- of a school — «3А», «5Б» — and nothing else: no pupil, no count, no progress.
create or replace function public.esep_classes() returns jsonb
language sql security definer set search_path = extensions, pg_temp as $$
  select coalesce(jsonb_agg(name order by
           coalesce(nullif(substring(name from '^\d+'),'')::int, 99), name), '[]'::jsonb)
    from esep_private.classes $$;

-- ═════════════════════ login, with the class checked ═════════════════════
-- 01's function, with one added rule: p_klass must be '' or a class on the list.
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

-- ═════════════════════ the teacher's side ═════════════════════
-- every class, with how many pupils are in it — including classes nobody is in yet, so a new one can be made
-- before the first lesson, and including values still on pupils that are not on the list (marked stray).
create or replace function public.esep_t_classes(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('name', k, 'pupils', n, 'listed', listed)
                   order by coalesce(nullif(substring(k from '^\d+'),'')::int, 99), k), '[]'::jsonb)
            from (select coalesce(c.name, upper(btrim(s.klass))) as k,
                         count(s.id) filter (where s.name !~* '^\s*tester\s*$')::int as n,
                         bool_or(c.name is not null) as listed
                    from esep_private.classes c
                    full outer join public.students s on upper(btrim(coalesce(s.klass,''))) = c.name
                   where coalesce(c.name, upper(btrim(coalesce(s.klass,'')))) <> ''
                   group by 1) q);
end $$;

create or replace function public.esep_t_class_add(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v text := upper(btrim(coalesce(p_name,'')));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v = '' or length(v) > 12 then return jsonb_build_object('error','bad'); end if;
  insert into esep_private.classes(name) values (v) on conflict (name) do nothing;
  return public.esep_t_classes(p_token);
end $$;

-- Merge is the repair tool: every pupil whose class reads p_from is moved to p_into, and p_from leaves the list.
-- p_from does not have to be on the list — that is how the four spellings of one class are swept up.
create or replace function public.esep_t_class_merge(p_token text, p_from text, p_into text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare a text := upper(btrim(coalesce(p_from,''))); b text := upper(btrim(coalesce(p_into,'')));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if a = '' or b = '' or a = b then return jsonb_build_object('error','bad'); end if;
  if not exists (select 1 from esep_private.classes c where c.name = b) then return jsonb_build_object('error','into'); end if;
  update public.students set klass = b where upper(btrim(coalesce(klass,''))) = a;
  delete from esep_private.classes where name = a;
  return public.esep_t_classes(p_token);
end $$;

-- Only an empty class can be removed; otherwise a class disappears from under its pupils and their board with it.
create or replace function public.esep_t_class_delete(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v text := upper(btrim(coalesce(p_name,'')));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if exists (select 1 from public.students where upper(btrim(coalesce(klass,''))) = v) then
    return jsonb_build_object('error','not_empty'); end if;
  delete from esep_private.classes where name = v;
  return public.esep_t_classes(p_token);
end $$;

-- and the one a teacher needs most: put a pupil in a class (a child who registered before this script, or
-- picked the wrong one). Only a class on the list.
create or replace function public.esep_t_set_class(p_token text, p_student text, p_klass text) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v text := upper(btrim(coalesce(p_klass,'')));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v <> '' and not exists (select 1 from esep_private.classes c where c.name = v) then return false; end if;
  update public.students set klass = v where id::text = p_student;
  return found;
end $$;

-- ═════════════════════ privileges ═════════════════════
do $$ declare f record; begin
  execute 'revoke all on table esep_private.classes from public';
  for f in select n.nspname, p.oid::regprocedure::text as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('esep_classes','esep_login','esep_t_classes','esep_t_class_add',
                                'esep_t_class_merge','esep_t_class_delete','esep_t_set_class') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
      execute format('grant execute on function %s to anon', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
