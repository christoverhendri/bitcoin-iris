# Overview redesign QA

Source: C:/Users/Revian/AppData/Local/Temp/codex-clipboard-7a0134bf-25d6-4531-a82b-f53aa4ed6ee9.png
Implementation: artifacts/previews/custom-dashboard-desktop-initial.jpg
Viewport: 1672 x 941 CSS pixels; source and implementation 1672 x 941 pixels, 1x density.
State: overview, 1Y, default workspace. Live data differs from the reference illustration.

## Comparison history

Iteration 1: source and implementation images opened together in one comparison input.
- P2: Overview chart and summary height push all lower widgets below the reference viewport. Fixed by reducing summary padding, compacting the OHLC strip/chart, and moving timeframe controls into the chart.
- P2: Overview SUMMARY strip duplicates the reference header and takes vertical space. Fixed by keeping overview market controls inside the chart widget.

Intentional changes: Signal Nexus omitted; chart widened to use its space. Actual observed network/exchange metrics replace unsupported reference ETF figures. Source inspector stays development-only. Mock, stale, and uncalibrated indicators retained. Source decorative network artwork and existing brand SVG reused.

Iteration 2: revised captures compared to the same source at 1672 x 941, 1x, initial scroll position.
- Fixed inline style precedence for overview controls and redundant chart headers.
- Fixed the chart price scale retaining its old 320px height after chart resizing; scale now tracks the 190px overview chart and volume region.
- Compacted the timestamp footnotes and aligned OHLC across the chart header, preserving all five fields and actual as-of times.
- P2: mobile editor footer was below the visible list. Fixed with an independently scrolling list and fixed flex footer; post-fix evidence is custom-dashboard-editor-mobile.jpg.

Iteration 3, final comparison: source and final desktop/mobile screenshots opened in the same comparison input. Navigation, brand, typography, navy/amber/blue palette, title band, five summary cards, wider chart and right-hand intelligence stack were inspected. Lower widgets are scrollable; the added personalization toolbar and actual provider diagnostics explain the extra vertical content. Intentional data-content and Nexus-removal differences are recorded above. No remaining actionable P0/P1/P2 findings.

## Final evidence

- Desktop: artifacts/previews/custom-dashboard-desktop.jpg, 1672 x 941 pixels/CSS viewport, density 1x, overview 1Y, default saved layout, scrollTop 0.
- Mobile: artifacts/previews/custom-dashboard-mobile.jpg, 390 x 844 pixels/CSS viewport, density 1x, default layout, scrollTop 0. No document horizontal overflow; navigation scrolls within its own strip.
- Editor: artifacts/previews/custom-dashboard-editor.jpg and custom-dashboard-editor-mobile.jpg. Width, visibility, density, numbered pointer handles and keyboard reorder buttons inspected. Save/Cancel remain visible on mobile.
- Focused comparison: full captures at equal desktop dimensions provide sufficient detail for the header, KPI cards and main chart regions; separate crops were not needed. Mobile is a usability/responsiveness check because no mobile reference was supplied.

## Interaction verification

- Hide macro, resize price to full width, move evidence earlier, compact density, Save, reload: persisted order/visibility/width/density verified from rendered DOM.
- Reset+Save restores defaults. Cancel discards a dragged draft.
- Pointer drag moves Recent evidence before Price action. Up/Down provides a keyboard alternative.
- Price/Technicals tabs display the corresponding data. Header command search navigates to the existing Market route.
- Existing Market minute archive replay still loads; the 2015-07-21 00:30 UTC inferred gap appears with missing OHLC.
- Mobile widgets stack with no page-level horizontal overflow; editor widget list scrolls while footer controls remain visible.
- Browser error log: no captured console errors on the verified overview.
- TypeScript, targeted ESLint and 160 unit tests passed. Production build completed successfully. Live production overview and archive endpoint returned 200; source labels and source inspector were absent while data remained available. Temporary production server stopped; dev preview retained.

## Follow-up polish

P3: optional account synchronization for layouts and a dedicated lightweight decorative banner asset. Current customization is browser-local and uses the supplied raster reference artwork with the existing brand asset.

final result: passed

## IRIS Focus Mode and workspace controls - 2026-10-13

Implemented manual Price, On-chain, Macro and News focus profiles with preview/cancel, temporary panel rearrangement, shared price/technical timeframe and restoration on Exit Focus. Pinned panes retain settings and position. Added pane collapse, maximize/restore (including Escape), eight named local workspace snapshots and validated JSON transfer including timeframe. Existing appearance controls and data-quality indicators remain intact.

