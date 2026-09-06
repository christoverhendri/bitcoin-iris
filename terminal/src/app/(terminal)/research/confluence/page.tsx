import { getConfluence } from '@/lib/features/confluence';
import { ConfluenceBreakdown } from '@/components/features/confluence/ConfluenceBreakdown';

export const revalidate = 30;

export default async function ConfluencePage() {
  const confluence = await getConfluence({ symbol: 'BTC-USD' });

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <ConfluenceBreakdown confluence={confluence} />
    </div>
  );
}
