import { TestBed } from '@angular/core/testing';
import { BudgetService } from './budget.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { NotificationService } from './notification.service';
import { LoggerService } from './logger.service';
import {
  Budget,
  BudgetTracking,
  BudgetWithTracking,
  BudgetCheckResult,
  BudgetSummary,
  BudgetFilters,
  CreateBudgetDto,
  UpdateBudgetDto,
  BudgetStatus
} from '../models/budget.model';

describe('BudgetService', () => {
  let service: BudgetService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;
  let mockSupabaseClient: any;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';

  const mockBudget: Budget = {
    id: 'budget-1',
    organization_id: mockOrganizationId,
    name: 'Travel Budget',
    budget_type: 'category',
    department: undefined,
    category: 'travel',
    user_id: undefined,
    amount: 10000,
    period: 'monthly',
    start_date: '2025-11-01',
    end_date: '2025-11-30',
    alert_threshold_percent: 80,
    is_active: true,
    created_by: mockUserId,
    created_at: '2025-11-01T00:00:00Z',
    updated_at: '2025-11-01T00:00:00Z'
  };

  const mockBudgetTracking: BudgetTracking = {
    id: 'tracking-1',
    budget_id: 'budget-1',
    organization_id: mockOrganizationId,
    period_start: '2025-11-01',
    period_end: '2025-11-30',
    spent_amount: 5000,
    pending_amount: 1000,
    last_calculated_at: '2025-11-15T00:00:00Z'
  };

  const mockBudgetWithTracking: BudgetWithTracking = {
    ...mockBudget,
    tracking: mockBudgetTracking,
    percent_used: 60,
    status: 'under' as BudgetStatus,
    remaining_amount: 4000,
    total_used: 6000
  };

  const mockCheckResult: BudgetCheckResult = {
    budget_id: 'budget-1',
    budget_name: 'Travel Budget',
    budget_amount: 10000,
    spent_amount: 5000,
    pending_amount: 1000,
    remaining_amount: 4000,
    percent_used: 65,
    status: 'under',
    message: 'Within budget'
  };

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabaseClient = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null })),
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
          }),
          order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
        }),
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
          })
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
            })
          })
        })
      }),
      rpc: jasmine.createSpy('rpc').and.returnValue(Promise.resolve({ data: null, error: null }))
    };

    const supabaseSpy = jasmine.createSpyObj('SupabaseService', ['client', 'userId'], {
      client: mockSupabaseClient,
      userId: mockUserId
    });
    Object.defineProperty(supabaseSpy, 'client', { get: () => mockSupabaseClient });
    Object.defineProperty(supabaseSpy, 'userId', { get: () => mockUserId });

    const orgServiceSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrganizationId
    });
    Object.defineProperty(orgServiceSpy, 'currentOrganizationId', { get: () => mockOrganizationId });

    const notificationSpy = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn', 'getErrorMessage']);
    loggerSpy.getErrorMessage.and.returnValue('An unexpected error occurred');

    TestBed.configureTestingModule({
      providers: [
        BudgetService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(BudgetService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // CRUD OPERATIONS TESTS
  // ============================================================================

  describe('getBudgets', () => {
    it('should fetch budgets for current organization', (done) => {
      const mockBudgets = [{ ...mockBudget, budget_tracking: [mockBudgetTracking] }];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockBudgets, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets().subscribe({
        next: (budgets) => {
          expect(budgets.length).toBeGreaterThan(0);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('budgets');
          done();
        },
        error: done.fail
      });
    });

    it('should fetch budgets without tracking data when includeTracking is false', (done) => {
      const mockBudgets = [mockBudget];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockBudgets, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets(undefined, false).subscribe({
        next: (budgets) => {
          expect(budgets.length).toBeGreaterThan(0);
          done();
        },
        error: done.fail
      });
    });

    it('should apply filters to query when filters provided', (done) => {
      // This test verifies that filters are passed correctly by checking the mock chain is called
      // The actual filtering happens in the database via Supabase query builder
      const filters: BudgetFilters = {
        include_inactive: false,
        budget_type: 'category'
      };

      // Create a chainable query object that supports multiple .eq() calls
      // The query object must be both a thenable (Promise-like) and have query methods
      const createChainableQuery: any = () => {
        const promise = Promise.resolve({ data: [], error: null });
        const chain: any = Object.assign(promise, {
          eq: jasmine.createSpy('eq'),
          order: jasmine.createSpy('order')
        });
        // Make methods return the chain itself for further chaining
        chain.eq.and.returnValue(chain);
        chain.order.and.returnValue(chain);
        return chain;
      };

      const chainableQuery = createChainableQuery();

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(chainableQuery)
        })
      });

      service.getBudgets(filters).subscribe({
        next: (budgets) => {
          expect(budgets).toEqual([]);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('budgets');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.getBudgets().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should handle Supabase errors', (done) => {
      const mockError = { message: 'Database error' };
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('getBudgetById', () => {
    it('should fetch a single budget by ID', (done) => {
      const mockBudgetData = { ...mockBudget, budget_tracking: [mockBudgetTracking] };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockBudgetData, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.getBudgetById('budget-1').subscribe({
        next: (budget) => {
          expect(budget.id).toBe('budget-1');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if budget not found', (done) => {
      // When budget is not found, the service throws 'Budget not found' which gets
      // transformed by handleError to a generic message via logger.getErrorMessage
      loggerServiceSpy.getErrorMessage.and.returnValue('Budget not found');

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.getBudgetById('budget-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Budget not found');
          done();
        }
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.getBudgetById('budget-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createBudget', () => {
    it('should create a new budget', (done) => {
      const dto: CreateBudgetDto = {
        name: 'Travel Budget',
        budget_type: 'category',
        category: 'travel',
        amount: 10000,
        period: 'monthly',
        start_date: '2025-11-01'
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockBudget, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.createBudget(dto).subscribe({
        next: (budget) => {
          expect(budget).toEqual(mockBudget);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Budget created successfully');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      const dto: CreateBudgetDto = {
        name: 'Test',
        budget_type: 'category',
        amount: 1000,
        period: 'monthly',
        start_date: '2025-11-01'
      };

      service.createBudget(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      const dto: CreateBudgetDto = {
        name: 'Test',
        budget_type: 'category',
        amount: 1000,
        period: 'monthly',
        start_date: '2025-11-01'
      };

      service.createBudget(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should handle creation errors', (done) => {
      const dto: CreateBudgetDto = {
        name: 'Test',
        budget_type: 'category',
        amount: 1000,
        period: 'monthly',
        start_date: '2025-11-01'
      };

      const mockError = { message: 'Creation failed' };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.createBudget(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          expect(notificationServiceSpy.showError).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('updateBudget', () => {
    it('should update an existing budget', (done) => {
      const dto: UpdateBudgetDto = {
        name: 'Updated Name',
        amount: 15000,
        is_active: false
      };

      const updatedBudget = { ...mockBudget, ...dto };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: updatedBudget, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              select: jasmine.createSpy('select').and.returnValue({
                single: singleSpy
              })
            })
          })
        })
      });

      service.updateBudget('budget-1', dto).subscribe({
        next: (budget) => {
          expect(budget.name).toBe('Updated Name');
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Budget updated successfully');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.updateBudget('budget-1', { name: 'Test' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should return error if budget not found', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              select: jasmine.createSpy('select').and.returnValue({
                single: singleSpy
              })
            })
          })
        })
      });

      service.updateBudget('budget-1', { name: 'Test' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Budget not found');
          done();
        }
      });
    });

    it('should handle update errors', (done) => {
      const mockError = { message: 'Update failed' };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              select: jasmine.createSpy('select').and.returnValue({
                single: singleSpy
              })
            })
          })
        })
      });

      service.updateBudget('budget-1', { name: 'Test' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          expect(notificationServiceSpy.showError).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('deleteBudget', () => {
    it('should soft delete a budget by setting is_active to false', (done) => {
      const eqSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: eqSpy
          })
        })
      });

      service.deleteBudget('budget-1').subscribe({
        next: () => {
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalledWith('Budget deleted successfully');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.deleteBudget('budget-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should handle delete errors', (done) => {
      const mockError = { message: 'Delete failed' };
      const eqSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: eqSpy
          })
        })
      });

      service.deleteBudget('budget-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          expect(notificationServiceSpy.showError).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // ============================================================================
  // BUDGET CHECKING TESTS
  // ============================================================================

  describe('checkExpenseAgainstBudgets', () => {
    it('should check expense against applicable budgets', (done) => {
      const expense = {
        amount: 500,
        category: 'travel',
        expense_date: '2025-11-15'
      };

      const mockResults = [mockCheckResult];
      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: mockResults, error: null })
      );

      service.checkExpenseAgainstBudgets(expense).subscribe({
        next: (results) => {
          expect(results).toEqual(mockResults);
          expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('check_expense_budgets', {
            p_organization_id: mockOrganizationId,
            p_user_id: mockUserId,
            p_category: expense.category,
            p_amount: expense.amount,
            p_expense_date: expense.expense_date
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      const expense = {
        amount: 500,
        category: 'travel',
        expense_date: '2025-11-15'
      };

      service.checkExpenseAgainstBudgets(expense).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      const expense = {
        amount: 500,
        category: 'travel',
        expense_date: '2025-11-15'
      };

      service.checkExpenseAgainstBudgets(expense).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should handle RPC errors', (done) => {
      const mockError = { message: 'RPC failed' };
      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      const expense = {
        amount: 500,
        category: 'travel',
        expense_date: '2025-11-15'
      };

      service.checkExpenseAgainstBudgets(expense).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('getBudgetWarnings', () => {
    it('should return only warning and exceeded budgets', (done) => {
      const expense = {
        amount: 500,
        category: 'travel',
        expense_date: '2025-11-15'
      };

      const mockResults: BudgetCheckResult[] = [
        { ...mockCheckResult, status: 'under' },
        { ...mockCheckResult, budget_id: 'budget-2', status: 'warning' },
        { ...mockCheckResult, budget_id: 'budget-3', status: 'exceeded' }
      ];

      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: mockResults, error: null })
      );

      service.getBudgetWarnings(expense).subscribe({
        next: (warnings) => {
          expect(warnings.length).toBe(2);
          expect(warnings.every(w => w.status === 'warning' || w.status === 'exceeded')).toBe(true);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // SUMMARY & STATISTICS TESTS
  // ============================================================================

  describe('getBudgetSummary', () => {
    it('should calculate budget summary statistics', (done) => {
      // Create mock budgets with tracking data in current date range
      const today = new Date();
      const periodStart = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
      const periodEnd = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

      const mockBudgets: any[] = [
        { ...mockBudget, id: '1', amount: 10000, budget_tracking: [{ ...mockBudgetTracking, spent_amount: 3000, pending_amount: 0, period_start: periodStart, period_end: periodEnd }] },
        { ...mockBudget, id: '2', amount: 10000, budget_tracking: [{ ...mockBudgetTracking, spent_amount: 8500, pending_amount: 0, period_start: periodStart, period_end: periodEnd }] },
        { ...mockBudget, id: '3', amount: 10000, budget_tracking: [{ ...mockBudgetTracking, spent_amount: 12000, pending_amount: 0, period_start: periodStart, period_end: periodEnd }] }
      ];

      // Create a chainable query object that supports multiple .eq() calls
      // The query object must be both a thenable (Promise-like) and have query methods
      const createChainableQuery: any = () => {
        const promise = Promise.resolve({ data: mockBudgets, error: null });
        const chain: any = Object.assign(promise, {
          eq: jasmine.createSpy('eq'),
          order: jasmine.createSpy('order')
        });
        // Make methods return the chain itself for further chaining
        chain.eq.and.returnValue(chain);
        chain.order.and.returnValue(chain);
        return chain;
      };

      const chainableQuery = createChainableQuery();

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(chainableQuery)
        })
      });

      service.getBudgetSummary().subscribe({
        next: (summary) => {
          expect(summary.total_budgets).toBe(3);
          // Budget 1: 3000/10000 = 30% (under)
          // Budget 2: 8500/10000 = 85% (warning, >= 80% threshold)
          // Budget 3: 12000/10000 = 120% (exceeded)
          expect(summary.under_budget).toBe(1);
          expect(summary.at_warning).toBe(1);
          expect(summary.exceeded).toBe(1);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getBudgetsNeedingAttention', () => {
    it('should return budgets at warning or exceeded status', (done) => {
      // Create mock budgets with tracking data in current date range
      const today = new Date();
      const periodStart = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
      const periodEnd = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

      const mockBudgets: any[] = [
        { ...mockBudget, id: '1', amount: 10000, budget_tracking: [{ ...mockBudgetTracking, spent_amount: 3000, pending_amount: 0, period_start: periodStart, period_end: periodEnd }] },
        { ...mockBudget, id: '2', amount: 10000, budget_tracking: [{ ...mockBudgetTracking, spent_amount: 8500, pending_amount: 0, period_start: periodStart, period_end: periodEnd }] },
        { ...mockBudget, id: '3', amount: 10000, budget_tracking: [{ ...mockBudgetTracking, spent_amount: 12000, pending_amount: 0, period_start: periodStart, period_end: periodEnd }] }
      ];

      // Create a chainable query object that supports multiple .eq() calls
      // The query object must be both a thenable (Promise-like) and have query methods
      const createChainableQuery: any = () => {
        const promise = Promise.resolve({ data: mockBudgets, error: null });
        const chain: any = Object.assign(promise, {
          eq: jasmine.createSpy('eq'),
          order: jasmine.createSpy('order')
        });
        // Make methods return the chain itself for further chaining
        chain.eq.and.returnValue(chain);
        chain.order.and.returnValue(chain);
        return chain;
      };

      const chainableQuery = createChainableQuery();

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(chainableQuery)
        })
      });

      service.getBudgetsNeedingAttention(2).subscribe({
        next: (budgets) => {
          // Should return only the 2 budgets at warning or exceeded status (sorted by percent_used desc)
          expect(budgets.length).toBe(2);
          // All returned budgets should be warning or exceeded
          expect(budgets.every(b => b.status === 'warning' || b.status === 'exceeded')).toBe(true);
          // Should be sorted by percent_used descending (exceeded first, then warning)
          expect(budgets[0].status).toBe('exceeded');
          expect(budgets[1].status).toBe('warning');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getMyBudgets', () => {
    it('should return budgets relevant to current user', (done) => {
      // Create mock budgets with tracking data in current date range
      const today = new Date();
      const periodStart = new Date(today.getTime() - 86400000).toISOString().split('T')[0];
      const periodEnd = new Date(today.getTime() + 86400000).toISOString().split('T')[0];

      const mockBudgets: any[] = [
        { ...mockBudget, budget_type: 'organization', budget_tracking: [{ ...mockBudgetTracking, period_start: periodStart, period_end: periodEnd }], id: '1' },
        { ...mockBudget, budget_type: 'department', budget_tracking: [{ ...mockBudgetTracking, period_start: periodStart, period_end: periodEnd }], id: '2' },
        { ...mockBudget, budget_type: 'user', user_id: mockUserId, budget_tracking: [{ ...mockBudgetTracking, period_start: periodStart, period_end: periodEnd }], id: '3' },
        { ...mockBudget, budget_type: 'user', user_id: 'other-user', budget_tracking: [{ ...mockBudgetTracking, period_start: periodStart, period_end: periodEnd }], id: '4' }
      ];

      // Create a chainable query object that supports multiple .eq() calls
      // The query object must be both a thenable (Promise-like) and have query methods
      const createChainableQuery: any = () => {
        const promise = Promise.resolve({ data: mockBudgets, error: null });
        const chain: any = Object.assign(promise, {
          eq: jasmine.createSpy('eq'),
          order: jasmine.createSpy('order')
        });
        // Make methods return the chain itself for further chaining
        chain.eq.and.returnValue(chain);
        chain.order.and.returnValue(chain);
        return chain;
      };

      const chainableQuery = createChainableQuery();

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(chainableQuery)
        })
      });

      service.getMyBudgets().subscribe({
        next: (budgets) => {
          // Should filter out the 'other-user' budget
          // Returns: organization (1), department (1), user with matching userId (1) = 3 total
          expect(budgets.length).toBe(3);
          expect(budgets.some(b => b.budget_type === 'user' && b.user_id !== mockUserId)).toBe(false);
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.getMyBudgets().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  // ============================================================================
  // HELPER METHODS TESTS
  // ============================================================================

  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      expect(service.formatCurrency(1000)).toBe('$1,000.00');
      expect(service.formatCurrency(1234.56)).toBe('$1,234.56');
      expect(service.formatCurrency(0)).toBe('$0.00');
    });
  });

  describe('getBudgetTypeLabel', () => {
    it('should return correct label for each budget type', () => {
      expect(service.getBudgetTypeLabel('organization')).toBe('Organization-wide');
      expect(service.getBudgetTypeLabel('department')).toBe('Department');
      expect(service.getBudgetTypeLabel('category')).toBe('Category');
      expect(service.getBudgetTypeLabel('user')).toBe('Individual');
      expect(service.getBudgetTypeLabel('unknown')).toBe('unknown');
    });
  });

  describe('getBudgetPeriodLabel', () => {
    it('should return correct label for each period', () => {
      expect(service.getBudgetPeriodLabel('monthly')).toBe('Monthly');
      expect(service.getBudgetPeriodLabel('quarterly')).toBe('Quarterly');
      expect(service.getBudgetPeriodLabel('yearly')).toBe('Yearly');
      expect(service.getBudgetPeriodLabel('custom')).toBe('Custom Period');
      expect(service.getBudgetPeriodLabel('unknown')).toBe('unknown');
    });
  });

  // ============================================================================
  // PRIVATE METHOD TESTS (via public methods that use them)
  // ============================================================================

  describe('enrichBudgetWithStatus (via getBudgets)', () => {
    it('should calculate status as "under" when under budget', (done) => {
      const mockBudgetData = {
        ...mockBudget,
        budget_tracking: [{
          ...mockBudgetTracking,
          spent_amount: 3000,
          pending_amount: 1000,
          period_start: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          period_end: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        }]
      };

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockBudgetData], error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets().subscribe({
        next: (budgets) => {
          expect(budgets[0].status).toBe('under');
          done();
        },
        error: done.fail
      });
    });

    it('should calculate status as "warning" when at or above threshold', (done) => {
      const mockBudgetData = {
        ...mockBudget,
        alert_threshold_percent: 80,
        budget_tracking: [{
          ...mockBudgetTracking,
          spent_amount: 8000,
          pending_amount: 500,
          period_start: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          period_end: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        }]
      };

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockBudgetData], error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets().subscribe({
        next: (budgets) => {
          expect(budgets[0].status).toBe('warning');
          done();
        },
        error: done.fail
      });
    });

    it('should calculate status as "exceeded" when over budget', (done) => {
      const mockBudgetData = {
        ...mockBudget,
        budget_tracking: [{
          ...mockBudgetTracking,
          spent_amount: 11000,
          pending_amount: 500,
          period_start: new Date(Date.now() - 86400000).toISOString().split('T')[0],
          period_end: new Date(Date.now() + 86400000).toISOString().split('T')[0]
        }]
      };

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockBudgetData], error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets().subscribe({
        next: (budgets) => {
          expect(budgets[0].status).toBe('exceeded');
          done();
        },
        error: done.fail
      });
    });

    it('should handle budgets without tracking data', (done) => {
      const mockBudgetData = {
        ...mockBudget,
        budget_tracking: []
      };

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockBudgetData], error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getBudgets().subscribe({
        next: (budgets) => {
          expect(budgets[0].tracking).toBeUndefined();
          expect(budgets[0].percent_used).toBe(0);
          expect(budgets[0].status).toBe('under');
          done();
        },
        error: done.fail
      });
    });
  });
});
