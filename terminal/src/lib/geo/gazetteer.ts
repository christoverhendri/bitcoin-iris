/**
 * Place-name gazetteer: a plain data table plus one lookup function.
 *
 * `geocode(text)` scans a headline for the longest place name it can find and
 * returns a coordinate for it. No dependencies, no network — this is the whole
 * geo-resolution layer behind the Global Events map.
 *
 * Match rules:
 *  - whole-word, case-insensitive for names longer than 3 chars
 *  - short all-caps aliases ("US", "EU", "UK", "UAE") match case-sensitively
 *    against the original text, so ordinary lowercase "us" / "eu" never hit
 *  - longest matched name wins; on a tie a country beats a city
 */

type Kind = 'country' | 'city';

interface GazEntry {
  kind: Kind;
  canonical: string;
  names: string[];
  lat: number;
  lon: number;
  iso2: string;
}

// [iso2, canonical, lat, lon, "alias|alias|..."]
type Row = [string, string, number, number, string];

const COUNTRY_ROWS: Row[] = [
  ['US', 'United States', 38.8951, -77.0364, 'USA|U.S.|U.S.A.|United States of America|America|Washington|Washington DC'],
  ['GB', 'United Kingdom', 51.5074, -0.1278, 'UK|U.K.|Britain|Great Britain|England|Scotland|Wales'],
  ['EU', 'European Union', 50.8503, 4.3517, 'EU|E.U.|Europe|Eurozone|Euro Zone|Euro area|European Commission'],
  ['DE', 'Germany', 52.52, 13.405, 'German|Berlin|Bundesbank'],
  ['FR', 'France', 48.8566, 2.3522, 'French|Paris'],
  ['IT', 'Italy', 41.9028, 12.4964, 'Italian|Rome'],
  ['ES', 'Spain', 40.4168, -3.7038, 'Spanish|Madrid'],
  ['PT', 'Portugal', 38.7223, -9.1393, 'Portuguese|Lisbon'],
  ['NL', 'Netherlands', 52.3676, 4.9041, 'Dutch|Holland|Amsterdam'],
  ['BE', 'Belgium', 50.8503, 4.3517, 'Belgian'],
  ['CH', 'Switzerland', 46.948, 7.4474, 'Swiss|Bern|FINMA'],
  ['AT', 'Austria', 48.2082, 16.3738, 'Austrian|Vienna'],
  ['IE', 'Ireland', 53.3498, -6.2603, 'Irish|Dublin'],
  ['SE', 'Sweden', 59.3293, 18.0686, 'Swedish|Stockholm'],
  ['NO', 'Norway', 59.9139, 10.7522, 'Norwegian|Oslo'],
  ['DK', 'Denmark', 55.6761, 12.5683, 'Danish|Copenhagen'],
  ['FI', 'Finland', 60.1699, 24.9384, 'Finnish|Helsinki'],
  ['IS', 'Iceland', 64.1466, -21.9426, 'Icelandic|Reykjavik'],
  ['PL', 'Poland', 52.2297, 21.0122, 'Polish|Warsaw'],
  ['CZ', 'Czech Republic', 50.0755, 14.4378, 'Czechia|Prague'],
  ['SK', 'Slovakia', 48.1486, 17.1077, 'Slovak|Bratislava'],
  ['HU', 'Hungary', 47.4979, 19.0402, 'Hungarian|Budapest'],
  ['RO', 'Romania', 44.4268, 26.1025, 'Romanian|Bucharest'],
  ['BG', 'Bulgaria', 42.6977, 23.3219, 'Bulgarian|Sofia'],
  ['GR', 'Greece', 37.9838, 23.7275, 'Greek|Athens'],
  ['HR', 'Croatia', 45.815, 15.9819, 'Croatian|Zagreb'],
  ['RS', 'Serbia', 44.7866, 20.4489, 'Serbian|Belgrade'],
  ['SI', 'Slovenia', 46.0569, 14.5058, 'Slovenian|Ljubljana'],
  ['UA', 'Ukraine', 50.4501, 30.5234, 'Ukrainian|Kyiv|Kiev'],
  ['RU', 'Russia', 55.7558, 37.6173, 'Russian|Moscow|Kremlin'],
  ['BY', 'Belarus', 53.9006, 27.559, 'Belarusian|Minsk'],
  ['TR', 'Turkey', 39.9334, 32.8597, 'Turkish|Turkiye|Ankara|Istanbul'],
  ['EE', 'Estonia', 59.437, 24.7536, 'Estonian|Tallinn'],
  ['LV', 'Latvia', 56.9496, 24.1052, 'Latvian|Riga'],
  ['LT', 'Lithuania', 54.6872, 25.2797, 'Lithuanian|Vilnius'],
  ['LU', 'Luxembourg', 49.6116, 6.1319, ''],
  ['MT', 'Malta', 35.8989, 14.5146, 'Maltese|Valletta'],
  ['CY', 'Cyprus', 35.1856, 33.3823, 'Nicosia'],
  ['CA', 'Canada', 45.4215, -75.6972, 'Canadian|Ottawa'],
  ['MX', 'Mexico', 19.4326, -99.1332, 'Mexican|Mexico City'],
  ['BR', 'Brazil', -15.7939, -47.8828, 'Brazilian|Brasilia|Brasil'],
  ['AR', 'Argentina', -34.6037, -58.3816, 'Argentine|Argentinian|Buenos Aires'],
  ['CL', 'Chile', -33.4489, -70.6693, 'Chilean|Santiago'],
  ['CO', 'Colombia', 4.711, -74.0721, 'Colombian|Bogota'],
  ['PE', 'Peru', -12.0464, -77.0428, 'Peruvian|Lima'],
  ['VE', 'Venezuela', 10.4806, -66.9036, 'Venezuelan|Caracas'],
  ['EC', 'Ecuador', -0.1807, -78.4678, 'Ecuadorian|Quito'],
  ['BO', 'Bolivia', -16.4897, -68.1193, 'Bolivian|La Paz'],
  ['PY', 'Paraguay', -25.2637, -57.5759, 'Paraguayan|Asuncion'],
  ['UY', 'Uruguay', -34.9011, -56.1645, 'Uruguayan|Montevideo'],
  ['SV', 'El Salvador', 13.6929, -89.2182, 'Salvadoran|San Salvador'],
  ['GT', 'Guatemala', 14.6349, -90.5069, 'Guatemalan'],
  ['HN', 'Honduras', 14.0723, -87.1921, 'Honduran|Tegucigalpa'],
  ['NI', 'Nicaragua', 12.1149, -86.2362, 'Managua'],
  ['CR', 'Costa Rica', 9.9281, -84.0907, 'Costa Rican|San Jose'],
  ['PA', 'Panama', 8.9824, -79.5199, 'Panamanian'],
  ['CU', 'Cuba', 23.1136, -82.3666, 'Cuban|Havana'],
  ['DO', 'Dominican Republic', 18.4861, -69.9312, 'Santo Domingo'],
  ['JM', 'Jamaica', 18.0179, -76.8099, 'Jamaican|Kingston'],
  ['CN', 'China', 39.9042, 116.4074, 'Chinese|Beijing|Peking|PBOC|Shanghai'],
  ['JP', 'Japan', 35.6762, 139.6503, 'Japanese|Tokyo'],
  ['KR', 'South Korea', 37.5665, 126.978, 'Korea|Korean|Seoul|Republic of Korea'],
  ['KP', 'North Korea', 39.0392, 125.7625, 'Pyongyang|DPRK'],
  ['IN', 'India', 28.6139, 77.209, 'Indian|New Delhi|Delhi|Mumbai|RBI'],
  ['PK', 'Pakistan', 33.6844, 73.0479, 'Pakistani|Islamabad'],
  ['BD', 'Bangladesh', 23.8103, 90.4125, 'Bangladeshi|Dhaka'],
  ['LK', 'Sri Lanka', 6.9271, 79.8612, 'Colombo'],
  ['NP', 'Nepal', 27.7172, 85.324, 'Nepalese|Kathmandu'],
  ['ID', 'Indonesia', -6.2088, 106.8456, 'Indonesian|Jakarta'],
  ['MY', 'Malaysia', 3.139, 101.6869, 'Malaysian|Kuala Lumpur'],
  ['SG', 'Singapore', 1.3521, 103.8198, 'Singaporean|MAS'],
  ['TH', 'Thailand', 13.7563, 100.5018, 'Thai|Bangkok'],
  ['VN', 'Vietnam', 21.0278, 105.8342, 'Vietnamese|Hanoi'],
  ['PH', 'Philippines', 14.5995, 120.9842, 'Filipino|Philippine|Manila'],
  ['MM', 'Myanmar', 16.8409, 96.1735, 'Burma|Yangon'],
  ['KH', 'Cambodia', 11.5564, 104.9282, 'Cambodian|Phnom Penh'],
  ['LA', 'Laos', 17.9757, 102.6331, 'Vientiane'],
  ['TW', 'Taiwan', 25.033, 121.5654, 'Taiwanese|Taipei'],
  ['HK', 'Hong Kong', 22.3193, 114.1694, 'Hongkong|HKMA'],
  ['MO', 'Macau', 22.1987, 113.5439, 'Macao'],
  ['MN', 'Mongolia', 47.8864, 106.9057, 'Ulaanbaatar'],
  ['KZ', 'Kazakhstan', 51.1605, 71.4704, 'Kazakh|Astana|Almaty'],
  ['UZ', 'Uzbekistan', 41.2995, 69.2401, 'Tashkent'],
  ['AZ', 'Azerbaijan', 40.4093, 49.8671, 'Baku'],
  ['GE', 'Georgia', 41.7151, 44.8271, 'Tbilisi'],
  ['AM', 'Armenia', 40.1792, 44.4991, 'Yerevan'],
  ['AE', 'United Arab Emirates', 24.4539, 54.3773, 'UAE|U.A.E.|Emirates|Abu Dhabi|Dubai'],
  ['SA', 'Saudi Arabia', 24.7136, 46.6753, 'Saudi|Riyadh'],
  ['QA', 'Qatar', 25.2854, 51.531, 'Qatari|Doha'],
  ['KW', 'Kuwait', 29.3759, 47.9774, 'Kuwaiti'],
  ['BH', 'Bahrain', 26.2285, 50.586, 'Manama'],
  ['OM', 'Oman', 23.588, 58.3829, 'Muscat'],
  ['IL', 'Israel', 31.7683, 35.2137, 'Israeli|Jerusalem|Tel Aviv'],
  ['PS', 'Palestine', 31.9522, 35.2332, 'Palestinian|Gaza|West Bank'],
  ['JO', 'Jordan', 31.9454, 35.9284, 'Jordanian|Amman'],
  ['LB', 'Lebanon', 33.8938, 35.5018, 'Lebanese|Beirut'],
  ['SY', 'Syria', 33.5138, 36.2765, 'Syrian|Damascus'],
  ['IQ', 'Iraq', 33.3152, 44.3661, 'Iraqi|Baghdad'],
  ['IR', 'Iran', 35.6892, 51.389, 'Iranian|Tehran|Teh ran'],
  ['YE', 'Yemen', 15.3694, 44.191, 'Yemeni|Sanaa'],
  ['AF', 'Afghanistan', 34.5553, 69.2075, 'Afghan|Kabul'],
  ['EG', 'Egypt', 30.0444, 31.2357, 'Egyptian|Cairo'],
  ['ZA', 'South Africa', -25.7479, 28.2293, 'South African|Pretoria|Johannesburg|Cape Town'],
  ['NG', 'Nigeria', 9.0765, 7.3986, 'Nigerian|Abuja|Lagos'],
  ['KE', 'Kenya', -1.2921, 36.8219, 'Kenyan|Nairobi'],
  ['GH', 'Ghana', 5.6037, -0.187, 'Ghanaian|Accra'],
  ['ET', 'Ethiopia', 9.145, 40.4897, 'Ethiopian|Addis Ababa'],
  ['TZ', 'Tanzania', -6.7924, 39.2083, 'Tanzanian|Dodoma'],
  ['UG', 'Uganda', 0.3476, 32.5825, 'Ugandan|Kampala'],
  ['MA', 'Morocco', 34.0209, -6.8416, 'Moroccan|Rabat'],
  ['DZ', 'Algeria', 36.7538, 3.0588, 'Algerian|Algiers'],
  ['TN', 'Tunisia', 36.8065, 10.1815, 'Tunisian|Tunis'],
  ['LY', 'Libya', 32.8872, 13.1913, 'Libyan|Tripoli'],
  ['SD', 'Sudan', 15.5007, 32.5599, 'Sudanese|Khartoum'],
  ['SN', 'Senegal', 14.7167, -17.4677, 'Senegalese|Dakar'],
  ['CI', "Cote d'Ivoire", 5.3599, -4.0083, 'Ivory Coast|Abidjan'],
  ['CM', 'Cameroon', 3.848, 11.5021, 'Cameroonian|Yaounde'],
  ['CD', 'DR Congo', -4.4419, 15.2663, 'Democratic Republic of the Congo|Congo-Kinshasa|Kinshasa'],
  ['AO', 'Angola', -8.839, 13.2894, 'Angolan|Luanda'],
  ['ZM', 'Zambia', -15.3875, 28.3228, 'Zambian|Lusaka'],
  ['ZW', 'Zimbabwe', -17.8252, 31.0335, 'Zimbabwean|Harare'],
  ['MZ', 'Mozambique', -25.9692, 32.5732, 'Maputo'],
  ['RW', 'Rwanda', -1.9441, 30.0619, 'Rwandan|Kigali'],
  ['AU', 'Australia', -35.2809, 149.13, 'Australian|Canberra|Sydney|Melbourne'],
  ['NZ', 'New Zealand', -41.2865, 174.7762, 'Kiwi|Wellington|Auckland'],
  ['FJ', 'Fiji', -18.1416, 178.4419, 'Suva'],
  ['PG', 'Papua New Guinea', -9.4438, 147.1803, 'Port Moresby'],
];

