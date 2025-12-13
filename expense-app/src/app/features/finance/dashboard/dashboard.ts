import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTableModule } from '@angular/material/table';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ReportService } from '../../../core/services/report.service';
import { PayoutService } from '../../../core/services/payout.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { ApprovalService } from '../../../core/services/approval.service';
import { ApprovalWithDetails, ApproveDialogResult } from '../../../core/models/approval.model';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ApproveDialog, ApproveDialogData } from '../../approvals/approve-dialog/approve-dialog';
import { ExpenseReport, ReportStatus } from '../../../core/models/report.model';
import { PendingPayoutSummary, PayoutMethod } from '../../../core/models/payout.model';
import { Receipt } from '../../../core/models/receipt.model';
import {
  AnalyticsDashboardData,
  AnalyticsFilters,
  DateRangePreset,
  DATE_RANGE_PRESETS,
  getDateRangeForPreset,
  formatChange,
  ANALYTICS_COLORS
} from '../../../core/models/analytics.model';
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
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatSnackBarModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTableModule,
    MatProgressBarModule,
    MatDialogModule,
    RouterModule,
    EmptyState,
    LoadingSkeleton,
    MetricCard,
    CurrencyPipe,
    DecimalPipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FinanceDashboardComponent implements OnInit, OnDestroy {
  private reportService = inject(ReportService);
  private snackBar = inject(MatSnackBar);
  private supabase = inject(SupabaseService);
  private payoutService = inject(PayoutService);
  private orgService = inject(OrganizationService);
  private analyticsService = inject(AnalyticsService);
  private approvalService = inject(ApprovalService);
  private dialog = inject(MatDialog);

  private readonly RECEIPT_BUCKET = 'receipts';
  private destroy$ = new Subject<void>();

  approvedReports = signal<ExpenseReport[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  selectedReportIds = signal<Set<string>>(new Set());

  totalPending = computed(() => this.approvedReports().length);
  totalAmount = computed(() => this.approvedReports().reduce((sum, r) => sum + (r.total_amount || 0), 0));
  selectedCount = computed(() => this.selectedReportIds().size);

  // Payout-related signals
  pendingPayouts = signal<PendingPayoutSummary[]>([]);
  payoutMethod = signal<PayoutMethod>('manual');
  stripeConnected = signal(false);
  loadingPayouts = signal(false);
  processingPayoutFor = signal<string | null>(null);
  activeTab = signal(0);

  // Payment queue signals (approval-based payment workflow)
  paymentQueueItems = signal<ApprovalWithDetails[]>([]);
  loadingPaymentQueue = signal(false);
  selectedPaymentIds = signal<Set<string>>(new Set());
  processingPaymentId = signal<string | null>(null);

  // Payment queue computed values
  paymentQueueCount = computed(() => this.paymentQueueItems().length);
  paymentQueueTotal = computed(() =>
    this.paymentQueueItems().reduce((sum, item) => {
      const amount = item.expense?.amount ?? item.report?.total_amount ?? 0;
      return sum + amount;
    }, 0)
  );
  selectedPaymentCount = computed(() => this.selectedPaymentIds().size);

  // Analytics-related signals and properties
  analyticsData = signal<AnalyticsDashboardData | null>(null);
  loadingAnalytics = signal(false);
  datePresets = DATE_RANGE_PRESETS;
  selectedPreset: DateRangePreset = 'this_month';
  chartColors = ANALYTICS_COLORS.chart;

  summaryMetrics = [
    { key: 'total_expenses', label: 'Total Spending', icon: 'payments', color: '#ff5900', isCurrency: true },
    { key: 'expense_count', label: 'Total Expenses', icon: 'receipt_long', color: '#3b82f6', isCurrency: false },
    { key: 'avg_expense', label: 'Avg Expense', icon: 'calculate', color: '#22c55e', isCurrency: true },
    { key: 'pending_amount', label: 'Pending Approval', icon: 'hourglass_empty', color: '#f59e0b', isCurrency: true },
  ];

  totalPayoutAmount = computed(() =>
    this.pendingPayouts().reduce((sum, p) => sum + p.total_amount_cents, 0) / 100
  );
  totalPayoutCount = computed(() => this.pendingPayouts().length);

  ngOnInit(): void {
    this.loadApprovedReports();
    this.loadPayoutData();
    this.loadPaymentQueue();
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

  
  loadPayoutData(): void {
    const orgId = this.orgService.currentOrganizationId;
    if (!orgId) return;

    this.loadingPayouts.set(true);

    // Load payout settings and pending payouts in parallel
    forkJoin({
      status: this.payoutService.getStripeAccountStatus(orgId),
      payouts: this.payoutService.getApprovedExpensesForPayout(orgId)
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ status, payouts }) => {
          this.payoutMethod.set(status.payout_method);
          this.stripeConnected.set(status.connected);
          this.pendingPayouts.set(payouts);
          this.loadingPayouts.set(false);
        },
        error: (_err) => {
          this.loadingPayouts.set(false);
        }
      });
  }

  processStripePayout(summary: PendingPayoutSummary): void {
    const orgId = this.orgService.currentOrganizationId;
    if (!orgId || !this.stripeConnected()) {
      this.showError('Stripe is not connected. Please configure payout settings first.');
      return;
    }

    this.processingPayoutFor.set(summary.user_id);

    this.payoutService.createPayout(
      orgId,
      summary.user_id,
      summary.total_amount_cents,
      summary.expense_ids
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.showSuccess(`Payout of ${this.formatCurrency(summary.total_amount_cents / 100)} initiated for ${summary.user_name}`);
            this.loadPayoutData();
            this.loadApprovedReports();
          } else {
            this.showError(response.error || 'Failed to process payout');
          }
          this.processingPayoutFor.set(null);
        },
        error: (err) => {
          this.showError(err?.message || 'Failed to process payout');
          this.processingPayoutFor.set(null);
        }
      });
  }

  createManualPayout(summary: PendingPayoutSummary): void {
    const orgId = this.orgService.currentOrganizationId;
    if (!orgId) return;

    this.processingPayoutFor.set(summary.user_id);

    this.payoutService.createManualPayout(
      orgId,
      summary.user_id,
      summary.total_amount_cents,
      summary.expense_ids,
      undefined,
      'Manual payout from finance dashboard'
    ).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess(`Manual payout record created for ${summary.user_name}`);
          this.loadPayoutData();
          this.processingPayoutFor.set(null);
        },
        error: (err) => {
          this.showError(err?.message || 'Failed to create payout record');
          this.processingPayoutFor.set(null);
        }
      });
  }

  exportPayoutsToCSV(): void {
    const payouts = this.pendingPayouts();
    if (payouts.length === 0) {
      this.showError('No pending payouts to export');
      return;
    }

    const data = this.payoutService.generatePayoutExportData(payouts);
    this.payoutService.exportPayoutsToCSV(data);
    this.showSuccess(`Exported ${payouts.length} payout records to CSV`);
  }

  isProcessing(userId: string): boolean {
    return this.processingPayoutFor() === userId;
  }

  // ============================================================================
  // PAYMENT QUEUE (Approval-based)
  // ============================================================================

  loadPaymentQueue(): void {
    this.loadingPaymentQueue.set(true);

    this.approvalService.getAwaitingPayment()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (items) => {
          this.paymentQueueItems.set(items);
          this.loadingPaymentQueue.set(false);
        },
        error: () => {
          this.loadingPaymentQueue.set(false);
          this.showError('Failed to load payment queue');
        },
      });
  }

  togglePaymentSelection(approvalId: string): void {
    const selected = new Set(this.selectedPaymentIds());
    if (selected.has(approvalId)) {
      selected.delete(approvalId);
    } else {
      selected.add(approvalId);
    }
    this.selectedPaymentIds.set(selected);
  }

  isPaymentSelected(approvalId: string): boolean {
    return this.selectedPaymentIds().has(approvalId);
  }

  isProcessingPayment(approvalId: string): boolean {
    return this.processingPaymentId() === approvalId;
  }

  processPayment(approval: ApprovalWithDetails): void {
    const dialogRef = this.dialog.open(ApproveDialog, {
      width: '600px',
      maxWidth: '95vw',
      data: {
        approval,
        title: 'Process Payment',
        confirmButtonText: 'Complete Payment',
        showPaymentNote: true,
      } as ApproveDialogData,
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe((result: ApproveDialogResult | undefined) => {
        if (result) {
          this.executePayment(approval.id, result.comment);
        }
      });
  }

  private executePayment(approvalId: string, comment?: string): void {
    this.processingPaymentId.set(approvalId);

    this.approvalService.processPayment(approvalId, { comment })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Payment processed successfully');
          this.loadPaymentQueue();
          this.processingPaymentId.set(null);
        },
        error: (err) => {
          this.showError(err?.message || 'Failed to process payment');
          this.processingPaymentId.set(null);
        },
      });
  }

  processAllPayments(): void {
    const ids = Array.from(this.selectedPaymentIds());
    if (ids.length === 0) return;

    // Process sequentially to avoid overwhelming the server
    let processed = 0;
    const total = ids.length;

    const processNext = () => {
      if (processed >= total) {
        this.selectedPaymentIds.set(new Set());
        this.showSuccess(`${total} payment${total > 1 ? 's' : ''} processed successfully`);
        this.loadPaymentQueue();
        return;
      }

      const approvalId = ids[processed];
      this.processingPaymentId.set(approvalId);

      this.approvalService.processPayment(approvalId, { comment: 'Batch payment' })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            processed++;
            processNext();
          },
          error: () => {
            this.showError(`Failed to process payment ${processed + 1} of ${total}`);
            this.processingPaymentId.set(null);
          },
        });
    };

    processNext();
  }

  getSubmitterName(approval: ApprovalWithDetails): string {
    if (approval.expense?.user) {
      return approval.expense.user.full_name;
    }
    if (approval.report?.user) {
      return approval.report.user.full_name;
    }
    return 'Unknown';
  }

  getPaymentAmount(approval: ApprovalWithDetails): number {
    if (approval.expense) {
      return approval.expense.amount;
    }
    if (approval.report) {
      return approval.report.total_amount;
    }
    return 0;
  }

  getPaymentMerchant(approval: ApprovalWithDetails): string {
    if (approval.expense) {
      return approval.expense.merchant;
    }
    if (approval.report) {
      return approval.report.name;
    }
    return 'N/A';
  }

  getApprovalType(approval: ApprovalWithDetails): string {
    return approval.expense_id ? 'Expense' : 'Report';
  }

  trackByApprovalId(_idx: number, approval: ApprovalWithDetails): string {
    return approval.id;
  }

  onTabChange(index: number): void {
    this.activeTab.set(index);
    // Load payment queue when switching to that tab (index 1)
    if (index === 1) {
      this.loadPaymentQueue();
    }
    // Load analytics when switching to the Analytics tab (index 4)
    if (index === 4 && !this.analyticsData()) {
      this.loadAnalyticsData();
    }
  }

  // Analytics methods
  loadAnalyticsData(): void {
    this.loadingAnalytics.set(true);
    const range = getDateRangeForPreset(this.selectedPreset);

    const filters: AnalyticsFilters = {
      start_date: range.start_date,
      end_date: range.end_date,
      interval: 'month',
    };

    this.analyticsService.loadDashboardData(filters)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => {
          this.analyticsData.set(data);
          this.loadingAnalytics.set(false);
        },
        error: (_err) => {
          this.showError('Failed to load analytics data');
          this.loadingAnalytics.set(false);
        },
      });
  }

  onDateRangeChange(): void {
    this.loadAnalyticsData();
  }

  getMetricValue(key: string): number {
    const summary = this.analyticsData()?.summary;
    if (!summary) return 0;
    const metric = summary.find(m => m.metric_key === key);
    return metric?.metric_value ?? 0;
  }

  getMetricChange(key: string): { text: string; class: string; icon: string } | null {
    const summary = this.analyticsData()?.summary;
    if (!summary) return null;
    const metric = summary.find(m => m.metric_key === key);
    if (!metric || metric.change_percent === 0) return null;
    return formatChange(metric.change_percent);
  }

  exportAnalyticsData(): void {
    const data = this.analyticsData();
    if (!data) return;

    // Export category breakdown as CSV
    if (data.categoryBreakdown?.length) {
      this.analyticsService.exportToCsv(
        data.categoryBreakdown as unknown as Record<string, unknown>[],
        'category_breakdown'
      );
    }

    this.showSuccess('Analytics data exported successfully');
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', { duration: SNACKBAR_DURATION.SUCCESS, panelClass: ['success-snackbar'] });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: SNACKBAR_DURATION.ERROR, panelClass: ['error-snackbar'] });
  }
}
