/**
 * Payout Models
 *
 * TypeScript interfaces for the payout/reimbursement system.
 * Supports both manual (CSV export) and Stripe automated payouts.
 *
 * SECURITY NOTE: Bank account data is tokenized through Stripe.
 * We only store Stripe tokens (ba_xxx), never raw account numbers.
 */

/** Payout method options */
export type PayoutMethod = 'manual' | 'stripe';

/** Stripe account connection status */
export type StripeAccountStatus = 'not_connected' | 'pending' | 'active' | 'restricted' | 'disabled';

/** Payout transaction status */
export type PayoutStatus = 'pending' | 'processing' | 'in_transit' | 'paid' | 'failed' | 'canceled';

/** Bank account verification status */
export type BankVerificationStatus = 'pending' | 'verified' | 'failed' | 'expired';

/**
 * Organization payout settings
 */
export interface PayoutSettings {
  payout_method: PayoutMethod;
  stripe_account_id: string | null;
  stripe_account_status: StripeAccountStatus;
  stripe_connected_at: string | null;
  stripe_account_details: {
    business_name?: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
  };
}

/**
 * Stripe Connect account status response
 */
export interface StripeAccountStatusResponse {
  connected: boolean;
  status?: StripeAccountStatus;
  payout_method: PayoutMethod;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  business_name?: string;
}

/**
 * Connect account creation response
 */
export interface CreateConnectAccountResponse {
  success: boolean;
  account_id?: string;
  onboarding_url?: string;
  expires_at?: number;
  error?: string;
}

/**
 * Employee bank account (stored data - tokens only, no raw numbers)
 */
export interface EmployeeBankAccount {
  id: string;
  user_id: string;
  organization_id: string;
  stripe_bank_account_id: string;
  stripe_customer_id: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  last_four: string;
  account_type: 'checking' | 'savings';
  is_default: boolean;
  is_verified: boolean;
  verification_status: BankVerificationStatus;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
}

/**
 * Bank account creation response
 */
export interface CreateBankAccountResponse {
  success: boolean;
  bank_account?: {
    id: string;
    bank_name: string;
    last_four: string;
    is_default: boolean;
    verification_status: BankVerificationStatus;
  };
  error?: string;
}

/**
 * Payout record
 */
export interface Payout {
  id: string;
  organization_id: string;
  user_id: string;
  bank_account_id: string | null;
  amount_cents: number;
  currency: string;
  stripe_payout_id: string | null;
  stripe_transfer_id: string | null;
  status: PayoutStatus;
  failure_reason: string | null;
  failure_code: string | null;
  expense_ids: string[];
  report_ids: string[];
  payout_method: 'manual' | 'stripe_ach' | 'stripe_instant';
  batch_id: string | null;
  created_at: string;
  initiated_at: string | null;
  estimated_arrival: string | null;
  paid_at: string | null;
  failed_at: string | null;
  initiated_by: string | null;
  manual_reference: string | null;
  manual_notes: string | null;
}

/**
 * Payout creation response
 */
export interface CreatePayoutResponse {
  success: boolean;
  payout?: {
    id: string;
    amount_cents: number;
    status: PayoutStatus;
    stripe_payout_id?: string;
    estimated_arrival?: string;
  };
  error?: string;
  message?: string;
}

/**
 * Payout batch for grouping multiple payouts
 */
export interface PayoutBatch {
  id: string;
  organization_id: string;
  name: string | null;
  total_amount_cents: number;
  payout_count: number;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'completed' | 'failed' | 'canceled';
  payout_method: PayoutMethod;
  created_at: string;
  approved_at: string | null;
  processed_at: string | null;
  completed_at: string | null;
  created_by: string;
  approved_by: string | null;
}

/**
 * Pending payout summary for an employee
 */
export interface PendingPayoutSummary {
  user_id: string;
  user_name: string;
  user_email: string;
  total_amount_cents: number;
  expense_count: number;
  expense_ids: string[];
  has_bank_account: boolean;
  bank_account_verified: boolean;
}

/**
 * CSV export data for manual payouts
 */
export interface PayoutExportData {
  employee_name: string;
  employee_email: string;
  amount: number;
  expense_count: number;
  expense_ids: string;
  date_range: string;
}

/**
 * Payout audit log entry
 */
export interface PayoutAuditLog {
  id: string;
  organization_id: string;
  payout_id: string | null;
  batch_id: string | null;
  bank_account_id: string | null;
  action: string;
  action_details: Record<string, unknown>;
  performed_by: string | null;
  performed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}
