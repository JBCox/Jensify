import { Routes } from "@angular/router";
import {
  adminGuard,
  authGuard,
  financeGuard,
  managerGuard,
} from "./core/guards/auth.guard";
import { superAdminGuard, superAdminPermissionGuard } from "./core/guards/super-admin.guard";
import { nonSuperAdminGuard } from "./core/guards/non-super-admin.guard";
import { paidFeatureGuard } from "./core/guards/paid-feature.guard";
import { SuperAdminLayout } from "./core/components/super-admin-layout/super-admin-layout";

/**
 * Application routes configuration
 * Defines all routes and their authentication requirements
 */
export const routes: Routes = [
  // Default route - authenticated home dashboard
  {
    path: "",
    redirectTo: "/home",
    pathMatch: "full",
  },
  {
    path: "home",
    canActivate: [authGuard, nonSuperAdminGuard], // Super admins use /super-admin instead
    loadComponent: () =>
      import("./features/home/home/home").then((m) => m.Home),
    title: "Home - Expensed",
    data: { breadcrumb: "Home", breadcrumbIcon: "home" },
  },

  // Authentication routes (public)
  {
    path: "auth",
    children: [
      {
        path: "login",
        loadComponent: () =>
          import("./features/auth/login/login.component").then((m) =>
            m.LoginComponent
          ),
        title: "Sign In - Expensed",
      },
      {
        path: "register",
        loadComponent: () =>
          import("./features/auth/register/register.component").then((m) =>
            m.RegisterComponent
          ),
        title: "Create Account - Expensed",
      },
      {
        path: "forgot-password",
        loadComponent: () =>
          import("./features/auth/forgot-password/forgot-password.component")
            .then((m) => m.ForgotPasswordComponent),
        title: "Reset Password - Expensed",
      },
      {
        path: "reset-password",
        loadComponent: () =>
          import("./features/auth/reset-password/reset-password").then((m) =>
            m.ResetPasswordComponent
          ),
        title: "Set New Password - Expensed",
      },
      {
        path: "confirm-email",
        loadComponent: () =>
          import("./features/auth/confirm-email/confirm-email").then((m) =>
            m.ConfirmEmailComponent
          ),
        title: "Confirm Email - Expensed",
      },
      {
        path: "accept-invitation",
        loadComponent: () =>
          import(
            "./features/auth/accept-invitation/accept-invitation.component"
          ).then((m) => m.AcceptInvitationComponent),
        title: "Accept Invitation - Expensed",
      },
      {
        path: "signup",
        loadComponent: () =>
          import("./features/auth/signup-with-plan/signup-with-plan.component").then(
            (m) => m.SignupWithPlanComponent
          ),
        title: "Sign Up - Expensed",
      },
      {
        path: "select-plan",
        loadComponent: () =>
          import("./features/auth/plan-selection/plan-selection.component").then(
            (m) => m.PlanSelectionComponent
          ),
        title: "Choose Your Plan - Expensed",
      },
      {
        path: "callback",
        loadComponent: () =>
          import("./features/auth/auth-callback/auth-callback").then(
            (m) => m.AuthCallbackComponent
          ),
        title: "Verifying... - Expensed",
      },
      {
        path: "",
        redirectTo: "login",
        pathMatch: "full",
      },
    ],
  },

  // Admin hub route (organization admin, not super admin)
  {
    path: "admin",
    canActivate: [authGuard, adminGuard, nonSuperAdminGuard],
    loadComponent: () =>
      import("./features/organization/admin-hub/admin-hub.component")
        .then((m) => m.AdminHubComponent),
    title: "Admin - Expensed",
    data: { breadcrumb: "Admin", breadcrumbIcon: "admin_panel_settings" },
  },

  // Public pricing page
  {
    path: "pricing",
    loadComponent: () =>
      import("./features/pricing/pricing-page.component").then(
        (m) => m.PricingPageComponent
      ),
    title: "Pricing - Expensed",
  },

  // Organization routes (customer organizations, not for super admins)
  {
    path: "organization",
    canActivate: [authGuard, nonSuperAdminGuard],
    data: { breadcrumb: "Organization", breadcrumbIcon: "business" },
    children: [
      {
        path: "setup",
        loadComponent: () =>
          import("./features/organization/setup/organization-setup.component")
            .then((m) => m.OrganizationSetupComponent),
        title: "Organization Setup - Expensed",
        data: { breadcrumb: "Setup" },
      },
      {
        path: "settings",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/company-settings/company-settings.component"
          ).then((m) => m.CompanySettingsComponent),
        title: "Company Settings - Expensed",
        data: { breadcrumb: "Company Settings" },
      },
      {
        path: "users",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/user-management/user-management.component"
          ).then((m) => m.UserManagementComponent),
        title: "User Management - Expensed",
        data: { breadcrumb: "User Management" },
      },
      {
        path: "mileage-settings",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/mileage-settings/mileage-settings.component"
          ).then((m) => m.MileageSettingsComponent),
        title: "Mileage Settings - Expensed",
        data: { breadcrumb: "Mileage Settings" },
      },
      {
        path: "budgets",
        canActivate: [financeGuard],
        loadComponent: () =>
          import(
            "./features/organization/budget-management/budget-management.component"
          ).then((m) => m.BudgetManagementComponent),
        title: "Budget Management - Expensed",
        data: { breadcrumb: "Budgets" },
      },
      {
        path: "gl-codes",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/gl-code-settings/gl-code-settings.component"
          ).then((m) => m.GlCodeSettingsComponent),
        title: "GL Code Mappings - Expensed",
        data: { breadcrumb: "GL Codes" },
      },
      {
        path: "payouts",
        canActivate: [adminGuard, paidFeatureGuard('stripe_payouts')],
        loadComponent: () =>
          import(
            "./features/organization/payout-settings/payout-settings.component"
          ).then((m) => m.PayoutSettingsComponent),
        title: "Payout Settings - Expensed",
        data: { breadcrumb: "Payout Settings" },
      },
      {
        path: "policies",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/policy-settings/policy-settings.component"
          ).then((m) => m.PolicySettingsComponent),
        title: "Expense Policies - Expensed",
        data: { breadcrumb: "Expense Policies" },
      },
      {
        path: "delegation",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/delegation-settings/delegation-settings.component"
          ).then((m) => m.DelegationSettingsComponent),
        title: "Delegation Settings - Expensed",
        data: { breadcrumb: "Delegation" },
      },
      {
        path: "currency",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/currency-settings/currency-settings.component"
          ).then((m) => m.CurrencySettingsComponent),
        title: "Currency Settings - Expensed",
        data: { breadcrumb: "Currency" },
      },
      {
        path: "per-diem",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/per-diem-settings/per-diem-settings.component"
          ).then((m) => m.PerDiemSettingsComponent),
        title: "Per Diem Settings - Expensed",
        data: { breadcrumb: "Per Diem" },
      },
      {
        path: "tax",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/tax-settings/tax-settings.component"
          ).then((m) => m.TaxSettingsComponent),
        title: "Tax & VAT Settings - Expensed",
        data: { breadcrumb: "Tax & VAT" },
      },
      {
        path: "vendors",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/vendor-management/vendor-management.component"
          ).then((m) => m.VendorManagementComponent),
        title: "Vendor Management - Expensed",
        data: { breadcrumb: "Vendors" },
      },
      {
        path: "email-expense",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/email-expense-settings/email-expense-settings.component"
          ).then((m) => m.EmailExpenseSettingsComponent),
        title: "Email-to-Expense - Expensed",
        data: { breadcrumb: "Email-to-Expense" },
      },
      {
        path: "billing",
        canActivate: [adminGuard],
        data: { breadcrumb: "Billing" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/billing/billing-overview/billing-overview.component").then(
                (m) => m.BillingOverviewComponent
              ),
            title: "Billing - Expensed",
          },
          {
            path: "plans",
            loadComponent: () =>
              import("./features/billing/plan-selector/plan-selector.component").then(
                (m) => m.PlanSelectorComponent
              ),
            title: "Change Plan - Expensed",
            data: { breadcrumb: "Change Plan" },
          },
          {
            path: "invoices",
            loadComponent: () =>
              import("./features/billing/invoice-history/invoice-history.component").then(
                (m) => m.InvoiceHistoryComponent
              ),
            title: "Invoices - Expensed",
            data: { breadcrumb: "Invoices" },
          },
          {
            path: "payment",
            loadComponent: () =>
              import("./features/billing/payment-method/payment-method.component").then(
                (m) => m.PaymentMethodComponent
              ),
            title: "Payment Method - Expensed",
            data: { breadcrumb: "Payment" },
          },
        ],
      },
    ],
  },

  // Protected routes - require authentication (not for super admins)
  {
    path: "expenses",
    canActivate: [authGuard, nonSuperAdminGuard],
    data: { breadcrumb: "Expenses", breadcrumbIcon: "receipt_long" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/expenses/expense-list/expense-list").then((m) =>
            m.ExpenseList
          ),
        title: "My Expenses - Expensed",
      },
      {
        path: "upload",
        redirectTo: "/receipts",
        pathMatch: "full",
      },
      {
        path: "new",
        loadComponent: () =>
          import("./features/expenses/expense-form/expense-form").then((m) =>
            m.ExpenseFormComponent
          ),
        title: "New Expense - Expensed",
        data: { breadcrumb: "New Expense" },
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/expenses/expense-detail/expense-detail").then(
            (m) => m.ExpenseDetailComponent,
          ),
        title: "Expense Details - Expensed",
        data: { breadcrumb: "Details" },
      },
      {
        path: ":id/edit",
        loadComponent: () =>
          import("./features/expenses/expense-edit/expense-edit").then((m) =>
            m.ExpenseEditComponent
          ),
        title: "Edit Expense - Expensed",
        data: { breadcrumb: "Edit" },
      },
    ],
  },

  // Approvals routes - managers and above can approve (not for super admins)
  {
    path: "approvals",
    canActivate: [authGuard, managerGuard, nonSuperAdminGuard],
    data: { breadcrumb: "Approvals", breadcrumbIcon: "task_alt" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/approvals/approval-queue/approval-queue").then((m) =>
            m.ApprovalQueue
          ),
        title: "Approval Queue - Expensed",
      },
      {
        path: "settings",
        canActivate: [adminGuard, paidFeatureGuard('multi_level_approval')],
        loadComponent: () =>
          import("./features/approvals/approval-settings/approval-settings").then((m) =>
            m.ApprovalSettings
          ),
        title: "Approval Settings - Expensed",
        data: { breadcrumb: "Settings" },
      },
    ],
  },

  // Reports routes - group expenses into reports (not for super admins)
  {
    path: "reports",
    canActivate: [authGuard, nonSuperAdminGuard],
    data: { breadcrumb: "Reports", breadcrumbIcon: "folder_open" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/reports/report-list/report-list").then((m) =>
            m.ReportListComponent
          ),
        title: "Expense Reports - Expensed",
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/reports/report-detail/report-detail").then((m) =>
            m.ReportDetailComponent
          ),
        title: "Report Details - Expensed",
        data: { breadcrumb: "Details" },
      },
    ],
  },

  {
    path: "receipts",
    canActivate: [authGuard, nonSuperAdminGuard],
    loadComponent: () =>
      import("./features/expenses/receipt-list/receipt-list").then((m) =>
        m.ReceiptList
      ),
    title: "Receipts - Expensed",
    data: { breadcrumb: "Receipts", breadcrumbIcon: "receipt" },
  },
  {
    path: "mileage",
    canActivate: [authGuard, nonSuperAdminGuard, paidFeatureGuard('mileage_gps')],
    data: { breadcrumb: "Mileage", breadcrumbIcon: "directions_car" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/mileage/trip-list/trip-list").then((m) =>
            m.TripList
          ),
        title: "Mileage Trips - Expensed",
      },
      {
        path: "new",
        loadComponent: () =>
          import("./features/mileage/trip-form/trip-form").then((m) =>
            m.TripForm
          ),
        title: "New Mileage Trip - Expensed",
        data: { breadcrumb: "New Trip" },
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/mileage/trip-detail/trip-detail").then((m) =>
            m.TripDetailComponent
          ),
        title: "Trip Details - Expensed",
        data: { breadcrumb: "Details" },
      },
      {
        path: ":id/edit",
        loadComponent: () =>
          import("./features/mileage/trip-form/trip-form").then((m) =>
            m.TripForm
          ),
        title: "Edit Mileage Trip - Expensed",
        data: { breadcrumb: "Edit" },
      },
    ],
  },

  // Profile routes - user settings and bank accounts (not for super admins)
  {
    path: "profile",
    canActivate: [authGuard, nonSuperAdminGuard],
    data: { breadcrumb: "Profile", breadcrumbIcon: "person" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/profile/profile-settings/profile-settings.component").then(
            (m) => m.ProfileSettingsComponent
          ),
        title: "Profile Settings - Expensed",
      },
      {
        path: "notifications",
        loadComponent: () =>
          import("./features/profile/notification-preferences/notification-preferences.component").then(
            (m) => m.NotificationPreferencesComponent
          ),
        title: "Notification Preferences - Expensed",
        data: { breadcrumb: "Notifications" },
      },
      {
        path: "bank-accounts",
        loadComponent: () =>
          import("./features/profile/bank-accounts/bank-accounts.component").then(
            (m) => m.BankAccountsComponent
          ),
        title: "Bank Accounts - Expensed",
        data: { breadcrumb: "Bank Accounts" },
      },
    ],
  },

  // Finance routes (organization finance, not for super admins)
  {
    path: "finance",
    canActivate: [authGuard, financeGuard, nonSuperAdminGuard],
    data: { breadcrumb: "Finance", breadcrumbIcon: "account_balance" },
    children: [
      {
        path: "",
        redirectTo: "dashboard",
        pathMatch: "full",
      },
      {
        path: "dashboard",
        loadComponent: () =>
          import("./features/finance/dashboard/dashboard").then((m) =>
            m.FinanceDashboardComponent
          ),
        title: "Finance Dashboard - Expensed",
      },
      {
        path: "analytics",
        redirectTo: "dashboard",
        pathMatch: "full",
      },
    ],
  },

  // Super Admin routes (platform-level management)
  // Uses separate layout shell - super admins have completely different UI
  {
    path: "super-admin",
    component: SuperAdminLayout,
    canActivate: [authGuard, superAdminGuard],
    data: { breadcrumb: "Super Admin", breadcrumbIcon: "admin_panel_settings" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/super-admin/dashboard/super-admin-dashboard.component").then(
            (m) => m.SuperAdminDashboardComponent
          ),
        title: "Super Admin - Expensed",
      },
      {
        path: "organizations",
        canActivate: [superAdminPermissionGuard('view_organizations')],
        data: { breadcrumb: "Organizations" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/super-admin/organizations/organization-list.component").then(
                (m) => m.OrganizationListComponent
              ),
            title: "All Organizations - Expensed",
          },
          {
            path: ":id",
            loadComponent: () =>
              import("./features/super-admin/organizations/organization-detail.component").then(
                (m) => m.OrganizationDetailComponent
              ),
            title: "Organization Details - Expensed",
            data: { breadcrumb: "Details" },
          },
        ],
      },
      {
        path: "coupons",
        canActivate: [superAdminPermissionGuard('create_coupons')],
        data: { breadcrumb: "Coupons" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/super-admin/coupons/coupon-list.component").then(
                (m) => m.CouponListComponent
              ),
            title: "Coupon Codes - Expensed",
          },
          {
            path: "new",
            loadComponent: () =>
              import("./features/super-admin/coupons/coupon-form.component").then(
                (m) => m.CouponFormComponent
              ),
            title: "Create Coupon - Expensed",
            data: { breadcrumb: "New" },
          },
        ],
      },
      {
        path: "analytics",
        canActivate: [superAdminPermissionGuard('view_analytics')],
        loadComponent: () =>
          import("./features/super-admin/analytics/revenue-analytics.component").then(
            (m) => m.RevenueAnalyticsComponent
          ),
        title: "Revenue Analytics - Expensed",
        data: { breadcrumb: "Analytics" },
      },
      {
        path: "audit-log",
        canActivate: [superAdminPermissionGuard('view_organizations')],
        loadComponent: () =>
          import("./features/super-admin/audit-log/audit-log.component").then(
            (m) => m.AuditLogComponent
          ),
        title: "Audit Log - Expensed",
        data: { breadcrumb: "Audit Log" },
      },
      // Platform management routes
      {
        path: "settings",
        loadComponent: () =>
          import("./features/super-admin/settings/system-settings.component").then(
            (m) => m.SystemSettingsComponent
          ),
        title: "System Settings - Expensed",
        data: { breadcrumb: "Settings" },
      },
      {
        path: "announcements",
        data: { breadcrumb: "Announcements" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/super-admin/announcements/announcement-list.component").then(
                (m) => m.AnnouncementListComponent
              ),
            title: "Announcements - Expensed",
          },
          {
            path: "new",
            loadComponent: () =>
              import("./features/super-admin/announcements/announcement-form.component").then(
                (m) => m.AnnouncementFormComponent
              ),
            title: "New Announcement - Expensed",
            data: { breadcrumb: "New" },
          },
          {
            path: ":id/edit",
            loadComponent: () =>
              import("./features/super-admin/announcements/announcement-form.component").then(
                (m) => m.AnnouncementFormComponent
              ),
            title: "Edit Announcement - Expensed",
            data: { breadcrumb: "Edit" },
          },
        ],
      },
      {
        path: "email-templates",
        data: { breadcrumb: "Email Templates" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/super-admin/email-templates/email-template-list.component").then(
                (m) => m.EmailTemplateListComponent
              ),
            title: "Email Templates - Expensed",
          },
          {
            path: ":name",
            loadComponent: () =>
              import("./features/super-admin/email-templates/email-template-editor.component").then(
                (m) => m.EmailTemplateEditorComponent
              ),
            title: "Edit Template - Expensed",
            data: { breadcrumb: "Edit" },
          },
        ],
      },
      {
        path: "plans",
        data: { breadcrumb: "Plans" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/super-admin/plan-management/plan-list.component").then(
                (m) => m.PlanListComponent
              ),
            title: "Manage Plans - Expensed",
          },
          {
            path: ":id",
            loadComponent: () =>
              import("./features/super-admin/plan-management/plan-editor.component").then(
                (m) => m.PlanEditorComponent
              ),
            title: "Edit Plan - Expensed",
            data: { breadcrumb: "Edit" },
          },
        ],
      },
      // Operations routes
      {
        path: "impersonation",
        data: { breadcrumb: "Impersonation" },
        children: [
          {
            path: "",
            loadComponent: () =>
              import("./features/super-admin/impersonation/impersonation-history.component").then(
                (m) => m.ImpersonationHistoryComponent
              ),
            title: "Impersonation History - Expensed",
          },
          {
            path: "start",
            loadComponent: () =>
              import("./features/super-admin/impersonation/user-search.component").then(
                (m) => m.UserSearchComponent
              ),
            title: "Impersonate User - Expensed",
            data: { breadcrumb: "Start" },
          },
        ],
      },
      {
        path: "bulk-actions",
        loadComponent: () =>
          import("./features/super-admin/bulk-actions/bulk-operations.component").then(
            (m) => m.BulkOperationsComponent
          ),
        title: "Bulk Actions - Expensed",
        data: { breadcrumb: "Bulk Actions" },
      },
      {
        path: "invoices",
        loadComponent: () =>
          import("./features/super-admin/invoices/invoice-management.component").then(
            (m) => m.InvoiceManagementComponent
          ),
        title: "Invoice Management - Expensed",
        data: { breadcrumb: "Invoices" },
      },
      {
        path: "api-keys",
        loadComponent: () =>
          import("./features/super-admin/api-keys/api-key-list.component").then(
            (m) => m.ApiKeyListComponent
          ),
        title: "API Keys - Expensed",
        data: { breadcrumb: "API Keys" },
      },
      // System routes
      {
        path: "errors",
        loadComponent: () =>
          import("./features/super-admin/error-logs/error-log-list.component").then(
            (m) => m.ErrorLogListComponent
          ),
        title: "Error Logs - Expensed",
        data: { breadcrumb: "Error Logs" },
      },
      {
        path: "integrations",
        loadComponent: () =>
          import("./features/super-admin/integrations/integration-health.component").then(
            (m) => m.IntegrationHealthComponent
          ),
        title: "Integration Health - Expensed",
        data: { breadcrumb: "Integrations" },
      },
      {
        path: "scheduled-tasks",
        loadComponent: () =>
          import("./features/super-admin/scheduled-tasks/task-list.component").then(
            (m) => m.TaskListComponent
          ),
        title: "Scheduled Tasks - Expensed",
        data: { breadcrumb: "Scheduled Tasks" },
      },
      {
        path: "data-export",
        loadComponent: () =>
          import("./features/super-admin/data-export/data-export.component").then(
            (m) => m.DataExportComponent
          ),
        title: "Data Export - Expensed",
        data: { breadcrumb: "Data Export" },
      },
    ],
  },

  // Wildcard route - redirect to login
  {
    path: "**",
    redirectTo: "/auth/login",
  },
];
