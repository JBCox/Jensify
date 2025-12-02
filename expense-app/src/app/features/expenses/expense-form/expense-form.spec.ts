import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError, Subject } from 'rxjs';
import { ExpenseFormComponent } from './expense-form';
import { ExpenseService } from '../../../core/services/expense.service';
import { CategoryService } from '../../../core/services/category.service';
import { DuplicateDetectionService } from '../../../core/services/duplicate-detection.service';
import { OcrService } from '../../../core/services/ocr.service';
import { BudgetService } from '../../../core/services/budget.service';
import { ExpenseCategory, ExpenseStatus, OcrStatus } from '../../../core/models/enums';
import { CustomExpenseCategory } from '../../../core/models/gl-code.model';
import { BudgetCheckResult } from '../../../core/models/budget.model';
import { Expense } from '../../../core/models/expense.model';

describe('ExpenseFormComponent', () => {
  let component: ExpenseFormComponent;
  let fixture: ComponentFixture<ExpenseFormComponent>;
  let expenseServiceSpy: jasmine.SpyObj<ExpenseService>;
  let categoryServiceSpy: jasmine.SpyObj<CategoryService>;
  let duplicateServiceSpy: jasmine.SpyObj<DuplicateDetectionService>;
  let ocrServiceSpy: jasmine.SpyObj<OcrService>;
  let budgetServiceSpy: jasmine.SpyObj<BudgetService>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let routerSpy: jasmine.SpyObj<Router>;

  const mockCategories: CustomExpenseCategory[] = [
    {
      id: 'cat-1',
      organization_id: 'org-1',
      name: 'Fuel',
      is_active: true,
      requires_receipt: true,
      requires_description: false,
      icon: 'local_gas_station',
      color: '#ff5900',
      display_order: 1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'cat-2',
      organization_id: 'org-1',
      name: 'Lodging',
      is_active: true,
      requires_receipt: true,
      requires_description: false,
      icon: 'hotel',
      color: '#0066cc',
      display_order: 2,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      gl_code: 'GL-5200',
      gl_code_name: 'Travel & Lodging'
    }
  ];

  const mockReceipt = {
    id: 'receipt-1',
    organization_id: 'org-1',
    user_id: 'user-1',
    file_path: '/receipts/1.jpg',
    file_name: 'receipt.jpg',
    file_type: 'image/jpeg',
    file_size: 1024,
    ocr_status: OcrStatus.COMPLETED,
    extracted_merchant: 'Gas Station ABC',
    extracted_amount: 45.50,
    extracted_date: '2024-01-15',
    created_at: '2024-01-15T10:00:00Z'
  };

  const mockCreatedExpense: Expense = {
    id: 'exp-123',
    organization_id: 'org-1',
    user_id: 'user-1',
    merchant: 'Test Merchant',
    amount: 50.00,
    currency: 'USD',
    category: ExpenseCategory.FUEL,
    expense_date: '2024-01-15',
    status: ExpenseStatus.DRAFT,
    is_reimbursable: true,
    policy_violations: [],
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
  };

  beforeEach(async () => {
    expenseServiceSpy = jasmine.createSpyObj('ExpenseService', [
      'createExpense',
      'attachReceipt',
      'getReceiptById',
      'getReceiptUrl'
    ]);
    expenseServiceSpy.createExpense.and.returnValue(of(mockCreatedExpense));
    expenseServiceSpy.attachReceipt.and.returnValue(of(void 0));
    expenseServiceSpy.getReceiptById.and.returnValue(of(mockReceipt));
    expenseServiceSpy.getReceiptUrl.and.returnValue('https://example.com/receipt.jpg');

    categoryServiceSpy = jasmine.createSpyObj('CategoryService', ['getActiveCategories']);
    categoryServiceSpy.getActiveCategories.and.returnValue(of(mockCategories));

    duplicateServiceSpy = jasmine.createSpyObj('DuplicateDetectionService', ['findPotentialDuplicates']);
    duplicateServiceSpy.findPotentialDuplicates.and.returnValue(of([]));

    ocrServiceSpy = jasmine.createSpyObj('OcrService', ['extractLineItems', 'shouldSuggestSplit']);
    ocrServiceSpy.extractLineItems.and.returnValue([]);
    ocrServiceSpy.shouldSuggestSplit.and.returnValue(false);

    budgetServiceSpy = jasmine.createSpyObj('BudgetService', ['getBudgetWarnings']);
    budgetServiceSpy.getBudgetWarnings.and.returnValue(of([]));

    snackBarSpy = jasmine.createSpyObj('MatSnackBar', ['open']);
    snackBarSpy.open.and.returnValue({ onAction: () => of(void 0) } as any);

    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    routerSpy = jasmine.createSpyObj('Router', ['navigate', 'createUrlTree', 'serializeUrl'], {
      events: new Subject(),
      url: '/'
    });
    // Mock UrlTree with required properties
    const mockUrlTree = {
      root: { children: {} },
      queryParams: {},
      fragment: null,
      queryParamMap: { keys: [], has: () => false, get: () => null, getAll: () => [] }
    };
    routerSpy.createUrlTree.and.returnValue(mockUrlTree as any);
    routerSpy.serializeUrl.and.returnValue('/');

    await TestBed.configureTestingModule({
      imports: [ExpenseFormComponent, NoopAnimationsModule],
      providers: [
        provideRouter([]),
        { provide: ExpenseService, useValue: expenseServiceSpy },
        { provide: CategoryService, useValue: categoryServiceSpy },
        { provide: DuplicateDetectionService, useValue: duplicateServiceSpy },
        { provide: OcrService, useValue: ocrServiceSpy },
        { provide: BudgetService, useValue: budgetServiceSpy },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({})
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseFormComponent);
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
    it('should initialize form with default values', fakeAsync(() => {
      tick();
      expect(component.form).toBeTruthy();
      expect(component.form.get('merchant')?.value).toBe('');
      expect(component.form.get('amount')?.value).toBeNull();
      expect(component.form.get('notes')?.value).toBe('');
    }));

    it('should load categories on init', fakeAsync(() => {
      tick();
      expect(categoryServiceSpy.getActiveCategories).toHaveBeenCalled();
      expect(component.categories().length).toBe(2);
    }));

    it('should set default category to Fuel if available', fakeAsync(() => {
      tick();
      expect(component.form.get('category')?.value).toBe('cat-1');
    }));

    it('should handle category load error with fallback', fakeAsync(() => {
      categoryServiceSpy.getActiveCategories.and.returnValue(throwError(() => new Error('Load failed')));

      const newFixture = TestBed.createComponent(ExpenseFormComponent);
      newFixture.detectChanges();
      tick();

      expect(newFixture.componentInstance.categories().length).toBeGreaterThan(0);
    }));
  });

  // =============================================================================
  // FORM VALIDATION TESTS
  // =============================================================================

  describe('form validation', () => {
    it('should have required merchant field', () => {
      component.form.get('merchant')?.setValue('');
      expect(component.form.get('merchant')?.valid).toBe(false);
    });

    it('should require minimum merchant length of 2', () => {
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
      component.form.get('category')?.setValue(null);
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
  // COMPUTED PROPERTIES TESTS
  // =============================================================================

  describe('computed properties', () => {
    beforeEach(fakeAsync(() => {
      tick(); // Wait for categories to load
      fixture.detectChanges();
    }));

    it('should return selected category based on default (Fuel)', fakeAsync(() => {
      // Component auto-selects first 'fuel' category on init
      const selected = component.selectedCategory();
      expect(selected?.name).toBe('Fuel');
      expect(selected?.id).toBe('cat-1');
    }));

    it('should have categories loaded', fakeAsync(() => {
      expect(component.categories().length).toBe(2);
      expect(component.categories()[0].name).toBe('Fuel');
      expect(component.categories()[1].name).toBe('Lodging');
    }));

    it('should return null for GL code when category has no GL code', fakeAsync(() => {
      // cat-1 (Fuel) has no gl_code in mock
      const selected = component.selectedCategory();
      expect(selected?.name).toBe('Fuel');
      expect(component.currentGlCode()).toBeNull();
    }));

    it('should have GL code name null when category has no GL code name', fakeAsync(() => {
      // cat-1 (Fuel) has no gl_code_name in mock
      expect(component.currentGlCodeName()).toBeNull();
    }));
  });

  // =============================================================================
  // FORM SUBMISSION TESTS
  // =============================================================================

  describe('onSubmit', () => {
    beforeEach(fakeAsync(() => {
      tick(); // Wait for categories to load
    }));

    it('should not submit if form is invalid', async () => {
      component.form.get('merchant')?.setValue('');
      await component.onSubmit();
      expect(expenseServiceSpy.createExpense).not.toHaveBeenCalled();
    });

    it('should mark all controls as touched on invalid submit', async () => {
      component.form.get('merchant')?.setValue('');
      await component.onSubmit();
      expect(component.form.get('merchant')?.touched).toBe(true);
    });

    it('should create expense on valid form', fakeAsync(async () => {
      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15',
        notes: 'Test notes'
      });

      await component.onSubmit();
      tick(1000); // Wait for setTimeout navigation

      expect(expenseServiceSpy.createExpense).toHaveBeenCalled();
    }));

    it('should navigate to expenses list after successful creation', fakeAsync(async () => {
      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });

      await component.onSubmit();
      tick(1000);

      expect(routerSpy.navigate).toHaveBeenCalledWith(['/expenses']);
    }));

    it('should set success message after creation', fakeAsync(async () => {
      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });

      await component.onSubmit();
      tick();

      expect(component.successMessage).toBe('Expense created.');
    }));

    it('should handle creation error', fakeAsync(async () => {
      expenseServiceSpy.createExpense.and.returnValue(throwError(() => new Error('Creation failed')));

      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });

      await component.onSubmit();
      tick();

      expect(component.errorMessage).toBe('Creation failed');
      expect(component.loading).toBe(false);
    }));
  });

  // =============================================================================
  // DUPLICATE DETECTION TESTS
  // =============================================================================

  describe('duplicate detection', () => {
    beforeEach(fakeAsync(() => {
      tick();
    }));

    it('should check for duplicates before submission', fakeAsync(async () => {
      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });

      await component.onSubmit();
      tick();

      expect(duplicateServiceSpy.findPotentialDuplicates).toHaveBeenCalled();
    }));

    it('should continue submission if no duplicates found', fakeAsync(async () => {
      duplicateServiceSpy.findPotentialDuplicates.and.returnValue(of([]));

      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });

      await component.onSubmit();
      tick(1000);

      expect(expenseServiceSpy.createExpense).toHaveBeenCalled();
    }));

    it('should handle duplicate check errors gracefully', fakeAsync(async () => {
      duplicateServiceSpy.findPotentialDuplicates.and.returnValue(
        throwError(() => new Error('Duplicate check failed'))
      );

      component.form.patchValue({
        merchant: 'Test Merchant',
        amount: 50.00,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });

      await component.onSubmit();
      tick(1000);

      // Should continue with submission despite duplicate check failure
      expect(expenseServiceSpy.createExpense).toHaveBeenCalled();
    }));
  });

  // =============================================================================
  // RECEIPT ATTACHMENT TESTS
  // =============================================================================

  describe('receipt attachment', () => {
    it('should open attach dialog', () => {
      dialogSpy.open.and.returnValue({
        afterClosed: () => of(undefined)
      } as any);

      component.openAttachDialog();

      expect(dialogSpy.open).toHaveBeenCalled();
    });

    it('should update receipt on dialog result', fakeAsync(() => {
      dialogSpy.open.and.returnValue({
        afterClosed: () => of(mockReceipt)
      } as any);

      component.openAttachDialog();
      tick();

      expect(component.receiptId).toBe('receipt-1');
      expect(component.attachedReceipt).toBeTruthy();
    }));

    it('should remove attached receipt', () => {
      component.receiptId = 'receipt-1';
      component.attachedReceipt = mockReceipt as any;
      component.smartScanStatus = OcrStatus.COMPLETED;

      component.removeAttachedReceipt();

      expect(component.receiptId).toBeNull();
      expect(component.attachedReceipt).toBeNull();
      expect(component.smartScanStatus).toBeNull();
    });

    it('should view receipt in new window', () => {
      component.attachedReceipt = mockReceipt as any;
      spyOn(window, 'open');

      component.viewAttachedReceipt();

      expect(window.open).toHaveBeenCalledWith('https://example.com/receipt.jpg', '_blank');
    });

    it('should not open window when no receipt attached', () => {
      component.attachedReceipt = null;
      spyOn(window, 'open');

      component.viewAttachedReceipt();

      expect(window.open).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // BUDGET WARNING TESTS
  // =============================================================================

  describe('budget warnings', () => {
    beforeEach(fakeAsync(() => {
      tick(); // Wait for categories to load
      budgetServiceSpy.getBudgetWarnings.calls.reset();
    }));

    it('should check budgets when amount changes', fakeAsync(() => {
      // Set all required fields first
      component.form.patchValue({
        merchant: 'Test',
        category: 'cat-1',
        expense_date: '2024-01-15',
        amount: 50 // Initial amount
      });
      tick();
      budgetServiceSpy.getBudgetWarnings.calls.reset();

      // Now change amount to trigger valueChanges
      component.form.get('amount')?.setValue(100);
      tick();

      expect(budgetServiceSpy.getBudgetWarnings).toHaveBeenCalled();
    }));

    it('should check budgets when category changes', fakeAsync(() => {
      // Set all required fields first
      component.form.patchValue({
        merchant: 'Test',
        amount: 50,
        expense_date: '2024-01-15',
        category: 'cat-1' // Initial category
      });
      tick();
      budgetServiceSpy.getBudgetWarnings.calls.reset();

      // Now change category to trigger valueChanges
      component.form.get('category')?.setValue('cat-2');
      tick();

      expect(budgetServiceSpy.getBudgetWarnings).toHaveBeenCalled();
    }));

    it('should set budgetWarnings signal for exceeded budgets', fakeAsync(() => {
      const mockWarning: BudgetCheckResult = {
        budget_id: 'b1',
        budget_name: 'Monthly',
        budget_amount: 100,
        spent_amount: 150,
        pending_amount: 0,
        remaining_amount: -50,
        percent_used: 150,
        status: 'exceeded',
        message: 'Budget exceeded'
      };

      // Set up the mock to return exceeded budget warning
      budgetServiceSpy.getBudgetWarnings.and.returnValue(of([mockWarning]));

      // Set up form with all required fields
      component.form.patchValue({
        merchant: 'Test',
        amount: 100,
        category: 'cat-1',
        expense_date: '2024-01-15'
      });
      tick();

      // Call checkBudgets directly
      (component as any).checkBudgets();
      tick();

      // Verify budgetWarnings signal is set
      expect(component.budgetWarnings().length).toBe(1);
      expect(component.budgetWarnings()[0].status).toBe('exceeded');
      expect(component.budgetWarnings()[0].message).toBe('Budget exceeded');
    }));
  });

  // =============================================================================
  // SPLIT SUGGESTION TESTS
  // =============================================================================

  describe('split suggestion', () => {
    it('should compute showSplitSuggestion correctly', () => {
      component.suggestSplit.set(true);
      component.splitSuggestionDismissed.set(false);
      component.detectedLineItems.set([
        { description: 'Item 1', amount: 10, suggestedCategory: ExpenseCategory.FUEL, confidence: 0.8, keywords: [] },
        { description: 'Item 2', amount: 20, suggestedCategory: ExpenseCategory.FUEL, confidence: 0.8, keywords: [] }
      ]);

      expect(component.showSplitSuggestion()).toBe(true);
    });

    it('should not show split suggestion when dismissed', () => {
      component.suggestSplit.set(true);
      component.splitSuggestionDismissed.set(true);
      component.detectedLineItems.set([
        { description: 'Item 1', amount: 10, suggestedCategory: ExpenseCategory.FUEL, confidence: 0.8, keywords: [] },
        { description: 'Item 2', amount: 20, suggestedCategory: ExpenseCategory.FUEL, confidence: 0.8, keywords: [] }
      ]);

      expect(component.showSplitSuggestion()).toBe(false);
    });

    it('should dismiss split suggestion', () => {
      component.splitSuggestionDismissed.set(false);
      component.dismissSplitSuggestion();
      expect(component.splitSuggestionDismissed()).toBe(true);
    });

    it('should compute unique categories from line items', () => {
      component.detectedLineItems.set([
        { description: 'Item 1', amount: 10, suggestedCategory: ExpenseCategory.FUEL, confidence: 0.8, keywords: [] },
        { description: 'Item 2', amount: 20, suggestedCategory: ExpenseCategory.LODGING, confidence: 0.7, keywords: [] },
        { description: 'Item 3', amount: 15, suggestedCategory: ExpenseCategory.FUEL, confidence: 0.6, keywords: [] }
      ]);

      const categories = component.uniqueCategories();
      expect(categories.length).toBe(2);
      expect(categories).toContain(ExpenseCategory.FUEL);
      expect(categories).toContain(ExpenseCategory.LODGING);
    });
  });

  // =============================================================================
  // SMARTSCAN LABEL TESTS
  // =============================================================================

  describe('smartScanLabel', () => {
    it('should return null when no status', () => {
      component.smartScanStatus = null;
      expect(component.smartScanLabel).toBeNull();
    });

    it('should return "SmartScan queued" for pending status', () => {
      component.smartScanStatus = OcrStatus.PENDING;
      expect(component.smartScanLabel).toBe('SmartScan queued');
    });

    it('should return "SmartScan in progress" for processing status', () => {
      component.smartScanStatus = OcrStatus.PROCESSING;
      expect(component.smartScanLabel).toBe('SmartScan in progress');
    });

    it('should return "SmartScan complete" for completed status', () => {
      component.smartScanStatus = OcrStatus.COMPLETED;
      expect(component.smartScanLabel).toBe('SmartScan complete');
    });

    it('should return "SmartScan failed" for failed status', () => {
      component.smartScanStatus = OcrStatus.FAILED;
      expect(component.smartScanLabel).toBe('SmartScan failed');
    });
  });

  // =============================================================================
  // UTILITY METHODS TESTS
  // =============================================================================

  describe('utility methods', () => {
    it('should format currency correctly', () => {
      expect(component.formatCurrency(50)).toBe('$50.00');
      expect(component.formatCurrency(1234.56)).toBe('$1,234.56');
      expect(component.formatCurrency(0.01)).toBe('$0.01');
    });

    it('should track categories by id', () => {
      const category = mockCategories[0];
      expect(component.trackByCategory(0, category)).toBe('cat-1');
    });

    it('should get selected category name', fakeAsync(() => {
      tick();
      // Component defaults to 'Fuel' category on init
      expect(component.getSelectedCategoryName()).toBe('Fuel');
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

    it('should complete stopPolling$ on ngOnDestroy', () => {
      const completeSpy = spyOn(component['stopPolling$'], 'complete');
      component.ngOnDestroy();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // RECEIPT QUERY PARAM TESTS
  // =============================================================================

  describe('receipt query param', () => {
    it('should load receipt when receiptId query param is present', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [ExpenseFormComponent, NoopAnimationsModule],
        providers: [
          provideRouter([]),
          { provide: ExpenseService, useValue: expenseServiceSpy },
          { provide: CategoryService, useValue: categoryServiceSpy },
          { provide: DuplicateDetectionService, useValue: duplicateServiceSpy },
          { provide: OcrService, useValue: ocrServiceSpy },
          { provide: BudgetService, useValue: budgetServiceSpy },
          { provide: MatSnackBar, useValue: snackBarSpy },
          { provide: MatDialog, useValue: dialogSpy },
          { provide: Router, useValue: routerSpy },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: convertToParamMap({ receiptId: 'receipt-123' })
              }
            }
          }
        ]
      }).compileComponents();

      const newFixture = TestBed.createComponent(ExpenseFormComponent);
      newFixture.detectChanges();

      expect(expenseServiceSpy.getReceiptById).toHaveBeenCalledWith('receipt-123');
    });
  });
});
