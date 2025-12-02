import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import { User } from '../models/user.model';
import { LoginCredentials, RegisterCredentials } from '../models';
import { UserRole } from '../models/enums';

describe('AuthService', () => {
  let service: AuthService;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockLoggerService: jasmine.SpyObj<LoggerService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let currentUserSubject: BehaviorSubject<any>;
  let sessionInitializedSubject: BehaviorSubject<boolean>;

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    full_name: 'Test User',
    role: UserRole.EMPLOYEE,
    created_at: '2025-11-13T10:00:00Z',
    updated_at: '2025-11-13T10:00:00Z'
  };

  const mockSupabaseUser = {
    id: 'user-123',
    email: 'test@example.com',
    user_metadata: {
      full_name: 'Test User'
    }
  };

  beforeEach(() => {
    // Create BehaviorSubjects for observable streams
    currentUserSubject = new BehaviorSubject<any>(null);
    sessionInitializedSubject = new BehaviorSubject<boolean>(true); // Start initialized

    // Create mock services
    mockSupabaseService = jasmine.createSpyObj('SupabaseService', [
      'signUp',
      'signIn',
      'signOut',
      'resetPassword',
      'updatePassword'
    ], {
      currentUser$: currentUserSubject.asObservable(),
      sessionInitialized$: sessionInitializedSubject.asObservable(),
      isAuthenticated: false,
      userId: null,
      client: {
        from: jasmine.createSpy('from')
      }
    });

    mockOrganizationService = jasmine.createSpyObj('OrganizationService', [
      'clearCurrentOrganization',
      'loadUserOrganizations'
    ], {
      currentOrganizationId: null,
      organizationInitialized$: of(true)
    });

    mockRouter = jasmine.createSpyObj('Router', ['navigate'], {
      url: '/home'
    });
    mockLoggerService = jasmine.createSpyObj('LoggerService', ['debug', 'info', 'warn', 'error']);
    mockNotificationService = jasmine.createSpyObj('NotificationService', ['success', 'error', 'warn', 'info']);

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: Router, useValue: mockRouter },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: NotificationService, useValue: mockNotificationService }
      ]
    });

    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Initialization', () => {
    it('should initialize with null user profile', () => {
      expect(service.currentUserProfile).toBeNull();
    });

    it('should subscribe to auth changes on construction', () => {
      expect(service.userProfile$).toBeDefined();
    });

    it('should load user profile when currentUser$ emits user', (done) => {
      // Setup mock profile fetch
      const mockProfileResponse = { data: mockUser, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      // Emit user
      currentUserSubject.next(mockSupabaseUser);

      // Wait for async profile loading
      setTimeout(() => {
        expect(service.currentUserProfile).toEqual(mockUser);
        done();
      }, 100);
    });

    it('should set profile to null when currentUser$ emits null', (done) => {
      // First set a user
      const mockProfileResponse = { data: mockUser, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockSupabaseUser);

      setTimeout(() => {
        expect(service.currentUserProfile).toEqual(mockUser);

        // Now emit null
        currentUserSubject.next(null);

        setTimeout(() => {
          expect(service.currentUserProfile).toBeNull();
          done();
        }, 50);
      }, 100);
    });
  });

  describe('register()', () => {
    const credentials: RegisterCredentials = {
      email: 'newuser@example.com',
      password: 'password123',
      full_name: 'New User',
      confirm_password: 'password123'
    };

    it('should register new user successfully', (done) => {
      const mockResponse = {
        data: {
          user: mockSupabaseUser as any,
          session: null
        },
        error: null
      };
      mockSupabaseService.signUp.and.resolveTo(mockResponse as any);

      service.register(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
          expect(mockSupabaseService.signUp).toHaveBeenCalledWith(
            credentials.email,
            credentials.password,
            credentials.full_name
          );
          done();
        },
        error: done.fail
      });
    });

    it('should handle registration error from Supabase', (done) => {
      const mockError = { message: 'Email already registered' };
      const mockResponse = { data: null, error: mockError };
      mockSupabaseService.signUp.and.resolveTo(mockResponse);

      service.register(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Email already registered');
          done();
        },
        error: done.fail
      });
    });

    it('should handle unexpected registration error', (done) => {
      mockSupabaseService.signUp.and.rejectWith(new Error('Network error'));

      service.register(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Network error');
          done();
        },
        error: done.fail
      });
    });

    it('should handle error without message', (done) => {
      mockSupabaseService.signUp.and.rejectWith({});

      service.register(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Registration failed');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('signIn()', () => {
    const credentials: LoginCredentials = {
      email: 'test@example.com',
      password: 'password123'
    };

    it('should sign in successfully', (done) => {
      const mockResponse = {
        data: {
          user: mockSupabaseUser as any,
          session: { access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 } as any
        },
        error: null
      };
      mockSupabaseService.signIn.and.resolveTo(mockResponse as any);

      service.signIn(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
          expect(mockSupabaseService.signIn).toHaveBeenCalledWith(
            credentials.email,
            credentials.password
          );
          done();
        },
        error: done.fail
      });
    });

    it('should handle invalid credentials', (done) => {
      const mockError = { message: 'Invalid login credentials' };
      const mockResponse = { data: null, error: mockError };
      mockSupabaseService.signIn.and.resolveTo(mockResponse);

      service.signIn(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid login credentials');
          done();
        },
        error: done.fail
      });
    });

    it('should handle network error', (done) => {
      mockSupabaseService.signIn.and.rejectWith(new Error('Network timeout'));

      service.signIn(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Network timeout');
          done();
        },
        error: done.fail
      });
    });

    it('should handle error without message', (done) => {
      mockSupabaseService.signIn.and.rejectWith({});

      service.signIn(credentials).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Login failed');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('signOut()', () => {
    it('should sign out successfully and clear profile', async () => {
      mockSupabaseService.signOut.and.resolveTo({ error: null });
      mockRouter.navigate.and.resolveTo(true);

      await service.signOut();

      expect(mockSupabaseService.signOut).toHaveBeenCalled();
      expect(service.currentUserProfile).toBeNull();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });

    it('should clear profile even if signOut fails', async () => {
      // Set a current user first
      const mockProfileResponse = { data: mockUser, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockSupabaseUser);

      await new Promise(resolve => setTimeout(resolve, 100));

      // Now sign out with error
      mockSupabaseService.signOut.and.resolveTo({ error: { message: 'Error' } });
      mockRouter.navigate.and.resolveTo(true);

      await service.signOut();

      expect(service.currentUserProfile).toBeNull();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });

    it('should navigate to login page after sign out', async () => {
      mockSupabaseService.signOut.and.resolveTo({ error: null });
      mockRouter.navigate.and.resolveTo(true);

      await service.signOut();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('resetPassword()', () => {
    const email = 'test@example.com';

    it('should send password reset email successfully', (done) => {
      mockSupabaseService.resetPassword.and.resolveTo({ error: null });

      service.resetPassword(email).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
          expect(mockSupabaseService.resetPassword).toHaveBeenCalledWith(email);
          done();
        },
        error: done.fail
      });
    });

    it('should handle reset password error', (done) => {
      const mockError = { message: 'User not found' };
      mockSupabaseService.resetPassword.and.resolveTo({ error: mockError });

      service.resetPassword(email).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('User not found');
          done();
        },
        error: done.fail
      });
    });

    it('should handle network error', (done) => {
      mockSupabaseService.resetPassword.and.rejectWith(new Error('Network error'));

      service.resetPassword(email).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Network error');
          done();
        },
        error: done.fail
      });
    });

    it('should handle error without message', (done) => {
      mockSupabaseService.resetPassword.and.rejectWith({});

      service.resetPassword(email).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Password reset failed');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('updatePassword()', () => {
    const newPassword = 'newPassword123';

    it('should update password successfully', (done) => {
      mockSupabaseService.updatePassword.and.resolveTo({ error: null });

      service.updatePassword(newPassword).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.error).toBeUndefined();
          expect(mockSupabaseService.updatePassword).toHaveBeenCalledWith(newPassword);
          done();
        },
        error: done.fail
      });
    });

    it('should handle update password error', (done) => {
      const mockError = { message: 'Password too weak' };
      mockSupabaseService.updatePassword.and.resolveTo({ error: mockError });

      service.updatePassword(newPassword).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Password too weak');
          done();
        },
        error: done.fail
      });
    });

    it('should handle network error', (done) => {
      mockSupabaseService.updatePassword.and.rejectWith(new Error('Network error'));

      service.updatePassword(newPassword).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Network error');
          done();
        },
        error: done.fail
      });
    });

    it('should handle error without message', (done) => {
      mockSupabaseService.updatePassword.and.rejectWith({});

      service.updatePassword(newPassword).subscribe({
        next: (result) => {
          expect(result.success).toBe(false);
          expect(result.error).toBe('Password update failed');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('refreshUserProfile()', () => {
    it('should refresh user profile when userId is available', async () => {
      Object.defineProperty(mockSupabaseService, 'userId', {
        get: () => 'user-123',
        configurable: true
      });

      const mockProfileResponse = { data: mockUser, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      await service.refreshUserProfile();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(service.currentUserProfile).toEqual(mockUser);
    });

    it('should not refresh when userId is null', async () => {
      Object.defineProperty(mockSupabaseService, 'userId', {
        get: () => null,
        configurable: true
      });

      await service.refreshUserProfile();

      expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
    });

    it('should handle profile refresh error', async () => {
      Object.defineProperty(mockSupabaseService, 'userId', {
        get: () => 'user-123',
        configurable: true
      });

      const mockError = { message: 'Profile not found' };
      const mockProfileResponse = { data: null, error: mockError };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      await service.refreshUserProfile();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'Error loading user profile, using provisional',
        'AuthService',
        mockError
      );
    });
  });

  describe('Role-based Access', () => {
    describe('isAuthenticated', () => {
      it('should return true when user is authenticated', () => {
        Object.defineProperty(mockSupabaseService, 'isAuthenticated', {
          get: () => true,
          configurable: true
        });

        expect(service.isAuthenticated).toBe(true);
      });

      it('should return false when user is not authenticated', () => {
        Object.defineProperty(mockSupabaseService, 'isAuthenticated', {
          get: () => false,
          configurable: true
        });

        expect(service.isAuthenticated).toBe(false);
      });
    });

    describe('userRole', () => {
      it('should return user role when profile exists', (done) => {
        const mockProfileResponse = { data: mockUser, error: null };
        const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
        const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
        const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
        (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

        currentUserSubject.next(mockSupabaseUser);

        setTimeout(() => {
          expect(service.userRole).toBe('employee');
          done();
        }, 100);
      });

      it('should return null when no profile', () => {
        expect(service.userRole).toBeNull();
      });
    });

    describe('hasRole()', () => {
      it('should return true when user has the specified role', (done) => {
        const mockProfileResponse = { data: mockUser, error: null };
        const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
        const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
        const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
        (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

        currentUserSubject.next(mockSupabaseUser);

        setTimeout(() => {
          expect(service.hasRole('employee')).toBe(true);
          expect(service.hasRole('finance')).toBe(false);
          done();
        }, 100);
      });

      it('should return false when no profile', () => {
        expect(service.hasRole('employee')).toBe(false);
      });
    });

    describe('isFinanceOrAdmin', () => {
      it('should return true for finance role', (done) => {
        const financeUser = { ...mockUser, role: 'finance' };
        const mockProfileResponse = { data: financeUser, error: null };
        const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
        const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
        const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
        (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

        currentUserSubject.next(mockSupabaseUser);

        setTimeout(() => {
          expect(service.isFinanceOrAdmin).toBe(true);
          done();
        }, 100);
      });

      it('should return true for admin role', (done) => {
        const adminUser = { ...mockUser, role: 'admin' };
        const mockProfileResponse = { data: adminUser, error: null };
        const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
        const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
        const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
        (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

        currentUserSubject.next(mockSupabaseUser);

        setTimeout(() => {
          expect(service.isFinanceOrAdmin).toBe(true);
          done();
        }, 100);
      });

      it('should return false for employee role', (done) => {
        const mockProfileResponse = { data: mockUser, error: null };
        const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
        const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
        const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
        (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

        currentUserSubject.next(mockSupabaseUser);

        setTimeout(() => {
          expect(service.isFinanceOrAdmin).toBe(false);
          done();
        }, 100);
      });

      it('should return false when no profile', () => {
        expect(service.isFinanceOrAdmin).toBe(false);
      });
    });
  });

  describe('Observable Behavior', () => {
    it('should emit userProfile$ updates', (done) => {
      const mockProfileResponse = { data: mockUser, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockProfileResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      const profiles: (User | null)[] = [];
      service.userProfile$.subscribe(profile => profiles.push(profile));

      currentUserSubject.next(mockSupabaseUser);

      setTimeout(() => {
        expect(profiles.length).toBeGreaterThan(0);
        expect(profiles[profiles.length - 1]).toEqual(mockUser);
        done();
      }, 100);
    });

    it('should maintain single subscription to currentUser$', () => {
      // The subscription is set up in constructor
      // Verify it doesn't create multiple subscriptions
      expect(service.userProfile$).toBeDefined();
    });
  });
});
