import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ReportService } from '../../../core/services/report.service';
import { ExpenseReport, ReportStatus } from '../../../core/models/report.model';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { LoadingSkeleton } from '../../../shared/components/loading-skeleton/loading-skeleton';
import { SNACKBAR_DURATION } from '../../../shared/constants/ui.constants';

/**
 * Report-based Approval Queue
 * Shows submitted reports (not individual expenses) for managers/finance to approve or reject.
 */
@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatTooltipModule,
    EmptyState,
    LoadingSkeleton
  ],
  templateUrl: './approval-queue.html',
  styleUrl: './approval-queue.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ApprovalQueueComponent implements OnInit, OnDestroy {
  private reportService = inject(ReportService);
  private snackBar = inject(MatSnackBar);

  private destroy$ = new Subject<void>();

  submittedReports = signal<ExpenseReport[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  selectedReportIds = signal<Set<string>>(new Set());

  searchQuery = signal<string>('');

  filteredReports = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    let result = this.submittedReports();
    if (query) {
      result = result.filter(r =>
        r.name.toLowerCase().includes(query) ||
        r.user?.full_name?.toLowerCase().includes(query) ||
        r.user?.email?.toLowerCase().includes(query)
      );
    }
    return result;
  });

  totalPending = computed(() => this.filteredReports().length);
  totalAmount = computed(() =>
    this.filteredReports().reduce((sum, r) => sum + (r.total_amount || 0), 0)
  );
  selectedCount = computed(() => this.selectedReportIds().size);

  ngOnInit(): void {
    this.loadSubmittedReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadSubmittedReports(): void {
    this.loading.set(true);
    this.error.set(null);

    this.reportService.getReports({ status: ReportStatus.SUBMITTED })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: reports => {
          this.submittedReports.set(reports);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err?.message || 'Failed to load submitted reports');
          this.loading.set(false);
        }
      });
  }

  toggleSelection(reportId: string): void {
    const selected = new Set(this.selectedReportIds());
    if (selected.has(reportId)) {
      selected.delete(reportId);
    } else {
      selected.add(reportId);
    }
    this.selectedReportIds.set(selected);
  }

  isSelected(reportId: string): boolean {
    return this.selectedReportIds().has(reportId);
  }

  approveReport(reportId: string): void {
    this.reportService.approveReport(reportId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Report approved');
          this.loadSubmittedReports();
        },
        error: err => this.showError(err?.message || 'Failed to approve report')
      });
  }

  rejectReport(reportId: string): void {
    const reason = prompt('Add a rejection note (optional):', '') || 'No reason provided';
    this.reportService.rejectReport(reportId, reason)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Report rejected');
          this.loadSubmittedReports();
        },
        error: err => this.showError(err?.message || 'Failed to reject report')
      });
  }

  approveSelected(): void {
    const ids = Array.from(this.selectedReportIds());
    ids.forEach(id => this.approveReport(id));
    this.selectedReportIds.set(new Set());
  }

  rejectSelected(): void {
    const ids = Array.from(this.selectedReportIds());
    ids.forEach(id => this.rejectReport(id));
    this.selectedReportIds.set(new Set());
  }

  clearFilters(): void {
    this.searchQuery.set('');
  }

  trackByReportId(_idx: number, report: ExpenseReport): string {
    return report.id;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }

  formatDate(dateString?: string): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', { duration: SNACKBAR_DURATION.SUCCESS, panelClass: ['success-snackbar'] });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: SNACKBAR_DURATION.ERROR, panelClass: ['error-snackbar'] });
  }
}
