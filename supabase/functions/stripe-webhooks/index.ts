/**
 * Supabase Edge Function: Stripe Webhooks
 * ========================================
 *
 * Handles incoming webhook events from Stripe for subscription billing.
 *
 * EVENTS HANDLED:
 * ---------------
 * Subscription Lifecycle:
 * - customer.subscription.created
 * - customer.subscription.updated
 * - customer.subscription.deleted
 * - customer.subscription.trial_will_end
 *
 * Payment Events:
 * - invoice.paid
 * - invoice.payment_failed
 * - invoice.payment_action_required
 * - invoice.finalized
 *
 * Customer Events:
 * - customer.created
 * - customer.updated
 *
 * SECURITY:
 * ---------
 * - Verifies Stripe webhook signature
 * - Uses service role for database updates
 *
 * ENVIRONMENT VARIABLES REQUIRED:
 * ------------------------------
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - STRIPE_WEBHOOK_SECRET
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================================
// STRIPE WEBHOOK SIGNATURE VERIFICATION
// ============================================================================

/**
 * In-memory cache for processed event IDs to prevent replay attacks.
 * Events are tracked for 5 minutes (same as Stripe's timestamp tolerance).
 * In production, consider using Redis or database for persistence across instances.
 */
const processedEvents = new Map<string, number>();
const EVENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Clean up expired events from cache
 */
function cleanupExpiredEvents(): void {
  const now = Date.now();
  for (const [eventId, timestamp] of processedEvents.entries()) {
    if (now - timestamp > EVENT_CACHE_TTL_MS) {
      processedEvents.delete(eventId);
    }
  }
}

/**
 * Check if an event has already been processed (replay attack prevention)
 */
function isReplayAttack(eventId: string): boolean {
  cleanupExpiredEvents();
  if (processedEvents.has(eventId)) {
    console.error(`Replay attack detected: event ${eventId} already processed`);
    return true;
  }
  return false;
}

/**
 * Mark an event as processed
 */
function markEventProcessed(eventId: string): void {
  processedEvents.set(eventId, Date.now());
}

/**
 * Log security alerts for suspicious webhook activity
 */
async function logSecurityAlert(
  alertType: string,
  details: Record<string, unknown>,
  serviceClient?: SupabaseClient
): Promise<void> {
  console.error(`[SECURITY ALERT] ${alertType}:`, JSON.stringify(details));

  // If we have a service client, also log to database for monitoring
  if (serviceClient) {
    try {
      await serviceClient.from("subscription_audit_log").insert({
        action: `security_alert_${alertType}`,
        action_details: details,
        is_system: true,
        is_super_admin: false,
        performed_by: null
      });
    } catch (err) {
      console.error("Failed to log security alert to database:", err);
    }
  }
}

/**
 * Verification result with detailed error information
 */
interface VerificationResult {
  valid: boolean;
  errorCode?: "missing_parts" | "timestamp_expired" | "invalid_signature" | "crypto_error";
  errorMessage?: string;
}

