import { TestBed } from '@angular/core/testing';
import { ExpenseSplittingService } from './expense-splitting.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { NotificationService } from './notification.service';
import { LoggerService } from './logger.service';
import { ExpenseCategory } from '../models/enums';
import { CreateExpenseItemDto, ExpenseItem } from '../models/expense.model';

describe('ExpenseSplittingService', () => {
  let service: ExpenseSplittingService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockExpenseId = 'expense-1';
  const mockItemId = 'item-1';

  const mockExpenseItem: ExpenseItem = {
    id: 'item-1',
    expense_id: mockExpenseId,
    organization_id: mockOrgId,
    line_number: 1,
    description: 'Office supplies',
    amount: 50.00,
    category: ExpenseCategory.OFFICE_SUPPLIES,
    receipt_id: null,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockExpenseItems: ExpenseItem[] = [
    mockExpenseItem,
    {
      ...mockExpenseItem,
      id: 'item-2',
      line_number: 2,
      description: 'Fuel',
      amount: 50.00,
      category: ExpenseCategory.FUEL
    }
  ];

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

    const notificationSpy = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error',
      'getErrorMessage'
    ]);
    loggerSpy.getErrorMessage.and.returnValue('Mock error message');

    TestBed.configureTestingModule({
      providers: [
        ExpenseSplittingService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(ExpenseSplittingService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getExpenseItems', () => {
    it('should return expense items for an expense', (done) => {
      const mockResponse = { data: mockExpenseItems, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExpenseItems(mockExpenseId).subscribe({
        next: (items) => {
          expect(items).toEqual(mockExpenseItems);
          expect(selectSpy).toHaveBeenCalledWith('*, receipt:receipts(*)');
          expect(eqSpy).toHaveBeenCalledWith('expense_id', mockExpenseId);
          expect(orderSpy).toHaveBeenCalledWith('line_number', { ascending: true });
          done();
        },
        error: done.fail
      });
    });

    it('should handle database errors', (done) => {
      const mockError = { message: 'Database error' };
      const mockResponse = { data: null, error: mockError };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExpenseItems(mockExpenseId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error).toBeTruthy();
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('splitExpense', () => {
    const validItems: CreateExpenseItemDto[] = [
      { description: 'Office supplies', amount: 50.00, category: ExpenseCategory.OFFICE_SUPPLIES },
      { description: 'Fuel', amount: 50.00, category: ExpenseCategory.FUEL }
    ];

    it('should split expense into multiple items', (done) => {
      const mockResponse = { data: mockExpenseItems, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.splitExpense(mockExpenseId, validItems).subscribe({
        next: (items) => {
          expect(items).toEqual(mockExpenseItems);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('split_expense', {
            p_expense_id: mockExpenseId,
            p_items: validItems.map(item => ({
              description: item.description,
              amount: item.amount,
              category: item.category
            }))
          });
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Expense split successfully');
          done();
        },
        error: done.fail
      });
    });

    it('should reject with less than 2 items', (done) => {
      const singleItem: CreateExpenseItemDto[] = [
        { description: 'Office supplies', amount: 100.00, category: ExpenseCategory.OFFICE_SUPPLIES }
      ];

      service.splitExpense(mockExpenseId, singleItem).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('At least 2 items required to split an expense');
          done();
        }
      });
    });

    it('should reject with empty items array', (done) => {
      service.splitExpense(mockExpenseId, []).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('At least 2 items required to split an expense');
          done();
        }
      });
    });

    it('should handle RPC errors', (done) => {
      const mockError = { message: 'Split failed' };
      const mockResponse = { data: null, error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.splitExpense(mockExpenseId, validItems).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(notificationServiceSpy.showError).toHaveBeenCalled();
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('unsplitExpense', () => {
    it('should unsplit expense successfully', (done) => {
      const mockResponse = { data: null, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.unsplitExpense(mockExpenseId).subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('unsplit_expense', {
            p_expense_id: mockExpenseId
          });
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Expense unsplit successfully');
          done();
        },
        error: done.fail
      });
    });

    it('should handle unsplit errors', (done) => {
      const mockError = { message: 'Unsplit failed' };
      const mockResponse = { data: null, error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.unsplitExpense(mockExpenseId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(notificationServiceSpy.showError).toHaveBeenCalled();
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('addExpenseItem', () => {
    const newItem: CreateExpenseItemDto = {
      description: 'New item',
      amount: 25.00,
      category: ExpenseCategory.MISCELLANEOUS
    };

    it('should add expense item successfully', (done) => {
      const mockResponse = { data: mockExpenseItem, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as any;

      service.addExpenseItem(mockExpenseId, newItem).subscribe({
        next: (item) => {
          expect(item).toEqual(mockExpenseItem);
          expect(insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            expense_id: mockExpenseId,
            organization_id: mockOrgId,
            description: newItem.description,
            amount: newItem.amount,
            category: newItem.category
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

      service.addExpenseItem(mockExpenseId, newItem).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateExpenseItem', () => {
    const updates: Partial<CreateExpenseItemDto> = {
      description: 'Updated description',
      amount: 75.00
    };

    it('should update expense item successfully', (done) => {
      const updatedItem = { ...mockExpenseItem, ...updates };
      const mockResponse = { data: updatedItem, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updateExpenseItem(mockItemId, updates).subscribe({
        next: (item) => {
          expect(item.description).toBe(updates.description!);
          expect(item.amount).toBe(updates.amount!);
          expect(eqSpy).toHaveBeenCalledWith('id', mockItemId);
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

      service.updateExpenseItem(mockItemId, updates).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('deleteExpenseItem', () => {
    it('should delete expense item successfully', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy
      }) as any;

      service.deleteExpenseItem(mockItemId).subscribe({
        next: () => {
          expect(deleteSpy).toHaveBeenCalled();
          expect(eqSpy).toHaveBeenCalledWith('id', mockItemId);
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

      service.deleteExpenseItem(mockItemId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('validateSplitTotal', () => {
    it('should return null for valid split', () => {
      const items: CreateExpenseItemDto[] = [
        { description: 'Item 1', amount: 50.00, category: ExpenseCategory.FUEL },
        { description: 'Item 2', amount: 50.00, category: ExpenseCategory.INDIVIDUAL_MEALS }
      ];
      const result = service.validateSplitTotal(100.00, items);
      expect(result).toBeNull();
    });

    it('should allow tolerance of 1 cent', () => {
      const items: CreateExpenseItemDto[] = [
        { description: 'Item 1', amount: 33.34, category: ExpenseCategory.FUEL },
        { description: 'Item 2', amount: 33.33, category: ExpenseCategory.INDIVIDUAL_MEALS },
        { description: 'Item 3', amount: 33.33, category: ExpenseCategory.OFFICE_SUPPLIES }
      ];
      // Total is 100.00 exactly
      const result = service.validateSplitTotal(100.00, items);
      expect(result).toBeNull();
    });

    it('should return error for mismatched total', () => {
      const items: CreateExpenseItemDto[] = [
        { description: 'Item 1', amount: 40.00, category: ExpenseCategory.FUEL },
        { description: 'Item 2', amount: 50.00, category: ExpenseCategory.INDIVIDUAL_MEALS }
      ];
      const result = service.validateSplitTotal(100.00, items);
      expect(result).toContain('Split items total');
      expect(result).toContain('must equal expense total');
    });

    it('should handle empty items array', () => {
      const result = service.validateSplitTotal(100.00, []);
      expect(result).toContain('Split items total ($0.00) must equal expense total ($100.00)');
    });
  });
});
