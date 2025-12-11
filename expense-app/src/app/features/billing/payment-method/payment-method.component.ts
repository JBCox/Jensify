import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { NotificationService } from '../../../core/services/notification.service';

/**
 * Payment Method Component
 *
 * Provides access to Stripe's customer portal for:
 * - Viewing saved payment methods
 * - Adding new cards
 * - Updating default payment
 * - Managing billing details
 */
@Component({
  selector: 'app-payment-method',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="payment-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Payment Method</h1>
          <p class="subtitle">Manage your payment details securely via Stripe</p>
        </div>
      </header>

      <div class="payment-content">
        <!-- Info Card -->
        <mat-card class="info-card">
          <div class="info-content">
            <div class="info-icon">
              <mat-icon>lock</mat-icon>
            </div>
            <div class="info-text">
              <h3>Secure Payment Management</h3>
              <p>
                Your payment information is securely stored and managed by Stripe,
                a leading payment processor trusted by millions of businesses worldwide.
                We never store your full card details on our servers.
              </p>
            </div>
          </div>
        </mat-card>

        <!-- Actions Card -->
        <mat-card class="actions-card">
          <h2>Payment Actions</h2>
          <mat-divider></mat-divider>

          <div class="action-list">
            <div class="action-item" (click)="openStripePortal()" (keydown.enter)="openStripePortal()" tabindex="0" role="button" aria-label="Update Payment Method">
              <div class="action-icon">
                <mat-icon>credit_card</mat-icon>
              </div>
              <div class="action-text">
                <h4>Update Payment Method</h4>
                <p>Add a new card or update your existing payment details</p>
              </div>
              <mat-icon class="action-arrow">arrow_forward</mat-icon>
            </div>

            <div class="action-item" (click)="openStripePortal()" (keydown.enter)="openStripePortal()" tabindex="0" role="button" aria-label="Billing Information">
              <div class="action-icon">
                <mat-icon>receipt</mat-icon>
              </div>
              <div class="action-text">
                <h4>Billing Information</h4>
                <p>Update your billing address and company details</p>
              </div>
              <mat-icon class="action-arrow">arrow_forward</mat-icon>
            </div>

            <div class="action-item" (click)="openStripePortal()" (keydown.enter)="openStripePortal()" tabindex="0" role="button" aria-label="Payment History">
              <div class="action-icon">
                <mat-icon>history</mat-icon>
              </div>
              <div class="action-text">
                <h4>Payment History</h4>
                <p>View all past payments and download receipts</p>
              </div>
              <mat-icon class="action-arrow">arrow_forward</mat-icon>
            </div>
          </div>

          <div class="portal-button">
            <button
              mat-flat-button
              color="primary"
              (click)="openStripePortal()"
              [disabled]="loading()"
            >
              <mat-spinner *ngIf="loading()" diameter="20"></mat-spinner>
              <ng-container *ngIf="!loading()">
                <mat-icon>open_in_new</mat-icon>
                <span>Open Billing Portal</span>
              </ng-container>
            </button>
            <p class="portal-hint">
              You'll be redirected to Stripe's secure portal
            </p>
          </div>
        </mat-card>

        <!-- FAQ Card -->
        <mat-card class="faq-card">
          <h2>Frequently Asked Questions</h2>
          <mat-divider></mat-divider>

          <div class="faq-list">
            <div class="faq-item">
              <h4>What payment methods do you accept?</h4>
              <p>
                We accept all major credit and debit cards including Visa, Mastercard,
                American Express, and Discover. We also support some local payment
                methods depending on your region.
              </p>
            </div>

            <div class="faq-item">
              <h4>Is my payment information secure?</h4>
              <p>
                Absolutely. All payment processing is handled by Stripe, which is
                PCI-DSS Level 1 certified (the highest level of security certification).
                We never see or store your full card number.
              </p>
            </div>

            <div class="faq-item">
              <h4>When will I be charged?</h4>
              <p>
                You'll be charged at the start of each billing period. For monthly
                plans, this is on the same date each month. For annual plans, you're
                billed once per year on your subscription anniversary.
              </p>
            </div>

            <div class="faq-item">
              <h4>What happens if a payment fails?</h4>
              <p>
                If a payment fails, we'll retry a few times over the next few days.
                You'll receive an email notification to update your payment method.
                Your account remains active during this grace period.
              </p>
            </div>

            <div class="faq-item">
              <h4>How do I get a refund?</h4>
              <p>
                We offer a 30-day money-back guarantee for first-time subscribers.
                Contact us at billing&#64;expensed.app for refund requests or billing
                questions.
              </p>
            </div>
          </div>
        </mat-card>

        <!-- Support Card -->
        <mat-card class="support-card">
          <div class="support-content">
            <mat-icon>support_agent</mat-icon>
            <div class="support-text">
              <h3>Need Help?</h3>
              <p>Our billing support team is here to help with any payment issues.</p>
              <a href="mailto:billing@expensed.app">billing&#64;expensed.app</a>
            </div>
          </div>
        </mat-card>
      </div>
    </div>
  `,
  styles: [`
    .payment-page {
      padding: 24px;
      max-width: 800px;
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

    .subtitle {
      font-size: 1rem;
      color: #666;
      margin: 0;
    }

    .payment-content {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    mat-card {
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    }

    /* Info Card */
    .info-card {
      background: linear-gradient(135deg, #e3f2fd 0%, #f3e5f5 100%);
      border: 1px solid #bbdefb;
    }

    .info-content {
      display: flex;
      gap: 20px;
      padding: 24px;
    }

    .info-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .info-icon mat-icon {
      color: #1976d2;
      font-size: 24px;
    }

    .info-text h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .info-text p {
      margin: 0;
      color: #555;
      line-height: 1.6;
    }

    /* Actions Card */
    .actions-card h2,
    .faq-card h2 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0;
      padding: 20px 24px;
      color: #1a1a2e;
    }

    mat-divider {
      margin: 0;
    }

    .action-list {
      padding: 8px 0;
    }

    .action-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 24px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .action-item:hover {
      background: #fafafa;
    }

    .action-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #fff5f0;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .action-icon mat-icon {
      color: #ff5900;
    }

    .action-text {
      flex: 1;
    }

    .action-text h4 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 4px;
      color: #1a1a2e;
    }

    .action-text p {
      font-size: 0.85rem;
      color: #666;
      margin: 0;
    }

    .action-arrow {
      color: #ccc;
    }

    .portal-button {
      padding: 24px;
      text-align: center;
      border-top: 1px solid #f0f0f0;
    }

    .portal-button button {
      min-width: 200px;
      padding: 12px 32px;
      font-size: 1rem;
      font-weight: 600;
    }

    .portal-button button mat-icon {
      margin-right: 8px;
    }

    .btn-content {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .portal-hint {
      font-size: 0.8rem;
      color: #999;
      margin: 12px 0 0;
    }

    /* FAQ Card */
    .faq-list {
      padding: 8px 24px 24px;
    }

    .faq-item {
      padding: 16px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .faq-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .faq-item h4 {
      font-size: 0.95rem;
      font-weight: 600;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .faq-item p {
      font-size: 0.9rem;
      color: #666;
      line-height: 1.6;
      margin: 0;
    }

    /* Support Card */
    .support-card {
      background: #1a1a2e;
      color: white;
    }

    .support-content {
      display: flex;
      align-items: center;
      gap: 20px;
      padding: 24px;
    }

    .support-content > mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #ff5900;
    }

    .support-text h3 {
      font-size: 1.1rem;
      font-weight: 600;
      margin: 0 0 4px;
    }

    .support-text p {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 8px;
    }

    .support-text a {
      color: #ff5900;
      text-decoration: none;
      font-weight: 500;
    }

    .support-text a:hover {
      text-decoration: underline;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .payment-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .info-content {
        flex-direction: column;
        text-align: center;
      }

      .info-icon {
        margin: 0 auto;
      }

      .support-content {
        flex-direction: column;
        text-align: center;
      }
    }
  `],
})
export class PaymentMethodComponent {
  private subscriptionService = inject(SubscriptionService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);

  loading = signal(false);

  // ngOnInit left empty intentionally - component initializes through signals

  openStripePortal(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      this.notificationService.showError('No organization found');
      return;
    }

    this.loading.set(true);
    this.subscriptionService.openCustomerPortal(orgId).subscribe({
      next: () => {
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notificationService.showError('Failed to open billing portal');
      },
    });
  }
}
