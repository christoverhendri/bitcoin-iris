# Market workspace: snapshot, replay and research studies

## P0: shared snapshot and replay

Market Price derives chart candles, indicators, pivots and replay from one OHLCV envelope. Overview chart/technical panes also share one market read. The standalone Technicals route starts its own request snapshot using the same builder; navigation is not a cross-request snapshot lock. A deterministic `market-v1` content fingerprint identifies the full loaded payload, including source identity, timestamp and revisions. It is not a cryptographic certificate. The completed-bar cutoff is captured once before the price read and remains fixed during replay. Archive pages instead retain their frozen observation watermark; page merges reject changing watermarks.

Malformed OHLCV, unordered/duplicate timestamps or mixed resolutions fail closed. Incomplete candles are excluded. Indicators require 35 continuous eligible candles for a full readout; overlays apply their individual EMA21/Bollinger20 warmup and restart across gaps. ATR uses actual true-range math and Bollinger %B uses the eligible last close, rather than band midpoint.

Classic floor-trader pivots use the immediately prior completed native candle's H/L/C. The reference interval/start/end and trailing <=100-candle VWAP method are visible. A close below S1/S2 is labelled broken support; a close above R1/R2 is labelled broken resistance. These labels describe relative position, not a separately confirmed breakout.

Replay has play/pause, previous/next step, speed, reset, slider and UTC date seek. Date seek snaps backwards to the last completely finished candle/gap span and never advances beyond the requested time. Compressed gaps preserve elapsed duration. Long delays are scheduled in bounded chunks to avoid browser timer overflow; pause and speed changes retain remaining playback time. OHLC stays missing during gaps; inferred no-trade volume is explicitly `0 (inferred)`.

Default replay is retrospective reconstruction of the loaded vintage. Strict availability additionally requires each selected revision's recorded `observedAt` to be <= replay cutoff. Missing/future observation timestamps are excluded. Gap classifications backed only by later evidence become UNKNOWN in strict mode. Strict mode does not automatically retrieve alternative older revisions and does not assert complete point-in-time backtest safety. The archive's `historicalBacktestSafe` remains false. A newly gathered 2015 candle does not prove that its current version was known in 2015.

## P1: interaction, coverage and overlays

Charts have OHLC hover/keyboard inspection, vertical/horizontal crosshair, wheel/button zoom, drag/button pan, viewport autoscale or locked price bounds, linear/log scale, reset and fullscreen with Escape/focus containment. Fullscreen renders outside clipped dashboard frames. Zoom/pan changes only the viewport; calculations retain the same revealed snapshot.

EMA21, Bollinger20/2 and observed volume are toggleable. Paths restart across missing intervals. Market Price can show non-mock BTC ETF **news publication** events and observed Bitcoin whale transfers from existing configured providers. These are not ETF fund-flow amounts or proof of causation. Finite timestamps, chart bounds, deduplication and a conservative retrieval-time availability watermark gate markers. Their current retrieval watermark excludes them from earlier historical replay; no historical event availability is invented. Missing providers or empty eligible windows show no markers.

Coverage inspector separates eligible loaded count/range from total saved archive count/bounds at the frozen observation watermark. It shows native resolution, gaps, content version, loaded integrity and strict exclusions. Whole-archive integrity is not claimed from checking one loaded page. Revision hash fields are retained and format-validated but not recomputed as storage-integrity certificates. Provider labels remain development-only; quality/timestamps remain visible in production.

## P2: research studies and data boundaries

Swing detection requires two candles on both sides of a strict high/low and records the confirmation time. Unconfirmed tail swings and windows crossing gaps are excluded. HH/HL or LH/LL structure uses the latest continuous segment; insufficient confirmed swings remain explicit.

Historical comparison uses two adjacent trailing groups of 5/20/50/100 revealed candles. Each shows UTC bounds, observed return and volume; gaps explicitly flag unequal elapsed coverage. No future period is read.

Executed-trade volume profiles now read the local Coinbase BTC/USD ledger. Every bin sums actual execution sizes at actual prices using exact decimal units; the OHLCV proxy has been removed. Profiles match the market/replay cutoff and require matching observed venue provenance. Captured bounds, ID-range holes, observation watermark and strict exclusions remain explicit. Missing trades never become candle estimates or zero-trade claims. The bounded initial collection is partial coverage, not a complete historical tape. No ingestion job is launched by these UI controls. See [Coinbase trade ledger](coinbase_trade_ledger.md) for collection/backfill commands and data contracts.

All features remain local. Existing workspace drag/resize, pinning, named layouts and source-label policies are preserved.
