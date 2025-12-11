/**
 * Subscription models for SaaS billing system
 * Handles pricing tiers, subscriptions, invoices, and coupons
 */

// ============================================================================
// SUBSCRIPTION PLANS
// ============================================================================

/**
 * Plan features configuration
 * Determines what features are available for each tier
 */
export interface PlanFeatures {
  /** Maximum receipts per month (null = unlimited) */
  receipts_per_month: number | null;
  /** Whether Stripe ACH payouts are enabled */
  stripe_payouts_enabled: boolean;
  /** Whether API access is available */
  api_access_enabled: boolean;
  /** Whether GPS mileage tracking is enabled */
  mileage_gps_enabled: boolean;
  /** Whether multi-level approval workflows are available */
  multi_level_approval: boolean;
  /** Support level: community, email, priority, dedicated */
  support_level: 'community' | 'email' | 'priority' | 'dedicated';
}

/**
 * Subscription plan/tier definition
 * Matches the subscription_plans database table
 */
export interface SubscriptionPlan {
  /** UUID primary key */
  id: string;
  /** Internal plan name (free, starter, team, business, enterprise) */
  name: 'free' | 'starter' | 'team' | 'business' | 'enterprise';
  /** Display name for UI */
  display_name: string;
  /** Plan description */
  description?: string;
  /** Monthly price in cents (e.g., 999 = $9.99) */
  monthly_price_cents: number;
  /** Annual price in cents (e.g., 9590 = $95.90) */
  annual_price_cents: number;
  /** Minimum users for this tier */
  min_users: number;
  /** Maximum users for this tier (null = unlimited) */
  max_users: number | null;
  /** Feature configuration */
  features: PlanFeatures;
  /** Stripe product ID */
  stripe_product_id?: string;
  /** Stripe price ID for monthly billing */
  stripe_monthly_price_id?: string;
  /** Stripe price ID for annual billing */
  stripe_annual_price_id?: string;
  /** Display order in pricing table */
  display_order: number;
  /** Whether plan is publicly visible */
  is_public: boolean;
  /** Whether plan is active */
  is_active: boolean;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;
}

// ============================================================================
// ORGANIZATION SUBSCRIPTIONS
// ============================================================================

/**
 * Subscription status values
 */
export type SubscriptionStatus =
  | 'active'      // Paying or on free plan
  | 'trialing'    // On paid feature trial
  | 'past_due'    // Payment failed, temporary access
  | 'canceled'    // Canceled at period end
  | 'unpaid'      // Payment failed, restricted access
  | 'paused';     // Suspended by admin

/**
 * Billing cycle options
 */
export type BillingCycle = 'monthly' | 'annual';

/**
 * Organization subscription details
 * Matches the organization_subscriptions database table
 */
export interface OrganizationSubscription {
  /** UUID primary key */
  id: string;
  /** Organization ID */
  organization_id: string;
  /** Current plan ID */
  plan_id: string;
  /** Stripe customer ID for billing (cus_xxx) */
  stripe_customer_id?: string;
  /** Stripe subscription ID (sub_xxx) */
  stripe_subscription_id?: string;
  /** Current subscription status */
  status: SubscriptionStatus;
  /** Current billing cycle */
  billing_cycle?: BillingCycle;
  /** Current billing period start */
  current_period_start?: string;
  /** Current billing period end */
  current_period_end?: string;
  /** Trial start date */
  trial_start?: string;
  /** Trial end date */
  trial_end?: string;
  /** When subscription was canceled */
  canceled_at?: string;
  /** Whether subscription cancels at period end */
  cancel_at_period_end: boolean;
  /** Current number of users in organization */
  current_user_count: number;
  /** Receipts uploaded this month */
  current_month_receipts: number;
  /** When usage counters were last reset */
  usage_reset_at?: string;
  /** Custom price override (cents) */
  custom_price_cents?: number;
  /** Discount percentage (0-100) */
  discount_percent?: number;
  /** When discount expires (null = permanent) */
  discount_expires_at?: string;
  /** Reason for discount */
  discount_reason?: string;
  /** Billing contact email */
  billing_email?: string;
  /** Billing contact name */
  billing_name?: string;
  /** Billing company name */
  billing_company?: string;
  /** Creation timestamp */
  created_at: string;
  /** Last update timestamp */
  updated_at: string;

