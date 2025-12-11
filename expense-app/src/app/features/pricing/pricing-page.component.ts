import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { SubscriptionService } from '../../core/services/subscription.service';
import { AuthService } from '../../core/services/auth.service';
import { SubscriptionPlan, BillingCycle } from '../../core/models/subscription.model';

/**
 * Public Pricing Page
 *
 * Displays subscription plans with:
 * - Monthly/Annual toggle (20% annual savings)
 * - Feature comparison
 * - Clear CTAs for each tier
 * - Enterprise contact option
 */
@Component({
  selector: 'app-pricing-page',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pricing-page">
      <!-- Hero Section -->
      <section class="pricing-hero">
        <div class="hero-content">
          <h1 class="hero-title">Simple, Transparent Pricing</h1>
          <p class="hero-subtitle">
            Start free, upgrade when you need more. No hidden fees, cancel anytime.
          </p>

          <!-- Billing Toggle -->
          <div class="billing-toggle">
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
        </div>
      </section>

      <!-- Plans Grid -->
      <section class="pricing-plans">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="48"></mat-spinner>
            <p>Loading plans...</p>
          </div>
        } @else {
          <div class="plans-grid">
            @for (plan of plans(); track plan.id) {
              <div
                class="plan-card"
                [class.popular]="plan.name === 'team'"
                [class.free]="plan.name === 'free'"
              >
                @if (plan.name === 'team') {
                  <div class="popular-badge">Most Popular</div>
                }

                <div class="plan-header">
                  <h2 class="plan-name">{{ plan.display_name }}</h2>
                  <p class="plan-description">{{ plan.description }}</p>
                </div>

                <div class="plan-price">
                  @if (plan.name === 'free') {
                    <span class="price-amount">$0</span>
                    <span class="price-period">forever</span>
                  } @else if (plan.name === 'enterprise') {
                    <span class="price-amount">Custom</span>
                    <span class="price-period">contact us</span>
                  } @else {
                    <span class="price-amount">{{ '$' + getDisplayPrice(plan) }}</span>
                    <span class="price-period">
                      /{{ billingCycle() === 'annual' ? 'year' : 'month' }}
                    </span>
                    @if (billingCycle() === 'annual' && plan.monthly_price_cents > 0) {
                      <div class="annual-savings">
                        Save {{ '$' + getAnnualSavings(plan) }}/year
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
                  <!-- Receipt limit - varies by plan -->
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>{{ plan.name === 'free' ? '20 receipts/month' : 'Unlimited receipts' }}</span>
                  </li>

                  <!-- All plans have full features -->
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>Smart OCR extraction</span>
                  </li>
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>Stripe ACH payouts</span>
                  </li>
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>GPS mileage tracking</span>
                  </li>
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>Multi-level approvals</span>
                  </li>
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>API access</span>
                  </li>
                  <li class="feature">
                    <mat-icon class="feature-icon included">check_circle</mat-icon>
                    <span>{{ getSupportLevel(plan) }}</span>
                  </li>

                  @if (plan.name === 'enterprise') {
                    <li class="feature">
                      <mat-icon class="feature-icon included">check_circle</mat-icon>
                      <span>Dedicated account manager</span>
                    </li>
                  }
                </ul>

                <div class="plan-cta">
                  @if (plan.name === 'free') {
                    <button
                      mat-flat-button
                      class="cta-button free"
                      (click)="selectPlan(plan)"
                    >
                      Get Started Free
                    </button>
                  } @else if (plan.name === 'enterprise') {
                    <button
                      mat-stroked-button
                      class="cta-button enterprise"
                      (click)="contactSales()"
                    >
                      Contact Sales
                    </button>
                  } @else {
                    <button
                      mat-flat-button
                      class="cta-button paid"
                      [class.popular]="plan.name === 'team'"
                      (click)="selectPlan(plan)"
                    >
                      Start {{ plan.display_name }}
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }
      </section>

      <!-- FAQ Section -->
      <section class="pricing-faq">
        <h2 class="faq-title">Frequently Asked Questions</h2>

        <div class="faq-grid">
          <div class="faq-item">
            <h3>Can I switch plans anytime?</h3>
            <p>
              Yes! You can upgrade or downgrade your plan at any time.
              Upgrades take effect immediately with prorated billing.
              Downgrades apply at the end of your billing period.
            </p>
          </div>

          <div class="faq-item">
            <h3>What happens when I hit my receipt limit?</h3>
            <p>
              On the free plan, you'll be prompted to upgrade when you reach
              20 receipts/month. Your existing data is never deleted.
            </p>
          </div>

          <div class="faq-item">
            <h3>Do you offer refunds?</h3>
            <p>
              Yes, we offer a 30-day money-back guarantee. If you're not
              satisfied, contact us for a full refund.
            </p>
          </div>

          <div class="faq-item">
            <h3>How does annual billing work?</h3>
            <p>
              Annual billing is paid upfront for the full year at a 20%
              discount. You can switch to annual billing at any time.
            </p>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="pricing-cta-section">
        <div class="cta-content">
          <h2>Ready to simplify your expense management?</h2>
          <p>Join thousands of teams already using Expensed</p>
          <button mat-flat-button class="final-cta" (click)="getStarted()">
            Start Your Free Trial
          </button>
        </div>
      </section>
    </div>
  `,
  styles: [`
    .pricing-page {
      min-height: 100vh;
      background: linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%);
    }

    /* Hero Section */
    .pricing-hero {
      padding: 80px 24px 48px;
      text-align: center;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }

    .hero-title {
      font-size: 3rem;
      font-weight: 700;
      margin: 0 0 16px;
      letter-spacing: -0.02em;
    }

    .hero-subtitle {
      font-size: 1.25rem;
      color: rgba(255, 255, 255, 0.8);
      margin: 0 0 32px;
      max-width: 600px;
      margin-left: auto;
      margin-right: auto;
    }

    .billing-toggle {
      display: inline-block;
    }

    .toggle-group {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
    }

    ::ng-deep .toggle-group .mat-button-toggle {
      background: transparent;
      color: rgba(255, 255, 255, 0.7);
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
      text-transform: uppercase;
    }

    /* Plans Grid */
    .pricing-plans {
      padding: 48px 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    .plans-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
      align-items: start;
    }

    .plan-card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      position: relative;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .plan-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    }

    .plan-card.popular {
      border: 2px solid #ff5900;
      transform: scale(1.02);
    }

    .plan-card.popular:hover {
      transform: scale(1.02) translateY(-4px);
    }

    .popular-badge {
      position: absolute;
      top: -12px;
      left: 50%;
      transform: translateX(-50%);
      background: #ff5900;
      color: white;
      padding: 6px 16px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
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
    }

    .plan-price {
      margin-bottom: 16px;
    }

    .price-amount {
      font-size: 3rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .price-period {
      font-size: 1rem;
      color: #666;
      margin-left: 4px;
    }

    .annual-savings {
      font-size: 0.875rem;
      color: #4caf50;
      font-weight: 500;
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

    .feature {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
      font-size: 0.9rem;
      color: #333;
    }

    .feature.muted {
      color: #999;
    }

    .feature-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .feature-icon.included {
      color: #4caf50;
    }

    .feature-icon.excluded {
      color: #ccc;
    }

    .plan-cta {
      margin-top: auto;
    }

    .cta-button {
      width: 100%;
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
    }

    .cta-button.free {
      background: #1a1a2e;
      color: white;
    }

    .cta-button.paid {
      background: #ff5900;
      color: white;
    }

    .cta-button.paid.popular {
      background: #ff5900;
      box-shadow: 0 4px 16px rgba(255, 89, 0, 0.4);
    }

    .cta-button.enterprise {
      border-color: #1a1a2e;
      color: #1a1a2e;
    }

    /* FAQ Section */
    .pricing-faq {
      padding: 64px 24px;
      max-width: 1000px;
      margin: 0 auto;
    }

    .faq-title {
      text-align: center;
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 48px;
      color: #1a1a2e;
    }

    .faq-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 32px;
    }

    .faq-item h3 {
      font-size: 1.1rem;
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

    /* CTA Section */
    .pricing-cta-section {
      padding: 80px 24px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      text-align: center;
    }

    .cta-content h2 {
      font-size: 2rem;
      font-weight: 700;
      color: white;
      margin: 0 0 12px;
    }

    .cta-content p {
      font-size: 1.1rem;
      color: rgba(255, 255, 255, 0.8);
      margin: 0 0 32px;
    }

    .final-cta {
      background: #ff5900;
      color: white;
      padding: 16px 48px;
      font-size: 1.1rem;
      font-weight: 600;
      border-radius: 8px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .hero-title {
        font-size: 2rem;
      }

      .hero-subtitle {
        font-size: 1rem;
      }

      .plans-grid {
        grid-template-columns: 1fr;
      }

      .plan-card.popular {
        transform: none;
      }

      .plan-card.popular:hover {
        transform: translateY(-4px);
      }

      .price-amount {
        font-size: 2.5rem;
      }
    }
  `],
})
export class PricingPageComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private authService = inject(AuthService);
  private router = inject(Router);

  plans = signal<SubscriptionPlan[]>([]);
  loading = signal(true);
  billingCycle = signal<BillingCycle>('monthly');

  ngOnInit(): void {
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

  getAnnualSavings(plan: SubscriptionPlan): string {
    const monthlyTotal = plan.monthly_price_cents * 12;
    const annualTotal = plan.annual_price_cents;
    const savings = (monthlyTotal - annualTotal) / 100;
    return savings.toFixed(0);
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

  selectPlan(plan: SubscriptionPlan): void {
    // Check if user is logged in
    if (this.authService.isAuthenticated) {
      // If free plan, just go to dashboard
      if (plan.name === 'free') {
        this.router.navigate(['/dashboard']);
      } else {
        // Go to billing page to start checkout
        this.router.navigate(['/organization/billing'], {
          queryParams: {
            plan: plan.id,
            cycle: this.billingCycle(),
          },
        });
      }
    } else {
      // Not logged in, go to register with plan info
      this.router.navigate(['/auth/register'], {
        queryParams: {
          plan: plan.name,
          cycle: this.billingCycle(),
        },
      });
    }
  }

  contactSales(): void {
    window.location.href = 'mailto:sales@expensed.app?subject=Enterprise%20Inquiry';
  }

  getStarted(): void {
    if (this.authService.isAuthenticated) {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/auth/register']);
    }
  }
}
