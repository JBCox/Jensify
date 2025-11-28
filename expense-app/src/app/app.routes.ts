import { Routes } from "@angular/router";
import {
  adminGuard,
  authGuard,
  financeGuard,
  managerGuard,
} from "./core/guards/auth.guard";

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
    canActivate: [authGuard], // Temporarily disabled for UI verification
    loadComponent: () =>
      import("./features/home/home/home").then((m) => m.Home),
    title: "Home - Jensify",
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
        title: "Sign In - Jensify",
      },
      {
        path: "register",
        loadComponent: () =>
          import("./features/auth/register/register.component").then((m) =>
            m.RegisterComponent
          ),
        title: "Create Account - Jensify",
      },
      {
        path: "forgot-password",
        loadComponent: () =>
          import("./features/auth/forgot-password/forgot-password.component")
            .then((m) => m.ForgotPasswordComponent),
        title: "Reset Password - Jensify",
      },
      {
        path: "reset-password",
        loadComponent: () =>
          import("./features/auth/reset-password/reset-password").then((m) =>
            m.ResetPasswordComponent
          ),
        title: "Set New Password - Jensify",
      },
      {
        path: "confirm-email",
        loadComponent: () =>
          import("./features/auth/confirm-email/confirm-email").then((m) =>
            m.ConfirmEmailComponent
          ),
        title: "Confirm Email - Jensify",
      },
      {
        path: "accept-invitation",
        loadComponent: () =>
          import(
            "./features/auth/accept-invitation/accept-invitation.component"
          ).then((m) => m.AcceptInvitationComponent),
        title: "Accept Invitation - Jensify",
      },
      {
        path: "",
        redirectTo: "login",
        pathMatch: "full",
      },
    ],
  },

  // Organization routes
  {
    path: "organization",
    canActivate: [authGuard],
    data: { breadcrumb: "Organization", breadcrumbIcon: "business" },
    children: [
      {
        path: "setup",
        loadComponent: () =>
          import("./features/organization/setup/organization-setup.component")
            .then((m) => m.OrganizationSetupComponent),
        title: "Organization Setup - Jensify",
        data: { breadcrumb: "Setup" },
      },
      {
        path: "users",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/user-management/user-management.component"
          ).then((m) => m.UserManagementComponent),
        title: "User Management - Jensify",
        data: { breadcrumb: "User Management" },
      },
      {
        path: "mileage-settings",
        canActivate: [adminGuard],
        loadComponent: () =>
          import(
            "./features/organization/mileage-settings/mileage-settings.component"
          ).then((m) => m.MileageSettingsComponent),
        title: "Mileage Settings - Jensify",
        data: { breadcrumb: "Mileage Settings" },
      },
      {
        path: "budgets",
        canActivate: [financeGuard],
        loadComponent: () =>
          import(
            "./features/organization/budget-management/budget-management.component"
          ).then((m) => m.BudgetManagementComponent),
        title: "Budget Management - Jensify",
        data: { breadcrumb: "Budgets" },
      },
    ],
  },

  // Protected routes - require authentication
  {
    path: "expenses",
    canActivate: [authGuard],
    data: { breadcrumb: "Expenses", breadcrumbIcon: "receipt_long" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/expenses/expense-list/expense-list").then((m) =>
            m.ExpenseList
          ),
        title: "My Expenses - Jensify",
        data: { breadcrumb: "My Expenses" },
      },
      {
        path: "upload",
        loadComponent: () =>
          import("./features/expenses/receipt-upload/receipt-upload").then(
            (m) => m.ReceiptUpload,
          ),
        title: "Upload Receipt - Jensify",
        data: { breadcrumb: "Upload Receipt" },
      },
      {
        path: "new",
        loadComponent: () =>
          import("./features/expenses/expense-form/expense-form").then((m) =>
            m.ExpenseFormComponent
          ),
        title: "New Expense - Jensify",
        data: { breadcrumb: "New Expense" },
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/expenses/expense-detail/expense-detail").then(
            (m) => m.ExpenseDetailComponent,
          ),
        title: "Expense Details - Jensify",
        data: { breadcrumb: "Details" },
      },
      {
        path: ":id/edit",
        loadComponent: () =>
          import("./features/expenses/expense-edit/expense-edit").then((m) =>
            m.ExpenseEditComponent
          ),
        title: "Edit Expense - Jensify",
        data: { breadcrumb: "Edit" },
      },
    ],
  },

  // Approvals routes - managers and above can approve, admins can configure
  {
    path: "approvals",
    canActivate: [authGuard, managerGuard],
    data: { breadcrumb: "Approvals", breadcrumbIcon: "task_alt" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/approvals/approval-queue/approval-queue").then((m) =>
            m.ApprovalQueue
          ),
        title: "Approval Queue - Jensify",
        data: { breadcrumb: "Queue" },
      },
      {
        path: "settings",
        canActivate: [adminGuard],
        loadComponent: () =>
          import("./features/approvals/approval-settings/approval-settings").then((m) =>
            m.ApprovalSettings
          ),
        title: "Approval Settings - Jensify",
        data: { breadcrumb: "Settings" },
      },
    ],
  },

  // Reports routes - group expenses into reports for batch submission
  {
    path: "reports",
    canActivate: [authGuard],
    data: { breadcrumb: "Reports", breadcrumbIcon: "folder_open" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/reports/report-list/report-list").then((m) =>
            m.ReportListComponent
          ),
        title: "Expense Reports - Jensify",
        data: { breadcrumb: "All Reports" },
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/reports/report-detail/report-detail").then((m) =>
            m.ReportDetailComponent
          ),
        title: "Report Details - Jensify",
        data: { breadcrumb: "Details" },
      },
    ],
  },

  {
    path: "receipts",
    canActivate: [authGuard],
    loadComponent: () =>
      import("./features/expenses/receipt-list/receipt-list").then((m) =>
        m.ReceiptList
      ),
    title: "Receipts - Jensify",
    data: { breadcrumb: "Receipts", breadcrumbIcon: "receipt" },
  },
  {
    path: "mileage",
    canActivate: [authGuard],
    data: { breadcrumb: "Mileage", breadcrumbIcon: "directions_car" },
    children: [
      {
        path: "",
        loadComponent: () =>
          import("./features/mileage/trip-list/trip-list").then((m) =>
            m.TripList
          ),
        title: "Mileage Trips - Jensify",
        data: { breadcrumb: "Trips" },
      },
      {
        path: "new",
        loadComponent: () =>
          import("./features/mileage/trip-form/trip-form").then((m) =>
            m.TripForm
          ),
        title: "New Mileage Trip - Jensify",
        data: { breadcrumb: "New Trip" },
      },
      {
        path: ":id",
        loadComponent: () =>
          import("./features/mileage/trip-detail/trip-detail").then((m) =>
            m.TripDetailComponent
          ),
        title: "Trip Details - Jensify",
        data: { breadcrumb: "Details" },
      },
      {
        path: ":id/edit",
        loadComponent: () =>
          import("./features/mileage/trip-form/trip-form").then((m) =>
            m.TripForm
          ),
        title: "Edit Mileage Trip - Jensify",
        data: { breadcrumb: "Edit" },
      },
    ],
  },

  // Finance routes - require finance or admin role
  {
    path: "finance",
    canActivate: [authGuard, financeGuard],
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
        title: "Finance Dashboard - Jensify",
        data: { breadcrumb: "Dashboard", breadcrumbIcon: "dashboard" },
      },
    ],
  },

  // Wildcard route - redirect to login
  {
    path: "**",
    redirectTo: "/auth/login",
  },
];
