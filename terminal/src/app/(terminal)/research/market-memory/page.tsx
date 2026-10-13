import { Panel, PanelHeader } from '@/components/primitives';
import { readMarketMemoryReport } from '@/lib/research/marketMemory.server';

export const dynamic = 'force-dynamic';

const METHOD_NAMES: Record<string, string> = {
  HISTORICAL: 'Historical median', PERSISTENCE: 'Latest variance', EWMA: 'EWMA / 7-day half-life',
  HAR: 'Log-HAR', B0: 'B0 / Conventional summaries', B1: 'B1 / Recency + seasonal controls',
  B2: 'B2 / Ordered path memory', B3: 'B3 / Path + activity clocks',
  B2_SHUFFLED: 'Control / Shuffled path order',
};
const cell = { padding: '10px 12px', borderBottom: '1px solid var(--line)', textAlign: 'right' as const };

export default async function MarketMemoryPage() {
  const result = await readMarketMemoryReport();
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <Panel>
        <PanelHeader title="MARKET MEMORY" note="EXPERIMENT / RESEARCH ONLY" />
        <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
          <p>Does the order of past price and trading activity add information beyond ordinary summaries and recency?</p>
          <p className="method-note">Read-only experiment results. No fitting on page load, trading signals, or automatic Forecast integration.</p>
          {result.status === 'unavailable' ? (
            <>
              <p style={{ color: 'var(--amber)' }}>UNAVAILABLE · {result.reason === 'not_configured'
                ? 'No local experiment is configured.' : 'The experiment is unreadable or fails validation.'}</p>
              <p>Run <code>python -m research_models.market_memory run --help</code>, then set
                {' '}<code>IRIS_MARKET_MEMORY_DIR</code> to the absolute output directory and restart the terminal.</p>
              <p>No demo performance numbers are substituted for a missing report.</p>
            </>
          ) : (
            <>
              <p>RETROSPECTIVE RECONSTRUCTION · Report checksum verified · {result.data.sourceHours.toLocaleString()} source hours</p>
              <p className="method-note">Generated {result.data.generatedAt}; source last observed {result.data.lastObservedAt}.
                This is not an untouched confirmatory holdout or a certified historical data vintage.</p>
              <details><summary>Source and calculation fingerprints</summary>
                <p style={{ overflowWrap: 'anywhere' }}>Input: <code>{result.data.inputHash}</code><br />Code: <code>{result.data.codeHash}</code></p>
                <p>These hashes identify local content. They do not certify provider authenticity, mathematical correctness, or prediction quality.</p>
              </details>
            </>
          )}
        </div>
      </Panel>
      {result.status === 'available' && result.data.experiments.map((experiment) => (
        <Panel key={experiment.horizon}>
          <PanelHeader title={`${experiment.horizon}-DAY HORIZON`} note="COMMON TEST ORIGINS / NO AUTOMATIC WINNER" />
          <div style={{ padding: 12, overflowX: 'auto' }}>
            <p className="method-note">{experiment.eligibleOrigins.toLocaleString()} eligible origins;
              {' '}{experiment.completeDays.toLocaleString()} complete positive-variation days before lookback/target exclusions.
              {' '}{experiment.firstOrigin.slice(0, 10)} to {experiment.lastOrigin.slice(0, 10)}.</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760, fontFamily: 'var(--mono)', fontSize: 12 }}>
              <caption style={{ textAlign: 'left', padding: '10px 0', color: 'var(--mut)' }}>
                Future hourly-derived daily variance · lower loss is better · nominal interval coverage 90%
              </caption>
              <thead><tr>
                {['Method', 'Inputs', 'Test N', 'Log MAE', 'Pinball', 'QLIKE', 'Coverage'].map((title) => (
                  <th key={title} scope="col" style={{ ...cell, textAlign: title === 'Method' ? 'left' : 'right', color: 'var(--amber)' }}>{title}</th>
                ))}
              </tr></thead>
              <tbody>{experiment.scores.map((score) => (
                <tr key={score.method}>
                  <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>{METHOD_NAMES[score.method]}</th>
                  <td style={cell}>{score.feature_count || '—'}</td>
                  <td style={cell}>{score.test_origins}</td>
                  <td style={cell}>{score.log_rv_mae.toFixed(4)}</td>
                  <td style={cell}>{score.log_rv_pinball.toFixed(4)}</td>
                  <td style={cell}>{score.qlike_mean_variance.toFixed(4)}</td>
                  <td style={cell}>{(100*score.rv_90pct_coverage).toFixed(1)}%</td>
                </tr>
              ))}</tbody>
            </table>
            <p className="method-note">Scores are equal-weight fold means. Empirical residual intervals do not guarantee conditional coverage.
              Inspect <code>summary.json</code> for purged boundaries, selected regularization, paired bootstrap intervals, and auxiliary targets.</p>
          </div>
        </Panel>
      ))}
      <Panel>
        <PanelHeader title="METHOD & LIMITATIONS" note="HYPOTHESIS MAY FAIL" />
        <div style={{ padding: 16, fontSize: 13, lineHeight: 1.6 }}>
          <p>B0 uses price/activity summaries. B1 adds past-only memory and seasonal controls.
            B2 adds six ordered signed areas from a four-channel level-two path signature.
            B3 adds variation-versus-volume clock diagnostics. The shuffled control is refitted, not merely shuffled at prediction time.</p>
          <p>Every feature uses a completed 30-day window with no filled gaps. Training, tuning, calibration and testing are separated by label-end timestamps.
            Mean variance uses empirical residual smearing rather than treating exp(mean log variance) as a mean.</p>
          <p>News response and global UTXO-cohort models are not fitted here. Mere time reparameterization leaves a path signature unchanged;
            the clock features measure a different relationship between observed channels.</p>
          {result.status === 'available' && <details><summary>Experiment warnings</summary>
            {result.data.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </details>}
        </div>
      </Panel>
    </div>
  );
}
