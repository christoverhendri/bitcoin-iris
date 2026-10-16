-- whale_events.impact: dropped.
--
-- The column held a 0-100 "attention score" derived from the USD size of the
-- transfer by a log ramp with hand-picked anchors ($500K -> 20, $500M -> 100).
-- It was a relabelling of `amount_usd` dressed up as a measurement of market
-- impact, with nothing behind the anchors. The terminal no longer shows or
-- computes it; the USD amount itself stays, and is the honest figure.
--
-- The ingest route stopped writing the column in the same change, so it must be
-- dropped (or made nullable) before that route runs against this table.
--
-- Apply with: supabase db push, or paste into the Supabase SQL Editor.

alter table public.whale_events drop column if exists impact;
