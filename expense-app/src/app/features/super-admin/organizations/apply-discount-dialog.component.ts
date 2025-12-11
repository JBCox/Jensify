import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';

export interface ApplyDiscountDialogData {
  organizationName: string;
  organizationId: string;
  currentDiscount?: number;
}

export interface ApplyDiscountDialogResult {
  discount_percent: number;
  duration: 'forever' | 'months';
  duration_months?: number;
  reason: string;
}

/**
 * Apply Discount Dialog
 *
 * Allows super admins to apply a percentage discount to an organization's subscription.
 * Replaces the old prompt() implementation with a proper form.
 */
@Component({
  selector: 'app-apply-discount-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSliderModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      <mat-icon>discount</mat-icon>
      Apply Discount
    </h2>

    <mat-dialog-content>
      <p class="org-name">
        Applying discount to <strong>{{ data.organizationName }}</strong>
      </p>

      @if (data.currentDiscount) {
        <div class="current-discount">
          <mat-icon>info</mat-icon>
          Currently has {{ data.currentDiscount }}% discount applied
        </div>
      }

      <form [formGroup]="form" class="discount-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Discount Percentage</mat-label>
          <input
            matInput
            type="number"
            formControlName="discount_percent"
            min="1"
            max="100"
          />
          <span matTextSuffix>%</span>
          <mat-hint>e.g., 20 for 20% off</mat-hint>
          @if (form.get('discount_percent')?.hasError('required')) {
            <mat-error>Discount percentage is required</mat-error>
          }
          @if (form.get('discount_percent')?.hasError('min')) {
            <mat-error>Must be at least 1%</mat-error>
          }
          @if (form.get('discount_percent')?.hasError('max')) {
            <mat-error>Cannot exceed 100%</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Duration</mat-label>
          <mat-select formControlName="duration">
            <mat-option value="forever">Forever (permanent discount)</mat-option>
            <mat-option value="months">Limited time</mat-option>
          </mat-select>
        </mat-form-field>

        @if (form.get('duration')?.value === 'months') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Number of Months</mat-label>
            <input
              matInput
              type="number"
              formControlName="duration_months"
              min="1"
              max="36"
            />
            <mat-hint>e.g., 3 - Expires after this many billing cycles</mat-hint>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Reason (internal note)</mat-label>
          <textarea
            matInput
            formControlName="reason"
            rows="2"
          ></textarea>
          <mat-hint>e.g., Early adopter discount, Enterprise negotiation</mat-hint>
          @if (form.get('reason')?.hasError('required')) {
            <mat-error>Reason is required for audit purposes</mat-error>
          }
        </mat-form-field>

        <div class="preview" *ngIf="form.valid">
          <mat-icon>preview</mat-icon>
          <span>
            {{ form.get('discount_percent')?.value }}% off
            {{ form.get('duration')?.value === 'forever' ? 'forever' : 'for ' + form.get('duration_months')?.value + ' months' }}
          </span>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="form.invalid"
        (click)="onApply()"
      >
        <mat-icon>check</mat-icon>
        Apply Discount
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    :host {
      display: block;
      min-width: 400px;
    }

    h2 {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 1.25rem;
      margin: 0;
    }

    h2 mat-icon {
      color: #ff5900;
    }

    .org-name {
      color: #666;
      margin: 0 0 16px;
    }

    .current-discount {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fff3e0;
      border-radius: 8px;
      color: #e65100;
      font-size: 0.9rem;
      margin-bottom: 16px;
    }

    .current-discount mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .discount-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .full-width {
      width: 100%;
    }

    .preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #e8f5e9;
      border-radius: 8px;
      color: #2e7d32;
      font-weight: 500;
    }

    .preview mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    mat-dialog-actions button mat-icon {
      margin-right: 4px;
    }

    @media (max-width: 480px) {
      :host {
        min-width: unset;
      }
    }
  `],
})
export class ApplyDiscountDialogComponent {
  private dialogRef = inject(MatDialogRef<ApplyDiscountDialogComponent>);
  data = inject<ApplyDiscountDialogData>(MAT_DIALOG_DATA);
  private fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({
    discount_percent: [null, [Validators.required, Validators.min(1), Validators.max(100)]],
    duration: ['forever', Validators.required],
    duration_months: [null],
    reason: ['', Validators.required],
  });

  onApply(): void {
    if (this.form.invalid) return;

    const result: ApplyDiscountDialogResult = {
      discount_percent: this.form.value.discount_percent,
      duration: this.form.value.duration,
      reason: this.form.value.reason,
    };

    if (this.form.value.duration === 'months') {
      result.duration_months = this.form.value.duration_months;
    }

    this.dialogRef.close(result);
  }
}
