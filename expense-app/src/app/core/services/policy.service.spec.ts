import { TestBed } from '@angular/core/testing';
import { PolicyService } from './policy.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpensePolicy,
  PolicyPreset,
  EffectivePolicy,
  CreatePolicyDto,
  UpdatePolicyDto
} from '../models/policy.model';

describe('PolicyService', () => {
  let service: PolicyService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockPolicyId = 'policy-1';

  const mockPolicy: ExpensePolicy = {
    id: mockPolicyId,
    organization_id: mockOrgId,
    name: 'Default Policy',
    description: 'Default expense policy',
    scope_type: 'organization',
    max_amount: 500,
    max_daily_total: 1000,
    max_monthly_total: 5000,
    max_receipt_age_days: 30,
    require_receipt: true,
    require_description: false,
    allow_weekends: true,
    auto_approve_under: 50,
    priority: 100,
    is_active: true,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    created_by: mockUserId
  };

  const mockPolicies: ExpensePolicy[] = [
    mockPolicy,
    {
      ...mockPolicy,
      id: 'policy-2',
      name: 'Fuel Policy',
      scope_type: 'category',
      category: 'fuel',
      max_amount: 100,
      priority: 200
    }
  ];

  const mockPreset: PolicyPreset = {
    id: 'preset-1',
    name: 'Standard',
    preset_type: 'template',
    config: {
      base: {
        max_amount: 500,
        require_receipt: true
      }
    },
    is_default: true,
    description: 'Standard expense policy template',
    created_at: '2024-01-01T10:00:00Z'
  };

  const mockEffectivePolicy: EffectivePolicy = {
    max_amount: 500,
    max_daily_total: 1000,
    max_monthly_total: 5000,
    max_receipt_age_days: 30,
    require_receipt: true,
    require_description: false,
    allow_weekends: true,
    auto_approve_under: 50,
    applied_policies: ['Default Policy', 'Fuel Policy']
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      userId: mockUserId,
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
      }
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
        PolicyService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(PolicyService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPolicies', () => {
    it('should return policies for the organization', (done) => {
      const mockResponse = { data: mockPolicies, error: null };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPolicies().subscribe({
        next: (policies) => {
          expect(policies).toEqual(mockPolicies);
          expect(eqSpy).toHaveBeenCalledWith('organization_id', mockOrgId);
          expect(order1Spy).toHaveBeenCalledWith('priority', { ascending: false });
          expect(order2Spy).toHaveBeenCalledWith('name', { ascending: true });
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

      service.getPolicies().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should handle database errors', (done) => {
      const mockError = { message: 'Database error' };
      const mockResponse = { data: null, error: mockError };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPolicies().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error).toBeTruthy();
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('getPolicy', () => {
    it('should return a single policy by ID', (done) => {
      const mockResponse = { data: mockPolicy, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPolicy(mockPolicyId).subscribe({
        next: (policy) => {
          expect(policy).toEqual(mockPolicy);
          expect(eqSpy).toHaveBeenCalledWith('id', mockPolicyId);
          done();
        },
        error: done.fail
      });
    });

    it('should handle policy not found', (done) => {
      const mockError = { message: 'Policy not found' };
      const mockResponse = { data: null, error: mockError };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPolicy('non-existent').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('createPolicy', () => {
    const newPolicy: CreatePolicyDto = {
      name: 'New Policy',
      description: 'A new policy',
      scope_type: 'organization',
      max_amount: 300,
      require_receipt: true
    };

    it('should create a policy successfully', (done) => {
      const mockResponse = { data: { ...mockPolicy, ...newPolicy, id: 'policy-new' }, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as any;

      service.createPolicy(newPolicy).subscribe({
        next: (policy) => {
          expect(policy.name).toBe(newPolicy.name);
          expect(insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            ...newPolicy,
            organization_id: mockOrgId,
            created_by: mockUserId
          }));
          expect(loggerServiceSpy.info).toHaveBeenCalled();
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

      service.createPolicy(newPolicy).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updatePolicy', () => {
    const updates: UpdatePolicyDto = {
      id: mockPolicyId,
      name: 'Updated Policy',
      max_amount: 750
    };

    it('should update a policy successfully', (done) => {
      const updatedPolicy = { ...mockPolicy, ...updates };
      const mockResponse = { data: updatedPolicy, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updatePolicy(updates).subscribe({
        next: (policy) => {
          expect(policy.name).toBe(updates.name!);
          expect(policy.max_amount).toBe(updates.max_amount);
          expect(eqSpy).toHaveBeenCalledWith('id', mockPolicyId);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should handle update errors', (done) => {
      const mockError = { message: 'Update failed' };
      const mockResponse = { data: null, error: mockError };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updatePolicy(updates).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('deletePolicy', () => {
    it('should delete a policy successfully', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy
      }) as any;

      service.deletePolicy(mockPolicyId).subscribe({
        next: () => {
          expect(deleteSpy).toHaveBeenCalled();
          expect(eqSpy).toHaveBeenCalledWith('id', mockPolicyId);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should handle delete errors', (done) => {
      const mockError = { message: 'Delete failed' };
      const mockResponse = { error: mockError };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy
      }) as any;

      service.deletePolicy(mockPolicyId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('togglePolicyActive', () => {
    it('should toggle policy active status', (done) => {
      const toggledPolicy = { ...mockPolicy, is_active: false };
      const mockResponse = { data: toggledPolicy, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.togglePolicyActive(mockPolicyId, false).subscribe({
        next: (policy) => {
          expect(policy.is_active).toBe(false);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getPresets', () => {
    it('should return policy presets', (done) => {
      const mockPresets = [mockPreset];
      const mockResponse = { data: mockPresets, error: null };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ order: order1Spy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPresets().subscribe({
        next: (presets) => {
          expect(presets).toEqual(mockPresets);
          expect(order1Spy).toHaveBeenCalledWith('is_default', { ascending: false });
          expect(order2Spy).toHaveBeenCalledWith('name', { ascending: true });
          done();
        },
        error: done.fail
      });
    });
  });

  describe('applyPreset', () => {
    it('should apply a preset successfully', (done) => {
      const mockResult = { policies_created: 3 };
      const mockResponse = { data: mockResult, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.applyPreset('Standard').subscribe({
        next: (result) => {
          expect(result.policies_created).toBe(3);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('apply_policy_preset', {
            p_organization_id: mockOrgId,
            p_preset_name: 'Standard'
          });
          expect(loggerServiceSpy.info).toHaveBeenCalled();
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

      service.applyPreset('Standard').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getEffectivePolicy', () => {
    it('should return effective policy for user', (done) => {
      const mockResponse = { data: mockEffectivePolicy, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getEffectivePolicy(mockUserId, 'fuel').subscribe({
        next: (policy) => {
          expect(policy).toEqual(mockEffectivePolicy);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_effective_policy', {
            p_organization_id: mockOrgId,
            p_user_id: mockUserId,
            p_category: 'fuel'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should handle null category', (done) => {
      const mockResponse = { data: mockEffectivePolicy, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getEffectivePolicy(mockUserId).subscribe({
        next: (policy) => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_effective_policy', {
            p_organization_id: mockOrgId,
            p_user_id: mockUserId,
            p_category: null
          });
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

      service.getEffectivePolicy(mockUserId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getPoliciesByScope', () => {
    it('should return policies filtered by scope', (done) => {
      const categoryPolicies = mockPolicies.filter(p => p.scope_type === 'category');
      const mockResponse = { data: categoryPolicies, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eq2Spy = jasmine.createSpy('eq2').and.returnValue({ order: orderSpy });
      const eq1Spy = jasmine.createSpy('eq1').and.returnValue({ eq: eq2Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eq1Spy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPoliciesByScope('category').subscribe({
        next: (policies) => {
          expect(eq1Spy).toHaveBeenCalledWith('organization_id', mockOrgId);
          expect(eq2Spy).toHaveBeenCalledWith('scope_type', 'category');
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

      service.getPoliciesByScope('category').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getPolicyStats', () => {
    it('should return policy statistics', (done) => {
      const mockData = [
        { id: '1', is_active: true, scope_type: 'organization' },
        { id: '2', is_active: true, scope_type: 'category' },
        { id: '3', is_active: false, scope_type: 'category' }
      ];
      const mockResponse = { data: mockData, error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPolicyStats().subscribe({
        next: (stats) => {
          expect(stats.total).toBe(3);
          expect(stats.active).toBe(2);
          expect(stats.byScope['organization']).toBe(1);
          expect(stats.byScope['category']).toBe(2);
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

      service.getPolicyStats().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('duplicatePolicy', () => {
    it('should return DTO for duplicated policy', (done) => {
      const mockResponse = { data: mockPolicy, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.duplicatePolicy(mockPolicyId, 'Copied Policy').subscribe({
        next: (dto) => {
          expect(dto.name).toBe('Copied Policy');
          expect((dto as any).id).toBeUndefined();
          expect((dto as any).created_at).toBeUndefined();
          expect((dto as any).organization_id).toBeUndefined();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('updatePriorities', () => {
    it('should update multiple policy priorities', (done) => {
      const priorities = [
        { id: 'policy-1', priority: 100 },
        { id: 'policy-2', priority: 200 }
      ];

      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updatePriorities(priorities).subscribe({
        next: () => {
          expect(updateSpy).toHaveBeenCalledTimes(2);
          done();
        },
        error: done.fail
      });
    });

    it('should handle errors in priority updates', (done) => {
      const priorities = [{ id: 'policy-1', priority: 100 }];

      const mockError = { message: 'Update failed' };
      const mockResponse = { error: mockError };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updatePriorities(priorities).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });
});
