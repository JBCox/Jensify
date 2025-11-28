import { Injectable, inject } from "@angular/core";
import { from, Observable, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { SupabaseService } from "./supabase.service";
import { LoggerService } from "./logger.service";
import { Receipt } from "../models/receipt.model";

/**
 * Service for managing expense-receipt relationships
 * Handles attaching, detaching, and reordering receipts on expenses
 */
@Injectable({
  providedIn: "root",
})
export class ExpenseReceiptService {
  private supabase = inject(SupabaseService);
  private logger = inject(LoggerService);

  /**
   * Get all receipts linked to an expense (via junction table)
   * Returns receipts ordered by display_order
   */
  getExpenseReceipts(expenseId: string): Observable<Receipt[]> {
    return from(
      this.supabase.client
        .from("expense_receipts")
        .select("*, receipt:receipts(*)")
        .eq("expense_id", expenseId)
        .order("display_order", { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return [];
        // Extract receipt objects from junction table records
        return data
          .map((er) => er.receipt)
          .filter((r) => r !== null) as unknown as Receipt[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Attach a receipt to an expense (creates junction table record)
   * @param expenseId Expense ID
   * @param receiptId Receipt ID
   * @param isPrimary Whether this should be the primary receipt (default: auto if first)
   * @returns Observable of the created junction record
   */
  attachReceipt(
    expenseId: string,
    receiptId: string,
    isPrimary?: boolean,
  ): Observable<void> {
    return from(
      (async () => {
        // Get current receipt count for this expense
        const { count } = await this.supabase.client
          .from("expense_receipts")
          .select("*", { count: "exact", head: true })
          .eq("expense_id", expenseId);

        const displayOrder = count || 0;
        const shouldBePrimary = isPrimary ?? (displayOrder === 0); // Auto-primary if first

        // Create junction record
        const { error } = await this.supabase.client
          .from("expense_receipts")
          .insert({
            expense_id: expenseId,
            receipt_id: receiptId,
            display_order: displayOrder,
            is_primary: shouldBePrimary,
          });

        if (error) throw error;
      })(),
    ).pipe(
      map(() => void 0),
      catchError(this.handleError),
    );
  }

  /**
   * Detach a receipt from an expense (deletes junction table record)
   * @param expenseId Expense ID
   * @param receiptId Receipt ID
   */
  detachReceipt(expenseId: string, receiptId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("expense_receipts")
        .delete()
        .eq("expense_id", expenseId)
        .eq("receipt_id", receiptId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Reorder receipts for an expense
   * @param expenseId Expense ID
   * @param receiptIds Array of receipt IDs in desired order
   */
  reorderReceipts(expenseId: string, receiptIds: string[]): Observable<void> {
    return from(
      (async () => {
        // Update display_order for each receipt
        const updates = receiptIds.map((receiptId, index) =>
          this.supabase.client
            .from("expense_receipts")
            .update({ display_order: index })
            .eq("expense_id", expenseId)
            .eq("receipt_id", receiptId)
        );

        const results = await Promise.all(updates);

        // Check for errors
        const errors = results.filter((r) => r.error);
        if (errors.length > 0) {
          throw errors[0].error;
        }
      })(),
    ).pipe(
      map(() => void 0),
      catchError(this.handleError),
    );
  }

  /**
   * Set a receipt as the primary receipt for an expense
   * Automatically unsets any other primary receipt
   * @param expenseId Expense ID
   * @param receiptId Receipt ID to set as primary
   */
  setPrimaryReceipt(expenseId: string, receiptId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("expense_receipts")
        .update({ is_primary: true })
        .eq("expense_id", expenseId)
        .eq("receipt_id", receiptId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Handle errors consistently
   */
  private handleError = (error: unknown): Observable<never> => {
    this.logger.error("ExpenseReceiptService error", error, "ExpenseReceiptService");
    const errorMessage = this.logger.getErrorMessage(
      error,
      "An unexpected error occurred",
    );
    return throwError(() => new Error(errorMessage));
  };
}
