/**
 * Vendor business type
 */
export type VendorBusinessType = 'individual' | 'company' | 'government' | 'nonprofit' | 'other';

/**
 * Vendor status
 */
export type VendorStatus = 'active' | 'inactive' | 'blocked';

/**
 * Preferred payment method
 */
export type PaymentMethod = 'check' | 'ach' | 'wire' | 'card' | 'other';

/**
 * Vendor document type
 */
export type VendorDocumentType = 'w9' | 'contract' | 'insurance' | 'license' | 'other';

/**
 * Vendor record
 */
export interface Vendor {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Vendor name */
  name: string;
  /** Normalized display name */
  display_name?: string | null;
  /** Description */
  description?: string | null;

  /** Contact info */
  email?: string | null;
  phone?: string | null;
  website?: string | null;

  /** Address */
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string;

  /** Business info */
  tax_id?: string | null;
  business_type?: VendorBusinessType | null;

  /** Categorization */
  default_category?: string | null;
  tags?: string[] | null;

  /** Payment info */
  payment_terms?: string | null;
  preferred_payment_method?: PaymentMethod | null;

  /** Status */
  status: VendorStatus;
  is_preferred: boolean;
  is_w9_on_file: boolean;

  /** Notes */
  notes?: string | null;

  /** Audit */
  created_at: string;
  updated_at: string;
  created_by?: string | null;

  // Populated relations
  aliases?: VendorAlias[];
  contacts?: VendorContact[];
  documents?: VendorDocument[];
}

/**
 * Vendor alias for merchant name matching
 */
export interface VendorAlias {
  id: string;
  vendor_id: string;
  alias: string;
  created_at: string;
}

/**
 * Vendor contact person
 */
export interface VendorContact {
  id: string;
  vendor_id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary: boolean;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Vendor document (W-9, contracts, etc.)
 */
export interface VendorDocument {
  id: string;
  vendor_id: string;
  name: string;
  document_type: VendorDocumentType;
  file_path: string;
  file_size?: number | null;
  mime_type?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  uploaded_at: string;
  uploaded_by?: string | null;
}

/**
 * Vendor spending summary (from view)
 */
export interface VendorSpendingSummary {
  vendor_id: string;
  organization_id: string;
  vendor_name: string;
  display_name?: string | null;
  default_category?: string | null;
  status: VendorStatus;
  is_preferred: boolean;
  expense_count: number;
  total_spent: number;
  avg_expense: number;
  last_expense_date?: string | null;
  first_expense_date?: string | null;
  unique_users: number;
}

/**
 * Vendor statistics result
 */
export interface VendorStats {
  vendor_id: string;
  vendor_name: string;
  expense_count: number;
  total_spent: number;
  avg_expense: number;
  last_expense_date?: string | null;
  unique_users: number;
  top_category?: string | null;
}

/**
 * Vendor needing W-9 (1099 reporting)
 */
export interface VendorNeedingW9 {
  vendor_id: string;
  vendor_name: string;
  total_paid: number;
  has_w9: boolean;
}

/**
 * DTO for creating a vendor
 */
export interface CreateVendorDto {
  name: string;
  display_name?: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  tax_id?: string;
  business_type?: VendorBusinessType;
  default_category?: string;
  tags?: string[];
  payment_terms?: string;
  preferred_payment_method?: PaymentMethod;
  is_preferred?: boolean;
  notes?: string;
}

/**
 * DTO for updating a vendor
 */
export interface UpdateVendorDto {
  id: string;
  name?: string;
  display_name?: string;
  description?: string;
  email?: string;
  phone?: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  tax_id?: string;
  business_type?: VendorBusinessType;
  default_category?: string;
  tags?: string[];
  payment_terms?: string;
  preferred_payment_method?: PaymentMethod;
  status?: VendorStatus;
  is_preferred?: boolean;
  is_w9_on_file?: boolean;
  notes?: string;
}

/**
 * DTO for creating a vendor contact
 */
export interface CreateVendorContactDto {
  vendor_id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  is_primary?: boolean;
  notes?: string;
}

/**
 * DTO for creating a vendor alias
 */
export interface CreateVendorAliasDto {
  vendor_id: string;
  alias: string;
}

/**
 * Vendor filters
 */
export interface VendorFilters {
  status?: VendorStatus;
  is_preferred?: boolean;
  business_type?: VendorBusinessType;
  search?: string;
  tags?: string[];
}

/**
 * Status display configuration
 */
export const VENDOR_STATUS_CONFIG: Record<VendorStatus, { label: string; color: string; icon: string }> = {
  active: { label: 'Active', color: 'success', icon: 'check_circle' },
  inactive: { label: 'Inactive', color: 'default', icon: 'pause_circle' },
  blocked: { label: 'Blocked', color: 'warn', icon: 'block' }
};

/**
 * Business type display configuration
 */
export const BUSINESS_TYPE_CONFIG: Record<VendorBusinessType, { label: string; description: string }> = {
  individual: { label: 'Individual', description: 'Sole proprietor or freelancer' },
  company: { label: 'Company', description: 'Corporation or LLC' },
  government: { label: 'Government', description: 'Government agency' },
  nonprofit: { label: 'Nonprofit', description: 'Tax-exempt organization' },
  other: { label: 'Other', description: 'Other entity type' }
};

/**
 * Payment method display configuration
 */
export const PAYMENT_METHOD_CONFIG: Record<PaymentMethod, { label: string; icon: string }> = {
  check: { label: 'Check', icon: 'money' },
  ach: { label: 'ACH Transfer', icon: 'account_balance' },
  wire: { label: 'Wire Transfer', icon: 'send' },
  card: { label: 'Credit Card', icon: 'credit_card' },
  other: { label: 'Other', icon: 'more_horiz' }
};

/**
 * Document type display configuration
 */
export const DOCUMENT_TYPE_CONFIG: Record<VendorDocumentType, { label: string; icon: string }> = {
  w9: { label: 'W-9 Form', icon: 'description' },
  contract: { label: 'Contract', icon: 'handshake' },
  insurance: { label: 'Insurance Certificate', icon: 'security' },
  license: { label: 'Business License', icon: 'badge' },
  other: { label: 'Other Document', icon: 'attach_file' }
};

/**
 * IRS 1099 reporting threshold
 */
export const IRS_1099_THRESHOLD = 600;
