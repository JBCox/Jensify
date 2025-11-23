import { Component, Input, Output, EventEmitter, inject, signal, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { Receipt } from '../../../core/models/receipt.model';
import { ExpenseReceipt } from '../../../core/models/expense.model';
import { SupabaseService } from '../../../core/services/supabase.service';

/**
 * Receipt Gallery Component
 * Displays multiple receipts in a grid layout with actions
 *
 * Features:
 * - Grid layout with thumbnail previews
 * - Primary receipt badge
 * - Click to view full-size
 * - Mark as primary action
 * - Remove from expense action
 * - Add more receipts button
 * - Responsive design
 *
 * @example
 * ```html
 * <app-receipt-gallery
 *   [expenseReceipts]="expense.expense_receipts"
 *   [canEdit]="expense.status === 'draft'"
 *   (setPrimary)="onSetPrimary($event)"
 *   (removeReceipt)="onRemoveReceipt($event)"
 *   (addReceipts)="onAddReceipts()">
 * </app-receipt-gallery>
 * ```
 */
@Component({
  selector: 'app-receipt-gallery',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatChipsModule
  ],
  templateUrl: './receipt-gallery.html',
  styleUrl: './receipt-gallery.scss'
})
export class ReceiptGalleryComponent implements OnInit, OnChanges {
  private readonly supabase = inject(SupabaseService);
  private readonly dialog = inject(MatDialog);

  /** Expense receipts from junction table (with receipt objects populated) */
  @Input({ required: true }) expenseReceipts: ExpenseReceipt[] = [];

  /** Whether user can edit (mark primary, remove) */
  @Input() canEdit = true;

  /** Whether to show "Add Receipts" button */
  @Input() showAddButton = true;

  /** Emitted when user marks a receipt as primary */
  @Output() setPrimary = new EventEmitter<string>(); // receipt_id

  /** Emitted when user removes a receipt from expense */
  @Output() removeReceipt = new EventEmitter<string>(); // receipt_id

  /** Emitted when user clicks "Add Receipts" button */
  @Output() addReceipts = new EventEmitter<void>();

  /** Loading state for receipt URLs */
  receiptUrls = signal<Map<string, string>>(new Map());

  ngOnInit(): void {
    // Load signed URLs for all receipts
    this.loadReceiptUrls();
  }

  ngOnChanges(): void {
    // Reload URLs when expense_receipts changes
    this.loadReceiptUrls();
  }

  /**
   * Load signed URLs for all receipts
   * Uses Supabase Storage to get temporary signed URLs
   */
  private async loadReceiptUrls(): Promise<void> {
    const urlMap = new Map<string, string>();

    for (const expenseReceipt of this.expenseReceipts) {
      if (!expenseReceipt.receipt) continue;

      try {
        const { signedUrl } = await this.supabase.getSignedUrl(
          'receipts',
          expenseReceipt.receipt.file_path,
          3600 // 1 hour expiry
        );
        urlMap.set(expenseReceipt.receipt.id, signedUrl);
      } catch (error) {
        console.error('Failed to load receipt URL:', error);
      }
    }

    this.receiptUrls.set(urlMap);
  }

  /**
   * Get the signed URL for a receipt
   */
  getReceiptUrl(receiptId: string): string | undefined {
    return this.receiptUrls().get(receiptId);
  }

  /**
   * Get primary receipt
   */
  get primaryReceipt(): ExpenseReceipt | undefined {
    return this.expenseReceipts.find(er => er.is_primary);
  }

  /**
   * Handle marking receipt as primary
   */
  onSetPrimary(receiptId: string): void {
    if (!this.canEdit) return;
    this.setPrimary.emit(receiptId);
  }

  /**
   * Handle removing receipt from expense
   */
  onRemoveReceipt(receiptId: string): void {
    if (!this.canEdit) return;

    // Confirm before removing
    if (confirm('Remove this receipt from the expense?')) {
      this.removeReceipt.emit(receiptId);
    }
  }

  /**
   * Handle adding more receipts
   */
  onAddReceipts(): void {
    this.addReceipts.emit();
  }

  /**
   * Open receipt in full-screen dialog
   */
  openReceiptDialog(expenseReceipt: ExpenseReceipt): void {
    if (!expenseReceipt.receipt) return;

    const receiptUrl = this.getReceiptUrl(expenseReceipt.receipt.id);
    if (!receiptUrl) return;

    // TODO: Implement receipt viewer dialog
    // For now, open in new tab
    window.open(receiptUrl, '_blank');
  }

  /**
   * Get file icon based on file type
   */
  getFileIcon(receipt: Receipt): string {
    if (receipt.file_type.startsWith('image/')) {
      return 'image';
    } else if (receipt.file_type === 'application/pdf') {
      return 'picture_as_pdf';
    }
    return 'description';
  }

  /**
   * Check if receipt is an image (can show thumbnail)
   */
  isImage(receipt: Receipt): boolean {
    return receipt.file_type.startsWith('image/');
  }

  /**
   * Get formatted file size
   */
  getFileSize(bytes: number): string {
    const kb = bytes / 1024;
    if (kb < 1024) {
      return `${kb.toFixed(0)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }
}