  // Relations (populated by query)
  /** Associated plan details */
  plan?: SubscriptionPlan;
}

/**
 * Subscription with computed fields for display
 */
export interface SubscriptionWithDetails extends OrganizationSubscription {
  /** Plan details */
  plan: SubscriptionPlan;
  /** Effective monthly price after discounts */
  effective_price_cents: number;
  /** Days until subscription expires (for canceled) */
  days_remaining?: number;
  /** Whether at user limit for current plan */
  at_user_limit: boolean;
  /** Whether at receipt limit for current plan */
  at_receipt_limit: boolean;
}

// ============================================================================
// INVOICES
// ============================================================================

/**
 * Invoice status values
 */
export type InvoiceStatus =
  | 'draft'
  | 'open'
  | 'paid'
  | 'void'
  | 'uncollectible'
  | 'refunded'
  | 'partially_refunded'
  | 'pending'
  | 'failed';

/**
 * Invoice line item
 */
export interface InvoiceLineItem {
  /** Line item description */
  description: string;
  /** Amount in cents */
  amount: number;
}

/**
 * Subscription invoice
 * Matches the subscription_invoices database table
 */
export interface SubscriptionInvoice {
  /** UUID primary key */
  id: string;
  /** Organization ID */
  organization_id: string;
  /** Subscription ID */
  subscription_id?: string;
  /** Stripe invoice ID */
  stripe_invoice_id?: string;
  /** Stripe payment intent ID */
  stripe_payment_intent_id?: string;
  /** Stripe charge ID (for refunds) */
  stripe_charge_id?: string;
  /** Total amount in cents */
  amount_cents: number;
  /** Amount paid in cents */
  amount_paid_cents: number;
  /** Amount refunded in cents */
  amount_refunded_cents: number;
  /** Currency code (e.g., 'usd') */
  currency: string;
  /** Invoice status */
  status: InvoiceStatus;
  /** Invoice description */
  description?: string;
  /** Line items */
  line_items?: InvoiceLineItem[];
  /** Invoice date */
  invoice_date: string;
  /** Due date */
  due_date?: string;
  /** When paid */
  paid_at?: string;
  /** URL to hosted invoice page */
  hosted_invoice_url?: string;
  /** URL to invoice PDF */
  invoice_pdf_url?: string;
  /** Creation timestamp */
  created_at: string;
}

// ============================================================================
// COUPONS
// ============================================================================

/**
 * Coupon discount type
 */
export type CouponDiscountType = 'percent' | 'fixed';

/**
 * Coupon duration type
 */
export type CouponDuration = 'once' | 'repeating' | 'forever';

/**
 * Coupon code
 * Matches the coupon_codes database table
 */
export interface CouponCode {
  /** UUID primary key */
  id: string;
  /** Coupon code (e.g., 'WELCOME20') */
  code: string;
  /** Discount type */
  discount_type: CouponDiscountType;
  /** Discount value (percent or cents) */
  discount_value: number;
  /** Which plans this applies to (null = all) */
  applies_to_plans?: string[];
  /** Alias for applies_to_plans */
  applies_to?: string[];
  /** Minimum user count requirement */
  min_users?: number;
  /** Maximum total redemptions (null = unlimited) */
  max_redemptions?: number;
  /** Maximum redemptions per org */
  max_redemptions_per_org: number;
  /** Current redemption count */
  redemption_count: number;
  /** Duration of discount */
  duration: CouponDuration;
  /** Number of months for 'repeating' duration */
  duration_months?: number;
  /** Valid from date */
  valid_from: string;
  /** Valid until date (null = no expiry) */
  valid_until?: string;
  /** Alias: expires_at (same as valid_until) */
  expires_at?: string;
  /** Stripe coupon ID */
  stripe_coupon_id?: string;
  /** Marketing campaign name */
  campaign_name?: string;
  /** Internal notes */
  internal_notes?: string;
  /** Created by user ID */
  created_by?: string;
  /** Whether coupon is active */
  is_active: boolean;
  /** Creation timestamp */
  created_at: string;
}

