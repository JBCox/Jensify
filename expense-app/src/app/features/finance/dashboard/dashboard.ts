import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ReportService } from '../../../core/services/report.service';
import { ExpenseReport, ReportStatus } from '../../../core/models/report.model';
import { Receipt } from '../../../core/models/receipt.model';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { LoadingSkeleton } from '../../../shared/components/loading-skeleton/loading-skeleton';
import { MetricCard } from '../../../shared/components/metric-card/metric-card';
import { SupabaseService } from '../../../core/services/supabase.service';
import { SNACKBAR_DURATION } from '../../../shared/constants/ui.constants';

/**
 * Finance Dashboard (Report-based)
 * Shows approved reports awaiting reimbursement and allows marking as paid.
 */
@Component({
  selector: 'app-finance-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
    EmptyState,
    LoadingSkeleton,
    MetricCard
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanceDashboardComponent implements OnInit, OnDestroy {
  private reportService = inject(ReportService);
  private snackBar = inject(MatSnackBar);
  private supabase = inject(SupabaseService);

  private readonly RECEIPT_BUCKET = 'receipts';
  private destroy$ = new Subject<void>();

  approvedReports = signal<ExpenseReport[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  selectedReportIds = signal<Set<string>>(new Set());

  totalPending = computed(() => this.approvedReports().length);
  totalAmount = computed(() => this.approvedReports().reduce((sum, r) => sum + (r.total_amount || 0), 0));
  selectedCount = computed(() => this.selectedReportIds().size);

  ngOnInit(): void {
    this.loadApprovedReports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadApprovedReports(): void {
    this.loading.set(true);
    this.error.set(null);

    this.reportService.getReports({ status: ReportStatus.APPROVED })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: reports => { this.approvedReports.set(reports); this.loading.set(false); },
        error: err => { this.error.set(err?.message || 'Failed to load approved reports'); this.loading.set(false); }
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

  markAsPaid(reportId: string): void {
    this.reportService.markAsPaid(reportId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => { this.showSuccess('Report marked as reimbursed'); this.loadApprovedReports(); },
        error: err => this.showError(err?.message || 'Failed to mark as reimbursed')
      });
  }

  markAllAsPaid(): void {
    const ids = Array.from(this.selectedReportIds());
    ids.forEach(id => this.markAsPaid(id));
    this.selectedReportIds.set(new Set());
  }

  async exportToCSV(): Promise<void> {
    const reports = this.approvedReports();
    if (reports.length === 0) {
      this.showError('No approved reports to export.');
      return;
    }

    const headers = [
      'Report ID',
      'Report Name',
      'Report Status',
      'Submitted At',
      'Approved At',
      'Employee Name',
      'Employee Email',
      'Expense ID',
      'Merchant',
      'Category',
      'Amount',
      'Expense Date',
      'Notes',
      'Receipt Count',
      'Receipt Files',
      'Receipt URLs'
    ];

    const lines: string[] = [];

    for (const report of reports) {
      const expenses = [...(report.report_expenses ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

      if (expenses.length === 0) {
        lines.push(this.buildCsvRow(headers, {
          report_id: report.id,
          report_name: report.name,
          report_status: report.status,
          submitted_at: report.submitted_at ?? '',
          approved_at: report.approved_at ?? '',
          employee_name: report.user?.full_name ?? '',
          employee_email: report.user?.email ?? '',
          expense_id: '',
          merchant: '',
          category: '',
          amount: '',
          expense_date: '',
          notes: '',
          receipt_count: 0,
          receipt_files: '',
          receipt_urls: ''
        }));
        continue;
      }

      for (const line of expenses) {
        const expense = line.expense;
        if (!expense) {
          continue;
        }

        const receipts = (expense.expense_receipts ?? [])
          .map(er => er.receipt)
          .filter((receipt): receipt is Receipt => !!receipt);

        const receiptFiles = receipts.map(r => r.file_name ?? '').filter(Boolean).join('; ');
        const receiptUrls: string[] = [];
        for (const receipt of receipts) {
          if (!receipt.file_path) {
            continue;
          }
          const { signedUrl } = await this.supabase.getSignedUrl(this.RECEIPT_BUCKET, receipt.file_path, 60 * 60 * 24);
          receiptUrls.push(signedUrl || '');
        }

        lines.push(this.buildCsvRow(headers, {
          report_id: report.id,
          report_name: report.name,
          report_status: report.status,
          submitted_at: report.submitted_at ?? '',
          approved_at: report.approved_at ?? '',
          employee_name: report.user?.full_name ?? '',
          employee_email: report.user?.email ?? '',
          expense_id: expense.id,
          merchant: expense.merchant,
          category: expense.category,
          amount: expense.amount,
          expense_date: expense.expense_date,
          notes: expense.notes ?? '',
          receipt_count: receipts.length,
          receipt_files: receiptFiles,
          receipt_urls: receiptUrls.join('; ')
        }));
      }
    }

    if (lines.length === 0) {
      this.showError('No expense lines available to export.');
      return;
    }

    const csv = [headers.join(','), ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `approved-report-lines-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.showSuccess(`Exported ${lines.length} expense line${lines.length === 1 ? '' : 's'} to CSV`);
  }

  private buildCsvRow(headers: string[], values: Record<string, unknown>): string {
    return headers
      .map(header => {
        const key = header.toLowerCase().replace(/\s+/g, '_');
        return this.wrapCsvValue(values[key]);
      })
      .join(',');
  }

  private wrapCsvValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '""';
    }
    const stringValue = typeof value === 'string' ? value : String(value);
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
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
