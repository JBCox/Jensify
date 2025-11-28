import { Component, OnInit, OnDestroy, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExpenseService } from '../../../core/services/expense.service';
import { ApprovalService } from '../../../core/services/approval.service';
import { Expense, ExpenseItem, ExpenseReceipt } from '../../../core/models/expense.model';
import { ExpenseStatus } from '../../../core/models/enums';
import { ApprovalWithDetails } from '../../../core/models/approval.model';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { ReceiptGalleryComponent } from '../../../shared/components/receipt-gallery/receipt-gallery';
import {
  SplitExpenseDialog,
  SplitExpenseDialogResult,
} from '../split-expense-dialog/split-expense-dialog';
import { ApproveDialog, ApproveDialogData, ApproveDialogResult } from '../../approvals/approve-dialog/approve-dialog';
import { RejectDialog, RejectDialogData, RejectDialogResult } from '../../approvals/reject-dialog/reject-dialog';

@Component({
  selector: 'app-expense-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    StatusBadge,
    ReceiptGalleryComponent
  ],
  templateUrl: './expense-detail.html',
  styleUrl: './expense-detail.scss'
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseDetailComponent implements OnInit, OnDestroy {
  // Cleanup
  private destroy$ = new Subject<void>();

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private expenseService = inject(ExpenseService);
  private approvalService = inject(ApprovalService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  expense = signal<Expense | null>(null);
  expenseItems = signal<ExpenseItem[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  submitting = signal<boolean>(false);
  splittingInProgress = signal<boolean>(false);
  approving = signal<boolean>(false);

  expenseId = signal<string | null>(null);

  // Approval state - tracks if current user has a pending approval for this expense
  pendingApproval = signal<ApprovalWithDetails | null>(null);

  readonly ExpenseStatus = ExpenseStatus;
  private statusBadgeMap: Record<ExpenseStatus, BadgeStatus> = {
    [ExpenseStatus.DRAFT]: 'draft',
    [ExpenseStatus.SUBMITTED]: 'pending',
    [ExpenseStatus.APPROVED]: 'approved',
    [ExpenseStatus.REJECTED]: 'rejected',
    [ExpenseStatus.REIMBURSED]: 'reimbursed'
  };

  hasViolations = computed(
    () => (this.expense()?.policy_violations?.length ?? 0) > 0
  );

  isSplit = computed(() => this.expense()?.is_split === true);

  canSplit = computed(() => {
    const exp = this.expense();
    return exp?.status === ExpenseStatus.DRAFT && !exp.is_split;
  });

  canUnsplit = computed(() => {
    const exp = this.expense();
    return exp?.status === ExpenseStatus.DRAFT && exp.is_split === true;
  });

  /**
   * Get all receipts for display - combines junction table and legacy receipt_id
   * Falls back to the old receipt field if junction table is empty
   */
  allReceipts = computed((): ExpenseReceipt[] => {
    const exp = this.expense();
    if (!exp) return [];

    // First check junction table (new system)
    if (exp.expense_receipts && exp.expense_receipts.length > 0) {
      return exp.expense_receipts;
    }

    // Fall back to legacy receipt_id field
    if (exp.receipt) {
      // Create a synthetic ExpenseReceipt from the legacy receipt
      return [{
        expense_id: exp.id,
        receipt_id: exp.receipt.id,
        is_primary: true,
        display_order: 0,
        receipt: exp.receipt
      }] as ExpenseReceipt[];
    }

    return [];
  });

  // Check if current user can approve this expense
  canApprove = computed(() => {
    return this.pendingApproval() !== null;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Missing expense ID.');
      this.loading.set(false);
      return;
    }

    this.expenseId.set(id);
    this.loadExpense();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadExpense(): void {
    const id = this.expenseId();
    if (!id) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    this.expenseService.getExpenseById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (expense) => {
          this.expense.set(expense);
          this.loading.set(false);
          // Load expense items if expense is split
          if (expense.is_split) {
            this.loadExpenseItems(id);
          } else {
            this.expenseItems.set([]);
          }
          // Check if current user has a pending approval for this expense
          this.checkPendingApproval(id);
        },
        error: (err) => {
          this.error.set(err?.message || 'Unable to load expense.');
          this.loading.set(false);
        }
      });
  }

  /**
   * Check if current user has a pending approval for this expense
   */
  private checkPendingApproval(expenseId: string): void {
    this.approvalService.getPendingApprovals()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (approvals) => {
          const approval = approvals.find(a => a.expense_id === expenseId);
          this.pendingApproval.set(approval || null);
        },
        error: () => {
          // Silently fail - user just can't approve
          this.pendingApproval.set(null);
        },
      });
  }

  loadExpenseItems(expenseId: string): void {
    this.expenseService.getExpenseItems(expenseId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.expenseItems.set(items);
        },
        error: (err) => {
          console.error('Failed to load expense items:', err);
          this.expenseItems.set([]);
        }
      });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString?: string | null): string {
    if (!dateString) {
      return '—';
    }
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getBadgeStatus(status: ExpenseStatus): BadgeStatus {
    return this.statusBadgeMap[status] ?? 'draft';
  }

  canSubmit(): boolean {
    const exp = this.expense();
    if (!exp) {
      return false;
    }
    const hasViolations = (exp.policy_violations?.length ?? 0) > 0;
    return exp.status === ExpenseStatus.DRAFT && !hasViolations;
  }

  submitForApproval(): void {
    const exp = this.expense();
    if (!exp || !this.canSubmit()) {
      return;
    }

    this.submitting.set(true);
    this.expenseService.submitExpense(exp.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (updated) => {
          this.expense.set(updated);
          this.submitting.set(false);
          this.snackBar.open('Expense submitted for approval.', 'Close', { duration: 4000 });
        },
        error: (err) => {
          this.submitting.set(false);
          this.snackBar.open(err?.message || 'Failed to submit expense.', 'Close', { duration: 4000 });
        }
      });
  }

  viewReceipt(): void {
    const receipt = this.expense()?.receipt;
    if (!receipt?.file_path) {
      this.snackBar.open('No receipt attached.', 'Close', { duration: 3000 });
      return;
    }
    const url = this.expenseService.getReceiptUrl(receipt.file_path);
    window.open(url, '_blank');
  }

  goBack(): void {
    this.router.navigate(['/expenses']);
  }

  goToEdit(focusViolations = false): void {
    const id = this.expenseId();
    if (!id) {
      return;
    }
    this.router.navigate(['/expenses', id, 'edit'], {
      queryParams: focusViolations ? { focus: 'violations' } : undefined
    });
  }

  refreshAfterSave(): void {
    this.loadExpense();
  }

  getTimeline() {
    const exp = this.expense();
    if (!exp) {
      return [];
    }
    return [
      { label: 'Created', value: exp.created_at },
      { label: 'Submitted', value: exp.submitted_at },
      { label: 'Reimbursed', value: exp.reimbursed_at }
    ];
  }

  ocrLabel(): string {
    const status = this.expense()?.receipt?.ocr_status;
    switch (status) {
      case 'completed':
        return 'SmartScan complete';
      case 'processing':
        return 'SmartScan in progress';
      case 'failed':
        return 'SmartScan failed';
      case 'pending':
      default:
        return 'SmartScan pending';
    }
  }

  /**
   * Handle setting a receipt as primary
   * @param receiptId Receipt ID to mark as primary
   */
  onSetPrimaryReceipt(receiptId: string): void {
    const expenseId = this.expenseId();
    if (!expenseId) return;

    this.expenseService.setPrimaryReceipt(expenseId, receiptId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Primary receipt updated.', 'Close', { duration: 3000 });
          this.loadExpense(); // Reload to get updated data
        },
        error: (err) => {
          this.snackBar.open(err?.message || 'Failed to update primary receipt.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Handle removing a receipt from the expense
   * @param receiptId Receipt ID to detach
   */
  onRemoveReceipt(receiptId: string): void {
    const expenseId = this.expenseId();
    if (!expenseId) return;

    this.expenseService.detachReceipt(expenseId, receiptId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Receipt removed from expense.', 'Close', { duration: 3000 });
          this.loadExpense(); // Reload to get updated data
        },
        error: (err) => {
          this.snackBar.open(err?.message || 'Failed to remove receipt.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Handle adding more receipts
   * Navigate to edit page
   */
  onAddReceipts(): void {
    this.goToEdit();
  }

  /**
   * Check if expense can be edited
   * Only draft expenses can have receipts added/removed
   */
  canEditReceipts(): boolean {
    return this.expense()?.status === ExpenseStatus.DRAFT;
  }

  /**
   * Open the split expense dialog
   */
  openSplitDialog(): void {
    const exp = this.expense();
    if (!exp || !this.canSplit()) {
      return;
    }

    const dialogRef = this.dialog.open(SplitExpenseDialog, {
      width: '700px',
      maxWidth: '95vw',
      data: { expense: exp }
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result?: SplitExpenseDialogResult) => {
        if (result?.items) {
          this.splitExpense(result.items);
        }
      });
  }

  /**
   * Split the expense into multiple items
   */
  private splitExpense(items: { description: string; amount: number; category: string }[]): void {
    const expenseId = this.expenseId();
    if (!expenseId) return;

    this.splittingInProgress.set(true);

    this.expenseService.splitExpense(expenseId, items)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.splittingInProgress.set(false);
          this.loadExpense(); // Reload to get updated data
        },
        error: (err) => {
          this.splittingInProgress.set(false);
          this.snackBar.open(err?.message || 'Failed to split expense.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Unsplit the expense (remove all split items)
   */
  unsplitExpense(): void {
    const expenseId = this.expenseId();
    if (!expenseId || !this.canUnsplit()) {
      return;
    }

    this.splittingInProgress.set(true);

    this.expenseService.unsplitExpense(expenseId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.splittingInProgress.set(false);
          this.expenseItems.set([]);
          this.loadExpense(); // Reload to get updated data
        },
        error: (err) => {
          this.splittingInProgress.set(false);
          this.snackBar.open(err?.message || 'Failed to unsplit expense.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Approve the expense
   */
  approveExpense(): void {
    const approval = this.pendingApproval();
    if (!approval) {
      return;
    }

    const dialogRef = this.dialog.open(ApproveDialog, {
      width: '600px',
      maxWidth: '90vw',
      data: { approval } as ApproveDialogData,
      disableClose: false,
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result: ApproveDialogResult | undefined) => {
        if (result !== undefined) {
          this.approving.set(true);
          this.approvalService.approve(approval.id, { comment: result.comment })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.approving.set(false);
                this.pendingApproval.set(null);
                this.snackBar.open('Expense approved successfully', 'Close', {
                  duration: 3000,
                });
                // Reload expense to get updated status
                this.loadExpense();
              },
              error: (err) => {
                this.approving.set(false);
                this.snackBar.open(
                  err?.message || 'Failed to approve expense',
                  'Close',
                  { duration: 4000 },
                );
              },
            });
        }
      });
  }

  /**
   * Reject the expense
   */
  rejectExpense(): void {
    const approval = this.pendingApproval();
    if (!approval) {
      return;
    }

    const dialogRef = this.dialog.open(RejectDialog, {
      width: '600px',
      maxWidth: '90vw',
      data: { approval } as RejectDialogData,
      disableClose: false,
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result: RejectDialogResult | undefined) => {
        if (result !== undefined) {
          this.approving.set(true);
          this.approvalService.reject(approval.id, {
            rejection_reason: result.rejection_reason,
            comment: result.comment,
          })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.approving.set(false);
                this.pendingApproval.set(null);
                this.snackBar.open('Expense rejected', 'Close', {
                  duration: 3000,
                });
                // Reload expense to get updated status
                this.loadExpense();
              },
              error: (err) => {
                this.approving.set(false);
                this.snackBar.open(
                  err?.message || 'Failed to reject expense',
                  'Close',
                  { duration: 4000 },
                );
              },
            });
        }
      });
  }
}
