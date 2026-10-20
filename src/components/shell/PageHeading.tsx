'use client';

import { usePathname } from 'next/navigation';
import { sectionFromPath } from '@/lib/nav';
import { SubTabs } from './SubTabs';

/** One plain sentence under each section title: what the page answers. */
const LEDE: Record<string, { title: string; lede: string }> = {
  forecast: { title: 'Forecast', lede: 'Where the models think bitcoin goes next, and how often they have been right.' },
  quant: { title: 'Quant', lede: 'The calendar, the four-year halving rhythm and the long-run power-law lane.' },
  chain: { title: 'On-chain', lede: 'Where the coins and the money are actually moving.' },
  macro: { title: 'Macro', lede: 'The US economy and the markets that move with bitcoin.' },
  sentiment: { title: 'Global sentiment', lede: 'How the crowd, the headlines and the world feel about bitcoin right now.' },
};

/**
 * The title row under the top bar: the section name set large, its one-line
 * lede, and the sub-tab switcher on the right. Overview has none — its price
 * card is the title.
 */
export function PageHeading() {
  const pathname = usePathname();
  const section = sectionFromPath(pathname);
  if (!section || section.key === 'overview') return null;
  const copy = LEDE[section.key] ?? { title: section.label, lede: '' };

  return (
    <div
      className="rise"
      style={{
        ['--i' as string]: 1,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        padding: '8px 0 24px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <h1 className="t-display" style={{ margin: 0, fontSize: 44, lineHeight: 1 }}>
          {copy.title}
        </h1>
        {copy.lede ? <p style={{ margin: 0, fontSize: 16, color: 'var(--mut)' }}>{copy.lede}</p> : null}
      </div>
      <SubTabs />
    </div>
  );
}