/**
 * Coupon redemption record
 */
export interface CouponRedemption {
  /** UUID primary key */
  id: string;
  /** Coupon ID */
  coupon_id: string;
  /** Organization ID */
  organization_id: string;
  /** Subscription ID */
  subscription_id?: string;
  /** When redeemed */
  redeemed_at: string;
  /** User who redeemed */
  redeemed_by?: string;
  /** Discount applied in cents */
  discount_applied_cents?: number;
  /** Discount type at redemption */
  discount_type?: CouponDiscountType;
  /** Discount value at redemption */
  discount_value?: number;
  /** Remaining months for repeating coupons */
  remaining_months?: number;

  // Relations
  /** Coupon details */
  coupon?: CouponCode;
}

// ============================================================================
// SUPER ADMIN
// ============================================================================

/**
 * Super admin permissions
 */
export interface SuperAdminPermissions {
  /** Can view organization list and details */
  view_organizations: boolean;
  /** Can manage subscriptions (discounts, plan changes) */
  manage_subscriptions: boolean;
  /** Can issue refunds */
  issue_refunds: boolean;
  /** Can create and manage coupons */
  create_coupons: boolean;
  /** Can view analytics dashboard */
  view_analytics: boolean;
  /** Can manage other super admins */
  manage_super_admins: boolean;
  // New permissions (Phase 1 expansion)
  /** Can manage platform settings */
  manage_settings: boolean;
  /** Can manage platform announcements */
  manage_announcements: boolean;
  /** Can manage email templates */
  manage_email_templates: boolean;
  /** Can impersonate users */
  impersonate_users: boolean;
  /** Can view error logs */
  view_error_logs: boolean;
  /** Can manage subscription plans */
  manage_plans: boolean;
  /** Can manage API keys */
  manage_api_keys: boolean;
  /** Can export platform data */
  export_data: boolean;
  /** Can delete organizations */
  delete_organizations: boolean;
  /** Can perform bulk operations */
  bulk_operations: boolean;
}

/**
 * Super admin user
 */
export interface SuperAdmin {
  /** UUID primary key */
  id: string;
  /** User ID */
  user_id: string;
  /** Display name */
  display_name?: string;
  /** Permission flags */
  permissions: SuperAdminPermissions;
  /** Whether account is active */
  is_active: boolean;
  /** Last login timestamp */
  last_login_at?: string;
  /** Created by user ID */
  created_by?: string;
  /** Creation timestamp */
  created_at: string;
}

/**
 * Organization summary for super admin view
 * NO private expense/receipt data - billing info only
 */
export interface SuperAdminOrganizationSummary {
  /** Organization ID */
  organization_id: string;
  /** Organization name */
  organization_name: string;
  /** When org was created */
  org_created_at: string;
  /** Subscription status */
  subscription_status?: SubscriptionStatus;
  /** Alias for subscription_status */
  status?: SubscriptionStatus;
  /** Billing cycle */
  billing_cycle?: BillingCycle;
  /** Current period end date */
  current_period_end?: string;
  /** Current user count */
  current_user_count: number;
  /** Alias for current_user_count */
  user_count?: number;
  /** Current month receipt count */
  current_month_receipts: number;
  /** Billing email */
  billing_email?: string;
  /** Discount percentage */
  discount_percent?: number;
  /** Discount expiration */
  discount_expires_at?: string;
  /** Plan name */
  plan_name?: string;
  /** Plan display name */
  plan_display_name?: string;
  /** Monthly plan price (cents) */
  monthly_price_cents?: number;
  /** Annual plan price (cents) */
  annual_price_cents?: number;
  /** Effective MRR for this org (cents) */
  effective_mrr_cents?: number;
  /** Alias for effective_mrr_cents */
  mrr_cents?: number;
  /** Active member count */
  active_member_count: number;
  /** Created at timestamp (alias for org_created_at) */
  created_at?: string;
  /** Total lifetime value in cents */
  total_lifetime_value?: number;
}

