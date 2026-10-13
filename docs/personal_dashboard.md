# Personal overview dashboard

The terminal uses the supplied dark navy, amber and blue reference with horizontal navigation. The Signal Nexus is omitted. Existing observed data, mocks, staleness markers, source footnotes and research qualifiers are retained. Exchange flows and US macro metrics represent the existing feature contracts; unsupported ETF figures and reference illustration values are not copied.

In Overview, choose **Customize dashboard** to show/hide widgets, drag their numbered handles, or use Up/Down to reorder. Select one-third, half, two-thirds or full width, then choose compact/comfortable density. **Save layout** stores preferences in this browser under `iris.overview.layout.v1`. Cancel or Escape discards the draft; Reset restores the default draft, which is persisted only on Save. If storage is unavailable, changes remain in the current session. Separate browser profiles/devices do not synchronize layouts.

At tablet/mobile sizes widgets stack to preserve readable widths. The editor keeps its footer visible and scrolls its widget list. Keyboard users can reorder with Up/Down. Price/Technicals tabs, timeframe navigation and Open chart reuse existing routes; historical replay remains on Market > Price.

Source inspector and provider-name footnotes remain development-only. Production continues reading data normally and retains timestamps and quality markers. Newly added widgets are merged into older valid preferences; unknown IDs, duplicate IDs, invalid widths and stale schema versions are rejected or defaulted.

The customization pattern is informed by [Messari's official widget demonstration](https://www.linkedin.com/posts/messari_master-your-crypto-workflow-a-complete-guide-activity-7320118262942371841-L3H6). No new UI dependency or external account is required.

See `design-qa.md` for visual and interaction verification evidence.

## Panel appearance

The shared panel frame uses opposing angled corners, diagonal corner seams and thin signal cuts, with stronger section titles. Overview appearance applies to both summary cards and data widgets. Other terminal pages use the shared Signal frame by default.

Customize dashboard > Panel appearance includes Signal Terminal, Research Desk and Minimal presets. Frame detail, accent (amber/blue/purple), cut size (square/8/14/20px), solid/underline headers, thin signal cuts and widget spacing (6/10/14/18px) can be adjusted independently. The preview updates immediately. Semantic up/down colors do not change with the accent. Save persists appearance with the layout; Cancel/Escape discard the draft. Reset restores the full default workspace, including appearance.

Old v1 preferences receive the default appearance without resetting widget order, visibility, widths or density. Every saved appearance field is validated against an allowlist; arbitrary colors/CSS and unsupported dimensions are ignored. No new dependency, image asset, continuous animation or data fetch is introduced by these controls.

## IRIS Focus Mode and workspaces

Choose Price, On-chain, Macro or News investigation, review the proposed panels and timeframe, then Apply Focus. Cancel preview leaves the workspace unchanged. Focus temporarily rearranges the panels while retaining pinned panels and their settings. Exit Focus restores the personal layout and the timeframe from before the investigation. Focus context lasts for the current page session; a full reload ends it, while the current URL timeframe remains.

Each pane offers Pin, Collapse/Expand and Maximize/Restore. Escape restores a maximized pane. Normal pane preferences persist locally; collapse changes during Focus are temporary. Explicit pin changes also update the personal layout. Pinning preserves the pane's position and settings, not a frozen copy of its data.

In Recent evidence, Investigate previews a News focus. After applying it, the selected story and publication time appear above the workspace. Price and technicals share the global timeframe. A purple publication marker appears only when the story falls within the loaded candles; otherwise the chart explains that it is outside the loaded range. Publication time does not establish price causation. Macro, network and flow panels retain their actual native coverage and observation times.

Saved workspaces & transfer stores up to eight named snapshots of layout, appearance, pane preferences and timeframe in this browser. Saving an existing name updates it. Export JSON downloads those preferences; Import JSON validates and restores them. Invalid files leave the current workspace intact. Loading/importing requires exiting Focus and closing customization first. A Focus layout can be saved as a named snapshot, but its selected story and session context are not exported. These controls do not launch collectors or historical backfills.

Pane controls and persistent workspaces are inspired by [FlowSurface](https://github.com/flowsurface-rs/flowsurface), implemented independently within the existing React dashboard. No native trading, order execution, multiwindow or order-book functionality is added.

## Direct panel placement

On workspaces wider than 768px, drag the dotted grip in a pane toolbar to move it, or the bottom-right triangular handle to resize its width and height. Placement snaps to a 12-column grid with 24px rows. Other panes move downward on collision; pinned panes lock their geometry and block overlapping drops. Arrow keys on either handle provide the same grid adjustments. Escape or pointer cancellation discards an unfinished gesture. A completed gesture automatically saves the coordinates and dimensions to the personal layout; no separate Save is needed.

Named workspaces and JSON export/import include panel coordinates and dimensions. Focus gestures remain temporary and Exit Focus restores personal geometry. Auto arrange releases manual placement for unpinned panes while keeping their widths and pinned placement. Reordering in the editor also releases unpinned manual coordinates so the requested order takes effect. Legacy preferences retain their original automatic layout until the first direct adjustment.

Small screens stack panes and hide the direct geometry handles while retaining desktop coordinates for a wider workspace. The customization editor remains available there. Resized charts scale with pane height; content that exceeds a small pane scrolls inside it. Widths are bounded to 2–12 columns and heights to 4–40 grid rows.
