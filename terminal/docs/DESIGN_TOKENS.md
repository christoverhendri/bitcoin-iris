# IRIS terminal visual contract

Bloomberg-inspired density and contrast, with IRIS branding. The shared palette
lives in `src/app/globals.css` and `src/lib/theme/tokens.ts`; token parity tests
keep CSS and canvas charts aligned.

| Token | Hex | Role |
| --- | --- | --- |
| bg | #000000 | workspace |
| panel | #080808 | panel body |
| sunk | #101010 | shell |
| line | #303030 | dividers |
| line2 | #4a4a4a | controls |
| txt | #eeeeee | primary text |
| mut | #aaaaaa | labels |
| dim | #858585 | secondary metadata |
| up | #37e76d | positive values |
| down | #ff4545 | negative values |
| blue | #48bfff | links and chart series |
| amber | #ff9d00 | navigation, titles, warning badges |
| purple | #c898ff | additional chart series |

Panel headers use `--header-bg: #24201a`. Active navigation and section tabs use
black on amber; selected timeframes use blue. Numbers use tabular figures.
JetBrains Mono is used throughout, with compact tracking and a 10px micro-text
floor (11px below 1024px). Preserve semantic positive/negative colors.

Square panels have explicit borders, 1px grid separators, 8px page padding and
6px page gaps. Tables have compact rows, alternating dark backgrounds and a
blue hover state. No shadows, rounded cards, or ornamental glow.

The desktop rail is 184px; below 1024px it becomes a 240px drawer. The content
column stays explicitly assigned to grid column 2 when the rail is fixed.
Preserve keyboard focus rings, reduced-motion support, source labels and MOCK
badges when refining the appearance.
