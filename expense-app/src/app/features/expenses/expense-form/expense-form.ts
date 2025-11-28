import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ExpenseService } from '../../../core/services/expense.service';
import { ExpenseCategory, OcrStatus } from '../../../core/models/enums';
import { MatDialog } from '@angular/material/dialog';
import { AttachReceiptDialog } from '../attach-receipt-dialog/attach-receipt-dialog';
import { SplitExpenseDialog, SplitExpenseDialogData, SplitExpenseDialogResult } from '../split-expense-dialog/split-expense-dialog';
import { Receipt } from '../../../core/models/receipt.model';
import { OcrService, DetectedLineItem } from '../../../core/services/ocr.service';
import { BudgetService } from '../../../core/services/budget.service';
import { BudgetCheckResult } from '../../../core/models/budget.model';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject, interval, takeUntil, switchMap, takeWhile, tap, of } from 'rxjs';

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
    MatChipsModule,
    MatTooltipModule,
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

  // Split suggestion state
  detectedLineItems = signal<DetectedLineItem[]>([]);
  suggestSplit = signal(false);
  splitSuggestionDismissed = signal(false);
  budgetWarnings = signal<BudgetCheckResult[]>([]);

  // Computed properties for split suggestion
  uniqueCategories = computed(() => {
    const items = this.detectedLineItems();
    return [...new Set(items.filter(i => i.confidence >= 0.5).map(i => i.suggestedCategory))];
  });

  showSplitSuggestion = computed(() => {
    return this.suggestSplit() &&
           !this.splitSuggestionDismissed() &&
           this.detectedLineItems().length >= 2;
  });

  // Subject for subscription cleanup
  private destroy$ = new Subject<void>();
  private stopPolling$ = new Subject<void>();

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenses = inject(ExpenseService);
  private ocrService = inject(OcrService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private budgetService = inject(BudgetService);

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

    // Check budgets when amount/category changes
    this.form.get('amount')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.checkBudgets());
    this.form.get('category')?.valueChanges.pipe(takeUntil(this.destroy$)).subscribe(() => this.checkBudgets());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopPolling$.next();
    this.stopPolling$.complete();
  }


  /**
   * Check expense against budgets and show warnings
   */
  private checkBudgets(): void {
    const formValue = this.form.value;
    if (!formValue.amount || !formValue.category || !formValue.expense_date) return;

    this.budgetService.getBudgetWarnings({
      amount: formValue.amount,
      category: formValue.category,
      expense_date: formValue.expense_date
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (warnings) => {
        this.budgetWarnings.set(warnings);
        if (warnings.length > 0) {
          const exceededCount = warnings.filter(w => w.status === 'exceeded').length;
          const warningCount = warnings.filter(w => w.status === 'warning').length;

          let message = '';
          if (exceededCount > 0) {
            message = exceededCount + ' budget(s) will be exceeded';
          } else if (warningCount > 0) {
            message = warningCount + ' budget(s) nearing limit';
          }

          if (message) {
            this.snackBar.open(message, 'Details', { duration: 5000 })
              .onAction().subscribe(() => {
                const details = warnings.map(w => w.message).join('\n');
                alert(details);
              });
          }
        }
      }
    });
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

    // Extract line items from OCR data for split suggestion
    this.extractLineItemsFromReceipt(receipt);

    if (updated) {
      this.hasAppliedOcrData = true;
      this.snackBar.open('SmartScan pre-filled details. Please review before submitting.', 'Close', {
        duration: 4000
      });
    }
  }

  /**
   * Extract line items from receipt OCR data for split suggestions
   */
  private extractLineItemsFromReceipt(receipt: Receipt): void {
    // Check if receipt has stored line items
    if (receipt.extracted_line_items && receipt.extracted_line_items.length > 0) {
      // Convert stored format to DetectedLineItem format
      const items: DetectedLineItem[] = receipt.extracted_line_items.map(item => ({
        description: item.description,
        amount: item.amount,
        suggestedCategory: item.suggested_category,
        confidence: item.confidence,
        keywords: item.keywords
      }));
      this.detectedLineItems.set(items);
      this.suggestSplit.set(receipt.suggest_split || false);
      return;
    }

    // If no stored line items, extract from raw OCR data
    const ocrData = receipt.ocr_data as { rawText?: string } | undefined;
    if (ocrData?.rawText) {
      const items = this.ocrService.extractLineItems(ocrData.rawText);
      if (items.length > 0) {
        this.detectedLineItems.set(items);
        this.suggestSplit.set(this.ocrService.shouldSuggestSplit(items));
      }
    }
  }

  /**
   * Dismiss the split suggestion
   */
  dismissSplitSuggestion(): void {
    this.splitSuggestionDismissed.set(true);
  }

  /**
   * Open the split expense dialog pre-populated with detected line items
   */
  openSplitDialog(): void {
    // First create the expense, then split it
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(c => c.markAsTouched());
      this.snackBar.open('Please fill in required fields before splitting', 'Close', { duration: 3000 });
      return;
    }

    this.loading = true;
    const dto = { ...this.form.value, receipt_id: this.receiptId || undefined };

    this.expenses.createExpense(dto as Parameters<typeof this.expenses.createExpense>[0])
      .pipe(
        takeUntil(this.destroy$),
        switchMap((expense) => {
          // Attach receipt if present
          if (this.receiptId) {
            return this.expenses.attachReceipt(expense.id, this.receiptId, true).pipe(
              switchMap(() => of(expense))
            );
          }
          return of(expense);
        })
      )
      .subscribe({
        next: (expense) => {
          this.loading = false;

          // Open split dialog with the created expense
          const dialogData: SplitExpenseDialogData = { expense };
          const dialogRef = this.dialog.open(SplitExpenseDialog, {
            width: '700px',
            maxWidth: '95vw',
            data: dialogData,
            autoFocus: false
          });

          dialogRef.afterClosed()
            .pipe(takeUntil(this.destroy$))
            .subscribe((result: SplitExpenseDialogResult | undefined) => {
              if (result?.items && result.items.length > 0) {
                // Split the expense with the provided items
                this.expenses.splitExpense(expense.id, result.items)
                  .pipe(takeUntil(this.destroy$))
                  .subscribe({
                    next: () => {
                      this.snackBar.open(`Expense split into ${result.items.length} items`, 'View', {
                        duration: 4000
                      }).onAction().subscribe(() => {
                        this.router.navigate(['/expenses', expense.id]);
                      });
                      this.router.navigate(['/expenses']);
                    },
                    error: (err) => {
                      this.snackBar.open(err?.message || 'Failed to split expense', 'Close', { duration: 4000 });
                    }
                  });
              } else {
                // User cancelled split, just navigate to expense
                this.router.navigate(['/expenses', expense.id]);
              }
            });
        },
        error: (err) => {
          this.errorMessage = err?.message || 'Failed to create expense';
          this.loading = false;
        }
      });
  }

  /**
   * Format currency for display
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
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
