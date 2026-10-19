-- Coin Metrics daily close (halving-cycle + power-law pages, 2026-10-19).
-- 0002 carries the same row for fresh databases (it is generated from SOURCES);
-- this migration adds it to databases that already ran 0002.
-- Same shape as the 0002 catalogue seed; runtime columns are left alone on conflict.
insert into public.data_source_status
  (source_key, display_name, category, requires_key, is_enabled, unlock_note)
values
  ('coinmetrics', 'Coin Metrics (daily close since 2010)', 'quant', false, true,
   'Keyless Community API; falls back to blockchain.com market-price. If both are unreachable from this network the halving-cycle and power-law pages hide their panels.')
on conflict (source_key) do update set
  display_name = excluded.display_name,
  category     = excluded.category,
  requires_key = excluded.requires_key,
  unlock_note  = excluded.unlock_note;
