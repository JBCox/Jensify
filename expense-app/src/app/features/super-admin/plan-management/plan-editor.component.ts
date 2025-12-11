import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { SubscriptionPlan, PlanFeatures } from '../../../core/models/subscription.model';
import { LoggerService } from '../../../core/services/logger.service';

/**
 * Plan Editor Component
 * Allows editing subscription plan details, pricing, and features
 */
@Component({
  selector: 'app-plan-editor',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './plan-editor.component.html',
  styles: [`
    .plan-editor-container {
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-left h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: white;
    }

    .subtitle {
      margin: 4px 0 0;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      text-align: center;
      gap: 16px;
    }

    .loading-container p {
      color: rgba(255, 255, 255, 0.7);
    }

    .plan-form {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .form-card {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
    }

    .header-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 89, 0, 0.2);
      color: #ff5900;
    }

    .header-icon.pricing {
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
    }

    .header-icon.users {
      background: rgba(33, 150, 243, 0.2);
      color: #2196f3;
    }

    .header-icon.features {
      background: rgba(156, 39, 176, 0.2);
      color: #9c27b0;
    }

    .header-icon.visibility {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
    }

    .card-header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 500;
      color: white;
    }

    .card-header p {
      margin: 4px 0 0;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .card-content {
      padding: 24px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-row:last-child {
      margin-bottom: 0;
    }

    .form-field {
      flex: 1;
    }

    .feature-toggles {
      display: flex;
      flex-direction: column;
    }

    .feature-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
    }

    .feature-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .feature-icon {
      color: rgba(255, 255, 255, 0.5);
    }

    .feature-info strong {
      display: block;
      color: white;
      font-weight: 500;
    }

    .feature-info p {
      margin: 4px 0 0;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .feature-divider {
      border-color: rgba(255, 255, 255, 0.1);
    }

    .receipt-input {
      margin-top: 16px;
      max-width: 200px;
    }

    .support-select {
      min-width: 200px;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
    }

    .toggle-info strong {
      display: block;
      color: white;
      font-weight: 500;
    }

    .toggle-info p {
      margin: 4px 0 0;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .toggle-divider {
      border-color: rgba(255, 255, 255, 0.1);
    }

    /* Material overrides */
    ::ng-deep .form-card .mat-mdc-form-field {
      width: 100%;
    }

    ::ng-deep .form-card .mdc-text-field--filled {
      background-color: rgba(255, 255, 255, 0.05);
    }

    ::ng-deep .form-card .mat-mdc-form-field-focus-overlay {
      background-color: rgba(255, 255, 255, 0.05);
    }

    ::ng-deep .form-card .mdc-floating-label {
      color: rgba(255, 255, 255, 0.7);
    }

    ::ng-deep .form-card .mat-mdc-input-element {
      color: white;
    }

    ::ng-deep .form-card .mat-mdc-select-value {
      color: white;
    }

    ::ng-deep .form-card .mat-mdc-form-field-hint {
      color: rgba(255, 255, 255, 0.5);
    }

    @media (max-width: 600px) {
      .plan-editor-container {
        padding: 16px;
      }

      .header-content {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-actions {
        width: 100%;
        justify-content: flex-end;
      }

      .form-row {
        flex-direction: column;
      }

      .feature-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .toggle-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
    }
  `],
})
export class PlanEditorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private superAdminService = inject(SuperAdminService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  isLoading = signal(true);
  isSaving = signal(false);
  planId = signal<string | null>(null);
  currentPlan = signal<SubscriptionPlan | null>(null);

  supportLevels = [
    { value: 'community', label: 'Community (Forum Only)' },
    { value: 'email', label: 'Email Support' },
    { value: 'priority', label: 'Priority Support' },
    { value: 'dedicated', label: 'Dedicated Support' },
  ];

  planForm = this.fb.group({
    display_name: ['', Validators.required],
    description: [''],
    monthly_price_dollars: [0, [Validators.required, Validators.min(0)]],
    annual_price_dollars: [0, [Validators.required, Validators.min(0)]],
    min_users: [1, [Validators.required, Validators.min(1)]],
    max_users: [null as number | null],
    stripe_product_id: [''],
    stripe_monthly_price_id: [''],
    stripe_annual_price_id: [''],
    stripe_payouts_enabled: [false],
    api_access_enabled: [false],
    mileage_gps_enabled: [false],
    multi_level_approval: [false],
    receipts_per_month: [null as number | null],
    unlimited_receipts: [false],
    support_level: ['community' as 'community' | 'email' | 'priority' | 'dedicated', Validators.required],
    is_active: [true],
    is_public: [true],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.planId.set(id);

    if (id) {
      this.loadPlan(id);
    } else {
      this.isLoading.set(false);
    }

    // Handle unlimited receipts toggle
    this.planForm.get('unlimited_receipts')?.valueChanges.subscribe((unlimited) => {
      const receiptsControl = this.planForm.get('receipts_per_month');
      if (unlimited) {
        receiptsControl?.setValue(null);
        receiptsControl?.disable();
      } else {
        receiptsControl?.enable();
      }
    });
  }

  private loadPlan(id: string): void {
    this.isLoading.set(true);

    this.superAdminService.getAllPlans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plans) => {
          const plan = plans.find(p => p.id === id);
          if (plan) {
            this.currentPlan.set(plan);
            this.populateForm(plan);
          } else {
            this.snackBar.open('Plan not found', 'Close', {
              duration: 3000,
              horizontalPosition: 'end',
              verticalPosition: 'top',
            });
            this.router.navigate(['/super-admin/plans']);
          }
          this.isLoading.set(false);
        },
        error: (err) => {
          this.logger.error('Failed to load plan', err as Error, 'PlanEditorComponent.loadPlan', { planId: id });
          this.snackBar.open('Failed to load plan', 'Close', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
          this.isLoading.set(false);
        }
      });
  }

  private populateForm(plan: SubscriptionPlan): void {
    this.planForm.patchValue({
      display_name: plan.display_name,
      description: plan.description || '',
      monthly_price_dollars: plan.monthly_price_cents / 100,
      annual_price_dollars: plan.annual_price_cents / 100,
      min_users: plan.min_users,
      max_users: plan.max_users,
      stripe_product_id: plan.stripe_product_id || '',
      stripe_monthly_price_id: plan.stripe_monthly_price_id || '',
      stripe_annual_price_id: plan.stripe_annual_price_id || '',
      stripe_payouts_enabled: plan.features.stripe_payouts_enabled,
      api_access_enabled: plan.features.api_access_enabled,
      mileage_gps_enabled: plan.features.mileage_gps_enabled,
      multi_level_approval: plan.features.multi_level_approval,
      receipts_per_month: plan.features.receipts_per_month,
      unlimited_receipts: plan.features.receipts_per_month === null,
      support_level: plan.features.support_level,
      is_active: plan.is_active,
      is_public: plan.is_public,
    });
  }

  save(): void {
    if (this.planForm.invalid) {
      this.snackBar.open('Please fix validation errors', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    const planId = this.planId();
    if (!planId) {
      this.snackBar.open('No plan ID available', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    this.isSaving.set(true);

    const formValue = this.planForm.getRawValue();
    const features: PlanFeatures = {
      stripe_payouts_enabled: formValue.stripe_payouts_enabled ?? false,
      api_access_enabled: formValue.api_access_enabled ?? false,
      mileage_gps_enabled: formValue.mileage_gps_enabled ?? false,
      multi_level_approval: formValue.multi_level_approval ?? false,
      receipts_per_month: formValue.unlimited_receipts ? null : formValue.receipts_per_month,
      support_level: formValue.support_level ?? 'community',
    };

    const updateDto = {
      plan_id: planId,
      display_name: formValue.display_name || undefined,
      description: formValue.description || undefined,
      monthly_price_cents: Math.round((formValue.monthly_price_dollars || 0) * 100),
      annual_price_cents: Math.round((formValue.annual_price_dollars || 0) * 100),
      min_users: formValue.min_users || 1,
      max_users: formValue.max_users,
      stripe_product_id: formValue.stripe_product_id || undefined,
      stripe_monthly_price_id: formValue.stripe_monthly_price_id || undefined,
      stripe_annual_price_id: formValue.stripe_annual_price_id || undefined,
      features,
      is_active: formValue.is_active ?? true,
      is_public: formValue.is_public ?? true,
    };

    this.superAdminService.updatePlan(updateDto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.snackBar.open('Plan saved successfully', 'Close', {
            duration: 2000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
          this.router.navigate(['/super-admin/plans']);
        },
        error: (err) => {
          this.logger.error('Failed to save plan', err as Error, 'PlanEditorComponent.save', { planId });
          this.isSaving.set(false);
          this.snackBar.open('Failed to save plan', 'Close', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/super-admin/plans']);
  }
}
