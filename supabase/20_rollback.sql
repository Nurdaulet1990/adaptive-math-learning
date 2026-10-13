-- Есеп жолы · undo 20_activity.sql. Removes only what 20 added; no data is touched. Re-runnable.
-- The teacher page's «Мектеп» tab then says the feature is not installed; everything else keeps working.
drop function if exists public.esep_t_activity(text, date, date);
