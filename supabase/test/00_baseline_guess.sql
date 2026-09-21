-- TEST ONLY — never run on the real project. A guess at today's schema, inferred from what core.js and
-- teacher/index.html read and write, so the migration can be rehearsed on a throwaway local Postgres.
create role anon nologin; create role authenticated nologin;
create schema if not exists extensions; create extension if not exists pgcrypto with schema extensions;
grant usage on schema public, extensions to anon, authenticated;
create table public.students(id uuid primary key default gen_random_uuid(), name text not null, pin text not null, klass text,
  state jsonb default '{}'::jsonb, time_ms bigint default 0, last_seen timestamptz default now(), created_at timestamptz default now());
create table public.events(id bigserial primary key, student_id uuid references public.students(id) on delete cascade, t timestamptz default now(), ev jsonb);
grant all on public.students, public.events to anon, authenticated; grant usage, select on all sequences in schema public to anon, authenticated;
-- Supabase's default: functions created in public are executable by the API roles
alter default privileges in schema public grant execute on functions to anon, authenticated;
