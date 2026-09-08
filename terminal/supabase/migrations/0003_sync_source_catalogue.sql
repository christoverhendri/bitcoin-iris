-- Keep already-installed databases aligned with the terminal source catalogue.
-- 0002 seeded an older FRED unlock note; migrations are immutable, so correct
-- that drift with a forward-only migration.
update public.data_source_status
set unlock_note = 'Macro provider is not configured. Set FRED_API_KEY in terminal/.env.local and restart the server.'
where source_key = 'fred';
