import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import {
  Budget,
  BudgetTracking,
  BudgetWithTracking,
  BudgetCheckResult,
  BudgetSummary,
  BudgetFilters,
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetStatus
} from '../models/budget.model';

/**
 * Service for managing budgets and budget tracking
 * Handles CRUD operations, budget checking, and summary statistics
 * All operations are scoped to the current organization
 */
@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);

  // =============================================
  // CRUD OPERATIONS
  // =============================================

  /**
   * Get all budgets for the current organization
   * @param filters Optional filters
   * @param includeTracking Whether to include tracking data (default true)
   */
  getBudgets(filters?: BudgetFilters, includeTracking = true): Observable<BudgetWithTracking[]> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    let query = this.supabase.client
      .from('budgets')
      .select(includeTracking ? '*, budget_tracking(*)' : '*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters) {
      if (!filters.include_inactive) {
        query = query.eq('is_active', true);
      }
      if (filters.budget_type) {
        query = query.eq('budget_type', filters.budget_type);
      }
      if (filters.department) {
        query = query.eq('department', filters.department);
      }
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return ((data || []) as unknown as (Budget & { budget_tracking?: BudgetTracking[] })[]).map(budget => this.enrichBudgetWithStatus(budget));
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single budget by ID
   */
  getBudgetById(id: string): Observable<BudgetWithTracking> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('budgets')
        .select('*, budget_tracking(*)')
        .eq('id', id)
        .eq('organization_id', organizationId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Budget not found');
        return this.enrichBudgetWithStatus(data);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new budget
   */
  createBudget(dto: CreateBudgetDto): Observable<Budget> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('budgets')
        .insert({
          organization_id: organizationId,
          name: dto.name,
          budget_type: dto.budget_type,
          department: dto.department || null,
          category: dto.category || null,
          user_id: dto.user_id || null,
          amount: dto.amount,
          period: dto.period,
          start_date: dto.start_date,
          end_date: dto.end_date || null,
          alert_threshold_percent: dto.alert_threshold_percent || 80,
          is_active: true,
          created_by: userId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Failed to create budget');
        this.notificationService.showSuccess('Budget created successfully');
        return data as Budget;
      }),
      catchError((error) => {
        this.logger.error('Failed to create budget', error, 'BudgetService');
        this.notificationService.showError(error.message || 'Failed to create budget');
        return throwError(() => error);
      })
    );
  }

  /**
   * Update an existing budget
   */
  updateBudget(id: string, dto: UpdateBudgetDto): Observable<Budget> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('budgets')
        .update({
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.alert_threshold_percent !== undefined && { alert_threshold_percent: dto.alert_threshold_percent }),
          ...(dto.is_active !== undefined && { is_active: dto.is_active }),
          ...(dto.end_date !== undefined && { end_date: dto.end_date })
        })
        .eq('id', id)
        .eq('organization_id', organizationId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Budget not found');
        this.notificationService.showSuccess('Budget updated successfully');
        return data as Budget;
      }),
      catchError((error) => {
        this.logger.error('Failed to update budget', error, 'BudgetService');
        this.notificationService.showError(error.message || 'Failed to update budget');
        return throwError(() => error);
      })
    );
  }

  /**
   * Delete a budget (sets is_active to false)
   */
  deleteBudget(id: string): Observable<void> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('budgets')
        .update({ is_active: false })
        .eq('id', id)
        .eq('organization_id', organizationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.notificationService.showSuccess('Budget deleted successfully');
      }),
      catchError((error) => {
        this.logger.error('Failed to delete budget', error, 'BudgetService');
        this.notificationService.showError(error.message || 'Failed to delete budget');
        return throwError(() => error);
      })
    );
  }

  // =============================================
  // BUDGET CHECKING
  // =============================================

  /**
   * Check an expense against all applicable budgets
   * Call this before creating/submitting an expense to show warnings
   */
  checkExpenseAgainstBudgets(expense: {
    amount: number;
    category: string;
    expense_date: string;
  }): Observable<BudgetCheckResult[]> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('check_expense_budgets', {
        p_organization_id: organizationId,
        p_user_id: userId,
        p_category: expense.category,
        p_amount: expense.amount,
        p_expense_date: expense.expense_date
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as BudgetCheckResult[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get budget warnings for display
   * Filters to only warning and exceeded statuses
   */
  getBudgetWarnings(expense: {
    amount: number;
    category: string;
    expense_date: string;
  }): Observable<BudgetCheckResult[]> {
    return this.checkExpenseAgainstBudgets(expense).pipe(
      map(results => results.filter(r => r.status === 'warning' || r.status === 'exceeded'))
    );
  }

  // =============================================
  // SUMMARY & STATISTICS
  // =============================================

  /**
   * Get budget summary statistics for dashboards
   */
  getBudgetSummary(): Observable<BudgetSummary> {
    return this.getBudgets({ include_inactive: false }).pipe(
      map(budgets => {
        const summary: BudgetSummary = {
          total_budgets: budgets.length,
          under_budget: 0,
          at_warning: 0,
          exceeded: 0
        };

        budgets.forEach(budget => {
          switch (budget.status) {
            case 'under':
              summary.under_budget++;
              break;
            case 'warning':
              summary.at_warning++;
              break;
            case 'exceeded':
              summary.exceeded++;
              break;
          }
        });

        return summary;
      })
    );
  }

  /**
   * Get budgets that are at warning or exceeded status
   * Used for dashboard alerts
   */
  getBudgetsNeedingAttention(limit = 5): Observable<BudgetWithTracking[]> {
    return this.getBudgets({ include_inactive: false }).pipe(
      map(budgets =>
        budgets
          .filter(b => b.status === 'warning' || b.status === 'exceeded')
          .sort((a, b) => b.percent_used - a.percent_used)
          .slice(0, limit)
      )
    );
  }

  /**
   * Get budgets relevant to a specific user
   * Includes org-wide, department, and user-specific budgets
   */
  getMyBudgets(): Observable<BudgetWithTracking[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return this.getBudgets({ include_inactive: false }).pipe(
      map(budgets =>
        budgets.filter(b =>
          b.budget_type === 'organization' ||
          b.budget_type === 'department' || // TODO: Filter by user's department
          (b.budget_type === 'user' && b.user_id === userId)
        )
      )
    );
  }

  // =============================================
  // HELPER METHODS
  // =============================================

  /**
   * Enrich a budget with calculated status and percentages
   */
  private enrichBudgetWithStatus(budget: Budget & { budget_tracking?: BudgetTracking[] }): BudgetWithTracking {
    // Find the current period tracking record
    const now = new Date();
    const tracking = budget.budget_tracking?.find(t => {
      const start = new Date(t.period_start);
      const end = new Date(t.period_end);
      return now >= start && now <= end;
    });

    const spentAmount = tracking?.spent_amount || 0;
    const pendingAmount = tracking?.pending_amount || 0;
    const totalUsed = spentAmount + pendingAmount;
    const remainingAmount = budget.amount - totalUsed;
    const percentUsed = Math.min(100, Math.max(0, Math.round((totalUsed / budget.amount) * 100)));

    let status: BudgetStatus = 'under';
    if (totalUsed > budget.amount) {
      status = 'exceeded';
    } else if (percentUsed >= budget.alert_threshold_percent) {
      status = 'warning';
    }

    return {
      ...budget,
      tracking: tracking ? { ...tracking, budget: undefined } : undefined,
      percent_used: percentUsed,
      status,
      remaining_amount: remainingAmount,
      total_used: totalUsed
    };
  }

  /**
   * Handle errors consistently
   */
  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('BudgetService error', error, 'BudgetService');
    const errorMessage = this.logger.getErrorMessage(error, 'An unexpected error occurred');
    return throwError(() => new Error(errorMessage));
  };

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Get display label for budget type
   */
  getBudgetTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      organization: 'Organization-wide',
      department: 'Department',
      category: 'Category',
      user: 'Individual'
    };
    return labels[type] || type;
  }

  /**
   * Get display label for budget period
   */
  getBudgetPeriodLabel(period: string): string {
    const labels: Record<string, string> = {
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
      custom: 'Custom Period'
    };
    return labels[period] || period;
  }
}
