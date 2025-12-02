import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { App } from './app';
import { AuthService } from './core/services/auth.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';
import { PwaService } from './core/services/pwa.service';
import { OrganizationService } from './core/services/organization.service';
import { ThemeService } from './core/services/theme.service';
import { User } from './core/models/user.model';
import { UserRole } from './core/models/enums';

describe('App Component', () => {
  let component: App;
  let fixture: ComponentFixture<App>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: Partial<Router>;
  let mockDialog: jasmine.SpyObj<MatDialog>;
  let mockKeyboardShortcuts: jasmine.SpyObj<KeyboardShortcutsService>;
  let mockPwaService: jasmine.SpyObj<PwaService>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let userProfileSubject: BehaviorSubject<User | null>;
  let sessionSubject: BehaviorSubject<any>;
  let routerEventsSubject: Subject<any>;

  const mockEmployee: User = {
    id: 'user-123',
    email: 'employee@example.com',
    full_name: 'Test Employee',
    role: UserRole.EMPLOYEE,
    created_at: '2025-11-13T10:00:00Z',
    updated_at: '2025-11-13T10:00:00Z'
  };

  const mockFinanceUser: User = {
    id: 'user-456',
    email: 'finance@example.com',
    full_name: 'Test Finance',
    role: UserRole.FINANCE,
    created_at: '2025-11-13T10:00:00Z',
    updated_at: '2025-11-13T10:00:00Z'
  };

  const mockAdminUser: User = {
    id: 'user-789',
    email: 'admin@example.com',
    full_name: 'Test Admin',
    role: UserRole.ADMIN,
    created_at: '2025-11-13T10:00:00Z',
    updated_at: '2025-11-13T10:00:00Z'
  };

  beforeEach(async () => {
    userProfileSubject = new BehaviorSubject<User | null>(null);
    sessionSubject = new BehaviorSubject<any>(null);
    routerEventsSubject = new Subject<any>();

    mockAuthService = jasmine.createSpyObj('AuthService', ['signOut'], {
      userProfile$: userProfileSubject.asObservable(),
      session$: sessionSubject.asObservable(),
      isFinanceOrAdmin: false
    });

    mockRouter = {
      url: '/home',
      events: routerEventsSubject.asObservable(),
      navigate: jasmine.createSpy('navigate')
    };

    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);
    mockKeyboardShortcuts = jasmine.createSpyObj('KeyboardShortcutsService', ['registerShortcuts']);
    mockPwaService = jasmine.createSpyObj('PwaService', ['checkForUpdate', 'activateUpdate', 'canInstall', 'promptInstall']);
    mockPwaService.canInstall.and.returnValue(false);

    mockOrganizationService = jasmine.createSpyObj('OrganizationService', ['getUserOrganizationContext'], {
      currentOrganization$: of(null)
    });
    mockOrganizationService.getUserOrganizationContext.and.returnValue(of(null));

    mockThemeService = jasmine.createSpyObj('ThemeService', ['applyBrandColor', 'resetBrandColor', 'toggleTheme'], {
      isDarkMode$: of(false),
      isDarkMode: false
    });

    await TestBed.configureTestingModule({
      imports: [App, NoopAnimationsModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: MatDialog, useValue: mockDialog },
        { provide: KeyboardShortcutsService, useValue: mockKeyboardShortcuts },
        { provide: PwaService, useValue: mockPwaService },
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: ThemeService, useValue: mockThemeService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should have vm$ observable defined', () => {
      expect(component.vm$).toBeDefined();
    });

    it('should combine userProfile$ and session$ in vm$', (done) => {
      userProfileSubject.next(mockEmployee);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.profile).toEqual(mockEmployee);
        expect(vm.isAuthenticated).toBe(true);
        done();
      });
    });

    it('should start with null profile if not authenticated', (done) => {
      component.vm$.subscribe(vm => {
        expect(vm.profile).toBeNull();
        expect(vm.isAuthenticated).toBe(false);
        done();
      });
    });
  });

  describe('User Profile Observable', () => {
    it('should emit vm updates when user profile changes', (done) => {
      const profiles: (User | null)[] = [];

      component.vm$.subscribe(vm => {
        profiles.push(vm.profile);

        if (profiles.length === 2) {
          expect(profiles[0]).toBeNull();
          expect(profiles[1]).toEqual(mockEmployee);
          done();
        }
      });

      userProfileSubject.next(mockEmployee);
    });

    it('should handle user sign in', (done) => {
      userProfileSubject.next(mockEmployee);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.profile).toEqual(mockEmployee);
        expect(vm.isAuthenticated).toBe(true);
        done();
      });
    });

    it('should handle user sign out', (done) => {
      userProfileSubject.next(mockEmployee);
      sessionSubject.next({ access_token: 'test-token' });

      let emissionCount = 0;
      component.vm$.subscribe(vm => {
        emissionCount++;

        if (emissionCount === 3) {
          expect(vm.profile).toBeNull();
          expect(vm.isAuthenticated).toBe(false);
          done();
        }
      });

      userProfileSubject.next(null);
      sessionSubject.next(null);
    });

    it('should handle user role changes', (done) => {
      const emissions: (User | null)[] = [];

      component.vm$.subscribe(vm => {
        emissions.push(vm.profile);

        if (emissions.length === 3) {
          expect(emissions[0]).toBeNull();
          expect(emissions[1]).toEqual(mockEmployee);
          expect(emissions[2]).toEqual(mockFinanceUser);
          done();
        }
      });

      userProfileSubject.next(mockEmployee);
      userProfileSubject.next(mockFinanceUser);
    });
  });

  describe('signOut()', () => {
    it('should call authService.signOut', async () => {
      mockAuthService.signOut.and.resolveTo();

      await component.signOut();

      expect(mockAuthService.signOut).toHaveBeenCalled();
    });

    it('should handle signOut errors gracefully', async () => {
      mockAuthService.signOut.and.rejectWith(new Error('Sign out failed'));

      try {
        await component.signOut();
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toBe('Sign out failed');
      }
    });
  });

  describe('Component Integration', () => {
    it('should work with authenticated employee user', (done) => {
      userProfileSubject.next(mockEmployee);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.profile?.role).toBe(UserRole.EMPLOYEE);
        expect(vm.profile?.email).toBe('employee@example.com');
        expect(vm.isAuthenticated).toBe(true);
        done();
      });
    });

    it('should work with authenticated finance user', (done) => {
      userProfileSubject.next(mockFinanceUser);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.profile?.role).toBe(UserRole.FINANCE);
        expect(vm.isAuthenticated).toBe(true);
        done();
      });
    });

    it('should work with authenticated admin user', (done) => {
      userProfileSubject.next(mockAdminUser);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.profile?.role).toBe(UserRole.ADMIN);
        expect(vm.isAuthenticated).toBe(true);
        done();
      });
    });

    it('should handle complete auth lifecycle', async () => {
      // User signs in
      userProfileSubject.next(mockEmployee);
      sessionSubject.next({ access_token: 'test-token' });
      await fixture.whenStable();

      // User signs out
      mockAuthService.signOut.and.resolveTo();

      await component.signOut();

      expect(mockAuthService.signOut).toHaveBeenCalled();
    });
  });

  describe('UI State Management', () => {
    it('should provide reactive vm state for templates', (done) => {
      const profiles: (User | null)[] = [];

      component.vm$.subscribe(vm => profiles.push(vm.profile));

      userProfileSubject.next(mockEmployee);

      setTimeout(() => {
        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles[profiles.length - 1]).toEqual(mockEmployee);
        done();
      }, 100);
    });

    it('should provide display name for templates', (done) => {
      userProfileSubject.next(mockEmployee);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.displayName).toBe('Test Employee');
        expect(vm.email).toBe('employee@example.com');
        done();
      });
    });
  });

  describe('Observable Memory Management', () => {
    it('should maintain single observable reference', () => {
      const vm1$ = component.vm$;
      const vm2$ = component.vm$;

      expect(vm1$).toBe(vm2$);
    });

    it('should properly propagate observable updates', (done) => {
      const profiles: (User | null)[] = [];

      component.vm$.subscribe(vm => {
        profiles.push(vm.profile);
      });

      userProfileSubject.next(mockEmployee);
      userProfileSubject.next(mockFinanceUser);
      userProfileSubject.next(null);

      setTimeout(() => {
        expect(profiles.length).toBe(4); // Initial null + 3 updates
        expect(profiles[0]).toBeNull();
        expect(profiles[1]).toEqual(mockEmployee);
        expect(profiles[2]).toEqual(mockFinanceUser);
        expect(profiles[3]).toBeNull();
        done();
      }, 100);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid sign out calls', async () => {
      mockAuthService.signOut.and.resolveTo();

      await Promise.all([
        component.signOut(),
        component.signOut()
      ]);

      // Both should complete without error
      expect(mockAuthService.signOut).toHaveBeenCalled();
    });

    it('should handle user profile with missing fields gracefully', (done) => {
      const partialUser = {
        id: 'user-999',
        email: 'partial@example.com'
      } as User;

      userProfileSubject.next(partialUser);
      sessionSubject.next({ access_token: 'test-token' });

      component.vm$.subscribe(vm => {
        expect(vm.profile?.id).toBe('user-999');
        expect(vm.isAuthenticated).toBe(true);
        done();
      });
    });
  });
});
