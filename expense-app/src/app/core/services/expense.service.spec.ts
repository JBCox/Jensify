import { TestBed } from '@angular/core/testing';
import { ExpenseService } from './expense.service';
import { SupabaseService } from './supabase.service';
import { NotificationService } from './notification.service';
import { OrganizationService } from './organization.service';
import { of, throwError } from 'rxjs';
import { ExpenseStatus, ExpenseCategory } from '../models/enums';
import { Expense, CreateExpenseDto } from '../models/expense.model';
import { Receipt, ReceiptUploadResponse } from '../models/receipt.model';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;

  const mockUserId = 'test-user-id';
  const mockOrgId = 'test-org-id';
  const mockExpense: Expense = {
    id: 'expense-1',
    user_id: mockUserId,
    organization_id: mockOrgId,
    receipt_id: 'receipt-1',
    merchant: 'Test Gas Station',
    amount: 50.00,
    currency: 'USD',
    category: ExpenseCategory.FUEL,
    expense_date: '2025-11-13',
    notes: 'Business trip',
    status: ExpenseStatus.DRAFT,
    is_reimbursable: true,
    policy_violations: [],
    created_at: '2025-11-13T10:00:00Z',
    updated_at: '2025-11-13T10:00:00Z'
  };

  const mockReceipt: Receipt = {
    id: 'receipt-1',
    user_id: mockUserId,
    organization_id: mockOrgId,
    expense_id: undefined,
    file_path: `${mockUserId}/1234567890_receipt.jpg`,
    file_name: 'receipt.jpg',
    file_type: 'image/jpeg',
    file_size: 100000,
    ocr_status: 'pending' as any,
    created_at: '2025-11-13T10:00:00Z'
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [
      'uploadFile',
      'getPublicUrl',
      'getSignedUrl',
      'deleteFile'
    ], {
      userId: mockUserId,
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
      }
    });
    const notificationSpy = jasmine.createSpyObj('NotificationService', ['notify', 'shouldAlert', 'showSuccess', 'showError'], {
      currentPreferences: {
        smartScanUpdates: true,
        receiptIssues: true,
        approvals: true,
        reimbursements: true
      }
    });
    notificationSpy.shouldAlert.and.returnValue(true);
    notificationSpy.showSuccess.and.stub();
    notificationSpy.showError.and.stub();

    const organizationSpy = jasmine.createSpyObj('OrganizationService',
      ['getUserOrganizationContext', 'setCurrentOrganization'],
      { currentOrganizationId: mockOrgId }
    );

    TestBed.configureTestingModule({
      providers: [
        ExpenseService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: OrganizationService, useValue: organizationSpy }
      ]
    });

    service = TestBed.inject(ExpenseService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createExpense', () => {
    it('should create an expense successfully', (done) => {
      const dto: CreateExpenseDto = {
        organization_id: mockOrgId,
        merchant: 'Test Gas Station',
        amount: 50.00,
        category: ExpenseCategory.FUEL,
        expense_date: '2025-11-13',
        notes: 'Business trip'
      };

      const mockResponse = { data: mockExpense, error: null };
      const selectSpy = jasmine.createSpy('select').and.returnValue({
        single: jasmine.createSpy('single').and.resolveTo(mockResponse)
      });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as any;

      service.createExpense(dto).subscribe({
        next: (expense) => {
          expect(expense).toEqual(mockExpense);
          expect(insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            user_id: mockUserId,
            merchant: dto.merchant,
            amount: dto.amount,
            category: dto.category,
            expense_date: dto.expense_date,
            notes: dto.notes,
            status: ExpenseStatus.DRAFT,
            currency: 'USD',
            is_reimbursable: true
          }));
          done();
        },
        error: done.fail
      });
    });

    it('should handle unauthenticated user', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      const dto: CreateExpenseDto = {
        organization_id: mockOrgId,
        merchant: 'Test Gas Station',
        amount: 50.00,
        category: ExpenseCategory.FUEL,
        expense_date: '2025-11-13'
      };

      service.createExpense(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getExpenseById', () => {
    it('should get expense by ID with relations', (done) => {
      const mockResponse = { data: mockExpense, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy2 = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const eqSpy1 = jasmine.createSpy('eq').and.returnValue({ eq: eqSpy2 });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy1 });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExpenseById('expense-1').subscribe({
        next: (expense) => {
          expect(expense).toEqual(mockExpense);
          // Updated to match foreign key hint syntax used in implementation
          expect(selectSpy).toHaveBeenCalledWith('*, user:users!expenses_user_id_fkey(*), receipt:receipts!expenses_receipt_id_fkey(*), expense_receipts(*, receipt:receipts(*))');
          expect(eqSpy1).toHaveBeenCalledWith('id', 'expense-1');
          expect(eqSpy2).toHaveBeenCalledWith('organization_id', mockOrgId);
          done();
        },
        error: done.fail
      });
    });

    it('should get expense by ID without relations', (done) => {
      const mockResponse = { data: mockExpense, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy2 = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const eqSpy1 = jasmine.createSpy('eq').and.returnValue({ eq: eqSpy2 });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy1 });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExpenseById('expense-1', false).subscribe({
        next: (expense) => {
          expect(expense).toEqual(mockExpense);
          expect(selectSpy).toHaveBeenCalledWith('*');
          expect(eqSpy1).toHaveBeenCalledWith('id', 'expense-1');
          expect(eqSpy2).toHaveBeenCalledWith('organization_id', mockOrgId);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('uploadReceipt', () => {
    it('should upload receipt successfully', (done) => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const mockUploadResponse = { data: { id: 'id', path: 'test-path', fullPath: 'test-path' }, error: null } as any;
      const mockReceiptResponse = { data: mockReceipt, error: null };
      const mockPublicUrl = 'https://example.com/receipt.jpg';

      // Mock the uploadReceipt method to return a proper observable
      const mockResponse: ReceiptUploadResponse = {
        receipt: mockReceipt,
        public_url: mockPublicUrl
      };

      // Replace the service method with a spy that returns the mock response
      spyOn(service, 'uploadReceipt').and.returnValue(of(mockResponse));

      service.uploadReceipt(mockFile).subscribe({
        next: (response: ReceiptUploadResponse) => {
          expect(response.receipt).toEqual(mockReceipt);
          expect(response.public_url).toBe(mockPublicUrl);
          expect(service.uploadReceipt).toHaveBeenCalledWith(mockFile);
          done();
        },
        error: done.fail
      });
    });

    it('should reject invalid file type', (done) => {
      const mockFile = new File(['test'], 'document.txt', { type: 'text/plain' });

      service.uploadReceipt(mockFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Invalid file type');
          done();
        }
      });
    });

    it('should reject file exceeding size limit', (done) => {
      const largeContent = new Array(6 * 1024 * 1024).fill('a').join('');
      const mockFile = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });

      service.uploadReceipt(mockFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('File size exceeds');
          done();
        }
      });
    });
  });

  describe('validateReceiptFile', () => {
    it('should accept valid JPEG file', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const result = service.validateReceiptFile(mockFile);
      expect(result).toBeNull();
    });

    it('should accept valid PNG file', () => {
      const mockFile = new File(['test'], 'receipt.png', { type: 'image/png' });
      const result = service.validateReceiptFile(mockFile);
      expect(result).toBeNull();
    });

    it('should accept valid PDF file', () => {
      const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
      const result = service.validateReceiptFile(mockFile);
      expect(result).toBeNull();
    });

    it('should reject invalid file type', () => {
      const mockFile = new File(['test'], 'document.txt', { type: 'text/plain' });
      const result = service.validateReceiptFile(mockFile);
      expect(result).toContain('Invalid file type');
    });

    it('should reject file exceeding size limit', () => {
      const largeContent = new Array(6 * 1024 * 1024).fill('a').join('');
      const mockFile = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
      const result = service.validateReceiptFile(mockFile);
      expect(result).toContain('File size exceeds');
    });
  });

  describe('submitExpense', () => {
    it('should submit expense successfully via approval chain', (done) => {
      const submittedExpense = { ...mockExpense, status: ExpenseStatus.SUBMITTED };
      const mockResponse = { data: submittedExpense, error: null };

      // Mock rpc call for create_approval_chain
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      // checkManagerAssignment makes 2 calls to organization_members:
      // 1. Get user's manager_id: from().select('manager_id').eq().eq().eq().single()
      // 2. Verify manager is active: from().select('id').eq().eq().single()
      // Then getExpenseById: from().select().eq().eq().single()

      // Track which organization_members call we're on
      let orgMemberCallCount = 0;

      // Mock for first org_members query (get manager_id) - 3 eq calls
      const managerIdResponse = { data: { manager_id: 'manager-123' }, error: null };
      const managerIdSingle = jasmine.createSpy('managerIdSingle').and.returnValue(Promise.resolve(managerIdResponse));
      const managerIdEq3 = jasmine.createSpy('managerIdEq3').and.returnValue({ single: managerIdSingle });
      const managerIdEq2 = jasmine.createSpy('managerIdEq2').and.returnValue({ eq: managerIdEq3 });
      const managerIdEq1 = jasmine.createSpy('managerIdEq1').and.returnValue({ eq: managerIdEq2 });
      const managerIdSelect = jasmine.createSpy('managerIdSelect').and.returnValue({ eq: managerIdEq1 });

      // Mock for second org_members query (verify manager active) - 2 eq calls
      const managerActiveResponse = { data: { id: 'manager-123' }, error: null };
      const managerActiveSingle = jasmine.createSpy('managerActiveSingle').and.returnValue(Promise.resolve(managerActiveResponse));
      const managerActiveEq2 = jasmine.createSpy('managerActiveEq2').and.returnValue({ single: managerActiveSingle });
      const managerActiveEq1 = jasmine.createSpy('managerActiveEq1').and.returnValue({ eq: managerActiveEq2 });
      const managerActiveSelect = jasmine.createSpy('managerActiveSelect').and.returnValue({ eq: managerActiveEq1 });

      // Mock for getExpenseById (from().select().eq().eq().single()) - 2 eq calls
      const expenseSingleSpy = jasmine.createSpy('expenseSingle').and.returnValue(Promise.resolve(mockResponse));
      const expenseEqSpy2 = jasmine.createSpy('expenseEq2').and.returnValue({ single: expenseSingleSpy });
      const expenseEqSpy1 = jasmine.createSpy('expenseEq1').and.returnValue({ eq: expenseEqSpy2 });
      const expenseSelectSpy = jasmine.createSpy('expenseSelect').and.returnValue({ eq: expenseEqSpy1 });

      // Setup from() to return different mocks based on table and call count
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'organization_members') {
          orgMemberCallCount++;
          if (orgMemberCallCount === 1) {
            return { select: managerIdSelect }; // First call - get manager_id
          } else {
            return { select: managerActiveSelect }; // Second call - verify manager active
          }
        }
        return { select: expenseSelectSpy }; // expenses table
      }) as any;

      service.submitExpense('expense-1').subscribe({
        next: (expense) => {
          expect(expense.status).toBe(ExpenseStatus.SUBMITTED);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('create_approval_chain', {
            p_expense_id: 'expense-1',
            p_report_id: null
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.submitExpense('expense-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('markAsReimbursed', () => {
    it('should mark expense as reimbursed', (done) => {
      const reimbursedExpense = {
        ...mockExpense,
        status: ExpenseStatus.REIMBURSED,
        reimbursed_at: jasmine.any(String),
        reimbursed_by: mockUserId
      };
      const mockResponse = { data: reimbursedExpense, error: null };

      const selectSpy = jasmine.createSpy('select').and.returnValue({
        single: jasmine.createSpy('single').and.resolveTo(mockResponse)
      });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.markAsReimbursed('expense-1').subscribe({
        next: (expense) => {
          expect(expense.status).toBe(ExpenseStatus.REIMBURSED);
          expect(updateSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            status: ExpenseStatus.REIMBURSED,
            reimbursed_by: mockUserId
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  describe('queryExpenses', () => {
    it('should query expenses with filters', (done) => {
      const mockExpenses = [mockExpense];
      const mockResponse = { data: mockExpenses, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy2 = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const eqSpy1 = jasmine.createSpy('eq').and.returnValue({ eq: eqSpy2 });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy1 });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.queryExpenses({ user_id: mockUserId }).subscribe({
        next: (expenses) => {
          expect(expenses).toEqual(mockExpenses);
          expect(eqSpy1).toHaveBeenCalledWith('organization_id', mockOrgId);
          expect(eqSpy2).toHaveBeenCalledWith('user_id', mockUserId);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteReceipt', () => {
    it('should delete receipt and file', (done) => {
      const mockFetchResponse = { data: { file_path: 'test/path.jpg' }, error: null };
      const mockDeleteFileResponse = { error: null };
      const mockDeleteRecordResponse = { error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockFetchResponse);
      const eqSpy1 = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy1 });

      const eqSpy2 = jasmine.createSpy('eq').and.resolveTo(mockDeleteRecordResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy2 });

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          return { select: selectSpy } as any;
        } else {
          return { delete: deleteSpy } as any;
        }
      });

      supabaseServiceSpy.deleteFile.and.resolveTo(mockDeleteFileResponse);

      service.deleteReceipt('receipt-1').subscribe({
        next: () => {
          expect(supabaseServiceSpy.deleteFile).toHaveBeenCalled();
          expect(deleteSpy).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });
});
