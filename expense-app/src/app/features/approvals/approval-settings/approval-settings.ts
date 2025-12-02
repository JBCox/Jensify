import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatChipsModule } from "@angular/material/chips";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { MatTooltipModule } from "@angular/material/tooltip";
import { MatCardModule } from "@angular/material/card";
import { MatDividerModule } from "@angular/material/divider";
import { MatDialog, MatDialogModule } from "@angular/material/dialog";
import { Observable } from "rxjs";
import { switchMap } from "rxjs/operators";
import { ApprovalService } from "../../../core/services/approval.service";
import {
  ApprovalStep,
  ApprovalWorkflow,
  CreateStepDto,
} from "../../../core/models/approval.model";
import { EmptyState } from "../../../shared/components/empty-state/empty-state";
import { LoadingSkeleton } from "../../../shared/components/loading-skeleton/loading-skeleton";
import { OrganizationService } from "../../../core/services/organization.service";
import { OrganizationMember } from "../../../core/models/organization.model";
import { ExpenseCategory } from "../../../core/models/enums";
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from "../../../shared/components/confirm-dialog/confirm-dialog";
import { WorkflowStepEditorComponent, StepType, ApproverRole } from "../workflow-step-editor/workflow-step-editor";
import { WorkflowTestPanelComponent, TestResults } from "../workflow-test-panel/workflow-test-panel";

@Component({
  selector: "app-approval-settings",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatCardModule,
    MatDividerModule,
    MatDialogModule,
    EmptyState,
    LoadingSkeleton,
    WorkflowStepEditorComponent,
    WorkflowTestPanelComponent,
  ],
  templateUrl: "./approval-settings.html",
  styleUrls: ["./approval-settings.scss"],
})
export class ApprovalSettings implements OnInit {
  private approvalService = inject(ApprovalService);
  private organizationService = inject(OrganizationService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  workflows$!: Observable<ApprovalWorkflow[]>;
  loading = true;
  error: string | null = null;

  editingWorkflow: ApprovalWorkflow | null = null;
  workflowForm!: FormGroup;
  showWorkflowForm = false;

  expenseCategories = Object.values(ExpenseCategory);
  members = signal<OrganizationMember[]>([]);
  managersAndAbove = signal<OrganizationMember[]>([]);

  stepTypes: StepType[] = [
    { value: "manager", label: "Submitter's Manager", description: "Routes to employee's direct manager" },
    { value: "role", label: "User Role", description: "Routes to any user with specific role" },
    { value: "specific_user", label: "Specific User", description: "Routes to a named user" },
  ];

  approverRoles: ApproverRole[] = [
    { value: "manager", label: "Manager" },
    { value: "finance", label: "Finance" },
    { value: "admin", label: "Admin" },
  ];

  displayedColumns = ["name", "conditions", "steps", "active", "actions"];

  // Testing state
  showTestPanel = false;
  testResults: TestResults | null = null;

  ngOnInit(): void {
    this.loadWorkflows();
    this.loadOrganizationMembers();
    this.initializeWorkflowForm();
  }

  private loadWorkflows(): void {
    this.workflows$ = this.approvalService.getWorkflows();
  }

  private loadOrganizationMembers(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) return;

    this.organizationService.getOrganizationMembers(orgId).subscribe({
      next: (members) => {
        this.members.set(members);
        this.managersAndAbove.set(members.filter((m) => ["manager", "finance", "admin"].includes(m.role)));
      },
      error: (error) => console.error("Failed to load organization members:", error),
    });
  }

  private initializeWorkflowForm(): void {
    this.workflowForm = this.fb.group({
      name: ["", [Validators.required, Validators.minLength(3)]],
      description: [""],
      priority: [1, [Validators.required, Validators.min(1)]],
      is_active: [true],
      amount_min: [null],
      amount_max: [null],
      categories: [[]],
      submitter_ids: [[]],
      steps: this.fb.array([]),
    });
  }

  get stepsFormArray(): FormArray {
    return this.workflowForm.get("steps") as FormArray;
  }