// ============================================================================
// ANALYTICS
// ============================================================================

/**
 * MRR/Revenue statistics
 */
export interface MrrStats {
  /** Total monthly recurring revenue (cents) */
  total_mrr_cents: number;
  /** Total annual recurring revenue (cents) */
  total_arr_cents: number;
  /** Number of paying customers */
  paying_customer_count: number;
  /** Number of free tier customers */
  free_customer_count: number;
  /** Average revenue per customer (cents) */
  average_revenue_per_customer_cents: number;
}

/**
 * Plan distribution statistics
 */
export interface PlanDistribution {
  /** Plan name */
  plan_name: string;
  /** Plan display name */
  plan_display_name: string;
  /** Number of customers on this plan */
  customer_count: number;
  /** Percentage of total customers */
  percentage: number;
}

/**
 * Subscription audit log entry
 */
export interface SubscriptionAuditLog {
  /** UUID primary key */
  id: string;
  /** Organization ID */
  organization_id?: string;
  /** Organization name (joined from organizations table) */
  organization_name?: string;
  /** Subscription ID */
  subscription_id?: string;
  /** Action type */
  action: string;
  /** Action details */
  action_details: Record<string, unknown>;
  /** Simplified details string */
  details?: string;
  /** Amount in cents (for payment-related actions) */
  amount_cents?: number;
  /** User who performed action */
  performed_by?: string;
  /** Whether performed by super admin */
  is_super_admin: boolean;
  /** Whether automated system action */
  is_system: boolean;
  /** IP address */
  ip_address?: string;
  /** User agent */
  user_agent?: string;
  /** Creation timestamp */
  created_at: string;
}

/**
 * Super admin analytics dashboard data
 */
export interface SuperAdminAnalytics {
  /** MRR statistics */
  mrr: MrrStats;
  /** MRR growth percentage */
  mrr_growth?: number;
  /** Annual Recurring Revenue in cents */
  arr?: number;
  /** Total number of organizations */
  total_organizations: number;
  /** Number of paying organizations */
  paying_organizations: number;
  /** Total number of users across all orgs */
  total_users: number;
  /** Average revenue per organization in cents */
  average_revenue_per_org?: number;
  /** Monthly churn rate percentage */
  churn_rate?: number;
  /** Free to paid conversion rate percentage */
  conversion_rate?: number;
  /** Number of failed payments */
  failed_payments?: number;
  /** Number of pending cancellations */
  pending_cancellations?: number;
  /** Number of active coupons */
  active_coupons?: number;
  /** Total coupon redemptions */
  coupon_redemptions?: number;
  /** Total discounts given in cents */
  total_discounts?: number;
  /** Plan distribution */
  plan_distribution: PlanDistribution[];
  /** Recent audit log entries */
  recent_activity: SubscriptionAuditLog[];
  /** Top coupons by usage */
  top_coupons: CouponCode[];
}

// ============================================================================
// DTOs (Data Transfer Objects)
// ============================================================================

/**
 * DTO for creating a checkout session
 */
export interface CreateCheckoutSessionDto {
  /** Organization ID */
  organization_id: string;
  /** Plan ID to subscribe to */
  plan_id: string;
  /** Billing cycle */
  billing_cycle: BillingCycle;
}

/**
 * Checkout session result
 */
export interface CheckoutSessionResult {
  /** Stripe checkout URL */
  url: string;
  /** Session ID */
  session_id: string;
}

/**
 * DTO for applying a coupon
 */
export interface ApplyCouponDto {
  /** Organization ID */
  organization_id: string;
  /** Coupon code */
  coupon_code: string;
}

/**
 * DTO for super admin discount
 */
