import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { BudgetManagementComponent } from './budget-management.component';
import { BudgetService } from '../../../core/services/budget.service';
import { MatDialog } from '@angular/material/dialog';
import { BudgetWithTracking } from '../../../core/models/budget.model';

describe('BudgetManagementComponent', () => {
  let component: BudgetManagementComponent;
  let fixture: ComponentFixture<BudgetManagementComponent>;
  let budgetServiceMock: jasmine.SpyObj<BudgetService>;
  let dialogMock: jasmine.SpyObj<MatDialog>;

  const mockBudget: BudgetWithTracking = {
    id: 'budget-1',
    organization_id: 'org-123',
    name: 'Travel Budget',
    budget_type: 'category',
    department: undefined,
    category: 'travel',
    user_id: undefined,
    amount: 10000,
    period: 'monthly',
    start_date: '2025-01-01',
    end_date: '2025-01-31',
    alert_threshold_percent: 80,
    is_active: true,
    created_by: 'user-123',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    tracking: {
      id: 'tracking-1',
      budget_id: 'budget-1',
      organization_id: 'org-123',
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      spent_amount: 5000,
      pending_amount: 1000,
      last_calculated_at: '2025-01-15T00:00:00Z'
    },
    percent_used: 60,
    status: 'under',
    remaining_amount: 4000,
    total_used: 6000
  };

  beforeEach(async () => {
    budgetServiceMock = jasmine.createSpyObj('BudgetService', [
      'getBudgets',
      'deleteBudget',
      'formatCurrency',
      'getBudgetPeriodLabel'
    ]);
    dialogMock = jasmine.createSpyObj('MatDialog', ['open']);

    // Default return values
    budgetServiceMock.getBudgets.and.returnValue(of([mockBudget]));
    budgetServiceMock.formatCurrency.and.returnValue('$10,000.00');
    budgetServiceMock.getBudgetPeriodLabel.and.returnValue('Monthly');

    await TestBed.configureTestingModule({
      imports: [
        BudgetManagementComponent,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: BudgetService, useValue: budgetServiceMock },
        { provide: MatDialog, useValue: dialogMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BudgetManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load budgets on init', () => {
    expect(budgetServiceMock.getBudgets).toHaveBeenCalled();
    expect(component.budgets().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('should filter budgets by type', () => {
    component.selectedType.set('category');
    const filtered = component.filteredBudgets();
    expect(filtered.length).toBe(1);
    expect(filtered[0].budget_type).toBe('category');
  });

  it('should calculate summary correctly', () => {
    const summary = component.summary();
    expect(summary.total).toBe(1);
    expect(summary.under).toBe(1);
    expect(summary.warning).toBe(0);
    expect(summary.exceeded).toBe(0);
  });

  it('should open create dialog', () => {
    const dialogRefMock = {
      afterClosed: () => of({ saved: true })
    };
    dialogMock.open.and.returnValue(dialogRefMock as any);

    component.openCreateDialog();

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should open edit dialog with budget', () => {
    const dialogRefMock = {
      afterClosed: () => of({ saved: true })
    };
    dialogMock.open.and.returnValue(dialogRefMock as any);

    component.openEditDialog(mockBudget);

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should delete budget when confirmed', () => {
    const dialogRefMock = {
      afterClosed: () => of(true)
    };
    dialogMock.open.and.returnValue(dialogRefMock as any);
    budgetServiceMock.deleteBudget.and.returnValue(of(undefined));

    component.deleteBudget(mockBudget);

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should get progress color based on budget status', () => {
    expect(component.getProgressColor({ ...mockBudget, status: 'exceeded' })).toBe('warn');
    expect(component.getProgressColor({ ...mockBudget, status: 'warning' })).toBe('accent');
    expect(component.getProgressColor({ ...mockBudget, status: 'under' })).toBe('primary');
  });

  it('should get status icon based on budget status', () => {
    expect(component.getStatusIcon({ ...mockBudget, status: 'exceeded' })).toBe('error');
    expect(component.getStatusIcon({ ...mockBudget, status: 'warning' })).toBe('warning');
    expect(component.getStatusIcon({ ...mockBudget, status: 'under' })).toBe('check_circle');
  });

  it('should format budget scope correctly', () => {
    expect(component.formatScope({ ...mockBudget, budget_type: 'department', department: 'IT' })).toBe('IT');
    expect(component.formatScope({ ...mockBudget, budget_type: 'category', category: 'travel' })).toBe('travel');
    expect(component.formatScope({ ...mockBudget, budget_type: 'user' })).toBe('Individual Budget');
    expect(component.formatScope({ ...mockBudget, budget_type: 'organization' })).toBe('Organization-wide');
  });

  it('should handle refresh', () => {
    component.onRefresh();
    expect(component.refreshing()).toBe(true);
    expect(budgetServiceMock.getBudgets).toHaveBeenCalledTimes(2);
  });

  it('should handle load error', () => {
    budgetServiceMock.getBudgets.and.returnValue(throwError(() => new Error('Load failed')));
    component.loadBudgets();
    expect(component.loading()).toBe(false);
  });
});
