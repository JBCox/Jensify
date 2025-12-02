/**
 * Time period intervals for trend analysis
 */
export type AnalyticsInterval = 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Expense trend data point
 */
export interface ExpenseTrendPoint {
  period_start: string;
  period_end: string;
  period_label: string;
  total_amount: number;
  expense_count: number;
  avg_expense: number;
  approved_amount: number;
  pending_amount: number;
  rejected_amount: number;
}

/**
 * Category breakdown data
 */
export interface CategoryBreakdown {
  category: string;
  total_amount: number;
  expense_count: number;
  percentage: number;
  avg_expense: number;
  max_expense: number;
  min_expense: number;
}

/**
 * Top spender data
 */
export interface TopSpender {
  user_id: string;
  user_name: string;
  user_email: string;
  department: string | null;
  total_amount: number;
  expense_count: number;
  avg_expense: number;
  approval_rate: number;
  policy_violation_count: number;
}

/**
 * Merchant analysis data
 */
export interface MerchantAnalysis {
  merchant: string;
  total_amount: number;
  expense_count: number;
  avg_expense: number;
  unique_users: number;
  most_common_category: string;
}

/**
 * Approval metric row
 */
export interface ApprovalMetric {
  metric_name: string;
  metric_value: number;
  metric_unit: 'count' | 'percent' | 'hours' | 'days';
}

/**
 * Budget vs actual data
 */
export interface BudgetVsActual {
  budget_name: string;
  budget_type: string;
  budget_amount: number;
  actual_spent: number;
  remaining: number;
  utilization_percent: number;
  status: 'on_track' | 'warning' | 'over_budget';
}

/**
 * Department comparison data
 */
export interface DepartmentComparison {
  department: string;
  total_amount: number;
  expense_count: number;
  employee_count: number;
  per_employee_avg: number;
  percentage_of_total: number;
}

/**
 * Year over year comparison data
 */
export interface YoyComparison {
  month_num: number;
  month_name: string;
  current_year_amount: number;
  previous_year_amount: number;
  change_amount: number;
  change_percent: number;
}

/**
 * Dashboard summary metric
 */
export interface AnalyticsSummaryMetric {
  metric_key: string;
  metric_value: number;
  previous_value: number;
  change_percent: number;
}

/**
 * Complete analytics dashboard data
 */
export interface AnalyticsDashboardData {
  summary: AnalyticsSummaryMetric[];
  trends: ExpenseTrendPoint[];
  categoryBreakdown: CategoryBreakdown[];
  topSpenders: TopSpender[];
  merchantAnalysis: MerchantAnalysis[];
  approvalMetrics: ApprovalMetric[];
  budgetVsActual: BudgetVsActual[];
  departmentComparison: DepartmentComparison[];
  yoyComparison?: YoyComparison[];
}

/**
 * Analytics date range filter
 */
export interface AnalyticsDateRange {
  start_date: string;
  end_date: string;
}

/**
 * Analytics filters
 */
export interface AnalyticsFilters extends AnalyticsDateRange {
  user_id?: string;
  department?: string;
  category?: string;
  interval?: AnalyticsInterval;
}

/**
 * Preset date ranges for analytics
 */
export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom';

/**
 * Date range preset configuration
 */
export interface DateRangePresetConfig {
  label: string;
  value: DateRangePreset;
  getRange: () => AnalyticsDateRange;
}

/**
 * Get date range for a preset
 */
export function getDateRangeForPreset(preset: DateRangePreset): AnalyticsDateRange {
  const today = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  switch (preset) {
    case 'today':
      return { start_date: formatDate(today), end_date: formatDate(today) };

    case 'yesterday': {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { start_date: formatDate(yesterday), end_date: formatDate(yesterday) };
    }

    case 'this_week': {
      const start = new Date(today);
      start.setDate(start.getDate() - start.getDay());
      return { start_date: formatDate(start), end_date: formatDate(today) };
    }

    case 'last_week': {
      const end = new Date(today);
      end.setDate(end.getDate() - end.getDay() - 1);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    }

    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start_date: formatDate(start), end_date: formatDate(today) };
    }

    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    }

    case 'this_quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      const start = new Date(today.getFullYear(), quarter * 3, 1);
      return { start_date: formatDate(start), end_date: formatDate(today) };
    }

    case 'last_quarter': {
      const quarter = Math.floor(today.getMonth() / 3) - 1;
      const year = quarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const adjustedQuarter = quarter < 0 ? 3 : quarter;
      const start = new Date(year, adjustedQuarter * 3, 1);
      const end = new Date(year, adjustedQuarter * 3 + 3, 0);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    }

    case 'this_year': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start_date: formatDate(start), end_date: formatDate(today) };
    }

    case 'last_year': {
      const start = new Date(today.getFullYear() - 1, 0, 1);
      const end = new Date(today.getFullYear() - 1, 11, 31);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    }

    case 'last_30_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { start_date: formatDate(start), end_date: formatDate(today) };
    }

    case 'last_90_days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 90);
      return { start_date: formatDate(start), end_date: formatDate(today) };
    }

    default:
      return { start_date: formatDate(today), end_date: formatDate(today) };
  }
}

/**
 * Date range presets for UI
 */
export const DATE_RANGE_PRESETS: { label: string; value: DateRangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'This Week', value: 'this_week' },
  { label: 'Last Week', value: 'last_week' },
  { label: 'This Month', value: 'this_month' },
  { label: 'Last Month', value: 'last_month' },
  { label: 'This Quarter', value: 'this_quarter' },
  { label: 'Last Quarter', value: 'last_quarter' },
  { label: 'This Year', value: 'this_year' },
  { label: 'Last Year', value: 'last_year' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Last 90 Days', value: 'last_90_days' },
  { label: 'Custom Range', value: 'custom' }
];

/**
 * Chart color palette
 */
export const ANALYTICS_COLORS = {
  primary: '#FF5900',
  secondary: '#1E293B',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  chart: [
    '#FF5900', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'
  ]
} as const;

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Format percentage for display
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format change indicator
 */
export function formatChange(change: number): { text: string; class: string; icon: string } {
  if (change > 0) {
    return { text: `+${change.toFixed(1)}%`, class: 'text-success', icon: 'trending_up' };
  } else if (change < 0) {
    return { text: `${change.toFixed(1)}%`, class: 'text-danger', icon: 'trending_down' };
  }
  return { text: '0%', class: 'text-muted', icon: 'trending_flat' };
}
