import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { authGuard, financeGuard, adminGuard, managerGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { OrganizationService } from '../services/organization.service';
import { SupabaseService } from '../services/supabase.service';
import { User, OrganizationMember } from '../models';
import { UserRole } from '../models/enums';

describe('Auth Guards', () => {
  let mockRouter: jasmine.SpyObj<Router>;
  let mockAuthService: Partial<AuthService>;
  let mockOrganizationService: Partial<OrganizationService>;
  let mockSupabaseService: Partial<SupabaseService>;
  let userProfileSubject: BehaviorSubject<User | null>;
  let sessionInitializedSubject: BehaviorSubject<boolean>;
  let organizationInitializedSubject: BehaviorSubject<boolean>;
  let currentMembershipSubject: BehaviorSubject<OrganizationMember | null>;
  let currentOrgId: string | null;

  const mockMembership: OrganizationMember = {
    id: 'member-1',
    organization_id: 'org-123',
    user_id: 'user-1',
    role: UserRole.EMPLOYEE,
    is_active: true,
    joined_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  beforeEach(() => {
    userProfileSubject = new BehaviorSubject<User | null>(null);
    sessionInitializedSubject = new BehaviorSubject<boolean>(true);
    organizationInitializedSubject = new BehaviorSubject<boolean>(true);
    currentOrgId = 'org-123';
    currentMembershipSubject = new BehaviorSubject<OrganizationMember | null>(mockMembership);

    mockRouter = jasmine.createSpyObj('Router', ['navigate', 'parseUrl']);
    mockRouter.parseUrl.and.callFake((url: string) => ({ toString: () => url } as any));

    mockAuthService = {
      userProfile$: userProfileSubject.asObservable(),
      get isAuthenticated() { return userProfileSubject.value !== null; },
      shouldUseDefaultRoute: jasmine.createSpy('shouldUseDefaultRoute').and.returnValue(false),
      getDefaultRoute: jasmine.createSpy('getDefaultRoute').and.returnValue('/home')
    };

    mockOrganizationService = {
      get currentOrganizationId() { return currentOrgId; },
      organizationInitialized$: organizationInitializedSubject.asObservable(),
      currentMembership$: currentMembershipSubject.asObservable(),
      isCurrentUserFinanceOrAdmin: jasmine.createSpy('isCurrentUserFinanceOrAdmin').and.returnValue(false),
      isCurrentUserAdmin: jasmine.createSpy('isCurrentUserAdmin').and.returnValue(false),
      isCurrentUserManagerOrAbove: jasmine.createSpy('isCurrentUserManagerOrAbove').and.returnValue(false)
    };

    mockSupabaseService = {
      sessionInitialized$: sessionInitializedSubject.asObservable()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
  });

  describe('authGuard', () => {
    it('should allow authenticated users', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        full_name: 'Test User',
        role: UserRole.EMPLOYEE,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      userProfileSubject.next(mockUser);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = authGuard({} as any, { url: '/expenses' } as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(true);
    });

    it('should redirect unauthenticated users to login', async () => {
      userProfileSubject.next(null);

      await TestBed.runInInjectionContext(async () => {
        const guardResult = authGuard({} as any, { url: '/expenses' } as any);
        await firstValueFrom(guardResult as any);
        expect(mockRouter.navigate).toHaveBeenCalledWith(
          ['/auth/login'],
          { queryParams: { returnUrl: '/expenses' } }
        );
      });
    });

    it('should preserve return URL after login redirect', async () => {
      userProfileSubject.next(null);

      await TestBed.runInInjectionContext(async () => {
        const guardResult = authGuard({} as any, { url: '/reports/123' } as any);
        await firstValueFrom(guardResult as any);
        expect(mockRouter.navigate).toHaveBeenCalledWith(
          ['/auth/login'],
          { queryParams: { returnUrl: '/reports/123' } }
        );
      });
    });

    it('should allow super admin routes without organization', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'admin@example.com',
        full_name: 'Super Admin',
        role: UserRole.ADMIN,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      userProfileSubject.next(mockUser);
      currentOrgId = null;
      localStorage.removeItem('current_organization_id');

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = authGuard({} as any, { url: '/super-admin/dashboard' } as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(true);
    });

    it('should use localStorage fallback when organizationService not yet loaded', async () => {
      const mockUser: User = {
        id: 'user-1',
        email: 'test@example.com',
        full_name: 'Test User',
        role: UserRole.EMPLOYEE,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      userProfileSubject.next(mockUser);
      currentOrgId = null;
      localStorage.setItem('current_organization_id', 'org-123');

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = authGuard({} as any, { url: '/expenses' } as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(true);
      localStorage.removeItem('current_organization_id');
    });
  });

  describe('financeGuard', () => {
    it('should allow finance users', async () => {
      (mockOrganizationService.isCurrentUserFinanceOrAdmin as jasmine.Spy).and.returnValue(true);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = financeGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(true);
    });

    it('should deny non-finance users', async () => {
      (mockOrganizationService.isCurrentUserFinanceOrAdmin as jasmine.Spy).and.returnValue(false);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = financeGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
    });

    it('should redirect to login if membership is inactive', async () => {
      const inactiveMembership: OrganizationMember = {
        ...mockMembership,
        is_active: false
      };
      currentMembershipSubject.next(inactiveMembership);
      (mockOrganizationService.isCurrentUserFinanceOrAdmin as jasmine.Spy).and.returnValue(true);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = financeGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('adminGuard', () => {
    it('should allow admin users', async () => {
      (mockOrganizationService.isCurrentUserAdmin as jasmine.Spy).and.returnValue(true);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = adminGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(true);
    });

    it('should deny non-admin users', async () => {
      (mockOrganizationService.isCurrentUserAdmin as jasmine.Spy).and.returnValue(false);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = adminGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
    });

    it('should redirect to login if membership is inactive', async () => {
      const inactiveMembership: OrganizationMember = {
        ...mockMembership,
        is_active: false
      };
      currentMembershipSubject.next(inactiveMembership);
      (mockOrganizationService.isCurrentUserAdmin as jasmine.Spy).and.returnValue(true);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = adminGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });

  describe('managerGuard', () => {
    it('should allow manager users', async () => {
      (mockOrganizationService.isCurrentUserManagerOrAbove as jasmine.Spy).and.returnValue(true);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = managerGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(true);
    });

    it('should deny non-manager users', async () => {
      (mockOrganizationService.isCurrentUserManagerOrAbove as jasmine.Spy).and.returnValue(false);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = managerGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
    });

    it('should redirect to login if membership is inactive', async () => {
      const inactiveMembership: OrganizationMember = {
        ...mockMembership,
        is_active: false
      };
      currentMembershipSubject.next(inactiveMembership);
      (mockOrganizationService.isCurrentUserManagerOrAbove as jasmine.Spy).and.returnValue(true);

      const result = await TestBed.runInInjectionContext(async () => {
        const guardResult = managerGuard({} as any, {} as any);
        return await firstValueFrom(guardResult as any);
      });

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });
  });
});
