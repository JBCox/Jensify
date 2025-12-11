import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface UserData {
  email: string;
  full_name: string;
  organization_name: string;
  role: string;
}

@Component({
  selector: 'app-impersonate-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="align-middle mr-2">warning</mat-icon>
      Confirm Impersonation
    </h2>

    <mat-dialog-content>
      <div class="mb-4">
        <p class="text-sm text-gray-600 mb-2">You are about to impersonate:</p>
        <div class="bg-gray-50 p-3 rounded">
          <p class="font-medium">{{ data.full_name }}</p>
          <p class="text-sm text-gray-600">{{ data.email }}</p>
          <p class="text-sm text-gray-600">{{ data.organization_name }} - {{ data.role }}</p>
        </div>
      </div>

      <div class="bg-amber-50 border-l-4 border-amber-500 p-3 mb-4">
        <p class="text-sm text-amber-800">
          <mat-icon class="text-sm align-middle mr-1">info</mat-icon>
          This session will be logged and audited for security purposes.
        </p>
      </div>

      <form [formGroup]="reasonForm">
        <mat-form-field class="w-full">
          <mat-label>Reason for Impersonation</mat-label>
          <textarea
            matInput
            formControlName="reason"
            rows="3"
            placeholder="e.g., Customer support request #12345"
            required
          ></textarea>
          <mat-error *ngIf="reasonForm.get('reason')?.hasError('required')">
            Reason is required for audit purposes
          </mat-error>
          <mat-error *ngIf="reasonForm.get('reason')?.hasError('minlength')">
            Please provide a detailed reason (at least 10 characters)
          </mat-error>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-raised-button
        color="accent"
        [disabled]="!reasonForm.valid"
        (click)="confirm()"
      >
        Start Impersonation
      </button>
    </mat-dialog-actions>
  `,
})
export class ImpersonateDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ImpersonateDialogComponent>);
  readonly data = inject<UserData>(MAT_DIALOG_DATA);

  reasonForm: FormGroup = this.fb.group({
    reason: ['', [Validators.required, Validators.minLength(10)]]
  });

  confirm(): void {
    if (this.reasonForm.valid) {
      this.dialogRef.close(this.reasonForm.value);
    }
  }
}
