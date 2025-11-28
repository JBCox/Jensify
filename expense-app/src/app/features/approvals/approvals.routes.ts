import { Routes } from '@angular/router';
import { authGuard, managerGuard, adminGuard } from '../../core/guards/auth.guard';

export const APPROVAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, managerGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./approval-queue/approval-queue').then(m => m.ApprovalQueue)
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./approval-settings/approval-settings').then(m => m.ApprovalSettings)
      }
    ]
  }
];
