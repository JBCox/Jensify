import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { CompanySettingsComponent } from './company-settings.component';
import { OrganizationService } from '../../../core/services/organization.service';
import { ThemeService } from '../../../core/services/theme.service';
import { Organization } from '../../../core/models/organization.model';

describe('CompanySettingsComponent', () => {
  let component: CompanySettingsComponent;
  let fixture: ComponentFixture<CompanySettingsComponent>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;

  const mockOrganization: Organization = {
    id: 'org-1',
    name: 'Test Company',
    logo_url: 'https://example.com/logo.png',
    primary_color: '#F7580C',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    settings: {
      expense_policies: {
        max_single_receipt: 500,
        max_daily_total: 1000,
        max_receipt_age_days: 90
      },
      approval_workflow: {
        require_manager_approval: true,
        require_finance_approval: false
      }
    }
  };

  beforeEach(async () => {
    mockOrganizationService = jasmine.createSpyObj('OrganizationService', [
      'updateOrganization',
      'uploadLogo',
      'deleteLogo'
    ], {
      currentOrganization$: of(mockOrganization)
    });

    mockThemeService = jasmine.createSpyObj('ThemeService', ['applyBrandColor']);

    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        CompanySettingsComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: MatSnackBar, useValue: mockSnackBar }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CompanySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize the settings form with empty values', () => {
      expect(component.settingsForm).toBeDefined();
      expect(component.settingsForm.get('name')).toBeDefined();
    });

    it('should load organization data on init', () => {
      expect(component.settingsForm.get('name')?.value).toBe('Test Company');
      expect(component.logoPreview()).toBe('https://example.com/logo.png');
      expect(component.selectedColor()).toBe('#F7580C');
    });

    it('should set default color when organization has no primary color', () => {
      const orgWithoutColor = { ...mockOrganization, primary_color: undefined };
      Object.defineProperty(mockOrganizationService, 'currentOrganization$', {
        get: () => of(orgWithoutColor),
        configurable: true
      });

      const newFixture = TestBed.createComponent(CompanySettingsComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.selectedColor()).toBe('#F7580C');
    });
  });

  describe('form validation', () => {
    it('should require company name', () => {
      const nameControl = component.settingsForm.get('name');
      nameControl?.setValue('');
      expect(nameControl?.hasError('required')).toBeTrue();
    });

    it('should require minimum name length', () => {
      const nameControl = component.settingsForm.get('name');
      nameControl?.setValue('A');
      expect(nameControl?.hasError('minlength')).toBeTrue();

      nameControl?.setValue('AB');
      expect(nameControl?.hasError('minlength')).toBeFalse();
    });
  });

  describe('logo upload', () => {
    it('should process valid image file', () => {
      const file = new File(['test'], 'logo.png', { type: 'image/png' });
      const event = { target: { files: [file] } } as any;

      spyOn(FileReader.prototype, 'readAsDataURL');
      component.onLogoSelected(event);

      expect(component['logoFile']).toBe(file);
    });

    it('should reject files larger than 2MB', () => {
      const largeFile = new File(['x'.repeat(3 * 1024 * 1024)], 'large.png', { type: 'image/png' });
      const event = { target: { files: [largeFile] } } as any;

      component.onLogoSelected(event);

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Logo must be less than 2MB',
        'Close',
        { duration: 3000 }
      );
    });

    it('should reject invalid file types', () => {
      const invalidFile = new File(['test'], 'file.txt', { type: 'text/plain' });
      const event = { target: { files: [invalidFile] } } as any;

      component.onLogoSelected(event);

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Logo must be PNG, JPG, or SVG format',
        'Close',
        { duration: 3000 }
      );
    });

    it('should handle drag over event', () => {
      const event = new DragEvent('dragover');
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');

      component.onDragOver(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.isDragging()).toBeTrue();
    });

    it('should handle drag leave event', () => {
      component.isDragging.set(true);
      const event = new DragEvent('dragleave');
      spyOn(event, 'preventDefault');

      component.onDragLeave(event);

      expect(component.isDragging()).toBeFalse();
    });

    it('should handle file drop', () => {
      const file = new File(['test'], 'logo.png', { type: 'image/png' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const event = new DragEvent('drop', { dataTransfer });
      spyOn(event, 'preventDefault');
      spyOn(FileReader.prototype, 'readAsDataURL');

      component.onDrop(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.isDragging()).toBeFalse();
    });

    it('should remove logo preview', () => {
      component.logoPreview.set('https://example.com/logo.png');
      component['logoFile'] = new File(['test'], 'logo.png', { type: 'image/png' });

      component.removeLogo();

      expect(component.logoPreview()).toBeNull();
      expect(component['logoFile']).toBeNull();
      expect(component['removeExistingLogo']).toBeTrue();
      expect(component.settingsForm.dirty).toBeTrue();
    });
  });

  describe('color selection', () => {
    it('should update selected color and apply theme', () => {
      const newColor = '#0066CC';
      component.onColorChange(newColor);

      expect(component.selectedColor()).toBe(newColor);
      expect(mockThemeService.applyBrandColor).toHaveBeenCalledWith(newColor);
      expect(component.settingsForm.dirty).toBeTrue();
    });
  });

  describe('saveSettings', () => {
    beforeEach(() => {
      mockOrganizationService.updateOrganization.and.returnValue(of(mockOrganization));
      mockOrganizationService.uploadLogo.and.returnValue(of('https://example.com/new-logo.png'));
      mockOrganizationService.deleteLogo.and.returnValue(of(undefined));
    });

    it('should not save if form is invalid', async () => {
      component.settingsForm.get('name')?.setValue('');
      await component.saveSettings();

      expect(mockOrganizationService.updateOrganization).not.toHaveBeenCalled();
    });

    it('should save company name successfully', async () => {
      component.settingsForm.patchValue({ name: 'Updated Company' });
      component.settingsForm.markAsDirty();

      await component.saveSettings();

      expect(mockOrganizationService.updateOrganization).toHaveBeenCalledWith(
        'org-1',
        jasmine.objectContaining({
          name: 'Updated Company',
          primary_color: '#F7580C'
        })
      );
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Company settings saved successfully',
        'Close',
        { duration: 3000 }
      );
    });

    it('should upload new logo and save', async () => {
      const file = new File(['test'], 'logo.png', { type: 'image/png' });
      component['logoFile'] = file;
      component.settingsForm.markAsDirty();

      await component.saveSettings();

      expect(mockOrganizationService.uploadLogo).toHaveBeenCalledWith('org-1', file);
      expect(mockOrganizationService.updateOrganization).toHaveBeenCalled();
    });

    it('should delete logo when requested', async () => {
      component['removeExistingLogo'] = true;
      component.settingsForm.markAsDirty();

      await component.saveSettings();

      expect(mockOrganizationService.deleteLogo).toHaveBeenCalledWith('org-1');
      expect(mockOrganizationService.updateOrganization).toHaveBeenCalledWith(
        'org-1',
        jasmine.objectContaining({
          logo_url: undefined
        })
      );
    });

    it('should handle save error', async () => {
      mockOrganizationService.updateOrganization.and.returnValue(
        throwError(() => new Error('Save failed'))
      );
      component.settingsForm.markAsDirty();

      await component.saveSettings();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to save settings',
        'Close',
        { duration: 3000 }
      );
      expect(component.saving()).toBeFalse();
    });

    it('should set saving state during save operation', async () => {
      component.settingsForm.markAsDirty();

      const savePromise = component.saveSettings();
      expect(component.saving()).toBeTrue();

      await savePromise;
      expect(component.saving()).toBeFalse();
    });
  });

  describe('template rendering', () => {
    it('should render the form', () => {
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('form')).toBeTruthy();
    });

    it('should display page title', () => {
      const compiled = fixture.nativeElement;
      const title = compiled.querySelector('.jensify-page-title');
      expect(title?.textContent).toContain('Organization Branding');
    });

    it('should show save button', () => {
      const compiled = fixture.nativeElement;
      const button = compiled.querySelector('button[type="submit"]');
      expect(button).toBeTruthy();
    });
  });
});
