/**
 * Approval System Models
 * Type definitions for multi-level approval workflows
 */

/**
 * Step types for approval workflow configuration
 * - manager: Routes to submitter's direct manager
 * - role: Routes to any user with specified role
 * - specific_user: Routes to a single named user
 * - specific_manager: Routes to a named manager (not necessarily submitter's)
 * - multiple_users: Routes to any one of multiple specified users
 * - payment: Final payment step (Finance role only)
 * - department_owner: Routes to department head (legacy)
 */
export type ApprovalStepType =
  | 'manager'
  | 'role'
  | 'specific_user'
  | 'specific_manager'
  | 'multiple_users'
  | 'payment'
  | 'department_owner';

/**
 * Approval workflow configuration
 * Defines when and how expenses/reports should be approved
 */
export interface ApprovalWorkflow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  /** If true, this workflow is used when no other workflow conditions match */
  is_default: boolean;
  conditions: ApprovalConditions;
  priority: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * Conditions that trigger a workflow
 * Stored as JSONB in database
 */
export interface ApprovalConditions {
  /** Minimum expense amount to match this workflow */
  amount_min?: number;
  /** Maximum expense amount to match this workflow */
  amount_max?: number;
  /** Expense categories that match this workflow */
  categories?: string[];
  /** Departments that match this workflow */
  departments?: string[];
  /** @deprecated Use departments instead */
  department?: string;
  /** Project codes that match this workflow */
  project_codes?: string[];
  /** Custom tags that match this workflow */
  tags?: string[];
  /** @deprecated Use submitter_ids instead */
  user_ids?: string[];
  /** Specific submitter IDs that match this workflow */
  submitter_ids?: string[];
}

/**
 * Individual step within an approval workflow
 */
export interface ApprovalStep {
  id: string;
  workflow_id: string;
  step_order: number;
  step_type: ApprovalStepType;
  approver_role?: 'manager' | 'finance' | 'admin';
  /** User ID for specific_user or specific_manager step types */
  approver_user_id?: string;
  /** User IDs for multiple_users step type - any one can approve */
  approver_user_ids?: string[];
  /** True if this is a payment step (denormalized for queries) */
  is_payment_step?: boolean;
  /** For parallel approval (Phase 2) */
  require_all: boolean;
}

/**
 * Approval status for an expense or report
 * Tracks progress through the approval chain
 */
export interface ExpenseApproval {
  id: string;
  organization_id: string;
  expense_id?: string;
  report_id?: string;
  workflow_id: string;
  current_step: number;
  total_steps: number;
  status: ApprovalStatus;
  current_approver_id: string | null;
  submitted_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Approval status enum
 */
export enum ApprovalStatus {
  /** Awaiting approval at current step */
  PENDING = 'pending',
  /** All approval steps complete */
  APPROVED = 'approved',
  /** All approval steps done, waiting for payment step */
  AWAITING_PAYMENT = 'awaiting_payment',
  /** Rejected at any step */
  REJECTED = 'rejected',
  /** Withdrawn by submitter */
  CANCELLED = 'cancelled',
  /** Payment step complete */
  PAID = 'paid',
}

/**
 * Action types for approval audit trail
 */
export type ApprovalActionType =
  | 'approved'
  | 'rejected'
  | 'delegated'
  | 'commented'
  | 'submitted'
  | 'paid';

/**
 * Audit trail of approval actions
 */
export interface ApprovalAction {
  id: string;
  expense_approval_id: string;
  step_number: number;
  action: ApprovalActionType;
  actor_id: string;
  actor_role: string;
  comment?: string;
  rejection_reason?: string;
  delegated_to?: string;
  action_at: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Temporary approval delegation
 */
export interface ApprovalDelegation {
  id: string;
  organization_id: string;
  delegator_id: string;
  delegate_id: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  reason: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * DTO for creating/updating workflows
 */
export interface CreateWorkflowDto {
  name: string;
  description?: string;
  conditions: ApprovalConditions;
  priority?: number;
  steps: CreateStepDto[];
}

export interface UpdateWorkflowDto {
  name?: string;
  description?: string;
  conditions?: ApprovalConditions;
  priority?: number;
  is_active?: boolean;
  is_default?: boolean;
}

export interface CreateStepDto {
  step_order: number;
  step_type: ApprovalStepType;
  approver_role?: 'manager' | 'finance' | 'admin';
  approver_user_id?: string;
  /** User IDs for multiple_users step type */
  approver_user_ids?: string[];
  /** True if this is a payment step */
  is_payment_step?: boolean;
}

/**
 * DTO for approval actions
 */
export interface ApproveExpenseDto {
  comment?: string;
}

export interface RejectExpenseDto {
  rejection_reason: string;
  comment?: string;
}

/**
 * Extended approval information with user details
 */
export interface ApprovalWithDetails extends ExpenseApproval {
  expense?: {
    merchant: string;
    amount: number;
    category: string;
    currency?: string;
    user: {
      full_name: string;
      email: string;
    };
  };
  report?: {
    name: string;
    total_amount: number;
    expense_count: number;
    user: {
      full_name: string;
      email: string;
    };
  };
  workflow?: {
    name: string;
  };
  current_approver?: {
    full_name: string;
    email: string;
  };
  actions: ApprovalAction[];
}

/**
 * Approval queue filters
 */
export interface ApprovalFilters {
  status?: ApprovalStatus;
  amount_min?: number;
  amount_max?: number;
  category?: string;
  date_from?: string;
  date_to?: string;
  submitter_id?: string;
}

/**
 * Approval statistics for dashboard
 */
export interface ApprovalStats {
  pending_count: number;
  /** Items awaiting payment step */
  awaiting_payment_count: number;
  approved_count: number;
  /** Items with completed payment step */
  paid_count: number;
  rejected_count: number;
  avg_approval_time_hours: number;
}

/**
 * Metadata for step types (used by UI)
 */
export interface StepTypeMetadata {
  value: ApprovalStepType;
  label: string;
  description: string;
  icon: string;
  requiresRole: boolean;
  requiresUser: boolean;
  requiresMultipleUsers: boolean;
  isPaymentStep: boolean;
  /** Roles that can use this step type */
  allowedRoles?: string[];
}

/**
 * Payment queue item for Finance dashboard
 */
export interface PaymentQueueItem {
  approval_id: string;
  expense_id?: string;
  report_id?: string;
  submitter_id: string;
  submitter_name: string;
  amount: number;
  description: string;
  current_approver_id: string;
  submitted_at: string;
  approved_at: string;
}
