import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router } from "@angular/router";
import { MatCardModule } from "@angular/material/card";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { forkJoin, Subject } from "rxjs";
import { takeUntil } from "rxjs/operators";
import { ReportService } from "../../../core/services/report.service";
import { AuthService } from "../../../core/services/auth.service";
import { ApprovalService } from "../../../core/services/approval.service";
import { ExpenseReport, ReportStatus } from "../../../core/models/report.model";
import { Expense } from "../../../core/models/expense.model";
import { ApprovalWithDetails } from "../../../core/models/approval.model";
import { StatusBadge } from "../../../shared/components/status-badge/status-badge";
import { AddExpensesDialogComponent } from "./add-expenses-dialog.component";
import { ConfirmDialogComponent, ConfirmDialogData } from "../../../shared/components/confirm-dialog/confirm-dialog";
import { ApproveDialog, ApproveDialogData, ApproveDialogResult } from "../../approvals/approve-dialog/approve-dialog";
import { RejectDialog, RejectDialogData, RejectDialogResult } from "../../approvals/reject-dialog/reject-dialog";
import { ReportExpensesTableComponent } from "../report-expenses-table/report-expenses-table";
import { ReportTimelineComponent, TimelineItem } from "../report-timeline/report-timeline";

@Component({
  selector: "app-report-detail",
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    StatusBadge,
    ReportExpensesTableComponent,
    ReportTimelineComponent,
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

  report = signal<ExpenseReport | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  submitting = signal(false);
  approving = signal(false);
  reportId = signal<string | null>(null);
  pendingApproval = signal<ApprovalWithDetails | null>(null);

  readonly ReportStatus = ReportStatus;

  expenses = computed(() => {
    const r = this.report();
    if (!r?.report_expenses) return [];
    return r.report_expenses
      .map((re) => re.expense)
      .filter((exp): exp is Expense => exp !== undefined)
      .sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
  });

  hasExpenses = computed(() => this.expenses().length > 0);
  canEdit = computed(() => this.report()?.status === ReportStatus.DRAFT);
  canSubmit = computed(() => this.report()?.status === ReportStatus.DRAFT && this.hasExpenses());
  canDelete = computed(() => this.report()?.status === ReportStatus.DRAFT);
  canPay = computed(() => this.report()?.status === ReportStatus.APPROVED && this.authService.userRole === "finance");
  isRejected = computed(() => this.report()?.status === ReportStatus.REJECTED);
  canResubmit = computed(() => this.report()?.status === ReportStatus.REJECTED && this.hasExpenses());
  canApprove = computed(() => this.pendingApproval() !== null);

  timelineItems = computed((): TimelineItem[] => {
    const r = this.report();
    if (!r) return [];
    const items: TimelineItem[] = [{ label: "Created", value: r.created_at }];
    if (r.submitted_at) items.push({ label: "Submitted", value: r.submitted_at });
    if (r.approved_at) items.push({ label: "Approved", value: r.approved_at });
    if (r.rejected_at) items.push({ label: "Rejected", value: r.rejected_at });
    if (r.paid_at) items.push({ label: "Paid", value: r.paid_at });
    return items;
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

  loadReport(): void {
    const id = this.reportId();
    if (!id) return;

    this.loading.set(true);
    this.error.set(null);

    this.reportService.getReportById(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: (report) => {
        this.report.set(report);
        this.loading.set(false);
        this.checkPendingApproval(id);
      },
      error: (err) => {
        this.error.set(err?.message || "Failed to load report");
        this.loading.set(false);
      },
    });
  }

  private checkPendingApproval(reportId: string): void {
    this.approvalService.getPendingApprovals().pipe(takeUntil(this.destroy$)).subscribe({
      next: (approvals) => this.pendingApproval.set(approvals.find((a) => a.report_id === reportId) || null),
      error: () => this.pendingApproval.set(null),
    });
  }

  goBack(): void {
    this.router.navigate(["/reports"]);
  }

  openAddExpensesDialog(): void {
    const dialogRef = this.dialog.open(AddExpensesDialogComponent, { width: "600px", disableClose: true });
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.length) this.addExpenses(result);
    });
  }

  private addExpenses(expenseIds: string[]): void {
    const reportId = this.reportId();
    if (!reportId) return;

    this.loading.set(true);
    forkJoin(expenseIds.map((id) => this.reportService.addExpenseToReport(reportId, id)))
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open(`${expenseIds.length} expenses added`, "Close", { duration: 3000 });
          this.loadReport();
        },
        error: () => {
          this.snackBar.open("Failed to add some expenses", "Close", { duration: 4000 });
          this.loadReport();
        },
      });
  }

  submitReport(): void {
    const r = this.report();
    if (!r || !this.canSubmit()) return;

    this.confirmAction("Submit Report", `Submit "${r.name}" for approval?`, "Submit", "send", "#FF5900", () => {
      this.submitting.set(true);
      this.reportService.submitReport(r.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          this.report.set(updated);
          this.submitting.set(false);
          this.snackBar.open("Report submitted for approval", "Close", { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          this.snackBar.open(err?.message || "Failed to submit report", "Close", { duration: 4000 });
        },
      });
    });
  }

  deleteReport(): void {
    const r = this.report();
    if (!r || !this.canDelete()) return;

    this.confirmAction("Delete Report", `Delete "${r.name}"? This cannot be undone.`, "Delete", "delete", "#f44336", () => {
      this.reportService.deleteReport(r.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.snackBar.open("Report deleted", "Close", { duration: 3000 });
          this.router.navigate(["/reports"]);
        },
        error: (err) => this.snackBar.open(err?.message || "Failed to delete report", "Close", { duration: 4000 }),
      });
    }, "warn");
  }

  resubmitReport(): void {
    const r = this.report();
    if (!r || !this.canResubmit()) return;

    this.confirmAction("Resubmit Report", `Resubmit "${r.name}" for approval?`, "Resubmit", "send", "#FF5900", () => {
      this.submitting.set(true);
      this.reportService.submitReport(r.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          this.report.set(updated);
          this.submitting.set(false);
          this.snackBar.open("Report resubmitted", "Close", { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          this.snackBar.open(err?.message || "Failed to resubmit", "Close", { duration: 4000 });
        },
      });
    });
  }

  markAsPaid(): void {
    const r = this.report();
    if (!r || !this.canPay()) return;

    this.confirmAction("Mark as Paid", `Mark "${r.name}" as paid?`, "Mark Paid", "paid", "#4caf50", () => {
      this.submitting.set(true);
      this.reportService.markAsPaid(r.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: (updated) => {
          this.report.set(updated);
          this.submitting.set(false);
          this.snackBar.open("Report marked as paid", "Close", { duration: 3000 });
        },
        error: (err) => {
          this.submitting.set(false);
          this.snackBar.open(err?.message || "Failed to mark as paid", "Close", { duration: 4000 });
        },
      });
    });
  }

  approveReport(): void {
    const approval = this.pendingApproval();
    if (!approval) return;

    const dialogRef = this.dialog.open(ApproveDialog, {
      width: "600px",
      maxWidth: "90vw",
      data: { approval } as ApproveDialogData,
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((result: ApproveDialogResult | undefined) => {
      if (result !== undefined) {
        this.approving.set(true);
        this.approvalService.approve(approval.id, { comment: result.comment }).pipe(takeUntil(this.destroy$)).subscribe({
          next: () => {
            this.approving.set(false);
            this.pendingApproval.set(null);
            this.snackBar.open("Report approved", "Close", { duration: 3000 });
            this.loadReport();
          },
          error: (err) => {
            this.approving.set(false);
            this.snackBar.open(err?.message || "Failed to approve", "Close", { duration: 4000 });
          },
        });
      }
    });
  }

  rejectReport(): void {
    const approval = this.pendingApproval();
    if (!approval) return;

    const dialogRef = this.dialog.open(RejectDialog, {
      width: "600px",
      maxWidth: "90vw",
      data: { approval } as RejectDialogData,
    });

    dialogRef.afterClosed().pipe(takeUntil(this.destroy$)).subscribe((result: RejectDialogResult | undefined) => {
      if (result !== undefined) {
        this.approving.set(true);
        this.approvalService.reject(approval.id, { rejection_reason: result.rejection_reason, comment: result.comment })
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.approving.set(false);
              this.pendingApproval.set(null);
              this.snackBar.open("Report rejected", "Close", { duration: 3000 });
              this.loadReport();
            },
            error: (err) => {
              this.approving.set(false);
              this.snackBar.open(err?.message || "Failed to reject", "Close", { duration: 4000 });
            },
          });
      }
    });
  }

  removeExpense(expense: Expense): void {
    const r = this.report();
    if (!r || !this.canEdit()) return;

    this.confirmAction("Remove Expense", `Remove "${expense.merchant}" from this report?`, "Remove", "remove_circle", "#f44336", () => {
      this.reportService.removeExpenseFromReport(r.id, expense.id).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.snackBar.open("Expense removed", "Close", { duration: 3000 });
          this.loadReport();
        },
        error: (err) => this.snackBar.open(err?.message || "Failed to remove expense", "Close", { duration: 4000 }),
      });
    }, "warn");
  }

  viewExpense(expense: Expense): void {
    this.router.navigate(["/expenses", expense.id]);
  }

  getBadgeStatus(status: ReportStatus): "draft" | "pending" | "approved" | "rejected" | "reimbursed" {
    const map: Record<ReportStatus, "draft" | "pending" | "approved" | "rejected" | "reimbursed"> = {
      [ReportStatus.DRAFT]: "draft",
      [ReportStatus.SUBMITTED]: "pending",
      [ReportStatus.APPROVED]: "approved",
      [ReportStatus.REJECTED]: "rejected",
      [ReportStatus.PAID]: "reimbursed",
    };
    return map[status] || "draft";
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  }

  formatDate(dateString?: string | null): string {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  private confirmAction(
    title: string,
    message: string,
    confirmText: string,
    icon: string,
    iconColor: string,
    onConfirm: () => void,
    confirmColor: "primary" | "warn" = "primary"
  ): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { title, message, confirmText, cancelText: "Cancel", confirmColor, icon, iconColor } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) onConfirm();
    });
  }
}
