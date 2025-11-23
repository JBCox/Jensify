import { Component, OnDestroy, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Receipt } from '../../../core/models/receipt.model';
import { ExpenseService } from '../../../core/services/expense.service';
import { Observable, Subject, shareReplay } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-attach-receipt-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule
  ],
  templateUrl: './attach-receipt-dialog.html',
  styles: [`
    .upload-pane, .existing-pane {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .file-info {
      font-size: 0.9rem;
      color: var(--jensify-text-muted);
    }

    .receipt-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--jensify-border-subtle);
    }

    .receipt-row:last-child {
      border-bottom: none;
    }

    .receipt-meta {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }

    .receipt-name {
      font-weight: 600;
    }
  `]
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AttachReceiptDialog implements OnDestroy {
  private readonly expenseService = inject(ExpenseService);
  private readonly dialogRef = inject<MatDialogRef<AttachReceiptDialog>>(MatDialogRef);

  // Cleanup
  private destroy$ = new Subject<void>();

  readonly receipts$: Observable<Receipt[]>;
  readonly uploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  pendingFile: File | null = null;

  constructor() {
    this.receipts$ = this.expenseService.getMyReceipts().pipe(shareReplay(1));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) {
      this.pendingFile = null;
      return;
    }
    this.pendingFile = input.files[0];
    this.errorMessage.set(null);
  }

  uploadSelected(): void {
    if (!this.pendingFile || this.uploading()) {
      return;
    }
    this.uploading.set(true);
    this.expenseService.uploadReceipt(this.pendingFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.uploading.set(false);
          this.dialogRef.close(response.receipt);
        },
        error: (err: Error) => {
          this.uploading.set(false);
          this.errorMessage.set(err.message || 'Failed to upload receipt');
        }
      });
  }

  selectExisting(receipt: Receipt): void {
    this.dialogRef.close(receipt);
  }

  close(): void {
    this.dialogRef.close();
  }

  /**
   * TrackBy function for receipt list - improves ngFor performance
   */
  trackByReceiptId(_index: number, receipt: Receipt): string {
    return receipt.id;
  }
}
