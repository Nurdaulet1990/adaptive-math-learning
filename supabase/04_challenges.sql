-- Есеп жолы · classmate challenges («жарыс») — ADDITIVE, re-runnable. Needs 01_additive.sql (sessions, helpers).
-- Safe to run at any time after step 1; nothing else depends on it, and the portal simply shows no challenge
-- card until it exists.
--
-- The rules, all enforced here and not in the browser:
--   · asynchronous: A plays first, B plays whenever they next open the app — nobody has to be online together;
--   · both get THE SAME ten facts, generated and stored on the server when the challenge is created;
--   · the server marks the answers; the browser never reports a score;
--   · B cannot learn A's result before B has played (no function returns it until then);
--   · only a multiplication table whose AR station BOTH pupils have passed — a challenge is retrieval practice of
--     something already learned, never a race through new material;
--   · same class only; at most 3 challenges started per pupil per day; an unanswered challenge lapses after 7 days;
--   · the loser gets a star too (3 / 1, a dead heat 2 / 2).

set search_path = public, extensions;

do $$ declare idt text; begin
  select format_type(atttypid, atttypmod) into idt from pg_attribute where attrelid='public.students'::regclass and attname='id';
  execute format($f$
    create table if not exists esep_private.challenges(
      id           bigserial primary key,
      from_id      %1$s not null references public.students(id) on delete cascade,
      to_id        %1$s not null references public.students(id) on delete cascade,
      tbl          int  not null,
      items        jsonb not null,                       -- [[a,b], …] ten facts, the same for both
      created_at   timestamptz not null default now(),
      from_ok int, from_ms int, from_done_at timestamptz,
      to_opened_at timestamptz,
      to_ok   int, to_ms   int, to_done_at   timestamptz,
      from_seen    boolean not null default false)$f$, idt);
end $$;
create index if not exists challenges_to   on esep_private.challenges(to_id, created_at desc);
create index if not exists challenges_from on esep_private.challenges(from_id, created_at desc);

-- which AR station teaches which table — MUST mirror ar/stages.js (rows of type 'table'); ids there are never renumbered
create or replace function esep_private.ch_stage(p_tbl int) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case p_tbl when 2 then 'AR-04' when 5 then 'AR-05' when 10 then 'AR-06' when 3 then 'AR-09' when 4 then 'AR-10'
                    when 6 then 'AR-13' when 7 then 'AR-14' when 8 then 'AR-15' when 9 then 'AR-16' end $$;

-- the tables a pupil may be challenged on: their AR station is 'passed' in the pupil's own state
create or replace function esep_private.ch_tables(p_state jsonb) returns int[]
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select coalesce(array_agg(t order by t), '{}') from unnest(array[2,3,4,5,6,7,8,9,10]) t
   where p_state #>> array['AR','stages', esep_private.ch_stage(t), 'status'] = 'passed' $$;

-- the finished challenge as one side sees it
create or replace function esep_private.ch_result(p_id bigint, p_me text) returns jsonb
language sql stable security definer set search_path = extensions, pg_temp as $$
  select jsonb_build_object('id', c.id, 'table', c.tbl, 'opp_name', o.name,
           'my_ok',  case when mine then c.from_ok else c.to_ok end,   'my_ms',  case when mine then c.from_ms else c.to_ms end,
           'opp_ok', case when mine then c.to_ok   else c.from_ok end, 'opp_ms', case when mine then c.to_ms   else c.from_ms end,
           'outcome', case when w = 0 then 'tie' when (w = 1) = mine then 'win' else 'lose' end,
           'stars',   case when w = 0 then 2     when (w = 1) = mine then 3     else 1 end,
           'new', mine and not c.from_seen)
    from esep_private.challenges c
    cross join lateral (select c.from_id::text = p_me as mine,
                               case when c.from_ok > c.to_ok then 1 when c.from_ok < c.to_ok then 2
                                    when c.from_ms < c.to_ms then 1 when c.from_ms > c.to_ms then 2 else 0 end as w) x
    join public.students o on o.id = case when mine then c.to_id else c.from_id end
   where c.id = p_id and c.to_done_at is not null and p_me in (c.from_id::text, c.to_id::text) $$;

-- ═════════════════════════ API ═════════════════════════

