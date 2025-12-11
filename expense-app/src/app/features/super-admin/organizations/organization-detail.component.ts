import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { SubscriptionService } from '../../../core/services/subscription.service';
import {
  SuperAdminOrganizationSummary,
  SubscriptionInvoice,
  SubscriptionAuditLog,
} from '../../../core/models/subscription.model';
import {
  ApplyDiscountDialogComponent,
  ApplyDiscountDialogData,
  ApplyDiscountDialogResult,
} from './apply-discount-dialog.component';
import {
  PauseSubscriptionDialogComponent,
  PauseSubscriptionDialogData,
  PauseSubscriptionDialogResult,
} from './pause-subscription-dialog.component';
import {
  IssueRefundDialogComponent,
  IssueRefundDialogData,
  IssueRefundDialogResult,
} from './issue-refund-dialog.component';

/**
 * Organization Detail Component (Super Admin)
 *
 * Shows billing details for a specific organization:
 * - Subscription info
 * - Invoice history
 * - User count
 * - Admin actions (discount, refund, pause)
 *
 * IMPORTANT: No expense/receipt data access
 */
@Component({
  selector: 'app-organization-detail',
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
    MatChipsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="org-detail-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          @if (loading()) {
            <h1>Loading...</h1>
          } @else {
            <h1>{{ organization()?.organization_name }}</h1>
            <div class="header-meta">
              <mat-chip [class]="'status-' + organization()?.status" size="small">
                {{ organization()?.status || 'Free' | titlecase }}
              </mat-chip>
              <span class="meta-divider">|</span>
              <span class="plan-name">{{ organization()?.plan_name || 'Free' | titlecase }} Plan</span>
            </div>
          }
        </div>
      </header>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading organization details...</p>
        </div>
      } @else {
        <div class="detail-content">
          <!-- Overview Cards -->
          <div class="overview-grid">
            <mat-card class="overview-card">
              <div class="card-icon">
                <mat-icon>paid</mat-icon>
              </div>
              <div class="card-content">
                <span class="card-value">{{ organization()?.mrr_cents! / 100 | currency }}/mo</span>
                <span class="card-label">Monthly Revenue</span>
              </div>
            </mat-card>

            <mat-card class="overview-card">
              <div class="card-icon">
                <mat-icon>people</mat-icon>
              </div>
              <div class="card-content">
                <span class="card-value">{{ organization()?.user_count }}</span>
                <span class="card-label">Team Members</span>
              </div>
            </mat-card>

            <mat-card class="overview-card">
              <div class="card-icon">
                <mat-icon>calendar_today</mat-icon>
              </div>
              <div class="card-content">
                <span class="card-value">{{ organization()?.created_at | date:'mediumDate' }}</span>
                <span class="card-label">Joined</span>
              </div>
            </mat-card>

            <mat-card class="overview-card">
              <div class="card-icon">
                <mat-icon>receipt</mat-icon>
              </div>
              <div class="card-content">
                <span class="card-value">{{ organization()?.total_lifetime_value! / 100 | currency }}</span>
                <span class="card-label">Lifetime Value</span>
              </div>
            </mat-card>
          </div>

          <!-- Main Content -->
          <div class="main-grid">
            <!-- Subscription Info -->
            <mat-card class="info-card">
              <div class="card-header">
                <h2>
                  <mat-icon>credit_card</mat-icon>
                  Subscription Details
                </h2>
              </div>
              <mat-divider></mat-divider>

              <div class="info-list">
                <div class="info-row">
                  <span class="info-label">Plan</span>
                  <span class="info-value">{{ organization()?.plan_name || 'Free' | titlecase }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Billing Cycle</span>
                  <span class="info-value">{{ organization()?.billing_cycle || 'N/A' | titlecase }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Status</span>
                  <mat-chip [class]="'status-' + organization()?.status" size="small">
                    {{ organization()?.status || 'Free' | titlecase }}
                  </mat-chip>
                </div>
                <div class="info-row">
                  <span class="info-label">Current Period End</span>
                  <span class="info-value">{{ organization()?.current_period_end | date:'mediumDate' }}</span>
                </div>
                @if (organization()?.discount_percent) {
                  <div class="info-row discount">
                    <span class="info-label">Active Discount</span>
                    <span class="info-value">{{ organization()?.discount_percent }}% off</span>
                  </div>
                }
                <div class="info-row">
                  <span class="info-label">Billing Email</span>
                  <span class="info-value">{{ organization()?.billing_email || 'Not set' }}</span>
                </div>
              </div>
            </mat-card>

            <!-- Admin Actions -->
            <mat-card class="actions-card">
              <div class="card-header">
                <h2>
                  <mat-icon>admin_panel_settings</mat-icon>
                  Admin Actions
                </h2>
              </div>
              <mat-divider></mat-divider>

              <div class="action-list">
                <button mat-stroked-button class="action-btn" (click)="showDiscountDialog()">
                  <mat-icon>discount</mat-icon>
                  <span>Apply Discount</span>
                </button>

                <button mat-stroked-button class="action-btn" (click)="showRefundDialog()">
                  <mat-icon>money_off</mat-icon>
                  <span>Issue Refund</span>
                </button>

                @if (organization()?.status === 'active') {
                  <button mat-stroked-button class="action-btn warning" (click)="pauseSubscription()">
                    <mat-icon>pause_circle</mat-icon>
                    <span>Pause Subscription</span>
                  </button>
                } @else if (organization()?.status === 'paused') {
                  <button mat-stroked-button class="action-btn success" (click)="resumeSubscription()">
                    <mat-icon>play_circle</mat-icon>
                    <span>Resume Subscription</span>
                  </button>
                }

                <button mat-stroked-button class="action-btn" (click)="extendTrial()">
                  <mat-icon>more_time</mat-icon>
                  <span>Extend Trial</span>
                </button>
              </div>

              <div class="action-note">
                <mat-icon>info</mat-icon>
                <span>All actions are logged in the audit trail</span>
              </div>
            </mat-card>
          </div>

          <!-- Invoices -->
          <mat-card class="invoices-card">
            <div class="card-header">
              <h2>
                <mat-icon>description</mat-icon>
                Invoice History
              </h2>
            </div>
            <mat-divider></mat-divider>

            @if (invoices().length === 0) {
              <div class="empty-state">
                <mat-icon>receipt_long</mat-icon>
                <p>No invoices yet</p>
              </div>
            } @else {
              <div class="invoice-list">
                @for (invoice of invoices(); track invoice.id) {
                  <div class="invoice-row">
                    <div class="invoice-info">
                      <span class="invoice-date">{{ invoice.invoice_date | date:'mediumDate' }}</span>
                      <span class="invoice-id">#{{ invoice.stripe_invoice_id?.slice(-8) }}</span>
                    </div>
                    <div class="invoice-amount">
                      {{ invoice.amount_cents / 100 | currency }}
                    </div>
                    <mat-chip [class]="'status-' + invoice.status" size="small">
                      {{ invoice.status | titlecase }}
                    </mat-chip>
                    @if (invoice.invoice_pdf_url) {
                      <a [href]="invoice.invoice_pdf_url" target="_blank" mat-icon-button>
                        <mat-icon>download</mat-icon>
                      </a>
                    }
                  </div>
                }
              </div>
            }
          </mat-card>

          <!-- Activity Log -->
          <mat-card class="activity-card">
            <div class="card-header">
              <h2>
                <mat-icon>history</mat-icon>
                Activity Log
              </h2>
            </div>
            <mat-divider></mat-divider>

            @if (auditLog().length === 0) {
              <div class="empty-state">
                <mat-icon>history</mat-icon>
                <p>No activity recorded</p>
              </div>
            } @else {
              <div class="activity-list">
                @for (log of auditLog(); track log.id) {
                  <div class="activity-row">
                    <div class="activity-icon" [class]="getActionClass(log.action)">
                      <mat-icon>{{ getActionIcon(log.action) }}</mat-icon>
                    </div>
                    <div class="activity-info">
                      <span class="activity-action">{{ formatAction(log.action) }}</span>
                      <span class="activity-time">{{ log.created_at | date:'short' }}</span>
                    </div>
                    @if (log.amount_cents) {
                      <span class="activity-amount">{{ log.amount_cents / 100 | currency }}</span>
                    }
                  </div>
                }
              </div>
            }
          </mat-card>

          <!-- Privacy Notice -->
          <div class="privacy-notice">
            <mat-icon>visibility_off</mat-icon>
            <p>
              Expense and receipt data for this organization is not accessible.
              Only billing information is shown.
            </p>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .org-detail-page {
      padding: 24px;
      max-width: 1200px;
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

    .page-header h1 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .header-meta {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .meta-divider {
      color: #ccc;
    }

    .plan-name {
      font-size: 0.9rem;
      color: #666;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    /* Overview Grid */
    .overview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }

    .overview-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      border-radius: 12px;
    }

    .card-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(255, 89, 0, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card-icon mat-icon {
      font-size: 24px;
      color: #ff5900;
    }

    .card-content {
      display: flex;
      flex-direction: column;
    }

    .card-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .card-label {
      font-size: 0.8rem;
      color: #666;
    }

    /* Main Grid */
    .main-grid {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }

    mat-card {
      border-radius: 12px;
    }

    .card-header {
      padding: 16px 20px;
    }

    .card-header h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      margin: 0;
      color: #1a1a2e;
    }

    .card-header mat-icon {
      color: #ff5900;
    }

    mat-divider {
      margin: 0;
    }

    /* Info List */
    .info-list {
      padding: 8px 0;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 20px;
      border-bottom: 1px solid #f5f5f5;
    }

    .info-row:last-child {
      border-bottom: none;
    }

    .info-row.discount {
      background: #e8f5e9;
    }

    .info-label {
      font-size: 0.9rem;
      color: #666;
    }

    .info-value {
      font-weight: 500;
      color: #1a1a2e;
    }

    /* Actions */
    .action-list {
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: flex-start;
      padding: 12px 16px;
      height: auto;
    }

    .action-btn.warning {
      color: #f57c00;
      border-color: #f57c00;
    }

    .action-btn.success {
      color: #4caf50;
      border-color: #4caf50;
    }

    .action-note {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: #fafafa;
      font-size: 0.8rem;
      color: #666;
    }

    .action-note mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Invoices */
    .invoices-card,
    .activity-card {
      margin-bottom: 24px;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px;
      color: #999;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 8px;
    }

    .invoice-list,
    .activity-list {
      padding: 8px 0;
    }

    .invoice-row {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 12px 20px;
      border-bottom: 1px solid #f5f5f5;
    }

    .invoice-row:last-child {
      border-bottom: none;
    }

    .invoice-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .invoice-date {
      font-weight: 500;
      color: #1a1a2e;
    }

    .invoice-id {
      font-size: 0.75rem;
      color: #999;
      font-family: monospace;
    }

    .invoice-amount {
      font-weight: 600;
      font-family: monospace;
    }

    /* Activity */
    .activity-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid #f5f5f5;
    }

    .activity-row:last-child {
      border-bottom: none;
    }

    .activity-icon {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f5f5f5;
    }

    .activity-icon mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #666;
    }

    .activity-icon.payment {
      background: #e8f5e9;
    }

    .activity-icon.payment mat-icon {
      color: #4caf50;
    }

    .activity-icon.refund {
      background: #ffebee;
    }

    .activity-icon.refund mat-icon {
      color: #f44336;
    }

    .activity-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .activity-action {
      font-weight: 500;
      color: #1a1a2e;
    }

    .activity-time {
      font-size: 0.75rem;
      color: #999;
    }

    .activity-amount {
      font-weight: 600;
      font-family: monospace;
    }

    /* Status Chips */
    .status-active, .status-paid {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-past_due, .status-failed {
      background: #ffebee !important;
      color: #c62828 !important;
    }

    .status-canceled {
      background: #f5f5f5 !important;
      color: #666 !important;
    }

    .status-trialing, .status-pending {
      background: #e3f2fd !important;
      color: #1565c0 !important;
    }

    /* Privacy Notice */
    .privacy-notice {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .privacy-notice mat-icon {
      color: #666;
    }

    .privacy-notice p {
      margin: 0;
      font-size: 0.9rem;
      color: #666;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .org-detail-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .overview-grid {
        grid-template-columns: 1fr 1fr;
      }
    }
  `],
})
export class OrganizationDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private superAdminService = inject(SuperAdminService);
  private subscriptionService = inject(SubscriptionService);
  private dialog = inject(MatDialog);

  loading = signal(true);
  organization = signal<SuperAdminOrganizationSummary | null>(null);
  invoices = signal<SubscriptionInvoice[]>([]);
  auditLog = signal<SubscriptionAuditLog[]>([]);

  ngOnInit(): void {
    const orgId = this.route.snapshot.paramMap.get('id');
    if (orgId) {
      this.loadOrganization(orgId);
    }
  }

  private loadOrganization(orgId: string): void {
    this.superAdminService.getOrganizationDetails(orgId).subscribe({
      next: (org) => {
        this.organization.set(org);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });

    // Load invoices
    this.subscriptionService.getInvoices(orgId, 10).subscribe({
      next: (invoices) => this.invoices.set(invoices),
    });

    // Load audit log
    this.superAdminService.getAuditLog({ organizationId: orgId, limit: 10 }).subscribe({
      next: (logs) => this.auditLog.set(logs),
    });
  }

  showDiscountDialog(): void {
    const org = this.organization();
    if (!org) return;

    const dialogData: ApplyDiscountDialogData = {
      organizationName: org.organization_name,
      organizationId: org.organization_id,
      currentDiscount: org.discount_percent || undefined,
    };

    const dialogRef = this.dialog.open(ApplyDiscountDialogComponent, {
      data: dialogData,
      width: '450px',
    });

    dialogRef.afterClosed().subscribe((result: ApplyDiscountDialogResult | undefined) => {
      if (result) {
        this.superAdminService
          .applyDiscount({
            organization_id: org.organization_id,
            discount_percent: result.discount_percent,
            reason: result.reason,
          })
          .subscribe({
            next: () => this.loadOrganization(org.organization_id),
          });
      }
    });
  }

  showRefundDialog(): void {
    const org = this.organization();
    if (!org) return;

    const dialogData: IssueRefundDialogData = {
      organizationName: org.organization_name,
      organizationId: org.organization_id,
    };

    const dialogRef = this.dialog.open(IssueRefundDialogComponent, {
      data: dialogData,
      width: '450px',
    });

    dialogRef.afterClosed().subscribe((result: IssueRefundDialogResult | undefined) => {
      if (result) {
        this.superAdminService
          .issueRefund({
            organization_id: org.organization_id,
            amount_cents: result.amount_cents,
            reason: result.reason,
          })
          .subscribe({
            next: () => this.loadOrganization(org.organization_id),
          });
      }
    });
  }

  pauseSubscription(): void {
    const org = this.organization();
    if (!org) return;

    const dialogData: PauseSubscriptionDialogData = {
      organizationName: org.organization_name,
      organizationId: org.organization_id,
      currentPlan: org.plan_name,
    };

    const dialogRef = this.dialog.open(PauseSubscriptionDialogComponent, {
      data: dialogData,
      width: '450px',
    });

    dialogRef.afterClosed().subscribe((result: PauseSubscriptionDialogResult | undefined) => {
      if (result) {
        this.superAdminService.pauseSubscription(org.organization_id, result.reason).subscribe({
          next: () => this.loadOrganization(org.organization_id),
        });
      }
    });
  }

  resumeSubscription(): void {
    const org = this.organization();
    if (org) {
      this.superAdminService.resumeSubscription(org.organization_id, 'Admin resumed').subscribe({
        next: () => this.loadOrganization(org.organization_id),
      });
    }
  }

  extendTrial(): void {
    alert('Trial extension feature coming soon');
  }

  getActionIcon(action: string): string {
    const icons: Record<string, string> = {
      payment_received: 'paid',
      payment_failed: 'error',
      refund_issued: 'money_off',
      subscription_created: 'add_circle',
      subscription_updated: 'edit',
      subscription_canceled: 'cancel',
      coupon_applied: 'local_offer',
      plan_changed: 'swap_horiz',
    };
    return icons[action] || 'info';
  }

  getActionClass(action: string): string {
    if (action.includes('payment') && !action.includes('failed')) return 'payment';
    if (action.includes('refund')) return 'refund';
    return '';
  }

  formatAction(action: string): string {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
