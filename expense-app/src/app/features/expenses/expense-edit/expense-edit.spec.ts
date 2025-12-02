import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { ExpenseEditComponent } from './expense-edit';
import { ExpenseService } from '../../../core/services/expense.service';
import { ExpenseCategory, ExpenseStatus, OcrStatus } from '../../../core/models/enums';
import { Expense } from '../../../core/models/expense.model';

describe('ExpenseEditComponent', () => {
  let component: ExpenseEditComponent;
  let fixture: ComponentFixture<ExpenseEditComponent>;
  let expenseServiceSpy: jasmine.SpyObj<ExpenseService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockReceipt = {
    id: 'receipt-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    file_path: '/receipts/1.jpg',
    file_name: 'receipt.jpg',
    file_type: 'image/jpeg',
    file_size: 1024,
    ocr_status: OcrStatus.COMPLETED,
    created_at: '2024-01-15T10:00:00Z'
  };

  const mockExpense: Expense = {
    id: 'exp-123',
    organization_id: 'org-1',
    user_id: 'user-1',
    merchant: 'Test Merchant',
    amount: 50.00,
    currency: 'USD',
    category: ExpenseCategory.FUEL,
    expense_date: '2024-01-15',
    status: ExpenseStatus.DRAFT,
    notes: 'Test notes',
    is_reimbursable: true,
    policy_violations: [],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    receipt: mockReceipt
  };

  beforeEach(async () => {
    expenseServiceSpy = jasmine.createSpyObj('ExpenseService', [
      'getExpenseById',
      'updateExpense',
      'attachReceipt',
      'detachReceipt',
      'getReceiptUrl'
    ]);
    expenseServiceSpy.getExpenseById.and.returnValue(of(mockExpense));
    expenseServiceSpy.updateExpense.and.returnValue(of(mockExpense));
    expenseServiceSpy.getReceiptUrl.and.returnValue('https://example.com/receipt.jpg');

    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [ExpenseEditComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: ExpenseService, useValue: expenseServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: 'exp-123' }),
              queryParamMap: convertToParamMap({})
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseEditComponent);
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
    it('should load expense on init', fakeAsync(() => {
      tick();
      expect(expenseServiceSpy.getExpenseById).toHaveBeenCalledWith('exp-123');
      expect(component.expense()).toEqual(mockExpense);
      expect(component.loading()).toBe(false);
    }));

    it('should populate form with expense data', fakeAsync(() => {
      tick();
      expect(component.form.get('merchant')?.value).toBe('Test Merchant');
      expect(component.form.get('amount')?.value).toBe(50.00);
      expect(component.form.get('category')?.value).toBe(ExpenseCategory.FUEL);
    }));

    it('should set attached receipt from expense', fakeAsync(() => {
      tick();
      expect(component.attachedReceipt()).toEqual(mockReceipt);
      expect(component.originalReceiptId()).toBe('receipt-1');
    }));

    it('should have all expense categories', () => {
      expect(component.categories.length).toBeGreaterThan(0);
      expect(component.categories).toContain(ExpenseCategory.FUEL);
      expect(component.categories).toContain(ExpenseCategory.LODGING);
    });
  });

  describe('initialization error handling', () => {
    it('should set error when expense ID is missing', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ExpenseEditComponent, NoopAnimationsModule],
        providers: [
          provideRouter([]),
          { provide: ExpenseService, useValue: expenseServiceSpy },
          { provide: MatSnackBar, useValue: snackBarSpy },
          { provide: MatDialog, useValue: dialogSpy },
          { provide: Router, useValue: routerSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: convertToParamMap({}),
                queryParamMap: convertToParamMap({})
              }
            }
          }
        ]
      }).compileComponents();

      const newFixture = TestBed.createComponent(ExpenseEditComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.error()).toBe('Missing expense ID');
      expect(newComponent.loading()).toBe(false);
    });

    it('should handle expense load error', fakeAsync(() => {
      expenseServiceSpy.getExpenseById.and.returnValue(throwError(() => new Error('Not found')));

      const newFixture = TestBed.createComponent(ExpenseEditComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();
      tick();

      expect(newComponent.error()).toBe('Not found');
      expect(newComponent.loading()).toBe(false);
    }));

    it('should highlight violations when focus query param is set', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ExpenseEditComponent, NoopAnimationsModule],
        providers: [
          provideRouter([]),
          { provide: ExpenseService, useValue: expenseServiceSpy },
          { provide: MatSnackBar, useValue: snackBarSpy },
          { provide: MatDialog, useValue: dialogSpy },
          { provide: Router, useValue: routerSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                paramMap: convertToParamMap({ id: 'exp-123' }),
                queryParamMap: convertToParamMap({ focus: 'violations' })
              }
            }
          }
        ]
      }).compileComponents();

      const newFixture = TestBed.createComponent(ExpenseEditComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.highlightViolations()).toBe(true);
    });
  });

  // =============================================================================
  // FORM VALIDATION TESTS
  // =============================================================================

  describe('form validation', () => {
    it('should have required merchant field', () => {
      component.form.get('merchant')?.setValue('');
      expect(component.form.get('merchant')?.valid).toBe(false);
    });

    it('should require minimum merchant length', () => {
      component.form.get('merchant')?.setValue('A');
      expect(component.form.get('merchant')?.valid).toBe(false);

      component.form.get('merchant')?.setValue('AB');
      expect(component.form.get('merchant')?.valid).toBe(true);
    });

    it('should have required amount field', () => {
      component.form.get('amount')?.setValue(null);
      expect(component.form.get('amount')?.valid).toBe(false);
    });

    it('should require minimum amount of 0.01', () => {
      component.form.get('amount')?.setValue(0);
      expect(component.form.get('amount')?.valid).toBe(false);

      component.form.get('amount')?.setValue(0.01);
      expect(component.form.get('amount')?.valid).toBe(true);
    });

    it('should have required category field', () => {
      component.form.get('category')?.setValue('');
      expect(component.form.get('category')?.valid).toBe(false);
    });

    it('should have required expense_date field', () => {
      component.form.get('expense_date')?.setValue('');
      expect(component.form.get('expense_date')?.valid).toBe(false);
    });

    it('should not require notes field', () => {
      component.form.get('notes')?.setValue('');
      expect(component.form.get('notes')?.valid).toBe(true);
    });
  });

  // =============================================================================
  // SAVE CHANGES TESTS
  // =============================================================================

  describe('saveChanges', () => {
    beforeEach(fakeAsync(() => {
      tick(); // Wait for initial load
    }));

    it('should not save if form is invalid', () => {
      component.form.get('merchant')?.setValue('');
      component.saveChanges();
      expect(expenseServiceSpy.updateExpense).not.toHaveBeenCalled();
    });

    it('should mark all controls as touched on invalid form', () => {
      component.form.get('merchant')?.setValue('');
      component.saveChanges();
      expect(component.form.get('merchant')?.touched).toBe(true);
    });

    it('should call updateExpense on valid form', fakeAsync(() => {
      component.form.patchValue({
        merchant: 'Updated Merchant',
        amount: 75.00,
        category: ExpenseCategory.LODGING,
        expense_date: '2024-02-01',
        notes: 'Updated notes'
      });

      component.saveChanges();
      tick();

      expect(expenseServiceSpy.updateExpense).toHaveBeenCalled();
    }));

    it('should set saving to false after successful save', fakeAsync(() => {
      component.form.patchValue({
        merchant: 'Updated Merchant',
        amount: 75.00,
        category: ExpenseCategory.LODGING,
        expense_date: '2024-02-01'
      });

      component.saveChanges();
      tick();

      expect(component.saving()).toBe(false);
    }));

    it('should navigate to expense detail after save', fakeAsync(() => {
      component.form.patchValue({
        merchant: 'Updated Merchant',
        amount: 75.00,
        category: ExpenseCategory.LODGING,
        expense_date: '2024-02-01'
      });

      component.saveChanges();
      tick();

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/expenses', mockExpense.id]);
    }));

    it('should handle save error and reset saving state', fakeAsync(() => {
      expenseServiceSpy.updateExpense.and.returnValue(throwError(() => new Error('Save failed')));

      component.form.patchValue({
        merchant: 'Updated Merchant',
        amount: 75.00,
        category: ExpenseCategory.LODGING,
        expense_date: '2024-02-01'
      });

      component.saveChanges();
      tick();

      expect(component.saving()).toBe(false);
    }));
  });

  // =============================================================================
  // RECEIPT MANAGEMENT TESTS
  // =============================================================================

  describe('receipt management', () => {
    it('should remove receipt when removeReceipt is called', fakeAsync(() => {
      tick();
      expect(component.attachedReceipt()).toBeTruthy();

      component.removeReceipt();

      expect(component.attachedReceipt()).toBeNull();
    }));

    it('should open view receipt URL in new window', fakeAsync(() => {
      tick();
      spyOn(window, 'open');

      component.viewReceipt();

      expect(expenseServiceSpy.getReceiptUrl).toHaveBeenCalledWith('/receipts/1.jpg');
      expect(window.open).toHaveBeenCalledWith('https://example.com/receipt.jpg', '_blank');
    }));

    it('should not open window when no receipt attached', fakeAsync(() => {
      tick();
      component.attachedReceipt.set(null);
      spyOn(window, 'open');

      component.viewReceipt();

      expect(window.open).not.toHaveBeenCalled();
    }));

    it('should open attach dialog', fakeAsync(() => {
      tick();
      dialogSpy.open.and.returnValue({
        afterClosed: () => of(undefined)
      } as any);

      component.openAttachDialog();

      expect(dialogSpy.open).toHaveBeenCalled();
    }));

    it('should update attached receipt from dialog result', fakeAsync(() => {
      tick();
      const newReceipt = {
        id: 'receipt-2',
        organization_id: 'org-1',
        user_id: 'user-1',
        file_path: '/receipts/2.jpg',
        file_name: 'receipt2.jpg',
        file_type: 'image/jpeg',
        file_size: 2048,
        ocr_status: OcrStatus.COMPLETED,
        created_at: '2024-01-16T10:00:00Z'
      };

      dialogSpy.open.and.returnValue({
        afterClosed: () => of(newReceipt)
      } as any);

      component.openAttachDialog();
      tick();

      expect(component.attachedReceipt()).toEqual(newReceipt);
    }));
  });

  // =============================================================================
  // CANCEL TESTS
  // =============================================================================

  describe('cancel', () => {
    it('should navigate to expense detail on cancel', fakeAsync(() => {
      tick();
      component.cancel();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/expenses', 'exp-123']);
    }));
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
});
