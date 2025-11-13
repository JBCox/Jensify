import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

/**
 * Route guard that protects authenticated routes.
 * Redirects unauthenticated users to the login page.
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
  const router = inject(Router);

  return authService.userProfile$.pipe(
    take(1),
    map(user => {
      if (user) {
        return true;
      }

      // Store the attempted URL for redirecting after login
      const returnUrl = state.url;
      router.navigate(['/auth/login'], { queryParams: { returnUrl } });
      return false;
    })
  );
};

/**
 * Route guard that protects finance-only routes.
 * Redirects users without finance/admin roles to the home page.
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
export const financeGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.userProfile$.pipe(
    take(1),
    map(user => {
      if (user && authService.isFinanceOrAdmin) {
        return true;
      }

      // User is authenticated but doesn't have permission
      router.navigate(['/expenses']);
      return false;
    })
  );
};
