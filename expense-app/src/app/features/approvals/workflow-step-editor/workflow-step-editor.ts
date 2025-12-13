import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { OrganizationMember } from '../../../core/models/organization.model';
import { StepTypeMetadata } from '../../../core/models/approval.model';

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
  selector: 'app-workflow-step-editor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <mat-card class="step-card" [class.payment-step]="isPaymentStep" [formGroup]="stepForm">
      <mat-card-header>
        <div class="step-header">
          <div class="step-number">
            @if (isPaymentStep) {
              <mat-icon class="payment-icon">payments</mat-icon>
            }
            Step {{ stepIndex + 1 }}
            @if (isPaymentStep) {
              <span class="payment-badge">Payment</span>
            }
          </div>
          <div class="step-actions">
            <button
              mat-icon-button
              type="button"
              (click)="moveUp.emit()"
              [disabled]="isFirst"
              matTooltip="Move Up"
            >
              <mat-icon>arrow_upward</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              (click)="moveDown.emit()"
              [disabled]="isLast || isPaymentStep"
              matTooltip="Move Down"
            >
              <mat-icon>arrow_downward</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              (click)="remove.emit()"
              [disabled]="isOnlyStep"
              color="warn"
              matTooltip="Remove Step"
            >
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
                    <mat-icon class="type-icon">{{ getStepTypeIcon(type.value) }}</mat-icon>
                    <div>
                      <strong>{{ type.label }}</strong>
                      <span class="option-desc">{{ type.description }}</span>
                    </div>
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
                  <mat-option [value]="role.value">{{ role.label }}</mat-option>
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
                @for (member of allMembers; track member.user_id) {
                  <mat-option [value]="member.user_id">
                    {{ member.user?.full_name }} ({{ member.role }})
                  </mat-option>
                }
              </mat-select>
              <mat-icon matPrefix>person</mat-icon>
              <mat-hint>Specific user who must approve</mat-hint>
            </mat-form-field>
          }

          <!-- Show manager selector if step_type is 'specific_manager' -->
          @if (stepForm.get('step_type')?.value === 'specific_manager') {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Select Manager</mat-label>
              <mat-select formControlName="approver_user_id" required>
                @for (member of managersAndAbove; track member.user_id) {
                  <mat-option [value]="member.user_id">
                    {{ member.user?.full_name }} ({{ member.role }})
                  </mat-option>
                }
              </mat-select>
              <mat-icon matPrefix>manage_accounts</mat-icon>
              <mat-hint>Specific manager who must approve</mat-hint>
            </mat-form-field>
          }

          <!-- Show multi-user selector if step_type is 'multiple_users' -->
          @if (stepForm.get('step_type')?.value === 'multiple_users') {
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Select Approvers</mat-label>
              <mat-select formControlName="approver_user_ids" multiple required>
                @for (member of managersAndAbove; track member.user_id) {
                  <mat-option [value]="member.user_id">
                    {{ member.user?.full_name }} ({{ member.role }})
                  </mat-option>
                }
              </mat-select>
              <mat-icon matPrefix>groups</mat-icon>
              <mat-hint>Any one of these users can approve</mat-hint>
            </mat-form-field>
          }

          <!-- Payment step info -->
          @if (stepForm.get('step_type')?.value === 'payment') {
            <div class="payment-info">
              <mat-icon>info</mat-icon>
              <span>
                Payment steps are processed by Finance users only. This should be the
                final step in the workflow.
              </span>
            </div>
          }

          <!-- Preview -->
          <div class="step-preview" [class.payment-preview]="isPaymentStep">
            <mat-icon>{{ isPaymentStep ? 'payments' : 'arrow_forward' }}</mat-icon>
            <span>Will route to: <strong>{{ stepDescription }}</strong></span>
          </div>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      .step-card {
        margin-bottom: 16px;
        border-left: 4px solid var(--jensify-primary, #ff5900);
      }

      .step-card.payment-step {
        border-left-color: #4caf50;
        background: linear-gradient(135deg, rgba(76, 175, 80, 0.05) 0%, transparent 100%);
      }

      .step-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
      }

      .step-number {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 14px;
        color: var(--jensify-primary, #ff5900);
      }

      .payment-icon {
        color: #4caf50;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }

      .payment-badge {
        background: #4caf50;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 500;
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
        align-items: flex-start;
        gap: 12px;
        line-height: 1.3;
        padding: 4px 0;
      }

      .step-type-option .type-icon {
        color: rgba(0, 0, 0, 0.54);
        margin-top: 2px;
      }

      .option-desc {
        display: block;
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
        color: var(--jensify-primary, #ff5900);
      }

      .step-preview.payment-preview {
        background: rgba(76, 175, 80, 0.1);
      }

      .step-preview.payment-preview mat-icon {
        color: #4caf50;
      }

      .payment-info {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 12px;
        background: rgba(76, 175, 80, 0.1);
        border-radius: 8px;
        color: #2e7d32;
        font-size: 13px;
      }

      .payment-info mat-icon {
        color: #4caf50;
        flex-shrink: 0;
      }
    `,
  ],
})
export class WorkflowStepEditorComponent {
  @Input() stepForm!: FormGroup;
  @Input() stepIndex = 0;
  @Input() isFirst = false;
  @Input() isLast = false;
  @Input() isOnlyStep = false;
  @Input() stepTypes: StepType[] = [];
  @Input() stepTypeMetadata: StepTypeMetadata[] = [];
  @Input() approverRoles: ApproverRole[] = [];
  @Input() managersAndAbove: OrganizationMember[] = [];
  @Input() allMembers: OrganizationMember[] = [];

  @Output() moveUp = new EventEmitter<void>();
  @Output() moveDown = new EventEmitter<void>();
  @Output() remove = new EventEmitter<void>();

  /** Check if current step is a payment step */
  get isPaymentStep(): boolean {
    const stepType = this.stepForm.get('step_type')?.value;
    return stepType === 'payment' || this.stepForm.get('is_payment_step')?.value === true;
  }

  /** Get icon for step type */
  getStepTypeIcon(stepType: string): string {
    const iconMap: Record<string, string> = {
      manager: 'supervisor_account',
      role: 'badge',
      specific_user: 'person',
      specific_manager: 'manage_accounts',
      multiple_users: 'groups',
      payment: 'payments',
      department_owner: 'business',
    };
    return iconMap[stepType] || 'check_circle';
  }

  get stepDescription(): string {
    const stepType = this.stepForm.get('step_type')?.value;
    const approverRole = this.stepForm.get('approver_role')?.value;
    const approverUserId = this.stepForm.get('approver_user_id')?.value;
    const approverUserIds = this.stepForm.get('approver_user_ids')?.value;

    switch (stepType) {
      case 'manager':
        return "Submitter's Manager";

      case 'role':
        return approverRole
          ? `Any ${approverRole.charAt(0).toUpperCase() + approverRole.slice(1)}`
          : 'Role not set';

      case 'specific_user':
      case 'specific_manager':
        if (approverUserId) {
          const user = this.allMembers.find((m) => m.user_id === approverUserId);
          return user?.user?.full_name || 'User not found';
        }
        return 'User not selected';

      case 'multiple_users':
        if (approverUserIds && approverUserIds.length > 0) {
          const names = approverUserIds
            .map((id: string) => {
              const member = this.allMembers.find((m) => m.user_id === id);
              return member?.user?.full_name || 'Unknown';
            })
            .slice(0, 3);
          const suffix = approverUserIds.length > 3 ? ` +${approverUserIds.length - 3} more` : '';
          return `Any of: ${names.join(', ')}${suffix}`;
        }
        return 'No users selected';

      case 'payment':
        return 'Finance (Payment Processing)';

      default:
        return stepType || 'Not configured';
    }
  }
}
