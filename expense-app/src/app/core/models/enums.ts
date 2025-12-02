/**
 * User roles for role-based access control (RBAC)
 * - EMPLOYEE: Standard user, can manage own expenses
 * - MANAGER: Can approve team expenses, view direct reports
 * - FINANCE: Can view and approve all expenses, mark as reimbursed
 * - ADMIN: Full system access, manage organization and users
 */
export enum UserRole {
  EMPLOYEE = 'employee',
  MANAGER = 'manager',
  FINANCE = 'finance',
  ADMIN = 'admin'
}

/**
 * Expense workflow status
 * - DRAFT: Created but not submitted
 * - SUBMITTED: Submitted for review
 * - APPROVED: Approved by manager/finance
 * - REJECTED: Rejected by manager/finance
 * - REIMBURSED: Payment processed
 */
export enum ExpenseStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REIMBURSED = 'reimbursed'
}

/**
 * Expense categories for classification
 * These categories map to GL codes configured at the organization level
 * Finance admins can customize GL code assignments via Organization Settings
 */
export enum ExpenseCategory {
  // Vehicle-related
  AUTO_ALLOWANCE = 'Auto Allowance',
  PARKING = 'Parking',
  TOLLS = 'Tolls',
  AUTO_RENTAL = 'Auto Rental',
  FUEL = 'Fuel',
  MILEAGE = 'Mileage',

  // Travel
  AIRFARE = 'Airfare',
  LODGING = 'Lodging',
  RAIL_BUS = 'Rail/Bus',
  GROUND_TRANSPORTATION = 'Ground Transportation',

  // Meals & Entertainment
  INDIVIDUAL_MEALS = 'Individual Meals',
  BUSINESS_MEALS = 'Business Meals',
  BUSINESS_ENTERTAINMENT = 'Business Entertainment',

  // Office & Operations
  OFFICE_SUPPLIES = 'Office Supplies',
  SOFTWARE = 'Software/Subscriptions',

  // Other
  MISCELLANEOUS = 'Miscellaneous'
}

/**
 * @deprecated Use ExpenseCategory enum values directly
 * Legacy mapping for backward compatibility with old data using 'Meals & Entertainment'
 */
export const LEGACY_CATEGORY_MAPPINGS: Record<string, ExpenseCategory> = {
  'Meals & Entertainment': ExpenseCategory.INDIVIDUAL_MEALS,
  'Meals': ExpenseCategory.INDIVIDUAL_MEALS
};

/**
 * OCR processing status for receipt images
 * - PENDING: Receipt uploaded, waiting for OCR
 * - PROCESSING: OCR in progress
 * - COMPLETED: OCR finished successfully
 * - FAILED: OCR failed or timed out
 */
export enum OcrStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed'
}
