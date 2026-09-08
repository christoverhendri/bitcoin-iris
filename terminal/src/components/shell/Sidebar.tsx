'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  NAV_GROUPS,
  SECTIONS,
  sectionHref,
  sectionsInGroup,
  type Section,
} from '@/lib/nav';
import { useDrawer } from './AppShell';
import { StatusFooter, type FeedHealth } from './StatusFooter';

function NavItem({
  section,
  active,
  onNavigate,
}: {
  section: Section;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={sectionHref(section)}
      prefetch={false}
      className="nav-btn"
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '8px 9px',
        borderLeft: `2px solid ${active ? 'var(--amber)' : 'transparent'}`,
        background: active ? 'var(--amber)' : 'transparent',
        color: active ? 'var(--bg)' : 'var(--amber)',
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        letterSpacing: '0',
        textTransform: 'uppercase',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 10, minWidth: 20 }}>
        {String(SECTIONS.indexOf(section) + 1).padStart(2, '0')}
      </span>
      <span>{section.label}</span>
    </Link>
  );
}

export function Sidebar({ health, now }: { health?: FeedHealth; now?: number }) {
  const pathname = usePathname();
  const activeKey = pathname.split('/').filter(Boolean)[0];
  const { open, setOpen } = useDrawer();

  return (
    <aside
      data-open={open ? 'true' : 'false'}
      style={{
        background: 'var(--sunk)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
      }}
      className="iris-rail"
    >
      {/* Original blue-and-amber mark supplied by Vian. */}
      <div style={{ padding: '10px 11px', borderBottom: '2px solid var(--amber)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Image src="/brand/btc-iris.svg" alt="" width={40} height={40} unoptimized style={{ flexShrink: 0 }} />
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '.12em',
              color: 'var(--amber)',
            }}
          >
            IRIS BTC
          </span>
        </div>
        <div
          className="iris-micro"
          style={{
            fontFamily: 'var(--mono)',
            fontSize: 8.5,
            letterSpacing: '.04em',
            color: 'var(--dim)',
            marginTop: 5,
            paddingLeft: 11,
          }}
        >
          INTELLIGENCE TERMINAL
        </div>
      </div>

      <nav
        aria-label="Sections"
        style={{ flex: 1, overflowY: 'auto', padding: '4px 0', minHeight: 0 }}
      >
        {NAV_GROUPS.map((group) => {
          const items = sectionsInGroup(group);
          if (items.length === 0) return null;
          return (
            <div key={group} style={{ marginBottom: 6 }}>
              <div
                className="iris-micro"
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  letterSpacing: '.05em',
                  color: 'var(--mut)',
                  padding: '7px 11px 5px',
                  borderBottom: '1px solid var(--line)',
                }}
              >
                {group.toUpperCase()}
              </div>
              {items.map((s) => (
                <NavItem
                  key={s.key}
                  section={s}
                  active={s.key === activeKey}
                  onNavigate={() => setOpen(false)}
                />
              ))}
            </div>
          );
        })}
      </nav>

      {health ? <StatusFooter health={health} now={now} /> : <div role="status" style={{ padding: 12, color: 'var(--mut)' }}>Loading feed status…</div>}
    </aside>
  );
}

export { SECTIONS };
