import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ExpenseService } from '../../../core/services/expense.service';
import { ExpenseCategory, OcrStatus } from '../../../core/models/enums';
import { MatDialog } from '@angular/material/dialog';
import { AttachReceiptDialog } from '../attach-receipt-dialog/attach-receipt-dialog';
import { Receipt } from '../../../core/models/receipt.model';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, interval, takeUntil, switchMap, takeWhile, tap } from 'rxjs';

@Component({
  selector: 'app-expense-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './expense-form.html',
  styleUrl: './expense-form.scss'
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';
  categories = Object.values(ExpenseCategory);
  receiptId: string | null = null;
  attachedReceipt: Receipt | null = null;
  smartScanStatus: OcrStatus | null = null;
  private hasAppliedOcrData = false;

  // Subject for subscription cleanup
  private destroy$ = new Subject<void>();
  private stopPolling$ = new Subject<void>();

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenses = inject(ExpenseService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  ngOnInit(): void {
    this.form = this.fb.group({
      merchant: ['', [Validators.required, Validators.minLength(2)]],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      category: [ExpenseCategory.FUEL, [Validators.required]],
      expense_date: [new Date().toISOString().slice(0,10), [Validators.required]],
      notes: ['']
    });

    this.receiptId = this.route.snapshot.queryParamMap.get('receiptId');
    if (this.receiptId) {
      this.loadAttachedReceipt(this.receiptId);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopPolling$.next();
    this.stopPolling$.complete();
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (this.form.invalid) { Object.values(this.form.controls).forEach(c => c.markAsTouched()); return; }

    this.loading = true;
    const dto = { ...this.form.value, receipt_id: this.receiptId || undefined };

    // Type assertion is safe here as form validation ensures required fields
    this.expenses.createExpense(dto as Parameters<typeof this.expenses.createExpense>[0])
      .pipe(
        takeUntil(this.destroy$),
        switchMap((expense) => {
          // If there's a receipt attached, also create junction table record
          if (this.receiptId) {
            return this.expenses.attachReceipt(expense.id, this.receiptId, true).pipe(
              // Return the expense after attaching receipt
              switchMap(() => [expense])
            );
          }
          // No receipt, just return the expense
          return [expense];
        })
      )
      .subscribe({
        next: () => {
          this.successMessage = 'Expense created.';
          setTimeout(() => this.router.navigate(['/expenses']), 800);
          this.loading = false;
        },
        error: (err) => {
          this.errorMessage = err?.message || 'Failed to create expense';
          this.loading = false;
        }
      });
  }

  openAttachDialog(): void {
    const dialogRef = this.dialog.open(AttachReceiptDialog, {
      width: '520px'
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((receipt?: Receipt) => {
        if (receipt) {
          this.stopOcrPolling();
          this.hasAppliedOcrData = false;
          this.receiptId = receipt.id;
          this.afterReceiptAttachment(receipt);
        }
      });
  }

  removeAttachedReceipt(): void {
    this.receiptId = null;
    this.attachedReceipt = null;
    this.smartScanStatus = null;
    this.hasAppliedOcrData = false;
    this.stopOcrPolling();
  }

  viewAttachedReceipt(): void {
    if (!this.attachedReceipt) { return; }
    const url = this.expenses.getReceiptUrl(this.attachedReceipt.file_path);
    window.open(url, '_blank');
  }

  private loadAttachedReceipt(id: string): void {
    this.expenses.getReceiptById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (receipt) => this.afterReceiptAttachment(receipt),
        error: () => {
          this.attachedReceipt = null;
        }
      });
  }

  private afterReceiptAttachment(receipt: Receipt): void {
    this.attachedReceipt = receipt;
    this.smartScanStatus = receipt.ocr_status as OcrStatus;
    if (!receipt.id) {
      return;
    }

    if (receipt.ocr_status === OcrStatus.COMPLETED) {
      this.stopOcrPolling();
      this.applyExtractedFields(receipt);
    } else if (receipt.ocr_status === OcrStatus.PENDING || receipt.ocr_status === OcrStatus.PROCESSING) {
      this.hasAppliedOcrData = false;
      this.startOcrPolling(receipt.id);
    } else {
      this.stopOcrPolling();
    }
  }

  /**
   * Start polling for OCR status updates using RxJS interval
   * Automatically stops when OCR completes or component is destroyed
   */
  private startOcrPolling(receiptId: string): void {
    // Stop any existing polling
    this.stopPolling$.next();

    // Poll every 4 seconds using RxJS interval
    interval(4000)
      .pipe(
        // Switch to receipt fetch on each interval
        switchMap(() => this.expenses.getReceiptById(receiptId)),
        // Continue while OCR is still processing
        takeWhile((receipt) => receipt.ocr_status === OcrStatus.PROCESSING, true),
        // Stop when component is destroyed or polling is cancelled
        takeUntil(this.destroy$),
        takeUntil(this.stopPolling$),
        // Update status on each emission
        tap((receipt) => {
          this.smartScanStatus = receipt.ocr_status;
        })
      )
      .subscribe({
        next: (receipt) => {
          this.afterReceiptAttachment(receipt);
        },
        error: (error) => {
          console.error('OCR polling error:', error);
          this.stopPolling$.next();
        }
      });
  }

  /**
   * Stop OCR polling
   */
  private stopOcrPolling(): void {
    this.stopPolling$.next();
  }

  private applyExtractedFields(receipt: Receipt): void {
    if (this.hasAppliedOcrData) {
      return;
    }
    const controls = this.form.controls;
    let updated = false;
    if (receipt.extracted_merchant && !controls['merchant'].dirty) {
      controls['merchant'].setValue(receipt.extracted_merchant);
      updated = true;
    }
    if (receipt.extracted_amount && !controls['amount'].dirty) {
      controls['amount'].setValue(receipt.extracted_amount);
      updated = true;
    }
    if (receipt.extracted_date && !controls['expense_date'].dirty) {
      controls['expense_date'].setValue(receipt.extracted_date);
      updated = true;
    }
    if (updated) {
      this.hasAppliedOcrData = true;
      this.snackBar.open('SmartScan pre-filled details. Please review before submitting.', 'Close', {
        duration: 4000
      });
    }
  }

  get smartScanLabel(): string | null {
    if (!this.smartScanStatus) {
      return null;
    }
    switch (this.smartScanStatus) {
      case OcrStatus.PENDING:
        return 'SmartScan queued';
      case OcrStatus.PROCESSING:
        return 'SmartScan in progress';
      case OcrStatus.COMPLETED:
        return 'SmartScan complete';
      case OcrStatus.FAILED:
        return 'SmartScan failed';
      default:
        return null;
    }
  }

  /**
   * TrackBy function for category list - improves ngFor performance
   */
  trackByCategory(_index: number, category: string): string {
    return category;
  }
}
