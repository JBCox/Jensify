import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OrganizationService } from '../../../core/services/organization.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { OrganizationMember, Invitation, CreateInvitationDto } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';

/**
 * User Management Component
 * Allows admins to invite users, manage members, and view invitations
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTabsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDialogModule
  ],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.scss']
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserManagementComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private invitationService = inject(InvitationService);
  private notificationService = inject(NotificationService);
  private dialog = inject(MatDialog);

  // Cleanup
  private destroy$ = new Subject<void>();

  // Form for inviting single user
  inviteForm: FormGroup;

  // Data
  members = signal<OrganizationMember[]>([]);
  invitations = signal<Invitation[]>([]);
  managers = signal<OrganizationMember[]>([]);
  activeMemberCount = computed(() => this.members().filter(member => member.is_active).length);
  inactiveMemberCount = computed(() => this.members().filter(member => !member.is_active).length);
  pendingInvitationCount = computed(() => this.invitations().filter(invite => invite.status === 'pending').length);

  // UI State
  isLoading = signal(false);
  selectedTabIndex = signal(0);

  // Table columns
  memberColumns = ['user', 'role', 'department', 'status', 'actions'];
  invitationColumns = ['email', 'role', 'status', 'created', 'actions'];

  // Role options
  roleOptions = [
    { value: UserRole.EMPLOYEE, label: 'Employee' },
    { value: UserRole.MANAGER, label: 'Manager' },
    { value: UserRole.FINANCE, label: 'Finance' },
    { value: UserRole.ADMIN, label: 'Admin' }
  ];

  constructor() {
    this.inviteForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      role: [UserRole.EMPLOYEE, Validators.required],
      department: [''],
      manager_id: ['']
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load all data (members and invitations)
   */
  loadData(): void {
    this.loadMembers();
    this.loadInvitations();
  }

  /**
   * Load organization members
   */
  loadMembers(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) return;

    this.isLoading.set(true);
    this.organizationService.getOrganizationMembers(orgId, false)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (members) => {
          this.members.set(members);
          // Filter managers for the dropdown
          this.managers.set(members.filter(m =>
            (m.role === UserRole.MANAGER || m.role === UserRole.ADMIN) && m.is_active
          ));
          this.isLoading.set(false);
        },
        error: () => {
          this.notificationService.showError('Failed to load members');
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Load pending invitations
   */
  loadInvitations(): void {
    this.invitationService.getOrganizationInvitations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invitations) => {
          this.invitations.set(invitations);
        },
        error: () => {
          this.notificationService.showError('Failed to load invitations');
        }
      });
  }

  /**
   * Invite a new user
   */
  inviteUser(): void {
    if (this.inviteForm.invalid) {
      this.inviteForm.markAllAsTouched();
      return;
    }

    const dto: CreateInvitationDto = {
      email: this.inviteForm.value.email.toLowerCase(),
      role: this.inviteForm.value.role,
      department: this.inviteForm.value.department || undefined,
      manager_id: this.inviteForm.value.manager_id || undefined
    };

    this.isLoading.set(true);
    this.invitationService.createInvitation(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invitation) => {
          this.isLoading.set(false);
          this.inviteForm.reset({ role: UserRole.EMPLOYEE });
          this.loadInvitations();
          this.notificationService.showSuccess(
            `Invitation sent to ${invitation.email}`
          );
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.showError(
            error.message || 'Failed to send invitation'
          );
        }
      });
  }

  /**
   * Update member role
   */
  updateMemberRole(member: OrganizationMember, newRole: UserRole): void {
    this.organizationService.updateOrganizationMember(member.id, {
      role: newRole
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadMembers();
        },
        error: () => {
          this.notificationService.showError('Failed to update member role');
        }
      });
  }

  /**
   * Deactivate member
   */
  deactivateMember(member: OrganizationMember): void {
    if (!confirm(`Deactivate ${member.user?.full_name || member.user_id}?`)) {
      return;
    }

    this.organizationService.deactivateMember(member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadMembers();
        },
        error: () => {
          this.notificationService.showError('Failed to deactivate member');
        }
      });
  }

  /**
   * Reactivate member
   */
  reactivateMember(member: OrganizationMember): void {
    this.organizationService.reactivateMember(member.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadMembers();
        },
        error: () => {
          this.notificationService.showError('Failed to reactivate member');
        }
      });
  }

  /**
   * Resend invitation
   */
  resendInvitation(invitation: Invitation): void {
    this.invitationService.resendInvitation(invitation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notificationService.showSuccess('Invitation resent');
        },
        error: () => {
          this.notificationService.showError('Failed to resend invitation');
        }
      });
  }

  /**
   * Revoke invitation
   */
  revokeInvitation(invitation: Invitation): void {
    if (!confirm(`Revoke invitation for ${invitation.email}?`)) {
      return;
    }

    this.invitationService.revokeInvitation(invitation.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadInvitations();
        },
        error: () => {
          this.notificationService.showError('Failed to revoke invitation');
        }
      });
  }

  /**
   * Map organization roles to Jensify chip classes
   */
  getRoleChipClass(role: string): string {
    switch (role) {
      case UserRole.ADMIN:
        return 'chip-admin';
      case UserRole.FINANCE:
        return 'chip-finance';
      case UserRole.MANAGER:
        return 'chip-manager';
      default:
        return 'chip-employee';
    }
  }

  /**
   * Map invitation statuses to chip classes
   */
  getStatusChipClass(status: string): string {
    switch (status) {
      case 'pending':
        return 'chip-pending';
      case 'accepted':
        return 'chip-accepted';
      case 'expired':
        return 'chip-expired';
      case 'revoked':
        return 'chip-revoked';
      default:
        return '';
    }
  }

  /**
   * Get field error message
   */
  getFieldError(fieldName: string): string {
    const field = this.inviteForm.get(fieldName);
    if (!field || !field.errors || !field.touched) {
      return '';
    }

    if (field.errors['required']) {
      return 'This field is required';
    }
    if (field.errors['email']) {
      return 'Please enter a valid email address';
    }

    return 'Invalid value';
  }

  /**
   * Copy invitation link to clipboard
   */
  copyInvitationLink(invitation: Invitation): void {
    const link = this.invitationService.getInvitationLink(invitation.token);
    navigator.clipboard.writeText(link).then(() => {
      this.notificationService.showSuccess('Invitation link copied to clipboard');
    });
  }
}
