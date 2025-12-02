import { TestBed } from '@angular/core/testing';
import { DuplicateDetectionService, PotentialDuplicate, DuplicateSearchParams } from './duplicate-detection.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';

describe('DuplicateDetectionService', () => {
  let service: DuplicateDetectionService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';

  const mockDuplicate: PotentialDuplicate = {
    id: 'expense-1',
    merchant: 'Starbucks',
    amount: 15.50,
    expense_date: '2024-01-15',
    status: 'submitted',
    created_at: '2024-01-15T10:00:00Z',
    similarity_score: 75
  };

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
        DuplicateDetectionService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(DuplicateDetectionService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =============================================================================
  // FIND POTENTIAL DUPLICATES TESTS
  // =============================================================================

  describe('findPotentialDuplicates', () => {
    const mockSearchParams: DuplicateSearchParams = {
      merchant: 'Starbucks',
      amount: 15.50,
      expense_date: '2024-01-15'
    };

    it('should find potential duplicates', (done) => {
      const mockDuplicates = [mockDuplicate];
      const mockResponse = { data: mockDuplicates, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.findPotentialDuplicates(mockSearchParams).subscribe({
        next: (duplicates) => {
          expect(duplicates).toEqual(mockDuplicates);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('find_duplicate_expenses', {
            p_organization_id: mockOrgId,
            p_user_id: mockUserId,
            p_merchant: 'Starbucks',
            p_amount: 15.50,
            p_expense_date: '2024-01-15',
            p_exclude_id: null,
            p_date_tolerance_days: 3,
            p_amount_tolerance: 0.01
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when no duplicates found', (done) => {
      const mockResponse = { data: null, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.findPotentialDuplicates(mockSearchParams).subscribe({
        next: (duplicates) => {
          expect(duplicates).toEqual([]);
          done();
        },
        error: done.fail
      });
    });

    it('should use custom tolerances', (done) => {
      const paramsWithTolerances: DuplicateSearchParams = {
        ...mockSearchParams,
        exclude_id: 'expense-123',
        date_tolerance_days: 7,
        amount_tolerance: 0.05
      };
      const mockResponse = { data: [], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.findPotentialDuplicates(paramsWithTolerances).subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('find_duplicate_expenses', {
            p_organization_id: mockOrgId,
            p_user_id: mockUserId,
            p_merchant: 'Starbucks',
            p_amount: 15.50,
            p_expense_date: '2024-01-15',
            p_exclude_id: 'expense-123',
            p_date_tolerance_days: 7,
            p_amount_tolerance: 0.05
          });
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.findPotentialDuplicates(mockSearchParams).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.findPotentialDuplicates(mockSearchParams).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // HAS LIKELY DUPLICATES TESTS
  // =============================================================================

  describe('hasLikelyDuplicates', () => {
    const mockSearchParams: DuplicateSearchParams = {
      merchant: 'Starbucks',
      amount: 15.50,
      expense_date: '2024-01-15'
    };

    it('should return true when high-score duplicates exist', (done) => {
      const highScoreDuplicate = { ...mockDuplicate, similarity_score: 75 };
      const mockResponse = { data: [highScoreDuplicate], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.hasLikelyDuplicates(mockSearchParams).subscribe({
        next: (hasLikely) => {
          expect(hasLikely).toBe(true);
          done();
        },
        error: done.fail
      });
    });

    it('should return false when only low-score duplicates exist', (done) => {
      const lowScoreDuplicate = { ...mockDuplicate, similarity_score: 40 };
      const mockResponse = { data: [lowScoreDuplicate], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.hasLikelyDuplicates(mockSearchParams).subscribe({
        next: (hasLikely) => {
          expect(hasLikely).toBe(false);
          done();
        },
        error: done.fail
      });
    });

    it('should return false when no duplicates exist', (done) => {
      const mockResponse = { data: [], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.hasLikelyDuplicates(mockSearchParams).subscribe({
        next: (hasLikely) => {
          expect(hasLikely).toBe(false);
          done();
        },
        error: done.fail
      });
    });

    it('should return true when score is exactly 60', (done) => {
      const borderlineScore = { ...mockDuplicate, similarity_score: 60 };
      const mockResponse = { data: [borderlineScore], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.hasLikelyDuplicates(mockSearchParams).subscribe({
        next: (hasLikely) => {
          expect(hasLikely).toBe(true);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // CONFIRM DUPLICATE TESTS
  // =============================================================================

  describe('confirmDuplicate', () => {
    it('should confirm duplicate via RPC', (done) => {
      const mockResponse = { error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.confirmDuplicate('expense-1', 'expense-2').subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('confirm_expense_duplicate', {
            p_expense_id: 'expense-1',
            p_duplicate_of_id: 'expense-2'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should handle RPC errors', (done) => {
      const mockError = new Error('RPC failed');
      const mockResponse = { error: mockError };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.confirmDuplicate('expense-1', 'expense-2').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // =============================================================================
  // DISMISS DUPLICATE TESTS
  // =============================================================================

  describe('dismissDuplicate', () => {
    it('should dismiss duplicate via RPC', (done) => {
      const mockResponse = { error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.dismissDuplicate('expense-1').subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('dismiss_expense_duplicate', {
            p_expense_id: 'expense-1'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should handle RPC errors', (done) => {
      const mockError = new Error('RPC failed');
      const mockResponse = { error: mockError };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.dismissDuplicate('expense-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // =============================================================================
  // GET POTENTIAL DUPLICATES TESTS
  // =============================================================================

  describe('getPotentialDuplicates', () => {
    it('should return potential duplicates from database', (done) => {
      const mockExpenses = [
        { id: 'expense-1', merchant: 'Starbucks', amount: 15.50, expense_date: '2024-01-15', status: 'submitted', created_at: '2024-01-15T10:00:00Z' }
      ];
      const mockResponse = { data: mockExpenses, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const dupStatusEqSpy = jasmine.createSpy('dupStatusEq').and.returnValue({ order: orderSpy });
      const orgEqSpy = jasmine.createSpy('orgEq').and.returnValue({ eq: dupStatusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getPotentialDuplicates().subscribe({
        next: (duplicates) => {
          expect(duplicates.length).toBe(1);
          expect(duplicates[0].similarity_score).toBe(60);
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when no data', (done) => {
      const mockResponse = { data: null, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const dupStatusEqSpy = jasmine.createSpy('dupStatusEq').and.returnValue({ order: orderSpy });
      const orgEqSpy = jasmine.createSpy('orgEq').and.returnValue({ eq: dupStatusEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getPotentialDuplicates().subscribe({
        next: (duplicates) => {
          expect(duplicates).toEqual([]);
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

      service.getPotentialDuplicates().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // GET DUPLICATE STATS TESTS
  // =============================================================================

  describe('getDuplicateStats', () => {
    it('should return duplicate statistics', (done) => {
      const mockExpenses = [
        { duplicate_status: 'potential' },
        { duplicate_status: 'potential' },
        { duplicate_status: 'confirmed' },
        { duplicate_status: 'dismissed' },
        { duplicate_status: 'dismissed' },
        { duplicate_status: 'dismissed' }
      ];
      const mockResponse = { data: mockExpenses, error: null };

      const notSpy = jasmine.createSpy('not').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ not: notSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getDuplicateStats().subscribe({
        next: (stats) => {
          expect(stats.potential).toBe(2);
          expect(stats.confirmed).toBe(1);
          expect(stats.dismissed).toBe(3);
          done();
        },
        error: done.fail
      });
    });

    it('should return zeros when no data', (done) => {
      const mockResponse = { data: null, error: null };

      const notSpy = jasmine.createSpy('not').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ not: notSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getDuplicateStats().subscribe({
        next: (stats) => {
          expect(stats.potential).toBe(0);
          expect(stats.confirmed).toBe(0);
          expect(stats.dismissed).toBe(0);
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

      service.getDuplicateStats().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // SIMILARITY LABEL TESTS
  // =============================================================================

  describe('getSimilarityLabel', () => {
    it('should return "Very High" for scores >= 80', () => {
      expect(service.getSimilarityLabel(80)).toBe('Very High');
      expect(service.getSimilarityLabel(100)).toBe('Very High');
      expect(service.getSimilarityLabel(95)).toBe('Very High');
    });

    it('should return "High" for scores >= 60 and < 80', () => {
      expect(service.getSimilarityLabel(60)).toBe('High');
      expect(service.getSimilarityLabel(79)).toBe('High');
      expect(service.getSimilarityLabel(70)).toBe('High');
    });

    it('should return "Medium" for scores >= 40 and < 60', () => {
      expect(service.getSimilarityLabel(40)).toBe('Medium');
      expect(service.getSimilarityLabel(59)).toBe('Medium');
      expect(service.getSimilarityLabel(50)).toBe('Medium');
    });

    it('should return "Low" for scores < 40', () => {
      expect(service.getSimilarityLabel(39)).toBe('Low');
      expect(service.getSimilarityLabel(0)).toBe('Low');
      expect(service.getSimilarityLabel(20)).toBe('Low');
    });
  });

  // =============================================================================
  // SIMILARITY COLOR TESTS
  // =============================================================================

  describe('getSimilarityColor', () => {
    it('should return "danger" for scores >= 80', () => {
      expect(service.getSimilarityColor(80)).toBe('danger');
      expect(service.getSimilarityColor(100)).toBe('danger');
      expect(service.getSimilarityColor(95)).toBe('danger');
    });

    it('should return "warning" for scores >= 60 and < 80', () => {
      expect(service.getSimilarityColor(60)).toBe('warning');
      expect(service.getSimilarityColor(79)).toBe('warning');
      expect(service.getSimilarityColor(70)).toBe('warning');
    });

    it('should return "info" for scores >= 40 and < 60', () => {
      expect(service.getSimilarityColor(40)).toBe('info');
      expect(service.getSimilarityColor(59)).toBe('info');
      expect(service.getSimilarityColor(50)).toBe('info');
    });

    it('should return "muted" for scores < 40', () => {
      expect(service.getSimilarityColor(39)).toBe('muted');
      expect(service.getSimilarityColor(0)).toBe('muted');
      expect(service.getSimilarityColor(20)).toBe('muted');
    });
  });

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('error handling', () => {
    it('should handle database errors', (done) => {
      const mockError = new Error('Database error');
      const mockResponse = { data: null, error: mockError };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.findPotentialDuplicates({
        merchant: 'Test',
        amount: 10,
        expense_date: '2024-01-01'
      }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });
});
