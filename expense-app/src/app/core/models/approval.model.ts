/**
 * Approval System Models
 * Type definitions for multi-level approval workflows
 */

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
  amount_min?: number;
  amount_max?: number;
  categories?: string[];
  department?: string;
  user_ids?: string[];
  submitter_ids?: string[];
}

/**
 * Individual step within an approval workflow
 */
export interface ApprovalStep {
  id: string;
  workflow_id: string;
  step_order: number;
  step_type: "manager" | "role" | "specific_user" | "department_owner";
  approver_role?: "manager" | "finance" | "admin";
  approver_user_id?: string;
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
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}

/**
 * Audit trail of approval actions
 */
export interface ApprovalAction {
  id: string;
  expense_approval_id: string;
  step_number: number;
  action: "approved" | "rejected" | "delegated" | "commented" | "submitted";
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
}

export interface CreateStepDto {
  step_order: number;
  step_type: "manager" | "role" | "specific_user" | "department_owner";
  approver_role?: "manager" | "finance" | "admin";
  approver_user_id?: string;
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
  workflow: {
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
  approved_count: number;
  rejected_count: number;
  avg_approval_time_hours: number;
}
