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
import { MatTabsModule } from "@angular/material/tabs";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatExpansionModule } from "@angular/material/expansion";
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

@Component({
  selector: "app-approval-settings",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatExpansionModule,
    MatChipsModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatCardModule,
    MatDividerModule,
    MatDialogModule,
    EmptyState,
    LoadingSkeleton,
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

  // Expense categories for conditions
  expenseCategories = Object.values(ExpenseCategory);

  // Organization members for specific user selection
  members = signal<OrganizationMember[]>([]);
  managersAndAbove = signal<OrganizationMember[]>([]);

  // Step types
  stepTypes = [
    {
      value: "manager",
      label: "Submitter's Manager",
      description: "Routes to employee's direct manager",
    },
    {
      value: "role",
      label: "User Role",
      description: "Routes to any user with specific role",
    },
    {
      value: "specific_user",
      label: "Specific User",
      description: "Routes to a named user",
    },
  ];

  // Approver roles
  approverRoles = [
    { value: "manager", label: "Manager" },
    { value: "finance", label: "Finance" },
    { value: "admin", label: "Admin" },
  ];

  displayedColumns = ["name", "conditions", "steps", "active", "actions"];

  // Workflow testing
  showTestPanel = false;
  testAmount: number | null = null;
  testCategory = "";
  testResults: {
    steps: {
      stepNumber: number;
      stepType: string;
      approverName: string;
      approverRole: string;
    }[];
    estimatedHours: number;
  } | null = null;

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
        this.managersAndAbove.set(
          members.filter((m) =>
            ["manager", "finance", "admin"].includes(m.role)
          ),
        );
      },
      error: (error) => {
        console.error("Failed to load organization members:", error);
      },
    });
  }

  private initializeWorkflowForm(): void {
    this.workflowForm = this.fb.group({
      name: ["", [Validators.required, Validators.minLength(3)]],
      description: [""],
      priority: [1, [Validators.required, Validators.min(1)]],
      is_active: [true],
      // Conditions
      amount_min: [null],
      amount_max: [null],
      categories: [[]],
      submitter_ids: [[]],
      // Steps
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
    // Re-number steps
    this.stepsFormArray.controls.forEach((control, idx) => {
      control.patchValue({ step_order: idx + 1 });
    });
  }

  moveStepUp(index: number): void {
    if (index === 0) return;
    const steps = this.stepsFormArray;
    const step = steps.at(index);
    steps.removeAt(index);
    steps.insert(index - 1, step);
    // Re-number steps
    steps.controls.forEach((control, idx) => {
      control.patchValue({ step_order: idx + 1 });
    });
  }

  moveStepDown(index: number): void {
    const steps = this.stepsFormArray;
    if (index === steps.length - 1) return;
    const step = steps.at(index);
    steps.removeAt(index);
    steps.insert(index + 1, step);
    // Re-number steps
    steps.controls.forEach((control, idx) => {
      control.patchValue({ step_order: idx + 1 });
    });
  }

  getStepTypeLabel(stepType: string): string {
    return this.stepTypes.find((st) => st.value === stepType)?.label ||
      stepType;
  }

  asFormGroup(control: AbstractControl): FormGroup {
    return control as FormGroup;
  }

  getStepDescription(step: FormGroup): string {
    const stepType = step.get("step_type")?.value;
    const approverRole = step.get("approver_role")?.value;
    const approverUserId = step.get("approver_user_id")?.value;

    switch (stepType) {
      case "manager":
        return "Submitter's Manager";
      case "role":
        return approverRole
          ? `Any ${
            approverRole.charAt(0).toUpperCase() + approverRole.slice(1)
          }`
          : "Role not set";
      case "specific_user":
        if (approverUserId) {
          const user = this.members().find((m) => m.user_id === approverUserId);
          return user?.user?.full_name || "User not found";
        }
        return "User not selected";
      default:
        return stepType;
    }
  }

  onCreateWorkflow(): void {
    this.editingWorkflow = null;
    this.workflowForm.reset({
      priority: 1,
      is_active: true,
      categories: [],
      submitter_ids: [],
    });
    this.stepsFormArray.clear();
    // Add default first step (manager)
    this.addStep();
    this.showWorkflowForm = true;
  }

  onEditWorkflow(workflow: ApprovalWorkflow): void {
    this.editingWorkflow = workflow;

    // Load workflow steps
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

        // Clear and rebuild steps
        this.stepsFormArray.clear();
        steps.forEach((step) => {
          this.stepsFormArray.push(this.createStepFormGroup(step));
        });

        // If no steps, add default
        if (this.stepsFormArray.length === 0) {
          this.addStep();
        }

        this.showWorkflowForm = true;
      },
      error: (error) => {
        console.error("Failed to load workflow steps:", error);
        this.snackBar.open("Failed to load workflow steps", "Close", {
          duration: 5000,
        });
      },
    });
  }

  onCancelEdit(): void {
    this.showWorkflowForm = false;
    this.editingWorkflow = null;
    this.workflowForm.reset();
    this.stepsFormArray.clear();
  }

  onSaveWorkflow(): void {
    if (this.workflowForm.invalid) {
      this.snackBar.open("Please fill in all required fields", "Close", {
        duration: 3000,
      });
      return;
    }

    if (this.stepsFormArray.length === 0) {
      this.snackBar.open("At least one approval step is required", "Close", {
        duration: 3000,
      });
      return;
    }

    // Validate steps
    for (let i = 0; i < this.stepsFormArray.length; i++) {
      const step = this.stepsFormArray.at(i) as FormGroup;
      const stepType = step.get("step_type")?.value;

      if (stepType === "role" && !step.get("approver_role")?.value) {
        this.snackBar.open(
          `Step ${i + 1}: Please select an approver role`,
          "Close",
          { duration: 5000 },
        );
        return;
      }

      if (
        stepType === "specific_user" && !step.get("approver_user_id")?.value
      ) {
        this.snackBar.open(
          `Step ${i + 1}: Please select a specific user`,
          "Close",
          { duration: 5000 },
        );
        return;
      }
    }

    // Validate manager assignments
    const validationWarnings = this.validateManagerAssignments();
    if (validationWarnings.length > 0) {
      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: "Manager Assignment Warning",
          message: `Warning:\\n\\n${validationWarnings.join("\\n\\n")}\\n\\nDo you want to proceed anyway?`,
          confirmText: "Proceed Anyway",
          cancelText: "Cancel",
          confirmColor: "primary",
          icon: "warning",
          iconColor: "#FF5900",
        } as ConfirmDialogData,
      });

      dialogRef.afterClosed().subscribe((confirmed) => {
        if (confirmed) {
          this.saveWorkflowData();
        }
      });
      return;
    }

    this.saveWorkflowData();
  }

  private saveWorkflowData(): void {

    const formValue = this.workflowForm.value;

    // Build conditions object
    const conditions: {
      amount_min?: number;
      amount_max?: number;
      categories?: string[];
      submitter_ids?: string[];
    } = {};
    if (formValue.amount_min !== null && formValue.amount_min !== "") {
      conditions.amount_min = formValue.amount_min;
    }
    if (formValue.amount_max !== null && formValue.amount_max !== "") {
      conditions.amount_max = formValue.amount_max;
    }
    if (formValue.categories && formValue.categories.length > 0) {
      conditions.categories = formValue.categories;
    }
    if (formValue.submitter_ids && formValue.submitter_ids.length > 0) {
      conditions.submitter_ids = formValue.submitter_ids;
    }

    // Build steps array
    const steps: CreateStepDto[] = this.stepsFormArray.controls.map(
      (control, index) => {
        const stepValue = control.value;
        return {
          step_order: index + 1,
          step_type: stepValue.step_type,
          approver_role: stepValue.approver_role || undefined,
          approver_user_id: stepValue.approver_user_id || undefined,
        };
      },
    );

    if (this.editingWorkflow) {
      // Update existing workflow metadata
      this.approvalService.updateWorkflow(this.editingWorkflow.id, {
        name: formValue.name,
        description: formValue.description,
        conditions: conditions,
        priority: formValue.priority,
        is_active: formValue.is_active,
      }).pipe(
        // Then update steps
        switchMap(() =>
          this.approvalService.updateWorkflowSteps(
            this.editingWorkflow!.id,
            steps,
          )
        ),
      ).subscribe({
        next: () => {
          this.snackBar.open("Workflow updated successfully", "Close", {
            duration: 3000,
          });
          this.showWorkflowForm = false;
          this.editingWorkflow = null;
          this.loadWorkflows();
        },
        error: (error) => {
          console.error("Error updating workflow:", error);
          this.snackBar.open("Failed to update workflow", "Close", {
            duration: 5000,
          });
        },
      });
    } else {
      // Create new workflow
      this.approvalService.createWorkflow({
        name: formValue.name,
        description: formValue.description,
        conditions: conditions,
        priority: formValue.priority,
        steps: steps,
      }).subscribe({
        next: () => {
          this.snackBar.open("Workflow created successfully", "Close", {
            duration: 3000,
          });
          this.showWorkflowForm = false;
          this.loadWorkflows();
        },
        error: (error) => {
          console.error("Error creating workflow:", error);
          this.snackBar.open(
            error.message || "Failed to create workflow",
            "Close",
            { duration: 5000 },
          );
        },
      });
    }
  }

  onDeleteWorkflow(workflow: ApprovalWorkflow): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: "Delete Workflow",
        message: `Are you sure you want to delete the workflow "${workflow.name}"? This cannot be undone.`,
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
            this.snackBar.open("Workflow deleted successfully", "Close", {
              duration: 3000,
            });
            this.loadWorkflows();
          },
          error: (error) => {
            console.error("Error deleting workflow:", error);
            this.snackBar.open("Failed to delete workflow", "Close", {
              duration: 5000,
            });
          },
        });
      }
    });
  }

  onToggleActive(workflow: ApprovalWorkflow): void {
    this.approvalService.updateWorkflow(workflow.id, {
      is_active: !workflow.is_active,
    }).subscribe({
      next: () => {
        this.snackBar.open(
          `Workflow ${
            !workflow.is_active ? "activated" : "deactivated"
          } successfully`,
          "Close",
          { duration: 3000 },
        );
        this.loadWorkflows();
      },
      error: (error) => {
        console.error("Error toggling workflow:", error);
        this.snackBar.open("Failed to update workflow", "Close", {
          duration: 5000,
        });
      },
    });
  }

  formatConditions(workflow: ApprovalWorkflow): string {
    const parts: string[] = [];

    if (
      workflow.conditions?.amount_min !== undefined &&
      workflow.conditions?.amount_max !== undefined
    ) {
      parts.push(
        `$${workflow.conditions.amount_min} - $${workflow.conditions.amount_max}`,
      );
    } else if (workflow.conditions?.amount_min !== undefined) {
      parts.push(`≥ $${workflow.conditions.amount_min}`);
    } else if (workflow.conditions?.amount_max !== undefined) {
      parts.push(`≤ $${workflow.conditions.amount_max}`);
    }

    if (
      workflow.conditions?.categories &&
      workflow.conditions.categories.length > 0
    ) {
      if (workflow.conditions.categories.length === 1) {
        parts.push(workflow.conditions.categories[0]);
      } else {
        parts.push(`${workflow.conditions.categories.length} categories`);
      }
    }

    return parts.length > 0 ? parts.join(", ") : "All expenses";
  }

  getStepTypeBadgeColor(stepType: string): string {
    switch (stepType) {
      case "manager":
        return "primary";
      case "role":
        return "accent";
      case "specific_user":
        return "warn";
      default:
        return "";
    }
  }

  /**
   * Validate manager assignments for workflows with manager steps
   * Returns array of warning messages
   */
  validateManagerAssignments(): string[] {
    const warnings: string[] = [];

    // Check if any steps require manager
    const hasManagerStep = this.stepsFormArray.controls.some(
      (step) => step.get("step_type")?.value === "manager",
    );

    if (!hasManagerStep) {
      return warnings; // No manager steps, no validation needed
    }

    // Check if any employees lack managers
    const employeesWithoutManagers = this.members().filter(
      (m) => m.role === "employee" && !m.manager_id && m.is_active,
    );

    if (employeesWithoutManagers.length > 0) {
      const names = employeesWithoutManagers
        .slice(0, 5)
        .map((m) => m.user?.full_name || "Unknown")
        .join(", ");

      const message =
        `${employeesWithoutManagers.length} employee(s) have no manager assigned: ${names}${
          employeesWithoutManagers.length > 5 ? ", ..." : ""
        }. Workflows with "Manager" steps will fail for these users.`;

      warnings.push(message);
    }

    // Check if workflow conditions might affect employees without managers
    const formValue = this.workflowForm.value;
    if (
      formValue.amount_min === null && formValue.amount_max === null &&
      (!formValue.categories || formValue.categories.length === 0)
    ) {
      // This workflow matches ALL expenses
      if (employeesWithoutManagers.length > 0) {
        warnings.push(
          "This workflow applies to ALL expenses. Consider assigning managers in User Management or using role-based approval steps instead.",
        );
      }
    }

    return warnings;
  }

  /**
   * Test/preview the workflow with sample inputs
   * Shows the approval chain that would be created
   */
  testWorkflow(): void {
    if (this.stepsFormArray.length === 0) {
      this.snackBar.open(
        "Add at least one step to test the workflow",
        "Close",
        { duration: 3000 },
      );
      return;
    }

    // Simulate approval chain
    const steps: {
      stepNumber: number;
      stepType: string;
      approverName: string;
      approverRole: string;
    }[] = [];

    for (let i = 0; i < this.stepsFormArray.length; i++) {
      const step = this.stepsFormArray.at(i) as FormGroup;
      const stepType = step.get("step_type")?.value;
      const approverRole = step.get("approver_role")?.value;
      const approverUserId = step.get("approver_user_id")?.value;

      let approverName = "Unknown";
      let role = "";

      switch (stepType) {
        case "manager":
          approverName = "Submitter's Manager";
          role = "Manager";
          break;
        case "role":
          if (approverRole) {
            const roleMembers = this.members().filter((m) =>
              m.role === approverRole && m.is_active
            );
            if (roleMembers.length > 0) {
              approverName = `Any ${
                approverRole.charAt(0).toUpperCase() + approverRole.slice(1)
              } (${roleMembers.length} available)`;
              role = approverRole.charAt(0).toUpperCase() +
                approverRole.slice(1);
            } else {
              approverName = `⚠️ No active ${approverRole}s found`;
              role = approverRole;
            }
          }
          break;
        case "specific_user":
          if (approverUserId) {
            const user = this.members().find((m) =>
              m.user_id === approverUserId
            );
            if (user) {
              approverName = user.user?.full_name || "Unknown User";
              role = user.role.charAt(0).toUpperCase() + user.role.slice(1);
            } else {
              approverName = "⚠️ User not found";
              role = "Unknown";
            }
          }
          break;
      }

      steps.push({
        stepNumber: i + 1,
        stepType: stepType,
        approverName: approverName,
        approverRole: role,
      });
    }

    // Estimate approval time (rough estimate: 4-24 hours per step)
    const estimatedHours = steps.length * 12; // Average 12 hours per step

    this.testResults = {
      steps: steps,
      estimatedHours: estimatedHours,
    };

    this.showTestPanel = true;
  }

  resetTest(): void {
    this.testAmount = null;
    this.testCategory = "";
    this.testResults = null;
    this.showTestPanel = false;
  }
}
