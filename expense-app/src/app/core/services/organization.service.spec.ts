import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { OrganizationService } from './organization.service';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';
import { LoggerService } from './logger.service';
import {
  Organization,
  OrganizationMember,
  OrganizationWithStats,
  UserOrganizationContext
} from '../models/organization.model';
import { UserRole } from '../models/enums';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let supabaseServiceMock: jasmine.SpyObj<SupabaseService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;
  let loggerServiceMock: jasmine.SpyObj<LoggerService>;

  const mockOrganization: Organization = {
    id: 'org-123',
    name: 'Test Organization',
    domain: 'test.com',
    settings: {
      expense_policies: {
        max_single_receipt: 1000,
        max_daily_total: 5000,
        max_receipt_age_days: 90
      },
      approval_workflow: {
        require_manager_approval: true,
        require_finance_approval: true
      }
    },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockMember: OrganizationMember = {
    id: 'member-123',
    organization_id: 'org-123',
    user_id: 'user-123',
    role: UserRole.EMPLOYEE,
    is_active: true,
    joined_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', ['client'], {
      userId: 'user-123'
    });
    const notificationSpy = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['error', 'getErrorMessage']);

    // Setup default Supabase client mock
    supabaseSpy.client = {
      rpc: jasmine.createSpy('rpc'),
      from: jasmine.createSpy('from'),
      auth: {
        getSession: jasmine.createSpy('getSession')
      }
    } as any;

    TestBed.configureTestingModule({
      providers: [
        OrganizationService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(OrganizationService);
    supabaseServiceMock = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    notificationServiceMock = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    loggerServiceMock = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // ORGANIZATION CRUD TESTS
  // ============================================================================

  describe('createOrganization', () => {
    it('should create organization with admin membership', (done) => {
      const createDto = {
        name: 'New Org',
        domain: 'neworg.com',
        settings: {}
      };

      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: mockOrganization, error: null })
      );

      service.createOrganization(createDto).subscribe({
        next: (org) => {
          expect(org).toEqual(mockOrganization);
          expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith(
            'create_organization_with_admin',
            {
              p_name: createDto.name,
              p_domain: createDto.domain,
              p_settings: createDto.settings,
              p_admin_user_id: 'user-123'
            }
          );
          expect(notificationServiceMock.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should throw error when user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceMock, 'userId', { value: null });

      service.createOrganization({ name: 'Test' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should handle creation errors', (done) => {
      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: null, error: { message: 'Creation failed' } })
      );

      loggerServiceMock.getErrorMessage.and.returnValue('Creation failed');

      service.createOrganization({ name: 'Test' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(loggerServiceMock.error).toHaveBeenCalled();
          expect(notificationServiceMock.showError).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('getOrganizationById', () => {
    it('should fetch organization by ID', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(
              Promise.resolve({ data: mockOrganization, error: null })
            )
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getOrganizationById('org-123').subscribe({
        next: (org) => {
          expect(org).toEqual(mockOrganization);
          expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('organizations');
          done();
        },
        error: done.fail
      });
    });

    it('should handle organization not found', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(
              Promise.resolve({ data: null, error: null })
            )
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);
      loggerServiceMock.getErrorMessage.and.returnValue('Organization not found');

      service.getOrganizationById('invalid-id').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toBe('Organization not found');
          done();
        }
      });
    });
  });

  describe('updateOrganization', () => {
    it('should update organization and refresh current context', (done) => {
      const updateDto = { name: 'Updated Name' };
      const updatedOrg = { ...mockOrganization, name: 'Updated Name' };

      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(
                Promise.resolve({ data: updatedOrg, error: null })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      // Set current organization
      service.setCurrentOrganization(mockOrganization, mockMember);

      service.updateOrganization('org-123', updateDto).subscribe({
        next: (org) => {
          expect(org.name).toBe('Updated Name');
          expect(notificationServiceMock.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // ORGANIZATION MEMBERS TESTS
  // ============================================================================

  describe('getOrganizationMembers', () => {
    it('should fetch active members only by default', (done) => {
      const mockMembers: OrganizationMember[] = [mockMember];

      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake((field: string) => {
            if (field === 'organization_id') {
              return {
                eq: jasmine.createSpy('eq').and.returnValue({
                  order: jasmine.createSpy('order').and.returnValue(
                    Promise.resolve({ data: mockMembers, error: null })
                  )
                })
              };
            }
            return mockQuery;
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getOrganizationMembers('org-123').subscribe({
        next: (members) => {
          expect(members).toEqual(mockMembers);
          done();
        },
        error: done.fail
      });
    });

    it('should fetch all members when activeOnly is false', (done) => {
      const mockMembers: OrganizationMember[] = [
        mockMember,
        { ...mockMember, id: 'member-456', is_active: false }
      ];

      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(
              Promise.resolve({ data: mockMembers, error: null })
            )
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getOrganizationMembers('org-123', false).subscribe({
        next: (members) => {
          expect(members.length).toBe(2);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('updateOrganizationMember', () => {
    it('should update member role', (done) => {
      const updateDto = { role: UserRole.MANAGER };
      const updatedMember = { ...mockMember, role: UserRole.MANAGER };

      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(
                Promise.resolve({ data: updatedMember, error: null })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.updateOrganizationMember('member-123', updateDto).subscribe({
        next: (member) => {
          expect(member.role).toBe(UserRole.MANAGER);
          expect(notificationServiceMock.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deactivateMember / reactivateMember', () => {
    it('should deactivate member', (done) => {
      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(
            Promise.resolve({ error: null })
          )
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.deactivateMember('member-123').subscribe({
        next: () => {
          expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Member deactivated');
          done();
        },
        error: done.fail
      });
    });

    it('should reactivate member', (done) => {
      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(
            Promise.resolve({ error: null })
          )
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.reactivateMember('member-123').subscribe({
        next: () => {
          expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Member reactivated');
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // USER ORGANIZATION CONTEXT TESTS
  // ============================================================================

  describe('getUserOrganizations', () => {
    it('should fetch all active organizations for user', (done) => {
      const mockData = [
        { organization: mockOrganization }
      ];

      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ data: mockData, error: null })
            )
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getUserOrganizations().subscribe({
        next: (orgs) => {
          expect(orgs.length).toBe(1);
          expect(orgs[0]).toEqual(mockOrganization);
          done();
        },
        error: done.fail
      });
    });

    it('should throw error when user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceMock, 'userId', { value: null });

      service.getUserOrganizations().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getUserOrganizationContext', () => {
    it('should fetch full user context', (done) => {
      const mockContext: UserOrganizationContext = {
        user_id: 'user-123',
        organizations: [mockOrganization],
        memberships: [mockMember],
        current_organization: mockOrganization,
        current_membership: mockMember
      };

      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: [mockContext], error: null })
      );

      service.getUserOrganizationContext().subscribe({
        next: (context) => {
          expect(context).toEqual(mockContext);
          done();
        },
        error: done.fail
      });
    });

    it('should return null when user has no organizations', (done) => {
      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: [], error: null })
      );

      service.getUserOrganizationContext().subscribe({
        next: (context) => {
          expect(context).toBeNull();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('setCurrentOrganization', () => {
    it('should set current organization and save to localStorage', () => {
      spyOn(localStorage, 'setItem');

      service.setCurrentOrganization(mockOrganization, mockMember);

      expect(localStorage.setItem).toHaveBeenCalledWith('current_organization_id', 'org-123');

      service.currentOrganization$.subscribe(org => {
        expect(org).toEqual(mockOrganization);
      });

      service.currentMembership$.subscribe(member => {
        expect(member).toEqual(mockMember);
      });
    });
  });

  describe('clearCurrentOrganization', () => {
    it('should clear organization context and localStorage', () => {
      spyOn(localStorage, 'removeItem');

      service.setCurrentOrganization(mockOrganization, mockMember);
      service.clearCurrentOrganization();

      expect(localStorage.removeItem).toHaveBeenCalledWith('current_organization_id');

      service.currentOrganization$.subscribe(org => {
        expect(org).toBeNull();
      });
    });
  });

  // ============================================================================
  // ROLE HIERARCHY TESTS (Critical for Multi-Tenancy)
  // ============================================================================

  describe('hasRole', () => {
    it('should return true for exact role match', () => {
      service.setCurrentOrganization(mockOrganization, mockMember);
      expect(service.hasRole(UserRole.EMPLOYEE)).toBe(true);
    });

    it('should return true for higher role (manager >= employee)', () => {
      const managerMember = { ...mockMember, role: UserRole.MANAGER };
      service.setCurrentOrganization(mockOrganization, managerMember);
      expect(service.hasRole(UserRole.EMPLOYEE)).toBe(true);
      expect(service.hasRole(UserRole.MANAGER)).toBe(true);
    });

    it('should return false for lower role (employee < manager)', () => {
      service.setCurrentOrganization(mockOrganization, mockMember);
      expect(service.hasRole(UserRole.MANAGER)).toBe(false);
      expect(service.hasRole(UserRole.FINANCE)).toBe(false);
      expect(service.hasRole(UserRole.ADMIN)).toBe(false);
    });

    it('should return true for admin (highest role)', () => {
      const adminMember = { ...mockMember, role: UserRole.ADMIN };
      service.setCurrentOrganization(mockOrganization, adminMember);
      expect(service.hasRole(UserRole.EMPLOYEE)).toBe(true);
      expect(service.hasRole(UserRole.FINANCE)).toBe(true);
      expect(service.hasRole(UserRole.MANAGER)).toBe(true);
      expect(service.hasRole(UserRole.ADMIN)).toBe(true);
    });

    it('should return false when no membership set', () => {
      expect(service.hasRole(UserRole.EMPLOYEE)).toBe(false);
    });
  });

  describe('isCurrentUserAdmin', () => {
    it('should return true for admin role', () => {
      const adminMember = { ...mockMember, role: UserRole.ADMIN };
      service.setCurrentOrganization(mockOrganization, adminMember);
      expect(service.isCurrentUserAdmin()).toBe(true);
    });

    it('should return false for non-admin role', () => {
      service.setCurrentOrganization(mockOrganization, mockMember);
      expect(service.isCurrentUserAdmin()).toBe(false);
    });
  });

  describe('isCurrentUserFinanceOrAdmin', () => {
    it('should return true for finance role', () => {
      const financeMember = { ...mockMember, role: UserRole.FINANCE };
      service.setCurrentOrganization(mockOrganization, financeMember);
      expect(service.isCurrentUserFinanceOrAdmin()).toBe(true);
    });

    it('should return true for admin role', () => {
      const adminMember = { ...mockMember, role: UserRole.ADMIN };
      service.setCurrentOrganization(mockOrganization, adminMember);
      expect(service.isCurrentUserFinanceOrAdmin()).toBe(true);
    });

    it('should return false for employee/manager roles', () => {
      service.setCurrentOrganization(mockOrganization, mockMember);
      expect(service.isCurrentUserFinanceOrAdmin()).toBe(false);
    });
  });

  describe('isCurrentUserManagerOrAbove', () => {
    it('should return true for manager role', () => {
      const managerMember = { ...mockMember, role: UserRole.MANAGER };
      service.setCurrentOrganization(mockOrganization, managerMember);
      expect(service.isCurrentUserManagerOrAbove()).toBe(true);
    });

    it('should return true for finance role', () => {
      const financeMember = { ...mockMember, role: UserRole.FINANCE };
      service.setCurrentOrganization(mockOrganization, financeMember);
      expect(service.isCurrentUserManagerOrAbove()).toBe(true);
    });

    it('should return true for admin role', () => {
      const adminMember = { ...mockMember, role: UserRole.ADMIN };
      service.setCurrentOrganization(mockOrganization, adminMember);
      expect(service.isCurrentUserManagerOrAbove()).toBe(true);
    });

    it('should return false for employee role', () => {
      service.setCurrentOrganization(mockOrganization, mockMember);
      expect(service.isCurrentUserManagerOrAbove()).toBe(false);
    });
  });

  // ============================================================================
  // ORGANIZATION ISOLATION TESTS (Critical for Multi-Tenancy)
  // ============================================================================

  describe('Organization Data Isolation', () => {
    it('should only fetch members for specific organization', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake((field: string, value: string) => {
            expect(field).toBe('organization_id');
            expect(value).toBe('org-123');
            return {
              eq: jasmine.createSpy('eq').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue(
                  Promise.resolve({ data: [mockMember], error: null })
                )
              })
            };
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getOrganizationMembers('org-123').subscribe({
        next: () => {
          done();
        },
        error: done.fail
      });
    });

    it('should persist organization context across page reloads', () => {
      spyOn(localStorage, 'setItem');
      spyOn(localStorage, 'getItem').and.returnValue('org-123');

      service.setCurrentOrganization(mockOrganization, mockMember);

      expect(localStorage.setItem).toHaveBeenCalledWith('current_organization_id', 'org-123');
      expect(service.currentOrganizationId).toBe('org-123');
    });
  });
});
