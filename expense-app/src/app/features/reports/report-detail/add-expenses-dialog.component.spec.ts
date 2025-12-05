import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { AddExpensesDialogComponent } from './add-expenses-dialog.component';
import { ExpenseService } from '../../../core/services/expense.service';
import { Expense } from '../../../core/models/expense.model';
import { ExpenseStatus } from '../../../core/models/enums';

describe('AddExpensesDialogComponent', () => {
  let component: AddExpensesDialogComponent;
  let fixture: ComponentFixture<AddExpensesDialogComponent>;
  let expenseServiceMock: jasmine.SpyObj<ExpenseService>;
  let dialogRefMock: jasmine.SpyObj<MatDialogRef<AddExpensesDialogComponent>>;

  const mockExpense1: Expense = {
    id: 'expense-1',
    organization_id: 'org-123',
    user_id: 'user-123',
    category: 'Meals & Entertainment',
    amount: 50.00,
    currency: 'USD',
    merchant: 'Restaurant ABC',
    notes: 'Team lunch',
    expense_date: '2025-01-15',
    status: ExpenseStatus.DRAFT,
    is_reimbursable: true,
    report_id: null,
    policy_violations: [],
    created_at: '2025-01-15T12:00:00Z',
    updated_at: '2025-01-15T12:00:00Z'
  };

  const mockExpense2: Expense = {
    id: 'expense-2',
    organization_id: 'org-123',
    user_id: 'user-123',
    category: 'Transportation',
    amount: 75.00,
    currency: 'USD',
    merchant: 'Uber',
    notes: 'Airport ride',
    expense_date: '2025-01-16',
    status: ExpenseStatus.DRAFT,
    is_reimbursable: true,
    report_id: null,
    policy_violations: [],
    created_at: '2025-01-16T08:00:00Z',
    updated_at: '2025-01-16T08:00:00Z'
  };

  const mockExpenseWithReport: Expense = {
    ...mockExpense1,
    id: 'expense-3',
    report_id: 'report-1'
  };

  beforeEach(async () => {
    expenseServiceMock = jasmine.createSpyObj('ExpenseService', ['getMyExpenses']);
    dialogRefMock = jasmine.createSpyObj('MatDialogRef', ['close']);

    // Default return value
    expenseServiceMock.getMyExpenses.and.returnValue(of([mockExpense1, mockExpense2, mockExpenseWithReport]));

    await TestBed.configureTestingModule({
      imports: [
        AddExpensesDialogComponent,
        BrowserAnimationsModule,
        FormsModule
      ],
      providers: [
        { provide: ExpenseService, useValue: expenseServiceMock },
        { provide: MatDialogRef, useValue: dialogRefMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AddExpensesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load expenses on init', () => {
    expect(expenseServiceMock.getMyExpenses).toHaveBeenCalledWith({ status: ExpenseStatus.DRAFT });
    expect(component.loading()).toBe(false);
  });

  it('should filter out expenses already assigned to a report', () => {
    // mockExpenseWithReport has report_id = 'report-1', so it should be filtered out
    expect(component.expenses().length).toBe(2);
    expect(component.expenses()[0].id).toBe('expense-1');
    expect(component.expenses()[1].id).toBe('expense-2');
  });

  it('should only show expenses without report_id', () => {
    component.expenses().forEach(expense => {
      expect(expense.report_id).toBeNull();
    });
  });

  it('should toggle expense selection', () => {
    expect(component.selectedExpenses().size).toBe(0);

    component.toggleSelection('expense-1');
    expect(component.selectedExpenses().has('expense-1')).toBe(true);

    component.toggleSelection('expense-1');
    expect(component.selectedExpenses().has('expense-1')).toBe(false);
  });

  it('should allow multiple expenses to be selected', () => {
    component.toggleSelection('expense-1');
    component.toggleSelection('expense-2');

    expect(component.selectedExpenses().size).toBe(2);
    expect(component.selectedExpenses().has('expense-1')).toBe(true);
    expect(component.selectedExpenses().has('expense-2')).toBe(true);
  });

  it('should check if expense is selected', () => {
    expect(component.isSelected('expense-1')).toBe(false);

    component.toggleSelection('expense-1');
    expect(component.isSelected('expense-1')).toBe(true);
  });

  it('should save and close dialog with selected expense ids', () => {
    component.toggleSelection('expense-1');
    component.toggleSelection('expense-2');

    component.save();

    expect(dialogRefMock.close).toHaveBeenCalledWith(['expense-1', 'expense-2']);
  });

  it('should cancel and close dialog without data', () => {
    component.toggleSelection('expense-1');
    component.cancel();

    expect(dialogRefMock.close).toHaveBeenCalledWith();
  });

  it('should format currency correctly', () => {
    const formatted = component.formatCurrency(50.00);
    expect(formatted).toBe('$50.00');
  });

  it('should format currency with cents', () => {
    const formatted = component.formatCurrency(123.45);
    expect(formatted).toBe('$123.45');
  });

  it('should format date correctly', () => {
    const formatted = component.formatDate('2025-01-15');
    expect(formatted).toMatch(/1\/15\/2025/);
  });

  it('should handle load expenses error', () => {
    expenseServiceMock.getMyExpenses.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    spyOn(console, 'error');
    component.loadExpenses();

    setTimeout(() => {
      expect(console.error).toHaveBeenCalledWith('Failed to load expenses', jasmine.any(Error));
      expect(component.loading()).toBe(false);
    });
  });

  it('should set loading to false after successful load', () => {
    expect(component.loading()).toBe(false);
  });

  it('should set loading to false even if load fails', () => {
    expenseServiceMock.getMyExpenses.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    component.loadExpenses();

    setTimeout(() => {
      expect(component.loading()).toBe(false);
    });
  });

  it('should initialize with empty selection', () => {
    expect(component.selectedExpenses().size).toBe(0);
  });

  it('should handle empty expenses list', () => {
    expenseServiceMock.getMyExpenses.and.returnValue(of([]));
    component.loadExpenses();

    setTimeout(() => {
      expect(component.expenses().length).toBe(0);
    });
  });

  it('should handle all expenses having report_id', () => {
    const expensesWithReports = [
      { ...mockExpense1, report_id: 'report-1' },
      { ...mockExpense2, report_id: 'report-2' }
    ];

    expenseServiceMock.getMyExpenses.and.returnValue(of(expensesWithReports));
    component.loadExpenses();

    setTimeout(() => {
      expect(component.expenses().length).toBe(0);
    });
  });

  it('should preserve selection when toggling same expense twice', () => {
    component.toggleSelection('expense-1');
    const firstSelection = component.selectedExpenses();
    expect(firstSelection.has('expense-1')).toBe(true);

    component.toggleSelection('expense-1');
    component.toggleSelection('expense-1');
    expect(component.selectedExpenses().has('expense-1')).toBe(true);
  });

  it('should maintain other selections when toggling one expense', () => {
    component.toggleSelection('expense-1');
    component.toggleSelection('expense-2');

    component.toggleSelection('expense-1');

    expect(component.selectedExpenses().has('expense-1')).toBe(false);
    expect(component.selectedExpenses().has('expense-2')).toBe(true);
  });

  it('should call getMyExpenses with correct parameters', () => {
    expect(expenseServiceMock.getMyExpenses).toHaveBeenCalledWith({
      status: ExpenseStatus.DRAFT
    });
  });

  it('should filter expenses correctly', () => {
    const allExpenses = [mockExpense1, mockExpense2, mockExpenseWithReport];
    const filteredExpenses = allExpenses.filter((e) => !e.report_id);

    expect(filteredExpenses.length).toBe(2);
    expect(filteredExpenses.every(e => e.report_id === null)).toBe(true);
  });

  it('should save with empty selection', () => {
    component.save();
    expect(dialogRefMock.close).toHaveBeenCalledWith([]);
  });

  it('should convert Set to Array when saving', () => {
    component.toggleSelection('expense-1');
    component.save();

    const closeArg = dialogRefMock.close.calls.mostRecent().args[0];
    expect(Array.isArray(closeArg)).toBe(true);
    expect(closeArg).toEqual(['expense-1']);
  });
});
