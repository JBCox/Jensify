import { Routes } from '@angular/router';

/**
 * Billing feature routes
 * Provides access to subscription management, invoices, and payment settings
 *
 * Note: Guards are applied at the parent route level in app.routes.ts
 * All billing routes are protected by adminGuard at the '/billing' path
 */
export const BILLING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./billing-overview/billing-overview.component').then(
        (m) => m.BillingOverviewComponent
      ),
    title: 'Billing - Expensed',
    data: { breadcrumb: 'Billing Overview' },
  },
  {
    path: 'plans',
    loadComponent: () =>
      import('./plan-selector/plan-selector.component').then(
        (m) => m.PlanSelectorComponent
      ),
    title: 'Change Plan - Expensed',
    data: { breadcrumb: 'Change Plan' },
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./invoice-history/invoice-history.component').then(
        (m) => m.InvoiceHistoryComponent
      ),
    title: 'Invoices - Expensed',
    data: { breadcrumb: 'Invoices' },
  },
  {
    path: 'payment',
    loadComponent: () =>
      import('./payment-method/payment-method.component').then(
        (m) => m.PaymentMethodComponent
      ),
    title: 'Payment Method - Expensed',
    data: { breadcrumb: 'Payment Method' },
  },
];
