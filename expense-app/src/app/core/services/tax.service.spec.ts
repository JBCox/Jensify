import { TestBed } from '@angular/core/testing';
import { TaxService } from './tax.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  TaxRate,
  TaxCategory,
  TaxReportRow,
  TaxLookupResult,
  TaxSummary,
  CreateTaxRateDto,
  UpdateTaxRateDto,
  CreateTaxCategoryDto,
  UpdateTaxCategoryDto,
  TaxReportFilters
} from '../models/tax.model';

describe('TaxService', () => {
  let service: TaxService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockRateId = 'rate-1';
  const mockCategoryId = 'category-1';

  const mockTaxRate: TaxRate = {
    id: mockRateId,
    organization_id: mockOrgId,
    name: 'Texas Sales Tax',
    country_code: 'US',
    state_province: 'TX',
    tax_type: 'sales_tax',
    rate: 0.0825,
    is_recoverable: false,
    is_compound: false,
    effective_from: '2024-01-01',
    effective_until: null,
    is_active: true,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockTaxRates: TaxRate[] = [
    mockTaxRate,
    {
      ...mockTaxRate,
      id: 'rate-2',
      name: 'UK VAT',
      country_code: 'GB',
      state_province: null,
      tax_type: 'vat',
      rate: 0.20,
      is_recoverable: true
    }
  ];

  const mockTaxCategory: TaxCategory = {
    id: mockCategoryId,
    organization_id: mockOrgId,
    name: 'Standard Rate',
    code: 'STD',
    description: 'Standard tax rate',
    is_taxable: true,
    default_rate_id: mockRateId,
    vat_code: null,
    is_active: true,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockTaxCategories: TaxCategory[] = [
    mockTaxCategory,
    {
      ...mockTaxCategory,
      id: 'category-2',
      name: 'Zero Rated',
      code: 'ZERO',
      is_taxable: false
    }
  ];

  // Helper to create a mock that handles both the main operation and refresh calls
  function createSmartFromMock(
    mainOperation: 'insert' | 'update' | 'delete',
    mainResponse: any,
    tableName: string = 'tax_rates'
  ) {
    // Mock for getTaxRates refresh
    const ratesOrder2Spy = jasmine.createSpy('ratesOrder2').and.resolveTo({ data: mockTaxRates, error: null });
    const ratesOrder1Spy = jasmine.createSpy('ratesOrder1').and.returnValue({ order: ratesOrder2Spy });
    const ratesEqSpy = jasmine.createSpy('ratesEq').and.returnValue({ order: ratesOrder1Spy });
    const ratesSelectSpy = jasmine.createSpy('ratesSelect').and.returnValue({ eq: ratesEqSpy });

    // Mock for getTaxCategories refresh
    const categoriesOrderSpy = jasmine.createSpy('categoriesOrder').and.resolveTo({ data: mockTaxCategories, error: null });
    const categoriesEqSpy = jasmine.createSpy('categoriesEq').and.returnValue({ order: categoriesOrderSpy });
    const categoriesSelectSpy = jasmine.createSpy('categoriesSelect').and.returnValue({ eq: categoriesEqSpy });

    // Mock for the main operation
    let mainChain: any;
    if (mainOperation === 'insert') {
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mainResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      mainChain = { insert: insertSpy, select: ratesSelectSpy };
    } else if (mainOperation === 'update') {
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mainResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      mainChain = { update: updateSpy, select: ratesSelectSpy };
    } else if (mainOperation === 'delete') {
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mainResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      mainChain = { delete: deleteSpy, select: ratesSelectSpy };
    }

    return jasmine.createSpy('from').and.callFake((table: string) => {
      if (table === 'tax_rates') {
        return { ...mainChain, select: ratesSelectSpy };
      } else if (table === 'tax_categories') {
        return { ...mainChain, select: categoriesSelectSpy };
      }
      return mainChain;
    });
  }

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
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
        TaxService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(TaxService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty tax rates and categories', () => {
    expect(service.taxRates()).toEqual([]);
    expect(service.taxCategories()).toEqual([]);
    expect(service.activeTaxRates()).toEqual([]);
  });

  describe('getTaxRates', () => {
    it('should return tax rates for the organization', (done) => {
      const mockResponse = { data: mockTaxRates, error: null };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getTaxRates().subscribe({
        next: (rates) => {
          expect(rates).toEqual(mockTaxRates);
          expect(service.taxRates()).toEqual(mockTaxRates);
          expect(eqSpy).toHaveBeenCalledWith('organization_id', mockOrgId);
          done();
        },
        error: done.fail
      });
    });

    it('should update activeTaxRates computed signal', (done) => {
      const mockRates = [
        mockTaxRate,
        { ...mockTaxRate, id: 'rate-inactive', is_active: false }
      ];
      const mockResponse = { data: mockRates, error: null };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getTaxRates().subscribe({
        next: () => {
          expect(service.activeTaxRates().length).toBe(1);
          expect(service.activeTaxRates()[0].id).toBe(mockRateId);
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

      service.getTaxRates().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getTaxRate', () => {
    it('should return a single tax rate by ID', (done) => {
      const mockResponse = { data: mockTaxRate, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getTaxRate(mockRateId).subscribe({
        next: (rate) => {
          expect(rate).toEqual(mockTaxRate);
          expect(eqSpy).toHaveBeenCalledWith('id', mockRateId);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createTaxRate', () => {
    const newRate: CreateTaxRateDto = {
      name: 'Florida Sales Tax',
      country_code: 'US',
      state_province: 'FL',
      tax_type: 'sales_tax',
      rate: 0.06
    };

    it('should create a tax rate successfully', (done) => {
      const mockResponse = { data: { ...mockTaxRate, ...newRate, id: 'rate-new' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('insert', mockResponse, 'tax_rates') as any;

      service.createTaxRate(newRate).subscribe({
        next: (rate) => {
          expect(rate.name).toBe(newRate.name);
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

      service.createTaxRate(newRate).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateTaxRate', () => {
    const updates: UpdateTaxRateDto = {
      id: mockRateId,
      name: 'Updated Texas Tax',
      rate: 0.085
    };

    it('should update a tax rate successfully', (done) => {
      const updatedRate = { ...mockTaxRate, ...updates };
      const mockResponse = { data: updatedRate, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse, 'tax_rates') as any;

      service.updateTaxRate(updates).subscribe({
        next: (rate) => {
          expect(rate.name).toBe(updates.name!);
          expect(rate.rate).toBe(updates.rate!);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteTaxRate', () => {
    it('should delete a tax rate successfully', (done) => {
      const mockResponse = { error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('delete', mockResponse, 'tax_rates') as any;

      service.deleteTaxRate(mockRateId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('lookupTaxRate', () => {
    it('should return applicable tax rate', (done) => {
      const mockLookup: TaxLookupResult = {
        rate_id: mockRateId,
        rate: 0.0825,
        is_recoverable: false,
        tax_name: 'Texas Sales Tax'
      };
      const mockResponse = { data: [mockLookup], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.lookupTaxRate('US', 'TX', 'sales_tax').subscribe({
        next: (result) => {
          expect(result).toEqual(mockLookup);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_applicable_tax_rate', {
            p_organization_id: mockOrgId,
            p_country_code: 'US',
            p_state_province: 'TX',
            p_tax_type: 'sales_tax',
            p_date: jasmine.any(String)
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return null when no rate found', (done) => {
      const mockResponse = { data: [], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.lookupTaxRate('XX', 'YY').subscribe({
        next: (result) => {
          expect(result).toBeNull();
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

      service.lookupTaxRate('US', 'TX').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getTaxCategories', () => {
    it('should return tax categories for the organization', (done) => {
      const mockResponse = { data: mockTaxCategories, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getTaxCategories().subscribe({
        next: (categories) => {
          expect(categories).toEqual(mockTaxCategories);
          expect(service.taxCategories()).toEqual(mockTaxCategories);
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

      service.getTaxCategories().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createTaxCategory', () => {
    const newCategory: CreateTaxCategoryDto = {
      name: 'Reduced Rate',
      code: 'RED',
      is_taxable: true
    };

    it('should create a tax category successfully', (done) => {
      const mockResponse = { data: { ...mockTaxCategory, ...newCategory, id: 'cat-new' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('insert', mockResponse, 'tax_categories') as any;

      service.createTaxCategory(newCategory).subscribe({
        next: (category) => {
          expect(category.name).toBe(newCategory.name);
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

      service.createTaxCategory(newCategory).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateTaxCategory', () => {
    const updates: UpdateTaxCategoryDto = {
      id: mockCategoryId,
      name: 'Updated Standard',
      code: 'UPD'
    };

    it('should update a tax category successfully', (done) => {
      const updatedCategory = { ...mockTaxCategory, ...updates };
      const mockResponse = { data: updatedCategory, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse, 'tax_categories') as any;

      service.updateTaxCategory(updates).subscribe({
        next: (category) => {
          expect(category.name).toBe(updates.name!);
          expect(category.code).toBe(updates.code!);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteTaxCategory', () => {
    it('should delete a tax category successfully', (done) => {
      const mockResponse = { error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('delete', mockResponse, 'tax_categories') as any;

      service.deleteTaxCategory(mockCategoryId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getTaxReport', () => {
    const filters: TaxReportFilters = {
      start_date: '2024-01-01',
      end_date: '2024-12-31',
      group_by: 'tax_type'
    };

    const mockReportRows: TaxReportRow[] = [
      {
        group_key: 'sales_tax',
        total_gross: 10000,
        total_net: 9175,
        total_tax: 825,
        recoverable_tax: 0,
        non_recoverable_tax: 825,
        expense_count: 50
      },
      {
        group_key: 'vat',
        total_gross: 5000,
        total_net: 4167,
        total_tax: 833,
        recoverable_tax: 833,
        non_recoverable_tax: 0,
        expense_count: 20
      }
    ];

    it('should return tax report data', (done) => {
      const mockResponse = { data: mockReportRows, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getTaxReport(filters).subscribe({
        next: (rows) => {
          expect(rows).toEqual(mockReportRows);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_tax_report', {
            p_organization_id: mockOrgId,
            p_start_date: filters.start_date,
            p_end_date: filters.end_date,
            p_group_by: 'tax_type'
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

      service.getTaxReport(filters).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getTaxSummary', () => {
    const mockReportRows: TaxReportRow[] = [
      {
        group_key: 'sales_tax',
        total_gross: 10000,
        total_net: 9175,
        total_tax: 825,
        recoverable_tax: 0,
        non_recoverable_tax: 825,
        expense_count: 50
      },
      {
        group_key: 'vat',
        total_gross: 5000,
        total_net: 4167,
        total_tax: 833,
        recoverable_tax: 833,
        non_recoverable_tax: 0,
        expense_count: 20
      }
    ];

    it('should return tax summary', (done) => {
      const mockResponse = { data: mockReportRows, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getTaxSummary('2024-01-01', '2024-12-31').subscribe({
        next: (summary) => {
          expect(summary.total_tax_paid).toBe(1658);
          expect(summary.total_recoverable).toBe(833);
          expect(summary.total_non_recoverable).toBe(825);
          expect(summary.by_type['sales_tax']).toBe(825);
          expect(summary.by_type['vat']).toBe(833);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('seedDefaultRates', () => {
    it('should seed default tax rates', (done) => {
      const mockResponse = { error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      // Setup from mock for the refresh calls after seeding
      const ratesOrder2Spy = jasmine.createSpy('ratesOrder2').and.resolveTo({ data: mockTaxRates, error: null });
      const ratesOrder1Spy = jasmine.createSpy('ratesOrder1').and.returnValue({ order: ratesOrder2Spy });
      const ratesEqSpy = jasmine.createSpy('ratesEq').and.returnValue({ order: ratesOrder1Spy });
      const ratesSelectSpy = jasmine.createSpy('ratesSelect').and.returnValue({ eq: ratesEqSpy });

      const categoriesOrderSpy = jasmine.createSpy('categoriesOrder').and.resolveTo({ data: mockTaxCategories, error: null });
      const categoriesEqSpy = jasmine.createSpy('categoriesEq').and.returnValue({ order: categoriesOrderSpy });
      const categoriesSelectSpy = jasmine.createSpy('categoriesSelect').and.returnValue({ eq: categoriesEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'tax_rates') {
          return { select: ratesSelectSpy };
        } else if (table === 'tax_categories') {
          return { select: categoriesSelectSpy };
        }
        return {};
      }) as any;

      service.seedDefaultRates().subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('seed_default_tax_rates', {
            p_organization_id: mockOrgId
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

      service.seedDefaultRates().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('ratesByCountry computed signal', () => {
    it('should group rates by country code', (done) => {
      const mockRates = [
        mockTaxRate,
        { ...mockTaxRate, id: 'rate-2', state_province: 'CA', name: 'California Tax' },
        { ...mockTaxRate, id: 'rate-3', country_code: 'GB', state_province: null, name: 'UK VAT' }
      ];
      const mockResponse = { data: mockRates, error: null };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getTaxRates().subscribe({
        next: () => {
          const byCountry = service.ratesByCountry();
          expect(byCountry['US'].length).toBe(2);
          expect(byCountry['GB'].length).toBe(1);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('initialize', () => {
    it('should load tax rates and categories', () => {
      // Setup from mock for both getTaxRates and getTaxCategories calls
      const ratesOrder2Spy = jasmine.createSpy('ratesOrder2').and.resolveTo({ data: mockTaxRates, error: null });
      const ratesOrder1Spy = jasmine.createSpy('ratesOrder1').and.returnValue({ order: ratesOrder2Spy });
      const ratesEqSpy = jasmine.createSpy('ratesEq').and.returnValue({ order: ratesOrder1Spy });
      const ratesSelectSpy = jasmine.createSpy('ratesSelect').and.returnValue({ eq: ratesEqSpy });

      const categoriesOrderSpy = jasmine.createSpy('categoriesOrder').and.resolveTo({ data: mockTaxCategories, error: null });
      const categoriesEqSpy = jasmine.createSpy('categoriesEq').and.returnValue({ order: categoriesOrderSpy });
      const categoriesSelectSpy = jasmine.createSpy('categoriesSelect').and.returnValue({ eq: categoriesEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'tax_rates') {
          return { select: ratesSelectSpy };
        } else if (table === 'tax_categories') {
          return { select: categoriesSelectSpy };
        }
        return {};
      }) as any;

      // Call initialize
      service.initialize();

      // Verify both methods were called
      expect(supabaseServiceSpy.client.from).toHaveBeenCalled();
    });
  });
});
