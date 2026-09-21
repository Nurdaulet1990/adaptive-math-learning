-- Есеп жолы · database step 2 of 3 — LOCK. Run ONLY after the new client (core.js that calls esep_*)
-- is live and you have logged in with it as a pupil and as a teacher. From this moment the browser
-- key can no longer read or write `students` / `events` directly; an old cached page will fail to
-- load data until it is refreshed. Reversible with 02_rollback.sql.

begin;   -- all or nothing
set local search_path = public, extensions;   -- pgcrypto (crypt, gen_salt, gen_random_bytes) lives in `extensions` on Supabase

-- any pupil registered by an old page since step 1 still has only a plaintext PIN: hash it
update public.students set pin_hash = crypt(to_jsonb(students)->>'pin', gen_salt('bf', 6))
 where pin_hash is null and to_jsonb(students)->>'pin' ~ '^\d{4}$';

alter table public.students enable row level security;
alter table public.events   enable row level security;

-- drop whatever permissive policies exist (we don't know their names) — with RLS on and no policy, nothing passes
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
            where schemaname='public' and tablename in ('students','events') loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    revoke all on public.students, public.events from anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    revoke all on public.students, public.events from authenticated; end if;
  revoke all on public.students, public.events from public;
end $$;

-- the id sequences of the two tables (if any): the browser role has no business calling nextval() on them
do $$ declare q text; r text; begin
  for q in select pg_get_serial_sequence(t, c.column_name) from (values ('public.students'),('public.events')) v(t)
            join information_schema.columns c on c.table_schema='public' and 'public.'||c.table_name = v.t
           where pg_get_serial_sequence(t, c.column_name) is not null loop
    foreach r in array array['anon','authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('revoke all on sequence %s from %I', q, r); end if;
    end loop;
    execute format('revoke all on sequence %s from public', q);
  end loop;
end $$;

commit;
notify pgrst, 'reload schema';
