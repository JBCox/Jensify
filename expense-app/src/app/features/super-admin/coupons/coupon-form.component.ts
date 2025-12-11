import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { SuperAdminService } from '../../../core/services/super-admin.service';

/**
 * Coupon Form Component (Super Admin)
 *
 * Create new promotional coupons with:
 * - Custom code or auto-generated
 * - Percentage or fixed amount discount
 * - Expiration date
 * - Usage limits
 */
@Component({
  selector: 'app-coupon-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="coupon-form-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Create Coupon</h1>
          <p class="subtitle">Set up a new promotional discount code</p>
        </div>
      </header>

      <mat-card class="form-card">
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <!-- Code Section -->
          <section class="form-section">
            <h2>
              <mat-icon>local_offer</mat-icon>
              Coupon Code
            </h2>
            <mat-divider></mat-divider>

            <div class="form-row">
              <mat-form-field appearance="outline" class="code-field">
                <mat-label>Coupon Code</mat-label>
                <input
                  matInput
                  formControlName="code"
                  placeholder="e.g., SAVE20"
                  [style.text-transform]="'uppercase'"
                />
                <mat-hint>Letters and numbers only, 4-20 characters</mat-hint>
                @if (form.get('code')?.hasError('pattern')) {
                  <mat-error>Only letters and numbers allowed</mat-error>
                }
              </mat-form-field>
              <button
                mat-stroked-button
                type="button"
                (click)="generateCode()"
                class="generate-btn"
              >
                <mat-icon>auto_fix_high</mat-icon>
                Generate
              </button>
            </div>
          </section>

          <!-- Discount Section -->
          <section class="form-section">
            <h2>
              <mat-icon>discount</mat-icon>
              Discount Details
            </h2>
            <mat-divider></mat-divider>

            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Discount Type</mat-label>
                <mat-select formControlName="discount_type">
                  <mat-option value="percent">Percentage (%)</mat-option>
                  <mat-option value="fixed">Fixed Amount ($)</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>
                  {{ form.get('discount_type')?.value === 'percent' ? 'Percentage' : 'Amount ($)' }}
                </mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="discount_value"
                  [placeholder]="form.get('discount_type')?.value === 'percent' ? '20' : '10'"
                />
                @if (form.get('discount_type')?.value === 'percent') {
                  <span matSuffix>%</span>
                } @else {
                  <span matPrefix>$</span>
                }
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Applies To</mat-label>
              <mat-select formControlName="applies_to">
                <mat-option value="all_plans">All Plans</mat-option>
                <mat-option value="first_month">First Month Only</mat-option>
                <mat-option value="annual_only">Annual Plans Only</mat-option>
              </mat-select>
              <mat-hint>Choose which subscriptions this coupon applies to</mat-hint>
            </mat-form-field>
          </section>

          <!-- Limits Section -->
          <section class="form-section">
            <h2>
              <mat-icon>rule</mat-icon>
              Limits & Expiration
            </h2>
            <mat-divider></mat-divider>

            <div class="form-row">
              <mat-form-field appearance="outline">
                <mat-label>Maximum Redemptions</mat-label>
                <input
                  matInput
                  type="number"
                  formControlName="max_redemptions"
                  placeholder="Leave empty for unlimited"
                />
                <mat-hint>How many times this coupon can be used</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Expiration Date</mat-label>
                <input
                  matInput
                  [matDatepicker]="picker"
                  formControlName="expires_at"
                  placeholder="Optional"
                />
                <mat-datepicker-toggle matSuffix [for]="picker"></mat-datepicker-toggle>
                <mat-datepicker #picker></mat-datepicker>
                <mat-hint>Leave empty for no expiration</mat-hint>
              </mat-form-field>
            </div>
          </section>

          <!-- Description Section -->
          <section class="form-section">
            <h2>
              <mat-icon>description</mat-icon>
              Internal Notes
            </h2>
            <mat-divider></mat-divider>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Description (internal only)</mat-label>
              <textarea
                matInput
                formControlName="description"
                rows="3"
                placeholder="e.g., Summer 2025 promotion for new customers"
              ></textarea>
              <mat-hint>This is only visible to admins</mat-hint>
            </mat-form-field>
          </section>

          <!-- Preview -->
          <section class="preview-section">
            <h3>Preview</h3>
            <div class="preview-card">
              <div class="preview-code">{{ form.get('code')?.value || 'CODE' }}</div>
              <div class="preview-discount">
                @if (form.get('discount_type')?.value === 'percent') {
                  {{ form.get('discount_value')?.value || 0 }}% off
                } @else {
                  {{ '$' + (form.get('discount_value')?.value || 0) }} off
                }
              </div>
              <div class="preview-applies">
                {{ getAppliesToLabel() }}
              </div>
            </div>
          </section>

          <!-- Actions -->
          <div class="form-actions">
            <button mat-stroked-button type="button" routerLink="../">
              Cancel
            </button>
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || submitting()"
            >
              <mat-spinner *ngIf="submitting()" diameter="20"></mat-spinner>
              <ng-container *ngIf="!submitting()">
                <mat-icon>add</mat-icon>
                <span>Create Coupon</span>
              </ng-container>
            </button>
          </div>
        </form>
      </mat-card>
    </div>
  `,
  styles: [`
    .coupon-form-page {
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
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

    .form-card {
      border-radius: 12px;
      padding: 0;
      overflow: hidden;
    }

    .form-section {
      padding: 24px;
    }

    .form-section h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 16px;
      color: #1a1a2e;
    }

    .form-section h2 mat-icon {
      color: #ff5900;
    }

    mat-divider {
      margin-bottom: 20px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .form-row mat-form-field {
      flex: 1;
    }

    .code-field {
      flex: 1;
    }

    .generate-btn {
      height: 56px;
      margin-top: 4px;
    }

    .full-width {
      width: 100%;
    }

    ::ng-deep .form-section .mat-mdc-form-field-subscript-wrapper {
      height: 20px;
    }

    /* Preview */
    .preview-section {
      padding: 24px;
      background: #fafafa;
      border-top: 1px solid #e0e0e0;
    }

    .preview-section h3 {
      font-size: 0.85rem;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 16px;
    }

    .preview-card {
      background: white;
      border: 2px dashed #e0e0e0;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }

    .preview-code {
      font-size: 2rem;
      font-weight: 700;
      font-family: 'SF Mono', monospace;
      color: #1a1a2e;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .preview-discount {
      font-size: 1.25rem;
      font-weight: 600;
      color: #ff5900;
      margin-bottom: 4px;
    }

    .preview-applies {
      font-size: 0.875rem;
      color: #666;
    }

    /* Actions */
    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 24px;
      border-top: 1px solid #e0e0e0;
    }

    .form-actions button {
      min-width: 140px;
    }

    .btn-content {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .coupon-form-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .form-row {
        flex-direction: column;
      }

      .generate-btn {
        width: 100%;
      }
    }
  `],
})
export class CouponFormComponent {
  private fb = inject(FormBuilder);
  private superAdminService = inject(SuperAdminService);
  private router = inject(Router);

  submitting = signal(false);

  form: FormGroup = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9]+$/)]],
    discount_type: ['percent', Validators.required],
    discount_value: [20, [Validators.required, Validators.min(1)]],
    applies_to: ['all_plans', Validators.required],
    max_redemptions: [null],
    expires_at: [null],
    description: [''],
  });

  generateCode(): void {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.form.patchValue({ code });
  }

  getAppliesToLabel(): string {
    const labels: Record<string, string> = {
      all_plans: 'Applies to all plans',
      first_month: 'First month only',
      annual_only: 'Annual plans only',
    };
    return labels[this.form.get('applies_to')?.value] || '';
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.submitting.set(true);

    const formValue = this.form.value;
    const dto = {
      code: formValue.code.toUpperCase(),
      discount_type: formValue.discount_type,
      discount_value:
        formValue.discount_type === 'fixed'
          ? formValue.discount_value * 100 // Convert to cents
          : formValue.discount_value,
      applies_to: formValue.applies_to,
      max_redemptions: formValue.max_redemptions || undefined,
      expires_at: formValue.expires_at
        ? new Date(formValue.expires_at).toISOString()
        : undefined,
      description: formValue.description || undefined,
    };

    this.superAdminService.createCoupon(dto).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['../'], { relativeTo: undefined });
      },
      error: () => {
        this.submitting.set(false);
      },
    });
  }
}