export interface ApplyDiscountDto {
  /** Organization ID */
  organization_id: string;
  /** Discount percentage (0-100) */
  discount_percent: number;
  /** Expiration date (null = permanent) - alternative to duration */
  expires_at?: string;
  /** Duration type: 'forever' for permanent, 'months' for limited time */
  duration?: 'forever' | 'months';
  /** Number of months if duration is 'months' */
  duration_months?: number;
  /** Reason for discount */
  reason: string;
}

/**
 * DTO for issuing refund
 */
export interface IssueRefundDto {
  /** Organization ID */
  organization_id?: string;
  /** Invoice ID */
  invoice_id?: string;
  /** Amount to refund in cents (null = full refund) */
  amount_cents?: number;
  /** Reason for refund */
  reason: string;
}

/**
 * DTO for creating a coupon
 */
export interface CreateCouponDto {
  /** Coupon code */
  code: string;
  /** Discount type */
  discount_type: CouponDiscountType;
  /** Discount value */
  discount_value: number;
  /** Duration */
  duration?: CouponDuration;
  /** Duration months (for repeating) */
  duration_months?: number;
  /** Maximum redemptions */
  max_redemptions?: number;
  /** Valid until date */
  valid_until?: string;
  /** Alias: expires_at (same as valid_until) */
  expires_at?: string;
  /** Campaign name */
  campaign_name?: string;
  /** Description */
  description?: string;
  /** Which plans apply */
  applies_to_plans?: string[];
  /** Alias for applies_to_plans */
  applies_to?: string[];
}

/**
 * Usage limits for feature gating
 */
export interface UsageLimits {
  /** Receipt limit for current plan */
  receipt_limit: number | null;
  /** Receipts used this month */
  receipts_used: number;
  /** Remaining receipts (null = unlimited) */
  receipts_remaining: number | null;
  /** User limit for current plan */
  user_limit: number | null;
  /** Current user count */
  users_current: number;
  /** Whether at user limit */
  at_user_limit: boolean;
  /** Whether at receipt limit */
  at_receipt_limit: boolean;
}

/**
 * Feature access check result
 */
export interface FeatureAccessResult {
  /** Whether feature is allowed */
  allowed: boolean;
  /** Reason if not allowed */
  reason?: string;
  /** Upgrade recommendation if not allowed */
  upgrade_to?: string;
}

// ============================================================================
// SUPER ADMIN EXPANSION - PHASE 1
// ============================================================================

// ----------------------------------------------------------------------------
// PLATFORM SETTINGS
// ----------------------------------------------------------------------------

export interface PlatformSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description?: string;
  category: 'general' | 'security' | 'billing' | 'features' | 'email';
  is_sensitive: boolean;
  updated_by?: string;
  updated_at: string;
  created_at: string;
}

export interface MaintenanceModeValue {
  enabled: boolean;
  message: string;
  scheduled_end: string | null;
}

export interface SignupsEnabledValue {
  enabled: boolean;
  require_invitation: boolean;
}

// ----------------------------------------------------------------------------
// ANNOUNCEMENTS
// ----------------------------------------------------------------------------

export type AnnouncementType = 'info' | 'warning' | 'critical' | 'maintenance';
export type AnnouncementAudience = 'all' | 'paid' | 'free' | 'admins';
export type AnnouncementLocation = 'banner' | 'modal' | 'toast';

export interface PlatformAnnouncement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  target_audience: AnnouncementAudience;
  display_location: AnnouncementLocation;
  is_dismissible: boolean;
  starts_at: string;
  ends_at?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
}

export interface CreateAnnouncementDto {
  title: string;
  message: string;
  type: AnnouncementType;
  target_audience?: AnnouncementAudience;
  display_location?: AnnouncementLocation;
  is_dismissible?: boolean;
  starts_at?: string;
  ends_at?: string;
}

// ----------------------------------------------------------------------------
// EMAIL TEMPLATES
// ----------------------------------------------------------------------------

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_body: string;
  text_body?: string;
  variables: string[];
  is_active: boolean;
  updated_by?: string;
  updated_at: string;
  created_at: string;
}

