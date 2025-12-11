import { Component, ChangeDetectionStrategy, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { FeatureGateService } from '../../../core/services/feature-gate.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  OrganizationSubscription,
  SubscriptionInvoice,
  SubscriptionPlan,
} from '../../../core/models/subscription.model';

/**
 * Billing Overview Component
 *
 * Main billing dashboard showing:
 * - Current plan and status
 * - Usage metrics (receipts, users)
 * - Next invoice preview
 * - Quick actions (upgrade, manage payment, view invoices)
 */
@Component({
  selector: 'app-billing-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatMenuModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="billing-page">
      <header class="page-header">
        <div class="header-content">
          <h1>Billing & Subscription</h1>
          <p class="subtitle">Manage your subscription, view invoices, and update payment methods</p>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading billing information...</p>
        </div>
      } @else {
        <div class="billing-content">
          <!-- Current Plan Card -->
          <mat-card class="plan-card">
            <div class="card-header">
              <div class="header-left">
                <mat-icon class="card-icon">credit_card</mat-icon>
                <h2>Current Plan</h2>
              </div>
              @if (subscription()?.cancel_at_period_end) {
                <mat-chip class="status-chip canceling">Canceling</mat-chip>
              } @else if (subscription()?.status === 'active') {
                <mat-chip class="status-chip active">Active</mat-chip>
              } @else if (subscription()?.status === 'past_due') {
                <mat-chip class="status-chip past-due">Past Due</mat-chip>
              } @else if (subscription()?.status === 'trialing') {
                <mat-chip class="status-chip trial">Trial</mat-chip>
              } @else {
                <mat-chip class="status-chip">{{ subscription()?.status || 'Free' }}</mat-chip>
              }
            </div>

            <mat-divider></mat-divider>

            <div class="plan-details">
              <div class="plan-info">
                <h3 class="plan-name">{{ subscription()?.plan?.display_name || 'Free Plan' }}</h3>
                <p class="plan-description">
                  {{ subscription()?.plan?.description || 'Basic expense tracking for small teams' }}
                </p>
              </div>

              <div class="plan-pricing">
                @if (isPaidPlan()) {
                  <div class="price">
                    <span class="amount">{{ formatPrice(subscription()?.plan) }}</span>
                    <span class="period">/{{ subscription()?.billing_cycle === 'annual' ? 'year' : 'month' }}</span>
                  </div>
                  <p class="billing-date">
                    Next billing: {{ subscription()?.current_period_end | date:'mediumDate' }}
                  </p>
                } @else {
                  <div class="price free">
                    <span class="amount">$0</span>
                    <span class="period">forever</span>
                  </div>
                  <p class="upgrade-cta">
                    <a routerLink="plans">Upgrade for more features</a>
                  </p>
                }
              </div>
            </div>

            <div class="plan-actions">
              @if (isPaidPlan()) {
                <button mat-stroked-button routerLink="plans">
                  <mat-icon>swap_horiz</mat-icon>
                  Change Plan
                </button>
                <button mat-stroked-button (click)="openStripePortal()">
                  <mat-icon>open_in_new</mat-icon>
                  Manage in Stripe
                </button>
                @if (!subscription()?.cancel_at_period_end) {
                  <button mat-stroked-button color="warn" (click)="cancelSubscription()">
                    <mat-icon>cancel</mat-icon>
                    Cancel Plan
                  </button>
                } @else {
                  <button mat-stroked-button color="primary" (click)="resumeSubscription()">
                    <mat-icon>restore</mat-icon>
                    Resume Plan
                  </button>
                }
              } @else {
                <button mat-flat-button color="primary" routerLink="plans">
                  <mat-icon>upgrade</mat-icon>
                  Upgrade Now
                </button>
              }
            </div>

            @if (subscription()?.cancel_at_period_end) {
              <div class="cancel-notice">
                <mat-icon>info</mat-icon>
                <p>
                  Your subscription will be canceled on {{ subscription()?.current_period_end | date:'mediumDate' }}.
                  You'll retain access until then.
                </p>
              </div>
            }
          </mat-card>

          <!-- Usage Card -->
          <mat-card class="usage-card">
            <div class="card-header">
              <div class="header-left">
                <mat-icon class="card-icon">analytics</mat-icon>
                <h2>Usage This Month</h2>
              </div>
              <button mat-icon-button matTooltip="Usage resets on the 1st of each month">
                <mat-icon>help_outline</mat-icon>
              </button>
            </div>

            <mat-divider></mat-divider>

            <div class="usage-grid">
              <!-- Receipts Usage -->
              <div class="usage-item">
                <div class="usage-header">
                  <mat-icon>receipt_long</mat-icon>
                  <span>Receipts</span>
                </div>
                <div class="usage-bar-container">
                  <mat-progress-bar
                    [mode]="'determinate'"
                    [value]="receiptUsagePercent()"
                    [class.warning]="receiptUsagePercent() > 80"
                    [class.danger]="receiptUsagePercent() >= 100"
                  ></mat-progress-bar>
                </div>
                <div class="usage-numbers">
                  @if (receiptLimit() === null) {
                    <span class="used">{{ receiptUsed() }} used</span>
                    <span class="limit unlimited">Unlimited</span>
                  } @else {
                    <span class="used">{{ receiptUsed() }} / {{ receiptLimit() }}</span>
                    <span class="remaining" [class.low]="receiptRemaining() < 3">
                      {{ receiptRemaining() }} remaining
                    </span>
                  }
                </div>
                @if (receiptUsagePercent() >= 80 && receiptLimit() !== null) {
                  <div class="usage-warning">
                    <mat-icon>warning</mat-icon>
                    <span>Approaching limit. <a routerLink="plans">Upgrade</a> for unlimited receipts.</span>
                  </div>
                }
              </div>

              <!-- Users Usage -->
              <div class="usage-item">
                <div class="usage-header">
                  <mat-icon>people</mat-icon>
                  <span>Team Members</span>
                </div>
                <div class="usage-bar-container">
                  <mat-progress-bar
                    [mode]="'determinate'"
                    [value]="userUsagePercent()"
                    [class.warning]="userUsagePercent() > 80"
                    [class.danger]="userUsagePercent() >= 100"
                  ></mat-progress-bar>
                </div>
                <div class="usage-numbers">
                  @if (userLimit() === null) {
                    <span class="used">{{ userCount() }} members</span>
                    <span class="limit unlimited">Unlimited</span>
                  } @else {
                    <span class="used">{{ userCount() }} / {{ userLimit() }}</span>
                    <span class="remaining" [class.low]="userRemaining() < 2">
                      {{ userRemaining() }} slots left
                    </span>
                  }
                </div>
              </div>
            </div>
          </mat-card>

          <!-- Features Card -->
          <mat-card class="features-card">
            <div class="card-header">
              <div class="header-left">
                <mat-icon class="card-icon">verified</mat-icon>
                <h2>Plan Features</h2>
              </div>
            </div>

            <mat-divider></mat-divider>

            <div class="features-grid">
              <div class="feature-item" [class.enabled]="isPaidPlan()">
                <mat-icon class="feature-icon">{{ isPaidPlan() ? 'check_circle' : 'remove_circle_outline' }}</mat-icon>
                <span>Stripe ACH Payouts</span>
              </div>
              <div class="feature-item" [class.enabled]="isPaidPlan()">
                <mat-icon class="feature-icon">{{ isPaidPlan() ? 'check_circle' : 'remove_circle_outline' }}</mat-icon>
                <span>GPS Mileage Tracking</span>
              </div>
              <div class="feature-item" [class.enabled]="isPaidPlan()">
                <mat-icon class="feature-icon">{{ isPaidPlan() ? 'check_circle' : 'remove_circle_outline' }}</mat-icon>
                <span>Multi-Level Approvals</span>
              </div>
              <div class="feature-item" [class.enabled]="isPaidPlan()">
                <mat-icon class="feature-icon">{{ isPaidPlan() ? 'check_circle' : 'remove_circle_outline' }}</mat-icon>
                <span>API Access</span>
              </div>
              <div class="feature-item enabled">
                <mat-icon class="feature-icon">check_circle</mat-icon>
                <span>OCR Receipt Scanning</span>
              </div>
              <div class="feature-item enabled">
                <mat-icon class="feature-icon">check_circle</mat-icon>
                <span>Expense Reports</span>
              </div>
            </div>

            @if (!isPaidPlan()) {
              <div class="upgrade-prompt">
                <p>Unlock all features with a paid plan</p>
                <button mat-flat-button color="primary" routerLink="plans">
                  View Plans
                </button>
              </div>
            }
          </mat-card>

          <!-- Recent Invoices Card -->
          <mat-card class="invoices-card">
            <div class="card-header">
              <div class="header-left">
                <mat-icon class="card-icon">description</mat-icon>
                <h2>Recent Invoices</h2>
              </div>
              <a mat-button routerLink="invoices" class="view-all">
                View All
                <mat-icon>arrow_forward</mat-icon>
              </a>
            </div>

            <mat-divider></mat-divider>

            @if (invoices().length === 0) {
              <div class="empty-invoices">
                <mat-icon>receipt_long</mat-icon>
                <p>No invoices yet</p>
                <span class="subtext">Invoices will appear here after your first payment</span>
              </div>
            } @else {
              <div class="invoice-list">
                @for (invoice of invoices().slice(0, 3); track invoice.id) {
                  <div class="invoice-row">
                    <div class="invoice-info">
                      <span class="invoice-date">{{ invoice.invoice_date | date:'mediumDate' }}</span>
                      <span class="invoice-id">#{{ invoice.stripe_invoice_id?.slice(-8) }}</span>
                    </div>
                    <div class="invoice-amount">
                      {{ invoice.amount_cents / 100 | currency }}
                    </div>
                    <div class="invoice-status">
                      <mat-chip [class]="'status-' + invoice.status" size="small">
                        {{ invoice.status }}
                      </mat-chip>
                    </div>
                    <div class="invoice-action">
                      @if (invoice.invoice_pdf_url) {
                        <a [href]="invoice.invoice_pdf_url" target="_blank" mat-icon-button matTooltip="Download PDF">
                          <mat-icon>download</mat-icon>
                        </a>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          </mat-card>

          <!-- Payment Method Card -->
          <mat-card class="payment-card">
            <div class="card-header">
              <div class="header-left">
                <mat-icon class="card-icon">payment</mat-icon>
                <h2>Payment Method</h2>
              </div>
            </div>

            <mat-divider></mat-divider>

            @if (isPaidPlan()) {
              <div class="payment-info">
                <div class="card-display">
                  <mat-icon class="card-brand">credit_card</mat-icon>
                  <div class="card-details">
                    <span class="card-number">•••• •••• •••• ****</span>
                    <span class="card-expiry">Managed via Stripe</span>
                  </div>
                </div>
                <button mat-stroked-button (click)="openStripePortal()">
                  <mat-icon>edit</mat-icon>
                  Update Payment
                </button>
              </div>
            } @else {
              <div class="no-payment">
                <p>No payment method on file</p>
                <span class="subtext">Add a payment method when you upgrade to a paid plan</span>
              </div>
            }
          </mat-card>

          <!-- Coupon Card -->
          <mat-card class="coupon-card">
            <div class="card-header">
              <div class="header-left">
                <mat-icon class="card-icon">local_offer</mat-icon>
                <h2>Coupon Code</h2>
              </div>
            </div>

            <mat-divider></mat-divider>

            <div class="coupon-input">
              <input
                type="text"
                placeholder="Enter coupon code"
                [(ngModel)]="couponCode"
                [disabled]="applyingCoupon()"
              />
              <button
                mat-flat-button
                color="primary"
                (click)="applyCoupon()"
                [disabled]="!couponCode || applyingCoupon()"
              >
                @if (applyingCoupon()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  Apply
                }
              </button>
            </div>
            @if (subscription()?.discount_percent) {
              <div class="active-discount">
                <mat-icon>check_circle</mat-icon>
                <span>{{ subscription()?.discount_percent }}% discount applied</span>
              </div>
            }
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [`
    .billing-page {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 32px;
    }

    .page-header h1 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .subtitle {
      font-size: 1rem;
      color: #666;
      margin: 0;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    .billing-content {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 24px;
    }

    mat-card {
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .card-icon {
      color: #ff5900;
    }

    .card-header h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
      color: #1a1a2e;
    }

    mat-divider {
      margin: 0;
    }

    /* Plan Card */
    .plan-card {
      grid-column: span 2;
    }

    .plan-details {
      display: flex;
      justify-content: space-between;
      padding: 24px;
    }

    .plan-info {
      flex: 1;
    }

    .plan-name {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .plan-description {
      color: #666;
      margin: 0;
    }

    .plan-pricing {
      text-align: right;
    }

    .price {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
    }

    .price .amount {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .price .period {
      font-size: 1rem;
      color: #666;
      margin-left: 4px;
    }

    .price.free .amount {
      color: #4caf50;
    }

    .billing-date {
      font-size: 0.875rem;
      color: #666;
      margin: 8px 0 0;
    }

    .upgrade-cta {
      font-size: 0.875rem;
      margin: 8px 0 0;
    }

    .upgrade-cta a {
      color: #ff5900;
      text-decoration: none;
      font-weight: 500;
    }

    .upgrade-cta a:hover {
      text-decoration: underline;
    }

    .plan-actions {
      display: flex;
      gap: 12px;
      padding: 0 24px 24px;
    }

    .cancel-notice {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: #fff3e0;
      border-top: 1px solid #ffe0b2;
    }

    .cancel-notice mat-icon {
      color: #f57c00;
    }

    .cancel-notice p {
      margin: 0;
      font-size: 0.875rem;
      color: #e65100;
    }

    .status-chip {
      font-size: 0.75rem;
      font-weight: 600;
    }

    .status-chip.active {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .status-chip.past-due {
      background: #ffebee;
      color: #c62828;
    }

    .status-chip.canceling {
      background: #fff3e0;
      color: #e65100;
    }

    .status-chip.trial {
      background: #e3f2fd;
      color: #1565c0;
    }

    /* Usage Card */
    .usage-grid {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .usage-item {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .usage-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 500;
      color: #1a1a2e;
    }

    .usage-header mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #666;
    }

    .usage-bar-container {
      height: 8px;
    }

    ::ng-deep .usage-bar-container .mat-mdc-progress-bar {
      height: 8px;
      border-radius: 4px;
    }

    ::ng-deep .usage-bar-container .mdc-linear-progress__bar-inner {
      border-color: #4caf50;
    }

    ::ng-deep .usage-bar-container.warning .mdc-linear-progress__bar-inner {
      border-color: #ff9800;
    }

    ::ng-deep .usage-bar-container.danger .mdc-linear-progress__bar-inner {
      border-color: #f44336;
    }

    .usage-numbers {
      display: flex;
      justify-content: space-between;
      font-size: 0.875rem;
    }

    .usage-numbers .used {
      color: #1a1a2e;
      font-weight: 500;
    }

    .usage-numbers .remaining {
      color: #666;
    }

    .usage-numbers .remaining.low {
      color: #f57c00;
    }

    .usage-numbers .unlimited {
      color: #4caf50;
      font-weight: 500;
    }

    .usage-warning {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #fff3e0;
      border-radius: 8px;
      font-size: 0.8rem;
      color: #e65100;
    }

    .usage-warning mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .usage-warning a {
      color: #ff5900;
      font-weight: 500;
    }

    /* Features Card */
    .features-grid {
      padding: 24px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 0.9rem;
      color: #999;
    }

    .feature-item.enabled {
      color: #1a1a2e;
    }

    .feature-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .feature-item.enabled .feature-icon {
      color: #4caf50;
    }

    .feature-item:not(.enabled) .feature-icon {
      color: #ccc;
    }

    .upgrade-prompt {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: linear-gradient(135deg, #fff5f0 0%, #fff 100%);
      border-top: 1px solid #ffccbc;
    }

    .upgrade-prompt p {
      margin: 0;
      font-weight: 500;
      color: #e65100;
    }

    /* Invoices Card */
    .view-all {
      color: #ff5900;
      font-weight: 500;
    }

    .empty-invoices {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px;
      color: #999;
    }

    .empty-invoices mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 12px;
    }

    .empty-invoices p {
      margin: 0;
      font-weight: 500;
      color: #666;
    }

    .empty-invoices .subtext {
      font-size: 0.875rem;
      margin-top: 4px;
    }

    .invoice-list {
      padding: 8px 0;
    }

    .invoice-row {
      display: grid;
      grid-template-columns: 1fr auto auto auto;
      align-items: center;
      gap: 16px;
      padding: 12px 24px;
      border-bottom: 1px solid #f0f0f0;
    }

    .invoice-row:last-child {
      border-bottom: none;
    }

    .invoice-info {
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
      color: #1a1a2e;
    }

    .invoice-status mat-chip {
      font-size: 0.7rem;
    }

    .status-paid {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-pending {
      background: #fff3e0 !important;
      color: #e65100 !important;
    }

    .status-failed {
      background: #ffebee !important;
      color: #c62828 !important;
    }

    /* Payment Card */
    .payment-info {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px;
    }

    .card-display {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .card-brand {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #1a1a2e;
    }

    .card-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .card-number {
      font-weight: 500;
      color: #1a1a2e;
      font-family: monospace;
    }

    .card-expiry {
      font-size: 0.8rem;
      color: #666;
    }

    .no-payment {
      padding: 32px 24px;
      text-align: center;
      color: #666;
    }

    .no-payment p {
      margin: 0;
      font-weight: 500;
    }

    .no-payment .subtext {
      font-size: 0.875rem;
      display: block;
      margin-top: 4px;
    }

    /* Coupon Card */
    .coupon-input {
      display: flex;
      gap: 12px;
      padding: 24px;
    }

    .coupon-input input {
      flex: 1;
      padding: 12px 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .coupon-input input:focus {
      border-color: #ff5900;
    }

    .coupon-input input::placeholder {
      color: #999;
    }

    .active-discount {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: #e8f5e9;
      color: #2e7d32;
      font-weight: 500;
      border-top: 1px solid #c8e6c9;
    }

    .active-discount mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .billing-content {
        grid-template-columns: 1fr;
      }

      .plan-card {
        grid-column: span 1;
      }

      .plan-details {
        flex-direction: column;
        gap: 24px;
      }

      .plan-pricing {
        text-align: left;
      }

      .price {
        justify-content: flex-start;
      }

      .plan-actions {
        flex-wrap: wrap;
      }

      .features-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .billing-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .invoice-row {
        grid-template-columns: 1fr auto auto;
      }

      .invoice-action {
        display: none;
      }
    }
  `],
})
export class BillingOverviewComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private featureGateService = inject(FeatureGateService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // State
  loading = signal(true);
  subscription = signal<OrganizationSubscription | null>(null);
  invoices = signal<SubscriptionInvoice[]>([]);
  couponCode = '';
  applyingCoupon = signal(false);

  // Computed values from usage limits
  receiptUsed = signal(0);
  receiptLimit = signal<number | null>(10);
  receiptRemaining = signal(10);
  userCount = signal(0);
  userLimit = signal<number | null>(3);

  receiptUsagePercent = computed(() => {
    const limit = this.receiptLimit();
    if (limit === null) return 0;
    return Math.min(100, (this.receiptUsed() / limit) * 100);
  });

  userUsagePercent = computed(() => {
    const limit = this.userLimit();
    if (limit === null) return 0;
    return Math.min(100, (this.userCount() / limit) * 100);
  });

  userRemaining = computed(() => {
    const limit = this.userLimit();
    if (limit === null) return Infinity;
    return Math.max(0, limit - this.userCount());
  });

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      this.loading.set(false);
      return;
    }

    // Load subscription
    this.subscriptionService.subscription$.subscribe((sub) => {
      this.subscription.set(sub);
      this.loading.set(false);
    });

    // Load usage limits
    this.subscriptionService.usageLimits$.subscribe((limits) => {
      if (limits) {
        this.receiptUsed.set(limits.receipts_used);
        this.receiptLimit.set(limits.receipt_limit);
        this.receiptRemaining.set(limits.receipts_remaining ?? 0);
        this.userCount.set(limits.users_current);
        this.userLimit.set(limits.user_limit);
      }
    });

    // Load invoices
    this.subscriptionService.getInvoices(orgId, 5).subscribe({
      next: (invoices) => this.invoices.set(invoices),
      error: (_err) => {
        // Silent failure - invoices are non-critical UI element
      },
    });
  }

  isPaidPlan(): boolean {
    const sub = this.subscription();
    return sub?.plan?.name !== 'free' && sub?.plan != null;
  }

  formatPrice(plan: SubscriptionPlan | undefined): string {
    if (!plan) return '$0';
    const sub = this.subscription();
    const cents = sub?.billing_cycle === 'annual'
      ? plan.annual_price_cents
      : plan.monthly_price_cents;
    return `$${(cents / 100).toFixed(2)}`;
  }

  openStripePortal(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) return;

    this.subscriptionService.openCustomerPortal(orgId).subscribe({
      error: () => {
        this.notificationService.showError('Failed to open billing portal');
      },
    });
  }

  cancelSubscription(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) return;

    if (confirm('Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.')) {
      this.subscriptionService.cancelSubscription(orgId).subscribe();
    }
  }

  resumeSubscription(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) return;

    this.subscriptionService.resumeSubscription(orgId).subscribe();
  }

  applyCoupon(): void {
    if (!this.couponCode.trim()) return;

    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) return;

    this.applyingCoupon.set(true);
    this.subscriptionService.applyCoupon(orgId, this.couponCode.trim()).subscribe({
      next: () => {
        this.couponCode = '';
        this.applyingCoupon.set(false);
      },
      error: () => {
        this.applyingCoupon.set(false);
      },
    });
  }
}
