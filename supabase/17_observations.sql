-- Есеп жолы · classroom observation and feedback forms — ADDITIVE, re-runnable. Needs 01_additive.sql.
--
-- The owner's trial (2026-09-28): the app is used in real lessons now, and an assistant sits in the class to see what
-- breaks and what to improve. She fills a form on her phone (obs/) after each lesson — the class, the devices, who
-- could not log in, the mood, and a list of PROBLEMS, each with a type, a pupil, a station and what happened — and,
-- from time to time, a feedback sheet. The teacher reads them on the teacher page («Бақылау»).
--
-- The assistant is not a teacher and gets no teacher token: she types an OBSERVER CODE that the teacher sets on the
-- teacher page, and that code lets her do one thing — add a form. Nothing can be read with it.
--
--   esep_obs_add(code, author, form)   → {id} | {error: 'code' | 'locked' | 'bad_input'}   (assistant, no token)
--   esep_t_observations(token)         → the latest 300 forms, newest first                 (teacher)
--   esep_t_obs_delete(token, id)                                                              (teacher)
--   esep_t_observer_code(token, code)  → set the code ('' switches the form off)             (teacher)
--   esep_t_observer_status(token)      → {set: bool, n: forms}                               (teacher)
--
-- Install: run the whole file in the SQL editor. Re-running is safe. Undo:
--   drop function public.esep_obs_add(text,text,jsonb), public.esep_t_observations(text), public.esep_t_obs_delete(text,bigint),
--     public.esep_t_observer_code(text,text), public.esep_t_observer_status(text); drop table esep_private.observations;
--   delete from esep_private.config where key = 'observer_code';

create table if not exists esep_private.observations(
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('lesson','feedback')),
  author     text not null default '',
  klass      text not null default '',
  form       jsonb not null);
create index if not exists observations_created on esep_private.observations(created_at desc);

-- ═════════════════════ the assistant adds a form ═════════════════════
-- The code is checked the way a PIN is: misses are counted per caller address (10 in 10 minutes locks the address),
-- so the code cannot be guessed from a phone in the corridor. The form is stored as it came, capped in size; every
-- value in it is text the assistant typed and is escaped by the teacher page before it is shown.
create or replace function public.esep_obs_add(p_code text, p_author text, p_form jsonb) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_ip text := esep_private.client_ip(); v_code text; v_kind text; v_klass text; v_id bigint;
begin
  if (select count(*) from esep_private.login_fails where name_key = '#obs|' || v_ip and t > now() - interval '10 minutes') >= 10 then
    return jsonb_build_object('error','locked'); end if;
  select value into v_code from esep_private.config where key = 'observer_code';
  if v_code is null or v_code = '' or lower(btrim(coalesce(p_code,''))) <> v_code then
    insert into esep_private.login_fails(name_key) values ('#obs|' || v_ip);
    return jsonb_build_object('error','code'); end if;
  if p_form is null or jsonb_typeof(p_form) <> 'object' or length(p_form::text) > 30000 or length(coalesce(p_author,'')) > 60 then
    return jsonb_build_object('error','bad_input'); end if;
  v_kind := coalesce(p_form->>'kind','lesson'); if v_kind not in ('lesson','feedback') then v_kind := 'lesson'; end if;
  v_klass := upper(btrim(left(coalesce(p_form->>'klass',''), 12)));
  insert into esep_private.observations(kind, author, klass, form) values (v_kind, btrim(coalesce(p_author,'')), v_klass, p_form) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- ═════════════════════ the teacher reads, deletes, sets the code ═════════════════════
create or replace function public.esep_t_observations(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 't', o.created_at, 'kind', o.kind, 'author', o.author, 'klass', o.klass, 'form', o.form) order by o.id desc)
    from (select * from esep_private.observations order by id desc limit 300) o), '[]'::jsonb);
end $$;

create or replace function public.esep_t_obs_delete(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  delete from esep_private.observations where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.esep_t_observer_code(p_token text, p_code text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v text := lower(btrim(coalesce(p_code,'')));
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v = '' then delete from esep_private.config where key = 'observer_code'; return jsonb_build_object('set', false); end if;
  if length(v) < 4 or length(v) > 40 then return jsonb_build_object('error','bad_input'); end if;
  insert into esep_private.config(key, value) values ('observer_code', v) on conflict (key) do update set value = excluded.value;
  return jsonb_build_object('set', true);
end $$;

create or replace function public.esep_t_observer_status(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return jsonb_build_object('set', exists(select 1 from esep_private.config where key = 'observer_code' and value <> ''),
                            'n', (select count(*) from esep_private.observations));
end $$;

-- ═════════════════════ privileges ═════════════════════
revoke all on esep_private.observations from public;
do $$ declare f record; begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on esep_private.observations from anon'; end if;
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('esep_obs_add','esep_t_observations','esep_t_obs_delete','esep_t_observer_code','esep_t_observer_status') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
