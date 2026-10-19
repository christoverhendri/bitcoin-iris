import { LiveOnly } from '@/components/primitives';
import { getMacroCountry } from '@/lib/features/macroCountry';
import { COUNTRY_CODES, DEFAULT_COUNTRY, COUNTRIES } from '@/lib/nav';
import { MacroMetrics } from '@/components/features/macro/MacroMetrics';
import { getMacroCalendar } from '@/lib/features/macroCalendar';
import { MacroCalendar } from '@/components/features/macro/MacroCalendar';

export const revalidate = 30;

function resolveCountry(raw: string | undefined): string {
  return raw && (COUNTRY_CODES as readonly string[]).includes(raw) ? raw : DEFAULT_COUNTRY;
}

export default async function MacroDataPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country: rawCountry } = await searchParams;
  const country = resolveCountry(rawCountry);
  const label = COUNTRIES.find((c) => c.code === country)?.display ?? country;

  const [macro, calendar] = await Promise.all([getMacroCountry({ countries: [country] }), getMacroCalendar({})]);

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <LiveOnly env={macro} title="DATA EKONOMI AS">
        <MacroMetrics macro={macro} country={country} countryLabel={label} />
      </LiveOnly>
      <LiveOnly env={calendar} title="JADWAL MAKRO AS">
        <MacroCalendar cal={calendar} />
      </LiveOnly>
    </div>
  );
}
