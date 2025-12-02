import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpensePolicy,
  PolicyPreset,
  EffectivePolicy,
  CreatePolicyDto,
  UpdatePolicyDto
} from '../models/policy.model';

/**
 * Service for managing expense policies
 * Handles CRUD operations for policy rules and preset management
 */
@Injectable({
  providedIn: 'root'
})
export class PolicyService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  /**
   * Get all policies for the current organization
   */
  getPolicies(): Observable<ExpensePolicy[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expense_policies')
        .select('*')
        .eq('organization_id', organizationId)
        .order('priority', { ascending: false })
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ExpensePolicy[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single policy by ID
   */
  getPolicy(policyId: string): Observable<ExpensePolicy> {
    return from(
      this.supabase.client
        .from('expense_policies')
        .select('*')
        .eq('id', policyId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ExpensePolicy;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new policy
   */
  createPolicy(policy: CreatePolicyDto): Observable<ExpensePolicy> {
    const organizationId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    const policyData = {
      ...policy,
      organization_id: organizationId,
      created_by: userId
    };

    return from(
      this.supabase.client
        .from('expense_policies')
        .insert(policyData)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Policy created', 'PolicyService', { policyId: data.id });
        return data as ExpensePolicy;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing policy
   */
  updatePolicy(policy: UpdatePolicyDto): Observable<ExpensePolicy> {
    const { id, ...updates } = policy;

    return from(
      this.supabase.client
        .from('expense_policies')
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
        this.logger.info('Policy updated', 'PolicyService', { policyId: id });
        return data as ExpensePolicy;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a policy
   */
  deletePolicy(policyId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('expense_policies')
        .delete()
        .eq('id', policyId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Policy deleted', 'PolicyService', { policyId });
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Toggle policy active status
   */
  togglePolicyActive(policyId: string, isActive: boolean): Observable<ExpensePolicy> {
    return this.updatePolicy({ id: policyId, is_active: isActive });
  }

  /**
   * Get all available policy presets
   */
  getPresets(): Observable<PolicyPreset[]> {
    return from(
      this.supabase.client
        .from('policy_presets')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PolicyPreset[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Apply a preset to the organization
   * Creates policies based on the preset configuration
   */
  applyPreset(presetName: string): Observable<{ policies_created: number }> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('apply_policy_preset', {
        p_organization_id: organizationId,
        p_preset_name: presetName
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Preset applied', 'PolicyService', { presetName, result: data });
        return data as { policies_created: number };
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get effective policy limits for a user/category combination
   * Resolves policy priority and returns the applicable limits
   */
  getEffectivePolicy(userId: string, category?: string): Observable<EffectivePolicy> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_effective_policy', {
        p_organization_id: organizationId,
        p_user_id: userId,
        p_category: category || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as EffectivePolicy;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get policies by scope type
   */
  getPoliciesByScope(scopeType: string): Observable<ExpensePolicy[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expense_policies')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('scope_type', scopeType)
        .order('priority', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ExpensePolicy[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get policy statistics for the organization
   */
  getPolicyStats(): Observable<{
    total: number;
    active: number;
    byScope: Record<string, number>;
  }> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('expense_policies')
        .select('id, is_active, scope_type')
        .eq('organization_id', organizationId)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const policies = data || [];
        const byScope: Record<string, number> = {};

        for (const policy of policies) {
          byScope[policy.scope_type] = (byScope[policy.scope_type] || 0) + 1;
        }

        return {
          total: policies.length,
          active: policies.filter(p => p.is_active).length,
          byScope
        };
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Duplicate an existing policy with a new name
   */
  duplicatePolicy(policyId: string, newName: string): Observable<CreatePolicyDto> {
    return this.getPolicy(policyId).pipe(
      map(policy => {
        const { id, created_at, updated_at, created_by, organization_id, ...policyData } = policy;
        return {
          ...policyData,
          name: newName
        } as CreatePolicyDto;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Bulk update policy priorities
   */
  updatePriorities(priorities: { id: string; priority: number }[]): Observable<void> {
    const updates = priorities.map(({ id, priority }) =>
      this.supabase.client
        .from('expense_policies')
        .update({ priority, updated_at: new Date().toISOString() })
        .eq('id', id)
    );

    return from(Promise.all(updates)).pipe(
      map(results => {
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          throw errors[0].error;
        }
      }),
      catchError(this.handleError)
    );
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('PolicyService error', error, 'PolicyService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
