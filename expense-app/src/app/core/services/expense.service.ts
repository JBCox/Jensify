import { Injectable, inject } from "@angular/core";
import { from, Observable, of, throwError } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { SupabaseService } from "./supabase.service";
import { OrganizationService } from "./organization.service";
import {
  CreateExpenseDto,
  CreateExpenseItemDto,
  Expense,
  ExpenseFilters,
  ExpenseItem,
  ExpenseSortOptions,
  UpdateExpenseDto,
} from "../models/expense.model";
import { Receipt, ReceiptUploadResponse } from "../models/receipt.model";
import { ExpenseStatus } from "../models/enums";
import { NotificationService } from "./notification.service";
import { LoggerService } from "./logger.service";
import { ReportService } from "./report.service";
import { ReceiptService } from "./receipt.service";
import { ExpenseSplittingService } from "./expense-splitting.service";
import { ExpenseReceiptService } from "./expense-receipt.service";

/**
 * Service for managing expenses
 * Handles CRUD operations and queries with filters
 * Delegates receipt operations to ReceiptService
 * Delegates splitting operations to ExpenseSplittingService
 * All operations are scoped to the current organization
 */
@Injectable({
  providedIn: "root",
})
export class ExpenseService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private logger = inject(LoggerService);
  private reportService = inject(ReportService);
  private receiptService = inject(ReceiptService);
  private splittingService = inject(ExpenseSplittingService);
  private expenseReceiptService = inject(ExpenseReceiptService);

  /**
   * Create a new expense
   */
  createExpense(dto: CreateExpenseDto): Observable<Expense> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    return from(
      this.supabase.client
        .from("expenses")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          merchant: dto.merchant,
          amount: dto.amount,
          category: dto.category,
          expense_date: dto.expense_date,
          notes: dto.notes,
          receipt_id: dto.receipt_id,
          status: ExpenseStatus.DRAFT,
          currency: "USD",
          is_reimbursable: true,
          policy_violations: [],
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("No expense data returned");
        return data as unknown as Expense;
      }),
      switchMap((expense) => this.autoAssignExpenseToReport(expense)),
      catchError(this.handleError),
    );
  }

  /**
   * Get expense by ID
   * Optionally populate user and receipt relationships
   * Now includes expense_receipts array with multiple receipts
   */
  getExpenseById(id: string, includeRelations = true): Observable<Expense> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    const query = this.supabase.client
      .from("expenses")
      .select(
        includeRelations
          ? "*, user:users!expenses_user_id_fkey(*), receipt:receipts!expenses_receipt_id_fkey(*), expense_receipts(*, receipt:receipts(*))"
          : "*",
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense not found");
        return data as unknown as Expense;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get all expenses for current user
   */
  getMyExpenses(
    filters?: ExpenseFilters,
    sort?: ExpenseSortOptions,
  ): Observable<Expense[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return this.queryExpenses({ ...filters, user_id: userId }, sort);
  }

  /**
   * Query expenses with filters and sorting
   * Used by finance dashboard and reports
   * Automatically scoped to current organization
   * Now includes expense_receipts array with multiple receipts
   */
  queryExpenses(
    filters?: ExpenseFilters,
    sort?: ExpenseSortOptions,
  ): Observable<Expense[]> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    let query = this.supabase.client
      .from("expenses")
      .select(
        "*, user:users!expenses_user_id_fkey(*), receipt:receipts!expenses_receipt_id_fkey(*), expense_receipts(*, receipt:receipts(*))",
      )
      .eq("organization_id", organizationId);

    // Apply filters
    if (filters) {
      if (filters.user_id) {
        query = query.eq("user_id", filters.user_id);
      }
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in("status", filters.status);
        } else {
          query = query.eq("status", filters.status);
        }
      }
      if (filters.category) {
        query = query.eq("category", filters.category);
      }
      if (filters.merchant) {
        query = query.ilike("merchant", `%${filters.merchant}%`);
      }
      if (filters.date_from) {
        query = query.gte("expense_date", filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte("expense_date", filters.date_to);
      }
      if (filters.min_amount !== undefined) {
        query = query.gte("amount", filters.min_amount);
      }
      if (filters.max_amount !== undefined) {
        query = query.lte("amount", filters.max_amount);
      }
    }

    // Apply sorting
    const sortField = sort?.field || "created_at";
    const sortDirection = sort?.direction || "desc";
    query = query.order(sortField, { ascending: sortDirection === "asc" });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as unknown as Expense[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Update an expense
   */
  updateExpense(id: string, dto: UpdateExpenseDto): Observable<Expense> {
    return from(
      this.supabase.client
        .from("expenses")
        .update(dto)
        .eq("id", id)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense not found");
        return data as unknown as Expense;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Delete an expense (soft delete)
   */
  deleteExpense(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from("expenses")
        .delete()
        .eq("id", id),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Submit expense for approval
   * Creates approval chain and assigns to first approver
   * Pre-checks for manager assignment if workflow requires it
   */
  submitExpense(id: string): Observable<Expense> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    // Pre-check: Verify user has a manager assigned (required for most approval workflows)
    return this.checkManagerAssignment().pipe(
      switchMap((hasManager) => {
        if (!hasManager) {
          const errorMsg = 'Cannot submit for approval: You do not have a manager assigned. Please contact your organization administrator to assign a manager to your account.';
          this.notificationService.showError(errorMsg);
          return throwError(() => new Error(errorMsg));
        }

        // Call database function to create approval chain
        return from(
          this.supabase.client.rpc('create_approval_chain', {
            p_expense_id: id,
            p_report_id: null
          })
        );
      }),
      switchMap(() => this.getExpenseById(id)),
      map((expense) => {
        this.notificationService.showSuccess('Expense submitted for approval');
        return expense;
      }),
      catchError((error) => {
        this.logger.error('Failed to submit expense for approval', error);

        // Provide user-friendly error messages for common issues
        let errorMessage = error.message || 'Failed to submit expense for approval';

        if (errorMessage.includes('no active manager')) {
          errorMessage = 'Cannot submit for approval: You do not have a manager assigned. Please contact your organization administrator to assign a manager to your account.';
        } else if (errorMessage.includes('No eligible user found with role')) {
          errorMessage = 'Cannot submit for approval: No approver is available for the required role. Please contact your organization administrator.';
        }

        this.notificationService.showError(errorMessage);
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  /**
   * Check if current user has a manager assigned in the current organization
   * Returns true if manager is assigned and active, false otherwise
   */
  private checkManagerAssignment(): Observable<boolean> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId || !organizationId) {
      return of(false);
    }

    return from(
      this.supabase.client
        .from('organization_members')
        .select('manager_id')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .single()
    ).pipe(
      switchMap(({ data, error }) => {
        if (error || !data) {
          return of(false);
        }

        // Check if manager_id is set and refers to an active member
        if (!data.manager_id) {
          return of(false);
        }

        // Verify manager is active
        return from(
          this.supabase.client
            .from('organization_members')
            .select('id')
            .eq('id', data.manager_id)
            .eq('is_active', true)
            .single()
        ).pipe(
          map(({ data: managerData }) => !!managerData),
          catchError(() => of(false))
        );
      }),
      catchError(() => of(false))
    );
  }

  /**
   * Mark expense as reimbursed (finance only)
   */
  markAsReimbursed(id: string): Observable<Expense> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return from(
      this.supabase.client
        .from("expenses")
        .update({
          status: ExpenseStatus.REIMBURSED,
          reimbursed_at: new Date().toISOString(),
          reimbursed_by: userId,
        })
        .eq("id", id)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense not found");
        return data as unknown as Expense;
      }),
      catchError(this.handleError),
    );
  }

  // =============================================
  // DELEGATED METHODS - Expense Splitting
  // =============================================

  getExpenseItems(expenseId: string): Observable<ExpenseItem[]> {
    return this.splittingService.getExpenseItems(expenseId);
  }

  splitExpense(expenseId: string, items: CreateExpenseItemDto[]): Observable<ExpenseItem[]> {
    return this.splittingService.splitExpense(expenseId, items);
  }

  unsplitExpense(expenseId: string): Observable<void> {
    return this.splittingService.unsplitExpense(expenseId);
  }

  addExpenseItem(expenseId: string, item: CreateExpenseItemDto): Observable<ExpenseItem> {
    return this.splittingService.addExpenseItem(expenseId, item);
  }

  updateExpenseItem(itemId: string, item: Partial<CreateExpenseItemDto>): Observable<ExpenseItem> {
    return this.splittingService.updateExpenseItem(itemId, item);
  }

  deleteExpenseItem(itemId: string): Observable<void> {
    return this.splittingService.deleteExpenseItem(itemId);
  }

  validateSplitTotal(expenseTotal: number, items: CreateExpenseItemDto[]): string | null {
    return this.splittingService.validateSplitTotal(expenseTotal, items);
  }

  // =============================================
  // DELEGATED METHODS - Receipt Operations
  // =============================================

  uploadReceipt(file: File): Observable<ReceiptUploadResponse> {
    return this.receiptService.uploadReceipt(file);
  }

  getReceiptById(id: string): Observable<Receipt> {
    return this.receiptService.getReceiptById(id);
  }

  getMyReceipts(): Observable<Receipt[]> {
    return this.receiptService.getMyReceipts();
  }

  deleteReceipt(id: string): Observable<void> {
    return this.receiptService.deleteReceipt(id);
  }

  getReceiptUrl(filePath: string): string {
    return this.receiptService.getReceiptUrl(filePath);
  }

  validateReceiptFile(file: File): string | null {
    return this.receiptService.validateReceiptFile(file);
  }

  validateReceiptFileAsync(file: File): Promise<string | null> {
    return this.receiptService.validateReceiptFileAsync(file);
  }

  // =============================================
  // DELEGATED METHODS - Expense-Receipt Junction
  // =============================================

  getExpenseReceipts(expenseId: string): Observable<Receipt[]> {
    return this.expenseReceiptService.getExpenseReceipts(expenseId);
  }

  attachReceipt(expenseId: string, receiptId: string, isPrimary?: boolean): Observable<void> {
    return this.expenseReceiptService.attachReceipt(expenseId, receiptId, isPrimary);
  }

  detachReceipt(expenseId: string, receiptId: string): Observable<void> {
    return this.expenseReceiptService.detachReceipt(expenseId, receiptId);
  }

  reorderReceipts(expenseId: string, receiptIds: string[]): Observable<void> {
    return this.expenseReceiptService.reorderReceipts(expenseId, receiptIds);
  }

  setPrimaryReceipt(expenseId: string, receiptId: string): Observable<void> {
    return this.expenseReceiptService.setPrimaryReceipt(expenseId, receiptId);
  }

  // =============================================
  // PRIVATE METHODS
  // =============================================

  private autoAssignExpenseToReport(expense: Expense): Observable<Expense> {
    if (!expense || expense.is_reported) {
      return of(expense);
    }

    return from(this.reportService.autoAttachExpenseToMonthlyReport(expense))
      .pipe(
        map(() => expense),
        catchError((err) => {
          this.logger.warn(
            "Auto-assign expense to monthly report failed",
            "ExpenseService",
            err,
          );
          return of(expense);
        }),
      );
  }

  /**
   * Handle errors consistently
   */
  private handleError = (error: unknown): Observable<never> => {
    this.logger.error("ExpenseService error", error, "ExpenseService");
    const errorMessage = this.logger.getErrorMessage(
      error,
      "An unexpected error occurred",
    );
    return throwError(() => new Error(errorMessage));
  };
}
