import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SplitExpenseDialog, SplitExpenseDialogData } from './split-expense-dialog';
import { Expense } from '../../../core/models/expense.model';
import { ExpenseStatus, ExpenseCategory } from '../../../core/models/enums';

describe('SplitExpenseDialog', () => {
  let component: SplitExpenseDialog;
  let fixture: ComponentFixture<SplitExpenseDialog>;
  let dialogRef: jasmine.SpyObj<MatDialogRef<SplitExpenseDialog>>;

  const mockExpense: Expense = {
    id: 'test-expense-id',
    organization_id: 'org-123',
    user_id: 'user-123',
    merchant: 'Hyatt Hotel',
    amount: 200.00,
    currency: 'USD',
    category: ExpenseCategory.LODGING,
    expense_date: '2025-11-20',
    status: ExpenseStatus.DRAFT,
    is_reimbursable: true,
    policy_violations: [],
    created_at: '2025-11-20T10:00:00Z',
    updated_at: '2025-11-20T10:00:00Z'
  };

  const mockDialogData: SplitExpenseDialogData = {
    expense: mockExpense
  };

  beforeEach(async () => {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [
        SplitExpenseDialog,
        NoopAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SplitExpenseDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize with expense data', () => {
    expect(component.expense).toEqual(mockExpense);
    expect(component.expense.amount).toBe(200.00);
  });

  it('should start with 2 empty items', () => {
    expect(component.items.length).toBe(2);
  });

  it('should add new item when addItem is called', () => {
    const initialLength = component.items.length;
    component.addItem();
    expect(component.items.length).toBe(initialLength + 1);
  });

  it('should not allow removal below 2 items', () => {
    component.removeItem(0);
    expect(component.items.length).toBe(2); // Should still be 2
  });

  it('should allow removal when more than 2 items', () => {
    component.addItem(); // Now 3 items
    component.removeItem(0);
    expect(component.items.length).toBe(2);
  });

  it('should calculate items total correctly', () => {
    component.items.at(0).patchValue({ amount: 150 });
    component.items.at(1).patchValue({ amount: 50 });
    expect(component.itemsTotal).toBe(200);
  });

  it('should calculate remaining amount correctly', () => {
    component.items.at(0).patchValue({ amount: 120 });
    component.items.at(1).patchValue({ amount: 30 });
    expect(component.remainingAmount).toBe(50); // 200 - 150
  });

  it('should indicate when total matches expense', () => {
    component.items.at(0).patchValue({
      description: 'Room',
      amount: 150,
      category: ExpenseCategory.LODGING
    });
    component.items.at(1).patchValue({
      description: 'Meal',
      amount: 50,
      category: ExpenseCategory.INDIVIDUAL_MEALS
    });
    expect(component.totalMatchesExpense).toBe(true);
  });

  it('should indicate when total does not match expense', () => {
    component.items.at(0).patchValue({ amount: 100 });
    component.items.at(1).patchValue({ amount: 50 });
    expect(component.totalMatchesExpense).toBe(false);
  });

  it('should validate split is valid when form is complete and totals match', () => {
    component.items.at(0).patchValue({
      description: 'Room charge',
      amount: 150,
      category: ExpenseCategory.LODGING
    });
    component.items.at(1).patchValue({
      description: 'Room service',
      amount: 50,
      category: ExpenseCategory.INDIVIDUAL_MEALS
    });
    expect(component.isValidSplit).toBe(true);
  });

  it('should not be valid when totals do not match', () => {
    component.items.at(0).patchValue({
      description: 'Room charge',
      amount: 100,
      category: ExpenseCategory.LODGING
    });
    component.items.at(1).patchValue({
      description: 'Room service',
      amount: 50,
      category: ExpenseCategory.INDIVIDUAL_MEALS
    });
    expect(component.isValidSplit).toBe(false);
  });

  it('should distribute amounts evenly', () => {
    component.distributeEvenly();
    // 200 / 2 = 100 each
    expect(component.items.at(0).get('amount')?.value).toBe(100);
    expect(component.items.at(1).get('amount')?.value).toBe(100);
  });

  it('should split in half', () => {
    component.splitHalf();
    expect(component.items.length).toBe(2);
    const item1Amount = component.items.at(0).get('amount')?.value;
    const item2Amount = component.items.at(1).get('amount')?.value;
    expect(item1Amount + item2Amount).toBe(200);
  });

  it('should fill remaining amount', () => {
    component.items.at(0).patchValue({ amount: 150 });
    component.items.at(1).patchValue({ amount: 0 });
    component.fillRemaining(1);
    expect(component.items.at(1).get('amount')?.value).toBe(50);
  });

  it('should close dialog on cancel', () => {
    component.onCancel();
    expect(dialogRef.close).toHaveBeenCalledWith();
  });

  it('should close dialog with items on valid split', () => {
    component.items.at(0).patchValue({
      description: 'Room charge',
      amount: 150,
      category: ExpenseCategory.LODGING
    });
    component.items.at(1).patchValue({
      description: 'Room service',
      amount: 50,
      category: ExpenseCategory.INDIVIDUAL_MEALS
    });

    component.onSplit();

    expect(dialogRef.close).toHaveBeenCalledWith({
      items: [
        { description: 'Room charge', amount: 150, category: ExpenseCategory.LODGING },
        { description: 'Room service', amount: 50, category: ExpenseCategory.INDIVIDUAL_MEALS }
      ]
    });
  });

  it('should not close dialog on invalid split', () => {
    // Leave items empty/invalid
    component.onSplit();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('should format currency correctly', () => {
    expect(component.formatCurrency(150.50)).toBe('$150.50');
  });

  it('should have all expense categories available', () => {
    expect(component.categories).toContain(ExpenseCategory.LODGING);
    expect(component.categories).toContain(ExpenseCategory.INDIVIDUAL_MEALS);
    expect(component.categories).toContain(ExpenseCategory.FUEL);
    expect(component.categories.length).toBe(16); // All 16 categories from ExpenseCategory enum
  });
});