async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<VerificationResult> {
  try {
    const parts = signature.split(",");
    const timestampPart = parts.find(p => p.startsWith("t="));
    const signaturePart = parts.find(p => p.startsWith("v1="));

    if (!timestampPart || !signaturePart) {
      return {
        valid: false,
        errorCode: "missing_parts",
        errorMessage: "Missing timestamp or signature in header"
      };
    }

    const timestamp = timestampPart.slice(2);
    const expectedSig = signaturePart.slice(3);

    // Check timestamp is within tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const timestampAge = Math.abs(now - parseInt(timestamp));
    if (timestampAge > 300) {
      return {
        valid: false,
        errorCode: "timestamp_expired",
        errorMessage: `Timestamp expired: ${timestampAge}s old (max 300s)`
      };
    }

    // Compute expected signature using HMAC-SHA256
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signature_bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(signedPayload)
    );

    const computedSig = Array.from(new Uint8Array(signature_bytes))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison to prevent timing attacks
    if (computedSig.length !== expectedSig.length) {
      return {
        valid: false,
        errorCode: "invalid_signature",
        errorMessage: "Signature length mismatch"
      };
    }

    let mismatch = 0;
    for (let i = 0; i < computedSig.length; i++) {
      mismatch |= computedSig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }

    if (mismatch !== 0) {
      return {
        valid: false,
        errorCode: "invalid_signature",
        errorMessage: "Signature verification failed"
      };
    }

    return { valid: true };
  } catch (error) {
    console.error("Signature verification error:", error);
    return {
      valid: false,
      errorCode: "crypto_error",
      errorMessage: error instanceof Error ? error.message : "Unknown crypto error"
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function logAuditEvent(
  serviceClient: SupabaseClient,
  event: {
    organization_id?: string;
    subscription_id?: string;
    action: string;
    action_details: Record<string, unknown>;
    is_system: boolean;
  }
): Promise<void> {
  await serviceClient.from("subscription_audit_log").insert({
    ...event,
    performed_by: null,
    is_super_admin: false
  });
}

async function getOrganizationByStripeCustomer(
  serviceClient: SupabaseClient,
  stripeCustomerId: string
): Promise<string | null> {
  const { data } = await serviceClient
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", stripeCustomerId)
    .single();

  return data?.id || null;
}

async function getPlanByStripeProductOrPrice(
  serviceClient: SupabaseClient,
  stripeProductId?: string,
  stripePriceId?: string
): Promise<{ id: string; name: string } | null> {
  let query = serviceClient
    .from("subscription_plans")
    .select("id, name");

  if (stripeProductId) {
    query = query.eq("stripe_product_id", stripeProductId);
  } else if (stripePriceId) {
    query = query.or(
      `stripe_monthly_price_id.eq.${stripePriceId},stripe_annual_price_id.eq.${stripePriceId}`
    );
  }

  const { data } = await query.single();
  return data;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req: Request) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Create service client early for security logging
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    // Get raw body for signature verification
    const payload = await req.text();

    // Verify webhook signature
    const signature = req.headers.get("stripe-signature");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!signature || !webhookSecret) {
      console.error("Missing signature or webhook secret");
      await logSecurityAlert("webhook_missing_signature", {
        has_signature: !!signature,
        has_secret: !!webhookSecret,
        ip: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown"
      }, serviceClient);
      return new Response("Missing signature", { status: 400 });
    }

    const verificationResult = await verifyWebhookSignature(payload, signature, webhookSecret);
    if (!verificationResult.valid) {
      await logSecurityAlert("webhook_verification_failed", {
        error_code: verificationResult.errorCode,
        error_message: verificationResult.errorMessage,
        ip: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown"
      }, serviceClient);
      return new Response(JSON.stringify({
        error: "Invalid signature",
        code: verificationResult.errorCode
      }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    // Parse the event
    const event = JSON.parse(payload);

    // Check for replay attack
    if (isReplayAttack(event.id)) {
      await logSecurityAlert("webhook_replay_attack", {
        event_id: event.id,
        event_type: event.type,
        ip: req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown"
      }, serviceClient);
      return new Response(JSON.stringify({
        error: "Event already processed",
        code: "replay_detected"
      }), { status: 409, headers: { "Content-Type": "application/json" } });
    }

    // Mark event as processed to prevent replay attacks
    markEventProcessed(event.id);

    console.log(`Processing webhook: ${event.type} (${event.id})`);

    // Route to appropriate handler
    switch (event.type) {
      // ========== Subscription Events ==========
      case "customer.subscription.created":
        await handleSubscriptionCreated(serviceClient, event.data.object);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(serviceClient, event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(serviceClient, event.data.object);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(serviceClient, event.data.object);
        break;

      // ========== Invoice Events ==========
      case "invoice.paid":
        await handleInvoicePaid(serviceClient, event.data.object);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(serviceClient, event.data.object);
        break;

      case "invoice.finalized":
        await handleInvoiceFinalized(serviceClient, event.data.object);
        break;

      // ========== Customer Events ==========
      case "customer.created":
      case "customer.updated":
        // These are handled during checkout, no action needed
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({
      error: "Webhook processing failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

// ============================================================================
// SUBSCRIPTION EVENT HANDLERS
// ============================================================================

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at?: number;
  trial_start?: number;
  trial_end?: number;
  items: {
    data: Array<{
      price: {
        id: string;
        product: string;
      };
    }>;
  };
  metadata?: {
    organization_id?: string;
    plan_id?: string;
  };
}

async function handleSubscriptionCreated(
  serviceClient: SupabaseClient,
  subscription: StripeSubscription
): Promise<void> {
  console.log(`Subscription created: ${subscription.id}`);

  // Get organization ID from metadata or customer
  let organizationId = subscription.metadata?.organization_id;
  if (!organizationId) {
    organizationId = await getOrganizationByStripeCustomer(
      serviceClient,
      subscription.customer
    );
  }

  if (!organizationId) {
    console.error("No organization found for subscription:", subscription.id);
    await logSecurityAlert("webhook_missing_organization", {
      event_type: "customer.subscription.created",
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      reason: "No organization found for Stripe customer"
    }, serviceClient);
    return;
  }

  // Get plan from metadata or price
  let planId = subscription.metadata?.plan_id;
  if (!planId) {
    const priceId = subscription.items.data[0]?.price.id;
    const plan = await getPlanByStripeProductOrPrice(
      serviceClient,
      undefined,
      priceId
    );
    planId = plan?.id;
  }

  if (!planId) {
    console.error("No plan found for subscription:", subscription.id);
    await logSecurityAlert("webhook_missing_plan", {
      event_type: "customer.subscription.created",
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      organization_id: organizationId,
      stripe_price_id: subscription.items.data[0]?.price.id,
      reason: "No matching plan found for Stripe price"
    }, serviceClient);
    return;
  }

  // Determine billing cycle from price
  const priceId = subscription.items.data[0]?.price.id;
  const { data: plan } = await serviceClient
    .from("subscription_plans")
    .select("stripe_monthly_price_id, stripe_annual_price_id")
    .eq("id", planId)
    .single();

  const billingCycle = plan?.stripe_annual_price_id === priceId ? "annual" : "monthly";

  // Map Stripe status to our status
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "active",
    incomplete_expired: "canceled"
  };

  // Update or create subscription record
  const { error } = await serviceClient
    .from("organization_subscriptions")
    .upsert({
      organization_id: organizationId,
      plan_id: planId,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      status: statusMap[subscription.status] || "active",
      billing_cycle: billingCycle,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      trial_start: subscription.trial_start
        ? new Date(subscription.trial_start * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      cancel_at_period_end: subscription.cancel_at_period_end
    }, {
      onConflict: "organization_id"
    });

  if (error) {
    console.error("Failed to create subscription:", error);
    return;
  }

  await logAuditEvent(serviceClient, {
    organization_id: organizationId,
    action: "subscription_created",
    action_details: {
      stripe_subscription_id: subscription.id,
      plan_id: planId,
      status: subscription.status
    },
    is_system: true
  });
}

async function handleSubscriptionUpdated(
  serviceClient: SupabaseClient,
  subscription: StripeSubscription
): Promise<void> {
  console.log(`Subscription updated: ${subscription.id}`);

  // Find existing subscription
  const { data: existing } = await serviceClient
    .from("organization_subscriptions")
    .select("organization_id, plan_id, status")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!existing) {
    console.log("No existing subscription found, treating as new");
    await handleSubscriptionCreated(serviceClient, subscription);
    return;
  }

  // Check for plan change
  const priceId = subscription.items.data[0]?.price.id;
  const newPlan = await getPlanByStripeProductOrPrice(
    serviceClient,
    undefined,
    priceId
  );

  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "active",
    incomplete_expired: "canceled"
  };

  const updates: Record<string, unknown> = {
    status: statusMap[subscription.status] || "active",
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null
  };

  if (newPlan && newPlan.id !== existing.plan_id) {
    updates.plan_id = newPlan.id;
  }

  await serviceClient
    .from("organization_subscriptions")
    .update(updates)
    .eq("stripe_subscription_id", subscription.id);

  // Log appropriate audit event
  let action = "subscription_updated";
  if (newPlan && newPlan.id !== existing.plan_id) {
    action = "plan_changed";
  } else if (statusMap[subscription.status] !== existing.status) {
    action = "status_changed";
  }

  await logAuditEvent(serviceClient, {
    organization_id: existing.organization_id,
    action,
    action_details: {
      previous_status: existing.status,
      new_status: statusMap[subscription.status],
      cancel_at_period_end: subscription.cancel_at_period_end
    },
    is_system: true
  });
}

async function handleSubscriptionDeleted(
  serviceClient: SupabaseClient,
  subscription: StripeSubscription
): Promise<void> {
  console.log(`Subscription deleted: ${subscription.id}`);

  // Find existing subscription
  const { data: existing } = await serviceClient
    .from("organization_subscriptions")
    .select("organization_id")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!existing) {
    console.log("No subscription found for deletion");
    return;
  }

  // Get free plan
  const { data: freePlan } = await serviceClient
    .from("subscription_plans")
    .select("id")
    .eq("name", "free")
    .single();

  // Downgrade to free plan
  await serviceClient
    .from("organization_subscriptions")
    .update({
      plan_id: freePlan?.id,
      status: "active",
      stripe_subscription_id: null,
      billing_cycle: null,
      current_period_start: new Date().toISOString(),
      current_period_end: null,
      cancel_at_period_end: false,
      canceled_at: null
    })
    .eq("stripe_subscription_id", subscription.id);

  await logAuditEvent(serviceClient, {
    organization_id: existing.organization_id,
    action: "subscription_ended",
    action_details: {
      stripe_subscription_id: subscription.id,
      downgraded_to: "free"
    },
    is_system: true
  });
}

async function handleTrialWillEnd(
  serviceClient: SupabaseClient,
  subscription: StripeSubscription
): Promise<void> {
  console.log(`Trial ending soon: ${subscription.id}`);

  const { data: existing } = await serviceClient
    .from("organization_subscriptions")
    .select("organization_id, billing_email")
    .eq("stripe_subscription_id", subscription.id)
    .single();

  if (!existing) {
    return;
  }

  // Log the event (email notification would be sent here)
  await logAuditEvent(serviceClient, {
    organization_id: existing.organization_id,
    action: "trial_ending_soon",
    action_details: {
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      days_remaining: subscription.trial_end
        ? Math.ceil((subscription.trial_end * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
        : 0
    },
    is_system: true
  });

  // TODO: Send email notification to billing_email
}

// ============================================================================
// INVOICE EVENT HANDLERS
// ============================================================================

interface StripeInvoice {
  id: string;
  customer: string;
  subscription?: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  status: string;
  paid: boolean;
  payment_intent?: string;
  charge?: string;
  hosted_invoice_url?: string;
  invoice_pdf?: string;
  created: number;
  due_date?: number;
  lines: {
    data: Array<{
      description: string;
      amount: number;
    }>;
  };
}

async function handleInvoicePaid(
  serviceClient: SupabaseClient,
  invoice: StripeInvoice
): Promise<void> {
  console.log(`Invoice paid: ${invoice.id}`);

  // Get organization
  const organizationId = await getOrganizationByStripeCustomer(
    serviceClient,
    invoice.customer
  );

  if (!organizationId) {
    console.log("No organization found for invoice");
    return;
  }

  // Get subscription ID
  const { data: subscription } = await serviceClient
    .from("organization_subscriptions")
    .select("id")
    .eq("organization_id", organizationId)
    .single();

  // Record invoice
  await serviceClient.from("subscription_invoices").upsert({
    organization_id: organizationId,
    subscription_id: subscription?.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent,
    stripe_charge_id: invoice.charge,
    amount_cents: invoice.amount_paid,
    amount_paid_cents: invoice.amount_paid,
    currency: invoice.currency,
    status: "paid",
    invoice_date: new Date(invoice.created * 1000).toISOString(),
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    paid_at: new Date().toISOString(),
    invoice_pdf_url: invoice.invoice_pdf,
    hosted_invoice_url: invoice.hosted_invoice_url,
    line_items: invoice.lines.data.map(line => ({
      description: line.description,
      amount: line.amount
    }))
  }, {
    onConflict: "stripe_invoice_id"
  });

  // Update subscription status to active if it was past_due
  await serviceClient
    .from("organization_subscriptions")
    .update({ status: "active" })
    .eq("organization_id", organizationId)
    .eq("status", "past_due");

  await logAuditEvent(serviceClient, {
    organization_id: organizationId,
    action: "payment_succeeded",
    action_details: {
      invoice_id: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency
    },
    is_system: true
  });
}

async function handlePaymentFailed(
  serviceClient: SupabaseClient,
  invoice: StripeInvoice
): Promise<void> {
  console.log(`Payment failed: ${invoice.id}`);

  const organizationId = await getOrganizationByStripeCustomer(
    serviceClient,
    invoice.customer
  );

  if (!organizationId) {
    return;
  }

  // Update subscription status
  await serviceClient
    .from("organization_subscriptions")
    .update({ status: "past_due" })
    .eq("organization_id", organizationId);

  // Record failed invoice
  await serviceClient.from("subscription_invoices").upsert({
    organization_id: organizationId,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent,
    amount_cents: invoice.amount_due,
    amount_paid_cents: 0,
    currency: invoice.currency,
    status: "open",
    invoice_date: new Date(invoice.created * 1000).toISOString(),
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    hosted_invoice_url: invoice.hosted_invoice_url
  }, {
    onConflict: "stripe_invoice_id"
  });

  await logAuditEvent(serviceClient, {
    organization_id: organizationId,
    action: "payment_failed",
    action_details: {
      invoice_id: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency
    },
    is_system: true
  });

  // TODO: Send email notification about failed payment
}

async function handleInvoiceFinalized(
  serviceClient: SupabaseClient,
  invoice: StripeInvoice
): Promise<void> {
  console.log(`Invoice finalized: ${invoice.id}`);

  const organizationId = await getOrganizationByStripeCustomer(
    serviceClient,
    invoice.customer
  );

  if (!organizationId) {
    return;
  }

  // Record draft invoice
  await serviceClient.from("subscription_invoices").upsert({
    organization_id: organizationId,
    stripe_invoice_id: invoice.id,
    amount_cents: invoice.amount_due,
    amount_paid_cents: 0,
    currency: invoice.currency,
    status: "open",
    invoice_date: new Date(invoice.created * 1000).toISOString(),
    due_date: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
    hosted_invoice_url: invoice.hosted_invoice_url,
    invoice_pdf_url: invoice.invoice_pdf,
    line_items: invoice.lines.data.map(line => ({
      description: line.description,
      amount: line.amount
    }))
  }, {
    onConflict: "stripe_invoice_id"
  });
}
