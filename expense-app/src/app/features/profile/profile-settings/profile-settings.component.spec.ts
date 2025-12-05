import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { ProfileSettingsComponent } from './profile-settings.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';

describe('ProfileSettingsComponent', () => {
  let component: ProfileSettingsComponent;
  let fixture: ComponentFixture<ProfileSettingsComponent>;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;

  const mockUserProfile = {
    id: 'user-1',
    email: 'test@example.com',
    full_name: 'Test User',
    department: 'Engineering'
  };

  beforeEach(async () => {
    // Create mock client with proper chain structure
    const mockClient = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.resolveTo({ data: mockUserProfile, error: null })
          })
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.resolveTo({ error: null })
        })
      })
    };

    mockSupabaseService = jasmine.createSpyObj('SupabaseService', [], {
      userId: 'user-1',
      client: mockClient
    });

    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    const mockThemeSignal = signal<'light' | 'dark'>('light');
    mockThemeService = jasmine.createSpyObj('ThemeService', [
      'toggleTheme',
      'applyBrandColor'
    ], {
      theme: mockThemeSignal
    });

    await TestBed.configureTestingModule({
      imports: [
        ProfileSettingsComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProfileSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should initialize the profile form', () => {
      expect(component.profileForm).toBeDefined();
      expect(component.profileForm.get('full_name')).toBeDefined();
      expect(component.profileForm.get('email')).toBeDefined();
      expect(component.profileForm.get('department')).toBeDefined();
    });

    it('should load profile data on init', fakeAsync(() => {
      tick();
      expect(component.profileForm.get('full_name')?.value).toBe('Test User');
      expect(component.profileForm.get('email')?.value).toBe('test@example.com');
      expect(component.profileForm.get('department')?.value).toBe('Engineering');
      expect(component.loading()).toBe(false);
    }));

    it('should handle load error', fakeAsync(() => {
      const errorClient = {
        from: jasmine.createSpy('from').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              single: jasmine.createSpy('single').and.rejectWith(new Error('Load failed'))
            })
          })
        })
      };

      Object.defineProperty(mockSupabaseService, 'client', {
        get: () => errorClient,
        configurable: true
      });

      component.loadProfile();
      tick();

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Failed to load profile');
      expect(component.loading()).toBe(false);
    }));

    it('should not load profile if userId is null', fakeAsync(() => {
      Object.defineProperty(mockSupabaseService, 'userId', {
        get: () => null,
        configurable: true
      });

      component.loadProfile();
      tick();

      expect(component.loading()).toBe(false);
    }));

    it('should initialize dark mode state', () => {
      expect(component.isDarkMode()).toBe(false);
    });
  });

  describe('form validation', () => {
    it('should require full name', () => {
      const nameControl = component.profileForm.get('full_name');
      nameControl?.setValue('');
      expect(nameControl?.hasError('required')).toBeTrue();
    });

    it('should make email readonly', () => {
      const emailControl = component.profileForm.get('email');
      expect(emailControl?.value).toBe('test@example.com');
    });

    it('should allow department to be empty', () => {
      const deptControl = component.profileForm.get('department');
      deptControl?.setValue('');
      expect(deptControl?.valid).toBeTrue();
    });
  });

  describe('saveProfile', () => {
    beforeEach(fakeAsync(() => {
      tick(); // Wait for initial load
    }));

    it('should not save if form is invalid', async () => {
      component.profileForm.get('full_name')?.setValue('');
      await component.saveProfile();

      expect(mockNotificationService.showSuccess).not.toHaveBeenCalled();
    });

    it('should not save if form is not dirty', async () => {
      component.profileForm.markAsPristine();
      await component.saveProfile();

      expect(mockNotificationService.showSuccess).not.toHaveBeenCalled();
    });

    it('should save profile successfully', fakeAsync(() => {
      component.profileForm.patchValue({
        full_name: 'Updated Name',
        department: 'Sales'
      });
      component.profileForm.markAsDirty();

      component.saveProfile();
      tick();

      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
        'Profile updated successfully'
      );
      expect(component.profileForm.pristine).toBeTrue();
      expect(component.saving()).toBe(false);
    }));

    it('should handle save error', fakeAsync(() => {
      const errorClient = {
        from: jasmine.createSpy('from').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              single: jasmine.createSpy('single').and.resolveTo({ data: mockUserProfile, error: null })
            })
          }),
          update: jasmine.createSpy('update').and.returnValue({
            eq: jasmine.createSpy('eq').and.rejectWith(new Error('Save failed'))
          })
        })
      };

      Object.defineProperty(mockSupabaseService, 'client', {
        get: () => errorClient,
        configurable: true
      });

      component.profileForm.markAsDirty();
      component.saveProfile();
      tick();

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Failed to save profile');
      expect(component.saving()).toBe(false);
    }));

    it('should handle save when not authenticated', fakeAsync(() => {
      Object.defineProperty(mockSupabaseService, 'userId', {
        get: () => null,
        configurable: true
      });

      component.profileForm.markAsDirty();
      component.saveProfile();
      tick();

      expect(mockNotificationService.showError).toHaveBeenCalled();
    }));

    it('should set saving state during save', fakeAsync(() => {
      component.profileForm.markAsDirty();
      component.saveProfile();

      expect(component.saving()).toBeTrue();
      tick();
      expect(component.saving()).toBe(false);
    }));
  });

  describe('toggleDarkMode', () => {
    it('should toggle dark mode', () => {
      expect(component.isDarkMode()).toBe(false);

      // Mock theme change
      const mockThemeSignal = signal<'light' | 'dark'>('dark');
      Object.defineProperty(mockThemeService, 'theme', {
        get: () => mockThemeSignal,
        configurable: true
      });

      component.toggleDarkMode();

      expect(mockThemeService.toggleTheme).toHaveBeenCalled();
      expect(component.isDarkMode()).toBe(true);
    });

    it('should toggle from dark to light', () => {
      const mockThemeSignal = signal<'light' | 'dark'>('dark');
      Object.defineProperty(mockThemeService, 'theme', {
        get: () => mockThemeSignal,
        configurable: true
      });

      component.isDarkMode.set(true);
      mockThemeSignal.set('light');

      component.toggleDarkMode();

      expect(mockThemeService.toggleTheme).toHaveBeenCalled();
      expect(component.isDarkMode()).toBe(false);
    });
  });

  describe('template rendering', () => {
    it('should render the form', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('form')).toBeTruthy();
    }));

    it('should display page title', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const title = compiled.querySelector('.jensify-page-title');
      expect(title?.textContent).toContain('Profile Settings');
    }));

    it('should show loading spinner when loading', () => {
      component.loading.set(true);
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('mat-spinner')).toBeTruthy();
    });

    it('should show save button', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const button = compiled.querySelector('button[type="submit"]');
      expect(button).toBeTruthy();
    }));

    it('should show quick links', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const links = compiled.querySelectorAll('.quick-link');
      expect(links.length).toBeGreaterThan(0);
    }));

    it('should show dark mode toggle', fakeAsync(() => {
      tick();
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      const toggle = compiled.querySelector('mat-slide-toggle');
      expect(toggle).toBeTruthy();
    }));
  });
});
