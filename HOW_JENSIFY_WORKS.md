# How Jensify Works

Jensify is a modern expense and receipt application, similar to tools like Expensify. Employees upload receipts and create expenses; those expenses are grouped into **expense reports** that are submitted for approval; approvers and finance teams approve/reject reports and then mark them as reimbursed.

This document gives a detailed overview of how Jensify works today for each role.

---

## 1. Layout & Navigation

### 1.1 Global Layout

After logging in, users see a consistent three-part layout:

- **Top bar** - Jensify logo on the left, a central area reserved for search, and a right section with notifications, the user name/email, and a Sign Out option.
- **Sidebar navigation** - A collapsible vertical menu on the left: expanded shows icons and text; collapsed shows icons only.
- **Main content area** - The central pane where pages (dashboard, expenses, approvals, finance) are displayed.

### 1.2 Sidebar Navigation

Common navigation entries:

- **Dashboard** - Home dashboard (/home).
- **Upload Receipt** - Receipt upload screen (/expenses/upload).
- **Receipts** - Personal receipt library (/receipts).
- **My Expenses** - User own expenses (/expenses).
- **New Expense** - Create a new expense (/expenses/new).
- **Mileage** - Mileage tracking with GPS (/mileage).
- **Reports** - Expense reports (/reports).
- **Approvals** - Approval queue (/approvals, managers/finance/admin only).
- **Finance Dashboard** - Reimbursement dashboard (/finance/dashboard, finance/admin only).

---

## 2. Roles

### 2.1 Employees

- Upload and manage receipts with automatic OCR extraction.
- Create and track expenses with multiple receipts per expense.
- Log mileage trips with GPS tracking.
- Group expenses into reports for submission.
- See statuses like Draft, Submitted, Approved, Reimbursed, and Rejected.

### 2.2 Managers

- Review and approve expenses for their direct reports.
- Part of the multi-level approval workflow (Manager to Finance to Admin).
- Can approve or reject with comments.

### 2.3 Finance

- Review submitted expenses after manager approval.
- View receipts and mileage logs.
- Approve or reject expenses.
- Mark approved expenses as reimbursed.
- Export detailed CSV reports.

### 2.4 Admins

- Configure approval workflows and organization settings.
- Manage users and roles.
- Access all approval and finance functions.
- Set up amount-based approval thresholds.

---

## 3. Employee Experience

### 3.1 Home Dashboard (/home)

After login, users land on the Home Dashboard with quick actions, metrics, and recent activity.

### 3.2 Uploading Receipts (/expenses/upload)

Upload flow with automatic OCR:

1. Select a file (drag/drop or file picker)
2. File uploaded to Supabase Storage
3. Google Vision API extracts merchant, amount, date, tax
4. Redirects to expense form with auto-filled fields

### 3.3 Creating a New Expense (/expenses/new)

Form fields include:
- Merchant (auto-filled from OCR)
- Amount (auto-filled from OCR)
- Category (Fuel, Meals, Lodging, Airfare, etc.)
- Date (auto-filled from OCR)
- Notes (optional)
- Attached receipts - supports multiple receipts per expense

### 3.4 Expense Reports (/reports)

Expenses are grouped into expense reports (Expensify-style):
- Auto-creates a draft monthly report for each user
- Submit entire report for approval
- Report workflow: Draft to Submitted to Approved to Paid/Reimbursed

### 3.5 Mileage Tracking (/mileage)

Two modes:
- **Quick Entry**: Manual entry with origin, destination, distance
- **GPS Tracking**: Real-time start/stop tracking with live route visualization

Features:
- Google Maps integration for geocoding and routing
- IRS rate calculation (current federal rate)
- Trip history with status tracking

---

## 4. Approver and Finance Experience

### 4.1 Multi-Level Approval Workflow

Configurable multi-level approval workflows:
1. Manager Approval - Direct manager reviews team expenses
2. Finance Approval - Finance team reviews after manager approval
3. Admin Approval - Optional additional approval for high-value expenses

Features:
- Sequential approval steps
- Amount-based thresholds (e.g., expenses over $500 require additional approval)
- Role-based routing
- Complete approval history timeline

### 4.2 Approval Queue (/approvals)

Shows all submitted reports awaiting approval with batch actions.

### 4.3 Finance Dashboard (/finance/dashboard)

Shows all approved expenses ready for reimbursement with CSV export.

---

## 5. Status Lifecycle

- **Draft** - Created by employee; not yet submitted
- **Submitted** - Waiting for approval
- **Approved** - Approved by all required approvers
- **Reimbursed** - Paid out; complete
- **Rejected** - Returned to employee for revision

---

## 6. Key Features Summary

### Completed Features

| Feature | Description |
|---------|-------------|
| OCR and SmartScan | Google Vision API extracts merchant, amount, date, tax from receipts |
| Multi-Receipt Support | Multiple receipts per expense via junction table |
| Multi-Level Approvals | Configurable Manager to Finance to Admin workflow |
| Mileage Tracking | GPS tracking with Google Maps, IRS rate calculation |
| Expense Reports | Expensify-style batch grouping and submission |
| Progressive Web App | Installable on mobile/desktop with offline support |
| Organization Multi-Tenancy | Complete data isolation per organization |

### Future Enhancements

- Global Search - Search expenses and receipts from the top bar
- Advanced Analytics - Spending insights, trend analysis, budget tracking
- Integrations - QuickBooks, accounting software connections
- Corporate Cards - Card transaction import and reconciliation

---

## 7. Summary

Jensify provides a complete expense management lifecycle:

- **Employees** upload receipts (with OCR auto-fill), create expenses, attach multiple receipts, log mileage with GPS, and submit reports for approval.
- **Managers** review and approve team expenses as part of the multi-level workflow.
- **Finance** processes final approvals and marks expenses as reimbursed.
- **Admins** configure workflows, manage users, and oversee the organization.

The platform includes modern features like AI-powered OCR, GPS mileage tracking, PWA offline support, multi-level approvals, and organization multi-tenancy.

---

*Last Updated: November 27, 2024*
