import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  AnalyticsDashboardData,
  AnalyticsFilters,
  DateRangePreset,
  DATE_RANGE_PRESETS,
  getDateRangeForPreset,
  formatCurrency,
  formatPercent,
  formatChange,
  ANALYTICS_COLORS
} from '../../../core/models/analytics.model';

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTableModule,
    MatChipsModule,
    MatProgressBarModule,
    MatTooltipModule,
    CurrencyPipe,
    DecimalPipe,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <button mat-icon-button routerLink="/finance/dashboard" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1 class="jensify-page-title">Analytics</h1>
            <p class="jensify-page-subtitle">Comprehensive expense insights and reporting</p>
          </div>
        </div>
        <div class="header-actions">
          <mat-form-field appearance="outline" class="date-range-select">
            <mat-label>Date Range</mat-label>
            <mat-select [(value)]="selectedPreset" (selectionChange)="onDateRangeChange()">
              @for (preset of datePresets; track preset.value) {
                <mat-option [value]="preset.value">{{ preset.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <button mat-stroked-button (click)="exportData()" [disabled]="loading()">
            <mat-icon>download</mat-icon>
            Export
          </button>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <p>Loading analytics data...</p>
        </div>
      } @else if (data()) {
        <!-- Summary Metrics -->
        <div class="metrics-grid">
          @for (metric of summaryMetrics; track metric.key) {
            <mat-card class="jensify-card metric-card">
              <div class="metric-icon" [style.background]="metric.color">
                <mat-icon>{{ metric.icon }}</mat-icon>
              </div>
              <div class="metric-content">
                <span class="metric-value">
                  @if (metric.isCurrency) {
                    {{ getMetricValue(metric.key) | currency:'USD':'symbol':'1.0-0' }}
                  } @else {
                    {{ getMetricValue(metric.key) | number:'1.0-0' }}
                  }
                </span>
                <span class="metric-label">{{ metric.label }}</span>
                @if (getMetricChange(metric.key); as change) {
                  <span class="metric-change" [class]="change.class">
                    <mat-icon>{{ change.icon }}</mat-icon>
                    {{ change.text }}
                  </span>
                }
              </div>
            </mat-card>
          }
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <!-- Category Breakdown -->
          <mat-card class="jensify-card chart-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">pie_chart</mat-icon>
              <mat-card-title>Spending by Category</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (data()?.categoryBreakdown?.length) {
                <div class="category-list">
                  @for (category of data()?.categoryBreakdown; track category.category; let i = $index) {
                    <div class="category-item">
                      <div class="category-info">
                        <div class="category-color" [style.background]="chartColors[i % chartColors.length]"></div>
                        <span class="category-name">{{ category.category }}</span>
                      </div>
                      <div class="category-stats">
                        <span class="category-amount">{{ category.total_amount | currency:'USD':'symbol':'1.0-0' }}</span>
                        <span class="category-percent">{{ category.percentage | number:'1.1-1' }}%</span>
                      </div>
                      <mat-progress-bar mode="determinate" [value]="category.percentage"
                                        [style.--mdc-linear-progress-active-indicator-color]="chartColors[i % chartColors.length]">
                      </mat-progress-bar>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty-state">
                  <mat-icon>pie_chart</mat-icon>
                  <p>No category data available</p>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Department Comparison -->
          <mat-card class="jensify-card chart-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon department-icon">business</mat-icon>
              <mat-card-title>Spending by Department</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (data()?.departmentComparison?.length) {
                <div class="category-list">
                  @for (dept of data()?.departmentComparison; track dept.department; let i = $index) {
                    <div class="category-item">
                      <div class="category-info">
                        <div class="category-color" [style.background]="chartColors[(i + 3) % chartColors.length]"></div>
                        <span class="category-name">{{ dept.department || 'Unassigned' }}</span>
                      </div>
                      <div class="category-stats">
                        <span class="category-amount">{{ dept.total_amount | currency:'USD':'symbol':'1.0-0' }}</span>
                        <span class="category-percent">{{ dept.percentage_of_total | number:'1.1-1' }}%</span>
                      </div>
                      <mat-progress-bar mode="determinate" [value]="dept.percentage_of_total"
                                        [style.--mdc-linear-progress-active-indicator-color]="chartColors[(i + 3) % chartColors.length]">
                      </mat-progress-bar>
                    </div>
                  }
                </div>
              } @else {
                <div class="empty-state">
                  <mat-icon>business</mat-icon>
                  <p>No department data available</p>
                </div>
              }
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Top Spenders & Merchants -->
        <div class="tables-row">
          <!-- Top Spenders -->
          <mat-card class="jensify-card table-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon spender-icon">trending_up</mat-icon>
              <mat-card-title>Top Spenders</mat-card-title>
              <mat-card-subtitle>Highest expense submitters</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @if (data()?.topSpenders?.length) {
                <table mat-table [dataSource]="data()?.topSpenders ?? []" class="spenders-table">
                  <ng-container matColumnDef="rank">
                    <th mat-header-cell *matHeaderCellDef>#</th>
                    <td mat-cell *matCellDef="let spender; let i = index">{{ i + 1 }}</td>
                  </ng-container>
                  <ng-container matColumnDef="user">
                    <th mat-header-cell *matHeaderCellDef>Employee</th>
                    <td mat-cell *matCellDef="let spender">
                      <div class="user-cell">
                        <span class="user-name">{{ spender.user_name }}</span>
                        <span class="user-dept">{{ spender.department || 'No department' }}</span>
                      </div>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="count">
                    <th mat-header-cell *matHeaderCellDef>Expenses</th>
                    <td mat-cell *matCellDef="let spender">{{ spender.expense_count }}</td>
                  </ng-container>
                  <ng-container matColumnDef="amount">
                    <th mat-header-cell *matHeaderCellDef>Total</th>
                    <td mat-cell *matCellDef="let spender" class="amount-cell">
                      {{ spender.total_amount | currency:'USD':'symbol':'1.0-0' }}
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['rank', 'user', 'count', 'amount']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['rank', 'user', 'count', 'amount']"></tr>
                </table>
              } @else {
                <div class="empty-state">
                  <mat-icon>person</mat-icon>
                  <p>No spender data available</p>
                </div>
              }
            </mat-card-content>
          </mat-card>

          <!-- Top Merchants -->
          <mat-card class="jensify-card table-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon merchant-icon">store</mat-icon>
              <mat-card-title>Top Merchants</mat-card-title>
              <mat-card-subtitle>Most frequent vendors</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @if (data()?.merchantAnalysis?.length) {
                <table mat-table [dataSource]="data()?.merchantAnalysis?.slice(0, 10) ?? []" class="merchants-table">
                  <ng-container matColumnDef="rank">
                    <th mat-header-cell *matHeaderCellDef>#</th>
                    <td mat-cell *matCellDef="let merchant; let i = index">{{ i + 1 }}</td>
                  </ng-container>
                  <ng-container matColumnDef="merchant">
                    <th mat-header-cell *matHeaderCellDef>Merchant</th>
                    <td mat-cell *matCellDef="let merchant">
                      <div class="merchant-cell">
                        <span class="merchant-name">{{ merchant.merchant }}</span>
                        <span class="merchant-category">{{ merchant.most_common_category }}</span>
                      </div>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="count">
                    <th mat-header-cell *matHeaderCellDef>Txns</th>
                    <td mat-cell *matCellDef="let merchant">{{ merchant.expense_count }}</td>
                  </ng-container>
                  <ng-container matColumnDef="amount">
                    <th mat-header-cell *matHeaderCellDef>Total</th>
                    <td mat-cell *matCellDef="let merchant" class="amount-cell">
                      {{ merchant.total_amount | currency:'USD':'symbol':'1.0-0' }}
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="['rank', 'merchant', 'count', 'amount']"></tr>
                  <tr mat-row *matRowDef="let row; columns: ['rank', 'merchant', 'count', 'amount']"></tr>
                </table>
              } @else {
                <div class="empty-state">
                  <mat-icon>store</mat-icon>
                  <p>No merchant data available</p>
                </div>
              }
            </mat-card-content>
          </mat-card>
        </div>

        <!-- Budget vs Actual -->
        @if (data()?.budgetVsActual?.length) {
          <mat-card class="jensify-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon budget-icon">account_balance_wallet</mat-icon>
              <mat-card-title>Budget vs Actual</mat-card-title>
              <mat-card-subtitle>Budget utilization across departments</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="budget-grid">
                @for (budget of data()?.budgetVsActual; track budget.budget_name) {
                  <div class="budget-item" [class]="budget.status">
                    <div class="budget-header">
                      <span class="budget-name">{{ budget.budget_name }}</span>
                      <mat-chip-set>
                        <mat-chip [color]="budget.status === 'over_budget' ? 'warn' : budget.status === 'warning' ? 'accent' : 'primary'"
                                  [highlighted]="true">
                          {{ budget.utilization_percent | number:'1.0-0' }}% used
                        </mat-chip>
                      </mat-chip-set>
                    </div>
                    <mat-progress-bar mode="determinate"
                                      [value]="budget.utilization_percent > 100 ? 100 : budget.utilization_percent"
                                      [color]="budget.status === 'over_budget' ? 'warn' : budget.status === 'warning' ? 'accent' : 'primary'">
                    </mat-progress-bar>
                    <div class="budget-footer">
                      <span>{{ budget.actual_spent | currency:'USD':'symbol':'1.0-0' }} spent</span>
                      <span>{{ budget.budget_amount | currency:'USD':'symbol':'1.0-0' }} budget</span>
                    </div>
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    .jensify-header-content {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .back-button {
      margin-left: calc(-1 * var(--jensify-spacing-sm, 0.5rem));
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .date-range-select {
      width: 180px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--jensify-spacing-xl, 2rem);
      gap: var(--jensify-spacing-md, 1rem);
      color: var(--jensify-text-muted, #666);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
      margin-bottom: var(--jensify-spacing-lg, 1.5rem);
    }

    .metric-card {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-lg, 1.5rem);
    }

    .metric-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--jensify-radius-md, 8px);
      flex-shrink: 0;

      mat-icon {
        color: white;
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
    }

    .metric-content {
      display: flex;
      flex-direction: column;
    }

    .metric-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .metric-label {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    .metric-change {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 0.75rem;
      margin-top: 4px;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }

      &.text-success {
        color: #22c55e;
      }

      &.text-danger {
        color: #ef4444;
      }

      &.text-muted {
        color: var(--jensify-text-muted, #666);
      }
    }

    .charts-row, .tables-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: var(--jensify-spacing-lg, 1.5rem);
      margin-bottom: var(--jensify-spacing-lg, 1.5rem);
    }

    .card-icon {
      background: var(--jensify-primary, #ff5900);
      color: white;
      border-radius: var(--jensify-radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
    }

    .department-icon {
      background: #8b5cf6;
    }

    .spender-icon {
      background: #22c55e;
    }

    .merchant-icon {
      background: #3b82f6;
    }

    .budget-icon {
      background: #f59e0b;
    }

    .category-list {
      display: flex;
      flex-direction: column;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .category-item {
      display: flex;
      flex-direction: column;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    .category-info {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-sm, 0.5rem);
    }

    .category-color {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }

    .category-name {
      flex: 1;
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .category-stats {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
    }

    .category-amount {
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .category-percent {
      color: var(--jensify-text-muted, #666);
    }

    .empty-state {
      text-align: center;
      padding: var(--jensify-spacing-xl, 2rem);
      color: var(--jensify-text-muted, #666);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
      }

      p {
        margin: var(--jensify-spacing-sm, 0.5rem) 0 0;
      }
    }

    .spenders-table, .merchants-table {
      width: 100%;
    }

    .user-cell, .merchant-cell {
      display: flex;
      flex-direction: column;
    }

    .user-name, .merchant-name {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .user-dept, .merchant-category {
      font-size: 0.75rem;
      color: var(--jensify-text-muted, #666);
    }

    .amount-cell {
      font-weight: 600;
      color: var(--jensify-primary, #ff5900);
    }

    .budget-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
    }

    .budget-item {
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);

      &.over_budget {
        background: rgba(239, 68, 68, 0.1);
      }

      &.warning {
        background: rgba(245, 158, 11, 0.1);
      }
    }

    .budget-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--jensify-spacing-sm, 0.5rem);
    }

    .budget-name {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .budget-footer {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
      margin-top: var(--jensify-spacing-sm, 0.5rem);
    }

    :host-context(.dark) {
      .metric-value, .category-name, .category-amount,
      .user-name, .merchant-name, .budget-name {
        color: #fff;
      }

      .budget-item {
        background: rgba(255, 255, 255, 0.05);
      }
    }

    @media (max-width: 767px) {
      .jensify-page-header {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--jensify-spacing-md, 1rem);
      }

      .header-actions {
        width: 100%;
        flex-direction: column;
      }

      .date-range-select {
        width: 100%;
      }

      .charts-row, .tables-row {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnalyticsComponent implements OnInit {
  private analyticsService = inject(AnalyticsService);
  private notificationService = inject(NotificationService);

  loading = signal(true);
  data = signal<AnalyticsDashboardData | null>(null);

  datePresets = DATE_RANGE_PRESETS;
  selectedPreset: DateRangePreset = 'this_month';
  chartColors = ANALYTICS_COLORS.chart;

  summaryMetrics = [
    { key: 'total_expenses', label: 'Total Spending', icon: 'payments', color: '#ff5900', isCurrency: true },
    { key: 'expense_count', label: 'Total Expenses', icon: 'receipt_long', color: '#3b82f6', isCurrency: false },
    { key: 'avg_expense', label: 'Avg Expense', icon: 'calculate', color: '#22c55e', isCurrency: true },
    { key: 'pending_amount', label: 'Pending Approval', icon: 'hourglass_empty', color: '#f59e0b', isCurrency: true },
  ];

  ngOnInit(): void {
    this.loadData();
  }

  onDateRangeChange(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    const range = getDateRangeForPreset(this.selectedPreset);

    const filters: AnalyticsFilters = {
      start_date: range.start_date,
      end_date: range.end_date,
      interval: 'month',
    };

    this.analyticsService.loadDashboardData(filters).subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading analytics:', err);
        this.notificationService.showError('Failed to load analytics data');
        this.loading.set(false);
      },
    });
  }

  getMetricValue(key: string): number {
    const summary = this.data()?.summary;
    if (!summary) return 0;
    const metric = summary.find(m => m.metric_key === key);
    return metric?.metric_value ?? 0;
  }

  getMetricChange(key: string): { text: string; class: string; icon: string } | null {
    const summary = this.data()?.summary;
    if (!summary) return null;
    const metric = summary.find(m => m.metric_key === key);
    if (!metric || metric.change_percent === 0) return null;
    return formatChange(metric.change_percent);
  }

  exportData(): void {
    const data = this.data();
    if (!data) return;

    // Export category breakdown as CSV
    if (data.categoryBreakdown?.length) {
      this.analyticsService.exportToCsv(
        data.categoryBreakdown as unknown as Record<string, unknown>[],
        'category_breakdown'
      );
    }

    this.notificationService.showSuccess('Data exported successfully');
  }
}
