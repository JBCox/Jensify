import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalWithDetails } from '../../../core/models/approval.model';

export interface RejectDialogData {
  approval: ApprovalWithDetails;
}

export interface RejectDialogResult {
  rejection_reason: string;
  comment?: string;
}

@Component({
  selector: 'app-reject-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './reject-dialog.html',
  styleUrls: ['./reject-dialog.scss']
})
export class RejectDialog {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<RejectDialog>);
  data = inject<RejectDialogData>(MAT_DIALOG_DATA);

  approval: ApprovalWithDetails;
  rejectForm: FormGroup;

  constructor() {
    this.approval = this.data.approval;
    this.rejectForm = this.fb.group({
      rejection_reason: ['', [Validators.required, Validators.minLength(10)]],
      comment: ['']
    });
  }

  getSubmitterName(): string {
    if (this.approval.expense?.user) {
      return this.approval.expense.user.full_name;
    }
    if (this.approval.report?.user) {
      return this.approval.report.user.full_name;
    }
    return 'Unknown';
  }

  getAmount(): number {
    if (this.approval.expense) {
      return this.approval.expense.amount;
    }
    if (this.approval.report) {
      return this.approval.report.total_amount;
    }
    return 0;
  }

  getMerchant(): string {
    if (this.approval.expense) {
      return this.approval.expense.merchant;
    }
    if (this.approval.report) {
      return this.approval.report.name;
    }
    return 'N/A';
  }

  getApprovalType(): string {
    return this.approval.expense_id ? 'Expense' : 'Report';
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onReject(): void {
    if (this.rejectForm.valid) {
      const result: RejectDialogResult = {
        rejection_reason: this.rejectForm.value.rejection_reason,
        comment: this.rejectForm.value.comment || undefined
      };
      this.dialogRef.close(result);
    }
  }

  getReasonError(): string | null {
    const control = this.rejectForm.get('rejection_reason');
    if (control?.hasError('required')) {
      return 'Rejection reason is required';
    }
    if (control?.hasError('minlength')) {
      return 'Please provide at least 10 characters explaining why';
    }
    return null;
  }
}