Browser checks: Price focus retained a pinned source pane; maximize/restore and collapse/expand worked; Exit restored the original five-pane layout and 1Y timeframe. News Investigate selected a real story and rendered its publication marker on the loaded hourly chart, with an explicit non-causation note. A named Personal desk snapshot survived reload; export/import and saved-layout loading restored pane preferences. Mobile Macro Apply/Exit controls worked, and the 390 x 844 page had no horizontal overflow (clientWidth and scrollWidth both 390).

Visual evidence: artifacts/previews/iris-focus-news.jpg and iris-focus-mobile.jpg were opened and inspected. No inaccessible focus actions or clipped workspace fields were observed. Browser-local preferences do not synchronize across devices; Focus session context is intentionally temporary. Publication markers only appear within actual loaded coverage.

Validation: 164 tests passed across 35 files; targeted ESLint and TypeScript checks passed; isolated production build compiled and generated all routes successfully. Pre-existing middleware deprecation and experimental SQLite warnings remain. Build-generated TypeScript references were restored. No new dependency was introduced for Focus Mode.


## Panel signature and appearance controls - 2026-10-13

Source visual truth: artifacts/previews/custom-dashboard-desktop.jpg plus the requested angled corners, thin signal cuts, subtle technical framing and stronger headers. Existing layout/content/data are preserved.
Implementation: artifacts/previews/panel-style-desktop.jpg and panel-appearance-editor.jpg (1672 x 941 CSS/pixels, 1x), panel-appearance-mobile.jpg (390 x 844, 1x). Previous and new desktop captures were opened together in one comparison input; focus was the header band, diagonal opposing corner seams, top-edge signal cuts and source footnotes. The live frame preview and mobile editor were also inspected. Source and implementation content differ only in live values and requested presentation changes.

Visual iteration: the first underline preview exposed a header background specificity conflict. Selectors were corrected; the visible chain header now computes to rgb(9,15,21) with the selected accent underline. The final Signal preview uses the subtle accent-tinted band and 800-weight section titles. Technical inner seams and minimal square/no-signal mode were verified. No clipped text, hidden actions, document overflow or remaining actionable P0/P1/P2 findings.

Interaction verification: Research Desk + purple + 20px cuts + 18px spacing + signal cuts off were saved, reloaded and confirmed in the editor and computed DOM styling, including summary cards. Minimal sets square corners and disables cuts. Cancel restored saved Technical settings. Signal Terminal was restored without resetting widget choices. Legacy preferences migrate appearance defaults while keeping order/visibility/width/density; invalid appearance values are rejected in unit tests.

Responsive verification: 390 x 844 editor Save bottom=807px; 360 x 640 editor Save bottom=603px. Appearance section and widget list scroll independently on short screens. No page-level horizontal overflow. No captured overview console errors.

Validation: 161 tests passed, targeted lint and TypeScript passed, production build completed successfully. No new dependency or data request was introduced by frame controls. Temporary build-generated TypeScript references were restored; dev preview remains running.

final result: passed

## Direct workspace drag and resize - 2026-10-13

Added pointer-captured grips and two-axis corner resizing with 12-column/24px-row snapping, collision displacement and pin locks. Coordinates, widths and row heights persist with personal layouts, named workspaces and JSON transfer. Legacy automatic layouts migrate on the first adjustment. Focus geometry remains temporary; chart height responds to resizing and smaller panes retain scrollable content. Auto arrange releases unpinned manual coordinates.

Runtime verification: actual pointer drag moved Price from column 1 to column 3; corner drag changed width from 8 to 6 columns and height from 14 to 11 rows. Keyboard movement then changed column 3 to 2. Reload retained the exact grid placement. Pin disabled both handles. A Focus resize was discarded on Exit and restored personal geometry. Saving/loading Panel desk restored geometry after Auto arrange. At 390px the document width stayed 390px with stacked panes; at the normal 884px preview, grips remained visible and saved desktop coordinates applied.

Visual evidence: artifacts/previews/direct-panel-workspace.jpg was opened and inspected. Toolbar grips and corner resize handles are visible; content remains accessible inside sized panes. The current user-facing preview retains the saved Panel desk workspace. A temporary HMR parsing error during editing was fixed before successful typecheck and runtime checks.

Validation: 167 tests across 36 files, targeted ESLint, TypeScript and diff whitespace checks passed. No dependency added. Production build was not repeated for this client-only change.

## Market roadmap P0-P2 implementation - 2026-10-13

