import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';

/**
 * Potential duplicate expense returned from database
 */
export interface PotentialDuplicate {
  id: string;
  merchant: string;
  amount: number;
  expense_date: string;
  status: string;
  created_at: string;
  similarity_score: number;
}

/**
 * Duplicate status for expenses
 */
export type DuplicateStatus = 'potential' | 'confirmed' | 'dismissed' | null;

/**
 * Parameters for duplicate search
 */
export interface DuplicateSearchParams {
  merchant: string;
  amount: number;
  expense_date: string;
  exclude_id?: string;
  date_tolerance_days?: number;
  amount_tolerance?: number;
}

/**
 * Service for detecting and managing duplicate expenses
 * Helps prevent accidental duplicate submissions
 */
@Injectable({
  providedIn: 'root'
})
export class DuplicateDetectionService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  /**
   * Find potential duplicates for an expense before creation
   * Returns expenses that match merchant, amount, and date within tolerance
   */
  findPotentialDuplicates(params: DuplicateSearchParams): Observable<PotentialDuplicate[]> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('find_duplicate_expenses', {
        p_organization_id: organizationId,
        p_user_id: userId,
        p_merchant: params.merchant,
        p_amount: params.amount,
        p_expense_date: params.expense_date,
        p_exclude_id: params.exclude_id || null,
        p_date_tolerance_days: params.date_tolerance_days || 3,
        p_amount_tolerance: params.amount_tolerance || 0.01
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PotentialDuplicate[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Check if there are any high-confidence duplicates (score >= 60)
   * Returns true if likely duplicates exist
   */
  hasLikelyDuplicates(params: DuplicateSearchParams): Observable<boolean> {
    return this.findPotentialDuplicates(params).pipe(
      map(duplicates => duplicates.some(d => d.similarity_score >= 60))
    );
  }

  /**
   * Confirm that an expense is a duplicate of another
   */
  confirmDuplicate(expenseId: string, duplicateOfId: string): Observable<void> {
    return from(
      this.supabase.client.rpc('confirm_expense_duplicate', {
        p_expense_id: expenseId,
        p_duplicate_of_id: duplicateOfId
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Dismiss duplicate warning for an expense
   * User confirms it's not actually a duplicate
   */
  dismissDuplicate(expenseId: string): Observable<void> {
    return from(
      this.supabase.client.rpc('dismiss_expense_duplicate', {
        p_expense_id: expenseId
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get all expenses flagged as potential duplicates for the current organization
   * Used by finance/admin to review duplicates
   */
  getPotentialDuplicates(): Observable<PotentialDuplicate[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expenses')
        .select('id, merchant, amount, expense_date, status, created_at')
        .eq('organization_id', organizationId)
        .eq('duplicate_status', 'potential')
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        // Add a default similarity score since these are already flagged
        return (data || []).map(e => ({ ...e, similarity_score: 60 })) as PotentialDuplicate[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get duplicate statistics for the organization
   */
  getDuplicateStats(): Observable<{ potential: number; confirmed: number; dismissed: number }> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expenses')
        .select('duplicate_status')
        .eq('organization_id', organizationId)
        .not('duplicate_status', 'is', null)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const expenses = data || [];
        return {
          potential: expenses.filter(e => e.duplicate_status === 'potential').length,
          confirmed: expenses.filter(e => e.duplicate_status === 'confirmed').length,
          dismissed: expenses.filter(e => e.duplicate_status === 'dismissed').length
        };
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Format similarity score as human-readable confidence level
   */
  getSimilarityLabel(score: number): string {
    if (score >= 80) return 'Very High';
    if (score >= 60) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  }

  /**
   * Get color class for similarity score
   */
  getSimilarityColor(score: number): string {
    if (score >= 80) return 'danger';
    if (score >= 60) return 'warning';
    if (score >= 40) return 'info';
    return 'muted';
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('DuplicateDetectionService error', error, 'DuplicateDetectionService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
