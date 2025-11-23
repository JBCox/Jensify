import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, take, filter, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { OrganizationService } from '../services/organization.service';
import { SupabaseService } from '../services/supabase.service';

/**
 * Route guard that protects authenticated routes.
 * Redirects unauthenticated users to the login page.
 * Redirects users without organization to setup wizard.
 *
 * @example
 * ```typescript
 * {
 *   path: 'expenses',
 *   component: ExpenseListComponent,
 *   canActivate: [authGuard]
 * }
 * ```
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const organizationService = inject(OrganizationService);
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);

  // Wait for BOTH session AND organization initialization before checking authentication
  return supabaseService.sessionInitialized$.pipe(
    filter(initialized => initialized === true), // Wait until session is loaded
    take(1),
    switchMap(() => organizationService.organizationInitialized$), // Then wait for organization
    filter(initialized => initialized === true),
    take(1),
    switchMap(() => authService.userProfile$),
    take(1),
    map(user => {
      // Allow if profile is present or we already have an authenticated session
      if (user || authService.isAuthenticated) {
        // Check if user has organization (except for setup and invitation routes)
        if (!organizationService.currentOrganizationId &&
            !state.url.startsWith('/organization/setup') &&
            !state.url.startsWith('/auth/accept-invitation')) {
          return router.parseUrl('/organization/setup');
        }

        if (authService.shouldUseDefaultRoute(state.url)) {
          return router.parseUrl(authService.getDefaultRoute());
        }
        return true;
      }

      // Store the attempted URL for redirecting after login
      // But don't store legacy routes - let login redirect to default route instead
      const returnUrl = authService.shouldUseDefaultRoute(state.url) ? undefined : state.url;
      router.navigate(['/auth/login'], { queryParams: returnUrl ? { returnUrl } : {} });
      return false;
    })
  );
};

/**
 * Route guard that protects finance-only routes.
 * Redirects users without finance/admin roles to the home page.
 * Uses organization-based role checking.
 *
 * @example
 * ```typescript
 * {
 *   path: 'finance',
 *   component: FinanceDashboardComponent,
 *   canActivate: [authGuard, financeGuard]
 * }
 * ```
 */
export const financeGuard: CanActivateFn = (_route, _state) => {
  const organizationService = inject(OrganizationService);
  const router = inject(Router);

  // Wait for organization context to be initialized before checking role
  return organizationService.organizationInitialized$.pipe(
    filter(initialized => initialized === true),
    take(1),
    map(() => {
      if (organizationService.isCurrentUserFinanceOrAdmin()) {
        return true;
      }

      // User is authenticated but doesn't have permission
      router.navigate(['/home']);
      return false;
    })
  );
};

/**
 * Route guard that protects admin-only routes.
 * Redirects users without admin role to the home page.
 *
 * @example
 * ```typescript
 * {
 *   path: 'admin/users',
 *   component: UserManagementComponent,
 *   canActivate: [authGuard, adminGuard]
 * }
 * ```
 */
export const adminGuard: CanActivateFn = (_route, _state) => {
  const organizationService = inject(OrganizationService);
  const router = inject(Router);

  console.log('[adminGuard] Waiting for organization initialization...');

  // Wait for organization context to be initialized before checking role
  return organizationService.organizationInitialized$.pipe(
    filter(initialized => initialized === true),
    take(1),
    map(() => {
      const isAdmin = organizationService.isCurrentUserAdmin();
      const currentRole = organizationService.currentUserRole;

      console.log('[adminGuard] Organization initialized');
      console.log('[adminGuard] Current user role:', currentRole);
      console.log('[adminGuard] Is admin:', isAdmin);

      if (isAdmin) {
        console.log('[adminGuard] Access granted - user is admin');
        return true;
      }

      // User is authenticated but doesn't have permission
      console.warn('[adminGuard] Access denied - redirecting to /home');
      router.navigate(['/home']);
      return false;
    })
  );
};

/**
 * Route guard that protects manager/admin routes.
 * Redirects users without manager/finance/admin roles to the home page.
 *
 * @example
 * ```typescript
 * {
 *   path: 'approvals',
 *   component: ApprovalQueueComponent,
 *   canActivate: [authGuard, managerGuard]
 * }
 * ```
 */
export const managerGuard: CanActivateFn = (_route, _state) => {
  const organizationService = inject(OrganizationService);
  const router = inject(Router);

  // Wait for organization context to be initialized before checking role
  return organizationService.organizationInitialized$.pipe(
    filter(initialized => initialized === true),
    take(1),
    map(() => {
      if (organizationService.isCurrentUserManagerOrAbove()) {
        return true;
      }

      // User is authenticated but doesn't have permission
      router.navigate(['/home']);
      return false;
    })
  );
};