  createStepFormGroup(step?: ApprovalStep): FormGroup {
    return this.fb.group({
      step_order: [step?.step_order || this.stepsFormArray.length + 1],
      step_type: [step?.step_type || "manager", Validators.required],
      approver_role: [step?.approver_role || null],
      approver_user_id: [step?.approver_user_id || null],
    });
  }

  addStep(): void {
    this.stepsFormArray.push(this.createStepFormGroup());
  }

  removeStep(index: number): void {
    this.stepsFormArray.removeAt(index);
    this.renumberSteps();
  }

  moveStepUp(index: number): void {
    if (index === 0) return;
    const step = this.stepsFormArray.at(index);
    this.stepsFormArray.removeAt(index);
    this.stepsFormArray.insert(index - 1, step);
    this.renumberSteps();
  }

  moveStepDown(index: number): void {
    if (index === this.stepsFormArray.length - 1) return;
    const step = this.stepsFormArray.at(index);
    this.stepsFormArray.removeAt(index);
    this.stepsFormArray.insert(index + 1, step);
    this.renumberSteps();
  }

  private renumberSteps(): void {
    this.stepsFormArray.controls.forEach((control, idx) => {
      control.patchValue({ step_order: idx + 1 });
    });
  }

  asFormGroup(control: AbstractControl): FormGroup {
    return control as FormGroup;
  }

  onCreateWorkflow(): void {
    this.editingWorkflow = null;
    this.workflowForm.reset({ priority: 1, is_active: true, categories: [], submitter_ids: [] });
    this.stepsFormArray.clear();
    this.addStep();
    this.showWorkflowForm = true;
  }

  onEditWorkflow(workflow: ApprovalWorkflow): void {
    this.editingWorkflow = workflow;
    this.approvalService.getWorkflowSteps(workflow.id).subscribe({
      next: (steps) => {
        this.workflowForm.patchValue({
          name: workflow.name,
          description: workflow.description,
          priority: workflow.priority,
          is_active: workflow.is_active,
          amount_min: workflow.conditions?.amount_min || null,
          amount_max: workflow.conditions?.amount_max || null,
          categories: workflow.conditions?.categories || [],
          submitter_ids: workflow.conditions?.submitter_ids || [],
        });
        this.stepsFormArray.clear();
        steps.forEach((step) => this.stepsFormArray.push(this.createStepFormGroup(step)));
        if (this.stepsFormArray.length === 0) this.addStep();
        this.showWorkflowForm = true;
      },
      error: () => this.snackBar.open("Failed to load workflow steps", "Close", { duration: 5000 }),
    });
  }

  onCancelEdit(): void {
    this.showWorkflowForm = false;
    this.editingWorkflow = null;
    this.workflowForm.reset();
    this.stepsFormArray.clear();
    this.resetTest();
  }

  onSaveWorkflow(): void {
    if (this.workflowForm.invalid) {
      this.snackBar.open("Please fill in all required fields", "Close", { duration: 3000 });
      return;
    }
    if (this.stepsFormArray.length === 0) {
      this.snackBar.open("At least one approval step is required", "Close", { duration: 3000 });
      return;
    }

    const stepValidationError = this.validateSteps();
    if (stepValidationError) {
      this.snackBar.open(stepValidationError, "Close", { duration: 5000 });
      return;
    }

    const warnings = this.validateManagerAssignments();
    if (warnings.length > 0) {
      this.showWarningDialog(warnings);
      return;
    }

    this.saveWorkflowData();
  }

  private validateSteps(): string | null {
    for (let i = 0; i < this.stepsFormArray.length; i++) {
      const step = this.stepsFormArray.at(i) as FormGroup;
      const stepType = step.get("step_type")?.value;
      if (stepType === "role" && !step.get("approver_role")?.value) {
        return `Step ${i + 1}: Please select an approver role`;
      }
      if (stepType === "specific_user" && !step.get("approver_user_id")?.value) {
        return `Step ${i + 1}: Please select a specific user`;
      }
    }
    return null;
  }

