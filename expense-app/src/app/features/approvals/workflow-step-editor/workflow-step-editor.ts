import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatTooltipModule } from "@angular/material/tooltip";
import { OrganizationMember } from "../../../core/models/organization.model";

export interface StepType {
  value: string;
  label: string;
  description: string;
}

export interface ApproverRole {
  value: string;
  label: string;
}

@Component({
  selector: "app-workflow-step-editor",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <mat-card class="step-card" [formGroup]="stepForm">
      <mat-card-header>
        <div class="step-header">
          <div class="step-number">Step {{stepIndex + 1}}</div>
          <div class="step-actions">
            <button mat-icon-button type="button" (click)="moveUp.emit()" [disabled]="isFirst" matTooltip="Move Up">
              <mat-icon>arrow_upward</mat-icon>
            </button>
            <button mat-icon-button type="button" (click)="moveDown.emit()" [disabled]="isLast" matTooltip="Move Down">
              <mat-icon>arrow_downward</mat-icon>
            </button>
            <button mat-icon-button type="button" (click)="remove.emit()" [disabled]="isOnlyStep" color="warn" matTooltip="Remove Step">
              <mat-icon>delete</mat-icon>
            </button>
          </div>
        </div>
      </mat-card-header>
      <mat-card-content>
        <div class="step-form">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Step Type</mat-label>
            <mat-select formControlName="step_type" required>
              @for (type of stepTypes; track type.value) {
                <mat-option [value]="type.value">
                  <div class="step-type-option">
                    <strong>{{type.label}}</strong>
                    <span class="option-desc">{{type.description}}</span>
                  </div>
                </mat-option>
              }
            </mat-select>
            <mat-hint>How should the approver be determined?</mat-hint>
          </mat-form-field>

          <!-- Show role selector if step_type is 'role' -->
          @if (stepForm.get('step_type')?.value === 'role') {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Approver Role</mat-label>
              <mat-select formControlName="approver_role" required>
                @for (role of approverRoles; track role.value) {
                  <mat-option [value]="role.value">{{role.label}}</mat-option>
                }
              </mat-select>
              <mat-icon matPrefix>badge</mat-icon>
              <mat-hint>Any active user with this role can approve</mat-hint>
            </mat-form-field>
          }

          <!-- Show user selector if step_type is 'specific_user' -->
          @if (stepForm.get('step_type')?.value === 'specific_user') {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Specific User</mat-label>
              <mat-select formControlName="approver_user_id" required>
                @for (member of managersAndAbove; track member.user_id) {
                  <mat-option [value]="member.user_id">
                    {{member.user?.full_name}} ({{member.role}})
                  </mat-option>
                }
              </mat-select>
              <mat-icon matPrefix>person</mat-icon>
              <mat-hint>Specific user who must approve</mat-hint>
            </mat-form-field>
          }

          <!-- Preview -->
          <div class="step-preview">
            <mat-icon>arrow_forward</mat-icon>
            <span>Will route to: <strong>{{stepDescription}}</strong></span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .step-card {
      margin-bottom: 16px;
      border-left: 4px solid var(--jensify-primary, #FF5900);
    }

    .step-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
    }

    .step-number {
      font-weight: 600;
      font-size: 14px;
      color: var(--jensify-primary, #FF5900);
    }

    .step-actions {
      display: flex;
      gap: 4px;
    }

    .step-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding-top: 8px;
    }

    .full-width {
      width: 100%;
    }

    .step-type-option {
      display: flex;
      flex-direction: column;
      line-height: 1.3;
    }

    .option-desc {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.54);
    }

    .step-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.04);
      border-radius: 8px;
      color: rgba(0, 0, 0, 0.7);
    }

    .step-preview mat-icon {
      color: var(--jensify-primary, #FF5900);
    }
  `],
})
export class WorkflowStepEditorComponent {
  @Input() stepForm!: FormGroup;
  @Input() stepIndex = 0;
  @Input() isFirst = false;
  @Input() isLast = false;
  @Input() isOnlyStep = false;
  @Input() stepTypes: StepType[] = [];
  @Input() approverRoles: ApproverRole[] = [];
  @Input() managersAndAbove: OrganizationMember[] = [];
  @Input() allMembers: OrganizationMember[] = [];

  @Output() moveUp = new EventEmitter<void>();
  @Output() moveDown = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  get stepDescription(): string {
    const stepType = this.stepForm.get("step_type")?.value;
    const approverRole = this.stepForm.get("approver_role")?.value;
    const approverUserId = this.stepForm.get("approver_user_id")?.value;

    switch (stepType) {
      case "manager":
        return "Submitter's Manager";
      case "role":
        return approverRole
          ? `Any ${approverRole.charAt(0).toUpperCase() + approverRole.slice(1)}`
          : "Role not set";
      case "specific_user":
        if (approverUserId) {
          const user = this.allMembers.find((m) => m.user_id === approverUserId);
          return user?.user?.full_name || "User not found";
        }
        return "User not selected";
      default:
        return stepType || "Not configured";
    }
  }
}
