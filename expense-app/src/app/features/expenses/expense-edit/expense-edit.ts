import { Component, OnInit, OnDestroy, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, of } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { ExpenseService } from '../../../core/services/expense.service';
import { Expense, UpdateExpenseDto } from '../../../core/models/expense.model';
import { ExpenseCategory } from '../../../core/models/enums';
import { AttachReceiptDialog } from '../attach-receipt-dialog/attach-receipt-dialog';
import { MatDialog } from '@angular/material/dialog';
import { Receipt } from '../../../core/models/receipt.model';

@Component({
  selector: 'app-expense-edit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatChipsModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './expense-edit.html',
  styleUrl: './expense-edit.scss'
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseEditComponent implements OnInit, OnDestroy {
  // Cleanup
  private destroy$ = new Subject<void>();

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenses = inject(ExpenseService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  form!: FormGroup;
  expenseId!: string;
  expense = signal<Expense | null>(null);
  attachedReceipt = signal<Receipt | null>(null);
  originalReceiptId = signal<string | null>(null);  // Track original receipt to detect changes
  loading = signal<boolean>(true);
  saving = signal<boolean>(false);
  error = signal<string | null>(null);
  categories = Object.values(ExpenseCategory);
  highlightViolations = signal<boolean>(false);

  ngOnInit(): void {
    this.form = this.fb.group({
      merchant: ['', [Validators.required, Validators.minLength(2)]],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      category: [ExpenseCategory.FUEL, [Validators.required]],
      expense_date: ['', [Validators.required]],
      notes: ['']
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Missing expense ID');
      this.loading.set(false);
      return;
    }

    this.expenseId = id;
    this.highlightViolations.set(this.route.snapshot.queryParamMap.get('focus') === 'violations');
    this.loadExpense();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadExpense(): void {
    this.loading.set(true);
    this.error.set(null);
    this.expenses.getExpenseById(this.expenseId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (expense) => {
          this.expense.set(expense);
          // Check expense_receipts junction table first, then fall back to receipt
          const primaryReceipt = expense.expense_receipts?.find(er => er.is_primary)?.receipt
            ?? expense.expense_receipts?.[0]?.receipt
            ?? expense.receipt
            ?? null;
          this.attachedReceipt.set(primaryReceipt);
          this.originalReceiptId.set(primaryReceipt?.id ?? null);
          this.form.patchValue({
            merchant: expense.merchant,
            amount: expense.amount,
            category: expense.category,
            expense_date: expense.expense_date,
            notes: expense.notes || ''
          });
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message || 'Unable to load expense.');
          this.loading.set(false);
        }
      });
  }

  saveChanges(): void {
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(control => control.markAsTouched());
      return;
    }

    const newReceiptId = this.attachedReceipt()?.id ?? null;
    const oldReceiptId = this.originalReceiptId();
    const receiptChanged = newReceiptId !== oldReceiptId;

    const payload: UpdateExpenseDto = {
      ...this.form.value,
      receipt_id: newReceiptId
    };

    this.saving.set(true);
    this.expenses.updateExpense(this.expenseId, payload)
      .pipe(
        takeUntil(this.destroy$),
        switchMap((updated) => {
          // If receipt changed, update the junction table
          if (receiptChanged) {
            // Detach old receipt if there was one
            const detach$ = oldReceiptId
              ? this.expenses.detachReceipt(this.expenseId, oldReceiptId)
              : of(void 0);

            return detach$.pipe(
              switchMap(() => {
                // Attach new receipt if there is one
                if (newReceiptId) {
                  return this.expenses.attachReceipt(this.expenseId, newReceiptId, true).pipe(
                    switchMap(() => of(updated))
                  );
                }
                return of(updated);
              })
            );
          }
          return of(updated);
        })
      )
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.expense.set(updated);
          this.snackBar.open('Expense updated.', 'Close', { duration: 3000 });
          this.router.navigate(['/expenses', updated.id]);
        },
        error: (err) => {
          this.saving.set(false);
          this.snackBar.open(err?.message || 'Failed to update expense.', 'Close', { duration: 4000 });
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
          this.attachedReceipt.set(receipt);
        }
      });
  }

  removeReceipt(): void {
    this.attachedReceipt.set(null);
  }

  viewReceipt(): void {
    const receipt = this.attachedReceipt();
    if (!receipt?.file_path) {
      this.snackBar.open('No receipt attached.', 'Close', { duration: 3000 });
      return;
    }
    const url = this.expenses.getReceiptUrl(receipt.file_path);
    window.open(url, '_blank');
  }

  cancel(): void {
    const id = this.expenseId;
    this.router.navigate(id ? ['/expenses', id] : ['/expenses']);
  }
}
