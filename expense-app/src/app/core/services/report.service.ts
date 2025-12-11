import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError, firstValueFrom } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpenseReport,
  CreateReportDto,
  UpdateReportDto,
  ReportStatus,
  ReportFilterOptions,
  ReportStats
} from '../models/report.model';
import { Expense } from '../models/expense.model';

/**
 * Report Service
 *
 * Handles all operations related to expense reports:
 * - CRUD operations for reports
 * - Adding/removing expenses to/from reports
 * - Submitting reports for approval
 * - Approving/rejecting reports
 * - Marking reports as paid
 *
 * All operations are automatically scoped to the current organization.
 *
 * @example
 * ```typescript
 * // Create a new report
 * reportService.createReport({
 *   name: 'Dallas Business Trip - Nov 2025',
 *   description: 'Client meetings and conference',
 *   start_date: '2025-11-10',
 *   end_date: '2025-11-12'
 * }).subscribe(report => {
 *   console.log('Report created:', report);
 * });
 *
 * // Add expenses to report
 * reportService.addExpenseToReport(reportId, expenseId)
 *   .subscribe(() => {
 *     console.log('Expense added to report');
 *   });
 *
 * // Submit report for approval
 * reportService.submitReport(reportId)
 *   .subscribe(report => {
 *     console.log('Report submitted:', report);
 *   });
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ReportService {
  private readonly supabase = inject(SupabaseService);
  private readonly orgService = inject(OrganizationService);
  private readonly logger = inject(LoggerService);

  /**
   * Get all reports for the current organization
   * Supports filtering, sorting, and pagination
   *
   * @param options Filter and pagination options
   * @returns Observable of expense reports array
   */
  getReports(options: ReportFilterOptions = {}): Observable<ExpenseReport[]> {
    const organizationId = this.orgService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization context'));
    }

    return from(
      (async () => {
        let query = this.supabase.client
          .from('expense_reports')
          .select(`
            *,
            report_expenses(
              id,
              expense_id,
              display_order,
              added_at,
              expense:expenses(
                *,
                receipt:receipts!expenses_receipt_id_fkey(*),
                expense_receipts(
                  *,
                  receipt:receipts(*)
                )
              )
            )
          `)
          .eq('organization_id', organizationId);

        // Apply filters
        if (options.status) {
          query = query.eq('status', options.status);
        }

        if (options.user_id) {
          query = query.eq('user_id', options.user_id);
        }

        if (options.start_date) {
          query = query.gte('start_date', options.start_date);
        }

        if (options.end_date) {
          query = query.lte('end_date', options.end_date);
        }

        if (options.search) {
          query = query.or(`name.ilike.%${options.search}%,description.ilike.%${options.search}%`);
        }

        // Apply sorting
        const sortBy = options.sort_by || 'created_at';
        const sortOrder = options.sort_order || 'desc';
        query = query.order(sortBy, { ascending: sortOrder === 'asc' });

        // Apply pagination
        if (options.page !== undefined && options.limit !== undefined) {
          const start = options.page * options.limit;
          const end = start + options.limit - 1;
          query = query.range(start, end);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        return (data as ExpenseReport[]).map(report => ({
          ...report,
          expense_count: report.expense_count ?? report.report_expenses?.length ?? 0
        }));
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error fetching reports', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to fetch reports'));
      })
    );
  }

  /**
   * Get a single report by ID with all related data
   *
   * @param reportId Report ID
   * @returns Observable of expense report
   */
  getReportById(reportId: string): Observable<ExpenseReport> {
    return from(
      this.supabase.client
        .from('expense_reports')
        .select(`
          *,
          report_expenses(
            id,
            expense_id,
            display_order,
            added_at,
            added_by,
            expense:expenses(
              *,
              receipt:receipts!expenses_receipt_id_fkey(*),
              expense_receipts(
                *,
                receipt:receipts(*)
              )
            )
          )
        `)
        .eq('id', reportId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        const report = data as ExpenseReport;
        return {
          ...report,
          expense_count: report.expense_count ?? report.report_expenses?.length ?? 0
        };
      }),
      catchError(err => {
        this.logger.error('Error fetching report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to fetch report'));
      })
    );
  }

  /**
   * Create a new expense report
   *
   * @param dto Report creation data
   * @returns Observable of created report
   */
  createReport(dto: CreateReportDto): Observable<ExpenseReport> {
    const organizationId = this.orgService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization context'));
    }

    return from(
      (async () => {
        // Create the report
        const { data: report, error: reportError } = await this.supabase.client
          .from('expense_reports')
          .insert({
            organization_id: organizationId,
            user_id: (await this.supabase.client.auth.getUser()).data.user?.id,
            name: dto.name,
            description: dto.description,
            start_date: dto.start_date,
            end_date: dto.end_date,
            status: ReportStatus.DRAFT,
            total_amount: 0,
            currency: 'USD'
          })
          .select()
          .single();

        if (reportError) {
          throw reportError;
        }

        // If initial expenses provided, add them to the report
        if (dto.expense_ids && dto.expense_ids.length > 0) {
          const userId = (await this.supabase.client.auth.getUser()).data.user?.id;
          const junctionRecords = dto.expense_ids.map((expenseId, index) => ({
            report_id: report.id,
            expense_id: expenseId,
            display_order: index,
            added_by: userId
          }));

          const { error: junctionError } = await this.supabase.client
            .from('report_expenses')
            .insert(junctionRecords);

          if (junctionError) {
            throw junctionError;
          }
        }

        return report as ExpenseReport;
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error creating report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to create report'));
      })
    );
  }

  /**
   * Update an existing report
   * Only draft reports can be updated by users
   *
   * @param reportId Report ID
   * @param dto Update data
   * @returns Observable of updated report
   */
  updateReport(reportId: string, dto: UpdateReportDto): Observable<ExpenseReport> {
    return from(
      this.supabase.client
        .from('expense_reports')
        .update({
          name: dto.name,
          description: dto.description,
          start_date: dto.start_date,
          end_date: dto.end_date,
          status: dto.status,
          rejection_reason: dto.rejection_reason,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data as ExpenseReport;
      }),
      catchError(err => {
        this.logger.error('Error updating report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to update report'));
      })
    );
  }

  /**
   * Delete a report
   * Only draft reports can be deleted
   *
   * @param reportId Report ID
   * @returns Observable of void
   */
  deleteReport(reportId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('expense_reports')
        .delete()
        .eq('id', reportId)
    ).pipe(
      map(({ error }) => {
        if (error) {
          throw error;
        }
      }),
      catchError(err => {
        this.logger.error('Error deleting report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to delete report'));
      })
    );
  }

  /**
   * Add an expense to a report
   *
   * @param reportId Report ID
   * @param expenseId Expense ID
   * @returns Observable of void
   */
  addExpenseToReport(reportId: string, expenseId: string): Observable<void> {
    return from(this.addExpenseToReportInternal(reportId, expenseId)).pipe(
      catchError(err => {
        this.logger.error('Error adding expense to report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to add expense to report'));
      })
    );
  }

  /**
   * Remove an expense from a report
   *
   * @param reportId Report ID
   * @param expenseId Expense ID
   * @returns Observable of void
   */
  removeExpenseFromReport(reportId: string, expenseId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('report_expenses')
        .delete()
        .eq('report_id', reportId)
        .eq('expense_id', expenseId)
    ).pipe(
      map(({ error }) => {
        if (error) {
          throw error;
        }
      }),
      catchError(err => {
        this.logger.error('Error removing expense from report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to remove expense'));
      })
    );
  }

  private async addExpenseToReportInternal(reportId: string, expenseId: string): Promise<void> {
    // Get current max display_order
    const { data: existing } = await this.supabase.client
      .from('report_expenses')
      .select('display_order')
      .eq('report_id', reportId)
      .order('display_order', { ascending: false })
      .limit(1);

    const nextOrder = existing && existing.length > 0
      ? (existing[0]?.display_order ?? 0) + 1
      : 0;

    const { error } = await this.supabase.client
      .from('report_expenses')
      .insert({
        report_id: reportId,
        expense_id: expenseId,
        display_order: nextOrder,
        added_by: (await this.supabase.client.auth.getUser()).data.user?.id
      });

    if (error) {
      throw error;
    }
  }

  /**
   * Reorder expenses within a report
   * OPTIMIZED: Uses batch update instead of N individual queries
   *
   * @param reportId Report ID
   * @param expenseIds Array of expense IDs in desired order
   * @returns Observable of void
   */
  reorderExpenses(reportId: string, expenseIds: string[]): Observable<void> {
    return from(
      (async () => {
        if (expenseIds.length === 0) {
          return;
        }

        // Batch update using PostgreSQL RPC function
        // This converts N queries into 1 query
        const { error } = await this.supabase.client.rpc('reorder_report_expenses', {
          p_report_id: reportId,
          p_expense_ids: expenseIds
        });

        // Fallback to individual updates if RPC not available
        // This ensures backward compatibility
        if (error?.code === '42883') { // function does not exist
          for (let i = 0; i < expenseIds.length; i++) {
            const { error: updateError } = await this.supabase.client
              .from('report_expenses')
              .update({ display_order: i })
              .eq('report_id', reportId)
              .eq('expense_id', expenseIds[i]);

            if (updateError) {
              throw updateError;
            }
          }
        } else if (error) {
          throw error;
        }
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error reordering expenses', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to reorder expenses'));
      })
    );
  }

  /**
   * Automatically attach a draft expense to the current month's auto-created report.
   * Used when employees create expenses without explicitly choosing a report.
   */
  async autoAttachExpenseToMonthlyReport(expense: Expense): Promise<void> {
    if (!expense?.id || expense.is_reported) {
      return;
    }

    try {
      const report = await this.ensureMonthlyAutoReport(expense.expense_date);
      await this.addExpenseToReportInternal(report.id, expense.id);
    } catch (error) {
      this.logger.warn('Auto-attach expense to monthly report skipped', 'ReportService', error);
    }
  }

  private async ensureMonthlyAutoReport(expenseDate?: string): Promise<ExpenseReport> {
    const { data: authData } = await this.supabase.client.auth.getUser();
    const userId = authData.user?.id;
    const organizationId = this.orgService.currentOrganizationId;

    if (!userId) {
      throw new Error('User not authenticated');
    }
    if (!organizationId) {
      throw new Error('No organization context');
    }

    const target = expenseDate ? new Date(expenseDate) : new Date();
    const year = target.getFullYear();
    const month = target.getMonth();
    const periodKey = `${year}-${String(month + 1).padStart(2, '0')}`;

    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const { data: existing, error } = await this.supabase.client
      .from('expense_reports')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('status', ReportStatus.DRAFT)
      .eq('auto_created', true)
      .eq('auto_report_period', periodKey)
      .limit(1);

    if (error) {
      throw error;
    }

    if (existing && existing.length > 0) {
      return existing[0] as ExpenseReport;
    }

    const reportName = `${start.toLocaleString('default', { month: 'long' })} ${year} Expenses`;

    const { data: inserted, error: insertError } = await this.supabase.client
      .from('expense_reports')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        name: reportName,
        description: 'Auto-created monthly report',
        start_date: startDate,
        end_date: endDate,
        status: ReportStatus.DRAFT,
        auto_created: true,
        auto_report_period: periodKey
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return inserted as ExpenseReport;
  }

  /**
   * Submit a report for approval
   * Changes status from draft to submitted
   * Pre-checks for manager assignment if workflow requires it
   *
   * @param reportId Report ID
   * @returns Observable of updated report
   */
  submitReport(reportId: string): Observable<ExpenseReport> {
    return from(
      (async () => {
        // Pre-check: Verify user has a manager assigned (required for most approval workflows)
        const hasManager = await this.checkManagerAssignment();
        if (!hasManager) {
          throw new Error('Cannot submit for approval: You do not have a manager assigned. Please contact your organization administrator to assign a manager to your account.');
        }

        // Load report with expenses/receipts for validation
        const detail = await firstValueFrom(this.getReportById(reportId));
        if (!detail) {
          throw new Error('Report not found');
        }
        // Validate: must have at least one expense, and every expense must have a receipt and required fields
        if (!detail.report_expenses?.length) {
          throw new Error('Cannot submit empty report. Add expenses first.');
        }
        // Check for missing receipts - support both junction table and legacy receipt_id
        const missingReceipt = detail.report_expenses.some(re => {
          const exp = re.expense;
          const hasJunctionReceipts = exp?.expense_receipts && exp.expense_receipts.length > 0;
          const hasLegacyReceipt = exp?.receipt_id || exp?.receipt;
          return !hasJunctionReceipts && !hasLegacyReceipt;
        });
        if (missingReceipt) {
          throw new Error('All expenses must have receipts before submitting the report.');
        }
        const missingFields = detail.report_expenses.some(re => {
          const e = re.expense;
          return !e?.merchant || !e?.amount || !e?.expense_date || !e?.category;
        });
        if (missingFields) {
          throw new Error('All expenses need merchant, amount, category, and date before submission.');
        }

        // Create approval chain for the report
        const { error: approvalError } = await this.supabase.client.rpc('create_approval_chain', {
          p_expense_id: null,
          p_report_id: reportId
        });

        if (approvalError) {
          // Provide user-friendly error messages for common issues
          let errorMessage = approvalError.message || 'Failed to submit report for approval';
          if (errorMessage.includes('no active manager')) {
            errorMessage = 'Cannot submit for approval: You do not have a manager assigned. Please contact your organization administrator to assign a manager to your account.';
          } else if (errorMessage.includes('No eligible user found with role')) {
            errorMessage = 'Cannot submit for approval: No approver is available for the required role. Please contact your organization administrator.';
          }
          throw new Error(errorMessage);
        }

        // Fetch updated report with approval details
        const updatedReport = await firstValueFrom(this.getReportById(reportId));
        if (!updatedReport) {
          throw new Error('Failed to fetch updated report');
        }

        return updatedReport;
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error submitting report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to submit report'));
      })
    );
  }

  /**
   * Check if current user has a manager assigned in the current organization
   * Returns true if manager is assigned and active, false otherwise
   */
  private async checkManagerAssignment(): Promise<boolean> {
    const userId = this.supabase.userId;
    const organizationId = this.orgService.currentOrganizationId;

    if (!userId || !organizationId) {
      return false;
    }

    const { data, error } = await this.supabase.client
      .from('organization_members')
      .select('manager_id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return false;
    }

    // If no manager_id is set, user doesn't have a manager
    if (!data.manager_id) {
      return false;
    }

    // Verify the manager is also an active member of the organization
    const { data: managerData, error: managerError } = await this.supabase.client
      .from('organization_members')
      .select('id')
      .eq('user_id', data.manager_id)
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    return !managerError && !!managerData;
  }


  /**
   * Resubmit a rejected report for approval
   * Resets the existing approval chain instead of creating a new one
   *
   * @param reportId Report ID
   * @returns Observable of updated report
   */
  resubmitReport(reportId: string): Observable<ExpenseReport> {
    return from(
      (async () => {
        // Load report to validate it's in rejected status
        const detail = await firstValueFrom(this.getReportById(reportId));
        if (!detail) {
          throw new Error('Report not found');
        }
        if (detail.status !== ReportStatus.REJECTED) {
          throw new Error('Only rejected reports can be resubmitted');
        }

        // Get current user ID
        const userId = (await this.supabase.client.auth.getUser()).data.user?.id;
        if (!userId) {
          throw new Error('User not authenticated');
        }

        // Call the resubmit_report RPC function
        const { error: resubmitError } = await this.supabase.client.rpc('resubmit_report', {
          p_report_id: reportId,
          p_submitter_id: userId
        });

        if (resubmitError) {
          throw resubmitError;
        }

        // Fetch updated report
        const updatedReport = await firstValueFrom(this.getReportById(reportId));
        if (!updatedReport) {
          throw new Error('Failed to fetch updated report');
        }

        return updatedReport;
      })()
    ).pipe(
      catchError(err => {
        return throwError(() => new Error(err?.message || 'Failed to resubmit report'));
      })
    );
  }
  /**
   * Approve a report (Manager action)
   * Changes status from submitted to approved
   *
   * @param reportId Report ID
   * @returns Observable of updated report
   */
  approveReport(reportId: string): Observable<ExpenseReport> {
    return from(
      (async () => {
        const userId = (await this.supabase.client.auth.getUser()).data.user?.id;

        const { data, error } = await this.supabase.client
          .from('expense_reports')
          .update({
            status: ReportStatus.APPROVED,
            approved_at: new Date().toISOString(),
            approved_by: userId,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        return data as ExpenseReport;
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error approving report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to approve report'));
      })
    );
  }

  /**
   * Reject a report (Manager action)
   * Changes status from submitted to rejected
   *
   * @param reportId Report ID
   * @param reason Rejection reason
   * @returns Observable of updated report
   */
  rejectReport(reportId: string, reason: string): Observable<ExpenseReport> {
    return from(
      (async () => {
        const userId = (await this.supabase.client.auth.getUser()).data.user?.id;

        const { data, error } = await this.supabase.client
          .from('expense_reports')
          .update({
            status: ReportStatus.REJECTED,
            rejected_at: new Date().toISOString(),
            rejected_by: userId,
            rejection_reason: reason,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        return data as ExpenseReport;
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error rejecting report', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to reject report'));
      })
    );
  }

  /**
   * Mark a report as paid (Finance action)
   * Changes status from approved to paid
   *
   * @param reportId Report ID
   * @returns Observable of updated report
   */
  markAsPaid(reportId: string): Observable<ExpenseReport> {
    return from(
      (async () => {
        const userId = (await this.supabase.client.auth.getUser()).data.user?.id;

        const { data, error } = await this.supabase.client
          .from('expense_reports')
          .update({
            status: ReportStatus.PAID,
            paid_at: new Date().toISOString(),
            paid_by: userId,
            updated_at: new Date().toISOString()
          })
          .eq('id', reportId)
          .select()
          .single();

        if (error) {
          throw error;
        }

        return data as ExpenseReport;
      })()
    ).pipe(
      catchError(err => {
        this.logger.error('Error marking report as paid', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to mark as paid'));
      })
    );
  }

  /**
   * Get report statistics
   *
   * @param reportId Report ID
   * @returns Observable of report stats
   */
  getReportStats(reportId: string): Observable<ReportStats> {
    return from(
      this.supabase.client
        .rpc('get_report_stats', { p_report_id: reportId })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          throw error;
        }
        return data as unknown as ReportStats;
      }),
      catchError(err => {
        this.logger.error('Error fetching report stats', err, 'ReportService');
        return throwError(() => new Error(err?.message || 'Failed to fetch report stats'));
      })
    );
  }

  /**
   * Get reports pending approval (for managers)
   * Returns all submitted reports that need approval
   *
   * @returns Observable of pending reports
   */
  getPendingReports(): Observable<ExpenseReport[]> {
    return this.getReports({ status: ReportStatus.SUBMITTED, sort_by: 'submitted_at', sort_order: 'asc' });
  }

  /**
   * Get reports ready for reimbursement (for finance)
   * Returns all approved reports that haven't been paid yet
   *
   * @returns Observable of approved reports
   */
  getApprovedReports(): Observable<ExpenseReport[]> {
    return this.getReports({ status: ReportStatus.APPROVED, sort_by: 'approved_at', sort_order: 'asc' });
  }

  /**
   * Get user's draft reports
   *
   * @param userId User ID (optional, defaults to current user)
   * @returns Observable of draft reports
   */
  getDraftReports(userId?: string): Observable<ExpenseReport[]> {
    return this.getReports({
      status: ReportStatus.DRAFT,
      user_id: userId,
      sort_by: 'updated_at',
      sort_order: 'desc'
    });
  }
}
