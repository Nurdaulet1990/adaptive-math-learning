-- Есеп жолы · tasks the teacher gives a class or single pupils — ADDITIVE, re-runnable. Needs 01 and 08.
--
-- The owner's feature (2026-09-27): a teacher publishes a task — one or more stations of one route, «N right
-- answers there» or «pass the stage test», a due date and a note — to whole classes and/or chosen pupils. The
-- pupil sees it at the top of Бүгін with her progress; the teacher sees who has done it.
--
-- Progress is worked out HERE from the pupil's answer log (public.events), counting only what happened AFTER the
-- task was published, on the task's stations — so earlier work does not count, and a second device counts too.
--   answers : right answers on the listed stations          → done when ≥ goal
--   test    : stage tests passed, one per listed station     → done when every station is passed
--
--   esep_t_task_create(token, route, stages[], kind, goal, due, note, klasses[], students[]) → {id} | {error}
--   esep_t_tasks(token)            → the latest 60 tasks, each with its pupils and their progress (teacher)
--   esep_t_task_close(token, id)   → stop it (pupils no longer see it)        esep_t_task_delete(token, id)
--   esep_my_tasks(token)           → the pupil's open tasks + progress (a finished one stays, green, until a day after it was due)
--
-- Install: run the whole file in the SQL editor. Re-running is safe. Undo:
--   drop function public.esep_t_task_create(text,text,text[],text,int,date,text,text[],text[]), public.esep_t_tasks(text),
--     public.esep_t_task_close(text,bigint), public.esep_t_task_delete(text,bigint), public.esep_my_tasks(text),
--     esep_private.task_progress(bigint,text); drop table esep_private.tasks;

create table if not exists esep_private.tasks(
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  route      text not null,
  stages     text[] not null,
  kind       text not null check (kind in ('answers','test')),
  goal       int  not null default 20,
  due        date,
  note       text not null default '',
  klasses    text[] not null default '{}',
  students   text[] not null default '{}',
  closed_at  timestamptz
);
create index if not exists events_student_t on public.events(student_id, t);

-- one pupil's progress on one task: {n, of, done}
create or replace function esep_private.task_progress(p_task bigint, p_student text) returns jsonb
language plpgsql stable security definer set search_path = extensions, pg_temp as $$
declare k record; v_n int; v_of int;
begin
  select * into k from esep_private.tasks where id = p_task; if not found then return null; end if;
  if k.kind = 'answers' then
    select count(*) into v_n from public.events e
     where e.student_id::text = p_student and e.t >= k.created_at
       and e.ev->>'ev' = 'answer' and e.ev->>'ok' = 'true' and e.ev->>'stage' = any(k.stages);
    v_of := k.goal;
  else
    select count(distinct e.ev->>'stage') into v_n from public.events e
     where e.student_id::text = p_student and e.t >= k.created_at
       and e.ev->>'ev' = 'test' and e.ev->>'pass' = 'true' and e.ev->>'stage' = any(k.stages);
    v_of := coalesce(array_length(k.stages,1),1);
  end if;
  return jsonb_build_object('n', least(v_n, v_of), 'of', v_of, 'done', v_n >= v_of);
end $$;

create or replace function public.esep_t_task_create(p_token text, p_route text, p_stages text[], p_kind text, p_goal int,
    p_due date, p_note text, p_klasses text[], p_students text[]) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_route text := upper(btrim(coalesce(p_route,''))); v_st text[]; v_kl text[]; v_pu text[]; v_id bigint;
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  if v_route !~ '^[A-Z]{2}$' then return jsonb_build_object('error','route'); end if;
  select array_agg(distinct s) into v_st from unnest(coalesce(p_stages,'{}')) s where s ~ ('^' || v_route || '-\d{2}$');
  if v_st is null or array_length(v_st,1) > 10 or array_length(v_st,1) <> (select count(distinct s) from unnest(p_stages) s) then
    return jsonb_build_object('error','stages'); end if;
  if coalesce(p_kind,'') not in ('answers','test') then return jsonb_build_object('error','kind'); end if;
  if p_kind = 'answers' and (p_goal is null or p_goal < 1 or p_goal > 200) then return jsonb_build_object('error','goal'); end if;
  if length(coalesce(p_note,'')) > 200 then return jsonb_build_object('error','note'); end if;
  select array_agg(distinct upper(btrim(k))) into v_kl from unnest(coalesce(p_klasses,'{}')) k where btrim(k) <> '';
  if exists (select 1 from unnest(coalesce(v_kl,'{}')) k where not exists (select 1 from esep_private.classes c where c.name = k)) then
    return jsonb_build_object('error','klass'); end if;
  select array_agg(distinct s.id::text) into v_pu from public.students s where s.id::text = any(coalesce(p_students,'{}'));
  if coalesce(array_length(p_students,1),0) <> coalesce(array_length(v_pu,1),0) then return jsonb_build_object('error','student'); end if;
  if coalesce(array_length(v_kl,1),0) + coalesce(array_length(v_pu,1),0) = 0 then return jsonb_build_object('error','nobody'); end if;
  insert into esep_private.tasks(route, stages, kind, goal, due, note, klasses, students)
  values (v_route, v_st, p_kind, case when p_kind='answers' then p_goal else 1 end, p_due, btrim(coalesce(p_note,'')), coalesce(v_kl,'{}'), coalesce(v_pu,'{}'))
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;