-- Who can I challenge, and on what? Classmates seen in the last 30 days who share at least one passed table with me,
-- the ones closest to my own level first.
create or replace function public.esep_ch_options(p_token text) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); me record; v_mine int[]; v_today int;
begin
  if v_sid is null then return null; end if;
  select s.id, upper(btrim(coalesce(s.klass,''))) as klass, coalesce(s.state,'{}'::jsonb) as state into me from public.students s where s.id::text = v_sid;
  v_mine := esep_private.ch_tables(me.state);
  select count(*) into v_today from esep_private.challenges c where c.from_id = me.id and esep_private.kz_day(c.created_at) = esep_private.kz_day(now());
  return jsonb_build_object('today', v_today, 'limit', 3, 'klass', nullif(me.klass,''), 'mine', to_jsonb(v_mine),
    'classmates', case when me.klass = '' or cardinality(v_mine) = 0 then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'name', q.name, 'tables', to_jsonb(q.common)) order by q.gap, q.name), '[]'::jsonb)
        from (select s.id::text as id, s.name, c.common, abs(cardinality(esep_private.ch_tables(coalesce(s.state,'{}'::jsonb))) - cardinality(v_mine)) as gap
                from public.students s
                cross join lateral (select array(select unnest(esep_private.ch_tables(coalesce(s.state,'{}'::jsonb))) intersect select unnest(v_mine) order by 1) as common) c
               where s.id <> me.id and upper(btrim(coalesce(s.klass,''))) = me.klass and s.name !~* '^\s*tester\s*$'
                 and s.last_seen > now() - interval '30 days' and cardinality(c.common) > 0
               order by gap, s.name limit 12) q) end);
end $$;

-- Start a challenge. Returns the ten facts; the challenger plays at once and then calls esep_ch_submit.
create or replace function public.esep_ch_create(p_token text, p_to text, p_table int) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); me record; opp record; v_items jsonb; v_id bigint;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  if esep_private.ch_stage(p_table) is null then return jsonb_build_object('error','table'); end if;
  select s.id, s.name, upper(btrim(coalesce(s.klass,''))) klass, coalesce(s.state,'{}'::jsonb) state into me  from public.students s where s.id::text = v_sid;
  select s.id, s.name, upper(btrim(coalesce(s.klass,''))) klass, coalesce(s.state,'{}'::jsonb) state into opp from public.students s where s.id::text = p_to;
  if opp.id is null or opp.id = me.id or me.klass = '' or opp.klass <> me.klass or opp.name ~* '^\s*tester\s*$' then return jsonb_build_object('error','classmate'); end if;
  if not (p_table = any(esep_private.ch_tables(me.state)) and p_table = any(esep_private.ch_tables(opp.state))) then return jsonb_build_object('error','not_passed'); end if;
  if (select count(*) from esep_private.challenges c where c.from_id = me.id and esep_private.kz_day(c.created_at) = esep_private.kz_day(now())) >= 3 then
    return jsonb_build_object('error','daily_limit'); end if;
  if exists (select 1 from esep_private.challenges c where c.from_id = me.id and c.to_id = opp.id and c.to_done_at is null and c.created_at > now() - interval '7 days') then
    return jsonb_build_object('error','already_open'); end if;
  -- ten facts: the table against 1…10 in random order, the two factors in random order
  select jsonb_agg(case when random() < 0.5 then jsonb_build_array(p_table, k) else jsonb_build_array(k, p_table) end order by r)
    into v_items from (select k, random() r from generate_series(1,10) k) g;
  insert into esep_private.challenges(from_id, to_id, tbl, items) values (me.id, opp.id, p_table, v_items) returning id into v_id;
  return jsonb_build_object('id', v_id, 'table', p_table, 'opp_name', opp.name, 'items', v_items);
end $$;

