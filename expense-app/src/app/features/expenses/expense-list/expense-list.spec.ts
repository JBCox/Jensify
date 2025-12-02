import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { ExpenseList } from './expense-list';
import { ExpenseService } from '../../../core/services/expense.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { CategoryService } from '../../../core/services/category.service';
import { SanitizationService } from '../../../core/services/sanitization.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ExpenseCategory, ExpenseStatus } from '../../../core/models/enums';
import { Expense } from '../../../core/models/expense.model';

describe('ExpenseList', () => {
  let component: ExpenseList;
  let fixture: ComponentFixture<ExpenseList>;
  let expenseServiceSpy: jasmine.SpyObj<ExpenseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let categoryServiceSpy: jasmine.SpyObj<CategoryService>;
  let sanitizationServiceSpy: jasmine.SpyObj<SanitizationService>;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockExpenses: Expense[] = [
    {
      id: 'exp-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      merchant: 'Gas Station A',
      amount: 50.00,
      currency: 'USD',
      category: ExpenseCategory.FUEL,
      expense_date: '2024-01-15',
      status: ExpenseStatus.DRAFT,
      notes: 'Fuel expense',
      is_reimbursable: true,
      policy_violations: [],
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z'
    },
    {
      id: 'exp-2',
      organization_id: 'org-1',
      user_id: 'user-1',
      merchant: 'Hotel XYZ',
      amount: 150.00,
      currency: 'USD',
      category: ExpenseCategory.LODGING,
      expense_date: '2024-01-16',
      status: ExpenseStatus.SUBMITTED,
      notes: 'Business trip lodging',
      is_reimbursable: true,
      policy_violations: [],
      created_at: '2024-01-16T10:00:00Z',
      updated_at: '2024-01-16T10:00:00Z'
    },
    {
      id: 'exp-3',
      organization_id: 'org-1',
      user_id: 'user-1',
      merchant: 'Airline Corp',
      amount: 300.00,
      currency: 'USD',
      category: ExpenseCategory.AIRFARE,
      expense_date: '2024-01-17',
      status: ExpenseStatus.APPROVED,
      is_reimbursable: true,
      policy_violations: [],
      created_at: '2024-01-17T10:00:00Z',
      updated_at: '2024-01-17T10:00:00Z'
    }
  ];

  const mockCategories = [
    {
      id: 'cat-1',
      name: ExpenseCategory.FUEL,
      icon: 'local_gas_station',
      color: '#ff5900',
      organization_id: 'org-1',
      is_active: true,
      requires_receipt: false,
      requires_description: false,
      display_order: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'cat-2',
      name: ExpenseCategory.LODGING,
      icon: 'hotel',
      color: '#0066cc',
      organization_id: 'org-1',
      is_active: true,
      requires_receipt: true,
      requires_description: false,
      display_order: 2,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ];

  beforeEach(async () => {
    expenseServiceSpy = jasmine.createSpyObj('ExpenseService', [
      'getMyExpenses',
      'submitExpense',
      'deleteExpense'
    ]);
    expenseServiceSpy.getMyExpenses.and.returnValue(of(mockExpenses));
    expenseServiceSpy.submitExpense.and.returnValue(of(mockExpenses[0]));
    expenseServiceSpy.deleteExpense.and.returnValue(of(void 0));

    organizationServiceSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: 'org-1'
    });

    categoryServiceSpy = jasmine.createSpyObj('CategoryService', ['getCategories']);
    categoryServiceSpy.getCategories.and.returnValue(of(mockCategories));

    sanitizationServiceSpy = jasmine.createSpyObj('SanitizationService', ['sanitizeCsvValue']);
    sanitizationServiceSpy.sanitizeCsvValue.and.callFake((val: string) => val);

    supabaseServiceSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: { from: jasmine.createSpy('from') }
    });

    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ExpenseList, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: ExpenseService, useValue: expenseServiceSpy },
        { provide: OrganizationService, useValue: organizationServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        { provide: SanitizationService, useValue: sanitizationServiceSpy },
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: Router, useValue: routerSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =============================================================================
  // INITIALIZATION TESTS
  // =============================================================================

  describe('initialization', () => {
    it('should load expenses on init', fakeAsync(() => {
      tick();
      expect(expenseServiceSpy.getMyExpenses).toHaveBeenCalled();
      expect(component.expenses().length).toBe(3);
      expect(component.loading()).toBe(false);
    }));

    it('should load categories on init', fakeAsync(() => {
      tick();
      expect(categoryServiceSpy.getCategories).toHaveBeenCalled();
      expect(component.categories().length).toBe(2);
    }));

    it('should handle expense load error', fakeAsync(() => {
      expenseServiceSpy.getMyExpenses.and.returnValue(throwError(() => new Error('Load failed')));

      const newFixture = TestBed.createComponent(ExpenseList);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();
      tick();

      expect(newComponent.error()).toBe('Load failed');
      expect(newComponent.loading()).toBe(false);
    }));

    it('should have default filter state', () => {
      expect(component.selectedStatus()).toBe('all');
      expect(component.searchQuery()).toBe('');
      expect(component.selectedCategory()).toBe('all');
      expect(component.dateFrom()).toBeNull();
      expect(component.dateTo()).toBeNull();
    });
  });

  // =============================================================================
  // COMPUTED PROPERTIES TESTS
  // =============================================================================

  describe('computed properties', () => {
    beforeEach(fakeAsync(() => {
      tick(); // Wait for initial load
    }));

    it('should calculate total count', () => {
      expect(component.totalCount()).toBe(3);
    });

    it('should calculate total amount', () => {
      expect(component.totalAmount()).toBe(500.00); // 50 + 150 + 300
    });

    it('should identify draft expenses', () => {
      expect(component.draftExpenses().length).toBe(1);
      expect(component.draftExpenses()[0].id).toBe('exp-1');
    });

    it('should count selected expenses', () => {
      expect(component.selectedCount()).toBe(0);
      component.selectedExpenseIds.set(new Set(['exp-1']));
      expect(component.selectedCount()).toBe(1);
    });

    it('should track active filter count', () => {
      expect(component.activeFilterCount()).toBe(0);

      component.selectedCategory.set(ExpenseCategory.FUEL);
      expect(component.activeFilterCount()).toBe(1);

      component.dateFrom.set(new Date());
      expect(component.activeFilterCount()).toBe(2);
    });
  });

  // =============================================================================
  // FILTERING TESTS
  // =============================================================================

  describe('filtering', () => {
    beforeEach(fakeAsync(() => {
      tick();
    }));

    it('should filter by status', () => {
      component.selectedStatus.set(ExpenseStatus.DRAFT);
      expect(component.filteredExpenses().length).toBe(1);
      expect(component.filteredExpenses()[0].status).toBe(ExpenseStatus.DRAFT);
    });

    it('should filter by search query', () => {
      component.searchQuery.set('hotel');
      expect(component.filteredExpenses().length).toBe(1);
      expect(component.filteredExpenses()[0].merchant).toBe('Hotel XYZ');
    });

    it('should filter by category', () => {
      component.selectedCategory.set(ExpenseCategory.FUEL);
      expect(component.filteredExpenses().length).toBe(1);
      expect(component.filteredExpenses()[0].category).toBe(ExpenseCategory.FUEL);
    });

    it('should filter by date from', () => {
      component.dateFrom.set(new Date('2024-01-16'));
      expect(component.filteredExpenses().length).toBe(2);
    });

    it('should filter by date to', () => {
      component.dateTo.set(new Date('2024-01-15'));
      expect(component.filteredExpenses().length).toBe(1);
    });

    it('should filter by minimum amount', () => {
      component.minAmount.set(100);
      expect(component.filteredExpenses().length).toBe(2);
    });

    it('should filter by maximum amount', () => {
      component.maxAmount.set(100);
      expect(component.filteredExpenses().length).toBe(1);
    });

    it('should combine multiple filters', () => {
      component.selectedStatus.set(ExpenseStatus.DRAFT);
      component.selectedCategory.set(ExpenseCategory.FUEL);
      expect(component.filteredExpenses().length).toBe(1);
    });

    it('should search in notes', () => {
      component.searchQuery.set('business trip');
      expect(component.filteredExpenses().length).toBe(1);
      expect(component.filteredExpenses()[0].merchant).toBe('Hotel XYZ');
    });
  });

  // =============================================================================
  // FILTER CHANGE HANDLER TESTS
  // =============================================================================

  describe('onFiltersChange', () => {
    it('should update status filter', () => {
      component.onFiltersChange({ status: ExpenseStatus.APPROVED });
      expect(component.selectedStatus()).toBe(ExpenseStatus.APPROVED);
    });

    it('should update search query', () => {
      component.onFiltersChange({ searchQuery: 'test' });
      expect(component.searchQuery()).toBe('test');
    });

    it('should update category filter', () => {
      component.onFiltersChange({ category: ExpenseCategory.LODGING });
      expect(component.selectedCategory()).toBe(ExpenseCategory.LODGING);
    });

    it('should update date from', () => {
      const date = new Date('2024-01-01');
      component.onFiltersChange({ dateFrom: date });
      expect(component.dateFrom()).toEqual(date);
    });

    it('should update date to', () => {
      const date = new Date('2024-12-31');
      component.onFiltersChange({ dateTo: date });
      expect(component.dateTo()).toEqual(date);
    });

    it('should update min amount', () => {
      component.onFiltersChange({ minAmount: 50 });
      expect(component.minAmount()).toBe(50);
    });

    it('should update max amount', () => {
      component.onFiltersChange({ maxAmount: 1000 });
      expect(component.maxAmount()).toBe(1000);
    });
  });

  // =============================================================================
  // UI ACTIONS TESTS
  // =============================================================================

  describe('UI actions', () => {
    it('should toggle advanced filters', () => {
      expect(component.showAdvancedFilters).toBe(false);
      component.toggleAdvancedFilters();
      expect(component.showAdvancedFilters).toBe(true);
      component.toggleAdvancedFilters();
      expect(component.showAdvancedFilters).toBe(false);
    });

    it('should clear all filters', () => {
      component.selectedStatus.set(ExpenseStatus.DRAFT);
      component.searchQuery.set('test');
      component.selectedCategory.set(ExpenseCategory.FUEL);
      component.dateFrom.set(new Date());
      component.dateTo.set(new Date());
      component.minAmount.set(10);
      component.maxAmount.set(100);
      component.showAdvancedFilters = true;

      component.clearFilters();

      expect(component.selectedStatus()).toBe('all');
      expect(component.searchQuery()).toBe('');
      expect(component.selectedCategory()).toBe('all');
      expect(component.dateFrom()).toBeNull();
      expect(component.dateTo()).toBeNull();
      expect(component.minAmount()).toBeNull();
      expect(component.maxAmount()).toBeNull();
      expect(component.showAdvancedFilters).toBe(false);
    });
  });

  // =============================================================================
  // CATEGORY INFO TESTS
  // =============================================================================

  describe('getCategoryInfo', () => {
    beforeEach(fakeAsync(() => {
      tick();
    }));

    it('should return category info for known category', () => {
      const info = component.getCategoryInfo(ExpenseCategory.FUEL);
      expect(info).toBeTruthy();
      expect(info?.icon).toBe('local_gas_station');
      expect(info?.color).toBe('#ff5900');
    });

    it('should return null for unknown category', () => {
      const info = component.getCategoryInfo('unknown_category');
      expect(info).toBeNull();
    });
  });

  // =============================================================================
  // LIFECYCLE TESTS
  // =============================================================================

  describe('lifecycle', () => {
    it('should complete destroy$ on ngOnDestroy', () => {
      const completeSpy = spyOn(component['destroy$'], 'complete');
      component.ngOnDestroy();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // EXPORT TESTS
  // =============================================================================

  describe('exportToCSV', () => {
    beforeEach(fakeAsync(() => {
      tick();
    }));

    it('should show snackbar when no expenses to export', () => {
      component.expenses.set([]);
      component.exportToCSV();
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'No expenses to export.',
        'Close',
        { duration: 3000 }
      );
    });
  });

  // =============================================================================
  // FILTER STATE COMPUTED TESTS
  // =============================================================================

  describe('filterState', () => {
    it('should return current filter state', () => {
      component.selectedStatus.set(ExpenseStatus.DRAFT);
      component.searchQuery.set('test');

      const state = component.filterState();

      expect(state.status).toBe(ExpenseStatus.DRAFT);
      expect(state.searchQuery).toBe('test');
      expect(state.category).toBe('all');
    });
  });
});
