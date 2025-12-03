import { UserRole } from './enums';
import { User } from './user.model';

/**
 * Organization model matching the database schema
 * Represents a company/tenant in the multi-tenant system
 */
export interface Organization {
  /** UUID primary key */
  id: string;
  /** Organization name (company name) */
  name: string;
  /** Optional email domain for auto-join (e.g., "corvaer.com") */
  domain?: string;
  /** URL to organization logo in Supabase Storage */
  logo_url?: string;
  /** Primary brand color (hex code, e.g., "#3B82F6") */
  primary_color?: string;
  /** Organization-level settings and policies */
  settings: OrganizationSettings;
  /** Timestamp when organization was created */
  created_at: string;
  /** Timestamp when organization was last updated */
  updated_at: string;
}

/**
 * Mileage settings for organization
 * Controls rate used for mileage reimbursement
 */
export interface MileageSettings {
  /** Whether to use custom rate instead of IRS rate */
  use_custom_rate: boolean;
  /** Custom rate per mile (used when use_custom_rate is true) */
  custom_rate_per_mile: number;
  /** Default mileage category */
  mileage_category: 'business' | 'medical' | 'charity' | 'moving';
}

/**
 * GL Code mapping for a single expense category
 * Finance admins can configure how each category maps to accounting codes
 */
export interface GLCodeMapping {
  /** The GL/accounting code for this category (e.g., "travel", "meals", "entertainment") */
  gl_code: string;
  /** Description or notes about this mapping */
  description?: string;
  /** Whether this category is active/enabled */
  is_active: boolean;
}

/**
 * GL Code mappings for all expense categories
 * Key is the expense category name (e.g., "Fuel", "Parking")
 * Value is the GL code configuration
 */
export type GLCodeMappings = Record<string, GLCodeMapping>;

/**
 * Default GL code mappings
 * Used when initializing new organizations
 */
export const DEFAULT_GL_CODE_MAPPINGS: GLCodeMappings = {
  'Auto Allowance': { gl_code: 'auto allowance', description: 'Vehicle allowance/stipend', is_active: true },
  'Parking': { gl_code: 'travel', description: 'Parking fees', is_active: true },
  'Tolls': { gl_code: 'travel', description: 'Toll charges', is_active: true },
  'Auto Rental': { gl_code: 'travel', description: 'Car rental expenses', is_active: true },
  'Fuel': { gl_code: 'travel', description: 'Gas/fuel purchases', is_active: true },
  'Airfare': { gl_code: 'travel', description: 'Flight tickets', is_active: true },
  'Lodging': { gl_code: 'travel', description: 'Hotel/accommodation', is_active: true },
  'Rail/Bus': { gl_code: 'travel', description: 'Train and bus fares', is_active: true },
  'Ground Transportation': { gl_code: 'travel', description: 'Taxi, rideshare, etc.', is_active: true },
  'Office Supplies': { gl_code: 'shop/office supplies', description: 'Office supplies and materials', is_active: true },
  'Individual Meals': { gl_code: 'meals', description: 'Solo meals while traveling', is_active: true },
  'Business Meals': { gl_code: 'meals', description: 'Meals with clients/partners (include attendees and purpose)', is_active: true },
  'Business Entertainment': { gl_code: 'entertainment', description: 'Client entertainment (include attendees and purpose)', is_active: true },
  'Software/Subscriptions': { gl_code: 'software', description: 'Software licenses and subscriptions', is_active: true },
  'Mileage': { gl_code: 'travel', description: 'Personal vehicle mileage reimbursement', is_active: true },
  'Miscellaneous': { gl_code: 'miscellaneous', description: 'Other uncategorized expenses', is_active: true }
};

/**
 * Organization settings and policies
 * Stored as JSONB in database
 */
export interface OrganizationSettings {
  /** Expense policy configuration */
  expense_policies: {
    /** Maximum amount for a single receipt */
    max_single_receipt: number;
    /** Maximum total expenses per day per employee */
    max_daily_total: number;
    /** Maximum age of expense in days */
    max_receipt_age_days: number;
  };
  /** Approval workflow configuration */
  approval_workflow: {
    /** Whether manager approval is required */
    require_manager_approval: boolean;
    /** Whether finance approval is required */
    require_finance_approval: boolean;
  };
  /** Mileage reimbursement settings */
  mileage_settings?: MileageSettings;
  /** GL code mappings for expense categories (Finance admin configurable) */
  gl_code_mappings?: GLCodeMappings;
}

/**
 * Organization member model (user-organization relationship)
 * Represents a user's membership in an organization with role
 */
