-- Есеп жолы · put the four functions the browser could not call back on the air — ADDITIVE, re-runnable.
-- Needs whichever of 06/07/08/09 you have installed. It changes no logic at all: only volatility.
--
-- The bug, in full, because it cost a day and will cost another one if it is not written down:
--
--   The class board and the star purse both went silent. The data was perfect — esep_board returned the
--   whole ranking when called in SQL, and the portal rendered that exact JSON correctly when fed to it in a
--   harness. What the browser console actually said was:
--
--       POST .../rest/v1/rpc/esep_stars   405 (Method Not Allowed)
--       POST .../rest/v1/rpc/esep_board   405 (Method Not Allowed)
--
--   405 is not «broken», it is «not that way». PostgREST serves a STABLE or IMMUTABLE function over GET
--   only; a POST to one is answered 405 before the function is ever reached. core.js posts every RPC.
--
--   And the two that failed were precisely the two I had marked `stable` — 01's own esep_board, which had
--   worked since the first day, is volatile like everything else in this project. Marking a read-only
--   function `stable` is good SQL and, for anything in `public` that the client calls, a broken door.
--
--   RULE: a function in `public` named esep_* is VOLATILE. Always. There is a test that fails if it is not.
--   Private helpers in esep_private are never reached over HTTP and may be stable — most of them are.
--
-- alter function, not create: the bodies are already right, and retyping a body is how you lose one.

do $$ declare f record; n int := 0; begin
  for f in
    select p.oid::regprocedure::text as sig, p.proname, p.provolatile
      from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
     where nsp.nspname = 'public' and p.proname like 'esep\_%' and p.provolatile <> 'v'
  loop
    execute format('alter function %s volatile', f.sig);
    raise notice 'esep_joly 12: % was % — now volatile (PostgREST can POST to it again)',
      f.sig, case f.provolatile when 's' then 'stable' else 'immutable' end;
    n := n + 1;
  end loop;
  if n = 0 then raise notice 'esep_joly 12: nothing to do — every public esep_* function is already volatile'; end if;
end $$;

-- Proof, for the person running this in the SQL editor. Expected: no rows.
select p.oid::regprocedure::text as still_wrong,
       case p.provolatile when 's' then 'stable' when 'i' then 'immutable' end as volatility
  from pg_proc p join pg_namespace nsp on nsp.oid = p.pronamespace
 where nsp.nspname = 'public' and p.proname like 'esep\_%' and p.provolatile <> 'v';
