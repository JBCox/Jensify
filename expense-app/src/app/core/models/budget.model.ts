/**
 * Budget type - defines the scope of the budget
 */
export type BudgetType = 'organization' | 'department' | 'category' | 'user';

/**
 * Budget period - defines the time frame for the budget
 */
export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom';

/**
 * Budget status based on spending
 */
export type BudgetStatus = 'under' | 'warning' | 'exceeded';

/**
 * Budget model matching the database schema
 * Represents a spending limit for an organization, department, category, or user
 */
export interface Budget {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Human-readable name for the budget */
  name: string;
  /** Scope of the budget */
  budget_type: BudgetType;

  /** Department name (for department budgets) */
  department?: string;
  /** Expense category (for category budgets) */
  category?: string;
  /** User ID (for user-specific budgets) */
  user_id?: string;

  /** Budget limit amount */
  amount: number;
  /** Budget period type */
  period: BudgetPeriod;
  /** Start date for the budget */
  start_date: string;
  /** End date for custom period budgets */
  end_date?: string;

  /** Percentage threshold for warning alerts (default 80) */
  alert_threshold_percent: number;
  /** Whether the budget is active */
  is_active: boolean;

  /** User who created the budget */
  created_by?: string;
  /** Timestamp when budget was created */
  created_at: string;
  /** Timestamp when budget was last updated */
  updated_at: string;
}

/**
 * Budget tracking model
 * Tracks actual spending against a budget for a specific period
 */
export interface BudgetTracking {
  /** UUID primary key */
  id: string;
  /** Budget ID */
  budget_id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Start of the tracking period */
  period_start: string;
  /** End of the tracking period */
  period_end: string;

  /** Total spent (approved + reimbursed expenses) */
  spent_amount: number;
  /** Total pending (submitted but not approved) */
  pending_amount: number;

  /** Timestamp when alert was sent (if any) */
  alert_sent_at?: string;
  /** Timestamp when budget was exceeded (if any) */
  exceeded_at?: string;

  /** Timestamp of last calculation */
  last_calculated_at: string;

  // Relations (populated by query)
  /** Budget object (populated) */
  budget?: Budget;
}

/**
 * Budget with tracking data and computed status
 * Used for display in UI
 */
export interface BudgetWithTracking extends Budget {
  /** Current period tracking data */
  tracking?: BudgetTracking;
  /** Percentage of budget used (0-100) */
  percent_used: number;
  /** Current status based on spending */
  status: BudgetStatus;
  /** Remaining amount (budget - spent - pending) */
  remaining_amount: number;
  /** Total used (spent + pending) */
  total_used: number;
}

/**
 * DTO for creating a new budget
 */
export interface CreateBudgetDto {
  /** Human-readable name */
  name: string;
  /** Budget scope type */
  budget_type: BudgetType;
  /** Department (for department budgets) */
  department?: string;
  /** Category (for category budgets) */
  category?: string;
  /** User ID (for user budgets) */
  user_id?: string;
  /** Budget limit amount */
  amount: number;
  /** Budget period */
  period: BudgetPeriod;
  /** Start date (ISO string) */
  start_date: string;
  /** End date for custom periods (ISO string) */
  end_date?: string;
  /** Alert threshold percentage (default 80) */
  alert_threshold_percent?: number;
}

/**
 * DTO for updating an existing budget
 */
export interface UpdateBudgetDto {
  /** Human-readable name */
  name?: string;
  /** Budget limit amount */
  amount?: number;
  /** Alert threshold percentage */
  alert_threshold_percent?: number;
  /** Whether budget is active */
  is_active?: boolean;
  /** End date (for extending custom periods) */
  end_date?: string;
}

/**
 * Result of checking an expense against budgets
 * Returned by check_expense_budgets database function
 */
export interface BudgetCheckResult {
  /** Budget ID */
  budget_id: string;
  /** Budget name */
  budget_name: string;
  /** Budget limit */
  budget_amount: number;
  /** Already spent amount */
  spent_amount: number;
  /** Pending (including new expense) */
  pending_amount: number;
  /** Remaining after new expense */
  remaining_amount: number;
  /** Percentage used (0-100) */
  percent_used: number;
  /** Status: under, warning, or exceeded */
  status: BudgetStatus;
  /** Human-readable message */
  message: string;
}

/**
 * Summary statistics for budgets
 * Used in dashboard widgets
 */
export interface BudgetSummary {
  /** Total number of active budgets */
  total_budgets: number;
  /** Budgets under the alert threshold */
  under_budget: number;
  /** Budgets at or above alert threshold but not exceeded */
  at_warning: number;
  /** Budgets that have been exceeded */
  exceeded: number;
}

/**
 * Filter options for budget queries
 */
export interface BudgetFilters {
  /** Filter by budget type */
  budget_type?: BudgetType;
  /** Filter by status */
  status?: BudgetStatus;
  /** Filter by department */
  department?: string;
  /** Filter by category */
  category?: string;
  /** Filter by user ID */
  user_id?: string;
  /** Include inactive budgets */
  include_inactive?: boolean;
}
