import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ReportService } from './report.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import {
  ExpenseReport,
  ReportStatus,
  ReportFilterOptions
} from '../models/report.model';
import { Expense } from '../models/expense.model';
import { ExpenseStatus } from '../models/enums';

describe('ReportService', () => {
  let service: ReportService;
  let supabaseServiceMock: jasmine.SpyObj<SupabaseService>;
  let orgServiceMock: jasmine.SpyObj<OrganizationService>;

  const mockReport: ExpenseReport = {
    id: 'report-123',
    organization_id: 'org-123',
    user_id: 'user-123',
    name: 'Test Report',
    description: 'Test description',
    start_date: '2025-01-01',
    end_date: '2025-01-31',
    status: ReportStatus.DRAFT,
    total_amount: 0,
    expense_count: 0,
    currency: 'USD',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    auto_created: false,
    auto_report_period: undefined
  };

  const mockExpense: Expense = {
    id: 'expense-123',
    organization_id: 'org-123',
    user_id: 'user-123',
    merchant: 'Test Merchant',
    amount: 50.00,
    expense_date: '2025-01-15',
    category: 'Meals',
    currency: 'USD',
    status: ExpenseStatus.DRAFT,
    is_reported: false,
    is_reimbursable: true,
    policy_violations: [],
    created_at: '2025-01-15T00:00:00Z',
    updated_at: '2025-01-15T00:00:00Z'
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', ['client']);
    const orgSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: 'org-123'
    });

    // Setup Supabase client mock
    supabaseSpy.client = {
      from: jasmine.createSpy('from'),
      rpc: jasmine.createSpy('rpc'),
      auth: {
        getUser: jasmine.createSpy('getUser').and.returnValue(
          Promise.resolve({ data: { user: { id: 'user-123' } }, error: null })
        )
      }
    } as any;

    TestBed.configureTestingModule({
      providers: [
        ReportService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: orgSpy }
      ]
    });

    service = TestBed.inject(ReportService);
    supabaseServiceMock = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    orgServiceMock = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // REPORT CRUD TESTS
  // ============================================================================

  describe('createReport', () => {
    it('should create draft report with auto-calculated total', (done) => {
      const createDto = {
        name: 'New Report',
        description: 'Test',
        start_date: '2025-01-01',
        end_date: '2025-01-31'
      };

      const mockQuery = {
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(
              Promise.resolve({ data: mockReport, error: null })
            )
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.createReport(createDto).subscribe({
        next: (report) => {
          expect(report).toEqual(mockReport);
          expect(mockQuery.insert).toHaveBeenCalledWith(jasmine.objectContaining({
            organization_id: 'org-123',
            status: ReportStatus.DRAFT,
            total_amount: 0
          }));
          done();
        },
        error: done.fail
      });
    });

    it('should create report with initial expenses', (done) => {
      const createDto = {
        name: 'New Report',
        description: 'Test',
        start_date: '2025-01-01',
        end_date: '2025-01-31',
        expense_ids: ['expense-123', 'expense-456']
      };

      let insertCallCount = 0;
      const mockQuery = {
        insert: jasmine.createSpy('insert').and.callFake(() => {
          insertCallCount++;
          if (insertCallCount === 1) {
            // First insert - report
            return {
              select: jasmine.createSpy('select').and.returnValue({
                single: jasmine.createSpy('single').and.returnValue(
                  Promise.resolve({ data: mockReport, error: null })
                )
              })
            };
          } else {
            // Second insert - junction records
            return Promise.resolve({ error: null });
          }
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.createReport(createDto).subscribe({
        next: (report) => {
          expect(report).toEqual(mockReport);
          expect(insertCallCount).toBe(2);
          done();
        },
        error: done.fail
      });
    });

    it('should throw error when no organization context', (done) => {
      Object.defineProperty(orgServiceMock, 'currentOrganizationId', { value: null });

      service.createReport({ name: 'Test', start_date: '2025-01-01', end_date: '2025-01-31' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toBe('No organization context');
          done();
        }
      });
    });
  });

  describe('getReportById', () => {
    it('should fetch report with nested expenses and receipts', (done) => {
      const reportWithExpenses = {
        ...mockReport,
        report_expenses: [{
          id: 'junction-123',
          report_id: 'report-123',
          expense_id: 'expense-123',
          display_order: 0,
          added_at: '2025-01-15T00:00:00Z',
          expense: mockExpense
        }]
      };

      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(
              Promise.resolve({ data: reportWithExpenses, error: null })
            )
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getReportById('report-123').subscribe({
        next: (report) => {
          expect(report.id).toBe('report-123');
          expect(report.report_expenses?.length).toBe(1);
          done();
        },
        error: done.fail
      });
    });

    xit('should handle report not found', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(
              Promise.resolve({ data: null, error: { message: 'Not found' } })
            )
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getReportById('invalid-id').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toContain('Failed to fetch report');
          done();
        }
      });
    });
  });

  describe('updateReport', () => {
    it('should update report fields', (done) => {
      const updateDto = { name: 'Updated Name' };
      const updatedReport = { ...mockReport, name: 'Updated Name' };

      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(
                Promise.resolve({ data: updatedReport, error: null })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.updateReport('report-123', updateDto).subscribe({
        next: (report) => {
          expect(report.name).toBe('Updated Name');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteReport', () => {
    it('should delete draft report', (done) => {
      const mockQuery = {
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(
            Promise.resolve({ error: null })
          )
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.deleteReport('report-123').subscribe({
        next: () => {
          expect(mockQuery.delete).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // EXPENSE MANAGEMENT TESTS
  // ============================================================================

  describe('addExpenseToReport', () => {
    it('should add expense with correct display order', (done) => {
      const mockSelectQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue({
              limit: jasmine.createSpy('limit').and.returnValue(
                Promise.resolve({ data: [{ display_order: 2 }], error: null })
              )
            })
          })
        })
      };

      const mockInsertQuery = {
        insert: jasmine.createSpy('insert').and.returnValue(
          Promise.resolve({ error: null })
        )
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValues(
        mockSelectQuery,
        mockInsertQuery
      );

      service.addExpenseToReport('report-123', 'expense-123').subscribe({
        next: () => {
          expect(mockInsertQuery.insert).toHaveBeenCalledWith(jasmine.objectContaining({
            report_id: 'report-123',
            expense_id: 'expense-123',
            display_order: 3
          }));
          done();
        },
        error: done.fail
      });
    });

    it('should start at order 0 for first expense', (done) => {
      const mockSelectQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue({
              limit: jasmine.createSpy('limit').and.returnValue(
                Promise.resolve({ data: [], error: null })
              )
            })
          })
        })
      };

      const mockInsertQuery = {
        insert: jasmine.createSpy('insert').and.returnValue(
          Promise.resolve({ error: null })
        )
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValues(
        mockSelectQuery,
        mockInsertQuery
      );

      service.addExpenseToReport('report-123', 'expense-123').subscribe({
        next: () => {
          expect(mockInsertQuery.insert).toHaveBeenCalledWith(jasmine.objectContaining({
            display_order: 0
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  describe('removeExpenseFromReport', () => {
    it('should remove expense from report', (done) => {
      const mockQuery = {
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ error: null })
            )
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.removeExpenseFromReport('report-123', 'expense-123').subscribe({
        next: () => {
          expect(mockQuery.delete).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('reorderExpenses', () => {
    it('should use batch RPC function for reordering', (done) => {
      const expenseIds = ['expense-1', 'expense-2', 'expense-3'];

      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ error: null })
      );

      service.reorderExpenses('report-123', expenseIds).subscribe({
        next: () => {
          expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith(
            'reorder_report_expenses',
            {
              p_report_id: 'report-123',
              p_expense_ids: expenseIds
            }
          );
          done();
        },
        error: done.fail
      });
    });

    it('should fallback to individual updates if RPC not available', (done) => {
      const expenseIds = ['expense-1', 'expense-2'];

      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ error: { code: '42883' } })
      );

      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ error: null })
            )
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.reorderExpenses('report-123', expenseIds).subscribe({
        next: () => {
          expect(mockQuery.update).toHaveBeenCalledTimes(2);
          done();
        },
        error: done.fail
      });
    });

    it('should handle empty expense array', (done) => {
      service.reorderExpenses('report-123', []).subscribe({
        next: () => {
          expect(supabaseServiceMock.client.rpc).not.toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // WORKFLOW STATE TRANSITIONS TESTS (Critical for Reports)
  // ============================================================================

  describe('submitReport', () => {
    it('should transition from draft to submitted via approval chain', (done) => {
      const reportWithExpenses = {
        ...mockReport,
        report_expenses: [{
          id: 'junction-123',
          report_id: 'report-123',
          expense_id: 'expense-123',
          display_order: 0,
          added_at: '2025-01-15T00:00:00Z',
          expense: {
            ...mockExpense,
            expense_receipts: [{
              id: 'er-123',
              expense_id: 'expense-123',
              receipt_id: 'receipt-123',
              display_order: 0,
              is_primary: true,
              created_at: '2025-01-15T00:00:00Z',
              updated_at: '2025-01-15T00:00:00Z'
            }]
          }
        }]
      };

      const submittedReport = { ...reportWithExpenses, status: ReportStatus.SUBMITTED };

      // Mock rpc call for create_approval_chain
      (supabaseServiceMock.client.rpc as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      // Mock getReportById for validation and final fetch
      // First call returns draft, second call returns submitted (after approval chain)
      let callCount = 0;
      spyOn(service, 'getReportById').and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          return of(reportWithExpenses);
        } else {
          return of(submittedReport);
        }
      });

      service.submitReport('report-123').subscribe({
        next: (report) => {
          expect(report.status).toBe(ReportStatus.SUBMITTED);
          expect(supabaseServiceMock.client.rpc).toHaveBeenCalledWith('create_approval_chain', {
            p_expense_id: null,
            p_report_id: 'report-123'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should reject empty report submission', (done) => {
      const emptyReport = {
        ...mockReport,
        report_expenses: []
      };

      spyOn(service, 'getReportById').and.returnValue(of(emptyReport));

      service.submitReport('report-123').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toContain('Cannot submit empty report');
          done();
        }
      });
    });

    it('should reject submission if expenses missing receipts', (done) => {
      const reportWithoutReceipts = {
        ...mockReport,
        report_expenses: [{
          id: 'junction-123',
          report_id: 'report-123',
          expense_id: 'expense-123',
          display_order: 0,
          added_at: '2025-01-15T00:00:00Z',
          expense: {
            ...mockExpense,
            expense_receipts: []
          }
        }]
      };

      spyOn(service, 'getReportById').and.returnValue(of(reportWithoutReceipts));

      service.submitReport('report-123').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toContain('must have receipts');
          done();
        }
      });
    });

    it('should reject submission if expenses missing required fields', (done) => {
      const reportWithInvalidExpense = {
        ...mockReport,
        report_expenses: [{
          id: 'junction-123',
          report_id: 'report-123',
          expense_id: 'expense-123',
          display_order: 0,
          added_at: '2025-01-15T00:00:00Z',
          expense: {
            ...mockExpense,
            merchant: '',  // Empty string instead of null
            expense_receipts: [{
              id: 'er-123',
              expense_id: 'expense-123',
              receipt_id: 'receipt-123',
              display_order: 0,
              is_primary: true,
              created_at: '2025-01-15T00:00:00Z',
              updated_at: '2025-01-15T00:00:00Z'
            }]
          }
        }]
      };

      spyOn(service, 'getReportById').and.returnValue(of(reportWithInvalidExpense));

      service.submitReport('report-123').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (err) => {
          expect(err.message).toContain('need merchant, amount, category, and date');
          done();
        }
      });
    });
  });

  describe('approveReport', () => {
    it('should transition from submitted to approved', (done) => {
      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(
                Promise.resolve({
                  data: { ...mockReport, status: ReportStatus.APPROVED },
                  error: null
                })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.approveReport('report-123').subscribe({
        next: (report) => {
          expect(report.status).toBe(ReportStatus.APPROVED);
          expect(mockQuery.update).toHaveBeenCalledWith(jasmine.objectContaining({
            status: ReportStatus.APPROVED,
            approved_by: 'user-123'
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  describe('rejectReport', () => {
    it('should transition from submitted to rejected with reason', (done) => {
      const rejectionReason = 'Missing receipts';

      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(
                Promise.resolve({
                  data: { ...mockReport, status: ReportStatus.REJECTED, rejection_reason: rejectionReason },
                  error: null
                })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.rejectReport('report-123', rejectionReason).subscribe({
        next: (report) => {
          expect(report.status).toBe(ReportStatus.REJECTED);
          expect(report.rejection_reason).toBe(rejectionReason);
          expect(mockQuery.update).toHaveBeenCalledWith(jasmine.objectContaining({
            status: ReportStatus.REJECTED,
            rejected_by: 'user-123',
            rejection_reason: rejectionReason
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  describe('markAsPaid', () => {
    it('should transition from approved to paid', (done) => {
      const mockQuery = {
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(
                Promise.resolve({
                  data: { ...mockReport, status: ReportStatus.PAID },
                  error: null
                })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.markAsPaid('report-123').subscribe({
        next: (report) => {
          expect(report.status).toBe(ReportStatus.PAID);
          expect(mockQuery.update).toHaveBeenCalledWith(jasmine.objectContaining({
            status: ReportStatus.PAID,
            paid_by: 'user-123'
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // FILTERING AND QUERYING TESTS
  // ============================================================================

  describe('getReports with filters', () => {
    it('should filter by status', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(
                Promise.resolve({ data: [mockReport], error: null })
              )
            })
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getReports({ status: ReportStatus.DRAFT }).subscribe({
        next: (reports) => {
          expect(reports.length).toBe(1);
          done();
        },
        error: done.fail
      });
    });

    it('should filter by user_id', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(
                Promise.resolve({ data: [mockReport], error: null })
              )
            })
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getReports({ user_id: 'user-123' }).subscribe({
        next: () => {
          done();
        },
        error: done.fail
      });
    });

    it('should apply pagination', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue({
              range: jasmine.createSpy('range').and.returnValue(
                Promise.resolve({ data: [mockReport], error: null })
              )
            })
          })
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getReports({ page: 1, limit: 20 }).subscribe({
        next: () => {
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getPendingReports', () => {
    it('should fetch submitted reports sorted by submission date', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(
                Promise.resolve({ data: [mockReport], error: null })
              )
            })
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getPendingReports().subscribe({
        next: (reports) => {
          expect(reports).toBeDefined();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getApprovedReports', () => {
    it('should fetch approved reports ready for reimbursement', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(
                Promise.resolve({ data: [mockReport], error: null })
              )
            })
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getApprovedReports().subscribe({
        next: (reports) => {
          expect(reports).toBeDefined();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getDraftReports', () => {
    it('should fetch user draft reports sorted by update date', (done) => {
      const mockQuery = {
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.callFake(() => ({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(
                Promise.resolve({ data: [mockReport], error: null })
              )
            })
          }))
        })
      };

      (supabaseServiceMock.client.from as jasmine.Spy).and.returnValue(mockQuery);

      service.getDraftReports().subscribe({
        next: (reports) => {
          expect(reports).toBeDefined();
          done();
        },
        error: done.fail
      });
    });
  });
});
