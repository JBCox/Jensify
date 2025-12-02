import { Component, ChangeDetectionStrategy, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PayoutService } from '../../../core/services/payout.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { PayoutMethod, StripeAccountStatus } from '../../../core/models/payout.model';

/**
 * Payout Settings Component
 *
 * Allows organization admins to:
 * 1. Choose between manual (CSV export) and Stripe automated payouts
 * 2. Connect/disconnect their Stripe account
 * 3. View Stripe account status
 *
 * SECURITY: Stripe Connect uses Standard accounts where the organization
 * pays all fees directly to Stripe. We never handle their bank details.
 */
@Component({
  selector: 'app-payout-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatChipsModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <h1 class="jensify-page-title">Payout Settings</h1>
          <p class="jensify-page-subtitle">Configure how employees get reimbursed for approved expenses</p>
        </div>
      </div>

      <!-- Payout Method Selection -->
      <mat-card class="jensify-card method-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon">payments</mat-icon>
          <mat-card-title>Payout Method</mat-card-title>
          <mat-card-subtitle>Choose how to process employee reimbursements</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <div class="method-options">
            <div
              class="method-option"
              [class.selected]="payoutMethod() === 'manual'"
              (click)="selectMethod('manual')"
              role="button"
              tabindex="0"
              (keyup.enter)="selectMethod('manual')"
            >
              <div class="method-icon manual">
                <mat-icon>download</mat-icon>
              </div>
              <div class="method-details">
                <h3>Manual / CSV Export</h3>
                <p>Export approved expenses to CSV and process payments outside Jensify using your existing payroll or banking system.</p>
                <div class="method-features">
                  <span class="feature"><mat-icon>check</mat-icon> No setup required</span>
                  <span class="feature"><mat-icon>check</mat-icon> Use your existing process</span>
                  <span class="feature"><mat-icon>check</mat-icon> Full control</span>
                </div>
              </div>
              <mat-icon class="check-icon" *ngIf="payoutMethod() === 'manual'">check_circle</mat-icon>
            </div>

            <div
              class="method-option"
              [class.selected]="payoutMethod() === 'stripe'"
              [class.disabled]="stripeStatus() !== 'active' && stripeStatus() !== 'not_connected'"
              (click)="selectMethod('stripe')"
              role="button"
              tabindex="0"
              (keyup.enter)="selectMethod('stripe')"
            >
              <div class="method-icon stripe">
                <mat-icon>bolt</mat-icon>
              </div>
              <div class="method-details">
                <h3>Stripe Connect (Automated)</h3>
                <p>Connect your company's Stripe account to send direct ACH deposits to employee bank accounts.</p>
                <div class="method-features">
                  <span class="feature"><mat-icon>check</mat-icon> Automated payouts</span>
                  <span class="feature"><mat-icon>check</mat-icon> 1-2 day delivery</span>
                  <span class="feature"><mat-icon>check</mat-icon> $1 per ACH transfer</span>
                </div>
                @if (stripeStatus() !== 'active' && stripeStatus() !== 'not_connected') {
                  <mat-chip class="status-chip pending">Setup required</mat-chip>
                }
              </div>
              <mat-icon class="check-icon" *ngIf="payoutMethod() === 'stripe'">check_circle</mat-icon>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Stripe Connect Section -->
      <mat-card class="jensify-card stripe-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon stripe-icon">account_balance</mat-icon>
          <mat-card-title>Stripe Connect</mat-card-title>
          <mat-card-subtitle>
            @switch (stripeStatus()) {
              @case ('active') {
                Your Stripe account is connected and ready for payouts
              }
              @case ('pending') {
                Complete Stripe onboarding to enable payouts
              }
              @case ('restricted') {
                Additional verification required
              }
              @default {
                Connect your Stripe account to enable automated payouts
              }
            }
          </mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Status Display -->
          <div class="stripe-status">
            <div class="status-row">
              <span class="status-label">Connection Status:</span>
              <mat-chip [class]="'status-chip ' + stripeStatus()">
                @switch (stripeStatus()) {
                  @case ('active') { Connected }
                  @case ('pending') { Pending Setup }
                  @case ('restricted') { Restricted }
                  @case ('disabled') { Disabled }
                  @default { Not Connected }
                }
              </mat-chip>
            </div>

            @if (stripeConnected()) {
              <div class="status-row">
                <span class="status-label">Payouts Enabled:</span>
                <mat-chip [class]="'status-chip ' + (payoutsEnabled() ? 'active' : 'pending')">
                  {{ payoutsEnabled() ? 'Yes' : 'No' }}
                </mat-chip>
              </div>

              @if (businessName()) {
                <div class="status-row">
                  <span class="status-label">Business Name:</span>
                  <span class="status-value">{{ businessName() }}</span>
                </div>
              }
            }
          </div>

          <mat-divider></mat-divider>

          <!-- Actions -->
          <div class="stripe-actions">
            @if (!stripeConnected()) {
              <button
                mat-raised-button
                color="primary"
                (click)="connectStripe()"
                [disabled]="loading()"
              >
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container><mat-icon>link</mat-icon> Connect Stripe Account</ng-container>
                }
              </button>
              <p class="action-hint">
                You'll be redirected to Stripe to connect your existing account or create a new one.
                All Stripe fees are billed directly to your account.
              </p>
            } @else if (stripeStatus() === 'pending' || stripeStatus() === 'restricted') {
              <button
                mat-raised-button
                color="primary"
                (click)="continueSetup()"
                [disabled]="loading()"
              >
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container><mat-icon>arrow_forward</mat-icon> Continue Setup</ng-container>
                }
              </button>
              <p class="action-hint">
                Complete the Stripe onboarding process to enable payouts.
              </p>
            } @else {
              <button
                mat-stroked-button
                color="warn"
                (click)="disconnectStripe()"
                [disabled]="loading()"
              >
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <ng-container><mat-icon>link_off</mat-icon> Disconnect Stripe</ng-container>
                }
              </button>
              <p class="action-hint warn">
                Disconnecting will switch to manual payout mode. You can reconnect at any time.
              </p>
            }
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Info Card -->
      <mat-card class="jensify-card info-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon info-icon">info</mat-icon>
          <mat-card-title>How It Works</mat-card-title>
        </mat-card-header>

        <mat-card-content>
          <div class="info-grid">
            <div class="info-item">
              <mat-icon>security</mat-icon>
              <div>
                <h4>Secure by Design</h4>
                <p>Bank account information is handled entirely by Stripe. We never see or store sensitive financial data.</p>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>account_balance_wallet</mat-icon>
              <div>
                <h4>Your Stripe Account</h4>
                <p>All fees ($1/ACH transfer) are billed directly to your connected Stripe account, not through Jensify.</p>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>group</mat-icon>
              <div>
                <h4>Employee Setup</h4>
                <p>Employees add their bank account securely through Stripe. Verification via micro-deposits ensures account ownership.</p>
              </div>
            </div>

            <div class="info-item">
              <mat-icon>speed</mat-icon>
              <div>
                <h4>Fast Payouts</h4>
                <p>ACH transfers typically arrive in 1-2 business days. Finance can process payouts with one click.</p>
              </div>
            </div>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .method-card {
      margin-bottom: 1.5rem;
    }

    .card-icon {
      background: var(--jensify-primary, #ff5900);
      color: white;
      width: 40px !important;
      height: 40px !important;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stripe-icon {
      background: #635bff;
    }

    .info-icon {
      background: #2196f3;
    }

    .method-options {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding-top: 1rem;
    }

    .method-option {
      display: flex;
      align-items: flex-start;
      gap: 1rem;
      padding: 1.5rem;
      border: 2px solid var(--jensify-border-light, #e0e0e0);
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;

      &:hover:not(.disabled) {
        border-color: var(--jensify-primary, #ff5900);
        background: color-mix(in srgb, var(--jensify-primary) 2%, transparent);
      }

      &.selected {
        border-color: var(--jensify-primary, #ff5900);
        background: color-mix(in srgb, var(--jensify-primary) 5%, transparent);
      }

      &.disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
    }

    .method-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;

      mat-icon {
        color: white;
        font-size: 24px;
        width: 24px;
        height: 24px;
      }

      &.manual {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }

      &.stripe {
        background: linear-gradient(135deg, #635bff 0%, #00d4ff 100%);
      }
    }

    .method-details {
      flex: 1;

      h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1.1rem;
        font-weight: 600;
      }

      p {
        margin: 0 0 0.75rem 0;
        color: var(--jensify-text-secondary, #666);
        font-size: 0.9rem;
        line-height: 1.5;
      }
    }

    .method-features {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .feature {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.8rem;
      color: var(--jensify-text-secondary, #666);

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--jensify-success, #4caf50);
      }
    }

    .check-icon {
      position: absolute;
      top: 1rem;
      right: 1rem;
      color: var(--jensify-primary, #ff5900);
    }

    /* Stripe Card */
    .stripe-card {
      margin-bottom: 1.5rem;
    }

    .stripe-status {
      padding: 1rem 0;
    }

    .status-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
    }

    .status-label {
      font-weight: 500;
      color: var(--jensify-text-secondary, #666);
      min-width: 140px;
    }

    .status-value {
      font-weight: 500;
    }

    .status-chip {
      &.active {
        background: rgba(76, 175, 80, 0.15) !important;
        color: #2e7d32 !important;
      }

      &.pending {
        background: rgba(255, 152, 0, 0.15) !important;
        color: #e65100 !important;
      }

      &.restricted {
        background: rgba(244, 67, 54, 0.15) !important;
        color: #c62828 !important;
      }

      &.not_connected, &.disabled {
        background: rgba(158, 158, 158, 0.15) !important;
        color: #616161 !important;
      }
    }

    mat-divider {
      margin: 1rem 0;
    }

    .stripe-actions {
      padding-top: 1rem;

      button {
        min-width: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;

        mat-spinner {
          margin: 0;
        }
      }
    }

    .action-hint {
      margin: 1rem 0 0 0;
      font-size: 0.85rem;
      color: var(--jensify-text-muted, #999);
      max-width: 500px;

      &.warn {
        color: var(--jensify-warn, #f44336);
      }
    }

    /* Info Card */
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
      padding-top: 1rem;
    }

    .info-item {
      display: flex;
      gap: 1rem;

      > mat-icon {
        color: var(--jensify-primary, #ff5900);
        font-size: 24px;
        width: 24px;
        height: 24px;
        flex-shrink: 0;
      }

      h4 {
        margin: 0 0 0.25rem 0;
        font-size: 0.95rem;
        font-weight: 600;
      }

      p {
        margin: 0;
        font-size: 0.85rem;
        color: var(--jensify-text-secondary, #666);
        line-height: 1.5;
      }
    }

    /* Dark mode */
    :host-context(.dark) {
      .method-option {
        border-color: rgba(255, 255, 255, 0.12);

        &:hover:not(.disabled) {
          background: color-mix(in srgb, var(--jensify-primary) 8%, transparent);
        }

        &.selected {
          background: color-mix(in srgb, var(--jensify-primary) 12%, transparent);
        }
      }

      .method-details p,
      .feature,
      .status-label,
      .action-hint,
      .info-item p {
        color: rgba(255, 255, 255, 0.7);
      }
    }

    /* Mobile */
    @media (max-width: 599px) {
      .method-option {
        flex-direction: column;
        text-align: center;
      }

      .method-features {
        justify-content: center;
      }

      .check-icon {
        position: static;
        align-self: center;
      }

      .status-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .status-label {
        min-width: unset;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayoutSettingsComponent implements OnInit, OnDestroy {
  private payoutService = inject(PayoutService);
  private organizationService = inject(OrganizationService);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);
  private destroy$ = new Subject<void>();

  // State
  loading = signal(false);
  payoutMethod = signal<PayoutMethod>('manual');
  stripeStatus = signal<StripeAccountStatus>('not_connected');
  stripeConnected = signal(false);
  payoutsEnabled = signal(false);
  businessName = signal<string | null>(null);

  private organizationId: string | null = null;

  ngOnInit(): void {
    // Get current organization
    this.organizationService.currentOrganization$
      .pipe(takeUntil(this.destroy$))
      .subscribe(org => {
        if (org) {
          this.organizationId = org.id;
          this.loadStripeStatus();
        }
      });

    // Handle Stripe redirect callback
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['stripe'] === 'success') {
          this.snackBar.open('Stripe account connected successfully!', 'Close', { duration: 5000 });
          this.loadStripeStatus();
        } else if (params['stripe'] === 'refresh') {
          this.snackBar.open('Please complete Stripe setup', 'Close', { duration: 3000 });
          this.continueSetup();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadStripeStatus(): void {
    if (!this.organizationId) return;

    this.loading.set(true);
    this.payoutService.getStripeAccountStatus(this.organizationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (status) => {
          this.payoutMethod.set(status.payout_method || 'manual');
          this.stripeConnected.set(status.connected);
          this.stripeStatus.set(status.status || 'not_connected');
          this.payoutsEnabled.set(status.payouts_enabled || false);
          this.businessName.set(status.business_name || null);
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Failed to load Stripe status:', error);
          this.loading.set(false);
        }
      });
  }

  selectMethod(method: PayoutMethod): void {
    if (!this.organizationId) return;

    // Can only select Stripe if connected
    if (method === 'stripe' && this.stripeStatus() !== 'active') {
      this.snackBar.open('Please connect your Stripe account first', 'Close', { duration: 3000 });
      return;
    }

    if (method === this.payoutMethod()) return;

    this.loading.set(true);
    this.payoutService.updatePayoutMethod(this.organizationId, method)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.payoutMethod.set(method);
          this.snackBar.open(
            method === 'stripe'
              ? 'Switched to automated Stripe payouts'
              : 'Switched to manual CSV export',
            'Close',
            { duration: 3000 }
          );
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Failed to update payout method:', error);
          this.snackBar.open('Failed to update payout method', 'Close', { duration: 3000 });
          this.loading.set(false);
        }
      });
  }

  connectStripe(): void {
    if (!this.organizationId) return;

    this.loading.set(true);
    this.payoutService.connectStripeAccount(this.organizationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.onboarding_url) {
            // Redirect to Stripe
            window.location.href = result.onboarding_url;
          } else {
            this.snackBar.open(result.error || 'Failed to connect Stripe', 'Close', { duration: 3000 });
            this.loading.set(false);
          }
        },
        error: (error) => {
          console.error('Failed to connect Stripe:', error);
          this.snackBar.open('Failed to connect Stripe', 'Close', { duration: 3000 });
          this.loading.set(false);
        }
      });
  }

  continueSetup(): void {
    if (!this.organizationId) return;

    this.loading.set(true);
    this.payoutService.createAccountLink(this.organizationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.onboarding_url) {
            window.location.href = result.onboarding_url;
          } else {
            this.snackBar.open(result.error || 'Failed to continue setup', 'Close', { duration: 3000 });
            this.loading.set(false);
          }
        },
        error: (error) => {
          console.error('Failed to continue setup:', error);
          this.snackBar.open('Failed to continue setup', 'Close', { duration: 3000 });
          this.loading.set(false);
        }
      });
  }

  disconnectStripe(): void {
    if (!this.organizationId) return;

    if (!confirm('Are you sure you want to disconnect Stripe? This will switch to manual payout mode.')) {
      return;
    }

    this.loading.set(true);
    this.payoutService.disconnectStripeAccount(this.organizationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.stripeConnected.set(false);
          this.stripeStatus.set('not_connected');
          this.payoutMethod.set('manual');
          this.payoutsEnabled.set(false);
          this.businessName.set(null);
          this.snackBar.open('Stripe account disconnected', 'Close', { duration: 3000 });
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Failed to disconnect Stripe:', error);
          this.snackBar.open('Failed to disconnect Stripe', 'Close', { duration: 3000 });
          this.loading.set(false);
        }
      });
  }
}