-- The challenged pupil opens it: gets the same ten facts (never the challenger's result) and the clock starts on the server.
create or replace function public.esep_ch_open(p_token text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); c record;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  select ch.*, f.name as from_name into c from esep_private.challenges ch join public.students f on f.id = ch.from_id
   where ch.id = p_id and ch.to_id::text = v_sid;
  if c.id is null or c.from_done_at is null then return jsonb_build_object('error','not_found'); end if;
  if c.to_done_at is not null then return jsonb_build_object('error','done'); end if;
  if c.created_at < now() - interval '7 days' then return jsonb_build_object('error','expired'); end if;
  update esep_private.challenges set to_opened_at = coalesce(to_opened_at, now()) where id = p_id;
  return jsonb_build_object('id', c.id, 'table', c.tbl, 'opp_name', c.from_name, 'items', c.items);
end $$;

-- p_answers = [21, 56, null, …] in the order of the items. Marked here. The time is the browser's, but never more
-- than the server saw pass since the facts were handed out.
create or replace function public.esep_ch_submit(p_token text, p_id bigint, p_answers jsonb, p_ms int) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); c record; v_ok int; v_ms int; v_from boolean;
begin
  if v_sid is null then return jsonb_build_object('error','session'); end if;
  select * into c from esep_private.challenges where id = p_id and v_sid in (from_id::text, to_id::text) for update;
  if c.id is null then return jsonb_build_object('error','not_found'); end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) > 10 then return jsonb_build_object('error','answers'); end if;
  v_from := c.from_id::text = v_sid;
  if (v_from and c.from_done_at is not null) or (not v_from and c.to_done_at is not null) then return jsonb_build_object('error','done'); end if;
  if not v_from and (c.to_opened_at is null or c.from_done_at is null) then return jsonb_build_object('error','not_opened'); end if;
  select count(*) into v_ok from jsonb_array_elements(c.items) with ordinality i(it, n)
    join jsonb_array_elements(p_answers) with ordinality a(ans, n) using (n)
   where jsonb_typeof(a.ans) = 'number' and (a.ans #>> '{}') ~ '^\d{1,4}$' and (a.ans #>> '{}')::int = (i.it->>0)::int * (i.it->>1)::int;
  v_ms := greatest(1000, least(coalesce(p_ms, 2000000000),
            (extract(epoch from now() - case when v_from then c.created_at else c.to_opened_at end) * 1000)::bigint, 1800000))::int;
  if v_from then
    update esep_private.challenges set from_ok = v_ok, from_ms = v_ms, from_done_at = now() where id = p_id;
    return jsonb_build_object('waiting', true, 'my_ok', v_ok, 'my_ms', v_ms);
  end if;
  update esep_private.challenges set to_ok = v_ok, to_ms = v_ms, to_done_at = now() where id = p_id;
  return esep_private.ch_result(p_id, v_sid);
end $$;

-- Everything the portal and the challenge page need: what is waiting for me, what I am waiting for, the last results,
-- my stars. p_mark_seen: results of challenges I started are flagged `new` until a call with p_mark_seen = true.
create or replace function public.esep_ch_list(p_token text, p_mark_seen boolean default false) returns jsonb
language plpgsql security definer set search_path = extensions, pg_temp as $$
declare v_sid text := esep_private.student_of(p_token); v_out jsonb;
begin
  if v_sid is null then return null; end if;
  select jsonb_build_object(
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'from_name', f.name, 'table', c.tbl) order by c.created_at), '[]'::jsonb)
                   from esep_private.challenges c join public.students f on f.id = c.from_id
                  where c.to_id::text = v_sid and c.from_done_at is not null and c.to_done_at is null and c.created_at > now() - interval '7 days'),
    'waiting',  (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'to_name', t.name, 'table', c.tbl) order by c.created_at desc), '[]'::jsonb)
                   from esep_private.challenges c join public.students t on t.id = c.to_id
                  where c.from_id::text = v_sid and c.from_done_at is not null and c.to_done_at is null and c.created_at > now() - interval '7 days'),
    'results',  (select coalesce(jsonb_agg(esep_private.ch_result(q.id, v_sid) order by q.to_done_at desc), '[]'::jsonb)
                   from (select c.id, c.to_done_at from esep_private.challenges c
                          where v_sid in (c.from_id::text, c.to_id::text) and c.to_done_at is not null order by c.to_done_at desc limit 5) q),
    'stars',    (select coalesce(sum((esep_private.ch_result(c.id, v_sid)->>'stars')::int), 0) from esep_private.challenges c
                  where v_sid in (c.from_id::text, c.to_id::text) and c.to_done_at is not null),
    'today',    (select count(*) from esep_private.challenges c where c.from_id::text = v_sid and esep_private.kz_day(c.created_at) = esep_private.kz_day(now())),
    'limit', 3) into v_out;
  if p_mark_seen then update esep_private.challenges set from_seen = true where from_id::text = v_sid and to_done_at is not null and not from_seen; end if;
  return v_out;
end $$;

-- ── who may call what (same rule as 01: nothing for PUBLIC, the public esep_* API for the browser roles) ──
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where (n.nspname = 'esep_private') or (n.nspname = 'public' and p.proname like 'esep\_%') loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname='anon') then
      execute format('revoke all on function %s from anon', f.sig);
      if f.nspname = 'public' then execute format('grant execute on function %s to anon', f.sig); end if;
    end if;
    if exists (select 1 from pg_roles where rolname='authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
      if f.nspname = 'public' then execute format('grant execute on function %s to authenticated', f.sig); end if;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
