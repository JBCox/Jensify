import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { ExpenseService } from '../../../core/services/expense.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Observable } from 'rxjs';
import { Receipt } from '../../../core/models/receipt.model';
import { OcrStatus } from '../../../core/models/enums';

@Component({
  selector: 'app-receipt-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterModule
  ],
  templateUrl: './receipt-list.html',
  styleUrl: './receipt-list.scss',

  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptList {
  private readonly expenseService = inject(ExpenseService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);

  receipts$: Observable<Receipt[]>;
  readonly OcrStatus = OcrStatus;

  constructor() {
    this.receipts$ = this.expenseService.getMyReceipts();
  }

  createExpense(receipt: Receipt): void {
    this.router.navigate(['/expenses/new'], { queryParams: { receiptId: receipt.id } });
  }

  async viewReceipt(receipt: Receipt): Promise<void> {
    try {
      const { signedUrl } = await this.supabase.getSignedUrl('receipts', receipt.file_path, 86400); // 24 hours
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to get receipt URL:', error);
    }
  }

  getStatusLabel(receipt: Receipt): string {
    switch (receipt.ocr_status as OcrStatus) {
      case OcrStatus.COMPLETED:
        return 'Ready';
      case OcrStatus.PROCESSING:
        return 'Processing';
      case OcrStatus.FAILED:
        return 'Failed';
      default:
        return 'Queued';
    }
  }

  getStatusClass(receipt: Receipt): string {
    return `status-${receipt.ocr_status}`;
  }

  /**
   * TrackBy function for receipt list - improves ngFor performance
   */
  trackByReceiptId(_index: number, receipt: Receipt): string {
    return receipt.id;
  }
}