const CITY_ROWS: Row[] = [
  ['US', 'New York', 40.7128, -74.006, 'NYC|Wall Street|Manhattan'],
  ['US', 'San Francisco', 37.7749, -122.4194, 'SF|Silicon Valley'],
  ['US', 'Chicago', 41.8781, -87.6298, 'CME'],
  ['US', 'Miami', 25.7617, -80.1918, ''],
  ['US', 'Los Angeles', 34.0522, -118.2437, 'LA'],
  ['US', 'Boston', 42.3601, -71.0589, ''],
  ['US', 'Seattle', 47.6062, -122.3321, ''],
  ['US', 'Austin', 30.2672, -97.7431, ''],
  ['DE', 'Frankfurt', 50.1109, 8.6821, ''],
  ['DE', 'Munich', 48.1351, 11.582, ''],
  ['CH', 'Zurich', 47.3769, 8.5417, ''],
  ['CH', 'Geneva', 46.2044, 6.1432, ''],
  ['CH', 'Zug', 47.1662, 8.5155, 'Crypto Valley'],
  ['CH', 'Lugano', 46.0037, 8.9511, ''],
  ['GB', 'London', 51.5074, -0.1278, 'City of London|Canary Wharf'],
  ['FR', 'Paris', 48.8566, 2.3522, ''],
  ['BE', 'Brussels', 50.8503, 4.3517, ''],
  ['NL', 'Amsterdam', 52.3676, 4.9041, ''],
  ['IE', 'Dublin', 53.3498, -6.2603, ''],
  ['LU', 'Luxembourg City', 49.6116, 6.1319, ''],
  ['ES', 'Madrid', 40.4168, -3.7038, ''],
  ['PT', 'Lisbon', 38.7223, -9.1393, ''],
  ['IT', 'Milan', 45.4642, 9.19, ''],
  ['JP', 'Tokyo', 35.6762, 139.6503, ''],
  ['CN', 'Beijing', 39.9042, 116.4074, ''],
  ['CN', 'Shanghai', 31.2304, 121.4737, ''],
  ['CN', 'Shenzhen', 22.5431, 114.0579, ''],
  ['HK', 'Hong Kong City', 22.3193, 114.1694, ''],
  ['SG', 'Singapore City', 1.3521, 103.8198, ''],
  ['KR', 'Seoul', 37.5665, 126.978, ''],
  ['IN', 'Mumbai', 19.076, 72.8777, 'Bombay'],
  ['IN', 'Bengaluru', 12.9716, 77.5946, 'Bangalore'],
  ['AE', 'Dubai', 25.2048, 55.2708, ''],
  ['AE', 'Abu Dhabi', 24.4539, 54.3773, 'ADGM'],
  ['CA', 'Toronto', 43.6532, -79.3832, ''],
  ['CA', 'Vancouver', 49.2827, -123.1207, ''],
  ['BR', 'Sao Paulo', -23.5558, -46.6396, 'São Paulo'],
  ['AU', 'Sydney', -33.8688, 151.2093, ''],
  ['AU', 'Melbourne', -37.8136, 144.9631, ''],
  ['SV', 'San Salvador', 13.6929, -89.2182, ''],
  ['NG', 'Lagos', 6.5244, 3.3792, ''],
  ['ZA', 'Johannesburg', -26.2041, 28.0473, ''],
  ['TR', 'Istanbul', 41.0082, 28.9784, ''],
  ['RU', 'Moscow', 55.7558, 37.6173, ''],
  ['AR', 'Buenos Aires', -34.6037, -58.3816, ''],
];

