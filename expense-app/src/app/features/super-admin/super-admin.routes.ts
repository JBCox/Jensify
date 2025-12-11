import { Routes } from '@angular/router';

/**
 * Super Admin feature routes
 * Platform-level administration for managing all organizations
 *
 * IMPORTANT: Super admins can only see billing/subscription data
 * They CANNOT access customer expense data (privacy by design)
 *
 * Note: Guards are applied at the parent route level in app.routes.ts
 * All super-admin routes are protected by authGuard and superAdminGuard
 */
export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/super-admin-dashboard.component').then(
        (m) => m.SuperAdminDashboardComponent
      ),
    title: 'Super Admin - Expensed',
    data: { breadcrumb: 'Dashboard' },
  },
  {
    path: 'organizations',
    data: { breadcrumb: 'Organizations' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./organizations/organization-list.component').then(
            (m) => m.OrganizationListComponent
          ),
        title: 'Organizations - Super Admin',
        data: { breadcrumb: 'All Organizations' },
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./organizations/organization-detail.component').then(
            (m) => m.OrganizationDetailComponent
          ),
        title: 'Organization Details - Super Admin',
        data: { breadcrumb: 'Details' },
      },
    ],
  },
  {
    path: 'coupons',
    data: { breadcrumb: 'Coupons' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./coupons/coupon-list.component').then(
            (m) => m.CouponListComponent
          ),
        title: 'Coupon Codes - Super Admin',
        data: { breadcrumb: 'All Coupons' },
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./coupons/coupon-form.component').then(
            (m) => m.CouponFormComponent
          ),
        title: 'Create Coupon - Super Admin',
        data: { breadcrumb: 'New Coupon' },
      },
    ],
  },
  {
    path: 'analytics',
    loadComponent: () =>
      import('./analytics/revenue-analytics.component').then(
        (m) => m.RevenueAnalyticsComponent
      ),
    title: 'Revenue Analytics - Super Admin',
    data: { breadcrumb: 'Analytics' },
  },
  {
    path: 'audit-log',
    loadComponent: () =>
      import('./audit-log/audit-log.component').then(
        (m) => m.AuditLogComponent
      ),
    title: 'Audit Log - Super Admin',
    data: { breadcrumb: 'Audit Log' },
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./settings/system-settings.component').then(
        (m) => m.SystemSettingsComponent
      ),
    title: 'System Settings - Super Admin',
    data: { breadcrumb: 'Settings' },
  },
  {
    path: 'announcements',
    data: { breadcrumb: 'Announcements' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./announcements/announcement-list.component').then(
            (m) => m.AnnouncementListComponent
          ),
        title: 'Announcements - Super Admin',
        data: { breadcrumb: 'All Announcements' },
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./announcements/announcement-form.component').then(
            (m) => m.AnnouncementFormComponent
          ),
        title: 'New Announcement - Super Admin',
        data: { breadcrumb: 'New Announcement' },
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./announcements/announcement-form.component').then(
            (m) => m.AnnouncementFormComponent
          ),
        title: 'Edit Announcement - Super Admin',
        data: { breadcrumb: 'Edit' },
      },
    ],
  },
  {
    path: 'email-templates',
    data: { breadcrumb: 'Email Templates' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./email-templates/email-template-list.component').then(
            (m) => m.EmailTemplateListComponent
          ),
        title: 'Email Templates - Super Admin',
        data: { breadcrumb: 'All Templates' },
      },
      {
        path: ':name',
        loadComponent: () =>
          import('./email-templates/email-template-editor.component').then(
            (m) => m.EmailTemplateEditorComponent
          ),
        title: 'Edit Template - Super Admin',
        data: { breadcrumb: 'Edit' },
      },
    ],
  },
  {
    path: 'impersonation',
    data: { breadcrumb: 'Impersonation' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./impersonation/impersonation-history.component').then(
            (m) => m.ImpersonationHistoryComponent
          ),
        title: 'Impersonation History - Super Admin',
        data: { breadcrumb: 'History' },
      },
      {
        path: 'start',
        loadComponent: () =>
          import('./impersonation/user-search.component').then(
            (m) => m.UserSearchComponent
          ),
        title: 'Impersonate User - Super Admin',
        data: { breadcrumb: 'Start Session' },
      },
    ],
  },
  {
    path: 'errors',
    loadComponent: () =>
      import('./error-logs/error-log-list.component').then(
        (m) => m.ErrorLogListComponent
      ),
    title: 'Error Logs - Super Admin',
    data: { breadcrumb: 'Error Logs' },
  },
  {
    path: 'bulk-actions',
    loadComponent: () =>
      import('./bulk-actions/bulk-operations.component').then(
        (m) => m.BulkOperationsComponent
      ),
    title: 'Bulk Actions - Super Admin',
    data: { breadcrumb: 'Bulk Actions' },
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./invoices/invoice-management.component').then(
        (m) => m.InvoiceManagementComponent
      ),
    title: 'Invoice Management - Super Admin',
    data: { breadcrumb: 'Invoices' },
  },
  {
    path: 'api-keys',
    loadComponent: () =>
      import('./api-keys/api-key-list.component').then(
        (m) => m.ApiKeyListComponent
      ),
    title: 'API Keys - Super Admin',
    data: { breadcrumb: 'API Keys' },
  },
  {
    path: 'integrations',
    loadComponent: () =>
      import('./integrations/integration-health.component').then(
        (m) => m.IntegrationHealthComponent
      ),
    title: 'Integration Health - Super Admin',
    data: { breadcrumb: 'Integrations' },
  },
  {
    path: 'scheduled-tasks',
    loadComponent: () =>
      import('./scheduled-tasks/task-list.component').then(
        (m) => m.TaskListComponent
      ),
    title: 'Scheduled Tasks - Super Admin',
    data: { breadcrumb: 'Scheduled Tasks' },
  },
  {
    path: 'data-export',
    loadComponent: () =>
      import('./data-export/data-export.component').then(
        (m) => m.DataExportComponent
      ),
    title: 'Data Export - Super Admin',
    data: { breadcrumb: 'Data Export' },
  },
  {
    path: 'plans',
    data: { breadcrumb: 'Plans' },
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./plan-management/plan-list.component').then(
            (m) => m.PlanListComponent
          ),
        title: 'Manage Plans - Super Admin',
        data: { breadcrumb: 'All Plans' },
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./plan-management/plan-editor.component').then(
            (m) => m.PlanEditorComponent
          ),
        title: 'Edit Plan - Super Admin',
        data: { breadcrumb: 'Edit' },
      },
    ],
  },
];
