/**
 * Delegation scope types
 * Determines what actions a delegate can perform
 */
export type DelegationScope = 'all' | 'create' | 'submit' | 'view';

/**
 * Expense delegation relationship
 * Allows one user to submit expenses on behalf of another
 */
export interface ExpenseDelegation {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** User who is delegating (the expense owner) */
  delegator_id: string;
  /** User who receives delegation (the assistant) */
  delegate_id: string;

  /** Scope of delegation */
  scope: DelegationScope;

  /** When delegation becomes valid */
  valid_from: string;
  /** When delegation expires (null = no expiration) */
  valid_until?: string | null;

  /** Whether delegation is active */
  is_active: boolean;

  /** Optional notes about the delegation */
  notes?: string;

  /** Audit fields */
  created_at: string;
  updated_at: string;
  created_by?: string;

  // Populated relations
  delegator?: DelegatorInfo;
  delegate?: DelegatorInfo;
}

/**
 * Basic user info for delegation display
 */
export interface DelegatorInfo {
  id: string;
  full_name: string;
  email: string;
}

/**
 * Delegation with user details (from get_delegators_for_user)
 */
export interface DelegationWithUser {
  delegator_id: string;
  delegator_name: string;
  delegator_email: string;
  scope: DelegationScope;
  valid_until?: string | null;
}

/**
 * Delegate with user details (from get_delegates_for_user)
 */
export interface DelegateWithUser {
  delegate_id: string;
  delegate_name: string;
  delegate_email: string;
  scope: DelegationScope;
  valid_until?: string | null;
}

/**
 * Delegation audit log entry
 */
export interface DelegationAuditEntry {
  id: string;
  delegation_id: string;
  action: 'created' | 'updated' | 'revoked' | 'expired' | 'used';
  actor_id?: string;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * DTO for creating a new delegation
 */
export interface CreateDelegationDto {
  /** User to delegate from (the expense owner) */
  delegator_id: string;
  /** User to delegate to (the assistant) */
  delegate_id: string;
  /** Scope of delegation */
  scope?: DelegationScope;
  /** When delegation starts (default: now) */
  valid_from?: string;
  /** When delegation expires (null = no expiration) */
  valid_until?: string | null;
  /** Optional notes */
  notes?: string;
}

/**
 * DTO for updating an existing delegation
 */
export interface UpdateDelegationDto {
  id: string;
  scope?: DelegationScope;
  valid_from?: string;
  valid_until?: string | null;
  notes?: string;
  is_active?: boolean;
}

/**
 * Expense with delegation info (from expenses_with_delegation view)
 */
export interface ExpenseWithDelegation {
  /** Whether this was a proxy submission */
  is_proxy_submission: boolean;
  /** Name of person who submitted */
  submitter_name?: string;
  /** Email of person who submitted */
  submitter_email?: string;
  /** Name of person expense is for */
  on_behalf_of_name?: string;
  /** Email of person expense is for */
  on_behalf_of_email?: string;
}

/**
 * Scope descriptions for UI
 */
export const DELEGATION_SCOPE_DESCRIPTIONS: Record<DelegationScope, string> = {
  all: 'Full access - create, submit, and view expenses',
  create: 'Create draft expenses only',
  submit: 'Create and submit expenses',
  view: 'View expenses only, no modifications'
};

/**
 * Scope icons for UI
 */
export const DELEGATION_SCOPE_ICONS: Record<DelegationScope, string> = {
  all: 'admin_panel_settings',
  create: 'add_circle',
  submit: 'send',
  view: 'visibility'
};

/**
 * Check if a scope allows a specific action
 */
export function scopeAllowsAction(scope: DelegationScope, action: 'view' | 'create' | 'submit'): boolean {
  switch (scope) {
    case 'all':
      return true;
    case 'submit':
      return ['create', 'submit', 'view'].includes(action);
    case 'create':
      return ['create', 'view'].includes(action);
    case 'view':
      return action === 'view';
    default:
      return false;
  }
}
