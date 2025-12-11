import { Component, ChangeDetectionStrategy, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule } from '@angular/material/dialog';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SubscriptionPlan, BillingCycle } from '../../../core/models/subscription.model';

/**
 * Plan Selector Component
 *
 * Allows users to:
 * - Compare available plans
 * - Upgrade or downgrade their subscription
 * - Switch between monthly and annual billing
 */
@Component({
  selector: 'app-plan-selector',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatButtonToggleModule,
    MatDialogModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="plan-selector-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Choose Your Plan</h1>
          <p class="subtitle">
            @if (currentPlan()) {
              Currently on <strong>{{ currentPlan()?.display_name }}</strong>.
              {{ isUpgrade() ? 'Upgrade' : 'Change' }} anytime.
            } @else {
              Select the plan that best fits your team's needs
            }
          </p>
        </div>
      </header>

      <!-- Billing Toggle -->
      <div class="billing-toggle-container">
        <mat-button-toggle-group
          [value]="billingCycle()"
          (change)="setBillingCycle($event.value)"
          class="toggle-group"
        >
          <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
          <mat-button-toggle value="annual">
            Annual
            <span class="save-badge">Save 20%</span>
          </mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading plans...</p>
        </div>
      } @else {
        <div class="plans-container">
          @for (plan of plans(); track plan.id) {
            <div
              class="plan-option"
              [class.current]="isCurrentPlan(plan)"
              [class.popular]="plan.name === 'team'"
              [class.disabled]="processing()"
            >
              @if (plan.name === 'team') {
                <div class="popular-badge">Most Popular</div>
              }
              @if (isCurrentPlan(plan)) {
                <div class="current-badge">Current Plan</div>
              }

              <div class="plan-header">
                <h2 class="plan-name">{{ plan.display_name }}</h2>
                <p class="plan-description">{{ plan.description }}</p>
              </div>

              <div class="plan-price">
                @if (plan.name === 'free') {
                  <span class="price-amount">$0</span>
                  <span class="price-period">forever</span>
                } @else {
                  <span class="price-amount">{{ '$' + getDisplayPrice(plan) }}</span>
                  <span class="price-period">
                    /{{ billingCycle() === 'annual' ? 'year' : 'month' }}
                  </span>
                  @if (billingCycle() === 'annual') {
                    <div class="monthly-equivalent">
                      {{ '$' + getMonthlyEquivalent(plan) }}/mo when billed annually
                    </div>
                  }
                }
              </div>

              <div class="plan-users">
                <mat-icon>people</mat-icon>
                <span>
                  @if (plan.max_users === null) {
                    Unlimited users
                  } @else {
                    Up to {{ plan.max_users }} users
                  }
                </span>
              </div>

              <mat-divider></mat-divider>

              <ul class="plan-features">
                <!-- All plans have full features, only receipt limits differ -->
                <li><mat-icon>check</mat-icon> {{ plan.name === 'free' ? '20 receipts/month' : 'Unlimited receipts' }}</li>
                <li><mat-icon>check</mat-icon> Smart OCR extraction</li>
                <li><mat-icon>check</mat-icon> Stripe ACH payouts</li>
                <li><mat-icon>check</mat-icon> GPS mileage tracking</li>
                <li><mat-icon>check</mat-icon> Multi-level approvals</li>
                <li><mat-icon>check</mat-icon> API access</li>
                <li><mat-icon>check</mat-icon> {{ getSupportLevel(plan) }}</li>
              </ul>

              <div class="plan-action">
                @if (isCurrentPlan(plan)) {
                  <button mat-stroked-button disabled class="current-plan-btn">
                    <mat-icon>check</mat-icon>
                    Current Plan
                  </button>
                } @else if (plan.name === 'free' && currentPlan()) {
                  <button
                    mat-stroked-button
                    color="warn"
                    (click)="selectPlan(plan)"
                    [disabled]="processing()"
                  >
                    @if (processing() && selectedPlanId() === plan.id) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      Downgrade to Free
                    }
                  </button>
                } @else {
                  <button
                    mat-flat-button
                    [color]="plan.name === 'team' ? 'primary' : 'primary'"
                    [class.popular-btn]="plan.name === 'team'"
                    (click)="selectPlan(plan)"
                    [disabled]="processing()"
                  >
                    @if (processing() && selectedPlanId() === plan.id) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else if (isPlanUpgrade(plan)) {
                      Upgrade to {{ plan.display_name }}
                    } @else if (currentPlan()) {
                      Switch to {{ plan.display_name }}
                    } @else {
                      Get Started
                    }
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- Comparison Table -->
        <section class="comparison-section">
          <h2>Feature Comparison</h2>
          <div class="comparison-table">
            <div class="comparison-header">
              <div class="feature-name"></div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  {{ plan.display_name }}
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">Receipts per month</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  {{ plan.name === 'free' ? '20' : 'Unlimited' }}
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">Team members</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  {{ plan.max_users || 'Unlimited' }}
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">Stripe payouts</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  <mat-icon class="enabled">check</mat-icon>
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">GPS mileage tracking</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  <mat-icon class="enabled">check</mat-icon>
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">Multi-level approvals</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  <mat-icon class="enabled">check</mat-icon>
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">API access</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  <mat-icon class="enabled">check</mat-icon>
                </div>
              }
            </div>

            <div class="comparison-row">
              <div class="feature-name">Support level</div>
              @for (plan of plans(); track plan.id) {
                <div class="plan-col" [class.current]="isCurrentPlan(plan)">
                  {{ getSupportLevel(plan) }}
                </div>
              }
            </div>
          </div>
        </section>

        <!-- FAQ -->
        <section class="faq-section">
          <h2>Common Questions</h2>
          <div class="faq-grid">
            <div class="faq-item">
              <h3>What happens when I upgrade?</h3>
              <p>
                Your new features are available immediately. You'll be charged a prorated
                amount for the remainder of your billing period.
              </p>
            </div>
            <div class="faq-item">
              <h3>What happens when I downgrade?</h3>
              <p>
                You'll keep your current features until the end of your billing period,
                then switch to the new plan. No refunds for unused time.
              </p>
            </div>
            <div class="faq-item">
              <h3>Can I switch billing cycles?</h3>
              <p>
                Yes! Switch between monthly and annual at any time. Annual billing
                saves you 20% compared to monthly.
              </p>
            </div>
            <div class="faq-item">
              <h3>What payment methods do you accept?</h3>
              <p>
                We accept all major credit cards (Visa, Mastercard, Amex) through our
                secure payment processor, Stripe.
              </p>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .plan-selector-page {
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

    .subtitle strong {
      color: #ff5900;
    }

    .billing-toggle-container {
      display: flex;
      justify-content: center;
      margin-bottom: 32px;
    }

    .toggle-group {
      background: #f5f5f5;
      border-radius: 8px;
    }

    ::ng-deep .toggle-group .mat-button-toggle {
      background: transparent;
      color: #666;
    }

    ::ng-deep .toggle-group .mat-button-toggle-checked {
      background: #ff5900;
      color: white;
    }

    .save-badge {
      background: #4caf50;
      color: white;
      font-size: 0.65rem;
      padding: 2px 6px;
      border-radius: 4px;
      margin-left: 8px;
      font-weight: 600;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    .plans-container {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 24px;
      margin-bottom: 64px;
    }

    .plan-option {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 16px;
      padding: 32px 24px;
      position: relative;
      transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
    }

    .plan-option:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    }

    .plan-option.current {
      border-color: #ff5900;
      background: #fff5f0;
    }

    .plan-option.popular {
      border-color: #ff5900;
      transform: scale(1.02);
    }

    .plan-option.popular:hover {
      transform: scale(1.02) translateY(-4px);
    }

    .plan-option.disabled {
      pointer-events: none;
      opacity: 0.7;
    }

    .popular-badge,
    .current-badge {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .popular-badge {
      background: #ff5900;
      color: white;
    }

    .current-badge {
      background: #1a1a2e;
      color: white;
    }

    .plan-header {
      margin-bottom: 24px;
    }

    .plan-name {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .plan-description {
      font-size: 0.875rem;
      color: #666;
      margin: 0;
      min-height: 40px;
    }

    .plan-price {
      margin-bottom: 16px;
    }

    .price-amount {
      font-size: 3rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .price-amount.custom {
      font-size: 2rem;
    }

    .price-period {
      font-size: 1rem;
      color: #666;
      margin-left: 4px;
    }

    .monthly-equivalent {
      font-size: 0.8rem;
      color: #4caf50;
      margin-top: 4px;
    }

    .plan-users {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #f5f5f5;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 0.875rem;
      color: #333;
    }

    .plan-users mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #ff5900;
    }

    mat-divider {
      margin-bottom: 24px;
    }

    .plan-features {
      list-style: none;
      padding: 0;
      margin: 0 0 32px;
    }

    .plan-features li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      font-size: 0.9rem;
      color: #333;
    }

    .plan-features li.disabled {
      color: #999;
    }

    .plan-features mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #4caf50;
    }

    .plan-features li.disabled mat-icon {
      color: #ccc;
    }

    .plan-action {
      margin-top: auto;
    }

    .plan-action button {
      width: 100%;
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
    }

    .plan-action .popular-btn {
      background: #ff5900;
      box-shadow: 0 4px 16px rgba(255, 89, 0, 0.4);
    }

    .current-plan-btn {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    /* Comparison Table */
    .comparison-section {
      margin-bottom: 64px;
    }

    .comparison-section h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 24px;
      color: #1a1a2e;
      text-align: center;
    }

    .comparison-table {
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
    }

    .comparison-header,
    .comparison-row {
      display: grid;
      grid-template-columns: 200px repeat(5, 1fr);
      align-items: center;
    }

    .comparison-header {
      background: #1a1a2e;
      color: white;
      font-weight: 600;
    }

    .comparison-header .feature-name,
    .comparison-header .plan-col {
      padding: 16px;
    }

    .comparison-row {
      border-bottom: 1px solid #f0f0f0;
    }

    .comparison-row:last-child {
      border-bottom: none;
    }

    .comparison-row .feature-name {
      padding: 16px;
      font-weight: 500;
      color: #1a1a2e;
      background: #fafafa;
    }

    .comparison-row .plan-col {
      padding: 16px;
      text-align: center;
      color: #666;
    }

    .comparison-row .plan-col.current {
      background: #fff5f0;
    }

    .comparison-row .plan-col mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      color: #ccc;
    }

    .comparison-row .plan-col mat-icon.enabled {
      color: #4caf50;
    }

    /* FAQ */
    .faq-section h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 24px;
      color: #1a1a2e;
      text-align: center;
    }

    .faq-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }

    .faq-item {
      background: white;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
    }

    .faq-item h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 12px;
      color: #1a1a2e;
    }

    .faq-item p {
      font-size: 0.9rem;
      color: #666;
      line-height: 1.6;
      margin: 0;
    }

    /* Responsive */
    @media (max-width: 1200px) {
      .comparison-table {
        overflow-x: auto;
      }

      .comparison-header,
      .comparison-row {
        min-width: 800px;
      }
    }

    @media (max-width: 768px) {
      .plans-container {
        grid-template-columns: 1fr;
      }

      .plan-option.popular {
        transform: none;
      }

      .plan-option.popular:hover {
        transform: translateY(-4px);
      }

      .page-header h1 {
        font-size: 1.5rem;
      }
    }
  `],
})
export class PlanSelectorComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  // State
  loading = signal(true);
  processing = signal(false);
  plans = signal<SubscriptionPlan[]>([]);
  currentPlan = signal<SubscriptionPlan | null>(null);
  billingCycle = signal<BillingCycle>('monthly');
  selectedPlanId = signal<string | null>(null);

  // Plan order for comparison
  private planOrder = ['free', 'starter', 'team', 'business', 'enterprise'];

  ngOnInit(): void {
    // Check for billing cycle in query params
    this.route.queryParams.subscribe((params) => {
      if (params['cycle']) {
        this.billingCycle.set(params['cycle'] as BillingCycle);
      }
    });

    this.loadPlans();
  }

  private loadPlans(): void {
    this.subscriptionService.getPlans().subscribe({
      next: (plans) => {
        this.plans.set(plans);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });

    // Get current plan
    this.subscriptionService.subscription$.subscribe((sub) => {
      this.currentPlan.set(sub?.plan || null);
    });
  }

  setBillingCycle(cycle: BillingCycle): void {
    this.billingCycle.set(cycle);
  }

  getDisplayPrice(plan: SubscriptionPlan): string {
    if (this.billingCycle() === 'annual') {
      return (plan.annual_price_cents / 100).toFixed(2);
    }
    return (plan.monthly_price_cents / 100).toFixed(2);
  }

  getMonthlyEquivalent(plan: SubscriptionPlan): string {
    const annual = plan.annual_price_cents / 100;
    const monthly = annual / 12;
    return monthly.toFixed(2);
  }

  getSupportLevel(plan: SubscriptionPlan): string {
    const supportLevel = plan.features?.support_level || 'community';
    switch (supportLevel) {
      case 'dedicated':
        return 'Dedicated support';
      case 'priority':
        return 'Priority support';
      case 'email':
        return 'Email support';
      default:
        return 'Community support';
    }
  }

  isCurrentPlan(plan: SubscriptionPlan): boolean {
    const current = this.currentPlan();
    if (!current && plan.name === 'free') return true;
    return current?.id === plan.id;
  }

  isPlanUpgrade(plan: SubscriptionPlan): boolean {
    const current = this.currentPlan();
    if (!current) return plan.name !== 'free';

    const currentIndex = this.planOrder.indexOf(current.name);
    const newIndex = this.planOrder.indexOf(plan.name);
    return newIndex > currentIndex;
  }

  isUpgrade = computed(() => {
    return this.isPlanUpgrade.bind(this);
  });

  selectPlan(plan: SubscriptionPlan): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      // Not logged in, go to register
      this.router.navigate(['/auth/register'], {
        queryParams: {
          plan: plan.name,
          cycle: this.billingCycle(),
        },
      });
      return;
    }

    this.selectedPlanId.set(plan.id);
    this.processing.set(true);

    if (plan.name === 'free') {
      // Downgrading to free - cancel subscription
      this.subscriptionService.cancelSubscription(orgId).subscribe({
        next: () => {
          this.processing.set(false);
          this.router.navigate(['../'], { relativeTo: this.route });
        },
        error: () => {
          this.processing.set(false);
        },
      });
    } else if (this.currentPlan()) {
      // Changing plan
      this.subscriptionService.changePlan(orgId, plan.id).subscribe({
        next: () => {
          this.processing.set(false);
          this.router.navigate(['../'], { relativeTo: this.route });
        },
        error: () => {
          this.processing.set(false);
        },
      });
    } else {
      // New subscription - create checkout
      this.subscriptionService.createCheckoutSession(orgId, plan.id, this.billingCycle()).subscribe({
        next: (result) => {
          this.processing.set(false);
          // Redirect to Stripe Checkout
          window.location.href = result.url;
        },
        error: () => {
          this.processing.set(false);
        },
      });
    }
  }

  contactSales(): void {
    window.location.href = 'mailto:sales@expensed.app?subject=Enterprise%20Inquiry';
  }
}
