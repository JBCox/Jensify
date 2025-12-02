/**
 * Plaid item status
 */
export type PlaidItemStatus = 'active' | 'needs_reauth' | 'disconnected' | 'error';

/**
 * Imported transaction status
 */
export type ImportedTransactionStatus = 'new' | 'matched' | 'converted' | 'ignored' | 'duplicate';

/**
 * Account type from Plaid
 */
export type PlaidAccountType = 'credit' | 'depository' | 'loan' | 'investment' | 'other';

/**
 * Plaid item (linked institution)
 */
export interface PlaidItem {
  id: string;
  organization_id: string;
  user_id: string;

  /** Plaid item identifier */
  plaid_item_id: string;
  /** Encrypted access token */
  plaid_access_token: string;

  /** Institution ID */
  institution_id?: string | null;
  /** Institution name (e.g., "Chase", "Bank of America") */
  institution_name?: string | null;

  /** Connection status */
  status: PlaidItemStatus;
  /** Error code if status is error */
  error_code?: string | null;
  /** Error message */
  error_message?: string | null;

  /** Last sync timestamp */
  last_sync_at?: string | null;
  /** Next scheduled sync */
  next_sync_at?: string | null;
  /** Sync cursor for incremental sync */
  sync_cursor?: string | null;

  /** When consent expires */
  consent_expires_at?: string | null;

  created_at: string;
  updated_at: string;

  // Populated relations
  accounts?: LinkedAccount[];
}

/**
 * Linked bank/credit account
 */
export interface LinkedAccount {
  id: string;
  plaid_item_id: string;
  organization_id: string;
  user_id: string;

  /** Plaid account identifier */
  plaid_account_id: string;

  /** Account name (e.g., "Checking", "Visa Signature") */
  account_name: string;
  /** Last 4 digits */
  account_mask?: string | null;
  /** Account type */
  account_type?: PlaidAccountType | null;
  /** Account subtype (e.g., "credit card", "checking") */
  account_subtype?: string | null;

  /** Whether to import transactions from this account */
  is_enabled: boolean;
  /** Auto-create expense from transactions */
  auto_create_expense: boolean;
  /** Default category for imported transactions */
  default_category?: string | null;

  /** Current balance */
  current_balance?: number | null;
  /** Available balance */
  available_balance?: number | null;
  /** Credit limit (for credit cards) */
  credit_limit?: number | null;
  /** Currency code */
  currency_code?: string;

  created_at: string;
  updated_at: string;

  // Populated relations
  plaid_item?: PlaidItem;
}

/**
 * Imported transaction from Plaid
 */
export interface ImportedTransaction {
  id: string;
  linked_account_id: string;
  organization_id: string;
  user_id: string;

  /** Plaid transaction ID */
  plaid_transaction_id: string;
  /** Pending transaction ID (if applicable) */
  plaid_pending_transaction_id?: string | null;

  /** Merchant name */
  merchant_name?: string | null;
  /** Full transaction description */
  transaction_name: string;
  /** Transaction amount (positive = expense) */
  amount: number;
  /** Currency code */
  currency_code?: string;
  /** Transaction date */
  transaction_date: string;
  /** Authorization date */
  authorized_date?: string | null;
  /** Posted date */
  posted_date?: string | null;

  /** Plaid categories */
  plaid_category?: string[] | null;
  /** Plaid category ID */
  plaid_category_id?: string | null;
  /** Personal finance category from Plaid */
  plaid_personal_finance_category?: Record<string, unknown> | null;

  /** Merchant location */
  merchant_address?: string | null;
  merchant_city?: string | null;
  merchant_region?: string | null;
  merchant_postal_code?: string | null;
  merchant_country?: string | null;
  merchant_lat?: number | null;
  merchant_lon?: number | null;

  /** Whether transaction is pending */
  is_pending: boolean;
  /** Processing status */
  status: ImportedTransactionStatus;

  /** Matched to existing expense */
  matched_expense_id?: string | null;
  /** Created new expense */
  created_expense_id?: string | null;

  /** Needs manual review */
  needs_review: boolean;
  /** Review notes */
  review_notes?: string | null;

  /** Raw Plaid data */
  raw_data?: Record<string, unknown> | null;

