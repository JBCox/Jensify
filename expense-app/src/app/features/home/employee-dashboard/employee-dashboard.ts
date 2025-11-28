import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, map } from 'rxjs';
import { NgxChartsModule, Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { ExpenseService } from '../../../core/services/expense.service';
import { Expense } from '../../../core/models/expense.model';
import { ExpenseStatus } from '../../../core/models/enums';
import { ChangeType } from '../../../shared/components/metric-card/metric-card';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';

interface DashboardMetrics {
  totalSpend: number;
  pendingCount: number;
  approvedCount: number;
  recentUploads: number;
  // Comparison metrics
  spendChange: number;
  spendChangeType: ChangeType;
}

interface ChartDataPoint {
  name: string;
  value: number;
}

interface MonthlyTrendPoint {
  name: string;
  value: number;
}

@Component({
  selector: 'app-employee-dashboard',
  imports: [
    CommonModule,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    StatusBadge,
    EmptyState,
    NgxChartsModule
  ],
  templateUrl: './employee-dashboard.html',
  styleUrl: './employee-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeDashboard implements OnInit {
  private expenseService = inject(ExpenseService);
  private router = inject(Router);

  metrics$!: Observable<DashboardMetrics>;
  recentExpenses$!: Observable<Expense[]>;
  categorySpendData$!: Observable<ChartDataPoint[]>;
  monthlyTrendData$!: Observable<MonthlyTrendPoint[]>;
  loading = true;

  // Chart configuration
  readonly pieColorScheme: Color = {
    name: 'JensifyPie',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#F7580C', '#FF8A4D', '#FFB088', '#FFC9A8', '#FFE0CC', '#1a1a2e']
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
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Get all user's expenses
    const allExpenses$ = this.expenseService.getMyExpenses();

    // Calculate metrics with comparison
    this.metrics$ = allExpenses$.pipe(
      map(expenses => {
        const monthExpenses = expenses.filter(e => e.expense_date >= startOfMonth);
        const lastMonthExpenses = expenses.filter(e =>
          e.expense_date >= startOfLastMonth && e.expense_date <= endOfLastMonth
        );
        const recentExpenses = expenses.filter(e => e.created_at >= sevenDaysAgo);

        const thisMonthSpend = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
        const lastMonthSpend = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Calculate percentage change
        let spendChange = 0;
        let spendChangeType: ChangeType = 'neutral';
        if (lastMonthSpend > 0) {
          spendChange = Math.round(((thisMonthSpend - lastMonthSpend) / lastMonthSpend) * 100);
          spendChangeType = spendChange > 0 ? 'negative' : spendChange < 0 ? 'positive' : 'neutral';
        } else if (thisMonthSpend > 0) {
          spendChange = 100;
          spendChangeType = 'negative';
        }

        return {
          totalSpend: thisMonthSpend,
          pendingCount: expenses.filter(e => e.status === ExpenseStatus.DRAFT).length,
          approvedCount: expenses.filter(e => e.status === ExpenseStatus.APPROVED).length,
          recentUploads: recentExpenses.length,
          spendChange: Math.abs(spendChange),
          spendChangeType
        };
      })
    );

    // Category spend breakdown (pie chart)
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

        return chartData.sort((a, b) => b.value - a.value);
      })
    );

    // Monthly trend (last 6 months)
    this.monthlyTrendData$ = allExpenses$.pipe(
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

        const trendData: MonthlyTrendPoint[] = [];
        monthlyTotals.forEach((value, name) => {
          trendData.push({ name, value: Math.round(value * 100) / 100 });
        });

        return trendData;
      })
    );

    // Get recent 5 expenses
    this.recentExpenses$ = allExpenses$.pipe(
      map(expenses => expenses.slice(0, 5))
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
   * Helper method to check if trend data has any values - used in template
   */
  hasTrendData(data: MonthlyTrendPoint[]): boolean {
    return data.some(d => d.value > 0);
  }

  onUploadReceipt(): void {
    this.router.navigate(['/expenses/upload']);
  }

  onSubmitExpense(): void {
    this.router.navigate(['/expenses/form']);
  }

  onViewExpense(expense: Expense): void {
    this.router.navigate(['/expenses', expense.id]);
  }

  /**
   * TrackBy function for expense list - improves ngFor performance
   */
  trackByExpenseId(_index: number, expense: Expense): string {
    return expense.id;
  }
}
