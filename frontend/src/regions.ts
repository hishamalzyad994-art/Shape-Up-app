// Country → currency mapping shared between subscribe UI and profile settings.
// The actual pricing lives on the backend; this is only for display in the picker.

export type CountryOpt = {
  code: string;     // ISO 3166-1 alpha-2
  name: string;
  flag: string;
  currency: string; // 3-letter code (display)
  symbol: string;
};

const EUR = (code: string, name: string, flag: string): CountryOpt => ({ code, name, flag, currency: 'EUR', symbol: '€' });

export const COUNTRY_OPTIONS: CountryOpt[] = [
  // Major
  { code: 'US', name: 'United States',     flag: '🇺🇸', currency: 'USD', symbol: '$'    },
  { code: 'GB', name: 'United Kingdom',    flag: '🇬🇧', currency: 'GBP', symbol: '£'    },
  { code: 'CA', name: 'Canada',            flag: '🇨🇦', currency: 'CAD', symbol: 'CA$'  },
  { code: 'AU', name: 'Australia',         flag: '🇦🇺', currency: 'AUD', symbol: 'A$'   },
  { code: 'NZ', name: 'New Zealand',       flag: '🇳🇿', currency: 'NZD', symbol: 'NZ$'  },
  { code: 'CH', name: 'Switzerland',       flag: '🇨🇭', currency: 'CHF', symbol: 'CHF'  },
  // Eurozone (all use EUR / €)
  EUR('DE', 'Germany',     '🇩🇪'),
  EUR('FR', 'France',      '🇫🇷'),
  EUR('IT', 'Italy',       '🇮🇹'),
  EUR('ES', 'Spain',       '🇪🇸'),
  EUR('NL', 'Netherlands', '🇳🇱'),
  EUR('PT', 'Portugal',    '🇵🇹'),
  EUR('IE', 'Ireland',     '🇮🇪'),
  EUR('BE', 'Belgium',     '🇧🇪'),
  EUR('AT', 'Austria',     '🇦🇹'),
  EUR('FI', 'Finland',     '🇫🇮'),
  EUR('GR', 'Greece',      '🇬🇷'),
  // Middle East
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', currency: 'AED', symbol: 'AED' },
  { code: 'SA', name: 'Saudi Arabia',         flag: '🇸🇦', currency: 'SAR', symbol: 'SAR' },
  { code: 'QA', name: 'Qatar',                flag: '🇶🇦', currency: 'QAR', symbol: 'QR'  },
  { code: 'KW', name: 'Kuwait',               flag: '🇰🇼', currency: 'KWD', symbol: 'KD'  },
  { code: 'EG', name: 'Egypt',                flag: '🇪🇬', currency: 'EGP', symbol: 'EGP' },
  // Asia
  { code: 'IN', name: 'India',         flag: '🇮🇳', currency: 'INR', symbol: '₹'   },
  { code: 'JP', name: 'Japan',         flag: '🇯🇵', currency: 'JPY', symbol: '¥'   },
  { code: 'KR', name: 'South Korea',   flag: '🇰🇷', currency: 'KRW', symbol: '₩'   },
  { code: 'SG', name: 'Singapore',     flag: '🇸🇬', currency: 'SGD', symbol: 'S$'  },
  { code: 'HK', name: 'Hong Kong',     flag: '🇭🇰', currency: 'HKD', symbol: 'HK$' },
  { code: 'PH', name: 'Philippines',   flag: '🇵🇭', currency: 'PHP', symbol: '₱'   },
  { code: 'ID', name: 'Indonesia',     flag: '🇮🇩', currency: 'IDR', symbol: 'Rp'  },
  // Latam / Africa
  { code: 'BR', name: 'Brazil',        flag: '🇧🇷', currency: 'BRL', symbol: 'R$'  },
  { code: 'MX', name: 'Mexico',        flag: '🇲🇽', currency: 'MXN', symbol: 'MX$' },
  { code: 'ZA', name: 'South Africa',  flag: '🇿🇦', currency: 'ZAR', symbol: 'R'   },
  { code: 'NG', name: 'Nigeria',       flag: '🇳🇬', currency: 'NGN', symbol: '₦'   },
  { code: 'TR', name: 'Türkiye',       flag: '🇹🇷', currency: 'TRY', symbol: '₺'   },
];

export function currencyForCountry(code: string | null | undefined): { currency: string; symbol: string } {
  if (!code) return { currency: 'USD', symbol: '$' };
  const c = COUNTRY_OPTIONS.find(o => o.code === code.toUpperCase());
  return c ? { currency: c.currency, symbol: c.symbol } : { currency: 'USD', symbol: '$' };
}
