import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { SuperAdminAnalytics } from '../../../core/models/subscription.model';

/**
 * Revenue Analytics Component (Super Admin)
 *
 * Displays key business metrics:
 * - MRR/ARR trends
 * - Customer acquisition and churn
 * - Plan distribution
 * - Revenue by plan
 */
@Component({
  selector: 'app-revenue-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSelectModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="analytics-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Revenue Analytics</h1>
          <p class="subtitle">Key business metrics and trends</p>
        </div>
        <div class="header-actions">
          <mat-form-field appearance="outline" class="period-select">
            <mat-label>Period</mat-label>
            <mat-select [(ngModel)]="selectedPeriod">
              <mat-option value="30d">Last 30 Days</mat-option>
              <mat-option value="90d">Last 90 Days</mat-option>
              <mat-option value="12m">Last 12 Months</mat-option>
              <mat-option value="all">All Time</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading analytics...</p>
        </div>
      } @else {
        <!-- Primary Metrics -->
        <section class="metrics-section primary">
          <div class="metrics-grid">
            <mat-card class="metric-card hero">
              <div class="metric-header">
                <mat-icon>attach_money</mat-icon>
                <span>Monthly Recurring Revenue</span>
              </div>
              <div class="metric-value">{{ (analytics()?.mrr?.total_mrr_cents || 0) / 100 | currency }}</div>
              <div class="metric-change positive">
                <mat-icon>trending_up</mat-icon>
                +{{ analytics()?.mrr_growth || 0 }}% vs last month
              </div>
            </mat-card>

            <mat-card class="metric-card hero">
              <div class="metric-header">
                <mat-icon>calendar_today</mat-icon>
                <span>Annual Recurring Revenue</span>
              </div>
              <div class="metric-value">{{ analytics()?.arr || 0 | currency }}</div>
              <div class="metric-subtext">
                Projected based on current MRR
              </div>
            </mat-card>
          </div>
        </section>

        <!-- Customer Metrics -->
        <section class="metrics-section">
          <h2>
            <mat-icon>people</mat-icon>
            Customer Metrics
          </h2>
          <div class="metrics-grid four-col">
            <mat-card class="metric-card">
              <div class="metric-label">Total Organizations</div>
              <div class="metric-value small">{{ analytics()?.total_organizations || 0 }}</div>
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">Paying Customers</div>
              <div class="metric-value small">{{ analytics()?.paying_organizations || 0 }}</div>
              <div class="metric-subtext">
                {{ ((analytics()?.paying_organizations || 0) / (analytics()?.total_organizations || 1) * 100) | number:'1.0-0' }}% conversion
              </div>
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">Total Users</div>
              <div class="metric-value small">{{ analytics()?.total_users || 0 }}</div>
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">ARPO</div>
              <div class="metric-value small">{{ analytics()?.average_revenue_per_org || 0 | currency }}</div>
              <div class="metric-subtext">Avg Revenue Per Org</div>
            </mat-card>
          </div>
        </section>

        <!-- Health Indicators -->
        <section class="metrics-section">
          <h2>
            <mat-icon>health_and_safety</mat-icon>
            Health Indicators
          </h2>
          <div class="metrics-grid four-col">
            <mat-card class="metric-card" [class.warning]="(analytics()?.churn_rate || 0) > 0.05">
              <div class="metric-label">Monthly Churn</div>
              <div class="metric-value small">{{ (analytics()?.churn_rate || 0) * 100 | number:'1.1-1' }}%</div>
              @if ((analytics()?.churn_rate || 0) > 0.05) {
                <div class="metric-warning">
                  <mat-icon>warning</mat-icon>
                  Above healthy threshold
                </div>
              }
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">Conversion Rate</div>
              <div class="metric-value small">{{ (analytics()?.conversion_rate || 0) * 100 | number:'1.1-1' }}%</div>
              <div class="metric-subtext">Free to Paid</div>
            </mat-card>
            <mat-card class="metric-card" [class.danger]="(analytics()?.failed_payments || 0) > 0">
              <div class="metric-label">Failed Payments</div>
              <div class="metric-value small">{{ analytics()?.failed_payments || 0 }}</div>
              @if ((analytics()?.failed_payments || 0) > 0) {
                <div class="metric-danger">
                  <mat-icon>error</mat-icon>
                  Needs attention
                </div>
              }
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">Pending Cancellations</div>
              <div class="metric-value small">{{ analytics()?.pending_cancellations || 0 }}</div>
            </mat-card>
          </div>
        </section>

        <!-- Plan Distribution -->
        <section class="metrics-section">
          <h2>
            <mat-icon>pie_chart</mat-icon>
            Plan Distribution
          </h2>
          <div class="distribution-grid">
            <mat-card class="distribution-card">
              <h3>Customers by Plan</h3>
              <mat-divider></mat-divider>
              <div class="distribution-list">
                @for (dist of planDistribution(); track dist.plan) {
                  <div class="distribution-row">
                    <span class="plan-name">{{ dist.plan | titlecase }}</span>
                    <div class="distribution-bar">
                      <div
                        class="bar-fill"
                        [style.width.%]="dist.percentage"
                        [class]="'plan-' + dist.plan"
                      ></div>
                    </div>
                    <span class="count">{{ dist.count }}</span>
                    <span class="percentage">{{ dist.percentage | number:'1.0-0' }}%</span>
                  </div>
                }
              </div>
            </mat-card>

            <mat-card class="distribution-card">
              <h3>Revenue by Plan</h3>
              <mat-divider></mat-divider>
              <div class="distribution-list">
                @for (dist of revenueDistribution(); track dist.plan) {
                  <div class="distribution-row">
                    <span class="plan-name">{{ dist.plan | titlecase }}</span>
                    <div class="distribution-bar">
                      <div
                        class="bar-fill"
                        [style.width.%]="dist.percentage"
                        [class]="'plan-' + dist.plan"
                      ></div>
                    </div>
                    <span class="revenue">{{ dist.revenue | currency }}</span>
                    <span class="percentage">{{ dist.percentage | number:'1.0-0' }}%</span>
                  </div>
                }
              </div>
            </mat-card>
          </div>
        </section>

        <!-- Coupon Stats -->
        <section class="metrics-section">
          <h2>
            <mat-icon>local_offer</mat-icon>
            Coupon Performance
          </h2>
          <div class="metrics-grid three-col">
            <mat-card class="metric-card">
              <div class="metric-label">Active Coupons</div>
              <div class="metric-value small">{{ analytics()?.active_coupons || 0 }}</div>
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">Total Redemptions</div>
              <div class="metric-value small">{{ analytics()?.coupon_redemptions || 0 }}</div>
            </mat-card>
            <mat-card class="metric-card">
              <div class="metric-label">Discount Given</div>
              <div class="metric-value small">{{ analytics()?.total_discounts || 0 | currency }}</div>
            </mat-card>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .analytics-page {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 32px;
    }

    .back-button {
      margin-top: 4px;
    }

    .header-content {
      flex: 1;
    }

    .page-header h1 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    :host-context(.dark) .page-header h1 {
      color: #f1f5f9; /* Slate 100 */
    }

    .subtitle {
      font-size: 1rem;
      color: #666;
      margin: 0;
    }

    :host-context(.dark) .subtitle {
      color: #94a3b8; /* Slate 400 */
    }

    .period-select {
      width: 180px;
    }

    ::ng-deep .period-select .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    :host-context(.dark) .loading-container {
      color: #94a3b8;
    }

    /* Sections */
    .metrics-section {
      margin-bottom: 32px;
    }

    .metrics-section h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 16px;
    }

    .metrics-section h2 mat-icon {
      font-size: 20px;
      color: #ff5900;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }

    .metrics-grid.three-col {
      grid-template-columns: repeat(3, 1fr);
    }

    .metrics-grid.four-col {
      grid-template-columns: repeat(4, 1fr);
    }

    .metric-card {
      padding: 24px;
      border-radius: 12px;
    }

    .metric-card.hero {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }

    .metric-card.warning {
      border: 2px solid #ff9800;
    }

    .metric-card.danger {
      border: 2px solid #f44336;
    }

    .metric-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      opacity: 0.8;
    }

    .metric-header mat-icon {
      font-size: 18px;
    }

    .metric-label {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 8px;
    }

    :host-context(.dark) .metric-label {
      color: #94a3b8; /* Slate 400 - visible on dark backgrounds */
    }

    .metric-card.hero .metric-label {
      color: rgba(255, 255, 255, 0.7);
    }

    .metric-value {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    :host-context(.dark) .metric-value {
      color: #f1f5f9; /* Slate 100 */
    }

    .metric-card.hero .metric-value {
      color: white;
    }

    .metric-value.small {
      font-size: 1.75rem;
    }

    .metric-change {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 0.85rem;
    }

    .metric-change.positive {
      color: #81c784;
    }

    .metric-change mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .metric-subtext {
      font-size: 0.8rem;
      color: #999;
      margin-top: 4px;
    }

    :host-context(.dark) .metric-subtext {
      color: #64748b; /* Slate 500 */
    }

    .metric-card.hero .metric-subtext {
      color: rgba(255, 255, 255, 0.6);
    }

    .metric-warning {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 0.75rem;
      color: #f57c00;
    }

    .metric-warning mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .metric-danger {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 0.75rem;
      color: #f44336;
    }

    .metric-danger mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    /* Distribution */
    .distribution-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    .distribution-card {
      border-radius: 12px;
      padding: 0;
      overflow: hidden;
    }

    .distribution-card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 0;
      padding: 16px 20px;
      color: #1a1a2e;
    }

    :host-context(.dark) .distribution-card h3 {
      color: #f1f5f9;
    }

    mat-divider {
      margin: 0;
    }

    .distribution-list {
      padding: 16px 20px;
    }

    .distribution-row {
      display: grid;
      grid-template-columns: 100px 1fr 60px 50px;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
    }

    .plan-name {
      font-weight: 500;
      color: #1a1a2e;
    }

    :host-context(.dark) .plan-name {
      color: #e2e8f0; /* Slate 200 */
    }

    .distribution-bar {
      height: 8px;
      background: #f0f0f0;
      border-radius: 4px;
      overflow: hidden;
    }

    :host-context(.dark) .distribution-bar {
      background: #334155; /* Slate 700 */
    }

    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.3s;
    }

    .bar-fill.plan-free {
      background: #9e9e9e;
    }

    .bar-fill.plan-starter {
      background: #2196f3;
    }

    .bar-fill.plan-team {
      background: #ff5900;
    }

    .bar-fill.plan-business {
      background: #9c27b0;
    }

    .bar-fill.plan-enterprise {
      background: #1a1a2e;
    }

    .count,
    .revenue {
      font-weight: 600;
      color: #1a1a2e;
      text-align: right;
    }

    :host-context(.dark) .count,
    :host-context(.dark) .revenue {
      color: #f1f5f9;
    }

    .percentage {
      color: #666;
      font-size: 0.85rem;
      text-align: right;
    }

    :host-context(.dark) .percentage {
      color: #94a3b8;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .metrics-grid.four-col {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 900px) {
      .metrics-grid,
      .distribution-grid {
        grid-template-columns: 1fr;
      }

      .metrics-grid.three-col {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 600px) {
      .analytics-page {
        padding: 16px;
      }

      .page-header {
        flex-wrap: wrap;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .metrics-grid.three-col,
      .metrics-grid.four-col {
        grid-template-columns: 1fr;
      }

      .metric-value {
        font-size: 2rem;
      }
    }
  `],
})
export class RevenueAnalyticsComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);

  loading = signal(true);
  analytics = signal<SuperAdminAnalytics | null>(null);
  selectedPeriod = '30d';

  // Mock data for plan distribution (would come from analytics)
  planDistribution = signal([
    { plan: 'free', count: 45, percentage: 45 },
    { plan: 'starter', count: 25, percentage: 25 },
    { plan: 'team', count: 20, percentage: 20 },
    { plan: 'business', count: 8, percentage: 8 },
    { plan: 'enterprise', count: 2, percentage: 2 },
  ]);

  revenueDistribution = signal([
    { plan: 'starter', revenue: 1500, percentage: 15 },
    { plan: 'team', revenue: 4000, percentage: 40 },
    { plan: 'business', revenue: 3500, percentage: 35 },
    { plan: 'enterprise', revenue: 1000, percentage: 10 },
  ]);

  ngOnInit(): void {
    this.loadAnalytics();
  }

  private loadAnalytics(): void {
    this.superAdminService.getAnalytics().subscribe({
      next: (data) => {
        this.analytics.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }
}
