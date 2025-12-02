/**
 * Supported currency with ISO 4217 code
 */
export interface SupportedCurrency {
  /** ISO 4217 currency code (e.g., 'USD', 'EUR') */
  code: string;
  /** Full currency name */
  name: string;
  /** Currency symbol (e.g., '$', '€', '£') */
  symbol: string;
  /** Number of decimal places */
  decimal_places: number;
  /** Whether the currency is active */
  is_active: boolean;
  /** Timestamp when added */
  created_at: string;
}

/**
 * Exchange rate between two currencies
 */
export interface ExchangeRate {
  /** UUID primary key */
  id: string;
  /** Source currency code */
  from_currency: string;
  /** Target currency code */
  to_currency: string;
  /** Exchange rate (1 from = rate to) */
  rate: number;
  /** Rate source: 'api', 'manual', 'fixed', 'seed' */
  source: 'api' | 'manual' | 'fixed' | 'seed';
  /** Date the rate applies to */
  rate_date: string;
  /** Created timestamp */
  created_at: string;
  /** Updated timestamp */
  updated_at: string;
}

/**
 * Currency conversion request
 */
export interface CurrencyConversionRequest {
  /** Amount to convert */
  amount: number;
  /** Source currency code */
  from_currency: string;
  /** Target currency code */
  to_currency: string;
  /** Optional date for historical rate */
  date?: string;
}

/**
 * Currency conversion result
 */
export interface CurrencyConversionResult {
  /** Original amount */
  original_amount: number;
  /** Original currency */
  original_currency: string;
  /** Converted amount */
  converted_amount: number;
  /** Target currency */
  target_currency: string;
  /** Exchange rate used */
  exchange_rate: number;
  /** Date of the rate */
  rate_date: string;
}

/**
 * Organization currency settings
 */
export interface OrganizationCurrencySettings {
  /** Base/home currency for the organization */
  base_currency: string;
  /** List of supported currency codes */
  supported_currencies: string[];
  /** Whether to auto-convert to base currency */
  auto_convert_currency: boolean;
}

/**
 * Currency summary for organization (from get_currency_summary)
 */
export interface CurrencySummary {
  /** Currency code */
  currency: string;
  /** Currency name */
  currency_name: string;
  /** Currency symbol */
  currency_symbol: string;
  /** Number of expenses in this currency */
  expense_count: number;
  /** Total in original currency */
  total_original_amount: number;
  /** Total converted to base currency */
  total_converted_amount: number;
}

/**
 * Expense with currency details (from expenses_with_currency view)
 */
export interface ExpenseWithCurrency {
  /** Original currency name */
  original_currency_name: string;
  /** Original currency symbol */
  original_currency_symbol: string;
  /** Organization's base currency code */
  base_currency: string;
  /** Base currency symbol */
  base_currency_symbol: string;
  /** Whether expense is in foreign currency */
  is_foreign_currency: boolean;
}

/**
 * DTO for creating/updating exchange rate
 */
export interface CreateExchangeRateDto {
  from_currency: string;
  to_currency: string;
  rate: number;
  source?: 'manual' | 'api' | 'fixed';
  rate_date?: string;
}

/**
 * Common currencies for quick selection
 */
export const COMMON_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$' },
] as const;

/**
 * Format amount with currency symbol
 */
export function formatCurrencyAmount(
  amount: number,
  currency: SupportedCurrency | string,
  locale = 'en-US'
): string {
  const currencyCode = typeof currency === 'string' ? currency : currency.code;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  } catch {
    // Fallback if currency code not supported by Intl
    const symbol = typeof currency === 'string' ? currencyCode : currency.symbol;
    return `${symbol}${amount.toFixed(2)}`;
  }
}
