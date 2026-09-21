-- Есеп жолы · count the practice stars children already earned — ADDITIVE, re-runnable, idempotent.
-- Needs 01_additive.sql and 07_practice_stars.sql.
--
-- Why: the three kinds of star reach different distances back, and only one of them reaches all the way.
--
--   stage tests      all of it. They live in the pupil's own state (`stages[].tests`), written since the
--                    first day the runner existed, and 06 reads them straight out of it.
--   the daily goal   all of it. 07 added the `answers` column and filled it from the whole event log.
--   practice         NOT all of it. It counts `day_stats.score`, and 01 only backfilled FIFTEEN DAYS when
--                    it was installed — everything a child did before that is still sitting in
--                    public.events, uncounted. That is the gap this script closes.
--
-- What it does: rebuilds esep_private.day_stats from public.events, for every day, with exactly the rules
-- the live code uses — 01's `scores()` (right first time, no hints, outside the placement test, and not an
-- answer that needed the free retry) and 07's answer count. Running it twice changes nothing the second
-- time: it is a recompute, not an increment.
--
-- It does not touch a day that has no events. A pupil's stars can only go up, never down, unless events were
-- deleted — and nothing in this system deletes them.

with rebuilt as (
  select e.student_id,
         esep_private.kz_day(e.t) as day,
         count(*)::int as events,
         count(*) filter (where e.ev->>'ev' = 'answer' and e.ev->>'skip' is null)::int as answers,
         count(*) filter (where esep_private.scores(e.ev) and not exists (
           select 1 from public.events a
            where a.student_id = e.student_id and a.ev->>'ev' = 'attempt'
              and e.ev->>'id' is not null and a.ev->>'id' = e.ev->>'id'))::int as score
    from public.events e
   where e.student_id is not null
     and exists (select 1 from public.students s where s.id = e.student_id)
   group by 1, 2)
insert into esep_private.day_stats as d (student_id, day, events, answers, score)
select student_id, day, events, answers, score from rebuilt
on conflict (student_id, day) do update
   set events  = excluded.events,
       answers = excluded.answers,
       score   = excluded.score;

-- What changed, for the record. Run this on its own afterwards if you want the numbers:
--   select count(*) as days, sum(score) as perfect_answers, sum(score)/5 as practice_stars_in_total
--     from esep_private.day_stats;
