import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { PolicySettingsComponent } from './policy-settings.component';
import { PolicyService } from '../../../core/services/policy.service';
import { ExpensePolicy, PolicyPreset, CreatePolicyDto } from '../../../core/models/policy.model';
import { ExpenseCategory } from '../../../core/models/enums';

describe('PolicySettingsComponent', () => {
  let component: PolicySettingsComponent;
  let fixture: ComponentFixture<PolicySettingsComponent>;
  let mockPolicyService: jasmine.SpyObj<PolicyService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  const mockPolicies: ExpensePolicy[] = [
    {
      id: 'policy-1',
      organization_id: 'org-1',
      name: 'Default Expense Policy',
      description: 'Standard expense policy',
      scope_type: 'organization',
      is_active: true,
      max_amount: 1000,
      max_daily_total: 5000,
      max_monthly_total: 10000,
      max_receipt_age_days: 90,
      require_receipt: true,
      require_description: false,
      allow_weekends: true,
      priority: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'policy-2',
      organization_id: 'org-1',
      name: 'Manager Policy',
      scope_type: 'role',
      scope_value: 'manager',
      is_active: false,
      max_amount: 2000,
      max_receipt_age_days: 90,
      require_receipt: true,
      require_description: true,
      allow_weekends: true,
      priority: 10,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }
  ];

  const mockPresets: PolicyPreset[] = [
    {
      id: 'preset-1',
      name: 'standard',
      preset_type: 'template',
      config: {},
      is_default: true,
      description: 'Standard business expense policies',
      created_at: '2024-01-01T00:00:00Z'
    }
  ];

  const mockStats = {
    total: 2,
    active: 1,
    byScope: { organization: 1, role: 1 }
  };

  beforeEach(async () => {
    mockPolicyService = jasmine.createSpyObj('PolicyService', [
      'getPolicies',
      'getPresets',
      'getPolicyStats',
      'createPolicy',
      'updatePolicy',
      'deletePolicy',
      'togglePolicyActive',
      'applyPreset'
    ]);

    mockPolicyService.getPolicies.and.returnValue(of(mockPolicies));
    mockPolicyService.getPresets.and.returnValue(of(mockPresets));
    mockPolicyService.getPolicyStats.and.returnValue(of(mockStats));
    mockPolicyService.createPolicy.and.returnValue(of(mockPolicies[0]));
    mockPolicyService.updatePolicy.and.returnValue(of(mockPolicies[0]));
    mockPolicyService.deletePolicy.and.returnValue(of(undefined));
    mockPolicyService.togglePolicyActive.and.returnValue(of(mockPolicies[0]));
    mockPolicyService.applyPreset.and.returnValue(of({ policies_created: 3 }));

    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        PolicySettingsComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: PolicyService, useValue: mockPolicyService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: mockDialog }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PolicySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize the policy form', () => {
      expect(component.policyForm).toBeDefined();
      expect(component.policyForm.get('name')).toBeDefined();
      expect(component.policyForm.get('scope_type')).toBeDefined();
    });

    it('should load policies on init', fakeAsync(() => {
      tick();
      expect(mockPolicyService.getPolicies).toHaveBeenCalled();
      expect(component.policies().length).toBe(2);
      expect(component.loading()).toBe(false);
    }));

    it('should load presets on init', fakeAsync(() => {
      tick();
      expect(mockPolicyService.getPresets).toHaveBeenCalled();
      expect(component.presets().length).toBe(1);
    }));

    it('should load stats on init', fakeAsync(() => {
      tick();
      expect(mockPolicyService.getPolicyStats).toHaveBeenCalled();
      expect(component.policyStats()).toEqual(mockStats);
    }));

    it('should handle policy load error', fakeAsync(() => {
      mockPolicyService.getPolicies.and.returnValue(
        throwError(() => new Error('Load failed'))
      );

      const newFixture = TestBed.createComponent(PolicySettingsComponent);
      newFixture.detectChanges();
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Load failed',
        'Close',
        { duration: 4000 }
      );
    }));
  });

  describe('computed properties', () => {
    beforeEach(fakeAsync(() => {
      tick();
    }));

    it('should calculate active policies', () => {
      expect(component.activePolicies().length).toBe(1);
      expect(component.activePolicies()[0].id).toBe('policy-1');
    });

    it('should calculate inactive policies', () => {
      expect(component.inactivePolicies().length).toBe(1);
      expect(component.inactivePolicies()[0].id).toBe('policy-2');
    });
  });

  describe('form operations', () => {
    it('should open create form', () => {
      component.openCreateForm();

      expect(component.showForm()).toBeTrue();
      expect(component.editingPolicy()).toBeNull();
      expect(component.policyForm.get('scope_type')?.value).toBe('organization');
    });

    it('should open edit form with policy data', () => {
      component.openEditForm(mockPolicies[0]);

      expect(component.showForm()).toBeTrue();
      expect(component.editingPolicy()).toEqual(mockPolicies[0]);
      expect(component.policyForm.get('name')?.value).toBe('Default Expense Policy');
    });

    it('should cancel form', () => {
      component.openEditForm(mockPolicies[0]);
      component.cancelForm();

      expect(component.showForm()).toBeFalse();
      expect(component.editingPolicy()).toBeNull();
    });
  });

  describe('savePolicy', () => {
    beforeEach(fakeAsync(() => {
      tick();
    }));

    it('should not save if form is invalid', () => {
      component.policyForm.get('name')?.setValue('');
      component.savePolicy();

      expect(mockPolicyService.createPolicy).not.toHaveBeenCalled();
      expect(mockPolicyService.updatePolicy).not.toHaveBeenCalled();
    });

    it('should create new policy', fakeAsync(() => {
      component.openCreateForm();
      component.policyForm.patchValue({
        name: 'New Policy',
        scope_type: 'organization',
        max_amount: 500,
        require_receipt: true,
        max_receipt_age_days: 90,
        priority: 0,
        is_active: true
      });

      component.savePolicy();
      tick();

      expect(mockPolicyService.createPolicy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Policy created successfully',
        'Close',
        { duration: 3000 }
      );
      expect(component.showForm()).toBeFalse();
    }));

    it('should update existing policy', fakeAsync(() => {
      component.openEditForm(mockPolicies[0]);
      component.policyForm.patchValue({ name: 'Updated Policy' });

      component.savePolicy();
      tick();

      expect(mockPolicyService.updatePolicy).toHaveBeenCalled();
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Policy updated successfully',
        'Close',
        { duration: 3000 }
      );
    }));

    it('should handle save error', fakeAsync(() => {
      mockPolicyService.createPolicy.and.returnValue(
        throwError(() => new Error('Save failed'))
      );

      component.openCreateForm();
      component.policyForm.patchValue({
        name: 'New Policy',
        scope_type: 'organization',
        max_receipt_age_days: 90,
        require_receipt: true,
        priority: 0
      });

      component.savePolicy();
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Save failed',
        'Close',
        { duration: 4000 }
      );
    }));
  });

  describe('deletePolicy', () => {
    it('should open confirm dialog and delete policy', fakeAsync(() => {
      const dialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
      dialogRef.afterClosed.and.returnValue(of(true));
      mockDialog.open.and.returnValue(dialogRef);

      component.deletePolicy(mockPolicies[0]);
      tick();

      expect(mockDialog.open).toHaveBeenCalled();
      expect(mockPolicyService.deletePolicy).toHaveBeenCalledWith('policy-1');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Policy deleted',
        'Close',
        { duration: 3000 }
      );
    }));

    it('should not delete if dialog is cancelled', fakeAsync(() => {
      const dialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
      dialogRef.afterClosed.and.returnValue(of(false));
      mockDialog.open.and.returnValue(dialogRef);

      component.deletePolicy(mockPolicies[0]);
      tick();

      expect(mockPolicyService.deletePolicy).not.toHaveBeenCalled();
    }));
  });

  describe('togglePolicy', () => {
    it('should toggle policy active state', fakeAsync(() => {
      component.togglePolicy(mockPolicies[0]);
      tick();

      expect(mockPolicyService.togglePolicyActive).toHaveBeenCalledWith('policy-1', false);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Policy deactivated',
        'Close',
        { duration: 3000 }
      );
    }));

    it('should handle toggle error', fakeAsync(() => {
      mockPolicyService.togglePolicyActive.and.returnValue(
        throwError(() => new Error('Toggle failed'))
      );

      component.togglePolicy(mockPolicies[0]);
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Toggle failed',
        'Close',
        { duration: 4000 }
      );
    }));
  });

  describe('duplicatePolicy', () => {
    it('should open form with copied policy data', () => {
      component.duplicatePolicy(mockPolicies[0]);

      expect(component.showForm()).toBeTrue();
      expect(component.editingPolicy()).toBeNull();
      expect(component.policyForm.get('name')?.value).toContain('(Copy)');
    });
  });

  describe('applyPreset', () => {
    it('should apply preset after confirmation', fakeAsync(() => {
      const dialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
      dialogRef.afterClosed.and.returnValue(of(true));
      mockDialog.open.and.returnValue(dialogRef);

      component.applyPreset(mockPresets[0]);
      tick();

      expect(mockPolicyService.applyPreset).toHaveBeenCalledWith('standard');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Preset applied: 3 policies created',
        'Close',
        { duration: 4000 }
      );
    }));
  });

  describe('helper methods', () => {
    it('should get scope icon', () => {
      const icon = component.getScopeIcon('organization');
      expect(icon).toBe('business');
    });

    it('should get scope label', () => {
      const label = component.getScopeLabel('role');
      expect(label).toBe('Role');
    });

    it('should get scope display', () => {
      const display = component.getScopeDisplay(mockPolicies[1]);
      expect(display).toBe('Role: manager');
    });

    it('should get limits display', () => {
      const display = component.getLimitsDisplay(mockPolicies[0]);
      expect(display).toContain('$1000/txn');
      expect(display).toContain('$5000/day');
      expect(display).toContain('$10000/mo');
    });

    it('should format currency', () => {
      expect(component.formatCurrency(100)).toBe('$100.00');
      expect(component.formatCurrency(undefined)).toBe('—');
    });
  });

  describe('sorting', () => {
    it('should sort policies by name ascending', fakeAsync(() => {
      tick();
      component.sortPolicies({ active: 'name', direction: 'asc' });
      const policies = component.policies();
      expect(policies[0].name.localeCompare(policies[1].name)).toBeLessThanOrEqual(0);
    }));

    it('should sort policies by name descending', fakeAsync(() => {
      tick();
      component.sortPolicies({ active: 'name', direction: 'desc' });
      const policies = component.policies();
      expect(policies[0].name.localeCompare(policies[1].name)).toBeGreaterThanOrEqual(0);
    }));
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
    it('should render component', () => {
      const compiled = fixture.nativeElement;
      expect(compiled).toBeTruthy();
    });
  });
});