export interface OrganizationMember {
  /** UUID primary key */
  id: string;
  /** Organization ID */
  organization_id: string;
  /** User ID */
  user_id: string;
  /** User role within this organization */
  role: UserRole;
  /** Manager ID within organization (for approval hierarchy) */
  manager_id?: string;
  /** Department name */
  department?: string;
  /** Whether membership is active */
  is_active: boolean;
  /** User ID who invited this member */
  invited_by?: string;
  /**
   * Whether this user can manage expenses (act as a manager for approvals)
   * Allows finance users to be assigned as managers for employees
   */
  can_manage_expenses?: boolean;
  /**
   * Whether this user can access the Finance Dashboard
   * Allows managers to process payouts and view finance data
   */
  can_access_finance?: boolean;
  /**
   * User's preferred default currency (ISO 4217 code, e.g., 'USD', 'EUR')
   * Used for expense entry and display
   */
  default_currency?: string;
  /** Timestamp when member joined organization */
  joined_at: string;
  /** Timestamp when membership was created */
  created_at: string;
  /** Timestamp when membership was last updated */
  updated_at: string;

  // Relations (populated by query)
  /** User object (populated) */
  user?: User;
  /** Manager object (populated) */
  manager?: OrganizationMember;
  /** Organization object (populated) */
  organization?: Organization;
}

/**
 * Invitation model
 * Represents a pending invitation to join an organization
 */
export interface Invitation {
  /** UUID primary key */
  id: string;
  /** Organization ID */
  organization_id: string;
  /** Email address of invitee */
  email: string;
  /** Role to assign when invitation is accepted */
  role: UserRole;
  /** Manager ID to assign when invitation is accepted */
  manager_id?: string;
  /** Department to assign when invitation is accepted */
  department?: string;
  /** Unique invitation token */
  token: string;
  /** Expiration date */
  expires_at: string;
  /** Invitation status */
  status: InvitationStatus;
  /** User ID who sent the invitation */
  invited_by: string;
  /** User ID who accepted the invitation */
  accepted_by?: string;
  /** Timestamp when invitation was accepted */
  accepted_at?: string;
  /** Timestamp when invitation was created */
  created_at: string;

  // Relations (populated by query)
  /** Organization object (populated) */
  organization?: Organization;
  /** User who sent invitation (populated) */
  inviter?: User;
}

/**
 * Invitation status enum
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * DTO for creating a new organization
 */
export interface CreateOrganizationDto {
  /** Organization name */
  name: string;
  /** Optional email domain */
  domain?: string;
  /** Optional settings override */
  settings?: Partial<OrganizationSettings>;
}

/**
 * DTO for updating an organization
 */
export interface UpdateOrganizationDto {
  /** Organization name */
  name?: string;
  /** Email domain */
  domain?: string;
  /** URL to organization logo */
  logo_url?: string;
  /** Primary brand color (hex code) */
  primary_color?: string;
  /** Organization settings */
  settings?: Partial<OrganizationSettings>;
}

/**
 * DTO for creating an invitation
 */
export interface CreateInvitationDto {
  /** Email address to invite */
  email: string;
  /** Role to assign */
  role: UserRole;
  /** Optional manager assignment */
  manager_id?: string;
  /** Optional department */
  department?: string;
}

/**
 * DTO for bulk invitation via CSV
 */
export interface BulkInvitationDto {
  /** Array of invitations */
  invitations: CreateInvitationDto[];
}

/**
 * DTO for accepting an invitation
 */
export interface AcceptInvitationDto {
  /** Invitation token */
  token: string;
  /** User's full name (for new users) */
  full_name?: string;
  /** Password (for new users) */
  password?: string;
}

/**
 * DTO for updating organization member
 */
export interface UpdateOrganizationMemberDto {
  /** Role change */
  role?: UserRole;
  /** Manager assignment change */
  manager_id?: string | null;
  /** Department change */
  department?: string;
  /** Active status change */
  is_active?: boolean;
  /** Grant manager rights (for finance users to act as managers) */
  can_manage_expenses?: boolean;
  /** Grant finance dashboard access (for managers to process payouts) */
  can_access_finance?: boolean;
  /** User's preferred default currency (ISO 4217 code, e.g., 'USD', 'EUR') */
  default_currency?: string;
}

/**
 * Organization with member counts
 * Used for dashboard display
 */
export interface OrganizationWithStats extends Organization {
  /** Total number of members */
  member_count: number;
  /** Number of active members */
  active_member_count: number;
  /** Number of pending invitations */
  pending_invitation_count: number;
}

/**
 * User's organization context
 * Contains all organizations a user belongs to with their roles
 */
export interface UserOrganizationContext {
  /** User ID */
  user_id: string;
  /** Current/active organization */
  current_organization: Organization;
  /** User's membership in current organization */
  current_membership: OrganizationMember;
  /** All organizations user belongs to */
  organizations: Organization[];
  /** All memberships */
  memberships: OrganizationMember[];
}
