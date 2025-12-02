/**
 * Policy scope types - determines what level the policy applies to
 */
export type PolicyScopeType = 'organization' | 'department' | 'role' | 'user' | 'category';

/**
 * Expense policy rule configuration
 * Supports per-category, per-user, per-role, and per-department limits
 */
export interface ExpensePolicy {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;
  /** Human-readable policy name */
  name: string;
  /** Description of what this policy does */
  description?: string;

  // Scope configuration
  /** What level this policy applies to */
  scope_type: PolicyScopeType;
  /** Value for the scope (user_id, role name, department name, etc.) */
  scope_value?: string;
  /** Category this policy applies to (null = all categories) */
  category?: string;

  // Limits
  /** Maximum amount per single expense */
  max_amount?: number;
  /** Maximum total per day */
  max_daily_total?: number;
  /** Maximum total per month */
  max_monthly_total?: number;
  /** Maximum age of receipt in days */
  max_receipt_age_days: number;

  // Requirements
  /** Whether receipt is required */
  require_receipt: boolean;
  /** Whether description/notes are required */
  require_description: boolean;
  /** Whether weekend expenses are allowed */
  allow_weekends: boolean;

  // Approval thresholds
  /** Auto-approve expenses under this amount */
  auto_approve_under?: number;
  /** Require approval for expenses over this amount */
  require_approval_over?: number;

  // Priority (higher = more specific, wins conflicts)
  /** Priority for conflict resolution (0-1000) */
  priority: number;
  /** Whether policy is active */
  is_active: boolean;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * Policy preset template for quick setup
 */
export interface PolicyPreset {
  /** UUID primary key */
  id: string;
  /** Preset name */
  name: string;
  /** Type of preset */
  preset_type: 'category_limit' | 'tier' | 'template';
  /** Configuration JSON */
  config: PolicyPresetConfig;
  /** Whether this is a default/built-in preset */
  is_default: boolean;
  /** Description of the preset */
  description?: string;
  created_at: string;
}

/**
 * Configuration for policy presets
 */
export interface PolicyPresetConfig {
  /** Category-specific limits */
  categories?: Record<string, CategoryLimits>;
  /** Role-based tiers */
  tiers?: Record<string, TierLimits>;
  /** Base policy settings */
  base?: Partial<ExpensePolicy>;
}

/**
 * Category-specific spending limits
 */
export interface CategoryLimits {
  max_amount?: number;
  max_daily_total?: number;
  max_monthly_total?: number;
  require_receipt?: boolean;
}

/**
 * Role-based tier limits
 */
export interface TierLimits {
  max_amount?: number;
  max_daily_total?: number;
  max_monthly_total?: number;
  auto_approve_under?: number;
}

/**
 * Effective policy for a specific user/category combination
 * Returned by get_effective_policy() database function
 */
export interface EffectivePolicy {
  max_amount?: number;
  max_daily_total?: number;
  max_monthly_total?: number;
  max_receipt_age_days: number;
  require_receipt: boolean;
  require_description: boolean;
  allow_weekends: boolean;
  auto_approve_under?: number;
  require_approval_over?: number;
  applied_policies: string[];
}

/**
 * DTO for creating a new policy
 */
export interface CreatePolicyDto {
  name: string;
  description?: string;
  scope_type: PolicyScopeType;
  scope_value?: string;
  category?: string;
  max_amount?: number;
  max_daily_total?: number;
  max_monthly_total?: number;
  max_receipt_age_days?: number;
  require_receipt?: boolean;
  require_description?: boolean;
  allow_weekends?: boolean;
  auto_approve_under?: number;
  require_approval_over?: number;
  priority?: number;
  is_active?: boolean;
}

/**
 * DTO for updating an existing policy
 */
export interface UpdatePolicyDto extends Partial<CreatePolicyDto> {
  id: string;
}

/**
 * Policy validation result from database trigger
 */
export interface PolicyValidationResult {
  is_valid: boolean;
  violations: PolicyViolation[];
  warnings: PolicyWarning[];
}

/**
 * Policy violation (blocks submission)
 */
export interface PolicyViolation {
  rule: string;
  policy_name: string;
  limit?: number;
  actual?: number;
  message: string;
}

/**
 * Policy warning (informational, doesn't block)
 */
export interface PolicyWarning {
  rule: string;
  message: string;
}
