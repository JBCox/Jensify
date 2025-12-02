import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { DelegationService } from './delegation.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpenseDelegation,
  DelegationWithUser,
  DelegateWithUser,
  CreateDelegationDto,
  UpdateDelegationDto,
  DelegationAuditEntry
} from '../models/delegation.model';

describe('DelegationService', () => {
  let service: DelegationService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockDelegatorId = 'delegator-id';
  const mockDelegateId = 'delegate-id';
  const mockDelegationId = 'delegation-1';

  const mockDelegationWithUser: DelegationWithUser = {
    delegator_id: mockDelegatorId,
    delegator_name: 'John Doe',
    delegator_email: 'john@example.com',
    scope: 'all',
    valid_until: null
  };

  const mockDelegators: DelegationWithUser[] = [
    mockDelegationWithUser,
    {
      delegator_id: 'delegator-2',
      delegator_name: 'Jane Smith',
      delegator_email: 'jane@example.com',
      scope: 'create',
      valid_until: '2024-12-31'
    }
  ];

  const mockDelegateWithUser: DelegateWithUser = {
    delegate_id: mockDelegateId,
    delegate_name: 'Assistant One',
    delegate_email: 'assistant@example.com',
    scope: 'all',
    valid_until: null
  };

  const mockDelegates: DelegateWithUser[] = [
    mockDelegateWithUser,
    {
      delegate_id: 'delegate-2',
      delegate_name: 'Assistant Two',
      delegate_email: 'assistant2@example.com',
      scope: 'submit',
      valid_until: null
    }
  ];

  const mockExpenseDelegation: ExpenseDelegation = {
    id: mockDelegationId,
    organization_id: mockOrgId,
    delegator_id: mockDelegatorId,
    delegate_id: mockDelegateId,
    scope: 'all',
    valid_from: '2024-01-01T10:00:00Z',
    valid_until: null,
    is_active: true,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    delegator: {
      id: mockDelegatorId,
      full_name: 'John Doe',
      email: 'john@example.com'
    },
    delegate: {
      id: mockDelegateId,
      full_name: 'Assistant One',
      email: 'assistant@example.com'
    }
  };

  const mockAuditEntry: DelegationAuditEntry = {
    id: 'audit-1',
    delegation_id: mockDelegationId,
    action: 'created',
    actor_id: mockUserId,
    details: { scope: 'all' },
    created_at: '2024-01-01T10:00:00Z'
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
      },
      userId: mockUserId
    });

    const organizationSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrgId
    });

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error'
    ]);

    TestBed.configureTestingModule({
      providers: [
        DelegationService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(DelegationService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty delegators', () => {
    expect(service.delegators()).toEqual([]);
    expect(service.actingOnBehalfOf()).toBeNull();
    expect(service.hasDelegations()).toBe(false);
  });

  // =============================================================================
  // DELEGATION QUERIES
  // =============================================================================

  describe('getMyDelegates', () => {
    it('should return delegates for the current user', (done) => {
      const mockResponse = { data: mockDelegates, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getMyDelegates().subscribe({
        next: (delegates) => {
          expect(delegates).toEqual(mockDelegates);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_delegates_for_user', {
            p_user_id: mockUserId
          });
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

      service.getMyDelegates().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getMyDelegators', () => {
    it('should return delegators and update signal', (done) => {
      const mockResponse = { data: mockDelegators, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getMyDelegators().subscribe({
        next: (delegators) => {
          expect(delegators).toEqual(mockDelegators);
          expect(service.delegators()).toEqual(mockDelegators);
          expect(service.hasDelegations()).toBe(true);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_delegators_for_user', {
            p_user_id: mockUserId
          });
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

      service.getMyDelegators().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('canActOnBehalfOf', () => {
    it('should return true when user can act on behalf', (done) => {
      const mockResponse = { data: true, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.canActOnBehalfOf(mockDelegatorId, 'all').subscribe({
        next: (canAct) => {
          expect(canAct).toBe(true);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('can_act_on_behalf_of', {
            p_delegate_id: mockUserId,
            p_delegator_id: mockDelegatorId,
            p_action: 'all'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return false when user cannot act on behalf', (done) => {
      const mockResponse = { data: false, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.canActOnBehalfOf(mockDelegatorId).subscribe({
        next: (canAct) => {
          expect(canAct).toBe(false);
          done();
        },
        error: done.fail
      });
    });

    it('should return false on error', (done) => {
      const mockResponse = { data: null, error: { message: 'Not found' } };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.canActOnBehalfOf(mockDelegatorId).subscribe({
        next: (canAct) => {
          expect(canAct).toBe(false);
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

      service.canActOnBehalfOf(mockDelegatorId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('setActingOnBehalfOf', () => {
    it('should set the delegator and log info', () => {
      service.setActingOnBehalfOf(mockDelegationWithUser);

      expect(service.actingOnBehalfOf()).toEqual(mockDelegationWithUser);
      expect(loggerServiceSpy.info).toHaveBeenCalledWith(
        'Acting on behalf of user',
        'DelegationService',
        { delegatorId: mockDelegatorId }
      );
    });

    it('should clear when set to null', () => {
      service.setActingOnBehalfOf(mockDelegationWithUser);
      service.setActingOnBehalfOf(null);

      expect(service.actingOnBehalfOf()).toBeNull();
      expect(loggerServiceSpy.info).toHaveBeenCalledWith(
        'Cleared acting on behalf of',
        'DelegationService'
      );
    });
  });

  describe('getAllDelegations', () => {
    it('should return all delegations for the organization', (done) => {
      const mockResponse = { data: [mockExpenseDelegation], error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getAllDelegations().subscribe({
        next: (delegations) => {
          expect(delegations).toEqual([mockExpenseDelegation]);
          expect(eqSpy).toHaveBeenCalledWith('organization_id', mockOrgId);
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

      service.getAllDelegations().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getDelegation', () => {
    it('should return a single delegation by ID', (done) => {
      const mockResponse = { data: mockExpenseDelegation, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getDelegation(mockDelegationId).subscribe({
        next: (delegation) => {
          expect(delegation).toEqual(mockExpenseDelegation);
          expect(eqSpy).toHaveBeenCalledWith('id', mockDelegationId);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // DELEGATION MUTATIONS
  // =============================================================================

  describe('createDelegation', () => {
    const newDelegation: CreateDelegationDto = {
      delegator_id: mockDelegatorId,
      delegate_id: mockDelegateId,
      scope: 'submit',
      notes: 'Temporary delegation'
    };

    it('should create a new delegation', (done) => {
      const mockResponse = { data: 'new-delegation-id', error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.createDelegation(newDelegation).subscribe({
        next: (id) => {
          expect(id).toBe('new-delegation-id');
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('create_delegation', jasmine.objectContaining({
            p_organization_id: mockOrgId,
            p_delegator_id: mockDelegatorId,
            p_delegate_id: mockDelegateId,
            p_scope: 'submit',
            p_notes: 'Temporary delegation',
            p_created_by: mockUserId
          }));
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should use default scope when not provided', (done) => {
      const minimalDelegation: CreateDelegationDto = {
        delegator_id: mockDelegatorId,
        delegate_id: mockDelegateId
      };
      const mockResponse = { data: 'new-id', error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.createDelegation(minimalDelegation).subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('create_delegation', jasmine.objectContaining({
            p_scope: 'all'
          }));
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

      service.createDelegation(newDelegation).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateDelegation', () => {
    it('should update a delegation', (done) => {
      const updates: UpdateDelegationDto = {
        id: mockDelegationId,
        scope: 'view',
        notes: 'Updated notes'
      };
      const mockResponse = { data: { ...mockExpenseDelegation, ...updates }, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updateDelegation(updates).subscribe({
        next: (delegation) => {
          expect(delegation.scope).toBe('view');
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('revokeDelegation', () => {
    it('should revoke a delegation and refresh delegators', (done) => {
      const mockRevokeResponse = { data: true, error: null };
      const mockDelegatorsResponse = { data: [], error: null };

      let rpcCallCount = 0;
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.callFake((name: string) => {
        rpcCallCount++;
        if (name === 'revoke_delegation') {
          return Promise.resolve(mockRevokeResponse);
        }
        return Promise.resolve(mockDelegatorsResponse);
      });

      service.revokeDelegation(mockDelegationId).subscribe({
        next: (result) => {
          expect(result).toBe(true);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('revoke_delegation', {
            p_delegation_id: mockDelegationId,
            p_revoked_by: mockUserId
          });
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteDelegation', () => {
    it('should delete a delegation', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy
      }) as any;

      service.deleteDelegation(mockDelegationId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // AUDIT LOG
  // =============================================================================

  describe('getDelegationAuditLog', () => {
    it('should return audit entries for a delegation', (done) => {
      const mockAuditEntries = [mockAuditEntry];
      const mockResponse = { data: mockAuditEntries, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getDelegationAuditLog(mockDelegationId).subscribe({
        next: (entries) => {
          expect(entries).toEqual(mockAuditEntries);
          expect(supabaseServiceSpy.client.from).toHaveBeenCalledWith('delegation_audit_log');
          expect(eqSpy).toHaveBeenCalledWith('delegation_id', mockDelegationId);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  describe('getEffectiveUserId', () => {
    it('should return current user ID when not acting on behalf', () => {
      expect(service.getEffectiveUserId()).toBe(mockUserId);
    });

    it('should return delegator ID when acting on behalf', () => {
      service.setActingOnBehalfOf(mockDelegationWithUser);
      expect(service.getEffectiveUserId()).toBe(mockDelegatorId);
    });

    it('should return empty string when no user', () => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      expect(service.getEffectiveUserId()).toBe('');
    });
  });

  describe('getDelegationMetadata', () => {
    beforeEach((done) => {
      const mockResponse = { data: mockDelegators, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);
      service.getMyDelegators().subscribe({
        next: () => done(),
        error: done.fail
      });
    });

    it('should return null when not acting on behalf', () => {
      expect(service.getDelegationMetadata()).toBeNull();
    });

    it('should return metadata when acting on behalf', () => {
      service.setActingOnBehalfOf(mockDelegationWithUser);

      const metadata = service.getDelegationMetadata();
      expect(metadata).toEqual({
        submitted_by: mockUserId,
        submitted_on_behalf_of: mockDelegatorId
      });
    });

    it('should return null when no user', () => {
      service.setActingOnBehalfOf(mockDelegationWithUser);
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      expect(service.getDelegationMetadata()).toBeNull();
    });
  });

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  describe('initialize', () => {
    it('should load delegators on init', () => {
      const mockResponse = { data: mockDelegators, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.initialize();

      expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_delegators_for_user', {
        p_user_id: mockUserId
      });
    });

    it('should log warning on failure', fakeAsync(() => {
      const mockError = { message: 'Load failed' };
      const mockResponse = { data: null, error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.initialize();

      // Allow async to complete
      tick(100);
      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    }));
  });

  // =============================================================================
  // COMPUTED SIGNALS
  // =============================================================================

  describe('hasDelegations computed signal', () => {
    it('should return false when no delegators', () => {
      expect(service.hasDelegations()).toBe(false);
    });

    it('should return true when delegators exist', (done) => {
      const mockResponse = { data: mockDelegators, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getMyDelegators().subscribe({
        next: () => {
          expect(service.hasDelegations()).toBe(true);
          done();
        },
        error: done.fail
      });
    });
  });
});
