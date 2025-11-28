import { Component, OnInit, inject, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, map, startWith, switchMap, Subject, merge, catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApprovalService } from '../../../core/services/approval.service';
import { ApprovalWithDetails, ApprovalStatus } from '../../../core/models/approval.model';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { LoadingSkeleton } from '../../../shared/components/loading-skeleton/loading-skeleton';
import { ApproveDialog, ApproveDialogData, ApproveDialogResult } from '../approve-dialog/approve-dialog';
import { RejectDialog, RejectDialogData, RejectDialogResult } from '../reject-dialog/reject-dialog';
import { ApprovalHistoryDialog, ApprovalHistoryDialogData } from '../approval-history/approval-history';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatDatepickerModule,
    MatInputModule,
    MatNativeDateModule,
    MatDialogModule,
    MatSnackBarModule,
    EmptyState,
    LoadingSkeleton
  ],
  templateUrl: './approval-queue.html',
  styleUrls: ['./approval-queue.scss']
})
export class ApprovalQueue implements OnInit {
  private approvalService = inject(ApprovalService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);

  approvals$!: Observable<ApprovalWithDetails[]>;
  loading = true;
  error: string | null = null;
  private refreshTrigger$ = new Subject<void>();

  filterForm!: FormGroup;
  displayedColumns = ['submitter', 'type', 'amount', 'category', 'workflow', 'submitted', 'actions'];

  ngOnInit(): void {
    this.initializeFilterForm();
    this.loadApprovals();
  }

  private initializeFilterForm(): void {
    this.filterForm = this.fb.group({
      amount_min: [null],
      amount_max: [null],
      date_from: [null],
      date_to: [null]
    });
  }

  private loadApprovals(): void {
    // ✅ FIX: Properly integrate refreshTrigger$ into observable chain
    this.approvals$ = merge(
      this.filterForm.valueChanges.pipe(startWith(this.filterForm.value)),
      this.refreshTrigger$
    ).pipe(
      switchMap(() => {
        this.loading = true;
        this.error = null;
        return this.approvalService.getPendingApprovals(this.filterForm.value);
      }),
      map(approvals => {
        this.loading = false;
        return approvals;
      }),
      catchError((error) => {
        console.error('Error loading approvals:', error);
        this.loading = false;
        this.error = 'Failed to load approvals';
        return of([]);
      })
    );
  }

  private refreshApprovals(): void {
    this.refreshTrigger$.next();
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

  getApprovalType(approval: ApprovalWithDetails): string {
    return approval.expense_id ? 'Expense' : 'Report';
  }

  getAmount(approval: ApprovalWithDetails): number {
    if (approval.expense) {
      return approval.expense.amount;
    }
    if (approval.report) {
      return approval.report.total_amount;
    }
    return 0;
  }

  getCategory(approval: ApprovalWithDetails): string {
    if (approval.expense) {
      return approval.expense.category;
    }
    if (approval.report) {
      // Handle undefined expense_count with default of 0
      const count = approval.report.expense_count ?? 0;
      return count === 1 ? '1 expense' : `${count} expenses`;
    }
    return 'N/A';
  }

  getMerchant(approval: ApprovalWithDetails): string {
    if (approval.expense) {
      return approval.expense.merchant;
    }
    if (approval.report) {
      return approval.report.name;
    }
    return 'N/A';
  }

  getStatusColor(status: ApprovalStatus): string {
    return this.approvalService.getStatusColor(status);
  }

  getStatusDisplay(status: ApprovalStatus): string {
    return this.approvalService.getStatusDisplay(status);
  }

  onApprove(approval: ApprovalWithDetails): void {
    const dialogRef = this.dialog.open(ApproveDialog, {
      width: '600px',
      maxWidth: '90vw',
      data: { approval } as ApproveDialogData,
      disableClose: false
    });

    // ✅ FIX: Add takeUntilDestroyed to prevent memory leaks
    dialogRef.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: ApproveDialogResult | undefined) => {
        if (result !== undefined) {
          // ✅ FIX: Pass DTO object instead of raw value
          this.approvalService.approve(approval.id, { comment: result.comment })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.snackBar.open(
                  `${this.getApprovalType(approval)} approved successfully`,
                  'Close',
                  { duration: 3000 }
                );
                // ✅ FIX: Use proper refresh mechanism
                this.refreshApprovals();
              },
              error: (error) => {
                console.error('Error approving:', error);
                this.snackBar.open(
                  'Failed to approve. Please try again.',
                  'Close',
                  { duration: 5000 }
                );
              }
            });
        }
      });
  }

  onReject(approval: ApprovalWithDetails): void {
    const dialogRef = this.dialog.open(RejectDialog, {
      width: '600px',
      maxWidth: '90vw',
      data: { approval } as RejectDialogData,
      disableClose: false
    });

    // ✅ FIX: Add takeUntilDestroyed to prevent memory leaks
    dialogRef.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: RejectDialogResult | undefined) => {
        if (result !== undefined) {
          // ✅ FIX: Pass DTO object instead of individual parameters
          this.approvalService.reject(approval.id, {
            rejection_reason: result.rejection_reason,
            comment: result.comment
          })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.snackBar.open(
                  `${this.getApprovalType(approval)} rejected successfully`,
                  'Close',
                  { duration: 3000 }
                );
                // ✅ FIX: Use proper refresh mechanism
                this.refreshApprovals();
              },
              error: (error) => {
                console.error('Error rejecting:', error);
                this.snackBar.open(
                  'Failed to reject. Please try again.',
                  'Close',
                  { duration: 5000 }
                );
              }
            });
        }
      });
  }

  onViewDetails(approval: ApprovalWithDetails): void {
    if (approval.expense_id) {
      this.router.navigate(['/expenses', approval.expense_id]);
    } else if (approval.report_id) {
      this.router.navigate(['/reports', approval.report_id]);
    }
  }

  onViewHistory(approval: ApprovalWithDetails): void {
    this.dialog.open(ApprovalHistoryDialog, {
      width: '700px',
      maxWidth: '90vw',
      data: { approval } as ApprovalHistoryDialogData,
      disableClose: false
    });
  }

  clearFilters(): void {
    this.filterForm.reset();
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}
