import { inject, Injectable } from "@angular/core";
import { from, Observable, of, throwError } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { SupabaseService } from "./supabase.service";
import { OrganizationService } from "./organization.service";
import { NotificationService } from "./notification.service";
import { LoggerService } from "./logger.service";
import {
  ApprovalAction,
  ApprovalFilters,
  ApprovalStats,
  ApprovalStatus,
  ApprovalStep,
  ApprovalWithDetails,
  ApprovalWorkflow,
  ApproveExpenseDto,
  CreateStepDto,
  CreateWorkflowDto,
  ExpenseApproval,
  RejectExpenseDto,
  UpdateWorkflowDto,
} from "../models/approval.model";

/**
 * Internal types for database query results
 * These represent the shape of data returned from manual joins
 */
interface DbExpenseWithUser {
  id: string;
  merchant: string;
  amount: number;
  category: string;
  user: {
    full_name: string;
    email: string;
  };
}

interface DbReportWithUser {
  id: string;
  name: string;
  total_amount: number;
  expense_count: number;
  user: {
    full_name: string;
    email: string;
  };
}

// DbQueryResult interface available for future use in batch queries
interface _DbQueryResult {
  type: 'workflows' | 'expenses' | 'reports';
  data: ApprovalWorkflow[] | DbExpenseWithUser[] | DbReportWithUser[] | null;
}

/**
 * Service for managing approval workflows and processing approvals
 * Handles workflow CRUD, approval queue, and approval actions
 * All operations are scoped to the current organization
 */