Implemented one OHLCV snapshot for chart, technicals, pivots and replay, with a fixed cutoff/content fingerprint. Prior native-period pivots expose their reference dates and broken-level labels. Full indicator warmup and contiguous-history requirements remain explicit. Added UTC seek, strict recorded-observation eligibility, bounded playback timers, viewport zoom/pan, two-axis crosshair, autoscale/locked bounds, linear/log scale, fullscreen outside clipped frames, indicator/volume/event toggles, archive coverage, confirmed swings/structure and adjacent historical comparison.

Data limits: event overlays use real non-mock BTC ETF news and Bitcoin transfers, conservatively observed during retrieval. ETF fund-flow amounts are not fabricated. Strict replay rejects versions seen after cutoff and converts later gap inference to UNKNOWN. True trade volume-at-price remains unavailable; the intraday volume proxy is labelled with its exact allocation assumption. No historical availability or missing candles are manufactured.

Browser checks: zoom changed UTC view bounds and pan shifted them; four EMA/Bollinger paths rendered; log scale and fullscreen toggled. UTC seek selected a cutoff of 2026-10-08T12:00:00Z without later candles. Minute archive loaded 232 bars/8 inferred gaps; seeking the 00:30 gap kept OHLC missing and volume 0 (inferred). Strict replay excluded all 232 later-observed versions and showed one 240-minute UNKNOWN availability span. Play advanced the cursor, Pause stopped it, and short history rejected a 100-bar-per-period comparison. Mobile at 390px had document width/scrollWidth 390/390 and main width/scrollWidth 380/380; fullscreen worked. The date-input event and broad input-width rule exposed during testing were fixed. A temporary HMR dependency-array warning was resolved by a fresh load.

Evidence: artifacts/previews/market-workspace-v2.jpg, market-replay-gap-v2.jpg and market-replay-mobile-v2.jpg. Desktop chart/replay captures were opened and inspected. Production compilation and generation of all 28 routes succeeded in an isolated output directory; generated TypeScript references were restored. 175 tests across 38 files and targeted TypeScript/ESLint passed. Existing middleware/Vite/experimental SQLite warnings remain.

See docs/market_workspace.md for methodology, cutoff semantics and outstanding data requirements.

## Coinbase execution ledger and actual volume profile - 2026-10-13

Added a separate local BTC-USD SQLite execution ledger and bounded public REST collector. It stores microsecond trade times, exact eight-place price/size units, immutable trade IDs, first observation times, content hashes and transactional page/cursor audits. Duplicate prints preserve first observation; conflicts reject the page. Older pagination resumes from a persisted checkpoint. Newest-page refresh cannot reset the deeper checkpoint. Existing candle archives remain separate and untouched.

Replaced and removed the OHLCV volume proxy. The readonly profile API bins actual execution sizes at actual execution prices with exact integer accumulation, validates stored content, enforces UTC event/observation cutoffs and exposes partial/empty coverage. Profiles cannot cross a mocked/nonmatching venue or remain visible after their window/cutoff/strict flag changes. Missing historical executions never fall back to candle volume. Loading a profile does not launch collection.

Live acquisition: five pages inserted 5,000 trades; resume inserted 1,000 older records; a 1,000-row head refresh inserted 450 new records and deduplicated 550 overlaps. The resulting 6,450 unique executions total 127.06435056 BTC in the observed profile. Captured bounds were 2026-10-13T04:36:29.571924Z to 04:59:31.196684Z (exclusive). Coverage for the wider 7D chart was correctly PARTIAL with zero ID-range holes, not a historical completeness claim.

UI checks: the live profile rendered twelve actual-price bins; changing to a 15-minute window hid old bins until reload. An older replay returned EMPTY with no fabricated execution volume. Kraken 4h chart disabled the Coinbase profile. Mobile loaded bars had width/scrollWidth 334/334; document 390/390 and main 380/380. Desktop/mobile profiles were captured and the desktop image inspected. Native meter styling follows the terminal palette.

Evidence: artifacts/previews/coinbase-trade-volume-profile.jpg and coinbase-trade-profile-mobile.jpg. Six ledger tests cover decimal/microsecond precision, dedupe/immutability/rollback, exact totals/bin conservation, cutoff exclusion, continuity boundaries, corruption and refusal to initialize over unrelated candle storage. Overall 180 tests across 39 files, TypeScript, targeted ESLint and isolated production build passed. Temporary build references were restored; no dependency, scheduler, commit or push was added. Collection remains finite/manual and the seeded tape is partial.

See docs/coinbase_trade_ledger.md for collection/resume commands and provenance limits.
