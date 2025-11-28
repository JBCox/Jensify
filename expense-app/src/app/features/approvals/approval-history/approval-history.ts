import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApprovalService } from '../../../core/services/approval.service';
import { ApprovalAction, ApprovalWithDetails } from '../../../core/models/approval.model';
import { Observable } from 'rxjs';

export interface ApprovalHistoryDialogData {
  approval: ApprovalWithDetails;
}

@Component({
  selector: 'app-approval-history',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './approval-history.html',
  styleUrls: ['./approval-history.scss']
})
export class ApprovalHistoryDialog implements OnInit {
  private approvalService = inject(ApprovalService);
  private dialogRef = inject(MatDialogRef<ApprovalHistoryDialog>);
  data = inject<ApprovalHistoryDialogData>(MAT_DIALOG_DATA);

  approval: ApprovalWithDetails;
  history$!: Observable<ApprovalAction[]>;
  loading = true;
  error: string | null = null;

  constructor() {
    this.approval = this.data.approval;
  }

  ngOnInit(): void {
    this.loadHistory();
  }

  private loadHistory(): void {
    this.history$ = this.approvalService.getApprovalHistory(this.approval.id);
  }

  getApprovalType(): string {
    return this.approval.expense_id ? 'Expense' : 'Report';
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

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  getActionIcon(action: string): string {
    switch (action) {
      case 'approved':
        return 'check_circle';
      case 'rejected':
        return 'cancel';
      case 'submitted':
        return 'send';
      default:
        return 'info';
    }
  }

  getActionLabel(action: string): string {
    switch (action) {
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'submitted':
        return 'Submitted';
      default:
        return action;
    }
  }

  getActorName(action: ApprovalAction): string {
    return (action as ApprovalAction & { actor?: { full_name?: string } }).actor?.full_name || 'Unknown';
  }

  onClose(): void {
    this.dialogRef.close();
  }
}
