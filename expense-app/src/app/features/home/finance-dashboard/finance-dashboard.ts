import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, map } from 'rxjs';
import { ExpenseService } from '../../../core/services/expense.service';
import { ExpenseWithUser } from '../../../core/models/expense.model';
import { ExpenseStatus } from '../../../core/models/enums';
import { MetricCard } from '../../../shared/components/metric-card/metric-card';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';

interface FinanceMetrics {
  pendingApprovals: number;
  reimbursementsDue: number;
  monthToDateSpend: number;
  flaggedExpenses: number;
}

@Component({
  selector: 'app-finance-dashboard',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MetricCard,
    StatusBadge,
    EmptyState
  ],
  templateUrl: './finance-dashboard.html',
  styleUrl: './finance-dashboard.scss',

  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanceDashboard implements OnInit {
  private expenseService = inject(ExpenseService);
  private router = inject(Router);

  metrics$!: Observable<FinanceMetrics>;
  pendingApprovals$!: Observable<ExpenseWithUser[]>;
  recentActivity$!: Observable<ExpenseWithUser[]>;
  loading = true;

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get all expenses (finance can see all)
    const allExpenses$ = this.expenseService.queryExpenses();

    // Calculate metrics
    this.metrics$ = allExpenses$.pipe(
      map(expenses => {
        const monthExpenses = expenses.filter(e => e.created_at >= startOfMonth);
        const flaggedExpenses = expenses.filter(e => 
          e.policy_violations && e.policy_violations.length > 0
        );

        return {
          pendingApprovals: expenses.filter(e => e.status === ExpenseStatus.SUBMITTED).length,
          reimbursementsDue: expenses.filter(e => e.status === ExpenseStatus.APPROVED).length,
          monthToDateSpend: monthExpenses.reduce((sum, e) => sum + e.amount, 0),
          flaggedExpenses: flaggedExpenses.length
        };
      })
    );

    // Get pending approvals (top 10)
    this.pendingApprovals$ = allExpenses$.pipe(
      map(expenses => {
        const pending = expenses.filter(e => e.status === ExpenseStatus.SUBMITTED);
        return pending.slice(0, 10) as ExpenseWithUser[];
      })
    );

    // Get recent activity (approvals and reimbursements)
    this.recentActivity$ = allExpenses$.pipe(
      map(expenses => {
        const recent = expenses.filter(e => 
          e.status === ExpenseStatus.APPROVED || 
          e.status === ExpenseStatus.REIMBURSED
        );
        return recent.slice(0, 5) as ExpenseWithUser[];
      })
    );

    this.loading = false;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  mapStatus(status: string): BadgeStatus {
    return status as BadgeStatus;
  }

  onApprove(expense: ExpenseWithUser, event: Event): void {
    event.stopPropagation();
    // TODO: Implement approve logic in Phase 4
  }

  onReject(expense: ExpenseWithUser, event: Event): void {
    event.stopPropagation();
    // TODO: Implement reject logic in Phase 4
  }

  onViewExpense(expense: ExpenseWithUser): void {
    this.router.navigate(['/expenses', expense.id]);
  }

  onViewApprovals(): void {
    this.router.navigate(['/approvals']);
  }

  getUserName(expense: ExpenseWithUser): string {
    return expense.user?.full_name || expense.user?.email || 'Unknown';
  }

  /**
   * TrackBy function for expense lists - improves ngFor performance
   */
  trackByExpenseId(_index: number, expense: ExpenseWithUser): string {
    return expense.id;
  }
}
