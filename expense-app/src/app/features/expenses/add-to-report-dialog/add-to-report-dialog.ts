import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { FormsModule } from '@angular/forms';
import { ReportService } from '../../../core/services/report.service';
import { ExpenseReport, ReportStatus } from '../../../core/models/report.model';
import { forkJoin } from 'rxjs';

/**
 * Add to Report Dialog Component
 * Allows user to add selected expenses to an existing draft report or create a new one
 *
 * Features:
 * - List existing draft reports
 * - Option to create new report
 * - Show expense count and total
 * - Loading and error states
 */
@Component({
  selector: 'app-add-to-report-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  templateUrl: './add-to-report-dialog.html',
  styleUrl: './add-to-report-dialog.scss'
})
export class AddToReportDialogComponent implements OnInit {
  private dialogRef = inject(MatDialogRef<AddToReportDialogComponent>);
  private reportService = inject(ReportService);

  // Dialog data: expense IDs and total amount
  expenseIds: string[];
  totalAmount: number;

  constructor() {
    const data = inject<{
    expenseIds: string[];
    totalAmount: number;
}>(MAT_DIALOG_DATA);

    this.expenseIds = data.expenseIds;
    this.totalAmount = data.totalAmount;
  }

  // State
  draftReports = signal<ExpenseReport[]>([]);
  loading = signal<boolean>(true);
  submitting = signal<boolean>(false);
  error = signal<string | null>(null);

  // Selected report or 'new' for creating new report
  selectedOption = '';

  ngOnInit(): void {
    this.loadDraftReports();
  }

  /**
   * Load user's draft reports
   */
  loadDraftReports(): void {
    this.loading.set(true);
    this.error.set(null);

    this.reportService.getReports({
      status: ReportStatus.DRAFT,
      sort_by: 'updated_at',
      sort_order: 'desc'
    }).subscribe({
      next: (reports) => {
        this.draftReports.set(reports);
        this.loading.set(false);
        // Auto-select first report if available, otherwise 'new'
        if (reports.length > 0) {
          this.selectedOption = reports[0].id;
        } else {
          this.selectedOption = 'new';
        }
      },
      error: (err) => {
        this.error.set(err?.message || 'Failed to load reports');
        this.loading.set(false);
        this.selectedOption = 'new';
      }
    });
  }

  /**
   * Add expenses to selected report or create new
   */
  onSubmit(): void {
    if (!this.selectedOption) {
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    if (this.selectedOption === 'new') {
      // Create new report with expenses
      this.reportService.createReport({
        name: `Expense Report - ${new Date().toLocaleDateString()}`,
        description: `${this.expenseIds.length} expenses`,
        expense_ids: this.expenseIds
      }).subscribe({
        next: (report) => {
          this.submitting.set(false);
          this.dialogRef.close({ success: true, report, action: 'created' });
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(err?.message || 'Failed to create report');
        }
      });
    } else {
      // Add expenses to existing report
      const addObs = this.expenseIds.map(expenseId =>
        this.reportService.addExpenseToReport(this.selectedOption, expenseId)
      );

      forkJoin(addObs).subscribe({
        next: () => {
          this.submitting.set(false);
          const report = this.draftReports().find(r => r.id === this.selectedOption);
          this.dialogRef.close({ success: true, report, action: 'added' });
        },
        error: (err) => {
          this.submitting.set(false);
          this.error.set(err?.message || 'Failed to add expenses to report');
        }
      });
    }
  }

  /**
   * Close dialog without action
   */
  onCancel(): void {
    this.dialogRef.close();
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
  formatDate(dateString?: string): string {
    if (!dateString) {
      return '—';
    }
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
