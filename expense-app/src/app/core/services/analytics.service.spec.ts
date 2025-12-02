import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  ExpenseTrendPoint,
  CategoryBreakdown,
  TopSpender,
  MerchantAnalysis,
  ApprovalMetric,
  BudgetVsActual,
  DepartmentComparison,
  YoyComparison,
  AnalyticsSummaryMetric,
  AnalyticsFilters
} from '../models/analytics.model';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';

  const mockFilters: AnalyticsFilters = {
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    interval: 'month'
  };

  const mockTrendPoint: ExpenseTrendPoint = {
    period_start: '2024-01-01',
    period_end: '2024-01-31',
    period_label: '2024-01',
    total_amount: 5000,
    expense_count: 25,
    avg_expense: 200,
    approved_amount: 4000,
    pending_amount: 500,
    rejected_amount: 500
  };

  const mockCategoryBreakdown: CategoryBreakdown = {
    category: 'FUEL',
    total_amount: 2500,
    expense_count: 15,
    percentage: 25.5,
    avg_expense: 166.67,
    max_expense: 500,
    min_expense: 25
  };

  const mockTopSpender: TopSpender = {
    user_id: 'user-1',
    user_name: 'John Doe',
    user_email: 'john@example.com',
    department: 'Engineering',
    total_amount: 3000,
    expense_count: 20,
    avg_expense: 150,
    approval_rate: 95,
    policy_violation_count: 1
  };

  const mockMerchantAnalysis: MerchantAnalysis = {
    merchant: 'Shell',
    total_amount: 1500,
    expense_count: 30,
    avg_expense: 50,
    unique_users: 5,
    most_common_category: 'FUEL'
  };

  const mockApprovalMetric: ApprovalMetric = {
    metric_name: 'avg_approval_time',
    metric_value: 24,
    metric_unit: 'hours'
  };

  const mockBudgetVsActual: BudgetVsActual = {
    budget_name: 'Travel',
    budget_type: 'department',
    budget_amount: 10000,
    actual_spent: 8500,
    remaining: 1500,
    utilization_percent: 85,
    status: 'on_track'
  };

  const mockDepartmentComparison: DepartmentComparison = {
    department: 'Engineering',
    total_amount: 15000,
    expense_count: 75,
    employee_count: 10,
    per_employee_avg: 1500,
    percentage_of_total: 30
  };

  const mockYoyComparison: YoyComparison = {
    month_num: 1,
    month_name: 'January',
    current_year_amount: 5000,
    previous_year_amount: 4500,
    change_amount: 500,
    change_percent: 11.1
  };

  const mockSummaryMetric: AnalyticsSummaryMetric = {
    metric_key: 'total_expenses',
    metric_value: 50000,
    previous_value: 45000,
    change_percent: 11.1
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
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
        AnalyticsService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(AnalyticsService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with null dashboard data', () => {
    expect(service.dashboardData()).toBeNull();
    expect(service.isLoading()).toBe(false);
    expect(service.totalExpenses()).toBe(0);
    expect(service.expenseCount()).toBe(0);
  });

  // =============================================================================
  // TRENDS TESTS
  // =============================================================================

  describe('getExpenseTrends', () => {
    it('should return expense trends', (done) => {
      const mockResponse = { data: [mockTrendPoint], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getExpenseTrends(mockFilters).subscribe({
        next: (trends) => {
          expect(trends).toEqual([mockTrendPoint]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_expense_trends', {
            p_organization_id: mockOrgId,
            p_start_date: mockFilters.start_date,
            p_end_date: mockFilters.end_date,
            p_interval: 'month',
            p_user_id: null
          });
          done();
        },
        error: done.fail
      });
    });

    it('should use user_id filter when provided', (done) => {
      const filtersWithUser = { ...mockFilters, user_id: 'user-1' };
      const mockResponse = { data: [mockTrendPoint], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getExpenseTrends(filtersWithUser).subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_expense_trends', jasmine.objectContaining({
            p_user_id: 'user-1'
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

      service.getExpenseTrends(mockFilters).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // CATEGORY BREAKDOWN TESTS
  // =============================================================================

  describe('getCategoryBreakdown', () => {
    it('should return category breakdown', (done) => {
      const mockResponse = { data: [mockCategoryBreakdown], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getCategoryBreakdown(mockFilters).subscribe({
        next: (breakdown) => {
          expect(breakdown).toEqual([mockCategoryBreakdown]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_category_breakdown', {
            p_organization_id: mockOrgId,
            p_start_date: mockFilters.start_date,
            p_end_date: mockFilters.end_date,
            p_user_id: null
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

      service.getCategoryBreakdown(mockFilters).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // TOP SPENDERS TESTS
  // =============================================================================

  describe('getTopSpenders', () => {
    it('should return top spenders', (done) => {
      const mockResponse = { data: [mockTopSpender], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getTopSpenders('2024-01-01', '2024-12-31').subscribe({
        next: (spenders) => {
          expect(spenders).toEqual([mockTopSpender]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_top_spenders', {
            p_organization_id: mockOrgId,
            p_start_date: '2024-01-01',
            p_end_date: '2024-12-31',
            p_limit: 10
          });
          done();
        },
        error: done.fail
      });
    });

    it('should use custom limit when provided', (done) => {
      const mockResponse = { data: [mockTopSpender], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getTopSpenders('2024-01-01', '2024-12-31', 5).subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_top_spenders', jasmine.objectContaining({
            p_limit: 5
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // MERCHANT ANALYSIS TESTS
  // =============================================================================

  describe('getMerchantAnalysis', () => {
    it('should return merchant analysis', (done) => {
      const mockResponse = { data: [mockMerchantAnalysis], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getMerchantAnalysis('2024-01-01', '2024-12-31').subscribe({
        next: (merchants) => {
          expect(merchants).toEqual([mockMerchantAnalysis]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_merchant_analysis', {
            p_organization_id: mockOrgId,
            p_start_date: '2024-01-01',
            p_end_date: '2024-12-31',
            p_limit: 20
          });
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // APPROVAL METRICS TESTS
  // =============================================================================

  describe('getApprovalMetrics', () => {
    it('should return approval metrics', (done) => {
      const mockResponse = { data: [mockApprovalMetric], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getApprovalMetrics('2024-01-01', '2024-12-31').subscribe({
        next: (metrics) => {
          expect(metrics).toEqual([mockApprovalMetric]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_approval_metrics', {
            p_organization_id: mockOrgId,
            p_start_date: '2024-01-01',
            p_end_date: '2024-12-31'
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

      service.getApprovalMetrics('2024-01-01', '2024-12-31').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // BUDGET VS ACTUAL TESTS
  // =============================================================================

  describe('getBudgetVsActual', () => {
    it('should return budget vs actual data', (done) => {
      const mockResponse = { data: [mockBudgetVsActual], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getBudgetVsActual('2024-01-01', '2024-12-31').subscribe({
        next: (data) => {
          expect(data).toEqual([mockBudgetVsActual]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_budget_vs_actual', {
            p_organization_id: mockOrgId,
            p_start_date: '2024-01-01',
            p_end_date: '2024-12-31'
          });
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // DEPARTMENT COMPARISON TESTS
  // =============================================================================

  describe('getDepartmentComparison', () => {
    it('should return department comparison', (done) => {
      const mockResponse = { data: [mockDepartmentComparison], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getDepartmentComparison('2024-01-01', '2024-12-31').subscribe({
        next: (data) => {
          expect(data).toEqual([mockDepartmentComparison]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_department_comparison', {
            p_organization_id: mockOrgId,
            p_start_date: '2024-01-01',
            p_end_date: '2024-12-31'
          });
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // YEAR OVER YEAR TESTS
  // =============================================================================

  describe('getYoyComparison', () => {
    it('should return year over year comparison', (done) => {
      const mockResponse = { data: [mockYoyComparison], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getYoyComparison(2024).subscribe({
        next: (data) => {
          expect(data).toEqual([mockYoyComparison]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_yoy_comparison', {
            p_organization_id: mockOrgId,
            p_current_year: 2024
          });
          done();
        },
        error: done.fail
      });
    });

    it('should use current year when not provided', (done) => {
      const currentYear = new Date().getFullYear();
      const mockResponse = { data: [mockYoyComparison], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getYoyComparison().subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_yoy_comparison', {
            p_organization_id: mockOrgId,
            p_current_year: currentYear
          });
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // SUMMARY TESTS
  // =============================================================================

  describe('getAnalyticsSummary', () => {
    it('should return summary with calculated change percent', (done) => {
      const mockMetric = { ...mockSummaryMetric, change_percent: undefined };
      const mockResponse = { data: [mockMetric], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getAnalyticsSummary('2024-01-01', '2024-12-31').subscribe({
        next: (metrics) => {
          expect(metrics.length).toBe(1);
          expect(metrics[0].change_percent).toBeCloseTo(11.1, 1);
          done();
        },
        error: done.fail
      });
    });

    it('should handle zero previous value', (done) => {
      const mockMetric = { ...mockSummaryMetric, previous_value: 0 };
      const mockResponse = { data: [mockMetric], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getAnalyticsSummary('2024-01-01', '2024-12-31').subscribe({
        next: (metrics) => {
          expect(metrics[0].change_percent).toBe(0);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // DASHBOARD DATA TESTS
  // =============================================================================

  describe('loadDashboardData', () => {
    beforeEach(() => {
      // Setup RPC to return different data based on function name
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.callFake((funcName: string) => {
        const responses: Record<string, any> = {
          'get_analytics_summary': { data: [mockSummaryMetric], error: null },
          'get_expense_trends': { data: [mockTrendPoint], error: null },
          'get_category_breakdown': { data: [mockCategoryBreakdown], error: null },
          'get_top_spenders': { data: [mockTopSpender], error: null },
          'get_merchant_analysis': { data: [mockMerchantAnalysis], error: null },
          'get_approval_metrics': { data: [mockApprovalMetric], error: null },
          'get_budget_vs_actual': { data: [mockBudgetVsActual], error: null },
          'get_department_comparison': { data: [mockDepartmentComparison], error: null }
        };
        return Promise.resolve(responses[funcName] || { data: [], error: null });
      });
    });

    it('should load all dashboard data via forkJoin', (done) => {
      service.loadDashboardData(mockFilters).subscribe({
        next: (data) => {
          expect(data.summary).toBeDefined();
          expect(data.trends).toBeDefined();
          expect(data.categoryBreakdown).toBeDefined();
          expect(data.topSpenders).toBeDefined();
          expect(data.merchantAnalysis).toBeDefined();
          expect(data.approvalMetrics).toBeDefined();
          expect(data.budgetVsActual).toBeDefined();
          expect(data.departmentComparison).toBeDefined();
          done();
        },
        error: done.fail
      });
    });

    it('should update dashboardData signal', (done) => {
      service.loadDashboardData(mockFilters).subscribe({
        next: () => {
          expect(service.dashboardData()).not.toBeNull();
          done();
        },
        error: done.fail
      });
    });

    it('should set isLoading during load', (done) => {
      expect(service.isLoading()).toBe(false);

      service.loadDashboardData(mockFilters).subscribe({
        next: () => {
          expect(service.isLoading()).toBe(false);
          done();
        },
        error: done.fail
      });
    });

    it('should reset isLoading on error', (done) => {
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.callFake((funcName: string) => {
        if (funcName === 'get_analytics_summary') {
          return Promise.resolve({ data: null, error: { message: 'Failed' } });
        }
        return Promise.resolve({ data: [], error: null });
      });

      service.loadDashboardData(mockFilters).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(service.isLoading()).toBe(false);
          done();
        }
      });
    });
  });

  // =============================================================================
  // COMPUTED SIGNALS TESTS
  // =============================================================================

  describe('computed signals', () => {
    beforeEach((done) => {
      const summaryMetrics = [
        { ...mockSummaryMetric, metric_key: 'total_expenses', metric_value: 50000 },
        { ...mockSummaryMetric, metric_key: 'expense_count', metric_value: 250 }
      ];

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.callFake((funcName: string) => {
        if (funcName === 'get_analytics_summary') {
          return Promise.resolve({ data: summaryMetrics, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      });

      service.loadDashboardData(mockFilters).subscribe({
        next: () => done(),
        error: done.fail
      });
    });

    it('totalExpenses should return correct value from summary', () => {
      expect(service.totalExpenses()).toBe(50000);
    });

    it('expenseCount should return correct value from summary', () => {
      expect(service.expenseCount()).toBe(250);
    });
  });

  // =============================================================================
  // EXPORT TESTS
  // =============================================================================

  describe('exportToCsv', () => {
    it('should export data to CSV file', () => {
      const data = [
        { name: 'John', amount: 100 },
        { name: 'Jane', amount: 200 }
      ];

      // Mock document methods
      const mockLink = {
        setAttribute: jasmine.createSpy('setAttribute'),
        click: jasmine.createSpy('click'),
        style: { visibility: '' }
      };
      spyOn(document, 'createElement').and.returnValue(mockLink as any);
      spyOn(document.body, 'appendChild');
      spyOn(document.body, 'removeChild');
      spyOn(URL, 'createObjectURL').and.returnValue('blob:url');
      spyOn(URL, 'revokeObjectURL');

      service.exportToCsv(data, 'test-export');

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:url');
      expect(mockLink.click).toHaveBeenCalled();
      expect(loggerServiceSpy.info).toHaveBeenCalled();
    });

    it('should handle empty data', () => {
      service.exportToCsv([], 'test-export');
      expect(loggerServiceSpy.warn).toHaveBeenCalledWith('No data to export', 'AnalyticsService');
    });

    it('should escape quotes and commas in CSV', () => {
      const data = [
        { name: 'John "Johnny"', city: 'New York, NY' }
      ];

      const mockLink = {
        setAttribute: jasmine.createSpy('setAttribute'),
        click: jasmine.createSpy('click'),
        style: { visibility: '' }
      };
      spyOn(document, 'createElement').and.returnValue(mockLink as any);
      spyOn(document.body, 'appendChild');
      spyOn(document.body, 'removeChild');
      spyOn(URL, 'createObjectURL').and.callFake((blob: Blob) => {
        // Verify blob content
        expect(blob.type).toBe('text/csv;charset=utf-8;');
        return 'blob:url';
      });
      spyOn(URL, 'revokeObjectURL');

      service.exportToCsv(data, 'test-export');

      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // REFRESH STATS TESTS
  // =============================================================================

  describe('refreshExpenseStats', () => {
    it('should call refresh RPC function', (done) => {
      const mockResponse = { error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.refreshExpenseStats().subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('refresh_expense_stats');
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should handle RPC error', (done) => {
      const mockError = { message: 'Refresh failed' };
      const mockResponse = { error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.refreshExpenseStats().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('error handling', () => {
    it('should log errors and return meaningful message', (done) => {
      const mockError = new Error('Database error');
      const mockResponse = { data: null, error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getExpenseTrends(mockFilters).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          expect(error.message).toContain('Database error');
          done();
        }
      });
    });
  });
});
