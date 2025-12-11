/**
 * Supabase Edge Function: Stripe Billing
 * =======================================
 *
 * Handles subscription management, checkout, and billing operations.
 * Separate from stripe-connect which handles payouts.
 *
 * ACTIONS:
 * --------
 * Checkout & Subscription:
 * - create_checkout_session: Start paid subscription (redirect to Stripe)
 * - create_customer_portal: Self-service billing portal
 * - get_subscription: Get current subscription details
 * - cancel_subscription: Cancel at period end
 * - resume_subscription: Un-cancel
 * - change_plan: Upgrade/downgrade
 * - change_billing_cycle: Monthly <-> Annual
 *
 * Super Admin Actions:
 * - get_all_subscriptions: List all org subscriptions
 * - apply_discount: Permanent/temporary discounts
 * - issue_refund: Refund invoices
 * - create_coupon: Create promo code
 * - deactivate_coupon: Disable coupon
 * - get_analytics: MRR, churn, etc.
 *
 * ENVIRONMENT VARIABLES REQUIRED:
 * ------------------------------
 * - SUPABASE_URL
 * - SUPABASE_ANON_KEY
 * - SUPABASE_SERVICE_ROLE_KEY
 * - STRIPE_SECRET_KEY (platform's Stripe key for billing)
 * - STRIPE_WEBHOOK_SECRET (for webhook verification)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// CONFIGURATION
// ============================================================================

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://expensed.app",
  "https://www.expensed.app",
  "https://bfudcugrarerqvvyfpoz.supabase.co",
  "http://localhost:4200" // Development
];

// APP_URL is required for checkout redirects - warn if not set but use safe default
const APP_URL = Deno.env.get("APP_URL");
if (!APP_URL) {
  console.warn("APP_URL environment variable not set, using default https://expensed.app");
}
const EFFECTIVE_APP_URL = APP_URL || "https://expensed.app";

// ============================================================================
// CORS HELPERS
// ============================================================================

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true"
  };
}

// ============================================================================
// STRIPE HELPERS
// ============================================================================

async function stripeRequest(
  endpoint: string,
  method: string = "GET",
  body?: Record<string, unknown>
): Promise<Response> {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }

  const options: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2023-10-16"
    }
  };

  if (body && method !== "GET") {
    options.body = new URLSearchParams(flattenObject(body)).toString();
  }

  return fetch(`https://api.stripe.com/v1/${endpoint}`, options);
}

// Flatten nested objects for Stripe API
function flattenObject(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, newKey));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object") {
          Object.assign(result, flattenObject(item as Record<string, unknown>, `${newKey}[${index}]`));
        } else {
          result[`${newKey}[${index}]`] = String(item);
        }
      });
    } else {
      result[newKey] = String(value);
    }
  }

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function getUserOrganization(
  supabase: SupabaseClient,
  userId: string,
  organizationId?: string
): Promise<{ orgId: string; role: string } | null> {
  let query = supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (organizationId) {
    query = query.eq("organization_id", organizationId);
  }

  const { data, error } = await query.limit(1).single();

  if (error || !data) {
    return null;
  }

  return { orgId: data.organization_id, role: data.role };
}

async function isSuperAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<{ isAdmin: boolean; permissions: Record<string, boolean> }> {
  const { data, error } = await supabase
    .from("super_admins")
    .select("permissions")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    return { isAdmin: false, permissions: {} };
  }

  return { isAdmin: true, permissions: data.permissions || {} };
}

/**
 * Verify that the user has super admin permissions
 * Throws an error if not authorized
 */
async function verifyAdminPermission(
  supabase: SupabaseClient,
  user: { id: string }
): Promise<void> {
  const { isAdmin } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin) {
    throw new Error("Super admin access required");
  }
}

async function logAuditEvent(
  serviceClient: SupabaseClient,
  event: {
    organization_id?: string;
    subscription_id?: string;
    action: string;
    action_details: Record<string, unknown>;
    performed_by: string;
    is_super_admin: boolean;
    is_system?: boolean;
  }
): Promise<void> {
  await serviceClient.from("subscription_audit_log").insert(event);
}

