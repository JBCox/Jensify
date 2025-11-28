import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime } from 'rxjs/operators';
import { ReportService } from '../../../core/services/report.service';
import { ExpenseReport, ReportStatus } from '../../../core/models/report.model';
import { StatusBadge } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { CreateReportDialogComponent } from '../create-report-dialog/create-report-dialog';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

/**
 * Report List Component
 * Displays all expense reports with filtering and search
 *
 * Features:
 * - List all reports with status badges
 * - Filter by status
 * - Search by name/description
 * - Create new report button
 * - Navigate to report detail
 * - Quick actions (submit, delete draft)
 */
@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatFormFieldModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    StatusBadge,
    EmptyState
  ],
  templateUrl: './report-list.html',
  styleUrl: './report-list.scss'
})
export class ReportListComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private readonly STATUS_CACHE_KEY = 'jensify_report_status_cache_v1';

  private router = inject(Router);
  private reportService = inject(ReportService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private notificationService = inject(NotificationService);

  // State
  reports = signal<ExpenseReport[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  // Filters
  searchControl = new FormControl('');
  statusFilter = new FormControl<ReportStatus | 'all'>('all');

  readonly ReportStatus = ReportStatus;
  readonly statusOptions = [
    { value: 'all', label: 'All Reports' },
    { value: ReportStatus.DRAFT, label: 'Draft' },
    { value: ReportStatus.SUBMITTED, label: 'Submitted' },
    { value: ReportStatus.APPROVED, label: 'Approved' },
    { value: ReportStatus.REJECTED, label: 'Rejected' },
    { value: ReportStatus.PAID, label: 'Paid' }
  ];

  // Computed filtered reports
  filteredReports = computed(() => {
    let filtered = this.reports();

    // Filter by status
    const status = this.statusFilter.value;
    if (status && status !== 'all') {
      filtered = filtered.filter(r => r.status === status);
    }

    // Filter by search query
    const search = this.searchControl.value?.toLowerCase() || '';
    if (search) {
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(search) ||
        r.description?.toLowerCase().includes(search)
      );
    }

    return filtered;
  });

  ngOnInit(): void {
    this.loadReports();

    // Setup search debounce
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        // Filtering handled by computed signal
      });

    // Setup status filter
    this.statusFilter.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Filtering handled by computed signal
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all reports from the backend
   */
  loadReports(): void {
    this.loading.set(true);
    this.error.set(null);

    this.reportService.getReports()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (reports) => {
          this.reports.set(reports);
          this.handleStatusNotifications(reports);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message || 'Failed to load reports');
          this.loading.set(false);
        }
      });
  }

  /**
   * Open create new report dialog
   */
  createReport(): void {
    const dialogRef = this.dialog.open(CreateReportDialogComponent, {
      width: '600px',
      maxWidth: '90vw',
      disableClose: false
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result: ExpenseReport | undefined) => {
        if (result) {
          this.snackBar.open('Report created successfully', 'Close', { duration: 3000 });
          this.router.navigate(['/reports', result.id]);
        }
      });
  }

  /**
   * Navigate to report detail page
   */
  viewReport(report: ExpenseReport): void {
    this.router.navigate(['/reports', report.id]);
  }

  /**
   * Submit a draft report for approval
   */
  submitReport(report: ExpenseReport, event: Event): void {
    event.stopPropagation(); // Prevent row click

    if (report.status !== ReportStatus.DRAFT) {
      return;
    }

    // Validate report has expenses
    const expenseCount = report.report_expenses?.length || 0;
    if (expenseCount === 0) {
      this.snackBar.open('Cannot submit empty report. Add expenses first.', 'Close', { duration: 4000 });
      return;
    }
    // Check for missing receipts - support both junction table and legacy receipt_id
    const missingReceipt = report.report_expenses?.some(re => {
      const exp = re.expense;
      const hasJunctionReceipts = exp?.expense_receipts && exp.expense_receipts.length > 0;
      const hasLegacyReceipt = exp?.receipt_id || exp?.receipt;
      return !hasJunctionReceipts && !hasLegacyReceipt;
    });
    if (missingReceipt) {
      this.snackBar.open('All expenses need receipts before submitting.', 'Close', { duration: 4000 });
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Submit Report',
        message: `Submit "${report.name}" for approval?`,
        confirmText: 'Submit',
        cancelText: 'Cancel',
        confirmColor: 'primary',
        icon: 'send',
        iconColor: '#FF5900',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.reportService.submitReport(report.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open('Report submitted for approval', 'Close', { duration: 3000 });
              this.loadReports();
            },
            error: (err) => {
              this.snackBar.open(err?.message || 'Failed to submit report', 'Close', { duration: 4000 });
            }
          });
      }
    });
  }

  /**
   * Delete a draft report
   */
  deleteReport(report: ExpenseReport, event: Event): void {
    event.stopPropagation(); // Prevent row click

    if (report.status !== ReportStatus.DRAFT) {
      this.snackBar.open('Only draft reports can be deleted', 'Close', { duration: 3000 });
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Report',
        message: `Delete report "${report.name}"? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'warn',
        icon: 'delete',
        iconColor: '#f44336',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.reportService.deleteReport(report.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open('Report deleted', 'Close', { duration: 3000 });
              this.loadReports();
            },
            error: (err) => {
              this.snackBar.open(err?.message || 'Failed to delete report', 'Close', { duration: 4000 });
            }
          });
      }
    });
  }

  /**
   * Get status badge variant for display
   */
  getBadgeStatus(status: ReportStatus): 'draft' | 'pending' | 'approved' | 'rejected' | 'reimbursed' {
    switch (status) {
      case ReportStatus.DRAFT:
        return 'draft';
      case ReportStatus.SUBMITTED:
        return 'pending';
      case ReportStatus.APPROVED:
        return 'approved';
      case ReportStatus.REJECTED:
        return 'rejected';
      case ReportStatus.PAID:
        return 'reimbursed';
      default:
        return 'draft';
    }
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

  /**
   * Format date for display
   */
  formatDate(dateString?: string | null): string {
    if (!dateString) {
      return 'â€”';
    }
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  /**
   * Get expense count for report
   */
  getExpenseCount(report: ExpenseReport): number {
    return report.report_expenses?.length || 0;
  }

  /**
   * Check if report can be submitted
   */
  canSubmit(report: ExpenseReport): boolean {
    return report.status === ReportStatus.DRAFT && this.getExpenseCount(report) > 0;
  }

  /**
   * Check if report can be deleted
   */
  canDelete(report: ExpenseReport): boolean {
    return report.status === ReportStatus.DRAFT;
  }

  private handleStatusNotifications(reports: ExpenseReport[]): void {
    if (!reports || reports.length === 0) {
      return;
    }

    const cache = this.loadStatusCache();
    let dirty = false;

    for (const report of reports) {
      const prev = cache[report.id];
      if (prev && prev !== report.status) {
        this.notifyStatusChange(report);
      }
      cache[report.id] = report.status;
      dirty = true;
    }

    if (dirty) {
      this.saveStatusCache(cache);
    }
  }

  private loadStatusCache(): Record<string, ReportStatus> {
    try {
      const raw = localStorage.getItem(this.STATUS_CACHE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {
      // ignore parse errors
    }
    return {};
  }

  private saveStatusCache(cache: Record<string, ReportStatus>): void {
    try {
      localStorage.setItem(this.STATUS_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // ignore storage quota issues
    }
  }

  private notifyStatusChange(report: ExpenseReport): void {
    switch (report.status) {
      case ReportStatus.APPROVED:
        if (this.notificationService.shouldAlert('approvals')) {
          this.notificationService.showSuccess(
            `"${report.name}" was approved`,
            'Report approved'
          );
        }
        break;
      case ReportStatus.REJECTED:
        if (this.notificationService.shouldAlert('approvals')) {
          this.notificationService.showWarning(
            `"${report.name}" was rejected â€” review and resubmit`,
            'Report rejected'
          );
        }
        break;
      case ReportStatus.PAID:
        if (this.notificationService.shouldAlert('reimbursements')) {
          this.notificationService.showSuccess(
            `"${report.name}" was reimbursed`,
            'Reimbursed'
          );
        }
        break;
      default:
        break;
    }
  }
}