-- Есеп жолы · database step 3 of 3 — IRREVERSIBLE. A week or so after step 2, once nothing needs rolling back.
-- Take a backup first (Dashboard → Database → Backups, or pg_dump).
-- The check and the drop are ONE statement: if any pupil would be stranded, nothing is dropped — however this is run.
do $$ declare n int; begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='students' and column_name='pin') then
    raise notice 'students.pin is already gone — nothing to do'; return; end if;
  select count(*) into n from public.students where pin_hash is null;
  if n > 0 then
    raise exception '% pupil(s) have no pin_hash (their old PIN was empty or not four digits). Give each a new PIN from the teacher page, then run this again:  select name, klass from public.students where pin_hash is null;', n;
  end if;
  alter table public.students drop column pin;
end $$;
