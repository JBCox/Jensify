import { Injectable } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import {
  Expense,
  CreateExpenseDto,
  UpdateExpenseDto,
  ExpenseFilters,
  ExpenseSortOptions,
  ExpenseWithUser
} from '../models/expense.model';
import {
  Receipt,
  UploadReceiptDto,
  ReceiptUploadResponse
} from '../models/receipt.model';
import { ExpenseStatus } from '../models/enums';

/**
 * Service for managing expenses and receipts
 * Handles CRUD operations, file uploads, and queries with filters
 */
@Injectable({
  providedIn: 'root'
})
export class ExpenseService {
  private readonly RECEIPT_BUCKET = 'receipts';
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

  constructor(private supabase: SupabaseService) {}

  /**
   * Create a new expense
   */
  createExpense(dto: CreateExpenseDto): Observable<Expense> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('expenses')
        .insert({
          user_id: userId,
          merchant: dto.merchant,
          amount: dto.amount,
          category: dto.category,
          expense_date: dto.expense_date,
          notes: dto.notes,
          receipt_id: dto.receipt_id,
          status: ExpenseStatus.DRAFT,
          currency: 'USD',
          is_reimbursable: true,
          policy_violations: []
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('No expense data returned');
        return data as unknown as Expense;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get expense by ID
   * Optionally populate user and receipt relationships
   */
  getExpenseById(id: string, includeRelations = true): Observable<Expense> {
    let query = this.supabase.client
      .from('expenses')
      .select(includeRelations ? '*, user:users(*), receipt:receipts(*)' : '*')
      .eq('id', id)
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Expense not found');
        return data as unknown as Expense;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get all expenses for current user
   */
  getMyExpenses(
    filters?: ExpenseFilters,
    sort?: ExpenseSortOptions
  ): Observable<Expense[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return this.queryExpenses({ ...filters, user_id: userId }, sort);
  }

  /**
   * Query expenses with filters and sorting
   * Used by finance dashboard and reports
   */
  queryExpenses(
    filters?: ExpenseFilters,
    sort?: ExpenseSortOptions
  ): Observable<Expense[]> {
    let query = this.supabase.client
      .from('expenses')
      .select('*, user:users(*), receipt:receipts(*)');

    // Apply filters
    if (filters) {
      if (filters.user_id) {
        query = query.eq('user_id', filters.user_id);
      }
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.merchant) {
        query = query.ilike('merchant', `%${filters.merchant}%`);
      }
      if (filters.date_from) {
        query = query.gte('expense_date', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('expense_date', filters.date_to);
      }
      if (filters.min_amount !== undefined) {
        query = query.gte('amount', filters.min_amount);
      }
      if (filters.max_amount !== undefined) {
        query = query.lte('amount', filters.max_amount);
      }
    }

    // Apply sorting
    const sortField = sort?.field || 'created_at';
    const sortDirection = sort?.direction || 'desc';
    query = query.order(sortField, { ascending: sortDirection === 'asc' });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as unknown as Expense[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update an expense
   */
  updateExpense(id: string, dto: UpdateExpenseDto): Observable<Expense> {
    return from(
      this.supabase.client
        .from('expenses')
        .update(dto)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Expense not found');
        return data as unknown as Expense;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete an expense (soft delete)
   */
  deleteExpense(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('expenses')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Submit expense for approval
   */
  submitExpense(id: string): Observable<Expense> {
    return this.updateExpense(id, {
      status: ExpenseStatus.SUBMITTED
    });
  }

  /**
   * Mark expense as reimbursed (finance only)
   */
  markAsReimbursed(id: string): Observable<Expense> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('expenses')
        .update({
          status: ExpenseStatus.REIMBURSED,
          reimbursed_at: new Date().toISOString(),
          reimbursed_by: userId
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Expense not found');
        return data as unknown as Expense;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Upload receipt file and create receipt record
   */
  uploadReceipt(file: File): Observable<ReceiptUploadResponse> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    // Validate file
    const validationError = this.validateReceiptFile(file);
    if (validationError) {
      return throwError(() => new Error(validationError));
    }

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFileName = this.sanitizeFileName(file.name);
    const filePath = `${userId}/${timestamp}_${sanitizedFileName}`;

    return from(
      (async () => {
        // Upload file to storage
        const { data: uploadData, error: uploadError } = await this.supabase.uploadFile(
          this.RECEIPT_BUCKET,
          filePath,
          file
        );

        if (uploadError) throw uploadError;

        // Create receipt record in database
        const { data: receiptData, error: receiptError } = await this.supabase.client
          .from('receipts')
          .insert({
            user_id: userId,
            file_path: filePath,
            file_name: sanitizedFileName,
            file_type: file.type,
            file_size: file.size,
            ocr_status: 'pending'
          })
          .select()
          .single();

        if (receiptError) throw receiptError;

        // Get public URL
        const publicUrl = this.supabase.getPublicUrl(this.RECEIPT_BUCKET, filePath);

        return {
          receipt: receiptData as Receipt,
          public_url: publicUrl
        };
      })()
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get receipt by ID
   */
  getReceiptById(id: string): Observable<Receipt> {
    return from(
      this.supabase.client
        .from('receipts')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Receipt not found');
        return data as unknown as Receipt;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get all receipts for current user
   */
  getMyReceipts(): Observable<Receipt[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('receipts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as unknown as Receipt[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete receipt and associated file
   */
  deleteReceipt(id: string): Observable<void> {
    return from(
      (async () => {
        // Get receipt to find file path
        const { data: receipt, error: fetchError } = await this.supabase.client
          .from('receipts')
          .select('file_path')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;
        if (!receipt) throw new Error('Receipt not found');

        // Delete file from storage
        const { error: deleteFileError } = await this.supabase.deleteFile(
          this.RECEIPT_BUCKET,
          receipt.file_path
        );

        if (deleteFileError) throw deleteFileError;

        // Delete receipt record
        const { error: deleteRecordError } = await this.supabase.client
          .from('receipts')
          .delete()
          .eq('id', id);

        if (deleteRecordError) throw deleteRecordError;
      })()
    ).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get public URL for receipt file
   */
  getReceiptUrl(filePath: string): string {
    return this.supabase.getPublicUrl(this.RECEIPT_BUCKET, filePath);
  }

  /**
   * Validate receipt file (type and size)
   */
  validateReceiptFile(file: File): string | null {
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      return `Invalid file type. Allowed types: ${this.ALLOWED_FILE_TYPES.join(', ')}`;
    }

    if (file.size > this.MAX_FILE_SIZE) {
      const maxSizeMB = this.MAX_FILE_SIZE / (1024 * 1024);
      return `File size exceeds ${maxSizeMB}MB limit`;
    }

    return null;
  }

  /**
   * Sanitize file name to prevent path traversal
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .substring(0, 255);
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: any): Observable<never> {
    console.error('ExpenseService error:', error);
    const errorMessage = error?.message || 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  }
}
