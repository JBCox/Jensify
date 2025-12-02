import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { InvitationService } from './invitation.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { NotificationService } from './notification.service';
import { LoggerService } from './logger.service';
import {
  Invitation,
  CreateInvitationDto,
  BulkInvitationDto,
  AcceptInvitationDto,
  OrganizationMember
} from '../models/organization.model';
import { UserRole } from '../models/enums';

describe('InvitationService', () => {
  let service: InvitationService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockInvitationId = 'invitation-1';
  const mockToken = 'test-token-12345';

  const mockInvitation: Invitation = {
    id: mockInvitationId,
    organization_id: mockOrgId,
    email: 'test@example.com',
    role: UserRole.EMPLOYEE,
    token: mockToken,
    status: 'pending',
    invited_by: mockUserId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: '2024-01-01T10:00:00Z'
  };

  const mockMember: OrganizationMember = {
    id: 'member-1',
    organization_id: mockOrgId,
    user_id: mockUserId,
    role: UserRole.EMPLOYEE,
    is_active: true,
    joined_at: '2024-01-15T10:00:00Z',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc'),
        functions: {
          invoke: jasmine.createSpy('invoke')
        }
      },
      userId: mockUserId
    });

    const organizationSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrgId
    });

    const notificationSpy = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showWarning',
      'showError'
    ]);

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error',
      'getErrorMessage'
    ]);
    loggerSpy.getErrorMessage.and.returnValue('An error occurred');

    TestBed.configureTestingModule({
      providers: [
        InvitationService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(InvitationService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createInvitation', () => {
    it('should create an invitation', (done) => {
      const dto: CreateInvitationDto = {
        email: 'newuser@example.com',
        role: UserRole.EMPLOYEE,
        department: 'Engineering'
      };
      const mockResponse = { data: mockInvitation, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      // Mock the edge function for email
      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo({ data: {}, error: null });

      service.createInvitation(dto).subscribe({
        next: (invitation) => {
          expect(invitation).toEqual(mockInvitation);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.createInvitation({ email: 'test@test.com', role: UserRole.EMPLOYEE }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.createInvitation({ email: 'test@test.com', role: UserRole.EMPLOYEE }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createBulkInvitations', () => {
    it('should create multiple invitations', (done) => {
      const dto: BulkInvitationDto = {
        invitations: [
          { email: 'user1@example.com', role: UserRole.EMPLOYEE },
          { email: 'user2@example.com', role: UserRole.MANAGER }
        ]
      };
      const mockInvitations = [mockInvitation, { ...mockInvitation, id: 'invitation-2', email: 'user2@example.com' }];
      const mockResponse = { data: mockInvitations, error: null };

      const selectSpy = jasmine.createSpy('select').and.resolveTo(mockResponse);
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo({ data: {}, error: null });

      service.createBulkInvitations(dto).subscribe({
        next: (invitations) => {
          expect(invitations.length).toBe(2);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.createBulkInvitations({ invitations: [] }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getInvitationByToken', () => {
    it('should return invitation by token', (done) => {
      const mockResponse = { data: mockInvitation, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const statusEqSpy = jasmine.createSpy('statusEq').and.returnValue({ single: singleSpy });
      const tokenEqSpy = jasmine.createSpy('tokenEq').and.returnValue({ eq: statusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: tokenEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getInvitationByToken(mockToken).subscribe({
        next: (invitation) => {
          expect(invitation).toEqual(mockInvitation);
          done();
        },
        error: done.fail
      });
    });

    it('should return null for not found', (done) => {
      const mockResponse = { data: null, error: { code: 'PGRST116' } };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const statusEqSpy = jasmine.createSpy('statusEq').and.returnValue({ single: singleSpy });
      const tokenEqSpy = jasmine.createSpy('tokenEq').and.returnValue({ eq: statusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: tokenEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getInvitationByToken('invalid-token').subscribe({
        next: (invitation) => {
          expect(invitation).toBeNull();
          done();
        },
        error: done.fail
      });
    });

    it('should return null for expired invitation', (done) => {
      const expiredInvitation = {
        ...mockInvitation,
        expires_at: new Date(Date.now() - 1000).toISOString() // Expired
      };
      const mockResponse = { data: expiredInvitation, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const statusEqSpy = jasmine.createSpy('statusEq').and.returnValue({ single: singleSpy });
      const tokenEqSpy = jasmine.createSpy('tokenEq').and.returnValue({ eq: statusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: tokenEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getInvitationByToken(mockToken).subscribe({
        next: (invitation) => {
          expect(invitation).toBeNull();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getOrganizationInvitations', () => {
    it('should return all invitations for organization', (done) => {
      const mockInvitations = [mockInvitation];
      const mockResponse = { data: mockInvitations, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: orderSpy }) });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getOrganizationInvitations().subscribe({
        next: (invitations) => {
          expect(invitations).toEqual(mockInvitations);
          done();
        },
        error: done.fail
      });
    });

    it('should filter by status when provided', (done) => {
      const mockInvitations = [mockInvitation];
      const mockResponse = { data: mockInvitations, error: null };

      const createThenable = () => {
        const thenable: { then: (fn: (r: { data: Invitation[]; error: null }) => void) => Promise<void>; eq: jasmine.Spy } = {
          then: (fn: (r: { data: Invitation[]; error: null }) => void) => Promise.resolve(mockResponse).then(fn),
          eq: jasmine.createSpy('filterEq').and.callFake(() => createThenable())
        };
        return thenable;
      };

      const orderSpy = jasmine.createSpy('order').and.callFake(() => createThenable());
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: orderSpy }) });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getOrganizationInvitations('pending').subscribe({
        next: (invitations) => {
          expect(invitations).toEqual(mockInvitations);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getOrganizationInvitations().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getPendingInvitationsCount', () => {
    it('should return pending invitations count', (done) => {
      const mockResponse = { count: 5, error: null };

      const statusEqSpy = jasmine.createSpy('statusEq').and.resolveTo(mockResponse);
      const orgEqSpy = jasmine.createSpy('orgEq').and.returnValue({ eq: statusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getPendingInvitationsCount().subscribe({
        next: (count) => {
          expect(count).toBe(5);
          done();
        },
        error: done.fail
      });
    });

    it('should return 0 when count is null', (done) => {
      const mockResponse = { count: null, error: null };

      const statusEqSpy = jasmine.createSpy('statusEq').and.resolveTo(mockResponse);
      const orgEqSpy = jasmine.createSpy('orgEq').and.returnValue({ eq: statusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getPendingInvitationsCount().subscribe({
        next: (count) => {
          expect(count).toBe(0);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getPendingInvitationsCount().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('acceptInvitation', () => {
    it('should accept an invitation', (done) => {
      const dto: AcceptInvitationDto = { token: mockToken };
      const mockResponse = { data: mockMember, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.acceptInvitation(dto).subscribe({
        next: (member) => {
          expect(member).toEqual(mockMember);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Successfully joined organization');
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.acceptInvitation({ token: mockToken }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should handle RPC failure', (done) => {
      const mockResponse = { data: null, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);
      loggerServiceSpy.getErrorMessage.and.returnValue('Failed to accept invitation');

      service.acceptInvitation({ token: mockToken }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Failed to accept invitation');
          done();
        }
      });
    });
  });

  describe('revokeInvitation', () => {
    it('should revoke an invitation', (done) => {
      const mockResponse = { error: null };

      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.revokeInvitation(mockInvitationId).subscribe({
        next: () => {
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Invitation revoked');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('resendInvitation', () => {
    it('should resend an invitation', (done) => {
      const mockResponse = { data: mockInvitation, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo({ data: {}, error: null });

      service.resendInvitation(mockInvitationId).subscribe({
        next: (invitation) => {
          expect(invitation).toEqual(mockInvitation);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteInvitation', () => {
    it('should delete an invitation', (done) => {
      const mockResponse = { error: null };

      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.deleteInvitation(mockInvitationId).subscribe({
        next: () => {
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Invitation deleted');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('expireOldInvitations', () => {
    it('should call RPC to expire old invitations', (done) => {
      const mockResponse = { error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.expireOldInvitations().subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('expire_old_invitations');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getInvitationLink', () => {
    it('should generate correct invitation link', () => {
      const link = service.getInvitationLink(mockToken);
      expect(link).toContain('/auth/accept-invitation?token=');
      expect(link).toContain(mockToken);
    });
  });

  describe('parseInvitationCsv', () => {
    it('should parse valid CSV', () => {
      const csv = `email,role,department,manager_email
user1@example.com,employee,Engineering,
user2@example.com,manager,Sales,`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(2);
      expect(result[0].email).toBe('user1@example.com');
      expect(result[0].role).toBe('employee');
      expect(result[0].department).toBe('Engineering');
      expect(result[1].email).toBe('user2@example.com');
      expect(result[1].role).toBe('manager');
    });

    it('should skip rows with missing email', () => {
      const csv = `email,role,department,manager_email
,employee,Engineering,`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(0);
      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    });

    it('should skip rows with missing role', () => {
      const csv = `email,role,department,manager_email
user@example.com,,Engineering,`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(0);
    });

    it('should skip rows with invalid email format', () => {
      const csv = `email,role,department,manager_email
invalid-email,employee,Engineering,`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(0);
      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    });

    it('should skip rows with invalid role', () => {
      const csv = `email,role,department,manager_email
user@example.com,superadmin,Engineering,`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(0);
      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    });

    it('should handle empty lines', () => {
      const csv = `email,role,department,manager_email
user@example.com,employee,Engineering,

`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(1);
    });

    it('should accept all valid roles', () => {
      const csv = `email,role,department,manager_email
user1@example.com,employee,Engineering,
user2@example.com,manager,Sales,
user3@example.com,finance,Finance,
user4@example.com,admin,HR,`;

      const result = service.parseInvitationCsv(csv);

      expect(result.length).toBe(4);
      expect(result[0].role).toBe('employee');
      expect(result[1].role).toBe('manager');
      expect(result[2].role).toBe('finance');
      expect(result[3].role).toBe('admin');
    });
  });

  describe('error handling', () => {
    it('should handle database errors', (done) => {
      const mockError = new Error('Database connection failed');
      const mockResponse = { data: null, error: mockError };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.createInvitation({ email: 'test@test.com', role: UserRole.EMPLOYEE }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          expect(notificationServiceSpy.showError).toHaveBeenCalled();
          done();
        }
      });
    });

    it('should handle duplicate invitation error', (done) => {
      const mockError = { code: '23505', message: 'Unique constraint violation' };
      const mockResponse = { data: null, error: mockError };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.createInvitation({ email: 'test@test.com', role: UserRole.EMPLOYEE }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('An invitation for this email already exists');
          done();
        }
      });
    });
  });
});
