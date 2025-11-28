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
 * Phase 0 focuses on FUEL, others for future phases
 */
export enum ExpenseCategory {
  FUEL = 'Fuel',
  MEALS = 'Meals & Entertainment',
  LODGING = 'Lodging',
  AIRFARE = 'Airfare',
  GROUND_TRANSPORTATION = 'Ground Transportation',
  OFFICE_SUPPLIES = 'Office Supplies',
  SOFTWARE = 'Software/Subscriptions',
  MILEAGE = 'Mileage',
  MISCELLANEOUS = 'Miscellaneous'
}

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
