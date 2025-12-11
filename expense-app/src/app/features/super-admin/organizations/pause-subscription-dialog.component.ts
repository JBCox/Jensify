import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

export interface PauseSubscriptionDialogData {
  organizationName: string;
  organizationId: string;
  currentPlan?: string;
}

export interface PauseSubscriptionDialogResult {
  reason: string;
  resume_date?: Date;
  pause_type: 'indefinite' | 'scheduled';
}

/**
 * Pause Subscription Dialog
 *
 * Allows super admins to pause an organization's subscription.
 * Replaces the old prompt() implementation with a proper form.
 */
@Component({
  selector: 'app-pause-subscription-dialog',
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
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>
      <mat-icon>pause_circle</mat-icon>
      Pause Subscription
    </h2>

    <mat-dialog-content>
      <p class="org-name">
        Pausing subscription for <strong>{{ data.organizationName }}</strong>
      </p>

      @if (data.currentPlan) {
        <div class="current-plan">
          <mat-icon>credit_card</mat-icon>
          Current plan: {{ data.currentPlan | titlecase }}
        </div>
      }

      <div class="warning-box">
        <mat-icon>warning</mat-icon>
        <div>
          <p class="warning-title">Important</p>
          <p class="warning-text">
            Pausing will immediately suspend billing. The organization will retain
            access until the end of their current billing period, then be moved to
            a limited free tier until resumed.
          </p>
        </div>
      </div>

      <form [formGroup]="form" class="pause-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Pause Type</mat-label>
          <mat-select formControlName="pause_type">
            <mat-option value="indefinite">Pause indefinitely</mat-option>
            <mat-option value="scheduled">Schedule resume date</mat-option>
          </mat-select>
        </mat-form-field>

        @if (form.get('pause_type')?.value === 'scheduled') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Resume Date</mat-label>
            <input
              matInput
              [matDatepicker]="picker"
              formControlName="resume_date"
              [min]="minDate"
            />
            <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
            <mat-datepicker #picker></mat-datepicker>
            <mat-hint>Subscription will automatically resume on this date</mat-hint>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Reason for pausing</mat-label>
          <textarea
            matInput
            formControlName="reason"
            rows="3"
          ></textarea>
          <mat-hint>e.g., Customer requested pause, Off-season, Financial hardship</mat-hint>
          @if (form.get('reason')?.hasError('required')) {
            <mat-error>Reason is required for audit purposes</mat-error>
          }
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="warn"
        [disabled]="form.invalid"
        (click)="onPause()"
      >
        <mat-icon>pause</mat-icon>
        Pause Subscription
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
      color: #ff9800;
    }

    .org-name {
      color: #666;
      margin: 0 0 16px;
    }

    .current-plan {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #e3f2fd;
      border-radius: 8px;
      color: #1565c0;
      font-size: 0.9rem;
      margin-bottom: 16px;
    }

    .current-plan mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .warning-box {
      display: flex;
      gap: 12px;
      padding: 16px;
      background: #fff3e0;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .warning-box > mat-icon {
      color: #e65100;
      font-size: 24px;
      width: 24px;
      height: 24px;
      flex-shrink: 0;
    }

    .warning-title {
      font-weight: 600;
      color: #e65100;
      margin: 0 0 4px;
    }

    .warning-text {
      font-size: 0.9rem;
      color: #bf360c;
      margin: 0;
      line-height: 1.5;
    }

    .pause-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .full-width {
      width: 100%;
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
export class PauseSubscriptionDialogComponent {
  private dialogRef = inject(MatDialogRef<PauseSubscriptionDialogComponent>);
  data = inject<PauseSubscriptionDialogData>(MAT_DIALOG_DATA);
  private fb = inject(FormBuilder);

  minDate = new Date();

  form: FormGroup = this.fb.group({
    pause_type: ['indefinite', Validators.required],
    resume_date: [null],
    reason: ['', Validators.required],
  });

  constructor() {
    // Set minimum date to tomorrow
    this.minDate.setDate(this.minDate.getDate() + 1);
  }

  onPause(): void {
    if (this.form.invalid) return;

    const result: PauseSubscriptionDialogResult = {
      pause_type: this.form.value.pause_type,
      reason: this.form.value.reason,
    };

    if (this.form.value.pause_type === 'scheduled' && this.form.value.resume_date) {
      result.resume_date = this.form.value.resume_date;
    }

    this.dialogRef.close(result);
  }
}
