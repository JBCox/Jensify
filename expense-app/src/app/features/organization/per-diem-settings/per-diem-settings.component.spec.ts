import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { PerDiemSettingsComponent } from './per-diem-settings.component';
import { PerDiemService } from '../../../core/services/per-diem.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PerDiemRate } from '../../../core/models/per-diem.model';

describe('PerDiemSettingsComponent', () => {
  let component: PerDiemSettingsComponent;
  let fixture: ComponentFixture<PerDiemSettingsComponent>;
  let perDiemServiceMock: jasmine.SpyObj<PerDiemService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;

  const mockPerDiemRate: PerDiemRate = {
    id: 'rate-1',
    organization_id: 'org-123',
    location: 'New York, NY',
    country_code: 'US',
    lodging_rate: 250.00,
    mie_rate: 79.00,
    total_rate: 329.00,
    fiscal_year: 2025,
    effective_from: '2025-01-01',
    effective_until: undefined,
    is_standard_rate: false,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    perDiemServiceMock = jasmine.createSpyObj('PerDiemService', [
      'getPerDiemRates',
      'createRate',
      'updateRate',
      'deleteRate'
    ]);

    notificationServiceMock = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    // Default return values
    perDiemServiceMock.getPerDiemRates.and.returnValue(of([mockPerDiemRate]));
    perDiemServiceMock.createRate.and.returnValue(of(mockPerDiemRate));
    perDiemServiceMock.updateRate.and.returnValue(of(mockPerDiemRate));
    perDiemServiceMock.deleteRate.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [
        PerDiemSettingsComponent,
        BrowserAnimationsModule,
        ReactiveFormsModule
      ],
      providers: [
        { provide: PerDiemService, useValue: perDiemServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PerDiemSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load per diem rates on init', () => {
    expect(perDiemServiceMock.getPerDiemRates).toHaveBeenCalled();
    expect(component.rates().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('should populate rates signal with loaded data', () => {
    expect(component.rates()[0]).toEqual(mockPerDiemRate);
  });

  it('should show add form when showAddForm is true', () => {
    component.showAddForm = false;
    expect(component.showAddForm).toBe(false);
    component.showAddForm = true;
    expect(component.showAddForm).toBe(true);
  });

  it('should add per diem rate successfully', () => {
    component.rateForm.patchValue({
      location: 'San Francisco, CA',
      country_code: 'US',
      lodging_rate: 300.00,
      mie_rate: 79.00,
      fiscal_year: 2025,
      effective_from: '2025-01-01',
      is_standard_rate: false
    });

    component.addRate();

    expect(component.saving()).toBe(true);
    setTimeout(() => {
      expect(perDiemServiceMock.createRate).toHaveBeenCalled();
      const callArgs = perDiemServiceMock.createRate.calls.mostRecent().args[0];
      expect(callArgs.location).toBe('San Francisco, CA');
      expect(callArgs.total_rate).toBe(379.00);
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Per diem rate added');
      expect(component.showAddForm).toBe(false);
    });
  });

  it('should not add rate if form is invalid', () => {
    component.rateForm.patchValue({ location: '' });
    component.addRate();
    expect(perDiemServiceMock.createRate).not.toHaveBeenCalled();
  });

  it('should calculate total_rate correctly', () => {
    component.rateForm.patchValue({
      location: 'Test City',
      country_code: 'US',
      lodging_rate: 150.00,
      mie_rate: 60.00,
      fiscal_year: 2025,
      effective_from: '2025-01-01'
    });

    component.addRate();

    setTimeout(() => {
      const callArgs = perDiemServiceMock.createRate.calls.mostRecent().args[0];
      expect(callArgs.total_rate).toBe(210.00);
    });
  });

  it('should reset form after successful add', () => {
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toISOString().split('T')[0];

    component.rateForm.patchValue({
      location: 'Test City',
      country_code: 'CA',
      lodging_rate: 200,
      mie_rate: 70
    });

    component.addRate();

    setTimeout(() => {
      expect(component.rateForm.value.location).toBe('');
      expect(component.rateForm.value.country_code).toBe('US');
      expect(component.rateForm.value.fiscal_year).toBe(currentYear);
      expect(component.rateForm.value.effective_from).toBe(currentDate);
    });
  });

  it('should handle add rate error', () => {
    perDiemServiceMock.createRate.and.returnValue(
      throwError(() => new Error('Add failed'))
    );

    component.rateForm.patchValue({
      location: 'Test City',
      country_code: 'US',
      lodging_rate: 150,
      mie_rate: 60,
      fiscal_year: 2025,
      effective_from: '2025-01-01'
    });

    component.addRate();

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to add per diem rate');
      expect(component.saving()).toBe(false);
    });
  });

  it('should cancel add and reset form', () => {
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toISOString().split('T')[0];

    component.showAddForm = true;
    component.rateForm.patchValue({
      location: 'Test City',
      country_code: 'CA',
      lodging_rate: 200
    });

    component.cancelAdd();

    expect(component.showAddForm).toBe(false);
    expect(component.rateForm.value.location).toBe('');
    expect(component.rateForm.value.country_code).toBe('US');
    expect(component.rateForm.value.fiscal_year).toBe(currentYear);
    expect(component.rateForm.value.effective_from).toBe(currentDate);
  });

  it('should delete rate when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteRate(mockPerDiemRate);

    expect(window.confirm).toHaveBeenCalledWith('Delete per diem rate for New York, NY?');
    expect(perDiemServiceMock.deleteRate).toHaveBeenCalledWith('rate-1');
  });

  it('should not delete rate if not confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(false);

    component.deleteRate(mockPerDiemRate);

    expect(perDiemServiceMock.deleteRate).not.toHaveBeenCalled();
  });

  it('should reload rates after successful delete', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    spyOn(component, 'loadRates');

    component.deleteRate(mockPerDiemRate);

    setTimeout(() => {
      expect(component.loadRates).toHaveBeenCalled();
    });
  });

  it('should handle delete rate error', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    perDiemServiceMock.deleteRate.and.returnValue(
      throwError(() => new Error('Delete failed'))
    );

    component.deleteRate(mockPerDiemRate);

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to delete per diem rate');
    });
  });

  it('should handle load rates error', () => {
    perDiemServiceMock.getPerDiemRates.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    spyOn(console, 'error');
    component.loadRates();

    setTimeout(() => {
      expect(console.error).toHaveBeenCalledWith('Error loading rates:', jasmine.any(Error));
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to load per diem rates');
      expect(component.loading()).toBe(false);
    });
  });

  it('should initialize with default form values', () => {
    const currentYear = new Date().getFullYear();
    const currentDate = new Date().toISOString().split('T')[0];

    expect(component.rateForm.value.location).toBe('');
    expect(component.rateForm.value.country_code).toBe('US');
    expect(component.rateForm.value.lodging_rate).toBe(0);
    expect(component.rateForm.value.mie_rate).toBe(0);
    expect(component.rateForm.value.fiscal_year).toBe(currentYear);
    expect(component.rateForm.value.effective_from).toBe(currentDate);
    expect(component.rateForm.value.is_standard_rate).toBe(false);
  });

  it('should require location field', () => {
    component.rateForm.patchValue({ location: '' });
    expect(component.rateForm.get('location')?.hasError('required')).toBe(true);

    component.rateForm.patchValue({ location: 'Test City' });
    expect(component.rateForm.get('location')?.hasError('required')).toBe(false);
  });

  it('should require country_code field', () => {
    component.rateForm.patchValue({ country_code: '' });
    expect(component.rateForm.get('country_code')?.hasError('required')).toBe(true);

    component.rateForm.patchValue({ country_code: 'US' });
    expect(component.rateForm.get('country_code')?.hasError('required')).toBe(false);
  });

  it('should validate lodging_rate is non-negative', () => {
    component.rateForm.patchValue({ lodging_rate: -10 });
    expect(component.rateForm.get('lodging_rate')?.hasError('min')).toBe(true);

    component.rateForm.patchValue({ lodging_rate: 0 });
    expect(component.rateForm.get('lodging_rate')?.hasError('min')).toBe(false);
  });

  it('should validate mie_rate is non-negative', () => {
    component.rateForm.patchValue({ mie_rate: -5 });
    expect(component.rateForm.get('mie_rate')?.hasError('min')).toBe(true);

    component.rateForm.patchValue({ mie_rate: 0 });
    expect(component.rateForm.get('mie_rate')?.hasError('min')).toBe(false);
  });

  it('should reload rates after successful add', () => {
    spyOn(component, 'loadRates');

    component.rateForm.patchValue({
      location: 'Test City',
      country_code: 'US',
      lodging_rate: 150,
      mie_rate: 60,
      fiscal_year: 2025,
      effective_from: '2025-01-01'
    });

    component.addRate();

    setTimeout(() => {
      expect(component.loadRates).toHaveBeenCalled();
    });
  });

  it('should handle multiple rates', () => {
    const mockRates = [
      mockPerDiemRate,
      { ...mockPerDiemRate, id: 'rate-2', location: 'Los Angeles, CA' },
      { ...mockPerDiemRate, id: 'rate-3', location: 'Chicago, IL' }
    ];

    perDiemServiceMock.getPerDiemRates.and.returnValue(of(mockRates));
    component.loadRates();

    setTimeout(() => {
      expect(component.rates().length).toBe(3);
    });
  });

  it('should handle empty rates list', () => {
    perDiemServiceMock.getPerDiemRates.and.returnValue(of([]));
    component.loadRates();

    setTimeout(() => {
      expect(component.rates().length).toBe(0);
    });
  });
});
