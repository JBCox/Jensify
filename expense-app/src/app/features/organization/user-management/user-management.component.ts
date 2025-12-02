import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
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
import { MatMenuModule } from '@angular/material/menu';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OrganizationService } from '../../../core/services/organization.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { OrganizationMember, Invitation, CreateInvitationDto } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { LoadingSkeleton } from '../../../shared/components/loading-skeleton/loading-skeleton';
import { EditMemberDialogComponent, EditMemberDialogData } from './edit-member-dialog.component';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { PullToRefresh } from '../../../shared/components/pull-to-refresh/pull-to-refresh';

/**
 * User Management Component
 * Allows admins to invite users, manage members, and view invitations
 */
@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
    MatDialogModule,
    MatMenuModule,
    EmptyState,
    LoadingSkeleton,
    PullToRefresh
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

  // Filter signals - Members
  memberRoleFilter = signal<string>('all');
  memberStatusFilter = signal<string>('all');
  memberSearchQuery = signal<string>('');

  // Filter signals - Invitations
  invitationStatusFilter = signal<string>('all');
  invitationSearchQuery = signal<string>('');

  // Filtered computed values
  filteredMembers = computed(() => {
    let result = this.members();

    // Filter by role
    if (this.memberRoleFilter() !== 'all') {
      result = result.filter(m => m.role === this.memberRoleFilter());
    }

    // Filter by status
    if (this.memberStatusFilter() === 'active') {
      result = result.filter(m => m.is_active);
    } else if (this.memberStatusFilter() === 'inactive') {
      result = result.filter(m => !m.is_active);
    }

    // Filter by search
    const query = this.memberSearchQuery().toLowerCase();
    if (query) {
      result = result.filter(m =>
        m.user?.full_name?.toLowerCase().includes(query) ||
        m.user?.email?.toLowerCase().includes(query) ||
        m.department?.toLowerCase().includes(query)
      );
    }

    return result;
  });

  filteredInvitations = computed(() => {
    let result = this.invitations();

    // Filter by status
    if (this.invitationStatusFilter() !== 'all') {
      result = result.filter(inv => inv.status === this.invitationStatusFilter());
    }

    // Filter by search
    const query = this.invitationSearchQuery().toLowerCase();
    if (query) {
      result = result.filter(inv =>
        inv.email.toLowerCase().includes(query)
      );
    }

    return result;
  });

  // UI State
  isLoading = signal(false);
  selectedTabIndex = 0;
  refreshing = signal(false);

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
   * Handle pull-to-refresh
   */
  onRefresh(): void {
    this.refreshing.set(true);
    this.loadData();
    setTimeout(() => this.refreshing.set(false), 1000);
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
          // Include: managers, admins, and finance users with can_manage_expenses flag
          this.managers.set(members.filter(m =>
            m.is_active && (
              m.role === UserRole.MANAGER ||
              m.role === UserRole.ADMIN ||
              (m.role === UserRole.FINANCE && m.can_manage_expenses)
            )
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
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Deactivate Member',
        message: `Are you sure you want to deactivate ${member.user?.full_name || member.user_id}? They will lose access to the organization.`,
        confirmText: 'Deactivate',
        cancelText: 'Cancel',
        confirmColor: 'warn',
        icon: 'person_off',
        iconColor: '#f44336',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
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
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Revoke Invitation',
        message: `Are you sure you want to revoke the invitation for ${invitation.email}? This action cannot be undone.`,
        confirmText: 'Revoke',
        cancelText: 'Cancel',
        confirmColor: 'warn',
        icon: 'cancel',
        iconColor: '#f44336',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
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

  /**
   * Clear member filters
   */
  clearMemberFilters(): void {
    this.memberRoleFilter.set('all');
    this.memberStatusFilter.set('all');
    this.memberSearchQuery.set('');
  }

  /**
   * Clear invitation filters
   */
  clearInvitationFilters(): void {
    this.invitationStatusFilter.set('all');
    this.invitationSearchQuery.set('');
  }

  /**
   * Edit member details
   */
  editMember(member: OrganizationMember): void {
    const dialogData: EditMemberDialogData = {
      member,
      managers: this.managers()
    };

    const dialogRef = this.dialog.open(EditMemberDialogComponent, {
      width: '450px',
      data: dialogData
    });

    dialogRef.afterClosed()
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        if (result) {
          this.organizationService.updateOrganizationMember(member.id, result)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                this.notificationService.showSuccess('Member updated successfully');
                this.loadMembers();
              },
              error: () => {
                this.notificationService.showError('Failed to update member');
              }
            });
        }
      });
  }
}