export interface UpdateEmailTemplateDto {
  subject?: string;
  html_body?: string;
  text_body?: string;
}

// ----------------------------------------------------------------------------
// IMPERSONATION
// ----------------------------------------------------------------------------

export interface ImpersonationSession {
  id: string;
  super_admin_id: string;
  target_user_id: string;
  target_org_id?: string;
  reason: string;
  started_at: string;
  ended_at?: string;
  actions_taken: ImpersonationAction[];
  ip_address?: string;
  user_agent?: string;
  // Joined fields
  admin_name?: string;
  target_user_email?: string;
  target_org_name?: string;
}

export interface ImpersonationAction {
  action: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface StartImpersonationDto {
  target_user_id: string;
  reason: string;
}

// ----------------------------------------------------------------------------
// ERROR LOGS
// ----------------------------------------------------------------------------

export type ErrorType = 'edge_function' | 'webhook' | 'auth' | 'database' | 'integration' | 'other';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface PlatformErrorLog {
  id: string;
  error_type: ErrorType;
  error_code?: string;
  message: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  user_id?: string;
  organization_id?: string;
  severity: ErrorSeverity;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  created_at: string;
  // Joined fields
  user_email?: string;
  org_name?: string;
}

export interface ErrorLogParams {
  error_type?: ErrorType;
  severity?: ErrorSeverity;
  is_resolved?: boolean;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface ErrorStats {
  total_errors: number;
  unresolved_count: number;
  critical_count: number;
  by_type: { type: ErrorType; count: number }[];
  by_severity: { severity: ErrorSeverity; count: number }[];
  last_24h_count: number;
}

// ----------------------------------------------------------------------------
// SCHEDULED TASKS
// ----------------------------------------------------------------------------

export type TaskStatus = 'success' | 'failed' | 'running' | 'skipped';

export interface ScheduledTask {
  id: string;
  name: string;
  description?: string;
  cron_expression: string;
  function_name: string;
  is_enabled: boolean;
  last_run_at?: string;
  last_run_status?: TaskStatus;
  last_run_duration_ms?: number;
  last_error?: string;
  next_run_at?: string;
  created_at: string;
}

// ----------------------------------------------------------------------------
// API KEYS
// ----------------------------------------------------------------------------

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  // Joined fields
  org_name?: string;
}

export interface ApiKeyStats {
  total_requests: number;
  requests_today: number;
  requests_this_month: number;
  last_used_at?: string;
  avg_response_time_ms: number;
}

// ----------------------------------------------------------------------------
// INTEGRATION HEALTH
// ----------------------------------------------------------------------------

export type IntegrationStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface IntegrationHealth {
  id: string;
  service_name: string;
  display_name: string;
  status: IntegrationStatus;
  last_check_at?: string;
  last_success_at?: string;
  consecutive_failures: number;
  response_time_ms?: number;
  details?: Record<string, unknown>;
  created_at: string;
}

// ----------------------------------------------------------------------------
// BULK OPERATIONS
// ----------------------------------------------------------------------------

export interface BulkOperationResult {
  success_count: number;
  failure_count: number;
  failures: { id: string; error: string }[];
}

// ----------------------------------------------------------------------------
// EXTENDED DTOs
// ----------------------------------------------------------------------------

export interface ExtendTrialDto {
  organization_id: string;
  days: number;
  reason: string;
}

export interface DeleteOrganizationDto {
  organization_id: string;
  reason: string;
  delete_user_data: boolean;
}

export interface UpdatePlanDto {
  plan_id: string;
  display_name?: string;
  description?: string;
  monthly_price_cents?: number;
  annual_price_cents?: number;
  features?: Partial<PlanFeatures>;
}

export interface GenerateInvoiceDto {
  organization_id: string;
  amount_cents: number;
  description: string;
  due_date?: string;
}

export interface MarkInvoicePaidDto {
  invoice_id: string;
  payment_method: string;
  notes?: string;
}

export interface VoidInvoiceDto {
  invoice_id: string;
  reason: string;
}
