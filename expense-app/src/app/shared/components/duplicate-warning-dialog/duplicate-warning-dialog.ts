import { Component, Inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { PotentialDuplicate, DuplicateDetectionService } from '../../../core/services/duplicate-detection.service';

export interface DuplicateWarningDialogData {
  duplicates: PotentialDuplicate[];
  newExpense: {
    merchant: string;
    amount: number;
    expense_date: string;
  };
}

export interface DuplicateWarningDialogResult {
  action: 'proceed' | 'cancel' | 'view';
  selectedDuplicateId?: string;
}

@Component({
  selector: 'app-duplicate-warning-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    CurrencyPipe,
    DatePipe
  ],
  template: `
    <div class="duplicate-warning-dialog">
      <div class="dialog-header">
        <mat-icon class="warning-icon">warning</mat-icon>
        <h2 mat-dialog-title>Potential Duplicate Detected</h2>
      </div>

      <mat-dialog-content>
        <p class="warning-message">
          We found {{ data.duplicates.length }} existing expense{{ data.duplicates.length > 1 ? 's' : '' }}
          that {{ data.duplicates.length > 1 ? 'look' : 'looks' }} similar to what you're creating:
        </p>

        <div class="new-expense-summary">
          <div class="summary-label">You're creating:</div>
          <div class="summary-details">
            <strong>{{ data.newExpense.merchant }}</strong>
            <span class="amount">{{ data.newExpense.amount | currency }}</span>
            <span class="date">{{ data.newExpense.expense_date | date:'mediumDate' }}</span>
          </div>
        </div>

        <div class="duplicate-list">
          <div class="list-label">Similar existing expenses:</div>
          @for (duplicate of data.duplicates; track duplicate.id) {
            <div class="duplicate-item" [class.high-match]="duplicate.similarity_score >= 80">
              <div class="duplicate-info">
                <div class="duplicate-merchant">{{ duplicate.merchant }}</div>
                <div class="duplicate-details">
                  <span class="amount">{{ duplicate.amount | currency }}</span>
                  <span class="separator">•</span>
                  <span class="date">{{ duplicate.expense_date | date:'mediumDate' }}</span>
                  <span class="separator">•</span>
                  <span class="status" [class]="duplicate.status">{{ duplicate.status }}</span>
                </div>
              </div>
              <div class="duplicate-score">
                <mat-chip [class]="getSimilarityClass(duplicate.similarity_score)">
                  {{ duplicateService.getSimilarityLabel(duplicate.similarity_score) }} Match
                </mat-chip>
              </div>
            </div>
          }
        </div>

        <p class="action-hint">
          If this is not a duplicate, you can proceed. Otherwise, consider reviewing the existing expense.
        </p>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="onCancel()">
          Cancel
        </button>
        @if (data.duplicates.length === 1) {
          <button mat-stroked-button color="primary" (click)="onViewExisting(data.duplicates[0].id)">
            <mat-icon>visibility</mat-icon>
            View Existing
          </button>
        }
        <button mat-flat-button color="warn" (click)="onProceed()">
          <mat-icon>add</mat-icon>
          Create Anyway
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .duplicate-warning-dialog {
      max-width: 500px;
    }

    .dialog-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }

    .warning-icon {
      color: var(--jensify-warning);
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
      color: var(--jensify-text-strong);
    }

    .warning-message {
      color: var(--jensify-text-medium);
      margin-bottom: 1rem;
    }

    .new-expense-summary {
      background: var(--jensify-surface-soft);
      border-radius: var(--jensify-radius-md);
      padding: 0.75rem 1rem;
      margin-bottom: 1rem;
    }

    .summary-label, .list-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--jensify-text-muted);
      margin-bottom: 0.5rem;
    }

    .summary-details {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .summary-details strong {
      color: var(--jensify-text-strong);
    }

    .amount {
      color: var(--jensify-primary);
      font-weight: 600;
    }

    .date {
      color: var(--jensify-text-medium);
    }

    .duplicate-list {
      margin-bottom: 1rem;
    }

    .duplicate-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      border: 1px solid var(--jensify-border-subtle);
      border-radius: var(--jensify-radius-md);
      margin-top: 0.5rem;
      background: var(--jensify-surface);
    }

    .duplicate-item.high-match {
      border-color: var(--jensify-danger);
      background: var(--jensify-danger-soft);
    }

    .duplicate-merchant {
      font-weight: 600;
      color: var(--jensify-text-strong);
    }

    .duplicate-details {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      margin-top: 0.25rem;
    }

    .separator {
      color: var(--jensify-text-muted);
    }

    .status {
      text-transform: capitalize;
      font-size: 0.75rem;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--jensify-surface-soft);
    }

    .status.draft { color: var(--jensify-text-muted); }
    .status.submitted { color: var(--jensify-info); }
    .status.approved { color: var(--jensify-success); }
    .status.rejected { color: var(--jensify-danger); }
    .status.reimbursed { color: var(--jensify-primary); }

    .duplicate-score mat-chip {
      font-size: 0.75rem;
    }

    .duplicate-score mat-chip.warning {
      --mdc-chip-label-text-color: var(--jensify-warning-strong);
      background: var(--jensify-warning-soft);
    }

    .duplicate-score mat-chip.danger {
      --mdc-chip-label-text-color: var(--jensify-danger-strong);
      background: var(--jensify-danger-soft);
    }

    .action-hint {
      font-size: 0.875rem;
      color: var(--jensify-text-muted);
      font-style: italic;
    }

    mat-dialog-actions {
      padding-top: 1rem;
      gap: 0.5rem;
    }
  `]
})
export class DuplicateWarningDialog {
  duplicateService = Inject(DuplicateDetectionService);

  constructor(
    public dialogRef: MatDialogRef<DuplicateWarningDialog, DuplicateWarningDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: DuplicateWarningDialogData,
    public duplicateDetectionService: DuplicateDetectionService
  ) {
    this.duplicateService = duplicateDetectionService;
  }

  getSimilarityClass(score: number): string {
    if (score >= 80) return 'danger';
    if (score >= 60) return 'warning';
    return '';
  }

  onProceed(): void {
    this.dialogRef.close({ action: 'proceed' });
  }

  onCancel(): void {
    this.dialogRef.close({ action: 'cancel' });
  }

  onViewExisting(duplicateId: string): void {
    this.dialogRef.close({ action: 'view', selectedDuplicateId: duplicateId });
  }
}