@Injectable({
  providedIn: "root",
})
export class ApprovalService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private logger = inject(LoggerService);

  // ============================================================================
  // WORKFLOW MANAGEMENT
  // ============================================================================

  /**
   * Get all workflows for current organization
   */
  getWorkflows(): Observable<ApprovalWorkflow[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    return from(
      this.supabase.client
        .from("approval_workflows")
        .select("*")
        .eq("organization_id", organizationId)
        .order("priority", { ascending: false }),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as ApprovalWorkflow[];
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch workflows", error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get a single workflow by ID
   */
  getWorkflow(workflowId: string): Observable<ApprovalWorkflow> {
    return from(
      this.supabase.client
        .from("approval_workflows")
        .select("*")
        .eq("id", workflowId)
        .single(),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as ApprovalWorkflow;
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch workflow", error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get workflow steps for a given workflow
   */
  getWorkflowSteps(workflowId: string): Observable<ApprovalStep[]> {
    return from(
      this.supabase.client
        .from("approval_steps")
        .select("*")
        .eq("workflow_id", workflowId)
        .order("step_order", { ascending: true }),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as ApprovalStep[];
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch workflow steps", error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Create a new approval workflow
   * Admin only
   */
  createWorkflow(dto: CreateWorkflowDto): Observable<ApprovalWorkflow> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    // Create workflow first
    return from(
      this.supabase.client
        .from("approval_workflows")
        .insert({
          organization_id: organizationId,
          name: dto.name,
          description: dto.description || null,
          conditions: dto.conditions,
          priority: dto.priority || 0,
          is_active: true,
          created_by: userId,
        })
        .select()
        .single(),
    ).pipe(
      switchMap((response) => {
        if (response.error) throw response.error;
        const workflow = response.data as ApprovalWorkflow;

        // Create workflow steps
        const steps = dto.steps.map((step) => ({
          workflow_id: workflow.id,
          step_order: step.step_order,
          step_type: step.step_type,
          approver_role: step.approver_role || null,
          approver_user_id: step.approver_user_id || null,
        }));

        return from(
          this.supabase.client
            .from("approval_steps")
            .insert(steps),
        ).pipe(
          map(() => {
            this.notificationService.showSuccess(
              "Approval workflow created successfully",
            );
            return workflow;
          }),
        );
      }),
      catchError((error) => {
        this.logger.error("Failed to create workflow", error);
        this.notificationService.showError(
          "Failed to create approval workflow",
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Update an existing workflow
   * Admin only
   */
  updateWorkflow(
    workflowId: string,
    dto: UpdateWorkflowDto,
  ): Observable<ApprovalWorkflow> {
    return from(
      this.supabase.client
        .from("approval_workflows")
        .update({
          name: dto.name,
          description: dto.description,
          conditions: dto.conditions,
          priority: dto.priority,
          is_active: dto.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId)
        .select()
        .single(),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        this.notificationService.showSuccess("Workflow updated successfully");
        return response.data as ApprovalWorkflow;
      }),
      catchError((error) => {
        this.logger.error("Failed to update workflow", error);
        this.notificationService.showError("Failed to update workflow");
        return throwError(() => error);
      }),
    );
  }

  /**
   * Update workflow steps without recreating the workflow
   * Admin only
   * This allows modifying the approval chain without changing the workflow ID
   */
  updateWorkflowSteps(
    workflowId: string,
    steps: CreateStepDto[],
  ): Observable<void> {
    return from(
      this.supabase.client.rpc("update_workflow_steps", {
        p_workflow_id: workflowId,
        p_steps: steps,
      }),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        this.notificationService.showSuccess(
          "Workflow steps updated successfully",
        );
      }),
      catchError((error) => {
        this.logger.error("Failed to update workflow steps", error);
        this.notificationService.showError("Failed to update workflow steps");
        return throwError(() => error);
      }),
    );
  }

  /**
   * Delete a workflow
   * Admin only
   */
  deleteWorkflow(workflowId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("approval_workflows")
        .delete()
        .eq("id", workflowId),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        this.notificationService.showSuccess("Workflow deleted successfully");
      }),
      catchError((error) => {
        this.logger.error("Failed to delete workflow", error);
        this.notificationService.showError("Failed to delete workflow");
        return throwError(() => error);
      }),
    );
  }

  // ============================================================================
  // APPROVAL QUEUE
  // ============================================================================

  /**
   * Get pending approvals assigned to current user
   * Used for approval queue
   */
  getPendingApprovals(
    filters?: ApprovalFilters,
  ): Observable<ApprovalWithDetails[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    // Query expense_approvals with filter by current_approver_id
    // RLS policy allows org members to see pending approvals in their org
    let query = this.supabase.client
      .from("expense_approvals")
      .select("*")
      .eq("current_approver_id", userId)
      .eq("status", ApprovalStatus.PENDING);

    // Apply filters
    if (filters) {
      if (filters.date_from) {
        query = query.gte("submitted_at", filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte("submitted_at", filters.date_to);
      }
    }

    return from(query.order("submitted_at", { ascending: false })).pipe(
      switchMap(async (response) => {
        if (response.error) throw response.error;
        const approvals = response.data as ExpenseApproval[];

        if (approvals.length === 0) return [];

        // 2. Collect IDs
        const workflowIds = [
          ...new Set(approvals.map((a) => a.workflow_id).filter(Boolean)),
        ];
        const expenseIds = [
          ...new Set(approvals.map((a) => a.expense_id).filter(Boolean)),
        ];
        const reportIds = [
          ...new Set(approvals.map((a) => a.report_id).filter(Boolean)),
        ];

        // 3. Fetch related data in parallel
        const promises = [];

        // Fetch workflows
        if (workflowIds.length > 0) {
          promises.push(
            this.supabase.client
              .from("approval_workflows")
              .select("*")
              .in("id", workflowIds)
              .then((res) => ({ type: "workflows", data: res.data })),
          );
        }

        // Fetch expenses with users
        if (expenseIds.length > 0) {
          promises.push(
            this.supabase.client
              .from("expenses")
              .select("*, user:users!expenses_user_id_fkey(*)")
              .in("id", expenseIds)
              .then((res) => ({ type: "expenses", data: res.data })),
          );
        }

        // Fetch reports with users
        if (reportIds.length > 0) {
          promises.push(
            this.supabase.client
              .from("expense_reports")
              .select("*, user:users!expense_reports_user_id_fkey(*)")
              .in("id", reportIds)
              .then((res) => ({ type: "reports", data: res.data })),
          );
        }

        const results = await Promise.all(promises);

        // 4. Map data back to approvals
        const workflowsMap = new Map();
        const expensesMap = new Map();
        const reportsMap = new Map();

        results.forEach((res) => {
          if (res?.data) {
            if (res.type === "workflows") {
              (res.data as ApprovalWorkflow[]).forEach((i) => workflowsMap.set(i.id, i));
            }
            if (res.type === "expenses") {
              (res.data as DbExpenseWithUser[]).forEach((i) => expensesMap.set(i.id, i));
            }
            if (res.type === "reports") {
              (res.data as DbReportWithUser[]).forEach((i) => reportsMap.set(i.id, i));
            }
          }
        });

        return approvals.map((approval) => ({
          ...approval,
          workflow: workflowsMap.get(approval.workflow_id),
          expense: approval.expense_id
            ? expensesMap.get(approval.expense_id)
            : undefined,
          report: approval.report_id
            ? reportsMap.get(approval.report_id)
            : undefined,
        })) as ApprovalWithDetails[];
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch pending approvals", error);
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get all approvals for current user's submissions
   */
  getMySubmissions(
    filters?: ApprovalFilters,
  ): Observable<ApprovalWithDetails[]> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId || !organizationId) {
      return throwError(() =>
        new Error("User not authenticated or no organization selected")
      );
    }

    // ✅ FIX: Manual join to bypass stale PostgREST schema cache
    // 1. Fetch base submissions
    let query = this.supabase.client
      .from("expense_approvals")
      .select("*")
      .eq("organization_id", organizationId);

    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    return from(query.order("submitted_at", { ascending: false })).pipe(
      switchMap(async (response) => {
        if (response.error) throw response.error;
        const submissions = response.data as ExpenseApproval[];

        if (submissions.length === 0) return [];

        // 2. Collect IDs
        const workflowIds = [
          ...new Set(submissions.map((s) => s.workflow_id).filter(Boolean)),
        ];
        const expenseIds = [
          ...new Set(submissions.map((s) => s.expense_id).filter(Boolean)),
        ];
        const reportIds = [
          ...new Set(submissions.map((s) => s.report_id).filter(Boolean)),
        ];

        // 3. Fetch related data in parallel
        const promises = [];

        // Fetch workflows
        if (workflowIds.length > 0) {
          promises.push(
            this.supabase.client
              .from("approval_workflows")
              .select("*")
              .in("id", workflowIds)
              .then((res) => ({ type: "workflows", data: res.data })),
          );
        }

        // Fetch expenses
        if (expenseIds.length > 0) {
          promises.push(
            this.supabase.client
              .from("expenses")
              .select("*")
              .in("id", expenseIds)
              .then((res) => ({ type: "expenses", data: res.data })),
          );
        }

        // Fetch reports
        if (reportIds.length > 0) {
          promises.push(
            this.supabase.client
              .from("expense_reports")
              .select("*")
              .in("id", reportIds)
              .then((res) => ({ type: "reports", data: res.data })),
          );
        }

        const results = await Promise.all(promises);

        // 4. Map data back to submissions
        const workflowsMap = new Map();
        const expensesMap = new Map();
        const reportsMap = new Map();

        results.forEach((res) => {
          if (res?.data) {
            if (res.type === "workflows") {
              (res.data as ApprovalWorkflow[]).forEach((i) => workflowsMap.set(i.id, i));
            }
            if (res.type === "expenses") {
              (res.data as DbExpenseWithUser[]).forEach((i) => expensesMap.set(i.id, i));
            }
            if (res.type === "reports") {
              (res.data as DbReportWithUser[]).forEach((i) => reportsMap.set(i.id, i));
            }
          }
        });

        return submissions.map((submission) => ({
          ...submission,
          workflow: workflowsMap.get(submission.workflow_id),
          expense: submission.expense_id
            ? expensesMap.get(submission.expense_id)
            : undefined,
          report: submission.report_id
            ? reportsMap.get(submission.report_id)
            : undefined,
        })) as ApprovalWithDetails[];
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch my submissions", error);
        return throwError(() => error);
      }),
    );
  }

  // ============================================================================
  // APPROVAL ACTIONS
  // ============================================================================

  /**
   * Approve an expense/report
   * Uses maybeSingle() to gracefully handle cases where the record may not be
   * visible after approval due to RLS policy changes (defensive programming)
   */
  approve(
    approvalId: string,
    dto: ApproveExpenseDto,
  ): Observable<ExpenseApproval> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    // Call the backend RPC function to handle approval logic
    return from(
      this.supabase.client.rpc("approve_expense", {
        p_approval_id: approvalId,
        p_approver_id: userId,
        p_comment: dto.comment || null,
      }),
    ).pipe(
      switchMap((rpcResponse) => {
        // Check if RPC itself failed
        if (rpcResponse.error) {
          throw rpcResponse.error;
        }

        // Fetch updated approval record using maybeSingle() to handle
        // cases where the record may not be visible after status change
        return from(
          this.supabase.client
            .from("expense_approvals")
            .select("*")
            .eq("id", approvalId)
            .maybeSingle(),
        );
      }),
      map((response) => {
        if (response.error) {
          // Only throw for actual errors, not "record not found"
          if (response.error.code !== "PGRST116") {
            throw response.error;
          }
        }

        this.notificationService.showSuccess("Expense approved successfully");

        // If record is not visible after approval (RLS may have changed),
        // return a minimal approval object to keep the UI working
        if (!response.data) {
          this.logger.warn(
            "Approval record not visible after approval - returning minimal object",
          );
          return {
            id: approvalId,
            status: ApprovalStatus.APPROVED,
          } as ExpenseApproval;
        }

        return response.data as ExpenseApproval;
      }),
      catchError((error) => {
        this.logger.error("Failed to approve expense", error);
        this.notificationService.showError(
          error.message || "Failed to approve expense",
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Reject an expense/report
   * Uses maybeSingle() to gracefully handle cases where the record may not be
   * visible after rejection due to RLS policy changes (defensive programming)
   */
  reject(
    approvalId: string,
    dto: RejectExpenseDto,
  ): Observable<ExpenseApproval> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    // Call the backend RPC function to handle rejection logic
    return from(
      this.supabase.client.rpc("reject_expense", {
        p_approval_id: approvalId,
        p_approver_id: userId,
        p_rejection_reason: dto.rejection_reason,
        p_comment: dto.comment || null,
      }),
    ).pipe(
      switchMap((rpcResponse) => {
        // Check if RPC itself failed
        if (rpcResponse.error) {
          throw rpcResponse.error;
        }

        // Fetch updated approval record using maybeSingle() to handle
        // cases where the record may not be visible after status change
        return from(
          this.supabase.client
            .from("expense_approvals")
            .select("*")
            .eq("id", approvalId)
            .maybeSingle(),
        );
      }),
      map((response) => {
        if (response.error) {
          // Only throw for actual errors, not "record not found"
          if (response.error.code !== "PGRST116") {
            throw response.error;
          }
        }

        this.notificationService.showSuccess("Expense rejected");

        // If record is not visible after rejection (RLS may have changed),
        // return a minimal approval object to keep the UI working
        if (!response.data) {
          this.logger.warn(
            "Approval record not visible after rejection - returning minimal object",
          );
          return {
            id: approvalId,
            status: ApprovalStatus.REJECTED,
          } as ExpenseApproval;
        }

        return response.data as ExpenseApproval;
      }),
      catchError((error) => {
        this.logger.error("Failed to reject expense", error);
        this.notificationService.showError(
          error.message || "Failed to reject expense",
        );
        return throwError(() => error);
      }),
    );
  }

  /**
   * Get approval history for an expense or report
   */
  getApprovalHistory(approvalId: string): Observable<ApprovalAction[]> {
    // Simplified query without nested user join due to PostgREST schema cache issue
    return from(
      this.supabase.client
        .from("approval_actions")
        .select("*")
        .eq("expense_approval_id", approvalId)
        .order("action_at", { ascending: true }),
    ).pipe(
      // ✅ FIX: Remove 'as any' type assertion
      map((response) => {
        if (response.error) throw response.error;
        return response.data as ApprovalAction[];
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch approval history", error);
        return throwError(() => error);
      }),
    );
  }

  // ============================================================================
  // APPROVAL STATS
  // ============================================================================

  /**
   * Get approval statistics for current user
   */
  getApprovalStats(): Observable<ApprovalStats> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId || !organizationId) {
      return throwError(() =>
        new Error("User not authenticated or no organization selected")
      );
    }

    return from(
      this.supabase.client.rpc("get_approval_stats", {
        p_approver_id: userId,
        p_organization_id: organizationId,
      }),
    ).pipe(
      map((response) => {
        if (response.error) throw response.error;
        return response.data as ApprovalStats;
      }),
      catchError((error) => {
        this.logger.error("Failed to fetch approval stats", error);
        // Return default stats on error
        return of({
          pending_count: 0,
          approved_count: 0,
          rejected_count: 0,
          avg_approval_time_hours: 0,
        } as ApprovalStats);
      }),
    );
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Check if current user can approve a specific expense approval
   */
  canApprove(approval: ExpenseApproval): boolean {
    const userId = this.supabase.userId;
    return (
      userId === approval.current_approver_id &&
      approval.status === ApprovalStatus.PENDING
    );
  }

  /**
   * Get approval status display text
   */
  getStatusDisplay(status: ApprovalStatus): string {
    const statusMap: Record<ApprovalStatus, string> = {
      [ApprovalStatus.PENDING]: "Pending Approval",
      [ApprovalStatus.APPROVED]: "Approved",
      [ApprovalStatus.REJECTED]: "Rejected",
      [ApprovalStatus.CANCELLED]: "Cancelled",
    };
    return statusMap[status] || status;
  }

  /**
   * Get approval status color class
   */
  getStatusColor(status: ApprovalStatus): string {
    const colorMap: Record<ApprovalStatus, string> = {
      [ApprovalStatus.PENDING]: "warning",
      [ApprovalStatus.APPROVED]: "success",
      [ApprovalStatus.REJECTED]: "danger",
      [ApprovalStatus.CANCELLED]: "muted",
    };
    return colorMap[status] || "muted";
  }
}
