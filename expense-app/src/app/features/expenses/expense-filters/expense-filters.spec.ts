import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ExpenseFiltersComponent, ExpenseFilterState } from './expense-filters';
import { ExpenseCategory, ExpenseStatus } from '../../../core/models/enums';

describe('ExpenseFiltersComponent', () => {
  let component: ExpenseFiltersComponent;
  let fixture: ComponentFixture<ExpenseFiltersComponent>;

  const defaultFilters: ExpenseFilterState = {
    status: 'all',
    searchQuery: '',
    category: 'all',
    dateFrom: null,
    dateTo: null,
    minAmount: null,
    maxAmount: null
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseFiltersComponent, NoopAnimationsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseFiltersComponent);
    component = fixture.componentInstance;
    component.filters = { ...defaultFilters };
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =============================================================================
  // OPTIONS CONFIGURATION TESTS
  // =============================================================================

  describe('status options', () => {
    it('should have correct status options', () => {
      expect(component.statusOptions.length).toBe(6);
      expect(component.statusOptions[0]).toEqual({ value: 'all', label: 'All' });
      expect(component.statusOptions[1]).toEqual({ value: ExpenseStatus.DRAFT, label: 'Draft' });
      expect(component.statusOptions[2]).toEqual({ value: ExpenseStatus.SUBMITTED, label: 'Pending' });
    });

    it('should include all expense statuses', () => {
      const values = component.statusOptions.map(o => o.value);
      expect(values).toContain('all');
      expect(values).toContain(ExpenseStatus.DRAFT);
      expect(values).toContain(ExpenseStatus.SUBMITTED);
      expect(values).toContain(ExpenseStatus.APPROVED);
      expect(values).toContain(ExpenseStatus.REJECTED);
      expect(values).toContain(ExpenseStatus.REIMBURSED);
    });
  });

  describe('category options', () => {
    it('should have all category options plus "All Categories"', () => {
      expect(component.categoryOptions.length).toBe(10);
      expect(component.categoryOptions[0]).toEqual({ value: 'all', label: 'All Categories' });
    });

    it('should include all expense categories', () => {
      const values = component.categoryOptions.map(o => o.value);
      expect(values).toContain('all');
      expect(values).toContain(ExpenseCategory.FUEL);
      expect(values).toContain(ExpenseCategory.INDIVIDUAL_MEALS);
      expect(values).toContain(ExpenseCategory.BUSINESS_MEALS);
      expect(values).toContain(ExpenseCategory.LODGING);
      expect(values).toContain(ExpenseCategory.AIRFARE);
    });
  });

  // =============================================================================
  // INPUT BINDING TESTS
  // =============================================================================

  describe('input bindings', () => {
    it('should accept filters input', () => {
      const customFilters: ExpenseFilterState = {
        status: ExpenseStatus.APPROVED,
        searchQuery: 'test',
        category: ExpenseCategory.FUEL,
        dateFrom: new Date(),
        dateTo: new Date(),
        minAmount: 10,
        maxAmount: 100
      };
      component.filters = customFilters;
      expect(component.filters).toEqual(customFilters);
    });

    it('should accept showAdvanced input', () => {
      component.showAdvanced = true;
      expect(component.showAdvanced).toBe(true);
    });

    it('should accept activeFilterCount input', () => {
      component.activeFilterCount = 3;
      expect(component.activeFilterCount).toBe(3);
    });

    it('should default showAdvanced to false', () => {
      const newComponent = new ExpenseFiltersComponent();
      expect(newComponent.showAdvanced).toBe(false);
    });

    it('should default activeFilterCount to 0', () => {
      const newComponent = new ExpenseFiltersComponent();
      expect(newComponent.activeFilterCount).toBe(0);
    });
  });

  // =============================================================================
  // OUTPUT EVENT TESTS
  // =============================================================================

  describe('onStatusChange', () => {
    it('should emit filtersChange with new status', () => {
      spyOn(component.filtersChange, 'emit');
      component.onStatusChange(ExpenseStatus.APPROVED);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ status: ExpenseStatus.APPROVED });
    });

    it('should emit "all" status', () => {
      spyOn(component.filtersChange, 'emit');
      component.onStatusChange('all');
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ status: 'all' });
    });
  });

  describe('onSearchChange', () => {
    it('should emit filtersChange with search query', () => {
      spyOn(component.filtersChange, 'emit');
      component.onSearchChange('test search');
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ searchQuery: 'test search' });
    });

    it('should emit empty search query', () => {
      spyOn(component.filtersChange, 'emit');
      component.onSearchChange('');
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ searchQuery: '' });
    });
  });

  describe('onCategoryChange', () => {
    it('should emit filtersChange with category', () => {
      spyOn(component.filtersChange, 'emit');
      component.onCategoryChange(ExpenseCategory.FUEL);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ category: ExpenseCategory.FUEL });
    });

    it('should emit "all" category', () => {
      spyOn(component.filtersChange, 'emit');
      component.onCategoryChange('all');
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ category: 'all' });
    });
  });

  describe('onDateFromChange', () => {
    it('should emit filtersChange with date from valid string', () => {
      spyOn(component.filtersChange, 'emit');
      component.onDateFromChange('2024-01-15');
      const emittedValue = (component.filtersChange.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(emittedValue.dateFrom).toEqual(jasmine.any(Date));
      expect(emittedValue.dateFrom.toISOString()).toContain('2024-01-15');
    });

    it('should emit null for empty date string', () => {
      spyOn(component.filtersChange, 'emit');
      component.onDateFromChange('');
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ dateFrom: null });
    });
  });

  describe('onDateToChange', () => {
    it('should emit filtersChange with date to from valid string', () => {
      spyOn(component.filtersChange, 'emit');
      component.onDateToChange('2024-12-31');
      const emittedValue = (component.filtersChange.emit as jasmine.Spy).calls.mostRecent().args[0];
      expect(emittedValue.dateTo).toEqual(jasmine.any(Date));
      expect(emittedValue.dateTo.toISOString()).toContain('2024-12-31');
    });

    it('should emit null for empty date string', () => {
      spyOn(component.filtersChange, 'emit');
      component.onDateToChange('');
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ dateTo: null });
    });
  });

  describe('onMinAmountChange', () => {
    it('should emit filtersChange with min amount', () => {
      spyOn(component.filtersChange, 'emit');
      component.onMinAmountChange(50);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ minAmount: 50 });
    });

    it('should emit null min amount', () => {
      spyOn(component.filtersChange, 'emit');
      component.onMinAmountChange(null);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ minAmount: null });
    });

    it('should emit zero min amount', () => {
      spyOn(component.filtersChange, 'emit');
      component.onMinAmountChange(0);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ minAmount: 0 });
    });
  });

  describe('onMaxAmountChange', () => {
    it('should emit filtersChange with max amount', () => {
      spyOn(component.filtersChange, 'emit');
      component.onMaxAmountChange(1000);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ maxAmount: 1000 });
    });

    it('should emit null max amount', () => {
      spyOn(component.filtersChange, 'emit');
      component.onMaxAmountChange(null);
      expect(component.filtersChange.emit).toHaveBeenCalledWith({ maxAmount: null });
    });
  });

  // =============================================================================
  // OUTPUT EMITTERS TESTS
  // =============================================================================

  describe('output emitters', () => {
    it('should have toggleAdvanced output', () => {
      expect(component.toggleAdvanced).toBeTruthy();
    });

    it('should have clearFilters output', () => {
      expect(component.clearFilters).toBeTruthy();
    });

    it('should have filtersChange output', () => {
      expect(component.filtersChange).toBeTruthy();
    });
  });
});
