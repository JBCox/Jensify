/**
 * GL Code (General Ledger Code) model
 * Represents an accounting code that expense categories can be mapped to
 */
export interface GLCode {
  /** UUID primary key */
  id: string;
  /** Organization this GL code belongs to */
  organization_id: string;
  /** The GL account code (e.g., "6100", "TRAVEL") */
  code: string;
  /** Human-readable name for the GL code */
  name: string;
  /** Optional longer description */
  description?: string;
  /** Whether this GL code is active */
  is_active: boolean;
  /** User who created this GL code */
  created_by?: string;
  /** Timestamp when created */
  created_at: string;
  /** Timestamp when last updated */
  updated_at: string;
}

/**
 * DTO for creating a new GL code
 */
export interface CreateGLCodeDto {
  /** The GL account code */
  code: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
}

/**
 * DTO for updating a GL code
 */
export interface UpdateGLCodeDto {
  /** The GL account code */
  code?: string;
  /** Human-readable name */
  name?: string;
  /** Optional description */
  description?: string;
  /** Whether this GL code is active */
  is_active?: boolean;
}

/**
 * Custom Expense Category model
 * Represents an expense category that can be created/configured by admins
 */
export interface CustomExpenseCategory {
  /** UUID primary key */
  id: string;
  /** Organization this category belongs to */
  organization_id: string;
  /** Category name (e.g., "Fuel", "Business Meals") */
  name: string;
  /** Help text for employees */
  description?: string;
  /** The GL code this category maps to */
  gl_code_id?: string;
  /** Whether this category is active */
  is_active: boolean;
  /** Whether receipt is required for this category */
  requires_receipt: boolean;
  /** Whether description is required (e.g., for Business Meals) */
  requires_description: boolean;
  /** Optional per-category spending limit */
  max_amount?: number;
  /** Material icon name */
  icon: string;
  /** Hex color for UI */
  color: string;
  /** Sort order in dropdowns */
  display_order: number;
  /** User who created this category */
  created_by?: string;
  /** Timestamp when created */
  created_at: string;
  /** Timestamp when last updated */
  updated_at: string;

  // Joined fields (from expense_categories_with_gl view)
  /** GL code string (joined) */
  gl_code?: string;
  /** GL code name (joined) */
  gl_code_name?: string;
  /** GL code description (joined) */
  gl_code_description?: string;
}

/**
 * DTO for creating a new expense category
 */
export interface CreateExpenseCategoryDto {
  /** Category name */
  name: string;
  /** Help text for employees */
  description?: string;
  /** GL code ID to map to */
  gl_code_id?: string;
  /** Whether receipt is required */
  requires_receipt?: boolean;
  /** Whether description is required */
  requires_description?: boolean;
  /** Per-category spending limit */
  max_amount?: number;
  /** Material icon name */
  icon?: string;
  /** Hex color for UI */
  color?: string;
  /** Sort order */
  display_order?: number;
}

/**
 * DTO for updating an expense category
 */
export interface UpdateExpenseCategoryDto {
  /** Category name */
  name?: string;
  /** Help text for employees */
  description?: string;
  /** GL code ID to map to */
  gl_code_id?: string | null;
  /** Whether this category is active */
  is_active?: boolean;
  /** Whether receipt is required */
  requires_receipt?: boolean;
  /** Whether description is required */
  requires_description?: boolean;
  /** Per-category spending limit */
  max_amount?: number | null;
  /** Material icon name */
  icon?: string;
  /** Hex color for UI */
  color?: string;
  /** Sort order */
  display_order?: number;
}

/**
 * Category with GL code info for display
 */
export interface CategoryWithGLCode extends CustomExpenseCategory {
  /** The full GL code object (populated) */
  gl_code_obj?: GLCode;
}
