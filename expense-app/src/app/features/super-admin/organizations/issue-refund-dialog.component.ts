import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

export interface IssueRefundDialogData {
  organizationName: string;
  organizationId: string;
  lastPaymentAmount?: number;
}

export interface IssueRefundDialogResult {
  amount_cents?: number;
  full_refund: boolean;
  reason: string;
}

/**
 * Issue Refund Dialog
 *
 * Allows super admins to issue a refund to an organization.
 * Replaces the old prompt() implementation with a proper form.
 */
@Component({
  selector: 'app-issue-refund-dialog',
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
    MatCheckboxModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      <mat-icon>money_off</mat-icon>
      Issue Refund
    </h2>

    <mat-dialog-content>
      <p class="org-name">
        Issuing refund to <strong>{{ data.organizationName }}</strong>
      </p>

      <form [formGroup]="form" class="refund-form">
        <mat-checkbox formControlName="full_refund" color="primary">
          Full refund (last payment)
        </mat-checkbox>

        @if (!form.get('full_refund')?.value) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Refund Amount</mat-label>
            <span matTextPrefix>$&nbsp;</span>
            <input
              matInput
              type="number"
              formControlName="amount"
              min="0.01"
              step="0.01"
              placeholder="0.00"
            />
            @if (form.get('amount')?.hasError('required')) {
              <mat-error>Amount is required for partial refunds</mat-error>
            }
            @if (form.get('amount')?.hasError('min')) {
              <mat-error>Amount must be greater than 0</mat-error>
            }
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Reason (internal note)</mat-label>
          <textarea
            matInput
            formControlName="reason"
            rows="2"
          ></textarea>
          <mat-hint>e.g., Service issue, billing dispute</mat-hint>
          @if (form.get('reason')?.hasError('required')) {
            <mat-error>Reason is required for audit purposes</mat-error>
          }
        </mat-form-field>

        <div class="warning">
          <mat-icon>warning</mat-icon>
          <span>Refunds are processed through Stripe and cannot be reversed.</span>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="warn"
        [disabled]="form.invalid"
        (click)="onIssue()"
      >
        <mat-icon>money_off</mat-icon>
        Issue Refund
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
      color: #f44336;
    }

    .org-name {
      color: #666;
      margin: 0 0 16px;
    }

    .refund-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .full-width {
      width: 100%;
    }

    .warning {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fff3e0;
      border-radius: 8px;
      color: #e65100;
      font-size: 0.9rem;
    }

    .warning mat-icon {
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
export class IssueRefundDialogComponent {
  private dialogRef = inject(MatDialogRef<IssueRefundDialogComponent>);
  data = inject<IssueRefundDialogData>(MAT_DIALOG_DATA);
  private fb = inject(FormBuilder);

  form: FormGroup = this.fb.group({
    full_refund: [true],
    amount: [null],
    reason: ['', Validators.required],
  });

  constructor() {
    // Add conditional validation for amount
    this.form.get('full_refund')?.valueChanges.subscribe((fullRefund) => {
      const amountControl = this.form.get('amount');
      if (fullRefund) {
        amountControl?.clearValidators();
      } else {
        amountControl?.setValidators([Validators.required, Validators.min(0.01)]);
      }
      amountControl?.updateValueAndValidity();
    });
  }

  onIssue(): void {
    if (this.form.invalid) return;

    const result: IssueRefundDialogResult = {
      full_refund: this.form.value.full_refund,
      reason: this.form.value.reason,
    };

    if (!this.form.value.full_refund && this.form.value.amount) {
      result.amount_cents = Math.round(this.form.value.amount * 100);
    }

    this.dialogRef.close(result);
  }
}