function buildEntry(kind: Kind, [iso2, canonical, lat, lon, aliases]: Row): GazEntry {
  const names = [canonical, iso2, ...(aliases ? aliases.split('|') : [])]
    .map((n) => n.trim())
    .filter(Boolean);
  return { kind, canonical, names, lat, lon, iso2 };
}

const ENTRIES: GazEntry[] = [
  ...COUNTRY_ROWS.map((r) => buildEntry('country', r)),
  ...CITY_ROWS.map((r) => buildEntry('city', r)),
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word test with a non-alphanumeric boundary (handles spaces + accents). */
function hasWord(haystack: string, needle: string, caseSensitive: boolean): boolean {
  const re = new RegExp(
    `(?:^|[^A-Za-z0-9])${escapeRe(needle)}(?:$|[^A-Za-z0-9])`,
    caseSensitive ? '' : 'i',
  );
  return re.test(haystack);
}

export interface GeoHit {
  lat: number;
  lon: number;
  iso2: string;
  name: string;
}

/**
 * Longest place name mentioned in `text` wins; a country outranks a city on a
 * tie. Returns `null` when nothing matches.
 */
export function geocode(text: string): GeoHit | null {
  if (!text) return null;
  const lower = text.toLowerCase();

  let best: GazEntry | null = null;
  let bestLen = 0;
  let bestIsCountry = false;

  for (const entry of ENTRIES) {
    for (const name of entry.names) {
      const short = name.length <= 3 && name === name.toUpperCase();
      const matched = short
        ? hasWord(text, name, true)
        : hasWord(lower, name.toLowerCase(), false);
      if (!matched) continue;

      const len = name.length;
      const isCountry = entry.kind === 'country';
      if (len > bestLen || (len === bestLen && isCountry && !bestIsCountry)) {
        best = entry;
        bestLen = len;
        bestIsCountry = isCountry;
      }
    }
  }

  if (!best) return null;
  return { lat: best.lat, lon: best.lon, iso2: best.iso2, name: best.canonical };
}
