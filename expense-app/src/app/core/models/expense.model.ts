import { ExpenseStatus, ExpenseCategory } from './enums';
import { Receipt } from './receipt.model';
import { User } from './user.model';

/**
 * Expense line item for split expenses
 * Allows a single receipt to be categorized into multiple expense types
 * e.g., a hotel bill split into lodging + meals
 */
export interface ExpenseItem {
  /** UUID primary key */
  id: string;
  /** Parent expense ID */
  expense_id: string;
  /** Receipt ID (if item linked to specific receipt) */
  receipt_id?: string | null;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Description of this line item (e.g., "Room charge", "Room service meal") */
  description: string;
  /** Amount for this specific line item */
  amount: number;
  /** Category for this line item (may differ from parent expense) */
  category: ExpenseCategory | string;
  /** Order of items within the expense (1-based) */
  line_number: number;

  /** Timestamp when item was created */
  created_at: string;
  /** Timestamp when item was last updated */
  updated_at: string;

  // Relations (populated by query)
  /** Receipt object (populated) */
  receipt?: Receipt;
}

/**
 * DTO for creating a new expense item (for splitting)
 */
export interface CreateExpenseItemDto {
  description: string;
  amount: number;
  category: string;
  receipt_id?: string;
}

/**
 * DTO for splitting an expense into multiple items
 */
export interface SplitExpenseDto {
  expense_id: string;
  items: CreateExpenseItemDto[];
}

/**
 * Junction table record linking expenses to receipts
 * Supports multiple receipts per expense with ordering
 */
export interface ExpenseReceipt {
  /** UUID primary key */
  id: string;
  /** Expense ID */
  expense_id: string;
  /** Receipt ID */
  receipt_id: string;
  /** Display order (0 = first) */
  display_order: number;
  /** Primary receipt shown in lists */
  is_primary: boolean;
  /** Timestamp when link was created */
  created_at: string;
  /** Timestamp when link was last updated */
  updated_at: string;

  // Populated relations
  /** Receipt object (populated) */
  receipt?: Receipt;
}

/**
 * Expense model matching the database schema
 * Represents a single expense claim with receipt(s) and policy validation
 */
export interface Expense {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;
  /** User who created the expense */
  user_id: string;
  /** Report linkage (nullable: unreported) */
  report_id?: string | null;
  /** Convenience flag for UI */
  is_reported?: boolean;
  /** @deprecated Use expense_receipts array instead. Kept for backward compatibility */
  receipt_id?: string;

  // Expense details
  /** Merchant or vendor name */
  merchant: string;
  /** Expense amount (must be > 0) */
  amount: number;
  /** Currency code (default: USD) */
  currency: string;
  /** Expense category */
  category: ExpenseCategory | string;
  /** Date when expense occurred (ISO date string) */
  expense_date: string;
  /** Optional notes or description */
  notes?: string;

  // Status
  /** Current workflow status */
  status: ExpenseStatus;
  /** Whether expense is eligible for reimbursement */
  is_reimbursable: boolean;
  /** Timestamp when expense was submitted */
  submitted_at?: string;
  /** Timestamp when expense was marked as reimbursed */
  reimbursed_at?: string;
  /** User ID who processed reimbursement */
  reimbursed_by?: string;

  // Policy
  /** Policy violations detected by database trigger */
  policy_violations: PolicyViolation[];

  // Audit
  /** Timestamp when expense was created */
  created_at: string;
  /** Timestamp when expense was last updated */
  updated_at: string;

  // Split expense support
  /** True if expense has been split into multiple line items */
  is_split?: boolean;

  // Multi-currency support
  /** Original currency code before conversion */
  original_currency?: string;
  /** Original amount in original currency */
  original_amount?: number;
  /** Exchange rate used for conversion */
  exchange_rate?: number;
  /** Timestamp when currency was converted */
  converted_at?: string;

  // Duplicate detection
  /** ID of the original expense if this is a confirmed duplicate */
  duplicate_of?: string | null;
  /** Duplicate status: potential, confirmed, or dismissed */
  duplicate_status?: 'potential' | 'confirmed' | 'dismissed' | null;
  /** When duplicate check was last performed */
  duplicate_checked_at?: string | null;

  // Relations (populated by query)
  /** User object (populated) */
  user?: User;
  /** @deprecated Use expense_receipts array instead. Kept for backward compatibility */
  receipt?: Receipt;
  /** Multiple receipts linked via junction table */
  expense_receipts?: ExpenseReceipt[];
  /** Line items for split expenses */
  expense_items?: ExpenseItem[];
}

/**
 * Policy violation detected by database trigger
 * Violations are warnings, not blocking (soft enforcement)
 */
export interface PolicyViolation {
  /** Policy rule identifier (e.g., 'max_single_receipt', 'max_daily_total') */
  rule: string;
  /** Policy limit value */
  limit?: number;
  /** Actual value that violated the policy */
  actual?: number;
  /** Human-readable violation message */
  message: string;
}

/**
 * Expense with guaranteed user relationship populated
 * Used when user data is always needed (e.g., finance dashboard)
 */
export interface ExpenseWithUser extends Expense {
  user: User;
}

/**
 * DTO for creating a new expense
 * Used by expense creation forms
 */
export interface CreateExpenseDto {
  organization_id: string;
  merchant: string;
  amount: number;
  category: string;
  expense_date: string;
  notes?: string;
  receipt_id?: string;
  /** Currency for the expense (defaults to organization's base currency) */
  original_currency?: string;
  /** Original amount in the specified currency */
  original_amount?: number;
}

/**
 * DTO for updating an existing expense
 * All fields are optional for partial updates
 */
export interface UpdateExpenseDto {
  merchant?: string;
  amount?: number;
  category?: string;
  expense_date?: string;
  notes?: string;
  receipt_id?: string | null;
  status?: ExpenseStatus;
  submitted_at?: string;
}

/**
 * Filter options for expense queries
 * Used by expense list and finance dashboard
 */
export interface ExpenseFilters {
  /** Filter by status (single value or array) */
  status?: ExpenseStatus | ExpenseStatus[];
  /** Filter by user ID */
  user_id?: string;
  /** Filter by date range (from) */
  date_from?: string;
  /** Filter by date range (to) */
  date_to?: string;
  /** Filter by category */
  category?: string;
  /** Filter by merchant name (partial match) */
  merchant?: string;
  /** Filter by minimum amount */
  min_amount?: number;
  /** Filter by maximum amount */
  max_amount?: number;
}

/**
 * Sort options for expense queries
 * Determines column and direction for ordering results
 */
export interface ExpenseSortOptions {
  /** Field to sort by */
  field: 'expense_date' | 'amount' | 'created_at' | 'merchant';
  /** Sort direction */
  direction: 'asc' | 'desc';
}
