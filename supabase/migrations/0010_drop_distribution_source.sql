-- The Distribution tab (in-app FHS engine) was removed on 2026-10-19: the 30-day
-- tab runs the same engine in the worker, stored and validated. Its catalogue
-- row would otherwise keep counting in the feed-health rail.
delete from public.data_source_status where source_key = 'internal_distribution';