-- the pupils a task is for: everyone in its classes, plus the ones named
create or replace function public.esep_t_tasks(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  return (select coalesce(jsonb_agg(x order by (x->>'id')::bigint desc), '[]'::jsonb) from (
    select jsonb_build_object('id', k.id, 'created_at', k.created_at, 'route', k.route, 'stages', to_jsonb(k.stages), 'kind', k.kind,
      'goal', k.goal, 'due', k.due, 'note', k.note, 'klasses', to_jsonb(k.klasses), 'students', to_jsonb(k.students), 'closed', k.closed_at is not null,
      'pupils', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id::text, 'name', s.name, 'klass', s.klass,
                   'p', esep_private.task_progress(k.id, s.id::text)) order by s.klass, s.name), '[]'::jsonb)
                 from public.students s where upper(btrim(coalesce(s.klass,''))) = any(k.klasses) or s.id::text = any(k.students))) as x
    from esep_private.tasks k order by k.id desc limit 60) t);
end $$;

create or replace function public.esep_t_task_close(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  update esep_private.tasks set closed_at = coalesce(closed_at, now()) where id = p_id; return found;
end $$;

create or replace function public.esep_t_task_delete(p_token text, p_id bigint) returns boolean
language plpgsql security definer set search_path = extensions, pg_temp as $$
begin
  if not esep_private.is_teacher(p_token) then raise exception 'esep: teacher session required' using errcode = '28000'; end if;
  delete from esep_private.tasks where id = p_id; return found;
end $$;

-- a pupil's own tasks: open ones for her class or for her; finished ones stay until a day after their due date
create or replace function public.esep_my_tasks(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); v_kl text;
begin
  if v_sid is null then return null; end if;
  select upper(btrim(coalesce(klass,''))) into v_kl from public.students where id::text = v_sid;
  return (select coalesce(jsonb_agg(x order by (x->'p'->>'done')::boolean, x->>'due' nulls last, (x->>'id')::bigint desc), '[]'::jsonb) from (
    select jsonb_build_object('id', k.id, 'route', k.route, 'stages', to_jsonb(k.stages), 'kind', k.kind, 'goal', k.goal,
             'due', k.due, 'note', k.note, 'created_at', k.created_at, 'p', esep_private.task_progress(k.id, v_sid)) as x
      from esep_private.tasks k
     where k.closed_at is null and ((v_kl <> '' and v_kl = any(k.klasses)) or v_sid = any(k.students))
       and k.created_at > now() - interval '60 days'
     order by k.id desc limit 20) t
   where not (x->'p'->>'done')::boolean or coalesce((x->>'due')::date, ((x->>'created_at')::timestamptz + interval '7 days')::date) >= current_date - 1);   -- a done task stays (green) until a day after its due date
end $$;

-- ═════════════════════ privileges ═════════════════════
revoke all on esep_private.tasks from public;
revoke all on function esep_private.task_progress(bigint,text) from public;
do $$ declare f record; begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke all on esep_private.tasks from anon'; execute 'revoke all on function esep_private.task_progress(bigint,text) from anon'; end if;
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('esep_t_task_create','esep_t_tasks','esep_t_task_close','esep_t_task_delete','esep_my_tasks') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig); execute format('grant execute on function %s to anon', f.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig); execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
