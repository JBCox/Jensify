import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, combineLatest, map } from 'rxjs';
import { NgxChartsModule, Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { ExpenseService } from '../../../core/services/expense.service';
import { ExpenseWithUser } from '../../../core/models/expense.model';
import { ExpenseStatus } from '../../../core/models/enums';
import { ChangeType } from '../../../shared/components/metric-card/metric-card';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';

interface ManagerMetrics {
  teamPendingApprovals: number;
  teamMonthSpend: number;
  myPendingExpenses: number;
  teamMemberCount: number;
  // Comparison metrics
  spendChange: number;
  spendChangeType: ChangeType;
  approvalsChange: number;
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
  selector: 'app-manager-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    StatusBadge,
    EmptyState,
    NgxChartsModule
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
  teamCategorySpendData$!: Observable<ChartDataPoint[]>;
  teamSpendTrendData$!: Observable<LineChartSeries[]>;
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
    domain: ['#F7580C']
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

    // Get team expenses (manager can approve team expenses)
    const teamExpenses$ = this.expenseService.queryExpenses();

    // Get my own expenses
    const myExpenses$ = this.expenseService.getMyExpenses();

    // Calculate metrics with comparison
    this.metrics$ = combineLatest([teamExpenses$, myExpenses$]).pipe(
      map(([teamExpenses, myExpenses]) => {
        const teamMonthExpenses = teamExpenses.filter(e => e.expense_date >= startOfMonth);
        const teamLastMonthExpenses = teamExpenses.filter(e =>
          e.expense_date >= startOfLastMonth && e.expense_date <= endOfLastMonth
        );
        const uniqueUsers = new Set(teamExpenses.map(e => e.user_id)).size;

        const thisMonthSpend = teamMonthExpenses.reduce((sum, e) => sum + e.amount, 0);
        const lastMonthSpend = teamLastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

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

        const pendingApprovals = teamExpenses.filter(e => e.status === ExpenseStatus.SUBMITTED).length;

        return {
          teamPendingApprovals: pendingApprovals,
          teamMonthSpend: thisMonthSpend,
          myPendingExpenses: myExpenses.filter(e => e.status === ExpenseStatus.DRAFT).length,
          teamMemberCount: uniqueUsers,
          spendChange: Math.abs(spendChange),
          spendChangeType,
          approvalsChange: pendingApprovals > 0 ? pendingApprovals : 0,
          approvalsChangeType: pendingApprovals > 0 ? 'negative' : 'positive'
        };
      })
    );

    // Team spending by category (pie chart)
    this.teamCategorySpendData$ = teamExpenses$.pipe(
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

    // Team spending trend (last 6 months)
    this.teamSpendTrendData$ = teamExpenses$.pipe(
      map(expenses => {
        const monthlyTotals = new Map<string, number>();

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = date.toLocaleDateString('en-US', { month: 'short' });
          monthlyTotals.set(key, 0);
        }

        // Sum expenses by month
        expenses.forEach(expense => {
          const date = new Date(expense.expense_date);
          const key = date.toLocaleDateString('en-US', { month: 'short' });
          if (monthlyTotals.has(key)) {
            const current = monthlyTotals.get(key) || 0;
            monthlyTotals.set(key, current + expense.amount);
          }
        });

        const series: ChartDataPoint[] = [];
        monthlyTotals.forEach((value, name) => {
          series.push({ name, value: Math.round(value * 100) / 100 });
        });

        return [{
          name: 'Team Spend',
          series
        }] as LineChartSeries[];
      })
    );

    // Get team pending approvals (top 5)
    this.teamPendingApprovals$ = teamExpenses$.pipe(
      map(expenses => {
        const pending = expenses.filter(e => e.status === ExpenseStatus.SUBMITTED);
        return pending.slice(0, 5) as ExpenseWithUser[];
      })
    );

    // Get my recent expenses (top 3)
    this.myRecentExpenses$ = myExpenses$.pipe(
      map(expenses => expenses.slice(0, 3) as ExpenseWithUser[])
    );

    this.loading = false;
  }

  private formatCategoryName(category: string): string {
    return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
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
    return data.length > 0 && data[0].series.some(d => d.value > 0);
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
