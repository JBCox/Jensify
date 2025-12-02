import { TestBed } from '@angular/core/testing';
import { CategoryService } from './category.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import { GLCode, CustomExpenseCategory } from '../models/gl-code.model';

describe('CategoryService', () => {
  let service: CategoryService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockGLCodeId = 'gl-1';
  const mockCategoryId = 'cat-1';

  const mockGLCode: GLCode = {
    id: mockGLCodeId,
    organization_id: mockOrgId,
    code: '5000',
    name: 'Travel Expenses',
    description: 'All travel-related expenses',
    is_active: true,
    created_by: mockUserId,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockGLCodes: GLCode[] = [
    mockGLCode,
    {
      ...mockGLCode,
      id: 'gl-2',
      code: '5100',
      name: 'Office Supplies'
    }
  ];

  const mockCategory: CustomExpenseCategory = {
    id: mockCategoryId,
    organization_id: mockOrgId,
    name: 'Fuel',
    description: 'Gas and fuel expenses',
    is_active: true,
    gl_code_id: mockGLCodeId,
    requires_receipt: true,
    requires_description: false,
    icon: 'local_gas_station',
    color: '#FF5900',
    display_order: 1,
    created_by: mockUserId,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockCategories: CustomExpenseCategory[] = [
    mockCategory,
    {
      ...mockCategory,
      id: 'cat-2',
      name: 'Meals',
      display_order: 2
    }
  ];

  // Helper to create smart mock that handles multiple table queries
  function createSmartFromMock(
    mainOperation: 'insert' | 'update' | 'delete',
    mainResponse: any
  ) {
    // Mock for getGLCodes refresh
    const glCodesOrderSpy = jasmine.createSpy('glCodesOrder').and.resolveTo({ data: mockGLCodes, error: null });
    const glCodesEq2Spy = jasmine.createSpy('glCodesEq2').and.returnValue({ order: glCodesOrderSpy });
    const glCodesEqSpy = jasmine.createSpy('glCodesEq').and.returnValue({ eq: glCodesEq2Spy, order: glCodesOrderSpy });
    const glCodesSelectSpy = jasmine.createSpy('glCodesSelect').and.returnValue({ eq: glCodesEqSpy });

    // Mock for getCategories refresh
    const categoriesOrder2Spy = jasmine.createSpy('categoriesOrder2').and.resolveTo({ data: mockCategories, error: null });
    const categoriesOrder1Spy = jasmine.createSpy('categoriesOrder1').and.returnValue({ order: categoriesOrder2Spy });
    const categoriesEq2Spy = jasmine.createSpy('categoriesEq2').and.returnValue({ order: categoriesOrder1Spy });
    const categoriesEqSpy = jasmine.createSpy('categoriesEq').and.returnValue({ eq: categoriesEq2Spy, order: categoriesOrder1Spy });
    const categoriesSelectSpy = jasmine.createSpy('categoriesSelect').and.returnValue({ eq: categoriesEqSpy });

    // Mock for main operation
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
      if (table === 'gl_codes') {
        return { ...mainChain, select: glCodesSelectSpy };
      } else if (table === 'expense_categories' || table === 'expense_categories_with_gl') {
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
      },
      userId: mockUserId
    });

    const organizationSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrgId
    });

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error',
      'getErrorMessage'
    ]);
    loggerSpy.getErrorMessage.and.returnValue('Mock error message');

    const notificationSpy = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    TestBed.configureTestingModule({
      providers: [
        CategoryService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy },
        { provide: NotificationService, useValue: notificationSpy }
      ]
    });

    service = TestBed.inject(CategoryService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getGLCodes', () => {
    it('should return GL codes for the organization', (done) => {
      const mockResponse = { data: mockGLCodes, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eq2Spy = jasmine.createSpy('eq2').and.returnValue({ order: orderSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ eq: eq2Spy, order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getGLCodes().subscribe({
        next: (codes) => {
          expect(codes).toEqual(mockGLCodes);
          expect(selectSpy).toHaveBeenCalledWith('*');
          done();
        },
        error: done.fail
      });
    });

    it('should filter active GL codes when activeOnly is true', (done) => {
      const mockResponse = { data: [mockGLCode], error: null };
      // Create a thenable object that also has eq() method for chaining
      const createThenable = () => {
        const thenable: any = {
          then: (fn: (r: any) => void) => Promise.resolve(mockResponse).then(fn),
          eq: jasmine.createSpy('filterEq').and.callFake(() => createThenable())
        };
        return thenable;
      };
      const orderSpy = jasmine.createSpy('order').and.callFake(() => createThenable());
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getGLCodes(true).subscribe({
        next: (codes) => {
          expect(codes).toEqual([mockGLCode]);
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

      service.getGLCodes().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createGLCode', () => {
    const newCode = {
      code: '6000',
      name: 'Equipment',
      description: 'Equipment expenses'
    };

    it('should create a GL code successfully', (done) => {
      const mockResponse = { data: { ...mockGLCode, ...newCode, id: 'gl-new' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('insert', mockResponse) as any;

      service.createGLCode(newCode).subscribe({
        next: (code) => {
          expect(code.name).toBe(newCode.name);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
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

      service.createGLCode(newCode).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateGLCode', () => {
    const updates = {
      name: 'Updated Travel Expenses'
    };

    it('should update a GL code successfully', (done) => {
      const updatedCode = { ...mockGLCode, ...updates };
      const mockResponse = { data: updatedCode, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.updateGLCode(mockGLCodeId, updates).subscribe({
        next: (code) => {
          expect(code.name).toBe(updates.name);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteGLCode', () => {
    it('should delete a GL code successfully', (done) => {
      const mockResponse = { error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('delete', mockResponse) as any;

      service.deleteGLCode(mockGLCodeId).subscribe({
        next: () => {
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('GL Code deleted');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getCategories', () => {
    it('should return categories for the organization', (done) => {
      const mockResponse = { data: mockCategories, error: null };
      const order2Spy = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const order1Spy = jasmine.createSpy('order1').and.returnValue({ order: order2Spy });
      const eq2Spy = jasmine.createSpy('eq2').and.returnValue({ order: order1Spy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ eq: eq2Spy, order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getCategories().subscribe({
        next: (categories) => {
          expect(categories).toEqual(mockCategories);
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

      service.getCategories().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getActiveCategories', () => {
    it('should return only active categories', (done) => {
      const mockResponse = { data: mockCategories, error: null };
      // Create a thenable object that also has eq() method for chaining
      const createThenable = () => {
        const thenable: any = {
          then: (fn: (r: any) => void) => Promise.resolve(mockResponse).then(fn),
          eq: jasmine.createSpy('filterEq').and.callFake(() => createThenable()),
          order: jasmine.createSpy('order').and.callFake(() => createThenable())
        };
        return thenable;
      };
      const order1Spy = jasmine.createSpy('order1').and.callFake(() => createThenable());
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: order1Spy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getActiveCategories().subscribe({
        next: (categories) => {
          expect(categories).toEqual(mockCategories);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createCategory', () => {
    const newCategory = {
      name: 'New Category',
      description: 'A new category'
    };

    it('should create a category successfully', (done) => {
      const mockResponse = { data: { ...mockCategory, ...newCategory, id: 'cat-new' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('insert', mockResponse) as any;

      service.createCategory(newCategory).subscribe({
        next: (category) => {
          expect(category.name).toBe(newCategory.name);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
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

      service.createCategory(newCategory).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateCategory', () => {
    const updates = {
      name: 'Updated Fuel'
    };

    it('should update a category successfully', (done) => {
      const updatedCategory = { ...mockCategory, ...updates };
      const mockResponse = { data: updatedCategory, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.updateCategory(mockCategoryId, updates).subscribe({
        next: (category) => {
          expect(category.name).toBe(updates.name);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteCategory', () => {
    it('should delete a category successfully', (done) => {
      const mockResponse = { error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('delete', mockResponse) as any;

      service.deleteCategory(mockCategoryId).subscribe({
        next: () => {
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Category deleted');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('helper methods', () => {
    it('getGLCodeById should return GL code from cache', () => {
      // First populate the cache
      (service as any).glCodesSubject.next(mockGLCodes);

      const code = service.getGLCodeById(mockGLCodeId);
      expect(code).toEqual(mockGLCode);
    });

    it('getGLCodeById should return undefined for unknown ID', () => {
      (service as any).glCodesSubject.next(mockGLCodes);

      const code = service.getGLCodeById('unknown-id');
      expect(code).toBeUndefined();
    });

    it('getCategoryById should return category from cache', () => {
      (service as any).categoriesSubject.next(mockCategories);

      const category = service.getCategoryById(mockCategoryId);
      expect(category).toEqual(mockCategory);
    });

    it('getCategoryByName should return category from cache', () => {
      (service as any).categoriesSubject.next(mockCategories);

      const category = service.getCategoryByName('Fuel');
      expect(category).toEqual(mockCategory);
    });
  });
});
