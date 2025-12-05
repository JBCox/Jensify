import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { MileageSettingsComponent } from './mileage-settings.component';
import { OrganizationService } from '../../../core/services/organization.service';
import { MileageService } from '../../../core/services/mileage.service';
import { Organization, MileageSettings } from '../../../core/models/organization.model';
import { IRSMileageRate } from '../../../core/models/mileage.model';

describe('MileageSettingsComponent', () => {
  let component: MileageSettingsComponent;
  let fixture: ComponentFixture<MileageSettingsComponent>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let mockMileageService: jasmine.SpyObj<MileageService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockMileageSettings: MileageSettings = {
    use_custom_rate: false,
    custom_rate_per_mile: 0,
    mileage_category: 'business',
    gps_tracking_mode: 'start_stop'
  };

  const mockOrganization: Organization = {
    id: 'org-1',
    name: 'Test Company',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    settings: {
      expense_policies: {
        max_single_receipt: 5000,
        max_daily_total: 10000,
        max_receipt_age_days: 90
      },
      approval_workflow: {
        require_manager_approval: true,
        require_finance_approval: false
      },
      mileage_settings: mockMileageSettings
    }
  };

  const mockIrsRate: IRSMileageRate = {
    id: 'rate-1',
    category: 'business',
    rate: 0.67,
    effective_date: '2024-01-01',
    end_date: undefined,
    notes: 'IRS standard rate',
    created_at: '2024-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    mockOrganizationService = jasmine.createSpyObj('OrganizationService', [
      'updateOrganization'
    ], {
      currentOrganization$: of(mockOrganization),
      currentOrganizationId: 'org-1'
    });

    mockMileageService = jasmine.createSpyObj('MileageService', ['getCurrentRate']);
    mockMileageService.getCurrentRate.and.returnValue(of(mockIrsRate));

    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        MileageSettingsComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: MileageService, useValue: mockMileageService },
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MileageSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize the settings form', () => {
      expect(component.settingsForm).toBeDefined();
      expect(component.settingsForm.get('use_custom_rate')).toBeDefined();
      expect(component.settingsForm.get('custom_rate_per_mile')).toBeDefined();
      expect(component.settingsForm.get('mileage_category')).toBeDefined();
      expect(component.settingsForm.get('gps_tracking_mode')).toBeDefined();
    });

    it('should load mileage settings on init', fakeAsync(() => {
      tick();
      expect(component.settingsForm.get('use_custom_rate')?.value).toBe(false);
      expect(component.settingsForm.get('mileage_category')?.value).toBe('business');
      expect(component.settingsForm.get('gps_tracking_mode')?.value).toBe('start_stop');
      expect(component.loading()).toBe(false);
    }));

    it('should load current IRS rate', fakeAsync(() => {
      tick();
      expect(mockMileageService.getCurrentRate).toHaveBeenCalledWith('business');
      expect(component.currentIrsRate()).toBe(0.67);
    }));

    it('should use fallback rate if IRS rate fetch fails', fakeAsync(() => {
      mockMileageService.getCurrentRate.and.returnValue(
        throwError(() => new Error('Rate not found'))
      );

      const newFixture = TestBed.createComponent(MileageSettingsComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();
      tick();

      expect(newComponent.currentIrsRate()).toBe(0.67);
    }));

    it('should handle settings load error', fakeAsync(() => {
      Object.defineProperty(mockOrganizationService, 'currentOrganization$', {
        get: () => throwError(() => new Error('Load failed')),
        configurable: true
      });

      const newFixture = TestBed.createComponent(MileageSettingsComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();
      tick();

      expect(newComponent.error()).toBe('Load failed');
      expect(newComponent.loading()).toBe(false);
    }));
  });

  describe('form validation', () => {
    it('should disable custom rate field when toggle is off', () => {
      component.settingsForm.get('use_custom_rate')?.setValue(false);
      const customRateControl = component.settingsForm.get('custom_rate_per_mile');
      expect(customRateControl?.disabled).toBeTrue();
    });

    it('should enable custom rate field when toggle is on', () => {
      component.settingsForm.get('use_custom_rate')?.setValue(true);
      const customRateControl = component.settingsForm.get('custom_rate_per_mile');
      expect(customRateControl?.enabled).toBeTrue();
    });

    it('should validate custom rate minimum', () => {
      component.settingsForm.get('use_custom_rate')?.setValue(true);
      const customRateControl = component.settingsForm.get('custom_rate_per_mile');

      customRateControl?.setValue(-1);
      expect(customRateControl?.hasError('min')).toBeTrue();

      customRateControl?.setValue(0.5);
      expect(customRateControl?.hasError('min')).toBeFalse();
    });

    it('should validate custom rate maximum', () => {
      component.settingsForm.get('use_custom_rate')?.setValue(true);
      const customRateControl = component.settingsForm.get('custom_rate_per_mile');

      customRateControl?.setValue(15);
      expect(customRateControl?.hasError('max')).toBeTrue();

      customRateControl?.setValue(5);
      expect(customRateControl?.hasError('max')).toBeFalse();
    });

    it('should require custom rate when enabled', () => {
      component.settingsForm.get('use_custom_rate')?.setValue(true);
      const customRateControl = component.settingsForm.get('custom_rate_per_mile');

      customRateControl?.setValue(null);
      expect(customRateControl?.hasError('required')).toBeTrue();
    });
  });

  describe('onSave', () => {
    beforeEach(() => {
      mockOrganizationService.updateOrganization.and.returnValue(of(mockOrganization));
    });

    it('should not save if form is invalid', () => {
      component.settingsForm.get('use_custom_rate')?.setValue(true);
      component.settingsForm.get('custom_rate_per_mile')?.setValue(null);

      component.onSave();

      expect(mockOrganizationService.updateOrganization).not.toHaveBeenCalled();
    });

    it('should not save if no organization selected', () => {
      Object.defineProperty(mockOrganizationService, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      component.onSave();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'No organization selected',
        'Close',
        { duration: 3000 }
      );
    });

    it('should save mileage settings successfully', fakeAsync(() => {
      component.settingsForm.patchValue({
        use_custom_rate: true,
        custom_rate_per_mile: 0.75,
        mileage_category: 'medical',
        gps_tracking_mode: 'full_gps'
      });

      component.onSave();
      tick();

      expect(mockOrganizationService.updateOrganization).toHaveBeenCalledWith(
        'org-1',
        jasmine.objectContaining({
          settings: jasmine.objectContaining({
            mileage_settings: {
              use_custom_rate: true,
              custom_rate_per_mile: 0.75,
              mileage_category: 'medical',
              gps_tracking_mode: 'full_gps'
            }
          })
        })
      );
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Mileage settings saved successfully',
        'Close',
        { duration: 3000 }
      );
      expect(component.saving()).toBe(false);
    }));

    it('should handle save error', fakeAsync(() => {
      mockOrganizationService.updateOrganization.and.returnValue(
        throwError(() => new Error('Save failed'))
      );

      component.onSave();
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Save failed',
        'Close',
        { duration: 5000 }
      );
      expect(component.saving()).toBe(false);
    }));

    it('should set saving state during save operation', () => {
      component.onSave();
      expect(component.saving()).toBeTrue();
    });
  });

  describe('formatCurrency', () => {
    it('should format currency with 3 decimal places', () => {
      const formatted = component.formatCurrency(0.67);
      expect(formatted).toContain('0.670');
    });

    it('should format large amounts correctly', () => {
      const formatted = component.formatCurrency(1.234);
      expect(formatted).toContain('1.234');
    });
  });

  describe('tracking mode options', () => {
    it('should have three tracking mode options', () => {
      expect(component.trackingModeOptions.length).toBe(3);
    });

    it('should have disabled mode', () => {
      const disabled = component.trackingModeOptions.find(opt => opt.value === 'disabled');
      expect(disabled).toBeDefined();
      expect(disabled?.label).toBe('Manual Entry Only');
    });

    it('should have start_stop mode as recommended', () => {
      const startStop = component.trackingModeOptions.find(opt => opt.value === 'start_stop');
      expect(startStop).toBeDefined();
      expect(startStop?.recommended).toBeTrue();
    });

    it('should have full_gps mode', () => {
      const fullGps = component.trackingModeOptions.find(opt => opt.value === 'full_gps');
      expect(fullGps).toBeDefined();
      expect(fullGps?.label).toBe('Full GPS Tracking');
    });
  });

  describe('category options', () => {
    it('should have category options', () => {
      expect(component.categoryOptions.length).toBeGreaterThan(0);
    });

    it('should include business category', () => {
      const business = component.categoryOptions.find(opt => opt.value === 'business');
      expect(business).toBeDefined();
      expect(business?.label).toBe('Business');
    });
  });

  describe('lifecycle', () => {
    it('should complete destroy$ on ngOnDestroy', () => {
      const completeSpy = spyOn(component['destroy$'], 'complete');
      const nextSpy = spyOn(component['destroy$'], 'next');

      component.ngOnDestroy();

      expect(nextSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('template rendering', () => {
    it('should render the form', () => {
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('form')).toBeTruthy();
    });

    it('should display component title', () => {
      const compiled = fixture.nativeElement;
      const title = compiled.querySelector('h1, mat-card-title');
      expect(title).toBeTruthy();
    });
  });
});
