import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatChipsModule } from "@angular/material/chips";
import { MatDividerModule } from "@angular/material/divider";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTableModule } from "@angular/material/table";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { forkJoin, Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { ReportService } from "../../../core/services/report.service";
import { AuthService } from "../../../core/services/auth.service";
import { ApprovalService } from "../../../core/services/approval.service";
import { ExpenseReport, ReportStatus } from "../../../core/models/report.model";
import { Expense } from "../../../core/models/expense.model";
import { ExpenseStatus } from "../../../core/models/enums";
import { ApprovalWithDetails } from "../../../core/models/approval.model";
import { StatusBadge } from "../../../shared/components/status-badge/status-badge";
import { AddExpensesDialogComponent } from "./add-expenses-dialog.component";
import { ConfirmDialogComponent, ConfirmDialogData } from "../../../shared/components/confirm-dialog/confirm-dialog";
import { ApproveDialog, ApproveDialogData, ApproveDialogResult } from "../../approvals/approve-dialog/approve-dialog";
import { RejectDialog, RejectDialogData, RejectDialogResult } from "../../approvals/reject-dialog/reject-dialog";

/**
 * Report Detail Component
 * Shows detailed view of an expense report
 */
@Component({
  selector: "app-report-detail",
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
    MatTableModule,
    MatTooltipModule,
    MatDialogModule,
    StatusBadge,
  ],
  templateUrl: "./report-detail.html",
  styleUrl: "./report-detail.scss",
})
export class ReportDetailComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private reportService = inject(ReportService);
  private authService = inject(AuthService);
  private approvalService = inject(ApprovalService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // State
  report = signal<ExpenseReport | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  submitting = signal<boolean>(false);
  approving = signal<boolean>(false);

  reportId = signal<string | null>(null);

  // Approval state - tracks if current user has a pending approval for this report
  pendingApproval = signal<ApprovalWithDetails | null>(null);

  readonly ReportStatus = ReportStatus;
  readonly ExpenseStatus = ExpenseStatus;

  // Table columns for expenses
  displayedColumns = [
    "merchant",
    "category",
    "date",
    "amount",
    "status",
    "actions",
  ];

  // Computed properties
  expenses = computed(() => {
    const reportData = this.report();
    if (!reportData || !reportData.report_expenses) {
      return [];
    }
    return reportData.report_expenses
      .map((re) => re.expense)
      .filter((exp): exp is Expense => exp !== undefined)
      .sort((a, b) => {
        // Sort by expense_date descending
        return new Date(b.expense_date).getTime() -
          new Date(a.expense_date).getTime();
      });
  });

  hasExpenses = computed(() => this.expenses().length > 0);

  canEdit = computed(() => {
    const reportData = this.report();
    return reportData?.status === ReportStatus.DRAFT;
  });

  canSubmit = computed(() => {
    const reportData = this.report();
    return reportData?.status === ReportStatus.DRAFT && this.hasExpenses();
  });

  canDelete = computed(() => {
    const reportData = this.report();
    return reportData?.status === ReportStatus.DRAFT;
  });

  canPay = computed(() => {
    const reportData = this.report();
    const userRole = this.authService.userRole;
    return reportData?.status === ReportStatus.APPROVED &&
      userRole === "finance";
  });

  isRejected = computed(() => this.report()?.status === ReportStatus.REJECTED);

  canResubmit = computed(() => {
    const reportData = this.report();
    return reportData?.status === ReportStatus.REJECTED && this.hasExpenses();
  });

  // Check if current user can approve this report
  canApprove = computed(() => {
    return this.pendingApproval() !== null;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id");
    if (!id) {
      this.error.set("Missing report ID");
      this.loading.set(false);
      return;
    }

    this.reportId.set(id);
    this.loadReport();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load report from backend
   */
  loadReport(): void {
    const id = this.reportId();
    if (!id) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.reportService.getReportById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.loading.set(false);
          // Check if current user has a pending approval for this report
          this.checkPendingApproval(id);
        },
        error: (err) => {
          this.error.set(err?.message || "Failed to load report");
          this.loading.set(false);
        },
      });
  }

  /**
   * Check if current user has a pending approval for this report
   */
  private checkPendingApproval(reportId: string): void {
    this.approvalService.getPendingApprovals()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (approvals) => {
          const approval = approvals.find(a => a.report_id === reportId);
          this.pendingApproval.set(approval || null);
        },
        error: () => {
          // Silently fail - user just can't approve
          this.pendingApproval.set(null);
        },
      });
  }

  /**
   * Go back to reports list
   */
  goBack(): void {
    this.router.navigate(["/reports"]);
  }

  /**
   * Open dialog to add expenses
   */
  openAddExpensesDialog(): void {
    const dialogRef = this.dialog.open(AddExpensesDialogComponent, {
      width: "600px",
      disableClose: true,
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result && Array.isArray(result) && result.length > 0) {
        this.addExpenses(result);
      }
    });
  }

  /**
   * Add selected expenses to report
   */
  private addExpenses(expenseIds: string[]): void {
    const reportId = this.reportId();
    if (!reportId) return;

    this.loading.set(true);

    const requests = expenseIds.map((expenseId) =>
      this.reportService.addExpenseToReport(reportId, expenseId)
    );

    forkJoin(requests)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open(`${expenseIds.length} expenses added`, "Close", {
            duration: 3000,
          });
          this.loadReport();
        },
        error: (_err) => {
          this.snackBar.open("Failed to add some expenses", "Close", {
            duration: 4000,
          });
          this.loadReport(); // Reload anyway to show what succeeded
        },
      });
  }

  /**
   * Submit report for approval
   */
  submitReport(): void {
    const reportData = this.report();
    if (!reportData || !this.canSubmit()) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Submit Report",
        message: `Submit "${reportData.name}" for approval?`,
        confirmText: "Submit",
        cancelText: "Cancel",
        confirmColor: "primary",
        icon: "send",
        iconColor: "#FF5900",
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.submitting.set(true);

        this.reportService.submitReport(reportData.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (updated) => {
              this.report.set(updated);
              this.submitting.set(false);
              this.snackBar.open("Report submitted for approval", "Close", {
                duration: 3000,
              });
            },
            error: (err) => {
              this.submitting.set(false);
              this.snackBar.open(
                err?.message || "Failed to submit report",
                "Close",
                { duration: 4000 },
              );
            },
          });
      }
    });
  }

  /**
   * Delete draft report
   */
  deleteReport(): void {
    const reportData = this.report();
    if (!reportData || !this.canDelete()) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Delete Report",
        message: `Delete report "${reportData.name}"? This cannot be undone.`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmColor: "warn",
        icon: "delete",
        iconColor: "#f44336",
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.reportService.deleteReport(reportData.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open("Report deleted", "Close", { duration: 3000 });
              this.router.navigate(["/reports"]);
            },
            error: (err) => {
              this.snackBar.open(
                err?.message || "Failed to delete report",
                "Close",
                { duration: 4000 },
              );
            },
          });
      }
    });
  }

  /**
   * Resubmit a rejected report
   */
  resubmitReport(): void {
    const reportData = this.report();
    if (!reportData || !this.canResubmit()) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Resubmit Report",
        message: `Resubmit "${reportData.name}" for approval?`,
        confirmText: "Resubmit",
        cancelText: "Cancel",
        confirmColor: "primary",
        icon: "send",
        iconColor: "#FF5900",
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.submitting.set(true);

        this.reportService.submitReport(reportData.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (updated) => {
              this.report.set(updated);
              this.submitting.set(false);
              this.snackBar.open("Report resubmitted for approval", "Close", {
                duration: 3000,
              });
            },
            error: (err) => {
              this.submitting.set(false);
              this.snackBar.open(
                err?.message || "Failed to resubmit report",
                "Close",
                { duration: 4000 },
              );
            },
          });
      }
    });
  }

  /**
   * Mark report as paid
   */
  markAsPaid(): void {
    const reportData = this.report();
    if (!reportData || !this.canPay()) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Mark as Paid",
        message: `Mark report "${reportData.name}" as paid?`,
        confirmText: "Mark Paid",
        cancelText: "Cancel",
        confirmColor: "primary",
        icon: "paid",
        iconColor: "#4caf50",
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.submitting.set(true);
        this.reportService.markAsPaid(reportData.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (updated) => {
              this.report.set(updated);
              this.submitting.set(false);
              this.snackBar.open("Report marked as paid", "Close", {
                duration: 3000,
              });
            },
            error: (err) => {
              this.submitting.set(false);
              this.snackBar.open(
                err?.message || "Failed to mark as paid",
                "Close",
                { duration: 4000 },
              );
            },
          });
      }
    });
  }

  /**
   * Approve the report
   */
  approveReport(): void {
    const approval = this.pendingApproval();
    if (!approval) {
      return;
    }

    const dialogRef = this.dialog.open(ApproveDialog, {
      width: "600px",
      maxWidth: "90vw",
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
                this.snackBar.open("Report approved successfully", "Close", {
                  duration: 3000,
                });
                // Reload report to get updated status
                this.loadReport();
              },
              error: (err) => {
                this.approving.set(false);
                this.snackBar.open(
                  err?.message || "Failed to approve report",
                  "Close",
                  { duration: 4000 },
                );
              },
            });
        }
      });
  }

  /**
   * Reject the report
   */
  rejectReport(): void {
    const approval = this.pendingApproval();
    if (!approval) {
      return;
    }

    const dialogRef = this.dialog.open(RejectDialog, {
      width: "600px",
      maxWidth: "90vw",
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
                this.snackBar.open("Report rejected", "Close", {
                  duration: 3000,
                });
                // Reload report to get updated status
                this.loadReport();
              },
              error: (err) => {
                this.approving.set(false);
                this.snackBar.open(
                  err?.message || "Failed to reject report",
                  "Close",
                  { duration: 4000 },
                );
              },
            });
        }
      });
  }

  /**
   * Remove an expense from the report
   */
  removeExpense(expense: Expense): void {
    const reportData = this.report();
    if (!reportData || !this.canEdit()) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Remove Expense",
        message: `Remove "${expense.merchant}" from this report?`,
        confirmText: "Remove",
        cancelText: "Cancel",
        confirmColor: "warn",
        icon: "remove_circle",
        iconColor: "#f44336",
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.reportService.removeExpenseFromReport(reportData.id, expense.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open("Expense removed from report", "Close", {
                duration: 3000,
              });
              this.loadReport();
            },
            error: (err) => {
              this.snackBar.open(
                err?.message || "Failed to remove expense",
                "Close",
                { duration: 4000 },
              );
            },
          });
      }
    });
  }

  /**
   * View expense detail
   */
  viewExpense(expense: Expense): void {
    this.router.navigate(["/expenses", expense.id]);
  }

  /**
   * Get status badge variant
   */
  getBadgeStatus(
    status: ReportStatus | ExpenseStatus,
  ): "draft" | "pending" | "approved" | "rejected" | "reimbursed" {
    switch (status) {
      case ReportStatus.DRAFT:
      case ExpenseStatus.DRAFT:
        return "draft";
      case ReportStatus.SUBMITTED:
      case ExpenseStatus.SUBMITTED:
        return "pending";
      case ReportStatus.APPROVED:
      case ExpenseStatus.APPROVED:
        return "approved";
      case ReportStatus.REJECTED:
      case ExpenseStatus.REJECTED:
        return "rejected";
      case ReportStatus.PAID:
      case ExpenseStatus.REIMBURSED:
        return "reimbursed";
      default:
        return "draft";
    }
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  /**
   * Format date
   */
  formatDate(dateString?: string | null): string {
    if (!dateString) {
      return "â€”";
    }
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  /**
   * Get timeline items for report
   */
  getTimeline() {
    const reportData = this.report();
    if (!reportData) {
      return [];
    }

    const timeline = [
      { label: "Created", value: reportData.created_at },
    ];

    if (reportData.submitted_at) {
      timeline.push({ label: "Submitted", value: reportData.submitted_at });
    }

    if (reportData.approved_at) {
      timeline.push({ label: "Approved", value: reportData.approved_at });
    }

    if (reportData.rejected_at) {
      timeline.push({ label: "Rejected", value: reportData.rejected_at });
    }

    if (reportData.paid_at) {
      timeline.push({ label: "Paid", value: reportData.paid_at });
    }

    return timeline;
  }
}