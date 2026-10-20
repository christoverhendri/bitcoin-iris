import type { Metadata, Viewport } from 'next';
import { Inter_Tight } from 'next/font/google';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import './globals.css';

/** One typeface for the whole terminal, with tabular figures for the numbers. */
const ember = Inter_Tight({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ember',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'IRIS BTC Intelligence Terminal',
  description: 'BTC signal, evidence and forecast terminal. Informational only — not financial advice.',
};

export const viewport: Viewport = {
  themeColor: '#0b0806',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={ember.variable}>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
