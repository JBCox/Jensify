import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpenseDelegation,
  DelegationWithUser,
  DelegateWithUser,
  CreateDelegationDto,
  UpdateDelegationDto,
  DelegationAuditEntry,
  DelegationScope
} from '../models/delegation.model';

/**
 * Service for managing expense delegations
 * Allows users to submit expenses on behalf of others
 */
@Injectable({
  providedIn: 'root'
})
export class DelegationService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state for current user's delegators (people I can submit for)
  private _delegators = signal<DelegationWithUser[]>([]);
  delegators = this._delegators.asReadonly();

  // Computed: is the current user acting on behalf of someone?
  private _actingOnBehalfOf = signal<DelegationWithUser | null>(null);
  actingOnBehalfOf = this._actingOnBehalfOf.asReadonly();

  // Computed: does user have any active delegations?
  hasDelegations = computed(() => this._delegators().length > 0);

  /**
   * Get all delegations where current user is the delegator
   * (people who can submit expenses for me)
   */
  getMyDelegates(): Observable<DelegateWithUser[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.rpc('get_delegates_for_user', {
        p_user_id: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as DelegateWithUser[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get all delegations where current user is the delegate
   * (people I can submit expenses for)
   */
  getMyDelegators(): Observable<DelegationWithUser[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.rpc('get_delegators_for_user', {
        p_user_id: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as DelegationWithUser[];
      }),
      tap(delegators => this._delegators.set(delegators)),
      catchError(this.handleError)
    );
  }

  /**
   * Check if current user can act on behalf of another user
   */
  canActOnBehalfOf(delegatorId: string, action: DelegationScope = 'all'): Observable<boolean> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.rpc('can_act_on_behalf_of', {
        p_delegate_id: userId,
        p_delegator_id: delegatorId,
        p_action: action
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as boolean;
      }),
      catchError(() => from([false]))
    );
  }

  /**
   * Set the user we're currently acting on behalf of
   */
  setActingOnBehalfOf(delegator: DelegationWithUser | null): void {
    this._actingOnBehalfOf.set(delegator);
    if (delegator) {
      this.logger.info('Acting on behalf of user', 'DelegationService', { delegatorId: delegator.delegator_id });
    } else {
      this.logger.info('Cleared acting on behalf of', 'DelegationService');
    }
  }

  /**
   * Get all delegations for the current organization (admin only)
   */
  getAllDelegations(): Observable<ExpenseDelegation[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expense_delegations')
        .select(`
          *,
          delegator:users!delegator_id(id, full_name, email),
          delegate:users!delegate_id(id, full_name, email)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ExpenseDelegation[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single delegation by ID
   */
  getDelegation(delegationId: string): Observable<ExpenseDelegation> {
    return from(
      this.supabase.client
        .from('expense_delegations')
        .select(`
          *,
          delegator:users!delegator_id(id, full_name, email),
          delegate:users!delegate_id(id, full_name, email)
        `)
        .eq('id', delegationId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ExpenseDelegation;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new delegation
   */
  createDelegation(delegation: CreateDelegationDto): Observable<string> {
    const organizationId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('create_delegation', {
        p_organization_id: organizationId,
        p_delegator_id: delegation.delegator_id,
        p_delegate_id: delegation.delegate_id,
        p_scope: delegation.scope || 'all',
        p_valid_from: delegation.valid_from || new Date().toISOString(),
        p_valid_until: delegation.valid_until || null,
        p_notes: delegation.notes || null,
        p_created_by: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Delegation created', 'DelegationService', { delegationId: data });
        return data as string;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing delegation
   */
  updateDelegation(delegation: UpdateDelegationDto): Observable<ExpenseDelegation> {
    const { id, ...updates } = delegation;

    return from(
      this.supabase.client
        .from('expense_delegations')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Delegation updated', 'DelegationService', { delegationId: id });
        return data as ExpenseDelegation;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Revoke a delegation
   */
  revokeDelegation(delegationId: string): Observable<boolean> {
    const userId = this.supabase.userId;

    return from(
      this.supabase.client.rpc('revoke_delegation', {
        p_delegation_id: delegationId,
        p_revoked_by: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Delegation revoked', 'DelegationService', { delegationId });
        return data as boolean;
      }),
      tap(() => {
        // Refresh delegators list
        this.getMyDelegators().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a delegation permanently
   */
  deleteDelegation(delegationId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('expense_delegations')
        .delete()
        .eq('id', delegationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Delegation deleted', 'DelegationService', { delegationId });
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get audit log for a delegation
   */
  getDelegationAuditLog(delegationId: string): Observable<DelegationAuditEntry[]> {
    return from(
      this.supabase.client
        .from('delegation_audit_log')
        .select('*')
        .eq('delegation_id', delegationId)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as DelegationAuditEntry[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Initialize service - load delegators for current user
   */
  initialize(): void {
    this.getMyDelegators().subscribe({
      error: (err) => this.logger.warn('Failed to load delegators', 'DelegationService', err)
    });
  }

  /**
   * Get the effective user ID for expense creation
   * Returns the delegator's ID if acting on behalf of someone, otherwise current user
   */
  getEffectiveUserId(): string {
    const actingFor = this._actingOnBehalfOf();
    if (actingFor) {
      return actingFor.delegator_id;
    }
    return this.supabase.userId || '';
  }

  /**
   * Get delegation metadata for expense creation
   */
  getDelegationMetadata(): { submitted_by: string; submitted_on_behalf_of?: string; delegation_id?: string } | null {
    const actingFor = this._actingOnBehalfOf();
    const userId = this.supabase.userId;

    if (!actingFor || !userId) {
      return null;
    }

    // Find the delegation ID
    const delegation = this._delegators().find(d => d.delegator_id === actingFor.delegator_id);

    return {
      submitted_by: userId,
      submitted_on_behalf_of: actingFor.delegator_id,
      // Note: delegation_id would need to be fetched or stored separately
    };
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('DelegationService error', error, 'DelegationService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
