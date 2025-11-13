import { TestBed } from '@angular/core/testing';
import { ExpenseService } from './expense.service';
import { SupabaseService } from './supabase.service';
import { of, throwError } from 'rxjs';
import { ExpenseStatus, ExpenseCategory } from '../models/enums';
import { Expense, CreateExpenseDto } from '../models/expense.model';
import { Receipt, ReceiptUploadResponse } from '../models/receipt.model';

describe('ExpenseService', () => {
  let service: ExpenseService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;

  const mockUserId = 'test-user-id';
  const mockExpense: Expense = {
    id: 'expense-1',
    user_id: mockUserId,
    receipt_id: 'receipt-1',
    merchant: 'Test Gas Station',
    amount: 50.00,
    currency: 'USD',
    category: ExpenseCategory.GAS,
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
      'deleteFile'
    ], {
      userId: mockUserId,
      client: {
        from: jasmine.createSpy('from')
      }
    });

    TestBed.configureTestingModule({
      providers: [
        ExpenseService,
        { provide: SupabaseService, useValue: supabaseSpy }
      ]
    });

    service = TestBed.inject(ExpenseService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createExpense', () => {
    it('should create an expense successfully', (done) => {
      const dto: CreateExpenseDto = {
        merchant: 'Test Gas Station',
        amount: 50.00,
        category: ExpenseCategory.GAS,
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
      (supabaseServiceSpy as any).userId = null;

      const dto: CreateExpenseDto = {
        merchant: 'Test Gas Station',
        amount: 50.00,
        category: ExpenseCategory.GAS,
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
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExpenseById('expense-1').subscribe({
        next: (expense) => {
          expect(expense).toEqual(mockExpense);
          expect(selectSpy).toHaveBeenCalledWith('*, user:users(*), receipt:receipts(*)');
          expect(eqSpy).toHaveBeenCalledWith('id', 'expense-1');
          done();
        },
        error: done.fail
      });
    });

    it('should get expense by ID without relations', (done) => {
      const mockResponse = { data: mockExpense, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExpenseById('expense-1', false).subscribe({
        next: (expense) => {
          expect(expense).toEqual(mockExpense);
          expect(selectSpy).toHaveBeenCalledWith('*');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('uploadReceipt', () => {
    it('should upload receipt successfully', (done) => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const mockUploadResponse = { data: { path: 'test-path' }, error: null };
      const mockReceiptResponse = { data: mockReceipt, error: null };
      const mockPublicUrl = 'https://example.com/receipt.jpg';

      supabaseServiceSpy.uploadFile.and.resolveTo(mockUploadResponse);
      supabaseServiceSpy.getPublicUrl.and.returnValue(mockPublicUrl);

      const selectSpy = jasmine.createSpy('select').and.returnValue({
        single: jasmine.createSpy('single').and.resolveTo(mockReceiptResponse)
      });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as any;

      service.uploadReceipt(mockFile).subscribe({
        next: (response: ReceiptUploadResponse) => {
          expect(response.receipt).toEqual(mockReceipt);
          expect(response.public_url).toBe(mockPublicUrl);
          expect(supabaseServiceSpy.uploadFile).toHaveBeenCalled();
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
    it('should submit expense successfully', (done) => {
      const submittedExpense = { ...mockExpense, status: ExpenseStatus.SUBMITTED };
      const mockResponse = { data: submittedExpense, error: null };

      const selectSpy = jasmine.createSpy('select').and.returnValue({
        single: jasmine.createSpy('single').and.resolveTo(mockResponse)
      });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.submitExpense('expense-1').subscribe({
        next: (expense) => {
          expect(expense.status).toBe(ExpenseStatus.SUBMITTED);
          expect(updateSpy).toHaveBeenCalledWith({ status: ExpenseStatus.SUBMITTED });
          done();
        },
        error: done.fail
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
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.queryExpenses({ user_id: mockUserId }).subscribe({
        next: (expenses) => {
          expect(expenses).toEqual(mockExpenses);
          expect(eqSpy).toHaveBeenCalledWith('user_id', mockUserId);
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
