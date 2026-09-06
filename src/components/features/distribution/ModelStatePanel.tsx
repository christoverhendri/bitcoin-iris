import {
  Panel,
  PanelHeader,
  KeyValueRow,
  Tag,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { PriceDistributionData } from '@/lib/features/priceDistribution';
import {
  toDistributionLabels,
  METHOD_NOTE,
  DVOL_COMPARE_NOTE,
} from '@/lib/features/priceDistribution';

/**
 * What the model currently believes, stated plainly.
 *
 * The row worth pausing on is DVOL against the model's own volatility. Nowhere
 * else in this terminal do the option market's forward expectation and our
 * backward-looking estimate sit next to each other, and the gap between them is
 * the most useful sanity check on the cone that exists.
 */
export function ModelStatePanel({ dist }: { dist: Envelope<PriceDistributionData> }) {
  const d = dist.data;
  const l = toDistributionLabels(d);

  const impliedGap =
    d.dvol !== null && d.sigmaNowAnnualPct > 0 ? d.dvol - d.sigmaNowAnnualPct : null;

  return (
    <Panel style={{ flex: 1, minWidth: 0 }}>
      <PanelHeader
        title="MODEL STATE"
        note="conditional volatility and assumptions"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag
              label={d.garchConverged ? 'GARCH FIT' : 'EWMA FALLBACK'}
              tone={d.garchConverged ? 'up' : 'amber'}
            />
            <MockBadge env={dist} />
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <KeyValueRow
          label="VOL NOW"
          value={l.sigmaNow}
          tone="txt"
          sub="annualised, conditional on today"
        />
        <KeyValueRow
          label="VOL LONG RUN"
          value={l.sigmaLongRun}
          tone="mut"
          sub="the level the model reverts to"
        />
        <KeyValueRow
          label="DVOL (DERIBIT)"
          value={l.dvol}
          tone={impliedGap === null ? 'dim' : impliedGap > 0 ? 'amber' : 'blue'}
          sub={
            impliedGap === null
              ? 'option market unavailable'
              : `${impliedGap > 0 ? '+' : ''}${impliedGap.toFixed(1)} vs model — ${
                  impliedGap > 0 ? 'market expects more' : 'market expects less'
                }`
          }
        />
        <KeyValueRow label="ENGINE" value={l.method} tone="txt" sub={l.volState} />
        <KeyValueRow
          label="DRIFT"
          value="REMOVED"
          tone="blue"
          sub={`${l.driftRemoved} stripped before simulating`}
        />
        <KeyValueRow
          label="HISTORY"
          value={l.sampleDays}
          tone="mut"
          sub={`daily closes from ${l.historyStart}`}
        />
        <KeyValueRow label="SPOT" value={l.spot} tone="txt" sub="anchor for every band" />
      </div>

      <div style={{ padding: '10px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          {METHOD_NOTE}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            lineHeight: 1.55,
            color: 'var(--dim)',
          }}
        >
          {DVOL_COMPARE_NOTE}
        </p>
      </div>

      <SourceFootnote env={dist} />
    </Panel>
  );
}
