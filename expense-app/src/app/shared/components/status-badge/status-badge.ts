import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'reimbursed' | 'flagged' | 'draft';

interface StatusConfig {
  label: string;
  icon: string;
  class: string;
}

@Component({
  selector: 'app-status-badge',
  imports: [CommonModule, MatIconModule],
  templateUrl: './status-badge.html',
  styleUrl: './status-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class StatusBadge {
  @Input() status: ExpenseStatus = 'pending';
  @Input() showIcon = true;
  @Input() size: 'small' | 'medium' = 'medium';

  private statusConfigs: Record<ExpenseStatus, StatusConfig> = {
    pending: { label: 'Pending', icon: 'schedule', class: 'pending' },
    approved: { label: 'Approved', icon: 'check_circle', class: 'approved' },
    rejected: { label: 'Rejected', icon: 'cancel', class: 'rejected' },
    reimbursed: { label: 'Reimbursed', icon: 'paid', class: 'reimbursed' },
    flagged: { label: 'Flagged', icon: 'flag', class: 'flagged' },
    draft: { label: 'Draft', icon: 'edit', class: 'draft' },
  };

  get config(): StatusConfig {
    return this.statusConfigs[this.status];
  }
}
