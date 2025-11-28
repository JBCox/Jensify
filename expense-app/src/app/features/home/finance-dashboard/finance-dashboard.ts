import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, map } from 'rxjs';
import { NgxChartsModule, Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { ExpenseService } from '../../../core/services/expense.service';
import { ExpenseWithUser } from '../../../core/models/expense.model';
import { ExpenseStatus } from '../../../core/models/enums';
import { ChangeType } from '../../../shared/components/metric-card/metric-card';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';

interface FinanceMetrics {
  pendingApprovals: number;
  reimbursementsDue: number;
  monthToDateSpend: number;
  flaggedExpenses: number;
  // Comparison metrics
  spendChange: number;
  spendChangeType: ChangeType;
  approvalsChange: string;
  approvalsChangeType: ChangeType;
}

interface ChartDataPoint {
  name: string;
  value: number;
}

interface LineChartSeries {
  name: string;
  series: ChartDataPoint[];
}

@Component({
  selector: 'app-finance-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    StatusBadge,
    EmptyState,
    NgxChartsModule
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
  categorySpendData$!: Observable<ChartDataPoint[]>;
  spendTrendData$!: Observable<LineChartSeries[]>;
  statusBreakdownData$!: Observable<ChartDataPoint[]>;
  loading = true;

  // Chart configuration
  readonly pieColorScheme: Color = {
    name: 'JensifyPie',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#F7580C', '#FF8A4D', '#FFB088', '#FFC9A8', '#FFE0CC', '#1a1a2e']
  };

  readonly lineChartColorScheme: Color = {
    name: 'JensifyLine',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#F7580C', '#34D399', '#60A5FA']
  };

  readonly statusColorScheme: Color = {
    name: 'StatusColors',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#F59E0B', '#10B981', '#3B82F6', '#EF4444']
  };

  readonly legendPosition = LegendPosition.Right;

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    // Get all expenses (finance can see all)
    const allExpenses$ = this.expenseService.queryExpenses();

    // Calculate metrics with comparison
    this.metrics$ = allExpenses$.pipe(
      map(expenses => {
        const monthExpenses = expenses.filter(e => e.expense_date >= startOfMonth);
        const lastMonthExpenses = expenses.filter(e =>
          e.expense_date >= startOfLastMonth && e.expense_date <= endOfLastMonth
        );
        const flaggedExpenses = expenses.filter(e =>
          e.policy_violations && e.policy_violations.length > 0
        );

        const thisMonthSpend = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
        const lastMonthSpend = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Calculate spend percentage change
        let spendChange = 0;
        let spendChangeType: ChangeType = 'neutral';
        if (lastMonthSpend > 0) {
          spendChange = Math.round(((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100);
          spendChangeType = spendChange > 0 ? 'negative' : spendChange < 0 ? 'positive' : 'neutral';
        } else if (thisMonthSpend > 0) {
          spendChange = 100;
          spendChangeType = 'negative';
        }

        const pendingApprovals = expenses.filter(e => e.status === ExpenseStatus.SUBMITTED).length;
        const reimbursementsDue = expenses.filter(e => e.status === ExpenseStatus.APPROVED)
          .reduce((sum, e) => sum + e.amount, 0);

        return {
          pendingApprovals,
          reimbursementsDue,
          monthToDateSpend: thisMonthSpend,
          flaggedExpenses: flaggedExpenses.length,
          spendChange: Math.abs(spendChange),
          spendChangeType,
          approvalsChange: pendingApprovals > 0 ? 'Needs review' : 'All clear',
          approvalsChangeType: pendingApprovals > 0 ? 'negative' : 'positive'
        };
      })
    );

    // Category breakdown (pie chart)
    this.categorySpendData$ = allExpenses$.pipe(
      map(expenses => {
        const monthExpenses = expenses.filter(e => e.expense_date >= startOfMonth);
        const categoryTotals = new Map<string, number>();

        monthExpenses.forEach(expense => {
          const category = expense.category || 'Other';
          const displayName = this.formatCategoryName(category);
          const current = categoryTotals.get(displayName) || 0;
          categoryTotals.set(displayName, current + expense.amount);
        });

        const chartData: ChartDataPoint[] = [];
        categoryTotals.forEach((value, name) => {
          chartData.push({ name, value: Math.round(value * 100) / 100 });
        });

        return chartData.sort((a, b) => b.value - a.value).slice(0, 6);
      })
    );

    // Spend trend (last 6 months)
    this.spendTrendData$ = allExpenses$.pipe(
      map(expenses => {
        const monthlyTotals = new Map<string, { approved: number; pending: number; reimbursed: number }>();

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = date.toLocaleDateString('en-US', { month: 'short' });
          monthlyTotals.set(key, { approved: 0, pending: 0, reimbursed: 0 });
        }

        // Sum expenses by month and status
        expenses.forEach(expense => {
          const date = new Date(expense.expense_date);
          const key = date.toLocaleDateString('en-US', { month: 'short' });
          if (monthlyTotals.has(key)) {
            const current = monthlyTotals.get(key)!;
            if (expense.status === ExpenseStatus.APPROVED) {
              current.approved += expense.amount;
            } else if (expense.status === ExpenseStatus.SUBMITTED) {
              current.pending += expense.amount;
            } else if (expense.status === ExpenseStatus.REIMBURSED) {
              current.reimbursed += expense.amount;
            }
          }
        });

        const approvedSeries: ChartDataPoint[] = [];
        const reimbursedSeries: ChartDataPoint[] = [];

        monthlyTotals.forEach((value, name) => {
          approvedSeries.push({ name, value: Math.round(value.approved * 100) / 100 });
          reimbursedSeries.push({ name, value: Math.round(value.reimbursed * 100) / 100 });
        });

        return [
          { name: 'Approved', series: approvedSeries },
          { name: 'Reimbursed', series: reimbursedSeries }
        ] as LineChartSeries[];
      })
    );

    // Status breakdown (pie chart)
    this.statusBreakdownData$ = allExpenses$.pipe(
      map(expenses => {
        const monthExpenses = expenses.filter(e => e.expense_date >= startOfMonth);
        const statusCounts = new Map<string, number>();

        monthExpenses.forEach(expense => {
          const status = this.formatStatusName(expense.status);
          const current = statusCounts.get(status) || 0;
          statusCounts.set(status, current + 1);
        });

        const chartData: ChartDataPoint[] = [];
        statusCounts.forEach((value, name) => {
          chartData.push({ name, value });
        });

        return chartData;
      })
    );

    // Get pending approvals (top 5)
    this.pendingApprovals$ = allExpenses$.pipe(
      map(expenses => {
        const pending = expenses.filter(e => e.status === ExpenseStatus.SUBMITTED);
        return pending.slice(0, 5) as ExpenseWithUser[];
      })
    );

    // Get recent activity (approvals and reimbursements, top 5)
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

  private formatCategoryName(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
  }

  private formatStatusName(status: string): string {
    const statusMap: Record<string, string> = {
      'draft': 'Draft',
      'submitted': 'Pending',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'reimbursed': 'Reimbursed'
    };
    return statusMap[status.toLowerCase()] || status;
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

  /**
   * Helper to check if trend data has values
   */
  hasTrendData(data: LineChartSeries[]): boolean {
    return data.length > 0 && data.some(series => series.series.some(d => d.value > 0));
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
