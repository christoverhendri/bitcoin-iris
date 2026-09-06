import { getMacroCountry } from '@/lib/features/macroCountry';
import { COUNTRY_CODES, DEFAULT_COUNTRY, COUNTRIES } from '@/lib/nav';
import { RegimeQuadrant } from '@/components/features/macro/RegimeQuadrant';

export const revalidate = 30;

function resolveCountry(raw: string | undefined): string {
  return raw && (COUNTRY_CODES as readonly string[]).includes(raw) ? raw : DEFAULT_COUNTRY;
}

export default async function MacroRegimePage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country: rawCountry } = await searchParams;
  const country = resolveCountry(rawCountry);
  const label = COUNTRIES.find((c) => c.code === country)?.display ?? country;

  const macro = await getMacroCountry({ countries: [country] });

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <RegimeQuadrant macro={macro} country={country} countryLabel={label} />
    </div>
  );
}
