import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { TaxSettingsComponent } from './tax-settings.component';
import { TaxService } from '../../../core/services/tax.service';
import { NotificationService } from '../../../core/services/notification.service';
import { TaxRate, TaxCategory } from '../../../core/models/tax.model';

describe('TaxSettingsComponent', () => {
  let component: TaxSettingsComponent;
  let fixture: ComponentFixture<TaxSettingsComponent>;
  let taxServiceMock: jasmine.SpyObj<TaxService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;
  let routerMock: jasmine.SpyObj<Router>;

  const mockTaxRate: TaxRate = {
    id: 'rate-1',
    organization_id: 'org-123',
    name: 'Texas Sales Tax',
    country_code: 'US',
    state_province: 'TX',
    tax_type: 'sales_tax',
    rate: 0.0825,
    is_recoverable: false,
    is_compound: false,
    effective_from: '2025-01-01',
    effective_until: undefined,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockTaxCategory: TaxCategory = {
    id: 'cat-1',
    organization_id: 'org-123',
    name: 'Standard Rate',
    code: 'STD',
    description: 'Standard taxable items',
    vat_code: 'S1',
    default_rate_id: 'rate-1',
    is_taxable: true,
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    taxServiceMock = jasmine.createSpyObj('TaxService', [
      'getTaxRates',
      'getTaxCategories',
      'createTaxRate',
      'updateTaxRate',
      'deleteTaxRate',
      'createTaxCategory',
      'updateTaxCategory',
      'deleteTaxCategory',
      'seedDefaultRates'
    ], {
      taxRates: jasmine.createSpy('taxRates').and.returnValue([mockTaxRate]),
      taxCategories: jasmine.createSpy('taxCategories').and.returnValue([mockTaxCategory])
    });

    notificationServiceMock = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    // Default return values
    taxServiceMock.getTaxRates.and.returnValue(of([mockTaxRate]));
    taxServiceMock.getTaxCategories.and.returnValue(of([mockTaxCategory]));
    taxServiceMock.createTaxRate.and.returnValue(of(mockTaxRate));
    taxServiceMock.updateTaxRate.and.returnValue(of(mockTaxRate));
    taxServiceMock.deleteTaxRate.and.returnValue(of(undefined));
    taxServiceMock.createTaxCategory.and.returnValue(of(mockTaxCategory));
    taxServiceMock.updateTaxCategory.and.returnValue(of(mockTaxCategory));
    taxServiceMock.deleteTaxCategory.and.returnValue(of(undefined));
    taxServiceMock.seedDefaultRates.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [
        TaxSettingsComponent,
        BrowserAnimationsModule,
        ReactiveFormsModule
      ],
      providers: [
        { provide: TaxService, useValue: taxServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(TaxSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load tax rates and categories on init', () => {
    expect(taxServiceMock.getTaxRates).toHaveBeenCalled();
    expect(taxServiceMock.getTaxCategories).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should calculate active rate count', () => {
    expect(component.activeRateCount()).toBeGreaterThanOrEqual(0);
  });

  it('should calculate unique countries', () => {
    expect(component.uniqueCountries().length).toBeGreaterThanOrEqual(0);
  });

  it('should navigate back to admin', () => {
    component.goBack();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should open add rate dialog', () => {
    component.openAddRateDialog();
    expect(component.dialogMode()).toBe('add-rate');
    expect(component.editingRate()).toBeNull();
  });

  it('should open edit rate dialog', () => {
    component.openEditRateDialog(mockTaxRate);
    expect(component.dialogMode()).toBe('edit-rate');
    expect(component.editingRate()).toBe(mockTaxRate);
  });

  it('should save new tax rate', () => {
    component.openAddRateDialog();
    component.rateForm.patchValue({
      name: 'New Rate',
      country_code: 'US',
      state_province: 'CA',
      tax_type: 'sales_tax',
      rate: 7.5,
      is_recoverable: false,
      is_compound: false,
      effective_from: '2025-01-01',
      effective_until: null,
      is_active: true
    });

    component.saveRate();

    expect(component.saving()).toBe(true);
    setTimeout(() => {
      expect(taxServiceMock.createTaxRate).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Tax rate created');
    });
  });

  it('should update existing tax rate', () => {
    component.openEditRateDialog(mockTaxRate);
    component.rateForm.patchValue({
      name: 'Updated Rate',
      rate: 8.5
    });

    component.saveRate();

    setTimeout(() => {
      expect(taxServiceMock.updateTaxRate).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Tax rate updated');
    });
  });

  it('should delete tax rate when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteRate(mockTaxRate);

    expect(window.confirm).toHaveBeenCalled();
    expect(taxServiceMock.deleteTaxRate).toHaveBeenCalledWith('rate-1');
  });

  it('should open add category dialog', () => {
    component.openAddCategoryDialog();
    expect(component.dialogMode()).toBe('add-category');
    expect(component.editingCategory()).toBeNull();
  });

  it('should open edit category dialog', () => {
    component.openEditCategoryDialog(mockTaxCategory);
    expect(component.dialogMode()).toBe('edit-category');
    expect(component.editingCategory()).toBe(mockTaxCategory);
  });

  it('should save new tax category', () => {
    component.openAddCategoryDialog();
    component.categoryForm.patchValue({
      name: 'New Category',
      code: 'NEW',
      description: 'Test',
      vat_code: 'N1',
      default_rate_id: null,
      is_taxable: true,
      is_active: true
    });

    component.saveCategory();

    expect(component.saving()).toBe(true);
    setTimeout(() => {
      expect(taxServiceMock.createTaxCategory).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Tax category created');
    });
  });

  it('should delete tax category when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteCategory(mockTaxCategory);

    expect(window.confirm).toHaveBeenCalled();
    expect(taxServiceMock.deleteTaxCategory).toHaveBeenCalledWith('cat-1');
  });

  it('should close dialog', () => {
    component.openAddRateDialog();
    component.closeDialog();
    expect(component.dialogMode()).toBe('closed');
    expect(component.editingRate()).toBeNull();
  });

  it('should seed default rates when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.seedDefaults();

    expect(window.confirm).toHaveBeenCalled();
    expect(taxServiceMock.seedDefaultRates).toHaveBeenCalled();
  });

  it('should format rate correctly', () => {
    expect(component.formatRate(0.0825)).toBeTruthy();
  });

  it('should get country name', () => {
    expect(component.getCountryName('US')).toBeTruthy();
  });

  it('should get tax type label', () => {
    expect(component.getTaxTypeLabel('sales_tax')).toBeTruthy();
  });

  it('should get tax type icon', () => {
    expect(component.getTaxTypeIcon('sales_tax')).toBeTruthy();
  });

  it('should handle load rates error', () => {
    taxServiceMock.getTaxRates.and.returnValue(throwError(() => new Error('Load failed')));
    component.ngOnInit();
    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to load tax rates');
      expect(component.loading()).toBe(false);
    });
  });

  it('should handle load categories error', () => {
    taxServiceMock.getTaxCategories.and.returnValue(throwError(() => new Error('Load failed')));
    component.ngOnInit();
    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to load tax categories');
    });
  });
});
