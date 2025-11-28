import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { ApprovalWithDetails } from '../../../core/models/approval.model';

export interface ApproveDialogData {
  approval: ApprovalWithDetails;
}

export interface ApproveDialogResult {
  comment?: string;
}

@Component({
  selector: 'app-approve-dialog',
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
  templateUrl: './approve-dialog.html',
  styleUrls: ['./approve-dialog.scss']
})
export class ApproveDialog {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ApproveDialog>);
  data = inject<ApproveDialogData>(MAT_DIALOG_DATA);

  approval: ApprovalWithDetails;
  approveForm: FormGroup;

  constructor() {
    this.approval = this.data.approval;
    this.approveForm = this.fb.group({
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

  onApprove(): void {
    if (this.approveForm.valid) {
      const result: ApproveDialogResult = {
        comment: this.approveForm.value.comment || undefined
      };
      this.dialogRef.close(result);
    }
  }
}
