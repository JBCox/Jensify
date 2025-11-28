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
  /** Optional email domain for auto-join (e.g., "covaer.com") */
  domain?: string;
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
