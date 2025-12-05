import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { VendorManagementComponent } from './vendor-management.component';
import { VendorService } from '../../../core/services/vendor.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Vendor, VendorNeedingW9 } from '../../../core/models/vendor.model';

describe('VendorManagementComponent', () => {
  let component: VendorManagementComponent;
  let fixture: ComponentFixture<VendorManagementComponent>;
  let vendorServiceMock: jasmine.SpyObj<VendorService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;
  let routerMock: jasmine.SpyObj<Router>;

  const mockVendor: Vendor = {
    id: 'vendor-1',
    organization_id: 'org-123',
    name: 'Acme Corporation',
    display_name: 'Acme Corp',
    description: 'Office supplies vendor',
    email: 'vendor@acme.com',
    phone: '555-1234',
    website: 'https://acme.com',
    address_line1: '123 Main St',
    address_line2: null,
    city: 'Dallas',
    state_province: 'TX',
    postal_code: '75201',
    country: 'US',
    business_type: 'company',
    tax_id: '12-3456789',
    default_category: 'Office Supplies',
    payment_terms: 'Net 30',
    preferred_payment_method: 'ach',
    notes: 'Preferred vendor',
    is_preferred: true,
    is_w9_on_file: true,
    status: 'active',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockVendorNeedingW9: VendorNeedingW9 = {
    vendor_id: 'vendor-2',
    vendor_name: 'Test Vendor',
    total_paid: 1000,
    has_w9: false
  };

  beforeEach(async () => {
    vendorServiceMock = jasmine.createSpyObj('VendorService', [
      'getVendors',
      'getVendorsNeedingW9',
      'createVendor',
      'updateVendor',
      'deleteVendor',
      'togglePreferred',
      'markW9OnFile',
      'updateVendorStatus'
    ], {
      vendors: jasmine.createSpy('vendors').and.returnValue([mockVendor])
    });

    notificationServiceMock = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    routerMock = jasmine.createSpyObj('Router', ['navigate']);

    // Default return values
    vendorServiceMock.getVendors.and.returnValue(of([mockVendor]));
    vendorServiceMock.getVendorsNeedingW9.and.returnValue(of([mockVendorNeedingW9]));
    vendorServiceMock.createVendor.and.returnValue(of(mockVendor));
    vendorServiceMock.updateVendor.and.returnValue(of(mockVendor));
    vendorServiceMock.deleteVendor.and.returnValue(of(undefined));
    vendorServiceMock.togglePreferred.and.returnValue(of(mockVendor));
    vendorServiceMock.markW9OnFile.and.returnValue(of(mockVendor));
    vendorServiceMock.updateVendorStatus.and.returnValue(of(mockVendor));

    await TestBed.configureTestingModule({
      imports: [
        VendorManagementComponent,
        BrowserAnimationsModule,
        ReactiveFormsModule,
        FormsModule
      ],
      providers: [
        { provide: VendorService, useValue: vendorServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: Router, useValue: routerMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(VendorManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load vendors and W9 alerts on init', () => {
    expect(vendorServiceMock.getVendors).toHaveBeenCalled();
    expect(vendorServiceMock.getVendorsNeedingW9).toHaveBeenCalled();
    expect(component.filteredVendors().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('should calculate active count', () => {
    expect(component.activeCount()).toBe(1);
  });

  it('should calculate preferred count', () => {
    expect(component.preferredCount()).toBe(1);
  });

  it('should calculate W9 alert count', () => {
    expect(component.w9AlertCount()).toBe(1);
  });

  it('should filter vendors by search term', () => {
    component.searchTerm = 'acme';
    component.filterVendors();
    expect(component.filteredVendors().length).toBe(1);
  });

  it('should filter vendors by status', () => {
    component.statusFilter = 'active';
    component.filterVendors();
    expect(component.filteredVendors().length).toBe(1);
  });

  it('should filter vendors by preferred only', () => {
    component.preferredOnly = true;
    component.filterVendors();
    expect(component.filteredVendors().length).toBe(1);
  });

  it('should navigate back to admin', () => {
    component.goBack();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('should open add dialog', () => {
    component.openAddDialog();
    expect(component.dialogMode()).toBe('add');
    expect(component.selectedVendor()).toBeNull();
  });

  it('should open edit dialog', () => {
    component.openEditDialog(mockVendor);
    expect(component.dialogMode()).toBe('edit');
    expect(component.selectedVendor()).toBe(mockVendor);
  });

  it('should open view dialog', () => {
    component.openViewDialog(mockVendor);
    expect(component.dialogMode()).toBe('view');
    expect(component.selectedVendor()).toBe(mockVendor);
  });

  it('should close dialog', () => {
    component.openAddDialog();
    component.closeDialog();
    expect(component.dialogMode()).toBe('closed');
    expect(component.selectedVendor()).toBeNull();
  });

  it('should save new vendor', () => {
    component.openAddDialog();
    component.vendorForm.patchValue({
      name: 'New Vendor',
      email: 'test@vendor.com'
    });

    component.saveVendor();

    expect(component.saving()).toBe(true);
    setTimeout(() => {
      expect(vendorServiceMock.createVendor).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Vendor created');
    });
  });

  it('should update existing vendor', () => {
    component.openEditDialog(mockVendor);
    component.vendorForm.patchValue({
      name: 'Updated Vendor'
    });

    component.saveVendor();

    setTimeout(() => {
      expect(vendorServiceMock.updateVendor).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Vendor updated');
    });
  });

  it('should delete vendor when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteVendor(mockVendor);

    expect(window.confirm).toHaveBeenCalled();
    expect(vendorServiceMock.deleteVendor).toHaveBeenCalledWith('vendor-1');
  });

  it('should toggle vendor preferred status', () => {
    component.togglePreferred(mockVendor);
    expect(vendorServiceMock.togglePreferred).toHaveBeenCalledWith('vendor-1', false);
  });

  it('should toggle vendor W9 status', () => {
    component.toggleW9(mockVendor);
    expect(vendorServiceMock.markW9OnFile).toHaveBeenCalledWith('vendor-1', false);
  });

  it('should update vendor status', () => {
    component.updateStatus(mockVendor, 'inactive');
    expect(vendorServiceMock.updateVendorStatus).toHaveBeenCalledWith('vendor-1', 'inactive');
  });

  it('should mark W9 as received', () => {
    component.markW9Received('vendor-2');
    expect(vendorServiceMock.markW9OnFile).toHaveBeenCalledWith('vendor-2', true);
  });

  it('should get vendor initials', () => {
    expect(component.getInitials('Acme Corporation')).toBe('AC');
    expect(component.getInitials('Test')).toBe('T');
  });

  it('should get status label', () => {
    expect(component.getStatusLabel('active')).toBeTruthy();
  });

  it('should get business type label', () => {
    expect(component.getBusinessTypeLabel('company')).toBeTruthy();
  });

  it('should get payment method label', () => {
    expect(component.getPaymentMethodLabel('ach')).toBeTruthy();
  });

  it('should mask tax ID', () => {
    expect(component.maskTaxId('12-3456789')).toBe('***-**-6789');
  });

  it('should handle load vendors error', () => {
    vendorServiceMock.getVendors.and.returnValue(throwError(() => new Error('Load failed')));
    component.ngOnInit();
    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to load vendors');
      expect(component.loading()).toBe(false);
    });
  });
});