async function getOrCreateStripeCustomer(
  serviceClient: SupabaseClient,
  organizationId: string,
  billingEmail: string,
  orgName: string
): Promise<string> {
  // Check if customer already exists
  const { data: org } = await serviceClient
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", organizationId)
    .single();

  if (org?.stripe_customer_id) {
    return org.stripe_customer_id;
  }

  // Create new Stripe customer
  const response = await stripeRequest("customers", "POST", {
    email: billingEmail,
    name: orgName,
    metadata: {
      organization_id: organizationId
    }
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Failed to create Stripe customer: ${error.error?.message}`);
  }

  const customer = await response.json();

  // Save customer ID
  await serviceClient
    .from("organizations")
    .update({ stripe_customer_id: customer.id })
    .eq("id", organizationId);

  return customer.id;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Create Supabase client with user's JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get user from JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Parse request body
    const { action, ...params } = await req.json();

    // Service client for privileged operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Route to appropriate handler
    switch (action) {
      // ========== Public Plan Info ==========
      case "get_plans":
        return await handleGetPlans(serviceClient, corsHeaders);

      // ========== Subscription Management ==========
      case "create_checkout_session":
        return await handleCreateCheckoutSession(supabaseClient, serviceClient, user, params, corsHeaders);
      case "create_customer_portal":
        return await handleCreateCustomerPortal(supabaseClient, serviceClient, user, params, corsHeaders);
      case "get_subscription":
        return await handleGetSubscription(supabaseClient, user, params, corsHeaders);
      case "cancel_subscription":
        return await handleCancelSubscription(supabaseClient, serviceClient, user, params, corsHeaders);
      case "resume_subscription":
        return await handleResumeSubscription(supabaseClient, serviceClient, user, params, corsHeaders);
      case "change_plan":
        return await handleChangePlan(supabaseClient, serviceClient, user, params, corsHeaders);
      case "apply_coupon":
        return await handleApplyCoupon(supabaseClient, serviceClient, user, params, corsHeaders);

      // ========== Super Admin Actions ==========
      case "admin_get_all_subscriptions":
        return await handleAdminGetAllSubscriptions(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_apply_discount":
        return await handleAdminApplyDiscount(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_issue_refund":
        return await handleAdminIssueRefund(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_create_coupon":
        return await handleAdminCreateCoupon(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_deactivate_coupon":
        return await handleAdminDeactivateCoupon(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_get_analytics":
        return await handleAdminGetAnalytics(supabaseClient, serviceClient, user, corsHeaders);
      case "admin_pause_subscription":
        return await handleAdminPauseSubscription(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_send_payment_reminder":
        return await handleAdminSendPaymentReminder(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_extend_trial":
        return await handleAdminExtendTrial(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_bulk_extend_trials":
        return await handleAdminBulkExtendTrials(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_bulk_apply_discount":
        return await handleAdminBulkApplyDiscount(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_generate_invoice":
        return await handleAdminGenerateInvoice(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_void_invoice":
        return await handleAdminVoidInvoice(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_mark_invoice_paid":
        return await handleAdminMarkInvoicePaid(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_delete_organization":
        return await handleAdminDeleteOrganization(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_update_plan":
        return await handleAdminUpdatePlan(supabaseClient, serviceClient, user, params, corsHeaders);
      case "admin_toggle_plan_feature":
        return await handleAdminTogglePlanFeature(supabaseClient, serviceClient, user, params, corsHeaders);

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

// ============================================================================
// PUBLIC HANDLERS
// ============================================================================

/**
 * Get available subscription plans
 */
async function handleGetPlans(
  serviceClient: SupabaseClient,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { data: plans, error } = await serviceClient
    .from("subscription_plans")
    .select("*")
    .eq("is_active", true)
    .eq("is_public", true)
    .order("display_order");

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch plans" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ plans }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// ============================================================================
// SUBSCRIPTION HANDLERS
// ============================================================================

/**
 * Create a Stripe Checkout session for subscription
 */
async function handleCreateCheckoutSession(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string; email?: string },
  params: { organization_id: string; plan_id: string; billing_cycle: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id, plan_id, billing_cycle = "monthly" } = params;

  // Verify user is org admin
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only organization admins can manage billing" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get organization details
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organization_id)
    .single();

  if (orgError || !org) {
    return new Response(JSON.stringify({ error: "Organization not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get plan details
  const { data: plan, error: planError } = await serviceClient
    .from("subscription_plans")
    .select("*")
    .eq("id", plan_id)
    .eq("is_active", true)
    .single();

  if (planError || !plan) {
    return new Response(JSON.stringify({ error: "Plan not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Can't checkout for free plan
  if (plan.name === "free") {
    return new Response(JSON.stringify({ error: "Free plan doesn't require checkout" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get or create Stripe price ID
  const priceId = billing_cycle === "annual"
    ? plan.stripe_annual_price_id
    : plan.stripe_monthly_price_id;

  if (!priceId) {
    return new Response(JSON.stringify({
      error: "Plan not configured for billing. Contact support."
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get or create Stripe customer
  const customerId = await getOrCreateStripeCustomer(
    serviceClient,
    organization_id,
    user.email || "",
    org.name
  );

  // Create checkout session
  const response = await stripeRequest("checkout/sessions", "POST", {
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    mode: "subscription",
    success_url: `${EFFECTIVE_APP_URL}/organization/billing?session_id={CHECKOUT_SESSION_ID}&success=true`,
    cancel_url: `${EFFECTIVE_APP_URL}/organization/billing?canceled=true`,
    allow_promotion_codes: true,
    billing_address_collection: "required",
    metadata: {
      organization_id,
      plan_id,
      billing_cycle
    },
    subscription_data: {
      metadata: {
        organization_id,
        plan_id
      }
    }
  });

  if (!response.ok) {
    const error = await response.json();
    console.error("Stripe checkout error:", error);
    return new Response(JSON.stringify({
      error: "Failed to create checkout session",
      message: error.error?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const session = await response.json();

  // Log audit event
  await logAuditEvent(serviceClient, {
    organization_id,
    action: "checkout_session_created",
    action_details: { plan_id, billing_cycle, session_id: session.id },
    performed_by: user.id,
    is_super_admin: false
  });

  return new Response(JSON.stringify({
    url: session.url,
    session_id: session.id
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Create Stripe Customer Portal session for self-service billing
 */
async function handleCreateCustomerPortal(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id } = params;

  // Verify user is org admin
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only organization admins can access billing" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get Stripe customer ID
  const { data: org, error: orgError } = await serviceClient
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", organization_id)
    .single();

  if (orgError || !org?.stripe_customer_id) {
    return new Response(JSON.stringify({
      error: "No billing account found. Please subscribe to a plan first."
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Create portal session
  const response = await stripeRequest("billing_portal/sessions", "POST", {
    customer: org.stripe_customer_id,
    return_url: `${EFFECTIVE_APP_URL}/organization/billing`
  });

  if (!response.ok) {
    const error = await response.json();
    return new Response(JSON.stringify({
      error: "Failed to create portal session",
      message: error.error?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const session = await response.json();

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Get current subscription details
 */
async function handleGetSubscription(
  supabase: SupabaseClient,
  user: { id: string },
  params: { organization_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id } = params;

  // Verify user is org member
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership) {
    return new Response(JSON.stringify({ error: "Not a member of this organization" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get subscription with plan details
  const { data: subscription, error } = await supabase
    .from("organization_subscriptions")
    .select(`
      *,
      plan:subscription_plans(*)
    `)
    .eq("organization_id", organization_id)
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: "Subscription not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get invoice history (last 5)
  const { data: invoices } = await supabase
    .from("subscription_invoices")
    .select("*")
    .eq("organization_id", organization_id)
    .order("invoice_date", { ascending: false })
    .limit(5);

  return new Response(JSON.stringify({
    subscription,
    invoices: invoices || []
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Cancel subscription at period end
 */
async function handleCancelSubscription(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id } = params;

  // Verify user is org admin
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only organization admins can cancel subscription" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get subscription
  const { data: subscription, error } = await serviceClient
    .from("organization_subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", organization_id)
    .single();

  if (error || !subscription?.stripe_subscription_id) {
    return new Response(JSON.stringify({ error: "No active subscription found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Cancel in Stripe (at period end)
  const response = await stripeRequest(
    `subscriptions/${subscription.stripe_subscription_id}`,
    "POST",
    { cancel_at_period_end: true }
  );

  if (!response.ok) {
    const error = await response.json();
    return new Response(JSON.stringify({
      error: "Failed to cancel subscription",
      message: error.error?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Update local record
  await serviceClient
    .from("organization_subscriptions")
    .update({
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString()
    })
    .eq("organization_id", organization_id);

  // Log audit event
  await logAuditEvent(serviceClient, {
    organization_id,
    action: "subscription_canceled",
    action_details: { canceled_by: user.id, at_period_end: true },
    performed_by: user.id,
    is_super_admin: false
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Subscription will be canceled at the end of the billing period"
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Resume a canceled subscription
 */
async function handleResumeSubscription(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id } = params;

  // Verify user is org admin
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only organization admins can manage subscription" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get subscription
  const { data: subscription, error } = await serviceClient
    .from("organization_subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", organization_id)
    .single();

  if (error || !subscription?.stripe_subscription_id) {
    return new Response(JSON.stringify({ error: "No subscription found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Resume in Stripe
  const response = await stripeRequest(
    `subscriptions/${subscription.stripe_subscription_id}`,
    "POST",
    { cancel_at_period_end: false }
  );

  if (!response.ok) {
    const error = await response.json();
    return new Response(JSON.stringify({
      error: "Failed to resume subscription",
      message: error.error?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Update local record
  await serviceClient
    .from("organization_subscriptions")
    .update({
      cancel_at_period_end: false,
      canceled_at: null
    })
    .eq("organization_id", organization_id);

  // Log audit event
  await logAuditEvent(serviceClient, {
    organization_id,
    action: "subscription_resumed",
    action_details: { resumed_by: user.id },
    performed_by: user.id,
    is_super_admin: false
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Subscription resumed successfully"
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Change subscription plan (upgrade/downgrade)
 */
async function handleChangePlan(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string; new_plan_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id, new_plan_id } = params;

  // Verify user is org admin
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only organization admins can change plan" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get current subscription
  const { data: subscription, error } = await serviceClient
    .from("organization_subscriptions")
    .select("*, plan:subscription_plans(*)")
    .eq("organization_id", organization_id)
    .single();

  if (error || !subscription) {
    return new Response(JSON.stringify({ error: "No subscription found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get new plan
  const { data: newPlan, error: planError } = await serviceClient
    .from("subscription_plans")
    .select("*")
    .eq("id", new_plan_id)
    .eq("is_active", true)
    .single();

  if (planError || !newPlan) {
    return new Response(JSON.stringify({ error: "New plan not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Handle free plan change (downgrade to free)
  if (newPlan.name === "free") {
    // Cancel in Stripe if exists
    if (subscription.stripe_subscription_id) {
      await stripeRequest(
        `subscriptions/${subscription.stripe_subscription_id}`,
        "DELETE"
      );
    }

    // Update to free plan
    await serviceClient
      .from("organization_subscriptions")
      .update({
        plan_id: new_plan_id,
        status: "active",
        stripe_subscription_id: null,
        billing_cycle: null
      })
      .eq("organization_id", organization_id);

    await logAuditEvent(serviceClient, {
      organization_id,
      action: "plan_downgraded",
      action_details: {
        from_plan: subscription.plan?.name,
        to_plan: "free"
      },
      performed_by: user.id,
      is_super_admin: false
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Downgraded to free plan"
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // For paid plan changes, update Stripe subscription
  if (!subscription.stripe_subscription_id) {
    return new Response(JSON.stringify({
      error: "No active Stripe subscription. Please checkout for the new plan."
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const priceId = subscription.billing_cycle === "annual"
    ? newPlan.stripe_annual_price_id
    : newPlan.stripe_monthly_price_id;

  if (!priceId) {
    return new Response(JSON.stringify({
      error: "New plan not configured for billing"
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get subscription items to update
  const itemsResponse = await stripeRequest(
    `subscriptions/${subscription.stripe_subscription_id}`
  );
  const stripeSubscription = await itemsResponse.json();
  const itemId = stripeSubscription.items?.data?.[0]?.id;

  if (!itemId) {
    return new Response(JSON.stringify({
      error: "Failed to find subscription item"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Update subscription in Stripe
  const response = await stripeRequest(
    `subscriptions/${subscription.stripe_subscription_id}`,
    "POST",
    {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
      metadata: { plan_id: new_plan_id }
    }
  );

  if (!response.ok) {
    const error = await response.json();
    return new Response(JSON.stringify({
      error: "Failed to change plan",
      message: error.error?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Update local record
  await serviceClient
    .from("organization_subscriptions")
    .update({ plan_id: new_plan_id })
    .eq("organization_id", organization_id);

  const isUpgrade = newPlan.monthly_price_cents > (subscription.plan?.monthly_price_cents || 0);
  await logAuditEvent(serviceClient, {
    organization_id,
    action: isUpgrade ? "plan_upgraded" : "plan_downgraded",
    action_details: {
      from_plan: subscription.plan?.name,
      to_plan: newPlan.name
    },
    performed_by: user.id,
    is_super_admin: false
  });

  return new Response(JSON.stringify({
    success: true,
    message: `Plan changed to ${newPlan.display_name}`
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Apply a coupon code
 */
async function handleApplyCoupon(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string; coupon_code: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { organization_id, coupon_code } = params;

  // Verify user is org admin
  const membership = await getUserOrganization(supabase, user.id, organization_id);
  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only organization admins can apply coupons" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Find coupon
  const { data: coupon, error: couponError } = await serviceClient
    .from("coupon_codes")
    .select("*")
    .eq("code", coupon_code.toUpperCase())
    .eq("is_active", true)
    .single();

  if (couponError || !coupon) {
    return new Response(JSON.stringify({ error: "Invalid coupon code" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Check validity
  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return new Response(JSON.stringify({ error: "Coupon not yet valid" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return new Response(JSON.stringify({ error: "Coupon has expired" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
  if (coupon.max_redemptions && coupon.redemption_count >= coupon.max_redemptions) {
    return new Response(JSON.stringify({ error: "Coupon has reached maximum redemptions" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Check if already redeemed
  const { data: existingRedemption } = await serviceClient
    .from("coupon_redemptions")
    .select("id")
    .eq("coupon_id", coupon.id)
    .eq("organization_id", organization_id)
    .single();

  if (existingRedemption) {
    return new Response(JSON.stringify({ error: "Coupon already applied to this organization" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get subscription
  const { data: subscription } = await serviceClient
    .from("organization_subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", organization_id)
    .single();

  // Apply to Stripe if subscription exists and coupon is in Stripe
  if (subscription?.stripe_subscription_id && coupon.stripe_coupon_id) {
    const response = await stripeRequest(
      `subscriptions/${subscription.stripe_subscription_id}`,
      "POST",
      { coupon: coupon.stripe_coupon_id }
    );

    if (!response.ok) {
      const error = await response.json();
      return new Response(JSON.stringify({
        error: "Failed to apply coupon",
        message: error.error?.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // Record redemption
  await serviceClient.from("coupon_redemptions").insert({
    coupon_id: coupon.id,
    organization_id,
    redeemed_by: user.id,
    discount_type: coupon.discount_type,
    discount_value: coupon.discount_value,
    remaining_months: coupon.duration === "repeating" ? coupon.duration_months : null
  });

  await logAuditEvent(serviceClient, {
    organization_id,
    action: "coupon_applied",
    action_details: { coupon_code, discount_type: coupon.discount_type, discount_value: coupon.discount_value },
    performed_by: user.id,
    is_super_admin: false
  });

  return new Response(JSON.stringify({
    success: true,
    message: `Coupon applied: ${coupon.discount_type === 'percent' ? coupon.discount_value + '%' : '$' + (coupon.discount_value / 100)} off`
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// ============================================================================
// SUPER ADMIN HANDLERS
// ============================================================================

/**
 * Get all subscriptions (super admin only)
 */
async function handleAdminGetAllSubscriptions(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { status?: string; plan?: string; limit?: number; offset?: number },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.view_organizations) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { status, plan, limit = 50, offset = 0 } = params;

  let query = serviceClient
    .from("super_admin_organization_summary")
    .select("*", { count: "exact" });

  if (status) {
    query = query.eq("subscription_status", status);
  }
  if (plan) {
    query = query.eq("plan_name", plan);
  }

  const { data, error, count } = await query
    .order("org_created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return new Response(JSON.stringify({ error: "Failed to fetch subscriptions" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({
    organizations: data,
    total: count,
    limit,
    offset
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Apply discount to organization (super admin only)
 */
async function handleAdminApplyDiscount(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: {
    organization_id: string;
    discount_percent: number;
    expires_at?: string;
    reason: string;
  },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.manage_subscriptions) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { organization_id, discount_percent, expires_at, reason } = params;

  if (discount_percent < 0 || discount_percent > 100) {
    return new Response(JSON.stringify({ error: "Discount must be between 0 and 100" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Update subscription
  await serviceClient
    .from("organization_subscriptions")
    .update({
      discount_percent,
      discount_expires_at: expires_at || null,
      discount_reason: reason
    })
    .eq("organization_id", organization_id);

  await logAuditEvent(serviceClient, {
    organization_id,
    action: "discount_applied",
    action_details: { discount_percent, expires_at, reason },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({
    success: true,
    message: `${discount_percent}% discount applied`
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Issue refund (super admin only)
 */
async function handleAdminIssueRefund(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { invoice_id: string; amount_cents?: number; reason: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.issue_refunds) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { invoice_id, amount_cents, reason } = params;

  // Get invoice
  const { data: invoice, error } = await serviceClient
    .from("subscription_invoices")
    .select("*, organization:organizations(id, name)")
    .eq("id", invoice_id)
    .single();

  if (error || !invoice) {
    return new Response(JSON.stringify({ error: "Invoice not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (!invoice.stripe_charge_id) {
    return new Response(JSON.stringify({ error: "No charge found for this invoice" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Create refund in Stripe
  const refundAmount = amount_cents || invoice.amount_cents;
  const response = await stripeRequest("refunds", "POST", {
    charge: invoice.stripe_charge_id,
    amount: refundAmount,
    reason: "requested_by_customer"
  });

  if (!response.ok) {
    const stripeError = await response.json();
    return new Response(JSON.stringify({
      error: "Failed to create refund",
      message: stripeError.error?.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Update invoice record
  const newRefundTotal = (invoice.amount_refunded_cents || 0) + refundAmount;
  const newStatus = newRefundTotal >= invoice.amount_cents ? "refunded" : "partially_refunded";

  await serviceClient
    .from("subscription_invoices")
    .update({
      amount_refunded_cents: newRefundTotal,
      status: newStatus
    })
    .eq("id", invoice_id);

  await logAuditEvent(serviceClient, {
    organization_id: invoice.organization_id,
    action: "refund_issued",
    action_details: { invoice_id, amount_cents: refundAmount, reason },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({
    success: true,
    message: `Refunded $${(refundAmount / 100).toFixed(2)}`
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Create coupon (super admin only)
 */
async function handleAdminCreateCoupon(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: {
    code: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
    duration: "once" | "repeating" | "forever";
    duration_months?: number;
    max_redemptions?: number;
    valid_until?: string;
    campaign_name?: string;
    applies_to_plans?: string[];
  },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.create_coupons) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const {
    code, discount_type, discount_value, duration,
    duration_months, max_redemptions, valid_until,
    campaign_name, applies_to_plans
  } = params;

  // Create in Stripe first
  const stripeCouponData: Record<string, unknown> = {
    duration,
    id: code.toUpperCase(),
    name: code.toUpperCase()
  };

  if (discount_type === "percent") {
    stripeCouponData.percent_off = discount_value;
  } else {
    stripeCouponData.amount_off = discount_value;
    stripeCouponData.currency = "usd";
  }

  if (duration === "repeating" && duration_months) {
    stripeCouponData.duration_in_months = duration_months;
  }

  if (max_redemptions) {
    stripeCouponData.max_redemptions = max_redemptions;
  }

  if (valid_until) {
    stripeCouponData.redeem_by = Math.floor(new Date(valid_until).getTime() / 1000);
  }

  const response = await stripeRequest("coupons", "POST", stripeCouponData);

  let stripeCouponId = null;
  if (response.ok) {
    const stripeCoupon = await response.json();
    stripeCouponId = stripeCoupon.id;
  } else {
    // Log warning but continue - coupon can still work locally
    console.warn("Failed to create Stripe coupon:", await response.text());
  }

  // Create in database
  const { data: coupon, error } = await serviceClient
    .from("coupon_codes")
    .insert({
      code: code.toUpperCase(),
      discount_type,
      discount_value,
      duration,
      duration_months,
      max_redemptions,
      valid_until,
      campaign_name,
      applies_to_plans,
      stripe_coupon_id: stripeCouponId,
      created_by: user.id
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({
      error: "Failed to create coupon",
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  await logAuditEvent(serviceClient, {
    action: "coupon_created",
    action_details: { code, discount_type, discount_value, duration },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({
    success: true,
    coupon
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Deactivate coupon (super admin only)
 */
async function handleAdminDeactivateCoupon(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { coupon_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.create_coupons) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { coupon_id } = params;

  // Get coupon
  const { data: coupon, error } = await serviceClient
    .from("coupon_codes")
    .select("stripe_coupon_id, code")
    .eq("id", coupon_id)
    .single();

  if (error || !coupon) {
    return new Response(JSON.stringify({ error: "Coupon not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Delete from Stripe if exists
  if (coupon.stripe_coupon_id) {
    await stripeRequest(`coupons/${coupon.stripe_coupon_id}`, "DELETE");
  }

  // Deactivate in database
  await serviceClient
    .from("coupon_codes")
    .update({ is_active: false })
    .eq("id", coupon_id);

  await logAuditEvent(serviceClient, {
    action: "coupon_deactivated",
    action_details: { coupon_id, code: coupon.code },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({
    success: true,
    message: "Coupon deactivated"
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Get analytics (super admin only)
 */
async function handleAdminGetAnalytics(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.view_analytics) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get MRR stats
  const { data: mrrStats } = await serviceClient.rpc("get_mrr_stats");

  // Get plan distribution
  const { data: planDistribution } = await serviceClient.rpc("get_plan_distribution");

  // Get recent activity
  const { data: recentActivity } = await serviceClient
    .from("subscription_audit_log")
    .select("action, action_details, created_at, organization_id")
    .order("created_at", { ascending: false })
    .limit(20);

  // Get coupon stats
  const { data: coupons } = await serviceClient
    .from("coupon_codes")
    .select("code, redemption_count, max_redemptions, is_active")
    .order("redemption_count", { ascending: false })
    .limit(10);

  return new Response(JSON.stringify({
    mrr: mrrStats?.[0] || {
      total_mrr_cents: 0,
      total_arr_cents: 0,
      paying_customer_count: 0,
      free_customer_count: 0,
      average_revenue_per_customer_cents: 0
    },
    plan_distribution: planDistribution || [],
    recent_activity: recentActivity || [],
    top_coupons: coupons || []
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Pause/suspend subscription (super admin only)
 */
async function handleAdminPauseSubscription(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string; reason: string; resume?: boolean },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.manage_subscriptions) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { organization_id, reason, resume = false } = params;

  const newStatus = resume ? "active" : "paused";
  const action = resume ? "subscription_resumed" : "subscription_paused";

  // Get subscription
  const { data: subscription } = await serviceClient
    .from("organization_subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", organization_id)
    .single();

  // Pause/resume in Stripe if exists
  if (subscription?.stripe_subscription_id) {
    await stripeRequest(
      `subscriptions/${subscription.stripe_subscription_id}`,
      "POST",
      { pause_collection: resume ? null : { behavior: "void" } }
    );
  }

  // Update local status
  await serviceClient
    .from("organization_subscriptions")
    .update({ status: newStatus })
    .eq("organization_id", organization_id);

  await logAuditEvent(serviceClient, {
    organization_id,
    action,
    action_details: { reason },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({
    success: true,
    message: resume ? "Subscription resumed" : "Subscription paused"
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Send payment reminder to organization with past due subscription
 */
async function handleAdminSendPaymentReminder(
  supabase: SupabaseClient,
  serviceClient: SupabaseClient,
  user: { id: string },
  params: { organization_id: string },
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { isAdmin, permissions } = await isSuperAdmin(supabase, user.id);
  if (!isAdmin || !permissions.manage_subscriptions) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const { organization_id } = params;

  // Get organization and subscription details
  const { data: org, error: orgError } = await serviceClient
    .from("organizations")
    .select(`
      id,
      name,
      billing_email,
      organization_subscriptions (
        status,
        stripe_subscription_id
      )
    `)
    .eq("id", organization_id)
    .single();

  if (orgError || !org) {
    return new Response(JSON.stringify({ error: "Organization not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const subscription = org.organization_subscriptions?.[0];
  if (!subscription || subscription.status !== "past_due") {
    return new Response(JSON.stringify({
      error: "Organization does not have a past due subscription"
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Get the latest unpaid invoice from Stripe
  let invoiceUrl: string | null = null;
  if (subscription.stripe_subscription_id) {
    try {
      const invoiceData = await stripeRequest(
        `invoices?subscription=${subscription.stripe_subscription_id}&status=open&limit=1`,
        "GET"
      );
      if (invoiceData.data?.[0]?.hosted_invoice_url) {
        invoiceUrl = invoiceData.data[0].hosted_invoice_url;
      }
    } catch (e) {
      console.error("Failed to get invoice from Stripe:", e);
    }
  }

  // Send payment reminder email via send-invitation-email function
  // (reusing existing email infrastructure)
  const recipientEmail = org.billing_email;
  if (recipientEmail) {
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-invitation-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({
          type: "payment_reminder",
          to: recipientEmail,
          organization_name: org.name,
          invoice_url: invoiceUrl
        })
      });
    } catch (e) {
      console.error("Failed to send payment reminder email:", e);
    }
  }

  // Log the action
  await logAuditEvent(serviceClient, {
    organization_id,
    action: "payment_reminder_sent",
    action_details: {
      recipient_email: recipientEmail,
      invoice_url: invoiceUrl
    },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({
    success: true,
    message: `Payment reminder sent to ${recipientEmail || "organization"}`
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Extend trial for a single organization
 */
async function handleAdminExtendTrial(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { organization_id, additional_days } = params;

  const { data: subscription, error } = await serviceClient
    .from("subscriptions")
    .select("*")
    .eq("organization_id", organization_id)
    .single();

  if (error || !subscription) {
    return new Response(JSON.stringify({ error: "Subscription not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const currentTrialEnd = new Date(subscription.trial_end || Date.now());
  const newTrialEnd = new Date(currentTrialEnd.getTime() + additional_days * 24 * 60 * 60 * 1000);

  // Update in Supabase
  await serviceClient
    .from("subscriptions")
    .update({ trial_end: newTrialEnd.toISOString() })
    .eq("id", subscription.id);

  // Update in Stripe if subscription exists
  if (subscription.stripe_subscription_id) {
    await stripeRequest(`subscriptions/${subscription.stripe_subscription_id}`, "POST", {
      trial_end: Math.floor(newTrialEnd.getTime() / 1000)
    });
  }

  await logAuditEvent(serviceClient, {
    organization_id,
    action: "trial_extended",
    action_details: { additional_days, new_trial_end: newTrialEnd.toISOString() },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true, new_trial_end: newTrialEnd }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Extend trials for multiple organizations
 */
async function handleAdminBulkExtendTrials(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { organization_ids, additional_days } = params;

  const results = { success: 0, failed: 0, errors: [] };

  for (const org_id of organization_ids) {
    try {
      await handleAdminExtendTrial(supabaseClient, serviceClient, user, {
        organization_id: org_id,
        additional_days
      }, corsHeaders);
      results.success++;
    } catch (error: any) {
      results.failed++;
      results.errors.push({ org_id, error: error.message });
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Apply discount to multiple organizations
 */
async function handleAdminBulkApplyDiscount(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { organization_ids, discount_percent, duration_months } = params;

  const results = { success: 0, failed: 0, errors: [] };

  for (const org_id of organization_ids) {
    try {
      // Create coupon in Stripe
      const couponResponse = await stripeRequest("coupons", "POST", {
        percent_off: discount_percent,
        duration: "repeating",
        duration_in_months: duration_months,
        name: `Bulk Discount ${discount_percent}% for ${duration_months}mo`
      });

      if (couponResponse.ok) {
        const coupon = await couponResponse.json();
        // Apply to organization's subscription
        const { data: sub } = await serviceClient
          .from("subscriptions")
          .select("stripe_subscription_id")
          .eq("organization_id", org_id)
          .single();

        if (sub?.stripe_subscription_id) {
          await stripeRequest(`subscriptions/${sub.stripe_subscription_id}`, "POST", {
            coupon: coupon.id
          });
        }
        results.success++;
      } else {
        throw new Error("Failed to create coupon");
      }
    } catch (error: any) {
      results.failed++;
      results.errors.push({ org_id, error: error.message });
    }
  }

  return new Response(JSON.stringify(results), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Generate manual invoice
 */
async function handleAdminGenerateInvoice(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { organization_id, amount, description, due_days } = params;

  // Get organization's Stripe customer
  const { data: org } = await serviceClient
    .from("organizations")
    .select("stripe_customer_id, name")
    .eq("id", organization_id)
    .single();

  if (!org?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: "Organization has no Stripe customer" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Create invoice item
  await stripeRequest("invoiceitems", "POST", {
    customer: org.stripe_customer_id,
    amount: Math.round(amount * 100), // Convert to cents
    currency: "usd",
    description
  });

  // Create and finalize invoice
  const invoiceResponse = await stripeRequest("invoices", "POST", {
    customer: org.stripe_customer_id,
    auto_advance: true,
    collection_method: "send_invoice",
    days_until_due: due_days || 30
  });

  if (!invoiceResponse.ok) {
    throw new Error("Failed to create invoice");
  }

  const invoice = await invoiceResponse.json();

  await logAuditEvent(serviceClient, {
    organization_id,
    action: "manual_invoice_generated",
    action_details: { invoice_id: invoice.id, amount, description },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true, invoice }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Void an invoice
 */
async function handleAdminVoidInvoice(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { invoice_id } = params;

  const response = await stripeRequest(`invoices/${invoice_id}/void`, "POST");

  if (!response.ok) {
    throw new Error("Failed to void invoice");
  }

  await logAuditEvent(serviceClient, {
    organization_id: null,
    action: "invoice_voided",
    action_details: { invoice_id },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Mark invoice as paid manually
 */
async function handleAdminMarkInvoicePaid(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { invoice_id } = params;

  const response = await stripeRequest(`invoices/${invoice_id}/pay`, "POST", {
    paid_out_of_band: true
  });

  if (!response.ok) {
    throw new Error("Failed to mark invoice as paid");
  }

  await logAuditEvent(serviceClient, {
    organization_id: null,
    action: "invoice_marked_paid",
    action_details: { invoice_id },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Hard delete organization (with confirmation)
 */
async function handleAdminDeleteOrganization(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { organization_id, confirmation } = params;

  if (confirmation !== "DELETE") {
    return new Response(JSON.stringify({ error: "Confirmation required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Cancel Stripe subscription first
  const { data: sub } = await serviceClient
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("organization_id", organization_id)
    .single();

  if (sub?.stripe_subscription_id) {
    await stripeRequest(`subscriptions/${sub.stripe_subscription_id}`, "DELETE");
  }

  // Delete organization (cascades to related tables via FK constraints)
  const { error } = await serviceClient
    .from("organizations")
    .delete()
    .eq("id", organization_id);

  if (error) throw error;

  await logAuditEvent(serviceClient, {
    organization_id,
    action: "organization_deleted",
    action_details: { confirmation },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Update plan pricing and features
 * Accepts parameters either as { plan_id, updates: {...} } or flat { plan_id, display_name, ... }
 */
async function handleAdminUpdatePlan(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);

  // Support both formats: { plan_id, updates: {...} } and flat { plan_id, display_name, ... }
  const { plan_id, updates: nestedUpdates, ...flatUpdates } = params;

  // Use nested updates if provided, otherwise use flat updates (excluding plan_id)
  const updates = nestedUpdates || flatUpdates;

  if (!plan_id) {
    return new Response(JSON.stringify({ error: "plan_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  if (!updates || Object.keys(updates).length === 0) {
    return new Response(JSON.stringify({ error: "No updates provided" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Build the update object with only valid fields
  const validFields = [
    'display_name', 'description', 'monthly_price_cents', 'annual_price_cents',
    'min_users', 'max_users', 'features', 'stripe_product_id',
    'stripe_monthly_price_id', 'stripe_annual_price_id', 'is_active', 'is_public'
  ];

  const sanitizedUpdates: Record<string, unknown> = {};
  for (const field of validFields) {
    if (updates[field] !== undefined) {
      sanitizedUpdates[field] = updates[field];
    }
  }

  // Add updated_at timestamp
  sanitizedUpdates.updated_at = new Date().toISOString();

  const { error } = await serviceClient
    .from("subscription_plans")
    .update(sanitizedUpdates)
    .eq("id", plan_id);

  if (error) {
    console.error("Failed to update plan:", error);
    return new Response(JSON.stringify({ error: "Failed to update plan", message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  await logAuditEvent(serviceClient, {
    organization_id: null,
    action: "plan_updated",
    action_details: { plan_id, updates: sanitizedUpdates },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

/**
 * Toggle a single feature on a plan
 */
async function handleAdminTogglePlanFeature(
  supabaseClient: SupabaseClient,
  serviceClient: SupabaseClient,
  user: any,
  params: any,
  corsHeaders: Record<string, string>
): Promise<Response> {
  await verifyAdminPermission(supabaseClient, user);
  const { plan_id, feature_key, enabled } = params;

  const { data: plan } = await serviceClient
    .from("subscription_plans")
    .select("features")
    .eq("id", plan_id)
    .single();

  if (!plan) {
    return new Response(JSON.stringify({ error: "Plan not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const features = plan.features || {};
  features[feature_key] = enabled;

  const { error } = await serviceClient
    .from("subscription_plans")
    .update({ features })
    .eq("id", plan_id);

  if (error) throw error;

  await logAuditEvent(serviceClient, {
    organization_id: null,
    action: "plan_feature_toggled",
    action_details: { plan_id, feature_key, enabled },
    performed_by: user.id,
    is_super_admin: true
  });

  return new Response(JSON.stringify({ success: true, features }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
