import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { OrganizationMember } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';

export interface EditMemberDialogData {
  member: OrganizationMember;
  managers: OrganizationMember[];
}

@Component({
  selector: 'app-edit-member-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule
  ],
  template: `
    <h2 mat-dialog-title>Edit Member</h2>
    <mat-dialog-content>
      <div class="member-info">
        <div class="avatar">{{ getInitial() }}</div>
        <div class="details">
          <div class="name">{{ data.member.user?.full_name || 'Unknown User' }}</div>
          <div class="email">{{ data.member.user?.email }}</div>
        </div>
      </div>

      <form [formGroup]="form" class="edit-form">
        <mat-form-field appearance="outline">
          <mat-label>Role</mat-label>
          <mat-select formControlName="role">
            @for (role of roleOptions; track role.value) {
              <mat-option [value]="role.value">{{ role.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Department</mat-label>
          <input matInput formControlName="department">
        </mat-form-field>

        <mat-form-field appearance="outline">
          <mat-label>Manager</mat-label>
          <mat-select formControlName="manager_id">
            <mat-option [value]="null">None</mat-option>
            @for (manager of data.managers; track manager.id) {
              @if (manager.id !== data.member.id) {
                <mat-option [value]="manager.user_id">
                  {{ manager.user?.full_name }} ({{ manager.role }})
                </mat-option>
              }
            }
          </mat-select>
        </mat-form-field>

        @if (showManagerRightsToggle()) {
          <div class="manager-rights-toggle">
            <mat-slide-toggle formControlName="can_manage_expenses" color="primary">
              <div class="toggle-content">
                <span class="toggle-label">Can Manage Expenses</span>
                <span class="toggle-hint">Allow employees to report to this finance user for expense approvals</span>
              </div>
            </mat-slide-toggle>
          </div>
        }

        @if (showFinanceAccessToggle()) {
          <div class="manager-rights-toggle">
            <mat-slide-toggle formControlName="can_access_finance" color="primary">
              <div class="toggle-content">
                <span class="toggle-label">Can Access Finance Dashboard</span>
                <span class="toggle-hint">Allow this manager to view finance data and process payouts</span>
              </div>
            </mat-slide-toggle>
          </div>
        }
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="form.invalid || isLoading()"
        (click)="save()">
        @if (isLoading()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          Save Changes
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .member-info {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: var(--jensify-surface-soft, #f5f5f5);
      border-radius: var(--jensify-radius-md, 8px);
      margin-bottom: 1.5rem;

      :host-context(.dark) & {
        background: rgba(255, 255, 255, 0.05);
      }
    }

    .avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--jensify-primary-soft);
      color: var(--jensify-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 1.25rem;
    }

    .details {
      .name {
        font-weight: 600;
        color: var(--jensify-text-strong);
        font-size: 1rem;

        :host-context(.dark) & {
          color: #fff;
        }
      }

      .email {
        font-size: 0.875rem;
        color: var(--jensify-text-muted);
      }
    }

    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 350px;
    }

    mat-dialog-content {
      padding-top: 0.5rem !important;
    }

    mat-dialog-actions {
      padding: 1rem 1.5rem !important;
    }

    .manager-rights-toggle {
      padding: 1rem;
      background: var(--jensify-surface-soft, #f5f5f5);
      border-radius: var(--jensify-radius-md, 8px);
      margin-top: 0.5rem;

      :host-context(.dark) & {
        background: rgba(255, 255, 255, 0.05);
      }
    }

    .toggle-content {
      display: flex;
      flex-direction: column;
      margin-left: 0.5rem;
    }

    .toggle-label {
      font-weight: 500;
      color: var(--jensify-text-strong);

      :host-context(.dark) & {
        color: #fff;
      }
    }

    .toggle-hint {
      font-size: 0.75rem;
      color: var(--jensify-text-muted);
      margin-top: 0.125rem;
    }
  `]
})
export class EditMemberDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<EditMemberDialogComponent>);
  data = inject<EditMemberDialogData>(MAT_DIALOG_DATA);

  form: FormGroup;
  isLoading = signal(false);
  selectedRole = signal<UserRole>(this.data.member.role);

  // Show manager rights toggle only for finance users
  showManagerRightsToggle = computed(() => this.selectedRole() === UserRole.FINANCE);

  // Show finance access toggle only for managers
  showFinanceAccessToggle = computed(() => this.selectedRole() === UserRole.MANAGER);

  roleOptions = [
    { value: UserRole.EMPLOYEE, label: 'Employee' },
    { value: UserRole.MANAGER, label: 'Manager' },
    { value: UserRole.FINANCE, label: 'Finance' },
    { value: UserRole.ADMIN, label: 'Admin' }
  ];

  constructor() {
    this.form = this.fb.group({
      role: [this.data.member.role, Validators.required],
      department: [this.data.member.department || ''],
      manager_id: [this.data.member.manager_id || null],
      can_manage_expenses: [this.data.member.can_manage_expenses || false],
      can_access_finance: [this.data.member.can_access_finance || false]
    });

    // Update selectedRole when role changes
    this.form.get('role')?.valueChanges.subscribe(role => {
      this.selectedRole.set(role);
      // Reset role-specific flags when role changes
      if (role !== UserRole.FINANCE) {
        this.form.patchValue({ can_manage_expenses: false });
      }
      if (role !== UserRole.MANAGER) {
        this.form.patchValue({ can_access_finance: false });
      }
    });
  }

  getInitial(): string {
    const name = this.data.member.user?.full_name || 'U';
    return name.charAt(0).toUpperCase();
  }

  save(): void {
    if (this.form.invalid) return;

    this.dialogRef.close({
      role: this.form.value.role,
      department: this.form.value.department || null,
      manager_id: this.form.value.manager_id || null,
      can_manage_expenses: this.form.value.role === UserRole.FINANCE ? this.form.value.can_manage_expenses : false,
      can_access_finance: this.form.value.role === UserRole.MANAGER ? this.form.value.can_access_finance : false
    });
  }
}
