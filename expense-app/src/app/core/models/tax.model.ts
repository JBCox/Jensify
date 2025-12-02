/**
 * Tax type enum
 * Different types of taxes across jurisdictions
 */
export type TaxType = 'sales_tax' | 'vat' | 'gst' | 'hst' | 'pst' | 'other' | 'exempt' | 'zero_rated';

/**
 * Tax rate record
 * Location-based tax rates by jurisdiction
 */
export interface TaxRate {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Display name (e.g., "Texas Sales Tax", "UK VAT Standard") */
  name: string;
  /** Country code (ISO 3166-1 alpha-2) */
  country_code: string;
  /** State/province code (optional) */
  state_province?: string | null;

  /** Type of tax */
  tax_type: TaxType;
  /** Tax rate as decimal (e.g., 0.0825 for 8.25%) */
  rate: number;
  /** Whether business can claim back (VAT/GST) */
  is_recoverable: boolean;
  /** Applied on top of other taxes */
  is_compound: boolean;

  /** Effective start date */
  effective_from: string;
  /** Effective end date (null = current) */
  effective_until?: string | null;

  /** Whether rate is active */
  is_active: boolean;

  /** Audit fields */
  created_at: string;
  updated_at: string;
}

/**
 * Tax category for expense categorization
 */
export interface TaxCategory {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Category name (e.g., "Standard Rate", "Exempt") */
  name: string;
  /** Short code for reporting */
  code: string;
  /** Description */
  description?: string;

  /** Whether this category is taxable */
  is_taxable: boolean;
  /** Default tax rate ID */
  default_rate_id?: string | null;

  /** EU VAT code if applicable */
  vat_code?: string | null;

  /** Whether category is active */
  is_active: boolean;

  /** Audit fields */
  created_at: string;
  updated_at: string;

  // Populated relations
  default_rate?: TaxRate;
}

/**
 * Tax details on an expense
 */
export interface ExpenseTaxDetails {
  /** Tax amount */
  tax_amount: number;
  /** Tax rate used */
  tax_rate?: number;
  /** Type of tax */
  tax_type?: TaxType;
  /** Tax jurisdiction (e.g., "TX", "UK") */
  tax_jurisdiction?: string;
  /** Whether tax can be recovered */
  is_tax_recoverable: boolean;
  /** Net amount (before tax) */
  net_amount?: number;
  /** Tax category ID */
  tax_category_id?: string;
}

/**
 * DTO for creating a tax rate
 */
export interface CreateTaxRateDto {
  name: string;
  country_code: string;
  state_province?: string;
  tax_type: TaxType;
  rate: number;
  is_recoverable?: boolean;
  is_compound?: boolean;
  effective_from?: string;
  effective_until?: string | null;
}

/**
 * DTO for updating a tax rate
 */
export interface UpdateTaxRateDto {
  id: string;
  name?: string;
  rate?: number;
  is_recoverable?: boolean;
  is_compound?: boolean;
  effective_until?: string | null;
  is_active?: boolean;
}

/**
 * DTO for creating a tax category
 */
export interface CreateTaxCategoryDto {
  name: string;
  code: string;
  description?: string;
  is_taxable?: boolean;
  default_rate_id?: string;
  vat_code?: string;
}

/**
 * DTO for updating a tax category
 */
export interface UpdateTaxCategoryDto {
  id: string;
  name?: string;
  code?: string;
  description?: string;
  is_taxable?: boolean;
  default_rate_id?: string | null;
  vat_code?: string;
  is_active?: boolean;
}

/**
 * Tax report row from get_tax_report function
 */
export interface TaxReportRow {
  group_key: string;
  total_gross: number;
  total_net: number;
  total_tax: number;
  recoverable_tax: number;
  non_recoverable_tax: number;
  expense_count: number;
}

/**
 * Tax report grouping options
 */
export type TaxReportGroupBy = 'tax_type' | 'jurisdiction' | 'category' | 'user';

/**
 * Tax report filters
 */
export interface TaxReportFilters {
  start_date: string;
  end_date: string;
  group_by?: TaxReportGroupBy;
}

/**
 * Tax lookup result from get_applicable_tax_rate function
 */
export interface TaxLookupResult {
  rate_id: string;
  rate: number;
  is_recoverable: boolean;
  tax_name: string;
}

/**
 * Tax summary for dashboard
 */
export interface TaxSummary {
  total_tax_paid: number;
  total_recoverable: number;
  total_non_recoverable: number;
  by_type: { [key: string]: number };
}

/**
 * Tax type display configuration
 */
export const TAX_TYPE_CONFIG: Record<TaxType, { label: string; description: string }> = {
  sales_tax: { label: 'Sales Tax', description: 'US/Canada sales tax (not recoverable)' },
  vat: { label: 'VAT', description: 'Value Added Tax (recoverable for businesses)' },
  gst: { label: 'GST', description: 'Goods & Services Tax (recoverable)' },
  hst: { label: 'HST', description: 'Harmonized Sales Tax (Canada)' },
  pst: { label: 'PST', description: 'Provincial Sales Tax (Canada)' },
  other: { label: 'Other', description: 'Other tax types' },
  exempt: { label: 'Exempt', description: 'Tax exempt purchase' },
  zero_rated: { label: 'Zero Rated', description: 'Zero-rated (0% but reportable)' }
};

/**
 * Common country codes for tax jurisdictions
 */
export const COMMON_TAX_COUNTRIES = [
  { code: 'US', name: 'United States', default_tax: 'sales_tax' },
  { code: 'CA', name: 'Canada', default_tax: 'gst' },
  { code: 'GB', name: 'United Kingdom', default_tax: 'vat' },
  { code: 'DE', name: 'Germany', default_tax: 'vat' },
  { code: 'FR', name: 'France', default_tax: 'vat' },
  { code: 'NL', name: 'Netherlands', default_tax: 'vat' },
  { code: 'AU', name: 'Australia', default_tax: 'gst' },
  { code: 'JP', name: 'Japan', default_tax: 'vat' },
  { code: 'SG', name: 'Singapore', default_tax: 'gst' }
] as const;

/**
 * US state sales tax rates (examples)
 */
export const US_STATE_TAX_RATES: Record<string, number> = {
  TX: 0.0625,
  CA: 0.0725,
  NY: 0.0400,
  FL: 0.0600,
  WA: 0.0650,
  AZ: 0.0560,
  CO: 0.0290,
  IL: 0.0625,
  PA: 0.0600,
  OH: 0.0575
};

/**
 * Format tax rate as percentage string
 */
export function formatTaxRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Calculate tax amount from net amount
 */
export function calculateTaxFromNet(netAmount: number, taxRate: number): number {
  return Math.round(netAmount * taxRate * 100) / 100;
}

/**
 * Calculate net amount from gross amount
 */
export function calculateNetFromGross(grossAmount: number, taxRate: number): number {
  return Math.round((grossAmount / (1 + taxRate)) * 100) / 100;
}

/**
 * Extract tax amount from gross amount
 */
export function extractTaxFromGross(grossAmount: number, taxRate: number): number {
  const net = calculateNetFromGross(grossAmount, taxRate);
  return Math.round((grossAmount - net) * 100) / 100;
}