  imported_at: string;
  processed_at?: string | null;

  // Populated relations
  linked_account?: LinkedAccount;
}

/**
 * Transaction rule for auto-categorization
 */
export interface TransactionRule {
  id: string;
  organization_id: string;

  /** Rule name */
  name: string;
  /** Description */
  description?: string | null;

  /** Match if merchant name contains any of these */
  match_merchant_contains?: string[] | null;
  /** Match if merchant name exactly equals any of these */
  match_merchant_exact?: string[] | null;
  /** Match if Plaid category matches any of these */
  match_category?: string[] | null;
  /** Match if amount >= this */
  match_amount_min?: number | null;
  /** Match if amount <= this */
  match_amount_max?: number | null;

  /** Set this category */
  set_category?: string | null;
  /** Set reimbursable status */
  set_is_reimbursable?: boolean | null;
  /** Auto-create expense */
  auto_create_expense: boolean;
  /** Mark as ignored */
  mark_as_ignored: boolean;

  /** Priority (lower = higher priority) */
  priority: number;

  /** Whether rule is active */
  is_active: boolean;

  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

/**
 * Import statistics
 */
export interface ImportStats {
  total_transactions: number;
  new_count: number;
  matched_count: number;
  converted_count: number;
  ignored_count: number;
  total_amount: number;
  converted_amount: number;
}

/**
 * DTO for creating a transaction rule
 */
export interface CreateTransactionRuleDto {
  name: string;
  description?: string;
  match_merchant_contains?: string[];
  match_merchant_exact?: string[];
  match_category?: string[];
  match_amount_min?: number;
  match_amount_max?: number;
  set_category?: string;
  set_is_reimbursable?: boolean;
  auto_create_expense?: boolean;
  mark_as_ignored?: boolean;
  priority?: number;
}

/**
 * DTO for updating a transaction rule
 */
export interface UpdateTransactionRuleDto {
  id: string;
  name?: string;
  description?: string;
  match_merchant_contains?: string[];
  match_merchant_exact?: string[];
  match_category?: string[];
  match_amount_min?: number;
  match_amount_max?: number;
  set_category?: string;
  set_is_reimbursable?: boolean;
  auto_create_expense?: boolean;
  mark_as_ignored?: boolean;
  priority?: number;
  is_active?: boolean;
}

/**
 * DTO for converting transaction to expense
 */
export interface ConvertTransactionDto {
  transaction_id: string;
  category?: string;
  notes?: string;
}

/**
 * Plaid link token response
 */
export interface PlaidLinkToken {
  link_token: string;
  expiration: string;
}

/**
 * Plaid item status display configuration
 */
export const PLAID_ITEM_STATUS_CONFIG: Record<PlaidItemStatus, { label: string; color: string; icon: string }> = {
  active: { label: 'Connected', color: 'success', icon: 'link' },
  needs_reauth: { label: 'Needs Reconnection', color: 'warn', icon: 'link_off' },
  disconnected: { label: 'Disconnected', color: 'default', icon: 'link_off' },
  error: { label: 'Error', color: 'warn', icon: 'error' }
};

/**
 * Transaction status display configuration
 */
export const TRANSACTION_STATUS_CONFIG: Record<ImportedTransactionStatus, { label: string; color: string; icon: string }> = {
  new: { label: 'New', color: 'primary', icon: 'new_releases' },
  matched: { label: 'Matched', color: 'accent', icon: 'check_circle' },
  converted: { label: 'Converted', color: 'success', icon: 'swap_horiz' },
  ignored: { label: 'Ignored', color: 'default', icon: 'visibility_off' },
  duplicate: { label: 'Duplicate', color: 'warn', icon: 'content_copy' }
};

/**
 * Account type display configuration
 */
export const ACCOUNT_TYPE_CONFIG: Record<PlaidAccountType, { label: string; icon: string }> = {
  credit: { label: 'Credit Card', icon: 'credit_card' },
  depository: { label: 'Bank Account', icon: 'account_balance' },
  loan: { label: 'Loan', icon: 'money' },
  investment: { label: 'Investment', icon: 'trending_up' },
  other: { label: 'Other', icon: 'account_balance_wallet' }
};
