-- READ ONLY. This file contains one SELECT and changes nothing. Safe to run on the live database.
--
-- Who was placed too low by the diagnostic bug fixed on 2026-09-22?
--
-- The bug: the twelve-question cap was checked before the last probe was counted, so a probe the pupil had
-- answered in full was thrown away. On AR the climb probes stations 1·3·7·15·31·41 — six probes, two items
-- each, exactly twelve questions — so the sixth probe was always the one discarded. A pupil who got all
-- twelve right was placed on station 32 of 41 instead of 41.
--
-- How this finds them, without hardcoding anything: during a diagnostic every answer is logged with
-- mode='diag' and the station it was asked about. A discarded probe is therefore a station the pupil
-- ANSWERED but that has no verdict in `diag.results`. That is the whole signature.
--
-- What to do with the answer:
--   ok = 2   the pupil got the discarded probe right, so that station was theirs and the placement is too
--            low by real stations. Ask them to tap «Бәрі тым оңай ма? Қайта диагностика» on the route's
--            home screen. With the fix in place, the re-run now ends where it should — and the re-diagnostic
--            can only move a pupil FORWARD, so there is no way for this to cost them anything.
--   ok < 2   the cap ended the diagnostic while the pupil was mid-probe and getting it wrong. The placement
--            is conservative rather than wrong; a re-run is optional.
-- Nothing here needs to be repaired in the database: the button does it, with the child present.

with d as (
  select s.id, s.name, coalesce(s.klass,'—') as klass, r.route,
         s.state->r.route->'diag'                                        as diag,
         s.state->r.route->'diag'->>'placed'                             as placed,
         to_timestamp(((s.state->r.route->'diag'->>'t')::bigint)/1000.0) as finished
    from public.students s
    cross join lateral (select jsonb_object_keys(s.state) as route) r
   where jsonb_typeof(s.state->r.route) = 'object'
     and s.state->r.route ? 'diag'
     and jsonb_typeof(s.state->r.route->'diag') = 'object'
     and (s.state->r.route->'diag'->>'n') ~ '^\d+$'
     and (s.state->r.route->'diag'->>'n')::int >= 12          -- only a capped run can lose a probe
     and s.state->r.route->'diag' ? 'results'
     and s.name !~* '^\s*tester\s*$'
)
select d.klass, d.name, d.route,
       d.placed                                          as "орналасқан станция",
       e.ev->>'stage'                                    as "есепке алынбаған станция",
       count(*)::int                                     as "сұралған",
       count(*) filter (where (e.ev->>'ok')::boolean)::int as "дұрыс",
       case when count(*) filter (where (e.ev->>'ok')::boolean) = 2
            then 'ҚАЙТА ДИАГНОСТИКА — станция ашылуы керек еді'
            else 'міндетті емес' end                     as "не істеу керек"
  from d
  join public.events e on e.student_id = d.id
 where e.ev->>'mode' = 'diag'
   and e.t between d.finished - interval '30 minutes' and d.finished + interval '1 minute'
   and e.ev->>'stage' is not null
   and not (d.diag->'results' ? (e.ev->>'stage'))         -- answered, but never given a verdict
 group by d.klass, d.name, d.route, d.placed, e.ev->>'stage'
 order by 7 desc, 1, 2;
