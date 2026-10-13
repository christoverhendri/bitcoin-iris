# IRIS terminal visual contract

Reference-led navy surfaces, amber headings and blue accents, with IRIS branding. The shared palette
lives in `src/app/globals.css` and `src/lib/theme/tokens.ts`; token parity tests
keep CSS and canvas charts aligned.

| Token | Hex | Role |
| --- | --- | --- |
| bg | #060b10 | workspace |
| panel | #090f15 | panel body |
| sunk | #0c141d | shell |
| line | #203449 | dividers |
| line2 | #35516d | controls |
| txt | #e1edf9 | primary text |
| mut | #8eabc7 | labels |
| dim | #718aa4 | secondary metadata |
| up | #12df93 | positive values |
| down | #ff5265 | negative values |
| blue | #36a8ff | links and chart series |
| amber | #ffad22 | navigation, titles, warning badges |
| purple | #ba8dff | additional chart series |

Panel headers use `--header-bg: #0d1722`. Active primary navigation has an amber underline; section tabs use amber and selected timeframes use blue. Numbers use tabular figures and JetBrains Mono is retained throughout.

Panels have explicit blue-gray borders, opposing angled corners, fine diagonal seams and thin signal cuts. Shared headers use stronger weight and tracking; overview users can select minimal/technical/signal frames, cut size, accent and header treatment. The overview uses a 12-column customizable grid, a five-card summary strip and a horizontal navigation header. Layout settings support comfortable/compact density; tablet and phone widths stack widgets without resizing their data models. Small metadata remains secondary to actual values.

Preserve keyboard focus rings, reduced-motion support, as-of timestamps and MOCK/unavailable badges. Provider-name labels and the source inspector are development-only; production data access remains enabled. The stale ticker state must not be replaced with an unverified LIVE indication. Personal layout persistence and its limits are documented in `../../docs/personal_dashboard.md`.
