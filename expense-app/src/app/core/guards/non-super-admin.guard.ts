import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { SuperAdminService } from '../services/super-admin.service';

/**
 * Guard that BLOCKS super admins from accessing regular user routes.
 *
 * Super admins should only use the /super-admin/* routes.
 * This prevents platform owners from accidentally using customer features.
 *
 * If a super admin tries to access a regular route (like /expenses, /reports, /home),
 * they will be redirected to /super-admin.
 */
export const nonSuperAdminGuard: CanActivateFn = () => {
  const superAdminService = inject(SuperAdminService);
  const router = inject(Router);

  return superAdminService.isSuperAdmin$.pipe(
    take(1),
    map((isSuperAdmin) => {
      if (isSuperAdmin) {
        // Super admins cannot access regular user routes
        // Redirect them to the super admin dashboard
        return router.createUrlTree(['/super-admin']);
      }
      // Regular users can proceed
      return true;
    })
  );
};
