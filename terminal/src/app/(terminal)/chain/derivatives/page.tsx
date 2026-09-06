import { PanelGrid } from '@/components/primitives';
import { DvolPanel } from '@/components/features/derivatives/DvolPanel';
import { FundingPanel } from '@/components/features/derivatives/FundingPanel';
import { OpenInterestChart } from '@/components/features/derivatives/OpenInterestChart';
import { OptionsPanel } from '@/components/features/derivatives/OptionsPanel';
import { getDerivatives } from '@/lib/features/derivatives';

export const revalidate = 30;

export default async function DerivativesPage() {
  const derivatives = await getDerivatives({ symbol: 'BTC' });

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div
        className="iris-micro"
        style={{
          background: 'var(--panel)',
          borderLeft: '1px solid var(--line2)',
          padding: '9px 12px',
          fontFamily: 'var(--mono)',
          fontSize: 9,
          lineHeight: 1.6,
          letterSpacing: '.06em',
          color: 'var(--mut)',
        }}
      >
        FUNDING, OPEN INTEREST, BASIS, DVOL AND OPTION OPEN INTEREST ARE PULLED VERBATIM FROM BYBIT,
        OKX, BINANCE AND DERIBIT. THOSE NUMBERS ARE THE DATA. ANY READING OF THEM AS BULLISH OR
        BEARISH — CROWDED LONGS, SQUEEZE RISK, HEDGING DEMAND — IS AN INTERNAL OPINION, NOT A
        MEASUREMENT.
      </div>

      <PanelGrid columns="repeat(auto-fit, minmax(340px, 1fr))">
        <FundingPanel derivatives={derivatives} />
        <OpenInterestChart derivatives={derivatives} />
      </PanelGrid>
      <PanelGrid columns="repeat(auto-fit, minmax(340px, 1fr))">
        <DvolPanel derivatives={derivatives} />
        <OptionsPanel derivatives={derivatives} />
      </PanelGrid>
    </div>
  );
}
