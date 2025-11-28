import { Injectable, inject } from "@angular/core";
import { from, Observable, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { SupabaseService } from "./supabase.service";
import { OrganizationService } from "./organization.service";
import { NotificationService } from "./notification.service";
import { LoggerService } from "./logger.service";
import {
  CreateExpenseItemDto,
  ExpenseItem,
} from "../models/expense.model";

/**
 * Service for managing expense splitting and line items
 * Handles splitting expenses into multiple categories
 */
@Injectable({
  providedIn: "root",
})
export class ExpenseSplittingService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private logger = inject(LoggerService);

  /**
   * Get all expense items (split line items) for an expense
   * @param expenseId The expense ID
   * @returns Observable of expense items ordered by line_number
   */
  getExpenseItems(expenseId: string): Observable<ExpenseItem[]> {
    return from(
      this.supabase.client
        .from("expense_items")
        .select("*, receipt:receipts(*)")
        .eq("expense_id", expenseId)
        .order("line_number", { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as unknown as ExpenseItem[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Split an expense into multiple line items with different categories
   * Uses the database function for atomic operation
   * @param expenseId The expense ID to split
   * @param items Array of items (description, amount, category) that must sum to expense total
   * @returns Observable of created expense items
   */
  splitExpense(
    expenseId: string,
    items: CreateExpenseItemDto[],
  ): Observable<ExpenseItem[]> {
    // Validate items array
    if (!items || items.length < 2) {
      return throwError(
        () => new Error("At least 2 items required to split an expense"),
      );
    }

    // Convert items to JSONB format for the database function
    const itemsJson = items.map((item) => ({
      description: item.description,
      amount: item.amount,
      category: item.category,
    }));

    return from(
      this.supabase.client.rpc("split_expense", {
        p_expense_id: expenseId,
        p_items: itemsJson,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.notificationService.showSuccess("Expense split successfully");
        return (data || []) as unknown as ExpenseItem[];
      }),
      catchError((error) => {
        this.logger.error("Failed to split expense", error, "ExpenseSplittingService");
        this.notificationService.showError(
          error.message || "Failed to split expense",
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Remove all split items and restore expense to single category
   * Only works for draft expenses
   * @param expenseId The expense ID to unsplit
   */
  unsplitExpense(expenseId: string): Observable<void> {
    return from(
      this.supabase.client.rpc("unsplit_expense", {
        p_expense_id: expenseId,
      }),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.notificationService.showSuccess("Expense unsplit successfully");
      }),
      catchError((error) => {
        this.logger.error("Failed to unsplit expense", error, "ExpenseSplittingService");
        this.notificationService.showError(
          error.message || "Failed to unsplit expense",
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Add a single line item to an expense
   * @param expenseId The expense ID
   * @param item The item to add
   * @returns Observable of the created expense item
   */
  addExpenseItem(
    expenseId: string,
    item: CreateExpenseItemDto,
  ): Observable<ExpenseItem> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    return from(
      this.supabase.client
        .from("expense_items")
        .insert({
          expense_id: expenseId,
          organization_id: organizationId,
          description: item.description,
          amount: item.amount,
          category: item.category,
          receipt_id: item.receipt_id || null,
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Failed to create expense item");
        return data as unknown as ExpenseItem;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Update an existing expense item
   * @param itemId The expense item ID
   * @param item Partial item data to update
   * @returns Observable of the updated expense item
   */
  updateExpenseItem(
    itemId: string,
    item: Partial<CreateExpenseItemDto>,
  ): Observable<ExpenseItem> {
    return from(
      this.supabase.client
        .from("expense_items")
        .update({
          ...(item.description && { description: item.description }),
          ...(item.amount !== undefined && { amount: item.amount }),
          ...(item.category && { category: item.category }),
          ...(item.receipt_id !== undefined && { receipt_id: item.receipt_id }),
        })
        .eq("id", itemId)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense item not found");
        return data as unknown as ExpenseItem;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Delete an expense item
   * @param itemId The expense item ID to delete
   */
  deleteExpenseItem(itemId: string): Observable<void> {
    return from(
      this.supabase.client.from("expense_items").delete().eq("id", itemId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Validate that split items sum to the expense total
   * @param expenseTotal The total expense amount
   * @param items The items to validate
   * @returns Error message if invalid, null if valid
   */
  validateSplitTotal(
    expenseTotal: number,
    items: CreateExpenseItemDto[],
  ): string | null {
    const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
    const tolerance = 0.01; // Allow 1 cent tolerance for rounding

    if (Math.abs(itemsTotal - expenseTotal) > tolerance) {
      return `Split items total ($${itemsTotal.toFixed(2)}) must equal expense total ($${expenseTotal.toFixed(2)})`;
    }

    return null;
  }

  /**
   * Handle errors consistently
   */
  private handleError = (error: unknown): Observable<never> => {
    this.logger.error("ExpenseSplittingService error", error, "ExpenseSplittingService");
    const errorMessage = this.logger.getErrorMessage(
      error,
      "An unexpected error occurred",
    );
    return throwError(() => new Error(errorMessage));
  };
}
