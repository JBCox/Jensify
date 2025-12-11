import { Component, ChangeDetectionStrategy, inject, signal, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { SubscriptionService } from '../../../core/services/subscription.service';

interface PlanOption {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  maxUsers: number;
  popular?: boolean;
  features: string[];
  limitations?: string[];
}

/**
 * Plan Selection Component
 *
 * Used during signup flow to let users choose their plan.
 * Can be embedded in registration or used standalone.
 *
 * Modes:
 * - embedded: Shows in registration flow, emits selection
 * - standalone: Full page for post-registration selection
 */
@Component({
  selector: 'app-plan-selection',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="plan-selection" [class.embedded]="embedded">
      @if (!embedded) {
        <header class="page-header">
          <img src="assets/images/stacked-256.png" alt="Expensed" class="brand-logo" />
          <h1>Choose Your Plan</h1>
          <p class="subtitle">Start with Free or unlock all features with a paid plan</p>
        </header>
      }

      <!-- Billing Toggle -->
      <div class="billing-toggle">
        <mat-button-toggle-group
          [(ngModel)]="billingCycle"
          (change)="onBillingCycleChange()"
        >
          <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
          <mat-button-toggle value="annual">
            Annual
            <span class="save-badge">Save 20%</span>
          </mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <!-- Plan Grid -->
      <div class="plans-grid">
        @for (plan of plans; track plan.id) {
          <div
            class="plan-card"
            [class.popular]="plan.popular"
            [class.selected]="selectedPlan() === plan.id"
            (click)="selectPlan(plan.id)"
            (keydown.enter)="selectPlan(plan.id)"
            tabindex="0"
            role="button"
            [attr.aria-label]="'Select ' + plan.name + ' plan'"
          >
            @if (plan.popular) {
              <div class="popular-badge">Most Popular</div>
            }

            <div class="plan-header">
              <h3>{{ plan.name }}</h3>
              <p class="plan-desc">{{ plan.description }}</p>
            </div>

            <div class="plan-price">
              @if (plan.monthlyPrice === 0) {
                <span class="price-amount">$0</span>
                <span class="price-period">forever</span>
              } @else {
                <span class="price-amount">{{ '$' + getDisplayPrice(plan) }}</span>
                <span class="price-period">/user/month</span>
                @if (isAnnual()) {
                  <span class="billed-note">billed annually</span>
                }
              }
            </div>

            <div class="plan-users">
              <mat-icon>group</mat-icon>
              @if (plan.maxUsers === 999) {
                <span>Unlimited users</span>
              } @else {
                <span>Up to {{ plan.maxUsers }} users</span>
              }
            </div>

            <ul class="plan-features">
              @for (feature of plan.features; track feature) {
                <li>
                  <mat-icon>check_circle</mat-icon>
                  {{ feature }}
                </li>
              }
              @if (plan.limitations) {
                @for (limitation of plan.limitations; track limitation) {
                  <li class="limitation">
                    <mat-icon>remove_circle_outline</mat-icon>
                    {{ limitation }}
                  </li>
                }
              }
            </ul>

            <button
              mat-flat-button
              [color]="plan.popular ? 'primary' : 'basic'"
              class="select-btn"
              [class.selected]="selectedPlan() === plan.id"
              (click)="selectPlan(plan.id); $event.stopPropagation()"
            >
              <mat-icon *ngIf="selectedPlan() === plan.id">check</mat-icon>
              <span>{{ getSelectButtonLabel(plan) }}</span>
            </button>
          </div>
        }
      </div>

      <!-- Action Button -->
      @if (!embedded && selectedPlan()) {
        <div class="action-section">
          <button
            mat-flat-button
            color="primary"
            class="continue-btn"
            [disabled]="processing()"
            (click)="onContinue()"
          >
            <mat-spinner *ngIf="processing()" diameter="20"></mat-spinner>
            <ng-container *ngIf="!processing()">
              <mat-icon>{{ getContinueButtonIcon() }}</mat-icon>
              <span>{{ getContinueButtonLabel() }}</span>
            </ng-container>
          </button>
          <p class="secure-note">
            <mat-icon>lock</mat-icon>
            Secure payment powered by Stripe. Cancel anytime.
          </p>
        </div>
      }

      <!-- Comparison Footer -->
      @if (!embedded) {
        <div class="comparison-footer">
          <h4>All plans include full features:</h4>
          <div class="features-row">
            <div class="feature-item">
              <mat-icon>photo_camera</mat-icon>
              <span>Smart OCR</span>
            </div>
            <div class="feature-item">
              <mat-icon>account_balance</mat-icon>
              <span>Stripe payouts</span>
            </div>
            <div class="feature-item">
              <mat-icon>gps_fixed</mat-icon>
              <span>GPS mileage</span>
            </div>
            <div class="feature-item">
              <mat-icon>approval</mat-icon>
              <span>Multi-level approvals</span>
            </div>
            <div class="feature-item">
              <mat-icon>api</mat-icon>
              <span>API access</span>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .plan-selection {
      padding: 48px 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .plan-selection.embedded {
      padding: 0;
    }

    /* Header */
    .page-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .brand-logo {
      height: 64px;
      margin-bottom: 24px;
    }

    .page-header h1 {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 8px;
    }

    .subtitle {
      font-size: 1.1rem;
      color: #666;
      margin: 0;
    }

    /* Billing Toggle */
    .billing-toggle {
      display: flex;
      justify-content: center;
      margin-bottom: 32px;
    }

    .billing-toggle mat-button-toggle-group {
      border: 2px solid #e0e0e0;
      border-radius: 30px;
      overflow: hidden;
    }

    ::ng-deep .billing-toggle .mat-button-toggle {
      border: none !important;
    }

    ::ng-deep .billing-toggle .mat-button-toggle-button {
      padding: 8px 24px;
      font-weight: 500;
    }

    ::ng-deep .billing-toggle .mat-button-toggle-checked {
      background: #ff5900;
      color: white;
    }

    .save-badge {
      background: #4caf50;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.7rem;
      font-weight: 600;
      margin-left: 6px;
      vertical-align: middle;
    }

    /* Plan Grid */
    .plans-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .plan-card {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 16px;
      padding: 24px;
      position: relative;
      cursor: pointer;
      transition: all 0.2s;
    }

    .plan-card:hover {
      border-color: #ff5900;
      box-shadow: 0 4px 20px rgba(255, 89, 0, 0.1);
    }

    .plan-card.selected {
      border-color: #ff5900;
      box-shadow: 0 4px 20px rgba(255, 89, 0, 0.15);
    }

    .plan-card.popular {
      border-color: #ff5900;
      transform: scale(1.02);
    }

    .popular-badge {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #ff5900, #ff7a33);
      color: white;
      padding: 4px 16px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Plan Header */
    .plan-header {
      margin-bottom: 16px;
    }

    .plan-header h3 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 4px;
    }

    .plan-desc {
      font-size: 0.875rem;
      color: #666;
      margin: 0;
    }

    /* Pricing */
    .plan-price {
      margin-bottom: 16px;
    }

    .price-amount {
      font-size: 2.5rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .price-period {
      font-size: 0.875rem;
      color: #666;
      margin-left: 4px;
    }

    .billed-note {
      display: block;
      font-size: 0.75rem;
      color: #999;
      margin-top: 4px;
    }

    /* Users */
    .plan-users {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #f9f9f9;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .plan-users mat-icon {
      color: #ff5900;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .plan-users span {
      font-weight: 500;
      color: #1a1a2e;
    }

    /* Features */
    .plan-features {
      list-style: none;
      padding: 0;
      margin: 0 0 20px;
    }

    .plan-features li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 0.875rem;
      color: #333;
    }

    .plan-features mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #4caf50;
    }

    .plan-features li.limitation mat-icon {
      color: #999;
    }

    .plan-features li.limitation {
      color: #999;
    }

    /* Select Button */
    .select-btn {
      width: 100%;
      padding: 12px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
    }

    .select-btn.selected {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .btn-content {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    /* Action Section */
    .action-section {
      text-align: center;
      padding: 32px 0;
    }

    .continue-btn {
      min-width: 280px;
      padding: 16px 32px;
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: 12px;
    }

    .secure-note {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 16px;
      font-size: 0.875rem;
      color: #666;
    }

    .secure-note mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Comparison Footer */
    .comparison-footer {
      background: #f9f9f9;
      border-radius: 16px;
      padding: 32px;
      text-align: center;
    }

    .comparison-footer h4 {
      font-size: 1rem;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 20px;
    }

    .features-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 24px;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      color: #333;
    }

    .feature-item mat-icon {
      color: #ff5900;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .plan-selection {
        padding: 24px 16px;
      }

      .page-header h1 {
        font-size: 1.75rem;
      }

      .plans-grid {
        grid-template-columns: 1fr;
      }

      .plan-card.popular {
        transform: none;
      }

      .features-row {
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .continue-btn {
        width: 100%;
      }
    }
  `],
})
export class PlanSelectionComponent {
  private subscriptionService = inject(SubscriptionService);
  private router = inject(Router);

  @Input() embedded = false;
  @Output() planSelected = new EventEmitter<{ planId: string; billingCycle: 'monthly' | 'annual' }>();

  selectedPlan = signal<string | null>(null);
  processing = signal(false);
  billingCycle: 'monthly' | 'annual' = 'monthly';

  plans: PlanOption[] = [
    {
      id: 'free',
      name: 'Free',
      description: 'Get started with expense tracking',
      monthlyPrice: 0,
      annualPrice: 0,
      maxUsers: 3,
      features: [
        '20 receipts/month',
        'Smart OCR extraction',
        'Stripe ACH payouts',
        'GPS mileage tracking',
        'Multi-level approvals',
        'API access',
        'Community support',
      ],
    },
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for small teams',
      monthlyPrice: 9.99,
      annualPrice: 95.90,
      maxUsers: 5,
      features: [
        'Unlimited receipts',
        'Smart OCR extraction',
        'Stripe ACH payouts',
        'GPS mileage tracking',
        'Multi-level approvals',
        'API access',
        'Email support',
      ],
    },
    {
      id: 'team',
      name: 'Team',
      description: 'Built for growing teams',
      monthlyPrice: 18.99,
      annualPrice: 182.30,
      maxUsers: 10,
      popular: true,
      features: [
        'Unlimited receipts',
        'Smart OCR extraction',
        'Stripe ACH payouts',
        'GPS mileage tracking',
        'Multi-level approvals',
        'API access',
        'Priority support',
      ],
    },
    {
      id: 'business',
      name: 'Business',
      description: 'For scaling organizations',
      monthlyPrice: 29.99,
      annualPrice: 287.90,
      maxUsers: 20,
      features: [
        'Unlimited receipts',
        'Smart OCR extraction',
        'Stripe ACH payouts',
        'GPS mileage tracking',
        'Multi-level approvals',
        'API access',
        'Priority support',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations',
      monthlyPrice: 59.99,
      annualPrice: 575.90,
      maxUsers: 50,
      features: [
        'Unlimited receipts',
        'Smart OCR extraction',
        'Stripe ACH payouts',
        'GPS mileage tracking',
        'Multi-level approvals',
        'API access',
        'Dedicated support',
      ],
    },
  ];

  selectPlan(planId: string): void {
    this.selectedPlan.set(planId);
    if (this.embedded) {
      this.planSelected.emit({
        planId,
        billingCycle: this.billingCycle,
      });
    }
  }

  onBillingCycleChange(): void {
    // Re-emit selection with new billing cycle if embedded
    if (this.embedded && this.selectedPlan()) {
      this.planSelected.emit({
        planId: this.selectedPlan()!,
        billingCycle: this.billingCycle,
      });
    }
  }

  /** Get the display price for a plan based on billing cycle */
  getDisplayPrice(plan: PlanOption): string {
    if (this.billingCycle === 'monthly') {
      return plan.monthlyPrice.toFixed(2);
    }
    return (plan.annualPrice / 12).toFixed(2);
  }

  /** Check if billing is annual */
  isAnnual(): boolean {
    return this.billingCycle === 'annual';
  }

  /** Get button label for plan selection */
  getSelectButtonLabel(plan: PlanOption): string {
    if (this.selectedPlan() === plan.id) return 'Selected';
    if (plan.id === 'free') return 'Start Free';
    return `Select ${plan.name}`;
  }

  /** Get icon for continue button */
  getContinueButtonIcon(): string {
    const plan = this.selectedPlan();
    if (plan === 'free') return 'arrow_forward';
    return 'credit_card';
  }

  /** Get label for continue button */
  getContinueButtonLabel(): string {
    const plan = this.selectedPlan();
    if (plan === 'free') return 'Continue with Free';
    return 'Continue to Payment';
  }

  onContinue(): void {
    const plan = this.selectedPlan();
    if (!plan) return;

    if (plan === 'free') {
      // Navigate to organization setup
      this.router.navigate(['/organization/setup']);
      return;
    }

    // For paid plans, redirect to Stripe Checkout
    this.processing.set(true);
    this.subscriptionService
      .createCheckoutSession(plan, this.billingCycle)
      .subscribe({
        next: (session) => {
          // Redirect to Stripe
          window.location.href = session.url;
        },
        error: () => {
          this.processing.set(false);
        },
      });
  }
}
