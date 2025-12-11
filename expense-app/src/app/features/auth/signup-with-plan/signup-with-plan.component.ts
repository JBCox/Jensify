import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { SubscriptionService } from '../../../core/services/subscription.service';

interface PlanOption {
  id: string;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  maxUsers: number;
  popular?: boolean;
}

/**
 * Signup With Plan Component
 *
 * Multi-step registration flow:
 * 1. Select a plan
 * 2. Create account
 * 3. Redirect to payment (for paid plans) or dashboard (for free)
 *
 * Can be pre-seeded with a plan from query params (e.g., /auth/signup?plan=team)
 */
@Component({
  selector: 'app-signup-with-plan',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatStepperModule,
    MatButtonToggleModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="signup-container">
      <div class="signup-layout">
        <!-- Left: Benefits -->
        <div class="benefits-panel">
          <div class="brand-header">
            <img src="assets/images/stacked-256.png" alt="Expensed" class="brand-logo" />
          </div>
          <h2>Expense management made simple</h2>
          <ul class="benefits-list">
            <li>
              <mat-icon>photo_camera</mat-icon>
              <div>
                <strong>SmartScan OCR</strong>
                <span>Snap a receipt, we extract the details</span>
              </div>
            </li>
            <li>
              <mat-icon>gps_fixed</mat-icon>
              <div>
                <strong>GPS Mileage</strong>
                <span>Automatic IRS-compliant tracking</span>
              </div>
            </li>
            <li>
              <mat-icon>account_balance</mat-icon>
              <div>
                <strong>Direct Payouts</strong>
                <span>ACH reimbursements in 2 days</span>
              </div>
            </li>
            <li>
              <mat-icon>verified</mat-icon>
              <div>
                <strong>Approval Workflows</strong>
                <span>Multi-level review automation</span>
              </div>
            </li>
          </ul>

          <div class="testimonial">
            <p>"Expensed cut our expense processing time by 80%"</p>
            <div class="testimonial-author">
              <strong>Josh, Shipping Manager</strong>
              <span>Corvaer Manufacturing</span>
            </div>
          </div>
        </div>

        <!-- Right: Signup Steps -->
        <div class="signup-panel">
          <mat-stepper #stepper [linear]="true" [selectedIndex]="currentStep()">
            <!-- Step 1: Choose Plan -->
            <mat-step [completed]="selectedPlan() !== null" label="Choose Plan">
              <div class="step-content">
                <h1>Choose your plan</h1>
                <p class="step-subtitle">Start free or unlock all features instantly</p>

                <!-- Billing Toggle -->
                <div class="billing-toggle">
                  <mat-button-toggle-group [(ngModel)]="billingCycle">
                    <mat-button-toggle value="monthly">Monthly</mat-button-toggle>
                    <mat-button-toggle value="annual">
                      Annual <span class="save-badge">-20%</span>
                    </mat-button-toggle>
                  </mat-button-toggle-group>
                </div>

                <!-- Plan Cards -->
                <div class="plan-grid">
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
                        <span class="popular-tag">Popular</span>
                      }
                      <h3>{{ plan.name }}</h3>
                      <div class="plan-price">
                        @if (plan.monthlyPrice === 0) {
                          <span class="price">$0</span>
                          <span class="period">forever</span>
                        } @else {
                          <span class="price">{{ '$' + getDisplayPrice(plan) }}</span>
                          <span class="period">/user/mo</span>
                        }
                      </div>
                      <div class="plan-users">Up to {{ plan.maxUsers }} users</div>
                    </div>
                  }
                </div>

                <button
                  mat-flat-button
                  color="primary"
                  class="continue-btn"
                  [disabled]="!selectedPlan()"
                  (click)="goToStep(1)"
                >
                  @if (selectedPlan() === 'free') {
                    Continue with Free
                  } @else {
                    Continue with {{ getSelectedPlanName() }}
                  }
                  <mat-icon>arrow_forward</mat-icon>
                </button>
              </div>
            </mat-step>

            <!-- Step 2: Create Account -->
            <mat-step [stepControl]="registerForm" label="Create Account">
              <div class="step-content">
                <h1>Create your account</h1>
                <p class="step-subtitle">
                  @if (selectedPlan() === 'free') {
                    No credit card required
                  } @else {
                    You'll add payment details after signup
                  }
                </p>

                <!-- Error Message -->
                @if (errorMessage()) {
                  <div class="error-message">
                    <mat-icon>error</mat-icon>
                    {{ errorMessage() }}
                  </div>
                }

                <form [formGroup]="registerForm" (ngSubmit)="onSubmit()">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Full Name</mat-label>
                    <mat-icon matPrefix>person</mat-icon>
                    <input matInput formControlName="fullName" placeholder="John Doe" />
                    @if (registerForm.get('fullName')?.hasError('required')) {
                      <mat-error>Full name is required</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Work Email</mat-label>
                    <mat-icon matPrefix>email</mat-icon>
                    <input matInput formControlName="email" type="email" placeholder="you@company.com" />
                    @if (registerForm.get('email')?.hasError('required')) {
                      <mat-error>Email is required</mat-error>
                    }
                    @if (registerForm.get('email')?.hasError('email')) {
                      <mat-error>Enter a valid email</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Password</mat-label>
                    <mat-icon matPrefix>lock</mat-icon>
                    <input
                      matInput
                      [type]="hidePassword ? 'password' : 'text'"
                      formControlName="password"
                      placeholder="8+ characters"
                    />
                    <button
                      mat-icon-button
                      matSuffix
                      type="button"
                      (click)="hidePassword = !hidePassword"
                    >
                      <mat-icon>{{ hidePassword ? 'visibility_off' : 'visibility' }}</mat-icon>
                    </button>
                    @if (registerForm.get('password')?.hasError('required')) {
                      <mat-error>Password is required</mat-error>
                    }
                    @if (registerForm.get('password')?.hasError('minlength')) {
                      <mat-error>At least 8 characters</mat-error>
                    }
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>Organization Name</mat-label>
                    <mat-icon matPrefix>business</mat-icon>
                    <input matInput formControlName="organizationName" placeholder="Acme Inc." />
                    @if (registerForm.get('organizationName')?.hasError('required')) {
                      <mat-error>Organization name is required</mat-error>
                    }
                  </mat-form-field>

                  <div class="form-actions">
                    <button
                      mat-stroked-button
                      type="button"
                      (click)="goToStep(0)"
                    >
                      <mat-icon>arrow_back</mat-icon>
                      Back
                    </button>
                    <button
                      mat-flat-button
                      color="primary"
                      type="submit"
                      [disabled]="registerForm.invalid || processing()"
                    >
                      @if (processing()) {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else if (selectedPlan() === 'free') {
                        Create Account
                      } @else {
                        Continue to Payment
                      }
                    </button>
                  </div>
                </form>

                <p class="terms">
                  By creating an account, you agree to our
                  <a href="/terms" target="_blank">Terms of Service</a>
                  and
                  <a href="/privacy" target="_blank">Privacy Policy</a>
                </p>
              </div>
            </mat-step>
          </mat-stepper>

          <div class="login-link">
            Already have an account?
            <a routerLink="/auth/login">Sign in</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .signup-container {
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    }

    .signup-layout {
      display: flex;
      min-height: 100vh;
    }

    /* Benefits Panel */
    .benefits-panel {
      flex: 0 0 420px;
      padding: 48px;
      color: white;
      display: flex;
      flex-direction: column;
    }

    .brand-header {
      margin-bottom: 48px;
    }

    .brand-logo {
      height: 48px;
    }

    .benefits-panel h2 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 32px;
      line-height: 1.2;
    }

    .benefits-list {
      list-style: none;
      padding: 0;
      margin: 0 0 48px;
    }

    .benefits-list li {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }

    .benefits-list mat-icon {
      color: #ff5900;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .benefits-list strong {
      display: block;
      font-size: 1rem;
      margin-bottom: 4px;
    }

    .benefits-list span {
      font-size: 0.875rem;
      opacity: 0.8;
    }

    .testimonial {
      margin-top: auto;
      padding: 24px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      border-left: 4px solid #ff5900;
    }

    .testimonial p {
      font-size: 1.1rem;
      font-style: italic;
      margin: 0 0 12px;
    }

    .testimonial-author strong {
      display: block;
      font-size: 0.875rem;
    }

    .testimonial-author span {
      font-size: 0.75rem;
      opacity: 0.7;
    }

    /* Signup Panel */
    .signup-panel {
      flex: 1;
      background: white;
      border-radius: 24px 0 0 24px;
      padding: 48px;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
    }

    ::ng-deep .signup-panel .mat-horizontal-stepper-header-container {
      margin-bottom: 32px;
    }

    .step-content {
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
    }

    .step-content h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 8px;
    }

    .step-subtitle {
      font-size: 1rem;
      color: #666;
      margin: 0 0 24px;
    }

    /* Billing Toggle */
    .billing-toggle {
      display: flex;
      justify-content: center;
      margin-bottom: 24px;
    }

    ::ng-deep .billing-toggle .mat-button-toggle-group {
      border-radius: 20px;
      border: 2px solid #e0e0e0;
    }

    ::ng-deep .billing-toggle .mat-button-toggle {
      border: none !important;
    }

    ::ng-deep .billing-toggle .mat-button-toggle-button {
      padding: 6px 16px;
      font-size: 0.875rem;
    }

    ::ng-deep .billing-toggle .mat-button-toggle-checked {
      background: #ff5900;
      color: white;
    }

    .save-badge {
      background: #4caf50;
      color: white;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 0.65rem;
      font-weight: 600;
      margin-left: 4px;
    }

    /* Plan Grid */
    .plan-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }

    .plan-card {
      border: 2px solid #e0e0e0;
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      position: relative;
    }

    .plan-card:hover {
      border-color: #ff5900;
    }

    .plan-card.selected {
      border-color: #ff5900;
      background: #fff5f0;
    }

    .plan-card.popular {
      border-color: #ff5900;
    }

    .popular-tag {
      position: absolute;
      top: -10px;
      right: 12px;
      background: #ff5900;
      color: white;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.65rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .plan-card h3 {
      font-size: 1rem;
      font-weight: 600;
      color: #1a1a2e;
      margin: 0 0 8px;
    }

    .plan-price {
      margin-bottom: 4px;
    }

    .plan-price .price {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .plan-price .period {
      font-size: 0.75rem;
      color: #666;
    }

    .plan-users {
      font-size: 0.75rem;
      color: #999;
    }

    .continue-btn {
      width: 100%;
      padding: 14px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
    }

    /* Form */
    .full-width {
      width: 100%;
      margin-bottom: 16px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #ffebee;
      color: #c62828;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 0.875rem;
    }

    .error-message mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }

    .form-actions button {
      flex: 1;
      padding: 14px;
      font-weight: 600;
    }

    .terms {
      font-size: 0.75rem;
      color: #999;
      text-align: center;
      margin-top: 16px;
    }

    .terms a {
      color: #ff5900;
      text-decoration: none;
    }

    .login-link {
      text-align: center;
      margin-top: auto;
      padding-top: 24px;
      font-size: 0.875rem;
      color: #666;
    }

    .login-link a {
      color: #ff5900;
      text-decoration: none;
      font-weight: 600;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .signup-layout {
        flex-direction: column;
      }

      .benefits-panel {
        flex: none;
        padding: 32px 24px;
      }

      .benefits-panel h2 {
        font-size: 1.5rem;
      }

      .benefits-list {
        display: none;
      }

      .testimonial {
        display: none;
      }

      .signup-panel {
        border-radius: 24px 24px 0 0;
        padding: 32px 24px;
      }

      .plan-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 480px) {
      .plan-grid {
        grid-template-columns: 1fr;
      }

      .form-actions {
        flex-direction: column;
      }
    }
  `],
})
export class SignupWithPlanComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private subscriptionService = inject(SubscriptionService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();

  currentStep = signal(0);
  selectedPlan = signal<string | null>(null);
  processing = signal(false);
  errorMessage = signal('');
  hidePassword = true;
  billingCycle: 'monthly' | 'annual' = 'monthly';

  plans: PlanOption[] = [
    { id: 'free', name: 'Free', monthlyPrice: 0, annualPrice: 0, maxUsers: 3 },
    { id: 'starter', name: 'Starter', monthlyPrice: 9.99, annualPrice: 95.90, maxUsers: 5 },
    { id: 'team', name: 'Team', monthlyPrice: 18.99, annualPrice: 182.30, maxUsers: 10, popular: true },
    { id: 'business', name: 'Business', monthlyPrice: 29.99, annualPrice: 287.90, maxUsers: 20 },
    { id: 'enterprise', name: 'Enterprise', monthlyPrice: 59.99, annualPrice: 575.90, maxUsers: 50 },
  ];

  registerForm: FormGroup = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    organizationName: ['', [Validators.required, Validators.minLength(2)]],
  });

  ngOnInit(): void {
    // Check for plan in query params
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['plan']) {
        const planId = params['plan'].toLowerCase();
        const plan = this.plans.find((p) => p.id === planId);
        if (plan) {
          this.selectedPlan.set(planId);
          this.currentStep.set(1); // Jump to account creation
        }
      }
      if (params['billing']) {
        this.billingCycle = params['billing'] === 'annual' ? 'annual' : 'monthly';
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectPlan(planId: string): void {
    this.selectedPlan.set(planId);
  }

  /** Get the display price for a plan based on billing cycle */
  getDisplayPrice(plan: PlanOption): string {
    if (this.billingCycle === 'monthly') {
      return plan.monthlyPrice.toFixed(0);
    }
    return (plan.annualPrice / 12).toFixed(0);
  }

  getSelectedPlanName(): string {
    const plan = this.plans.find((p) => p.id === this.selectedPlan());
    return plan?.name || '';
  }

  goToStep(step: number): void {
    this.currentStep.set(step);
    this.cdr.markForCheck();
  }

  async onSubmit(): Promise<void> {
    if (this.registerForm.invalid) {
      Object.values(this.registerForm.controls).forEach((c) => c.markAsTouched());
      return;
    }

    this.errorMessage.set('');
    this.processing.set(true);

    const { fullName, email, password, organizationName } = this.registerForm.value;

    // Register the user
    this.authService
      .register({
        email,
        password,
        full_name: fullName,
        confirm_password: password,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.success) {
            // Store organization name for setup
            sessionStorage.setItem('pendingOrganization', organizationName);
            sessionStorage.setItem('selectedPlan', this.selectedPlan() || 'free');
            sessionStorage.setItem('billingCycle', this.billingCycle);

            if (this.selectedPlan() === 'free') {
              // Redirect to email confirmation
              this.router.navigate(['/auth/confirm-email'], {
                queryParams: { email },
              });
            } else {
              // For paid plans, redirect to Stripe Checkout after email confirmation
              // Store the intent so we can redirect after email verification
              sessionStorage.setItem('postAuthRedirect', 'checkout');
              this.router.navigate(['/auth/confirm-email'], {
                queryParams: { email, plan: this.selectedPlan() },
              });
            }
          } else {
            this.errorMessage.set(result.error || 'Registration failed');
          }
          this.processing.set(false);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.errorMessage.set(
            err.message?.includes('already')
              ? 'This email is already registered'
              : 'Registration failed. Please try again.'
          );
          this.processing.set(false);
          this.cdr.markForCheck();
        },
      });
  }
}
