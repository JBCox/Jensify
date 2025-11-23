import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ExpenseService } from '../../../core/services/expense.service';
import { SanitizationService } from '../../../core/services/sanitization.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Expense } from '../../../core/models/expense.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ExpenseStatus, ExpenseCategory } from '../../../core/models/enums';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { LoadingSkeleton } from '../../../shared/components/loading-skeleton/loading-skeleton';
import { Router } from '@angular/router';
import { AddToReportDialogComponent } from '../add-to-report-dialog/add-to-report-dialog';

/**
 * Expense List Component
 * Displays all expenses for the current user with filtering, search, and summary
 */
@Component({
  selector: 'app-expense-list',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatCheckboxModule,
    MatDialogModule,
    ScrollingModule,
    StatusBadge,
    EmptyState,
    LoadingSkeleton
  ],
  templateUrl: './expense-list.html',
  styleUrl: './expense-list.scss',

  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExpenseList implements OnInit, OnDestroy {
  private expenseService = inject(ExpenseService);
  private sanitizationService = inject(SanitizationService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private supabase = inject(SupabaseService);

  // Cleanup
  private destroy$ = new Subject<void>();

  // State signals
  expenses = signal<Expense[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Selection state for batch operations
  selectedExpenseIds = signal<Set<string>>(new Set());
  submittingBatch = signal<boolean>(false);

  // Filter signals
  selectedStatus = signal<ExpenseStatus | 'all'>('all');
  searchQuery = signal<string>('');
  selectedCategory = signal<string | 'all'>('all');
  dateFrom = signal<Date | null>(null);
  dateTo = signal<Date | null>(null);
  minAmount = signal<number | null>(null);
  maxAmount = signal<number | null>(null);

  // Computed filtered expenses
  filteredExpenses = computed(() => {
    let result = this.expenses();

    // Filter by status
    const status = this.selectedStatus();
    if (status !== 'all') {
      result = result.filter(e => e.status === status);
    }

    // Filter by search query (merchant)
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      result = result.filter(e =>
        e.merchant.toLowerCase().includes(query) ||
        e.notes?.toLowerCase().includes(query)
      );
    }

    // Filter by category
    const category = this.selectedCategory();
    if (category !== 'all') {
      result = result.filter(e => e.category === category);
    }

    // Filter by date range
    const from = this.dateFrom();
    if (from) {
      result = result.filter(e => new Date(e.expense_date) >= from);
    }

    const to = this.dateTo();
    if (to) {
      result = result.filter(e => new Date(e.expense_date) <= to);
    }

    // Filter by amount range
    const min = this.minAmount();
    if (min !== null) {
      result = result.filter(e => e.amount >= min);
    }

    const max = this.maxAmount();
    if (max !== null) {
      result = result.filter(e => e.amount <= max);
    }

    return result;
  });

  // Computed summary metrics
  totalCount = computed(() => this.filteredExpenses().length);
  totalAmount = computed(() =>
    this.filteredExpenses().reduce((sum, e) => sum + e.amount, 0)
  );

  // Computed selection metrics
  draftExpenses = computed(() =>
    this.filteredExpenses().filter(e => e.status === ExpenseStatus.DRAFT)
  );
  selectedCount = computed(() => this.selectedExpenseIds().size);
  allDraftsSelected = computed(() => {
    const drafts = this.draftExpenses();
    if (drafts.length === 0) return false;
    return drafts.every(e => this.selectedExpenseIds().has(e.id));
  });

  // Enums for template
  readonly ExpenseStatus = ExpenseStatus;
  readonly ExpenseCategory = ExpenseCategory;

  // Status options for filter chips
  readonly statusOptions = [
    { value: 'all' as const, label: 'All' },
    { value: ExpenseStatus.DRAFT, label: 'Draft' },
    { value: ExpenseStatus.SUBMITTED, label: 'Pending' },
    { value: ExpenseStatus.APPROVED, label: 'Approved' },
    { value: ExpenseStatus.REJECTED, label: 'Rejected' },
    { value: ExpenseStatus.REIMBURSED, label: 'Reimbursed' }
  ];

  // Category options for dropdown
  readonly categoryOptions = [
    { value: 'all', label: 'All Categories' },
    { value: ExpenseCategory.FUEL, label: ExpenseCategory.FUEL },
    { value: ExpenseCategory.MEALS, label: ExpenseCategory.MEALS },
    { value: ExpenseCategory.LODGING, label: ExpenseCategory.LODGING },
    { value: ExpenseCategory.AIRFARE, label: ExpenseCategory.AIRFARE },
    { value: ExpenseCategory.GROUND_TRANSPORTATION, label: ExpenseCategory.GROUND_TRANSPORTATION },
    { value: ExpenseCategory.OFFICE_SUPPLIES, label: ExpenseCategory.OFFICE_SUPPLIES },
    { value: ExpenseCategory.SOFTWARE, label: ExpenseCategory.SOFTWARE },
    { value: ExpenseCategory.MISCELLANEOUS, label: ExpenseCategory.MISCELLANEOUS }
  ];

  ngOnInit(): void {
    this.loadExpenses();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load expenses from service
   */
  loadExpenses(): void {
    this.loading.set(true);
    this.error.set(null);

    this.expenseService.getMyExpenses()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (expenses) => {
          this.expenses.set(expenses);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err.message || 'Failed to load expenses');
          this.loading.set(false);
        }
      });
  }

  /**
   * Set status filter
   */
  setStatusFilter(status: ExpenseStatus | 'all'): void {
    this.selectedStatus.set(status);
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.selectedStatus.set('all');
    this.searchQuery.set('');
    this.selectedCategory.set('all');
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.minAmount.set(null);
    this.maxAmount.set(null);
  }

  /**
   * Export to CSV (placeholder)
   */
  exportToCSV(): void {
    const rows = this.filteredExpenses();
    if (rows.length === 0) {
      this.snackBar.open('No expenses to export.', 'Close', { duration: 3000 });
      return;
    }

    const headers = [
      'Expense ID',
      'Merchant',
      'Amount',
      'Category',
      'Expense Date',
      'Status',
      'Receipt Attached',
      'Receipt File Name',
      'Receipt URL'
    ];

    const csvRows = rows.map(expense => {
      const receiptAttached = expense.receipt_id ? 'Yes' : 'No';
      const receiptFile = expense.receipt?.file_name || '';
      const receiptUrl = expense.receipt?.file_path
        ? this.expenseService.getReceiptUrl(expense.receipt.file_path)
        : '';

      return [
        expense.id,
        expense.merchant,
        expense.amount.toFixed(2),
        expense.category,
        expense.expense_date,
        expense.status,
        receiptAttached,
        receiptFile,
        receiptUrl
      ].map(value => this.sanitizationService.sanitizeCsvValue(value ?? '')).join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `expenses-${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.snackBar.open(`Exported ${rows.length} expense${rows.length > 1 ? 's' : ''} to CSV.`, 'Close', {
      duration: 4000
    });
  }

  /**
   * Get receipt thumbnail URL
   * Returns URL of primary receipt or first receipt in expense_receipts array
   */
  getReceiptThumbnail(expense: Expense): string | null {
    // Try primary receipt from expense_receipts array first
    const primaryReceipt = expense.expense_receipts?.find(er => er.is_primary)?.receipt;
    if (primaryReceipt?.file_path) {
      return this.expenseService.getReceiptUrl(primaryReceipt.file_path);
    }

    // Fall back to first receipt in array
    const firstReceipt = expense.expense_receipts?.[0]?.receipt;
    if (firstReceipt?.file_path) {
      return this.expenseService.getReceiptUrl(firstReceipt.file_path);
    }

    // Fall back to old single receipt (backward compatibility)
    if (expense.receipt?.file_path) {
      return this.expenseService.getReceiptUrl(expense.receipt.file_path);
    }

    return null;
  }

  /**
   * Get receipt count for an expense
   * @param expense Expense to count receipts for
   * @returns Number of receipts attached
   */
  getReceiptCount(expense: Expense): number {
    if (expense.expense_receipts && expense.expense_receipts.length > 0) {
      return expense.expense_receipts.length;
    }
    // Fall back to checking if old-style receipt exists
    return expense.receipt_id ? 1 : 0;
  }

  /**
   * Check if expense has multiple receipts
   */
  hasMultipleReceipts(expense: Expense): boolean {
    return this.getReceiptCount(expense) > 1;
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Format date
   */
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Map expense status to badge status
   */
  getStatusBadge(status: ExpenseStatus): BadgeStatus {
    const statusMap: Record<ExpenseStatus, BadgeStatus> = {
      [ExpenseStatus.DRAFT]: 'draft',
      [ExpenseStatus.SUBMITTED]: 'pending',
      [ExpenseStatus.APPROVED]: 'approved',
      [ExpenseStatus.REJECTED]: 'rejected',
      [ExpenseStatus.REIMBURSED]: 'reimbursed'
    };
    return statusMap[status];
  }

  /**
   * View receipt in new window
   */
  async viewReceipt(expense: Expense): Promise<void> {
    if (!expense.receipt?.file_path) {
      this.snackBar.open('No receipt available for this expense.', 'Close', { duration: 3000 });
      return;
    }

    try {
      const { signedUrl } = await this.supabase.getSignedUrl('receipts', expense.receipt.file_path, 86400); // 24 hours
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to get receipt URL:', error);
      this.snackBar.open('Failed to load receipt.', 'Close', { duration: 3000 });
    }
  }

  hasViolations(expense: Expense): boolean {
    return (expense.policy_violations?.length ?? 0) > 0;
  }

  goToDetails(expense: Expense): void {
    this.router.navigate(['/expenses', expense.id]);
  }

  goToEdit(expense: Expense, focusViolations = false): void {
    this.router.navigate(['/expenses', expense.id, 'edit'], {
      queryParams: focusViolations ? { focus: 'violations' } : undefined
    });
  }

  fixViolations(expense: Expense): void {
    this.goToEdit(expense, true);
  }

  /**
   * Check if expense is selected
   */
  isSelected(expenseId: string): boolean {
    return this.selectedExpenseIds().has(expenseId);
  }

  /**
   * Toggle expense selection
   */
  toggleSelection(expense: Expense): void {
    const selected = new Set(this.selectedExpenseIds());
    if (selected.has(expense.id)) {
      selected.delete(expense.id);
    } else {
      // Only allow selecting draft expenses
      if (expense.status === ExpenseStatus.DRAFT) {
        selected.add(expense.id);
      }
    }
    this.selectedExpenseIds.set(selected);
  }

  /**
   * Toggle select all draft expenses
   */
  toggleSelectAll(): void {
    const drafts = this.draftExpenses();
    if (this.allDraftsSelected()) {
      // Deselect all
      this.selectedExpenseIds.set(new Set());
    } else {
      // Select all drafts
      const selected = new Set(drafts.map(e => e.id));
      this.selectedExpenseIds.set(selected);
    }
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedExpenseIds.set(new Set());
  }

  /**
   * TrackBy function for virtual scrolling performance
   */
  trackByExpenseId(_index: number, expense: Expense): string {
    return expense.id;
  }

  /**
   * Submit selected expenses for approval (batch operation)
   */
  submitSelected(): void {
    const selectedIds = Array.from(this.selectedExpenseIds());
    if (selectedIds.length === 0) {
      this.snackBar.open('No expenses selected.', 'Close', { duration: 3000 });
      return;
    }

    this.submittingBatch.set(true);

    // Create array of submit observables
    const submitObs = selectedIds.map(id => this.expenseService.submitExpense(id));

    // Execute all submits in parallel
    forkJoin(submitObs)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.submittingBatch.set(false);
          this.clearSelection();
          this.snackBar.open(
            `Successfully submitted ${selectedIds.length} expense${selectedIds.length > 1 ? 's' : ''} for approval.`,
            'Close',
            { duration: 4000 }
          );
          // Reload expenses to reflect new status
          this.loadExpenses();
        },
        error: (err) => {
          this.submittingBatch.set(false);
          this.snackBar.open(
            err?.message || 'Failed to submit expenses. Please try again.',
            'Close',
            { duration: 4000 }
          );
        }
      });
  }

  /**
   * Add selected expenses to a report
   */
  addToReport(): void {
    const selectedIds = Array.from(this.selectedExpenseIds());
    if (selectedIds.length === 0) {
      this.snackBar.open('No expenses selected.', 'Close', { duration: 3000 });
      return;
    }

    // Calculate total amount of selected expenses
    const selectedExpenses = this.expenses().filter(e => selectedIds.includes(e.id));
    const totalAmount = selectedExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Open dialog
    const dialogRef = this.dialog.open(AddToReportDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      data: {
        expenseIds: selectedIds,
        totalAmount: totalAmount
      }
    });

    dialogRef.afterClosed().subscribe((result: { success?: boolean; action?: string; report?: any } | undefined) => {
      if (result?.success) {
        this.clearSelection();
        const action = result.action === 'created' ? 'created new report' : 'added to report';
        this.snackBar.open(
          `Successfully ${action} with ${selectedIds.length} expense${selectedIds.length > 1 ? 's' : ''}`,
          'View Report',
          { duration: 5000 }
        ).onAction().subscribe(() => {
          if (result.report) {
            this.router.navigate(['/reports', result.report.id]);
          }
        });
        // Reload expenses to reflect any status changes
        this.loadExpenses();
      }
    });
  }
}