  private showWarningDialog(warnings: string[]): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Manager Assignment Warning",
        message: `Warning:\n\n${warnings.join("\n\n")}\n\nDo you want to proceed anyway?`,
        confirmText: "Proceed Anyway",
        cancelText: "Cancel",
        confirmColor: "primary",
        icon: "warning",
        iconColor: getComputedStyle(document.documentElement).getPropertyValue('--jensify-primary').trim() || '#FF5900',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) this.saveWorkflowData();
    });
  }

  private saveWorkflowData(): void {
    const formValue = this.workflowForm.value;
    const conditions = this.buildConditions(formValue);
    const steps = this.buildSteps();

    if (this.editingWorkflow) {
      this.updateWorkflow(formValue, conditions, steps);
    } else {
      this.createWorkflow(formValue, conditions, steps);
    }
  }

  private buildConditions(formValue: { amount_min?: number; amount_max?: number; categories?: string[]; submitter_ids?: string[] }): Record<string, unknown> {
    const conditions: Record<string, unknown> = {};
    if (formValue.amount_min !== null && formValue.amount_min !== undefined) conditions['amount_min'] = formValue.amount_min;
    if (formValue.amount_max !== null && formValue.amount_max !== undefined) conditions['amount_max'] = formValue.amount_max;
    if (formValue.categories?.length) conditions['categories'] = formValue.categories;
    if (formValue.submitter_ids?.length) conditions['submitter_ids'] = formValue.submitter_ids;
    return conditions;
  }

  private buildSteps(): CreateStepDto[] {
    return this.stepsFormArray.controls.map((control, index) => ({
      step_order: index + 1,
      step_type: control.value.step_type,
      approver_role: control.value.approver_role || undefined,
      approver_user_id: control.value.approver_user_id || undefined,
    }));
  }

  private updateWorkflow(formValue: { name: string; description?: string; priority: number; is_active: boolean }, conditions: Record<string, unknown>, steps: CreateStepDto[]): void {
    this.approvalService.updateWorkflow(this.editingWorkflow!.id, {
      name: formValue.name,
      description: formValue.description,
      conditions,
      priority: formValue.priority,
      is_active: formValue.is_active,
    }).pipe(
      switchMap(() => this.approvalService.updateWorkflowSteps(this.editingWorkflow!.id, steps))
    ).subscribe({
      next: () => {
        this.snackBar.open("Workflow updated successfully", "Close", { duration: 3000 });
        this.showWorkflowForm = false;
        this.editingWorkflow = null;
        this.loadWorkflows();
      },
      error: () => this.snackBar.open("Failed to update workflow", "Close", { duration: 5000 }),
    });
  }

  private createWorkflow(formValue: { name: string; description?: string; priority: number }, conditions: Record<string, unknown>, steps: CreateStepDto[]): void {
    this.approvalService.createWorkflow({
      name: formValue.name,
      description: formValue.description,
      conditions,
      priority: formValue.priority,
      steps,
    }).subscribe({
      next: () => {
        this.snackBar.open("Workflow created successfully", "Close", { duration: 3000 });
        this.showWorkflowForm = false;
        this.loadWorkflows();
      },
      error: (err) => this.snackBar.open(err.message || "Failed to create workflow", "Close", { duration: 5000 }),
    });
  }

  onDeleteWorkflow(workflow: ApprovalWorkflow): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Delete Workflow",
        message: `Are you sure you want to delete "${workflow.name}"? This cannot be undone.`,
        confirmText: "Delete",
        cancelText: "Cancel",
        confirmColor: "warn",
        icon: "delete_forever",
        iconColor: "#f44336",
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.approvalService.deleteWorkflow(workflow.id).subscribe({
          next: () => {
            this.snackBar.open("Workflow deleted", "Close", { duration: 3000 });
            this.loadWorkflows();
          },
          error: () => this.snackBar.open("Failed to delete workflow", "Close", { duration: 5000 }),
        });
      }
    });
  }

  onToggleActive(workflow: ApprovalWorkflow): void {
    this.approvalService.updateWorkflow(workflow.id, { is_active: !workflow.is_active }).subscribe({
      next: () => {
        this.snackBar.open(`Workflow ${!workflow.is_active ? "activated" : "deactivated"}`, "Close", { duration: 3000 });
        this.loadWorkflows();
      },
      error: () => this.snackBar.open("Failed to update workflow", "Close", { duration: 5000 }),
    });
  }

  formatConditions(workflow: ApprovalWorkflow): string {
    const parts: string[] = [];
    if (workflow.conditions?.amount_min !== undefined && workflow.conditions?.amount_max !== undefined) {
      parts.push(`$${workflow.conditions.amount_min} - $${workflow.conditions.amount_max}`);
    } else if (workflow.conditions?.amount_min !== undefined) {
      parts.push(`≥ $${workflow.conditions.amount_min}`);
    } else if (workflow.conditions?.amount_max !== undefined) {
      parts.push(`≤ $${workflow.conditions.amount_max}`);
    }
    if (workflow.conditions?.categories?.length) {
      parts.push(workflow.conditions.categories.length === 1 ? workflow.conditions.categories[0] : `${workflow.conditions.categories.length} categories`);
    }
    return parts.length > 0 ? parts.join(", ") : "All expenses";
  }

  validateManagerAssignments(): string[] {
    const warnings: string[] = [];
    const hasManagerStep = this.stepsFormArray.controls.some((s) => s.get("step_type")?.value === "manager");
    if (!hasManagerStep) return warnings;

    const employeesWithoutManagers = this.members().filter((m) => m.role === "employee" && !m.manager_id && m.is_active);
    if (employeesWithoutManagers.length > 0) {
      const names = employeesWithoutManagers.slice(0, 5).map((m) => m.user?.full_name || "Unknown").join(", ");
      warnings.push(`${employeesWithoutManagers.length} employee(s) have no manager: ${names}${employeesWithoutManagers.length > 5 ? ", ..." : ""}`);
    }

    const formValue = this.workflowForm.value;
    if (formValue.amount_min === null && formValue.amount_max === null && (!formValue.categories || formValue.categories.length === 0)) {
      if (employeesWithoutManagers.length > 0) {
        warnings.push("This workflow applies to ALL expenses. Consider assigning managers or using role-based approval.");
      }
    }
    return warnings;
  }

  testWorkflow(): void {
    if (this.stepsFormArray.length === 0) {
      this.snackBar.open("Add at least one step to test", "Close", { duration: 3000 });
      return;
    }

    const steps = this.stepsFormArray.controls.map((control, i) => {
      const stepType = control.get("step_type")?.value;
      const approverRole = control.get("approver_role")?.value;
      const approverUserId = control.get("approver_user_id")?.value;

      let approverName = "Unknown";
      let role = "";

      switch (stepType) {
        case "manager":
          approverName = "Submitter's Manager";
          role = "Manager";
          break;
        case "role":
          if (approverRole) {
            const roleMembers = this.members().filter((m) => m.role === approverRole && m.is_active);
            approverName = roleMembers.length > 0
              ? `Any ${approverRole.charAt(0).toUpperCase() + approverRole.slice(1)} (${roleMembers.length} available)`
              : `⚠️ No active ${approverRole}s found`;
            role = approverRole.charAt(0).toUpperCase() + approverRole.slice(1);
          }
          break;
        case "specific_user":
          if (approverUserId) {
            const user = this.members().find((m) => m.user_id === approverUserId);
            approverName = user?.user?.full_name || "⚠️ User not found";
            role = user ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Unknown";
          }
          break;
      }

      return { stepNumber: i + 1, stepType, approverName, approverRole: role };
    });

    this.testResults = { steps, estimatedHours: steps.length * 12 };
    this.showTestPanel = true;
  }

  resetTest(): void {
    this.testResults = null;
    this.showTestPanel = false;
  }
}
