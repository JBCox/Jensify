import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError, forkJoin } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpenseTrendPoint,
  CategoryBreakdown,
  TopSpender,
  MerchantAnalysis,
  ApprovalMetric,
  BudgetVsActual,
  DepartmentComparison,
  YoyComparison,
  AnalyticsSummaryMetric,
  AnalyticsDashboardData,
  AnalyticsFilters,
  AnalyticsInterval,
  AnalyticsDateRange
} from '../models/analytics.model';

/**
 * Service for advanced analytics and reporting
 * Provides comprehensive expense analysis across multiple dimensions
 */
@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state for dashboard data
  private _dashboardData = signal<AnalyticsDashboardData | null>(null);
  private _isLoading = signal(false);

  dashboardData = this._dashboardData.asReadonly();
  isLoading = this._isLoading.asReadonly();

  // Computed summaries
  totalExpenses = computed(() => {
    const data = this._dashboardData();
    if (!data) return 0;
    const metric = data.summary.find(m => m.metric_key === 'total_expenses');
    return metric?.metric_value || 0;
  });

  expenseCount = computed(() => {
    const data = this._dashboardData();
    if (!data) return 0;
    const metric = data.summary.find(m => m.metric_key === 'expense_count');
    return metric?.metric_value || 0;
  });

  // =============================================================================
  // DASHBOARD DATA
  // =============================================================================

  /**
   * Load complete dashboard data
   */
  loadDashboardData(filters: AnalyticsFilters): Observable<AnalyticsDashboardData> {
    this._isLoading.set(true);

    return forkJoin({
      summary: this.getAnalyticsSummary(filters.start_date, filters.end_date),
      trends: this.getExpenseTrends(filters),
      categoryBreakdown: this.getCategoryBreakdown(filters),
      topSpenders: this.getTopSpenders(filters.start_date, filters.end_date),
      merchantAnalysis: this.getMerchantAnalysis(filters.start_date, filters.end_date),
      approvalMetrics: this.getApprovalMetrics(filters.start_date, filters.end_date),
      budgetVsActual: this.getBudgetVsActual(filters.start_date, filters.end_date),
      departmentComparison: this.getDepartmentComparison(filters.start_date, filters.end_date)
    }).pipe(
      tap(data => {
        this._dashboardData.set(data);
        this._isLoading.set(false);
      }),
      catchError(err => {
        this._isLoading.set(false);
        return throwError(() => err);
      })
    );
  }

  // =============================================================================
  // TRENDS
  // =============================================================================

  /**
   * Get expense trends over time
   */
  getExpenseTrends(filters: AnalyticsFilters): Observable<ExpenseTrendPoint[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_expense_trends', {
        p_organization_id: organizationId,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_interval: filters.interval || 'month',
        p_user_id: filters.user_id || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ExpenseTrendPoint[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // CATEGORY BREAKDOWN
  // =============================================================================

  /**
   * Get expense breakdown by category
   */
  getCategoryBreakdown(filters: AnalyticsFilters): Observable<CategoryBreakdown[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_category_breakdown', {
        p_organization_id: organizationId,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_user_id: filters.user_id || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as CategoryBreakdown[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // TOP SPENDERS
  // =============================================================================

  /**
   * Get top spenders in the organization
   */
  getTopSpenders(startDate: string, endDate: string, limit = 10): Observable<TopSpender[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_top_spenders', {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: limit
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TopSpender[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // MERCHANT ANALYSIS
  // =============================================================================

  /**
   * Get top merchants by spend
   */
  getMerchantAnalysis(startDate: string, endDate: string, limit = 20): Observable<MerchantAnalysis[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_merchant_analysis', {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_limit: limit
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as MerchantAnalysis[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // APPROVAL METRICS
  // =============================================================================

  /**
   * Get approval workflow metrics
   */
  getApprovalMetrics(startDate: string, endDate: string): Observable<ApprovalMetric[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_approval_metrics', {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ApprovalMetric[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // BUDGET VS ACTUAL
  // =============================================================================

  /**
   * Get budget vs actual spending comparison
   */
  getBudgetVsActual(startDate: string, endDate: string): Observable<BudgetVsActual[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_budget_vs_actual', {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as BudgetVsActual[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // DEPARTMENT COMPARISON
  // =============================================================================

  /**
   * Compare spending across departments
   */
  getDepartmentComparison(startDate: string, endDate: string): Observable<DepartmentComparison[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_department_comparison', {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as DepartmentComparison[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // YEAR OVER YEAR
  // =============================================================================

  /**
   * Get year over year comparison
   */
  getYoyComparison(year?: number): Observable<YoyComparison[]> {
    const organizationId = this.organizationService.currentOrganizationId;
    const currentYear = year || new Date().getFullYear();

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_yoy_comparison', {
        p_organization_id: organizationId,
        p_current_year: currentYear
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as YoyComparison[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // SUMMARY
  // =============================================================================

  /**
   * Get analytics summary for dashboard
   */
  getAnalyticsSummary(startDate: string, endDate: string): Observable<AnalyticsSummaryMetric[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_analytics_summary', {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        // Calculate change percentages
        const metrics = (data || []) as AnalyticsSummaryMetric[];
        return metrics.map(m => ({
          ...m,
          change_percent: m.previous_value > 0
            ? ((m.metric_value - m.previous_value) / m.previous_value * 100)
            : 0
        }));
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // EXPORT
  // =============================================================================

  /**
   * Export analytics data to CSV
   */
  exportToCsv(data: Record<string, unknown>[], filename: string): void {
    if (!data || data.length === 0) {
      this.logger.warn('No data to export', 'AnalyticsService');
      return;
    }

    // Get headers from first row
    const headers = Object.keys(data[0]);

    // Convert to CSV
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Escape quotes and wrap in quotes if contains comma
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.logger.info('Analytics data exported', 'AnalyticsService', { filename });
  }

  // =============================================================================
  // REFRESH MATERIALIZED VIEW
  // =============================================================================

  /**
   * Refresh the expense stats materialized view
   */
  refreshExpenseStats(): Observable<void> {
    return from(
      this.supabase.client.rpc('refresh_expense_stats')
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Expense stats refreshed', 'AnalyticsService');
      }),
      catchError(this.handleError)
    );
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('AnalyticsService error', error, 'AnalyticsService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
