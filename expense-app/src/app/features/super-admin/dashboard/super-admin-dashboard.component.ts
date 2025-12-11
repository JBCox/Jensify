import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import {
  SuperAdminAnalytics,
  SuperAdminOrganizationSummary,
  SubscriptionAuditLog,
} from '../../../core/models/subscription.model';

/**
 * Super Admin Dashboard
 *
 * Platform-level overview showing:
 * - Key revenue metrics (MRR, ARR, customers)
 * - Recent activity
 * - Quick actions
 * - System health indicators
 *
 * IMPORTANT: No access to customer expense/receipt data
 */
@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    MatMenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin-dashboard">
      <!-- Header -->
      <header class="dashboard-header">
        <div class="header-content">
          <div class="header-left">
            <h1>Super Admin Dashboard</h1>
            <p class="subtitle">Platform-level management for Expensed</p>
          </div>
          <div class="header-actions">
            <button mat-stroked-button routerLink="organizations">
              <mat-icon>business</mat-icon>
              View Organizations
            </button>
            <button mat-flat-button color="primary" routerLink="coupons/new">
              <mat-icon>add</mat-icon>
              Create Coupon
            </button>
          </div>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading dashboard...</p>
        </div>
      } @else {
        <!-- Key Metrics -->
        <section class="metrics-section">
          <h2 class="section-title">Revenue Metrics</h2>
          <div class="metrics-grid">
            <mat-card class="metric-card primary">
              <div class="metric-icon">
                <mat-icon>attach_money</mat-icon>
              </div>
              <div class="metric-content">
                <span class="metric-value">{{ (analytics()?.mrr?.total_mrr_cents || 0) / 100 | currency }}</span>
                <span class="metric-label">Monthly Recurring Revenue</span>
              </div>
              <div class="metric-change positive">
                <mat-icon>trending_up</mat-icon>
                <span>+{{ analytics()?.mrr_growth || 0 }}%</span>
              </div>
            </mat-card>

            <mat-card class="metric-card">
              <div class="metric-icon">
                <mat-icon>calendar_today</mat-icon>
              </div>
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.arr || 0 | currency }}</span>
                <span class="metric-label">Annual Recurring Revenue</span>
              </div>
            </mat-card>

            <mat-card class="metric-card">
              <div class="metric-icon">
                <mat-icon>business</mat-icon>
              </div>
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.total_organizations || 0 }}</span>
                <span class="metric-label">Total Organizations</span>
              </div>
              <div class="metric-breakdown">
                <span>{{ analytics()?.paying_organizations || 0 }} paying</span>
              </div>
            </mat-card>

            <mat-card class="metric-card">
              <div class="metric-icon">
                <mat-icon>people</mat-icon>
              </div>
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.total_users || 0 }}</span>
                <span class="metric-label">Total Users</span>
              </div>
            </mat-card>
          </div>
        </section>

        <!-- Secondary Metrics -->
        <section class="metrics-section">
          <h2 class="section-title">Health Indicators</h2>
          <div class="metrics-grid small">
            <mat-card class="metric-card small">
              <div class="metric-content">
                <span class="metric-value">{{ (analytics()?.conversion_rate || 0) * 100 | number:'1.1-1' }}%</span>
                <span class="metric-label">Conversion Rate</span>
              </div>
            </mat-card>

            <mat-card class="metric-card small">
              <div class="metric-content">
                <span class="metric-value">{{ (analytics()?.churn_rate || 0) * 100 | number:'1.1-1' }}%</span>
                <span class="metric-label">Monthly Churn</span>
              </div>
            </mat-card>

            <mat-card class="metric-card small">
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.average_revenue_per_org || 0 | currency }}</span>
                <span class="metric-label">ARPO</span>
              </div>
            </mat-card>

            <mat-card class="metric-card small">
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.active_coupons || 0 }}</span>
                <span class="metric-label">Active Coupons</span>
              </div>
            </mat-card>

            <mat-card class="metric-card small">
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.failed_payments || 0 }}</span>
                <span class="metric-label">Failed Payments</span>
              </div>
            </mat-card>

            <mat-card class="metric-card small">
              <div class="metric-content">
                <span class="metric-value">{{ analytics()?.pending_cancellations || 0 }}</span>
                <span class="metric-label">Pending Cancellations</span>
              </div>
            </mat-card>
          </div>
        </section>

        <div class="dashboard-grid">
          <!-- Recent Organizations -->
          <mat-card class="recent-card">
            <div class="card-header">
              <h3>
                <mat-icon>business</mat-icon>
                Recent Organizations
              </h3>
              <a mat-button routerLink="organizations">View All</a>
            </div>
            <mat-divider></mat-divider>

            @if (recentOrganizations().length === 0) {
              <div class="empty-state">
                <mat-icon>business</mat-icon>
                <p>No organizations yet</p>
              </div>
            } @else {
              <div class="list-container">
                @for (org of recentOrganizations().slice(0, 5); track org.organization_id) {
                  <div class="list-item" [routerLink]="['organizations', org.organization_id]">
                    <div class="item-info">
                      <span class="item-name">{{ org.organization_name }}</span>
                      <span class="item-detail">{{ org.user_count }} users</span>
                    </div>
                    <div class="item-meta">
                      <mat-chip size="small" [class]="'status-' + org.status">
                        {{ org.plan_name || 'Free' }}
                      </mat-chip>
                      <span class="item-mrr">{{ (org.mrr_cents || 0) / 100 | currency }}/mo</span>
                    </div>
                  </div>
                }
              </div>
            }
          </mat-card>

          <!-- Recent Activity -->
          <mat-card class="recent-card">
            <div class="card-header">
              <h3>
                <mat-icon>history</mat-icon>
                Recent Activity
              </h3>
              <a mat-button routerLink="audit-log">View All</a>
            </div>
            <mat-divider></mat-divider>

            @if (recentActivity().length === 0) {
              <div class="empty-state">
                <mat-icon>history</mat-icon>
                <p>No activity yet</p>
              </div>
            } @else {
              <div class="list-container">
                @for (log of recentActivity().slice(0, 5); track log.id) {
                  <div class="list-item activity-item">
                    <div class="activity-icon" [class]="'action-' + getActionType(log.action)">
                      <mat-icon>{{ getActionIcon(log.action) }}</mat-icon>
                    </div>
                    <div class="item-info">
                      <span class="item-name">{{ formatAction(log.action) }}</span>
                      <span class="item-detail">{{ log.created_at | date:'short' }}</span>
                    </div>
                    @if (log.amount_cents) {
                      <span class="activity-amount">{{ log.amount_cents / 100 | currency }}</span>
                    }
                  </div>
                }
              </div>
            }
          </mat-card>
        </div>

        <!-- Quick Actions -->
        <section class="quick-actions">
          <h2 class="section-title">Quick Actions</h2>
          <div class="actions-grid">
            <button mat-stroked-button routerLink="organizations" class="action-btn">
              <mat-icon>business</mat-icon>
              <span>View Organizations</span>
            </button>
            <button mat-stroked-button routerLink="coupons" class="action-btn">
              <mat-icon>local_offer</mat-icon>
              <span>Manage Coupons</span>
            </button>
            <button mat-stroked-button routerLink="analytics" class="action-btn">
              <mat-icon>analytics</mat-icon>
              <span>View Analytics</span>
            </button>
            <button mat-stroked-button routerLink="audit-log" class="action-btn">
              <mat-icon>history</mat-icon>
              <span>Audit Log</span>
            </button>
          </div>
        </section>

        <!-- Privacy Notice -->
        <div class="privacy-notice">
          <mat-icon>security</mat-icon>
          <p>
            <strong>Privacy by Design:</strong> As a Super Admin, you can only view
            billing and subscription data. Customer expense/receipt data is not accessible.
          </p>
        </div>
      }
    </div>
  `,
  styles: [`
    .admin-dashboard {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
      background: transparent;
      min-height: 100vh;
    }

    /* Header */
    .dashboard-header {
      margin-bottom: 32px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
    }

    .header-content h1 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .subtitle {
      font-size: 1rem;
      color: var(--jensify-text-secondary, #666);
      margin: 0;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: var(--jensify-text-secondary, #666);
    }

    /* Sections */
    .section-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--jensify-text-secondary, #666);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 16px;
    }

    .metrics-section {
      margin-bottom: 32px;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .metrics-grid.small {
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    }

    .metric-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
      position: relative;
      background: var(--jensify-surface-card);
      border: 1px solid var(--jensify-border-subtle);
    }

    .metric-card.primary {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }

    .metric-card.small {
      padding: 16px;
    }

    .metric-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(255, 89, 0, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .metric-card.primary .metric-icon {
      background: rgba(255, 255, 255, 0.1);
    }

    .metric-icon mat-icon {
      font-size: 24px;
      color: #ff5900;
    }

    .metric-card.primary .metric-icon mat-icon {
      color: white;
    }

    .metric-content {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .metric-value {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .metric-card.primary .metric-value {
      color: rgba(255, 255, 255, 0.95);
    }

    .metric-card.small .metric-value {
      font-size: 1.25rem;
    }

    .metric-label {
      font-size: 0.85rem;
      color: var(--jensify-text-secondary, #666);
    }

    .metric-card.primary .metric-label {
      color: rgba(255, 255, 255, 0.85);
    }

    .metric-change {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .metric-change.positive {
      color: #4caf50;
    }

    .metric-change.negative {
      color: #f44336;
    }

    .metric-card.primary .metric-change.positive {
      color: #81c784;
    }

    .metric-change mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .metric-breakdown {
      font-size: 0.8rem;
      color: var(--jensify-text-secondary, #666);
    }

    .metric-card.primary .metric-breakdown {
      color: rgba(255, 255, 255, 0.75);
    }

    /* Dashboard Grid */
    .dashboard-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .recent-card {
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
      background: var(--jensify-surface-card);
      border: 1px solid var(--jensify-border-subtle);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
    }

    .card-header h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      margin: 0;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .card-header mat-icon {
      color: #ff5900;
    }

    mat-divider {
      margin: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px;
      color: var(--jensify-text-secondary, #666);
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 8px;
    }

    .list-container {
      padding: 8px 0;
    }

    .list-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .list-item:hover {
      background: var(--jensify-surface-hover, rgba(0, 0, 0, 0.04));
    }

    .item-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .item-name {
      font-weight: 500;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .item-detail {
      font-size: 0.8rem;
      color: var(--jensify-text-secondary, #666);
    }

    .item-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .item-mrr {
      font-weight: 600;
      color: var(--jensify-text-primary, #1a1a2e);
      font-family: 'SF Mono', monospace;
    }

    .status-active {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-past_due {
      background: #ffebee !important;
      color: #c62828 !important;
    }

    .status-trialing {
      background: #e3f2fd !important;
      color: #1565c0 !important;
    }

    /* Activity Items */
    .activity-item {
      gap: 12px;
    }

    .activity-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--jensify-surface-hover, rgba(0, 0, 0, 0.06));
    }

    .activity-icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--jensify-text-secondary, #666);
    }

    .activity-icon.action-payment {
      background: rgba(76, 175, 80, 0.15);
    }

    .activity-icon.action-payment mat-icon {
      color: #4caf50;
    }

    .activity-icon.action-refund {
      background: rgba(244, 67, 54, 0.15);
    }

    .activity-icon.action-refund mat-icon {
      color: #f44336;
    }

    .activity-icon.action-subscription {
      background: rgba(25, 118, 210, 0.15);
    }

    .activity-icon.action-subscription mat-icon {
      color: #1976d2;
    }

    .activity-amount {
      font-weight: 600;
      color: var(--jensify-text-primary, #1a1a2e);
      font-family: 'SF Mono', monospace;
    }

    /* Quick Actions */
    .quick-actions {
      margin-bottom: 32px;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .action-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 24px;
      height: auto;
      border-radius: 12px;
    }

    .action-btn mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: #ff5900;
    }

    .action-btn span {
      font-size: 0.9rem;
      font-weight: 500;
    }

    /* Privacy Notice */
    .privacy-notice {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
      background: rgba(76, 175, 80, 0.1);
      border-radius: 12px;
      border: 1px solid rgba(76, 175, 80, 0.3);
    }

    .privacy-notice mat-icon {
      font-size: 24px;
      color: #4caf50;
    }

    .privacy-notice p {
      margin: 0;
      font-size: 0.9rem;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .privacy-notice strong {
      color: #4caf50;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .header-content {
        flex-direction: column;
      }

      .dashboard-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .admin-dashboard {
        padding: 16px;
      }

      .header-content h1 {
        font-size: 1.5rem;
      }

      .header-actions {
        flex-direction: column;
        width: 100%;
      }

      .header-actions button {
        width: 100%;
      }

      .metrics-grid {
        grid-template-columns: 1fr;
      }
    }

    /* Light mode - cards blend with page background */
    :host-context(html:not(.dark)) {
      .metric-card:not(.primary),
      .recent-card {
        background: var(--jensify-surface-soft);
      }
    }
  `],
})
export class SuperAdminDashboardComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);

  loading = signal(true);
  analytics = signal<SuperAdminAnalytics | null>(null);
  recentOrganizations = signal<SuperAdminOrganizationSummary[]>([]);
  recentActivity = signal<SubscriptionAuditLog[]>([]);

  ngOnInit(): void {
    this.loadDashboard();
  }

  private loadDashboard(): void {
    // Load analytics
    this.superAdminService.getAnalytics().subscribe({
      next: (data) => {
        this.analytics.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });

    // Load recent organizations
    this.superAdminService.getAllOrganizations({ limit: 5 }).subscribe({
      next: ({ organizations }) => {
        this.recentOrganizations.set(organizations);
      },
    });

    // Load recent activity
    this.superAdminService.getAuditLog({ limit: 5 }).subscribe({
      next: (logs) => {
        this.recentActivity.set(logs);
      },
    });
  }

  getActionIcon(action: string): string {
    const icons: Record<string, string> = {
      subscription_created: 'add_circle',
      subscription_updated: 'edit',
      subscription_canceled: 'cancel',
      payment_received: 'paid',
      payment_failed: 'error',
      refund_issued: 'money_off',
      coupon_applied: 'local_offer',
      plan_changed: 'swap_horiz',
    };
    return icons[action] || 'info';
  }

  getActionType(action: string): string {
    if (action.includes('payment') || action.includes('refund')) return 'payment';
    if (action.includes('subscription') || action.includes('plan')) return 'subscription';
    return 'default';
  }

  formatAction(action: string): string {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
