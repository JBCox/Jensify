import { TestBed } from '@angular/core/testing';
import { ExpenseReceiptService } from './expense-receipt.service';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';
import { Receipt } from '../models/receipt.model';
import { OcrStatus } from '../models/enums';

describe('ExpenseReceiptService', () => {
  let service: ExpenseReceiptService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  // Mock data
  const mockExpenseId = 'expense-123';
  const mockReceiptId = 'receipt-456';

  const mockReceipts: Receipt[] = [
    {
      id: 'receipt-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      file_path: '/receipts/1.jpg',
      file_name: 'receipt1.jpg',
      file_type: 'image/jpeg',
      file_size: 1024,
      ocr_status: OcrStatus.COMPLETED,
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'receipt-2',
      organization_id: 'org-1',
      user_id: 'user-1',
      file_path: '/receipts/2.jpg',
      file_name: 'receipt2.jpg',
      file_type: 'image/jpeg',
      file_size: 2048,
      ocr_status: OcrStatus.COMPLETED,
      created_at: '2024-01-02T00:00:00Z'
    }
  ];

  // Create a mock Supabase client
  let mockSupabaseClient: any;

  beforeEach(() => {
    // Reset mock client for each test
    mockSupabaseClient = {
      from: jasmine.createSpy('from').and.callFake((table: string) => {
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.resolveTo({
                data: [
                  { receipt: mockReceipts[0] },
                  { receipt: mockReceipts[1] }
                ],
                error: null
              }),
              eq: jasmine.createSpy('eq').and.resolveTo({
                data: [],
                error: null
              })
            })
          }),
          insert: jasmine.createSpy('insert').and.resolveTo({ error: null }),
          update: jasmine.createSpy('update').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              eq: jasmine.createSpy('eq').and.resolveTo({ error: null })
            })
          }),
          delete: jasmine.createSpy('delete').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              eq: jasmine.createSpy('eq').and.resolveTo({ error: null })
            })
          })
        };
      })
    };

    supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: mockSupabaseClient
    });

    loggerServiceSpy = jasmine.createSpyObj('LoggerService', ['error', 'getErrorMessage']);
    loggerServiceSpy.getErrorMessage.and.returnValue('Test error message');

    TestBed.configureTestingModule({
      providers: [
        ExpenseReceiptService,
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: LoggerService, useValue: loggerServiceSpy }
      ]
    });

    service = TestBed.inject(ExpenseReceiptService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =============================================================================
  // getExpenseReceipts TESTS
  // =============================================================================

  describe('getExpenseReceipts', () => {
    it('should get receipts for an expense', (done) => {
      service.getExpenseReceipts(mockExpenseId).subscribe({
        next: (receipts) => {
          expect(receipts.length).toBe(2);
          expect(receipts[0].id).toBe('receipt-1');
          expect(receipts[1].id).toBe('receipt-2');
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('expense_receipts');
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when no receipts found', (done) => {
      // Override mock to return empty data
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.resolveTo({
              data: [],
              error: null
            })
          })
        })
      });

      service.getExpenseReceipts(mockExpenseId).subscribe({
        next: (receipts) => {
          expect(receipts).toEqual([]);
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when data is null', (done) => {
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.resolveTo({
              data: null,
              error: null
            })
          })
        })
      });

      service.getExpenseReceipts(mockExpenseId).subscribe({
        next: (receipts) => {
          expect(receipts).toEqual([]);
          done();
        },
        error: done.fail
      });
    });

    it('should handle error when getting receipts fails', (done) => {
      const mockError = { message: 'Database error', code: 'DB_ERROR' };
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.resolveTo({
              data: null,
              error: mockError
            })
          })
        })
      });

      service.getExpenseReceipts(mockExpenseId).subscribe({
        next: () => done.fail('Should have errored'),
        error: (err) => {
          expect(err.message).toBe('Test error message');
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });

    it('should filter out null receipts', (done) => {
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.resolveTo({
              data: [
                { receipt: mockReceipts[0] },
                { receipt: null },
                { receipt: mockReceipts[1] }
              ],
              error: null
            })
          })
        })
      });

      service.getExpenseReceipts(mockExpenseId).subscribe({
        next: (receipts) => {
          expect(receipts.length).toBe(2);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // attachReceipt TESTS
  // =============================================================================

  describe('attachReceipt', () => {
    it('should attach a receipt to an expense', (done) => {
      // Mock count query
      mockSupabaseClient.from = jasmine.createSpy('from').and.callFake((table: string) => {
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({
              count: 0
            })
          }),
          insert: jasmine.createSpy('insert').and.resolveTo({ error: null })
        };
      });

      service.attachReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => {
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('expense_receipts');
          done();
        },
        error: done.fail
      });
    });

    it('should set isPrimary to true if first receipt', (done) => {
      let insertedData: any = null;
      mockSupabaseClient.from = jasmine.createSpy('from').and.callFake((table: string) => {
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({
              count: 0
            })
          }),
          insert: jasmine.createSpy('insert').and.callFake((data: any) => {
            insertedData = data;
            return Promise.resolve({ error: null });
          })
        };
      });

      service.attachReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => {
          expect(insertedData.is_primary).toBe(true);
          expect(insertedData.display_order).toBe(0);
          done();
        },
        error: done.fail
      });
    });

    it('should respect explicit isPrimary parameter', (done) => {
      let insertedData: any = null;
      mockSupabaseClient.from = jasmine.createSpy('from').and.callFake((table: string) => {
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({
              count: 2
            })
          }),
          insert: jasmine.createSpy('insert').and.callFake((data: any) => {
            insertedData = data;
            return Promise.resolve({ error: null });
          })
        };
      });

      service.attachReceipt(mockExpenseId, mockReceiptId, true).subscribe({
        next: () => {
          expect(insertedData.is_primary).toBe(true);
          done();
        },
        error: done.fail
      });
    });

    it('should handle error when attaching receipt fails', (done) => {
      const mockError = { message: 'Insert error' };
      mockSupabaseClient.from = jasmine.createSpy('from').and.callFake((table: string) => {
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({
              count: 0
            })
          }),
          insert: jasmine.createSpy('insert').and.resolveTo({ error: mockError })
        };
      });

      service.attachReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => done.fail('Should have errored'),
        error: (err) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // =============================================================================
  // detachReceipt TESTS
  // =============================================================================

  describe('detachReceipt', () => {
    it('should detach a receipt from an expense', (done) => {
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({ error: null })
          })
        })
      });

      service.detachReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => {
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('expense_receipts');
          done();
        },
        error: done.fail
      });
    });

    it('should handle error when detaching receipt fails', (done) => {
      const mockError = { message: 'Delete error' };
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({ error: mockError })
          })
        })
      });

      service.detachReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => done.fail('Should have errored'),
        error: (err) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // =============================================================================
  // reorderReceipts TESTS
  // =============================================================================

  describe('reorderReceipts', () => {
    it('should reorder receipts', (done) => {
      const receiptIds = ['receipt-1', 'receipt-2', 'receipt-3'];
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({ error: null })
          })
        })
      });

      service.reorderReceipts(mockExpenseId, receiptIds).subscribe({
        next: () => {
          expect(mockSupabaseClient.from).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should handle error when reordering fails', (done) => {
      const mockError = { message: 'Update error' };
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({ error: mockError })
          })
        })
      });

      service.reorderReceipts(mockExpenseId, ['receipt-1']).subscribe({
        next: () => done.fail('Should have errored'),
        error: (err) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // =============================================================================
  // setPrimaryReceipt TESTS
  // =============================================================================

  describe('setPrimaryReceipt', () => {
    it('should set a receipt as primary', (done) => {
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({ error: null })
          })
        })
      });

      service.setPrimaryReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => {
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('expense_receipts');
          done();
        },
        error: done.fail
      });
    });

    it('should handle error when setting primary fails', (done) => {
      const mockError = { message: 'Update error' };
      mockSupabaseClient.from = jasmine.createSpy('from').and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.resolveTo({ error: mockError })
          })
        })
      });

      service.setPrimaryReceipt(mockExpenseId, mockReceiptId).subscribe({
        next: () => done.fail('Should have errored'),
        error: (err) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });
});
