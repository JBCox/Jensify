import { Routes } from '@angular/router';
import { authGuard, financeGuard } from './core/guards/auth.guard';

/**
 * Application routes configuration
 * Defines all routes and their authentication requirements
 */
export const routes: Routes = [
  // Default route - redirect to expenses
  {
    path: '',
    redirectTo: '/expenses',
    pathMatch: 'full'
  },

  // Authentication routes (public)
  {
    path: 'auth',
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
        title: 'Sign In - Jensify'
      },
      {
        path: 'register',
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
        title: 'Create Account - Jensify'
      },
      {
        path: 'forgot-password',
        loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
        title: 'Reset Password - Jensify'
      },
      {
        path: 'confirm-email',
        loadComponent: () => import('./features/auth/confirm-email/confirm-email').then(m => m.ConfirmEmailComponent),
        title: 'Confirm Email - Jensify'
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      }
    ]
  },

  // Protected routes - require authentication
  {
    path: 'expenses',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'upload',
        pathMatch: 'full'
      },
      {
        path: 'upload',
        loadComponent: () => import('./features/expenses/receipt-upload/receipt-upload').then(m => m.ReceiptUpload),
        title: 'Upload Receipt - Jensify'
      }
      // TODO: Add these routes after creating the components
      // {
      //   path: 'list',
      //   loadComponent: () => import('./features/expenses/expense-list/expense-list.component').then(m => m.ExpenseListComponent),
      //   title: 'My Expenses - Jensify'
      // },
      // {
      //   path: 'new',
      //   loadComponent: () => import('./features/expenses/expense-form/expense-form.component').then(m => m.ExpenseFormComponent),
      //   title: 'New Expense - Jensify'
      // },
      // {
      //   path: ':id',
      //   loadComponent: () => import('./features/expenses/expense-detail/expense-detail.component').then(m => m.ExpenseDetailComponent),
      //   title: 'Expense Details - Jensify'
      // },
      // {
      //   path: ':id/edit',
      //   loadComponent: () => import('./features/expenses/expense-form/expense-form.component').then(m => m.ExpenseFormComponent),
      //   title: 'Edit Expense - Jensify'
      // }
    ]
  },

  // Finance routes - require finance or admin role
  // {
  //   path: 'finance',
  //   canActivate: [authGuard, financeGuard],
  //   children: [
  //     {
  //       path: '',
  //       redirectTo: 'dashboard',
  //       pathMatch: 'full'
  //     },
  //     {
  //       path: 'dashboard',
  //       loadComponent: () => import('./features/finance/dashboard/dashboard.component').then(m => m.DashboardComponent),
  //       title: 'Finance Dashboard - Jensify'
  //     },
  //     {
  //       path: 'reimbursements',
  //       loadComponent: () => import('./features/finance/reimbursements/reimbursements.component').then(m => m.ReimbursementsComponent),
  //       title: 'Reimbursements - Jensify'
  //     },
  //     {
  //       path: 'analytics',
  //       loadComponent: () => import('./features/finance/analytics/analytics.component').then(m => m.AnalyticsComponent),
  //       title: 'Analytics - Jensify'
  //     }
  //   ]
  // },

  // Approvals routes - require authentication
  // {
  //   path: 'approvals',
  //   canActivate: [authGuard],
  //   children: [
  //     {
  //       path: '',
  //       loadComponent: () => import('./features/approvals/approval-queue/approval-queue.component').then(m => m.ApprovalQueueComponent),
  //       title: 'Approval Queue - Jensify'
  //     }
  //   ]
  // },

  // Admin routes - require admin role
  // {
  //   path: 'admin',
  //   canActivate: [authGuard, financeGuard], // TODO: Create separate adminGuard
  //   children: [
  //     {
  //       path: '',
  //       redirectTo: 'users',
  //       pathMatch: 'full'
  //     },
  //     {
  //       path: 'users',
  //       loadComponent: () => import('./features/admin/users/users.component').then(m => m.UsersComponent),
  //       title: 'User Management - Jensify'
  //     },
  //     {
  //       path: 'policies',
  //       loadComponent: () => import('./features/admin/policies/policies.component').then(m => m.PoliciesComponent),
  //       title: 'Policy Settings - Jensify'
  //     },
  //     {
  //       path: 'settings',
  //       loadComponent: () => import('./features/admin/settings/settings.component').then(m => m.SettingsComponent),
  //       title: 'Settings - Jensify'
  //     }
  //   ]
  // },

  // Wildcard route - redirect to login
  {
    path: '**',
    redirectTo: '/auth/login'
  }
];
