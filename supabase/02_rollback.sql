-- Undo step 2: give the browser key direct table access again (the state the project was in before).
-- Use only if the new client turns out to be broken in the field. Step 1 can stay.
do $$ begin
  if exists (select 1 from pg_roles where rolname='anon') then
    grant select, insert, update, delete on public.students, public.events to anon;
    grant usage, select on all sequences in schema public to anon; end if;
  if exists (select 1 from pg_roles where rolname='authenticated') then
    grant select, insert, update, delete on public.students, public.events to authenticated;
    grant usage, select on all sequences in schema public to authenticated; end if;
end $$;
alter table public.students disable row level security;
alter table public.events   disable row level security;
notify pgrst, 'reload schema';
-- NOTE: pupils registered by the NEW client have no plaintext PIN, so the OLD client cannot log them in.
