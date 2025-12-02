import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, from, Observable, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import {
  GLCode,
  CreateGLCodeDto,
  UpdateGLCodeDto,
  CustomExpenseCategory,
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
} from '../models/gl-code.model';

/**
 * Service for managing GL codes and expense categories
 * Handles CRUD operations for both GL codes and custom expense categories
 */
@Injectable({
  providedIn: 'root',
})
export class CategoryService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);

  /** Cached GL codes for current organization */
  private glCodesSubject = new BehaviorSubject<GLCode[]>([]);
  public readonly glCodes$ = this.glCodesSubject.asObservable();

  /** Cached categories for current organization */
  private categoriesSubject = new BehaviorSubject<CustomExpenseCategory[]>([]);
  public readonly categories$ = this.categoriesSubject.asObservable();

  /** Loading state */
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public readonly loading$ = this.loadingSubject.asObservable();

  // ============================================================================
  // GL CODES
  // ============================================================================

  /**
   * Get all GL codes for the current organization
   */
  getGLCodes(activeOnly = false): Observable<GLCode[]> {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      return throwError(() => new Error('No organization selected'));
    }

    let query = this.supabase.client
      .from('gl_codes')
      .select('*')
      .eq('organization_id', orgId)
      .order('code', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as GLCode[];
      }),
      tap((codes) => this.glCodesSubject.next(codes)),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new GL code
   */
  createGLCode(dto: CreateGLCodeDto): Observable<GLCode> {
    const orgId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;
    if (!orgId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('gl_codes')
        .insert({
          organization_id: orgId,
          created_by: userId,
          ...dto,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GLCode;
      }),
      tap((code) => {
        this.notificationService.showSuccess(`GL Code "${code.code}" created`);
        // Refresh cache
        this.getGLCodes().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update a GL code
   */
  updateGLCode(id: string, dto: UpdateGLCodeDto): Observable<GLCode> {
    return from(
      this.supabase.client
        .from('gl_codes')
        .update(dto)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as GLCode;
      }),
      tap((code) => {
        this.notificationService.showSuccess(`GL Code "${code.code}" updated`);
        // Refresh cache
        this.getGLCodes().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a GL code
   * Note: Categories using this GL code will have their gl_code_id set to null
   */
  deleteGLCode(id: string): Observable<void> {
    return from(
      this.supabase.client.from('gl_codes').delete().eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        this.notificationService.showSuccess('GL Code deleted');
        // Refresh caches
        this.getGLCodes().subscribe();
        this.getCategories().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  // ============================================================================
  // EXPENSE CATEGORIES
  // ============================================================================

  /**
   * Get all expense categories for the current organization
   * Uses expense_categories_with_gl view which has GL codes pre-joined
   */
  getCategories(activeOnly = false): Observable<CustomExpenseCategory[]> {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      return throwError(() => new Error('No organization selected'));
    }

    // Use the expense_categories_with_gl view which has GL codes pre-joined
    let query = this.supabase.client
      .from('expense_categories_with_gl')
      .select('*')
      .eq('organization_id', orgId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as CustomExpenseCategory[];
      }),
      tap((categories) => this.categoriesSubject.next(categories)),
      catchError(this.handleError)
    );
  }

  /**
   * Get active categories for expense form dropdowns
   */
  getActiveCategories(): Observable<CustomExpenseCategory[]> {
    return this.getCategories(true);
  }

  /**
   * Create a new expense category
   */
  createCategory(dto: CreateExpenseCategoryDto): Observable<CustomExpenseCategory> {
    const orgId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;
    if (!orgId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expense_categories')
        .insert({
          organization_id: orgId,
          created_by: userId,
          ...dto,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as CustomExpenseCategory;
      }),
      tap((category) => {
        this.notificationService.showSuccess(`Category "${category.name}" created`);
        // Refresh cache
        this.getCategories().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update an expense category
   */
  updateCategory(id: string, dto: UpdateExpenseCategoryDto): Observable<CustomExpenseCategory> {
    return from(
      this.supabase.client
        .from('expense_categories')
        .update(dto)
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as CustomExpenseCategory;
      }),
      tap((category) => {
        this.notificationService.showSuccess(`Category "${category.name}" updated`);
        // Refresh cache
        this.getCategories().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete an expense category
   */
  deleteCategory(id: string): Observable<void> {
    return from(
      this.supabase.client.from('expense_categories').delete().eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        this.notificationService.showSuccess('Category deleted');
        // Refresh cache
        this.getCategories().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Reorder categories
   */
  reorderCategories(orderedIds: string[]): Observable<void> {
    const updates = orderedIds.map((id, index) =>
      this.supabase.client
        .from('expense_categories')
        .update({ display_order: index })
        .eq('id', id)
    );

    return from(Promise.all(updates)).pipe(
      map((results) => {
        for (const { error } of results) {
          if (error) throw error;
        }
      }),
      tap(() => {
        this.getCategories().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Get GL code by ID from cache
   */
  getGLCodeById(id: string): GLCode | undefined {
    return this.glCodesSubject.value.find((c) => c.id === id);
  }

  /**
   * Get category by ID from cache
   */
  getCategoryById(id: string): CustomExpenseCategory | undefined {
    return this.categoriesSubject.value.find((c) => c.id === id);
  }

  /**
   * Get category by name from cache
   */
  getCategoryByName(name: string): CustomExpenseCategory | undefined {
    return this.categoriesSubject.value.find((c) => c.name === name);
  }

  /**
   * Refresh all data
   */
  refreshAll(): void {
    this.loadingSubject.next(true);
    this.getGLCodes().subscribe({
      complete: () => {
        this.getCategories().subscribe({
          complete: () => this.loadingSubject.next(false),
          error: () => this.loadingSubject.next(false),
        });
      },
      error: () => this.loadingSubject.next(false),
    });
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('CategoryService error', error, 'CategoryService');

    const message = this.logger.getErrorMessage(error, 'An error occurred');
    this.notificationService.showError(message);
    return throwError(() => new Error(message));
  };
}
