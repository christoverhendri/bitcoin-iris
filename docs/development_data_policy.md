# Source label visibility

Provider names in panel source footnotes and the market archive status are
shown only in development (`npm run dev`). Production keeps timestamps and
data quality indicators visible, including mock and unavailable status.

This is a presentation setting. Provider requests, databases, local archives,
feature fallbacks, API routes, ingestion, and replay work normally in production.
Source metadata remains in API responses; it is not an access restriction.

For simultaneous dev/production verification, `IRIS_NEXT_DIST_DIR` can isolate
the production output (for example `.next/production-check`). Use the same
value for `next build` and `next start`.
