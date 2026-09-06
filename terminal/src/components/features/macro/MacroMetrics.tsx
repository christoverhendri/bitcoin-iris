import {
  Panel,
  PanelGrid,
  PanelHeader,
  PanelStrip,
  StatTile,
  DivergingBar,
  DataTable,
  MockBadge,
  SourceFootnote,
} from '@/components/primitives';
import type { Envelope } from '@/lib/envelope';
import type { MacroMetric } from '@/lib/features/macroCountry';
import { toMacroCountryLabels } from '@/lib/features/macroCountry/present';
import type { Tone } from '@/lib/theme/tokens';
import { fmtZ } from '@/lib/format';

export interface MacroMetricsProps {
  macro: Envelope<MacroMetric[]>;
  country: string;
  countryLabel: string;
}

function zTone(z: number): Tone {
  if (z > 1) return 'up';
  if (z < -1) return 'down';
  return 'txt';
}

export function MacroMetrics({ macro, country, countryLabel }: MacroMetricsProps) {
  const m = macro.data.find((x) => x.country === country) ?? macro.data[0];
  const L = toMacroCountryLabels(m);

  const metrics: { key: string; label: string; value: string; z: number }[] = [
    { key: 'cpi', label: 'CPI INDEX', value: L.cpi, z: m.zScores.cpi },
    { key: 'rate', label: 'POLICY RATE', value: L.rate, z: m.zScores.rate },
    { key: 'growth', label: 'GDP GROWTH', value: L.growth, z: m.zScores.growth },
    { key: 'inflation', label: 'INFLATION', value: L.inflation, z: m.zScores.inflation },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <Panel style={{ display: 'flex', flexDirection: 'column' }}>
        <PanelHeader title="MACRO METRICS" note={countryLabel} right={<MockBadge env={macro} />} />
        <PanelStrip min={180} style={{ borderBottom: '1px solid var(--line)' }}>
          {metrics.map((x) => (
            <StatTile
              key={x.key}
              label={x.label}
              value={x.value}
              tone={zTone(x.z)}
              detail={`z ${fmtZ(x.z)}`}
            />
          ))}
        </PanelStrip>

        {/* z-score diverging rows */}
        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            className="iris-micro"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.14em', color: 'var(--mut)' }}
          >
            Z-SCORE VS TRAILING NORM (±3σ)
          </div>
          {metrics.map((x) => (
            <div key={x.key} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 46px', gap: 10, alignItems: 'center' }}>
              <span
                className="iris-micro"
                style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mut)', letterSpacing: '.06em' }}
              >
                {x.label}
              </span>
              <DivergingBar value={x.z} max={3} tone={zTone(x.z)} />
              <span
                className="iris-micro"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 9.5,
                  fontWeight: 700,
                  textAlign: 'right',
                  color: `var(--${zTone(x.z)})`,
                }}
              >
                {fmtZ(x.z)}
              </span>
            </div>
          ))}
        </div>
        <SourceFootnote env={macro} />
      </Panel>

      <PanelGrid>
        <Panel style={{ display: 'flex', flexDirection: 'column' }}>
          <PanelHeader title="METRIC DETAIL" note={m.country} right={<MockBadge env={macro} />} />
          <DataTable>
            <thead>
              <tr>
                <th>METRIC</th>
                <th>VALUE</th>
                <th>Z-SCORE</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((x) => (
                <tr key={x.key}>
                  <td style={{ color: 'var(--mut)', fontFamily: 'var(--mono)', fontSize: 10 }}>{x.label}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 10, fontWeight: 700 }}>{x.value}</td>
                  <td
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      fontWeight: 700,
                      color: `var(--${zTone(x.z)})`,
                    }}
                  >
                    {fmtZ(x.z)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          <SourceFootnote env={macro} />
        </Panel>
      </PanelGrid>
    </div>
  );
}
