import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { UserManagementComponent } from './user-management.component';
import { OrganizationService } from '../../../core/services/organization.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { OrganizationMember, Invitation } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let organizationServiceMock: jasmine.SpyObj<OrganizationService>;
  let invitationServiceMock: jasmine.SpyObj<InvitationService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;

  const createMockMember = (overrides: Partial<OrganizationMember> = {}): OrganizationMember => ({
    id: 'member-' + Math.random().toString(36).substr(2, 9),
    organization_id: 'org-123',
    user_id: 'user-' + Math.random().toString(36).substr(2, 9),
    role: UserRole.EMPLOYEE,
    is_active: true,
    joined_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      full_name: 'Test User',
      role: UserRole.EMPLOYEE,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    },
    ...overrides
  });

  // Create mock members for testing manager dropdown filtering
  const mockEmployee: OrganizationMember = createMockMember({
    id: 'member-employee',
    role: UserRole.EMPLOYEE
  });

  const mockManager: OrganizationMember = createMockMember({
    id: 'member-manager',
    role: UserRole.MANAGER,
    user: { id: 'user-manager', email: 'manager@example.com', full_name: 'Manager User', role: UserRole.MANAGER, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
  });

  const mockAdmin: OrganizationMember = createMockMember({
    id: 'member-admin',
    role: UserRole.ADMIN,
    user: { id: 'user-admin', email: 'admin@example.com', full_name: 'Admin User', role: UserRole.ADMIN, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
  });

  const mockFinanceNoManagerRights: OrganizationMember = createMockMember({
    id: 'member-finance-no-rights',
    role: UserRole.FINANCE,
    can_manage_expenses: false,
    user: { id: 'user-finance-no', email: 'finance-no@example.com', full_name: 'Finance NoRights', role: UserRole.FINANCE, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
  });

  const mockFinanceWithManagerRights: OrganizationMember = createMockMember({
    id: 'member-finance-with-rights',
    role: UserRole.FINANCE,
    can_manage_expenses: true,
    user: { id: 'user-finance-yes', email: 'finance-yes@example.com', full_name: 'Finance WithRights', role: UserRole.FINANCE, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' }
  });

  const mockMembers: OrganizationMember[] = [
    mockEmployee,
    mockManager,
    mockAdmin,
    mockFinanceNoManagerRights,
    mockFinanceWithManagerRights
  ];

  beforeEach(async () => {
    organizationServiceMock = jasmine.createSpyObj('OrganizationService', [
      'getOrganizationMembers',
      'updateOrganizationMember',
      'deactivateMember',
      'reactivateMember'
    ], {
      currentOrganizationId: 'org-123'
    });

    invitationServiceMock = jasmine.createSpyObj('InvitationService', [
      'getOrganizationInvitations',
      'createInvitation',
      'resendInvitation',
      'revokeInvitation',
      'getInvitationLink'
    ]);

    notificationServiceMock = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    // Default return values
    organizationServiceMock.getOrganizationMembers.and.returnValue(of(mockMembers));
    invitationServiceMock.getOrganizationInvitations.and.returnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [
        UserManagementComponent,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: OrganizationService, useValue: organizationServiceMock },
        { provide: InvitationService, useValue: invitationServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Manager Dropdown Filtering', () => {
    it('should include managers in manager dropdown', fakeAsync(() => {
      component.loadMembers();
      tick();

      const managers = component.managers();
      const managerIds = managers.map(m => m.id);

      expect(managerIds).toContain('member-manager');
    }));

    it('should include admins in manager dropdown', fakeAsync(() => {
      component.loadMembers();
      tick();

      const managers = component.managers();
      const managerIds = managers.map(m => m.id);

      expect(managerIds).toContain('member-admin');
    }));

    it('should include finance users with can_manage_expenses in manager dropdown', fakeAsync(() => {
      component.loadMembers();
      tick();

      const managers = component.managers();
      const managerIds = managers.map(m => m.id);

      expect(managerIds).toContain('member-finance-with-rights');
    }));

    it('should NOT include finance users without can_manage_expenses in manager dropdown', fakeAsync(() => {
      component.loadMembers();
      tick();

      const managers = component.managers();
      const managerIds = managers.map(m => m.id);

      expect(managerIds).not.toContain('member-finance-no-rights');
    }));

    it('should NOT include regular employees in manager dropdown', fakeAsync(() => {
      component.loadMembers();
      tick();

      const managers = component.managers();
      const managerIds = managers.map(m => m.id);

      expect(managerIds).not.toContain('member-employee');
    }));

    it('should only include active members in manager dropdown', fakeAsync(() => {
      const inactiveManager = createMockMember({
        id: 'member-inactive-manager',
        role: UserRole.MANAGER,
        is_active: false
      });

      organizationServiceMock.getOrganizationMembers.and.returnValue(
        of([...mockMembers, inactiveManager])
      );

      component.loadMembers();
      tick();

      const managers = component.managers();
      const managerIds = managers.map(m => m.id);

      expect(managerIds).not.toContain('member-inactive-manager');
    }));
  });

  describe('Member Filtering', () => {
    it('should filter members by role', fakeAsync(() => {
      component.loadMembers();
      tick();

      component.memberRoleFilter.set(UserRole.MANAGER);

      const filtered = component.filteredMembers();
      expect(filtered.length).toBe(1);
      expect(filtered[0].role).toBe(UserRole.MANAGER);
    }));

    it('should filter members by active status', fakeAsync(() => {
      const inactiveMember = createMockMember({ is_active: false });
      organizationServiceMock.getOrganizationMembers.and.returnValue(
        of([...mockMembers, inactiveMember])
      );

      component.loadMembers();
      tick();

      component.memberStatusFilter.set('inactive');

      const filtered = component.filteredMembers();
      expect(filtered.every(m => !m.is_active)).toBe(true);
    }));

    it('should filter members by search query', fakeAsync(() => {
      component.loadMembers();
      tick();

      component.memberSearchQuery.set('manager');

      const filtered = component.filteredMembers();
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.some(m => m.user?.full_name?.toLowerCase().includes('manager'))).toBe(true);
    }));

    it('should clear filters correctly', fakeAsync(() => {
      component.loadMembers();
      tick();

      // Set filters
      component.memberRoleFilter.set(UserRole.MANAGER);
      component.memberStatusFilter.set('active');
      component.memberSearchQuery.set('test');

      // Clear filters
      component.clearMemberFilters();

      expect(component.memberRoleFilter()).toBe('all');
      expect(component.memberStatusFilter()).toBe('all');
      expect(component.memberSearchQuery()).toBe('');
    }));
  });

  describe('Member Counts', () => {
    it('should count active members correctly', fakeAsync(() => {
      component.loadMembers();
      tick();

      // All mock members are active by default
      expect(component.activeMemberCount()).toBe(mockMembers.length);
    }));

    it('should count inactive members correctly', fakeAsync(() => {
      const membersWithInactive = [
        ...mockMembers,
        createMockMember({ is_active: false })
      ];

      organizationServiceMock.getOrganizationMembers.and.returnValue(of(membersWithInactive));
      component.loadMembers();
      tick();

      expect(component.inactiveMemberCount()).toBe(1);
    }));
  });

  describe('Error Handling', () => {
    it('should show error notification when loading members fails', fakeAsync(() => {
      organizationServiceMock.getOrganizationMembers.and.returnValue(
        throwError(() => new Error('Failed to load'))
      );

      component.loadMembers();
      tick();

      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to load members');
    }));

    it('should show error notification when loading invitations fails', fakeAsync(() => {
      invitationServiceMock.getOrganizationInvitations.and.returnValue(
        throwError(() => new Error('Failed to load'))
      );

      component.loadInvitations();
      tick();

      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to load invitations');
    }));
  });

  describe('Role Chip Classes', () => {
    it('should return correct class for admin role', () => {
      expect(component.getRoleChipClass(UserRole.ADMIN)).toBe('chip-admin');
    });

    it('should return correct class for finance role', () => {
      expect(component.getRoleChipClass(UserRole.FINANCE)).toBe('chip-finance');
    });

    it('should return correct class for manager role', () => {
      expect(component.getRoleChipClass(UserRole.MANAGER)).toBe('chip-manager');
    });

    it('should return correct class for employee role', () => {
      expect(component.getRoleChipClass(UserRole.EMPLOYEE)).toBe('chip-employee');
    });
  });

  describe('Invite Form Validation', () => {
    it('should require email field', () => {
      component.inviteForm.patchValue({ email: '' });
      expect(component.inviteForm.get('email')?.errors?.['required']).toBeTruthy();
    });

    it('should validate email format', () => {
      component.inviteForm.patchValue({ email: 'invalid-email' });
      expect(component.inviteForm.get('email')?.errors?.['email']).toBeTruthy();
    });

    it('should accept valid email', () => {
      component.inviteForm.patchValue({ email: 'valid@example.com' });
      expect(component.inviteForm.get('email')?.errors).toBeNull();
    });

    it('should require role field', () => {
      component.inviteForm.patchValue({ role: null });
      expect(component.inviteForm.get('role')?.errors?.['required']).toBeTruthy();
    });
  });
});
