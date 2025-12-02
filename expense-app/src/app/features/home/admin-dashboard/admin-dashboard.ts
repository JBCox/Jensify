import { Component, OnInit, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { NgxChartsModule, Color, ScaleType, LegendPosition } from '@swimlane/ngx-charts';
import { ExpenseService } from '../../../core/services/expense.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ChangeType } from '../../../shared/components/metric-card/metric-card';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { PullToRefresh } from '../../../shared/components/pull-to-refresh/pull-to-refresh';

interface AdminMetrics {
  activeUsers: number;
  pendingApprovals: number;
  monthlyExpenseCount: number;
  totalExpenses: number;
  monthlySpend: number;
  // Comparison metrics
  spendChange: number;
  spendChangeType: ChangeType;
  usersChange: string;
  usersChangeType: ChangeType;
}

interface ChartDataPoint {
  name: string;
  value: number;
}

interface LineChartSeries {
  name: string;
  series: ChartDataPoint[];
}

interface TopVendor {
  name: string;
  amount: number;
  count: number;
}

interface TopSpender {
  name: string;
  email: string;
  amount: number;
  count: number;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    EmptyState,
    NgxChartsModule,
    PullToRefresh
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboard implements OnInit {
  private expenseService = inject(ExpenseService);
  private organizationService = inject(OrganizationService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);

  metrics$!: Observable<AdminMetrics>;
  expenseTrendData$!: Observable<LineChartSeries[]>;
  categorySpendData$!: Observable<ChartDataPoint[]>;
  topVendors$!: Observable<TopVendor[]>;
  topSpenders$!: Observable<TopSpender[]>;
  loading = true;
  refreshing = signal(false);

  // Chart configuration - static color scheme to avoid change detection issues
  readonly chartColorScheme: Color = {
    name: 'Jensify',
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
    this.loadChartData();
  }

  /**
   * Handle pull-to-refresh
   */
  onRefresh(): void {
    this.refreshing.set(true);
    this.loadDashboardData();
    this.loadChartData();
    // Allow time for observables to emit new values
    setTimeout(() => this.refreshing.set(false), 1000);
  }

  private loadDashboardData(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

    // Get organization context first
    const orgId$ = this.organizationService.currentOrganization$.pipe(
      map(org => org?.id)
    );

    // Calculate metrics from database
    this.metrics$ = orgId$.pipe(
      switchMap(orgId => {
        if (!orgId) {
          return of({
            activeUsers: 0,
            pendingApprovals: 0,
            monthlyExpenseCount: 0,
            totalExpenses: 0,
            monthlySpend: 0,
            spendChange: 0,
            spendChangeType: 'neutral' as ChangeType,
            usersChange: 'No change',
            usersChangeType: 'neutral' as ChangeType
          });
        }

        // Query all metrics in parallel
        const activeUsers$ = this.supabaseService.client
          .from('organization_members')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .then(({ count }) => count || 0);

        const pendingApprovals$ = this.supabaseService.client
          .from('expense_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('status', 'pending')
          .then(({ count }) => count || 0);

        const totalExpenses$ = this.supabaseService.client
          .from('expenses')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .then(({ count }) => count || 0);

        const monthlyExpenses$ = this.supabaseService.client
          .from('expenses')
          .select('amount')
          .eq('organization_id', orgId)
          .gte('expense_date', startOfMonth)
          .then(({ data }) => {
            const expenses = data || [];
            return {
              count: expenses.length,
              total: expenses.reduce((sum, e) => sum + (parseFloat(e.amount as string) || 0), 0)
            };
          });

        const lastMonthExpenses$ = this.supabaseService.client
          .from('expenses')
          .select('amount')
          .eq('organization_id', orgId)
          .gte('expense_date', startOfLastMonth)
          .lte('expense_date', endOfLastMonth)
          .then(({ data }) => {
            const expenses = data || [];
            return expenses.reduce((sum, e) => sum + (parseFloat(e.amount as string) || 0), 0);
          });

        return combineLatest([
          activeUsers$,
          pendingApprovals$,
          totalExpenses$,
          monthlyExpenses$,
          lastMonthExpenses$
        ]).pipe(
          map(([activeUsers, pendingApprovals, totalExpenses, monthlyData, lastMonthTotal]) => {
            // Calculate spend change
            let spendChange = 0;
            let spendChangeType: ChangeType = 'neutral';
            if (lastMonthTotal > 0) {
              spendChange = Math.round(((monthlyData.total - lastMonthTotal) / lastMonthTotal) * 100);
              spendChangeType = spendChange > 0 ? 'negative' : spendChange < 0 ? 'positive' : 'neutral';
            } else if (monthlyData.total > 0) {
              spendChange = 100;
              spendChangeType = 'negative';
            }

            return {
              activeUsers,
              pendingApprovals,
              monthlyExpenseCount: monthlyData.count,
              totalExpenses,
              monthlySpend: monthlyData.total,
              spendChange: Math.abs(spendChange),
              spendChangeType,
              usersChange: activeUsers > 0 ? `${activeUsers} active` : 'No users',
              usersChangeType: activeUsers > 0 ? 'positive' : 'neutral' as ChangeType
            };
          }),
          catchError(() => of({
            activeUsers: 0,
            pendingApprovals: 0,
            monthlyExpenseCount: 0,
            totalExpenses: 0,
            monthlySpend: 0,
            spendChange: 0,
            spendChangeType: 'neutral' as ChangeType,
            usersChange: 'No change',
            usersChangeType: 'neutral' as ChangeType
          }))
        );
      })
    );

    this.loading = false;
  }

  private loadChartData(): void {
    const orgId$ = this.organizationService.currentOrganization$.pipe(
      map(org => org?.id)
    );

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Load expense trend data (last 6 months)
    this.expenseTrendData$ = orgId$.pipe(
      switchMap(orgId => {
        if (!orgId) {
          return of([]);
        }

        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        return this.supabaseService.client
          .from('expenses')
          .select('amount, expense_date')
          .eq('organization_id', orgId)
          .gte('expense_date', sixMonthsAgo.toISOString())
          .order('expense_date', { ascending: true })
          .then(({ data, error }) => {
            if (error || !data) return [];
            return data;
          });
      }),
      map(expenses => {
        const monthlyTotals = new Map<string, number>();

        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const key = date.toLocaleDateString('en-US', { month: 'short' });
          monthlyTotals.set(key, 0);
        }

        expenses.forEach((expense: { amount: string | number; expense_date: string }) => {
          const date = new Date(expense.expense_date);
          const key = date.toLocaleDateString('en-US', { month: 'short' });
          if (monthlyTotals.has(key)) {
            const current = monthlyTotals.get(key) || 0;
            monthlyTotals.set(key, current + (parseFloat(expense.amount as string) || 0));
          }
        });

        const series: ChartDataPoint[] = [];
        monthlyTotals.forEach((value, name) => {
          series.push({ name, value: Math.round(value * 100) / 100 });
        });

        return [{
          name: 'Expenses',
          series
        }] as LineChartSeries[];
      }),
      catchError(() => of([]))
    );

    // Load category spend data
    this.categorySpendData$ = orgId$.pipe(
      switchMap(orgId => {
        if (!orgId) {
          return of([]);
        }

        return this.supabaseService.client
          .from('expenses')
          .select('amount, category')
          .eq('organization_id', orgId)
          .gte('expense_date', startOfMonth)
          .then(({ data, error }) => {
            if (error || !data) return [];
            return data;
          });
      }),
      map(expenses => {
        const categoryTotals = new Map<string, number>();

        expenses.forEach((expense: { amount: string | number; category: string }) => {
          const category = expense.category || 'Other';
          const displayName = this.formatCategoryName(category);
          const current = categoryTotals.get(displayName) || 0;
          categoryTotals.set(displayName, current + (parseFloat(expense.amount as string) || 0));
        });

        const chartData: ChartDataPoint[] = [];
        categoryTotals.forEach((value, name) => {
          chartData.push({ name, value: Math.round(value * 100) / 100 });
        });

        return chartData.sort((a, b) => b.value - a.value).slice(0, 6);
      }),
      catchError(() => of([]))
    );

    // Load top vendors
    this.topVendors$ = orgId$.pipe(
      switchMap(orgId => {
        if (!orgId) {
          return of([]);
        }

        return this.supabaseService.client
          .from('expenses')
          .select('merchant, amount')
          .eq('organization_id', orgId)
          .gte('expense_date', startOfMonth)
          .then(({ data, error }) => {
            if (error || !data) return [];
            return data;
          });
      }),
      map(expenses => {
        const vendorTotals = new Map<string, { amount: number; count: number }>();

        expenses.forEach((expense: { merchant: string; amount: string | number }) => {
          const vendor = expense.merchant || 'Unknown';
          const current = vendorTotals.get(vendor) || { amount: 0, count: 0 };
          current.amount += parseFloat(expense.amount as string) || 0;
          current.count += 1;
          vendorTotals.set(vendor, current);
        });

        const vendors: TopVendor[] = [];
        vendorTotals.forEach((data, name) => {
          vendors.push({
            name,
            amount: Math.round(data.amount * 100) / 100,
            count: data.count
          });
        });

        return vendors.sort((a, b) => b.amount - a.amount).slice(0, 5);
      }),
      catchError(() => of([]))
    );

    // Load top spenders
    this.topSpenders$ = orgId$.pipe(
      switchMap(orgId => {
        if (!orgId) {
          return of([]);
        }

        return this.supabaseService.client
          .from('expenses')
          .select(`
            amount,
            user_id,
            users:user_id (
              full_name,
              email
            )
          `)
          .eq('organization_id', orgId)
          .gte('expense_date', startOfMonth)
          .then(({ data, error }) => {
            if (error || !data) return [];
            return data;
          });
      }),
      map(expenses => {
        const userTotals = new Map<string, { name: string; email: string; amount: number; count: number }>();

        expenses.forEach((expense: {
          user_id: string;
          amount: string | number;
          users: { full_name?: string; email?: string } | { full_name?: string; email?: string }[];
        }) => {
          const userId = expense.user_id;
          // Supabase returns users as an object or array depending on the join type
          const userData = Array.isArray(expense.users) ? expense.users[0] : expense.users;
          const name = userData?.full_name || 'Unknown';
          const email = userData?.email || '';

          const current = userTotals.get(userId) || { name, email, amount: 0, count: 0 };
          current.amount += parseFloat(expense.amount as string) || 0;
          current.count += 1;
          userTotals.set(userId, current);
        });

        const spenders: TopSpender[] = [];
        userTotals.forEach(data => {
          spenders.push({
            name: data.name,
            email: data.email,
            amount: Math.round(data.amount * 100) / 100,
            count: data.count
          });
        });

        return spenders.sort((a, b) => b.amount - a.amount).slice(0, 5);
      }),
      catchError(() => of([]))
    );
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

  /**
   * Helper to check if trend data has values
   */
  hasTrendData(data: LineChartSeries[]): boolean {
    return data.length > 0 && data[0].series.some(d => d.value > 0);
  }

  onManageUsers(): void {
    this.router.navigate(['/organization/users']);
  }

  onViewFinance(): void {
    this.router.navigate(['/finance']);
  }

  onViewApprovals(): void {
    this.router.navigate(['/approvals']);
  }

  onViewExpenses(): void {
    this.router.navigate(['/expenses']);
  }
}
