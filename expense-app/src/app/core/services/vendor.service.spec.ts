import { TestBed } from '@angular/core/testing';
import { VendorService } from './vendor.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import { Vendor, VendorAlias, VendorContact, CreateVendorDto } from '../models/vendor.model';

describe('VendorService', () => {
  let service: VendorService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockVendorId = 'vendor-1';

  const mockVendor: Vendor = {
    id: mockVendorId,
    organization_id: mockOrgId,
    name: 'Acme Corp',
    display_name: 'Acme Corporation',
    tax_id: '12-3456789',
    business_type: 'company',
    status: 'active',
    is_preferred: true,
    is_w9_on_file: true,
    payment_terms: 'net30',
    default_category: null,
    notes: 'Main supplier',
    created_by: mockUserId,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockVendors: Vendor[] = [
    mockVendor,
    {
      ...mockVendor,
      id: 'vendor-2',
      name: 'Beta Inc',
      display_name: 'Beta Incorporated',
      is_preferred: false
    }
  ];

  // Helper to create smart mock that handles getVendors refresh
  function createSmartFromMock(
    mainOperation: 'insert' | 'update' | 'delete',
    mainResponse: any
  ) {
    const vendorsOrderSpy = jasmine.createSpy('vendorsOrder').and.resolveTo({ data: mockVendors, error: null });
    const vendorsEqSpy = jasmine.createSpy('vendorsEq').and.returnValue({ order: vendorsOrderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: vendorsOrderSpy }), ilike: jasmine.createSpy('ilike').and.returnValue({ order: vendorsOrderSpy }) });
    const vendorsSelectSpy = jasmine.createSpy('vendorsSelect').and.returnValue({ eq: vendorsEqSpy });

    let mainChain: any = {};
    if (mainOperation === 'insert') {
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mainResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      mainChain = { insert: insertSpy };
    } else if (mainOperation === 'update') {
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mainResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      mainChain = { update: updateSpy };
    } else if (mainOperation === 'delete') {
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mainResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      mainChain = { delete: deleteSpy };
    }

    return jasmine.createSpy('from').and.callFake((table: string) => {
      if (table === 'vendors') {
        return { ...mainChain, select: vendorsSelectSpy };
      }
      return { ...mainChain, select: vendorsSelectSpy };
    });
  }

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
        VendorService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(VendorService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty vendors', () => {
    expect(service.vendors()).toEqual([]);
    expect(service.vendorCount()).toBe(0);
  });

  describe('getVendors', () => {
    it('should return vendors for the organization', (done) => {
      const mockResponse = { data: mockVendors, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: orderSpy }) });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getVendors().subscribe({
        next: (vendors) => {
          expect(vendors).toEqual(mockVendors);
          expect(service.vendors()).toEqual(mockVendors);
          expect(service.vendorCount()).toBe(2);
          done();
        },
        error: done.fail
      });
    });

    it('should update computed signals after loading', (done) => {
      const mockResponse = { data: mockVendors, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: orderSpy }) });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getVendors().subscribe({
        next: () => {
          expect(service.activeVendors().length).toBe(2);
          expect(service.preferredVendors().length).toBe(1);
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

      service.getVendors().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getVendor', () => {
    it('should return a single vendor by ID', (done) => {
      const mockResponse = { data: mockVendor, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getVendor(mockVendorId).subscribe({
        next: (vendor) => {
          expect(vendor).toEqual(mockVendor);
          expect(eqSpy).toHaveBeenCalledWith('id', mockVendorId);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createVendor', () => {
    const newVendor: CreateVendorDto = {
      name: 'New Vendor',
      display_name: 'New Vendor Inc'
    };

    it('should create a vendor successfully', (done) => {
      const mockResponse = { data: { ...mockVendor, ...newVendor, id: 'vendor-new' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('insert', mockResponse) as any;

      service.createVendor(newVendor).subscribe({
        next: (vendor) => {
          expect(vendor.name).toBe(newVendor.name);
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

      service.createVendor(newVendor).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateVendor', () => {
    it('should update a vendor successfully', (done) => {
      const updates = { id: mockVendorId, name: 'Updated Acme' };
      const updatedVendor = { ...mockVendor, ...updates };
      const mockResponse = { data: updatedVendor, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.updateVendor(updates).subscribe({
        next: (vendor) => {
          expect(vendor.name).toBe(updates.name);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteVendor', () => {
    it('should delete a vendor successfully', (done) => {
      const mockResponse = { error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('delete', mockResponse) as any;

      service.deleteVendor(mockVendorId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('updateVendorStatus', () => {
    it('should update vendor status', (done) => {
      const mockResponse = { data: { ...mockVendor, status: 'inactive' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.updateVendorStatus(mockVendorId, 'inactive').subscribe({
        next: (vendor) => {
          expect(vendor.status).toBe('inactive');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('togglePreferred', () => {
    it('should toggle preferred status', (done) => {
      const mockResponse = { data: { ...mockVendor, is_preferred: false }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.togglePreferred(mockVendorId, false).subscribe({
        next: (vendor) => {
          expect(vendor.is_preferred).toBe(false);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('markW9OnFile', () => {
    it('should mark W9 as on file', (done) => {
      const mockResponse = { data: { ...mockVendor, is_w9_on_file: true }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.markW9OnFile(mockVendorId, true).subscribe({
        next: (vendor) => {
          expect(vendor.is_w9_on_file).toBe(true);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('matchVendor', () => {
    it('should return vendor ID for matching merchant', (done) => {
      const mockResponse = { data: mockVendorId, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.matchVendor('Acme Corp').subscribe({
        next: (vendorId) => {
          expect(vendorId).toBe(mockVendorId);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('match_vendor_for_merchant', {
            p_organization_id: mockOrgId,
            p_merchant_name: 'Acme Corp'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return null for no match', (done) => {
      const mockResponse = { data: null, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.matchVendor('Unknown Merchant').subscribe({
        next: (vendorId) => {
          expect(vendorId).toBeNull();
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

      service.matchVendor('Acme').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getVendorStats', () => {
    it('should return vendor statistics', (done) => {
      const mockStats = [{
        vendor_id: mockVendorId,
        vendor_name: 'Acme Corp',
        expense_count: 10,
        total_spent: 1000,
        avg_expense: 100,
        unique_users: 3
      }];
      const mockResponse = { data: mockStats, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getVendorStats('2024-01-01', '2024-12-31').subscribe({
        next: (stats) => {
          expect(stats).toEqual(mockStats);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getVendorsNeedingW9', () => {
    it('should return vendors needing W9', (done) => {
      const mockVendorsNeedingW9 = [{
        vendor_id: mockVendorId,
        vendor_name: 'Acme Corp',
        total_paid: 1000,
        has_w9: false
      }];
      const mockResponse = { data: mockVendorsNeedingW9, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getVendorsNeedingW9(600).subscribe({
        next: (vendors) => {
          expect(vendors).toEqual(mockVendorsNeedingW9);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('initialize', () => {
    it('should load vendors on init', () => {
      const mockResponse = { data: mockVendors, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: orderSpy }) });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.initialize();

      expect(supabaseServiceSpy.client.from).toHaveBeenCalledWith('vendors');
    });
  });
});
