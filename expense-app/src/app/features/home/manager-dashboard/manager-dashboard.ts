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

interface ManagerMetrics {
  teamPendingApprovals: number;
  teamMonthSpend: number;
  myPendingExpenses: number;
  teamMemberCount: number;
}

@Component({
  selector: 'app-manager-dashboard',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MetricCard,
    StatusBadge,
    EmptyState
  ],
  templateUrl: './manager-dashboard.html',
  styleUrl: './manager-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerDashboard implements OnInit {
  private expenseService = inject(ExpenseService);
  private router = inject(Router);

  metrics$!: Observable<ManagerMetrics>;
  teamPendingApprovals$!: Observable<ExpenseWithUser[]>;
  myRecentExpenses$!: Observable<ExpenseWithUser[]>;
  loading = true;

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get team expenses (manager can approve team expenses)
    const teamExpenses$ = this.expenseService.queryExpenses();
    
    // Get my own expenses
    const myExpenses$ = this.expenseService.getMyExpenses();

    // Calculate metrics
    this.metrics$ = teamExpenses$.pipe(
      map(expenses => {
        const monthExpenses = expenses.filter(e => e.created_at >= startOfMonth);
        const uniqueUsers = new Set(expenses.map(e => e.user_id)).size;

        return {
          teamPendingApprovals: expenses.filter(e => e.status === ExpenseStatus.SUBMITTED).length,
          teamMonthSpend: monthExpenses.reduce((sum, e) => sum + e.amount, 0),
          myPendingExpenses: 0, // Will be updated from myExpenses$
          teamMemberCount: uniqueUsers
        };
      })
    );

    // Get team pending approvals (top 8)
    this.teamPendingApprovals$ = teamExpenses$.pipe(
      map(expenses => {
        const pending = expenses.filter(e => e.status === ExpenseStatus.SUBMITTED);
        return pending.slice(0, 8) as ExpenseWithUser[];
      })
    );

    // Get my recent expenses (top 3)
    this.myRecentExpenses$ = myExpenses$.pipe(
      map(expenses => expenses.slice(0, 3) as ExpenseWithUser[])
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
    // TODO: Implement approve logic
  }

  onReject(expense: ExpenseWithUser, event: Event): void {
    event.stopPropagation();
    // TODO: Implement reject logic
  }

  onViewExpense(expense: ExpenseWithUser): void {
    this.router.navigate(['/expenses', expense.id]);
  }

  onViewApprovals(): void {
    this.router.navigate(['/approvals']);
  }

  onViewMyExpenses(): void {
    this.router.navigate(['/expenses']);
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
