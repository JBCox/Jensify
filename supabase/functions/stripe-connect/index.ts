/**
 * Supabase Edge Function: Stripe Connect Integration (v2 API)
 *
 * Handles Stripe Connect for organization payouts:
 * - Create Connect onboarding links for admins
 * - Handle OAuth callbacks
 * - Create employee bank account tokens
 * - Process payouts
 *
 * SECURITY: Stripe Secret Key is stored as environment secret
 * All bank data is tokenized through Stripe - we never handle raw account numbers
 *
 * NOTE: Uses Stripe Connect v2 Accounts API for improved account management
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins
const ALLOWED_ORIGINS = [
  "https://bfudcugrarerqvvyfpoz.supabase.co",
  "http://localhost:4200",
  "http://localhost:3000"
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true"
  };
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({
        error: "Missing authorization header"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: authHeader
          }
        }
      }
    );

    // Verify user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Get Stripe secret key
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      console.error("STRIPE_SECRET_KEY not configured");
      return new Response(JSON.stringify({
        error: "Stripe not configured"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    // Parse request
    const { action, ...params } = await req.json();

    // Route to appropriate handler
    switch (action) {
      case "create_connect_account":
        return await handleCreateConnectAccount(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "create_account_link":
        return await handleCreateAccountLink(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "get_account_status":
        return await handleGetAccountStatus(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "disconnect_account":
        return await handleDisconnectAccount(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "create_bank_account":
        return await handleCreateBankAccount(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "verify_bank_account":
        return await handleVerifyBankAccount(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "create_payout":
        return await handleCreatePayout(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "get_payout_status":
        return await handleGetPayoutStatus(supabaseClient, user, stripeSecretKey, params, corsHeaders);
      case "update_payout_method":
        return await handleUpdatePayoutMethod(supabaseClient, user, params, corsHeaders);
      default:
        return new Response(JSON.stringify({
          error: `Unknown action: ${action}`
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
    }
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});

/**
 * Create a new Stripe Connect account for an organization using v2 API
 * v2 API provides unified account model with better onboarding
 */
async function handleCreateConnectAccount(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { organization_id, return_url, refresh_url } = params;

  // Verify user is admin of the organization
  const { data: membership, error: memberError } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (memberError || !membership || membership.role !== "admin") {
    return new Response(JSON.stringify({
      error: "Only organization admins can connect Stripe"
    }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Check if org already has a Stripe account
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_account_id, name")
    .eq("id", organization_id)
    .single();

  if (org?.stripe_account_id) {
    return new Response(JSON.stringify({
      error: "Organization already has a Stripe account connected"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Create Stripe Connect account using v2 API
  // v2 API uses JSON body and unified account model
  const accountResponse = await fetch("https://api.stripe.com/v2/core/accounts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/json",
      "Stripe-Version": "2025-01-27.acacia"
    },
    body: JSON.stringify({
      // Identity information - will be collected during onboarding
      identity: {
        country: "US",
        entity_type: "company",
        business_details: {
          registered_name: org?.name || undefined
        }
      },
      // Configuration for marketplace payouts
      configuration: {
        recipient: {
          // Enable receiving transfers from platform
          capabilities: {
            transfers: { requested: true }
          },
          // Stripe handles onboarding/compliance
          service_agreement: "recipient"
        }
      },
      // Include hosted onboarding
      include: ["configuration.recipient.capabilities"]
    })
  });

  if (!accountResponse.ok) {
    const error = await accountResponse.text();
    console.error("Stripe v2 account creation failed:", error);

    // Fallback to v1 API if v2 fails (for compatibility)
    console.log("Attempting fallback to v1 API...");
    const v1Response = await fetch("https://api.stripe.com/v1/accounts", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        "type": "express",
        "country": "US",
        "capabilities[transfers][requested]": "true",
        "business_profile[name]": org?.name || ""
      })
    });

    if (!v1Response.ok) {
      const v1Error = await v1Response.text();
      console.error("Stripe v1 fallback also failed:", v1Error);
      return new Response(JSON.stringify({
        error: "Failed to create Stripe account",
        details: v1Error
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const v1Account = await v1Response.json();

    // Save v1 account ID to organization
    await supabase
      .from("organizations")
      .update({
        stripe_account_id: v1Account.id,
        stripe_account_status: "pending",
        stripe_connected_at: new Date().toISOString()
      })
      .eq("id", organization_id);

    // Create account link for v1 account
    const linkResponse = await fetch("https://api.stripe.com/v1/account_links", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        "account": v1Account.id,
        "refresh_url": refresh_url,
        "return_url": return_url,
        "type": "account_onboarding"
      })
    });

    const accountLink = await linkResponse.json();

    return new Response(JSON.stringify({
      success: true,
      account_id: v1Account.id,
      onboarding_url: accountLink.url,
      expires_at: accountLink.expires_at,
      api_version: "v1_fallback"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const account = await accountResponse.json();

  // Save account ID to organization
  await supabase
    .from("organizations")
    .update({
      stripe_account_id: account.id,
      stripe_account_status: "pending",
      stripe_connected_at: new Date().toISOString()
    })
    .eq("id", organization_id);

  // Create account link for onboarding (still uses v1 endpoint)
  const linkResponse = await fetch("https://api.stripe.com/v1/account_links", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      "account": account.id,
      "refresh_url": refresh_url,
      "return_url": return_url,
      "type": "account_onboarding"
    })
  });

  if (!linkResponse.ok) {
    const linkError = await linkResponse.text();
    console.error("Account link creation failed:", linkError);
    return new Response(JSON.stringify({
      error: "Failed to create onboarding link"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const accountLink = await linkResponse.json();

  return new Response(JSON.stringify({
    success: true,
    account_id: account.id,
    onboarding_url: accountLink.url,
    expires_at: accountLink.expires_at,
    api_version: "v2"
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Create a new account link for continuing/refreshing onboarding
 */
async function handleCreateAccountLink(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { organization_id, return_url, refresh_url } = params;

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_account_id")
    .eq("id", organization_id)
    .single();

  if (!org?.stripe_account_id) {
    return new Response(JSON.stringify({
      error: "No Stripe account found"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const linkResponse = await fetch("https://api.stripe.com/v1/account_links", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      "account": org.stripe_account_id,
      "refresh_url": refresh_url,
      "return_url": return_url,
      "type": "account_onboarding"
    })
  });

  if (!linkResponse.ok) {
    return new Response(JSON.stringify({
      error: "Failed to create account link"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const accountLink = await linkResponse.json();

  return new Response(JSON.stringify({
    success: true,
    onboarding_url: accountLink.url
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Get Stripe account status for an organization
 * Uses v1 API directly for reliability (v2 API has compatibility issues)
 */
async function handleGetAccountStatus(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { organization_id } = params;

  console.log("[get_account_status] Starting with organization_id:", organization_id);
  console.log("[get_account_status] User:", user.id, user.email);

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("stripe_account_id, stripe_account_status, payout_method")
    .eq("id", organization_id)
    .single();

  console.log("[get_account_status] Database query result:", { org, error: orgError });

  if (!org?.stripe_account_id) {
    console.log("[get_account_status] No stripe_account_id found, returning not connected");
    return new Response(JSON.stringify({
      connected: false,
      payout_method: org?.payout_method || "manual"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  console.log("[get_account_status] Found stripe_account_id:", org.stripe_account_id);

  // Use v1 API directly for reliability
  const v1Response = await fetch(
    `https://api.stripe.com/v1/accounts/${org.stripe_account_id}`,
    {
      headers: {
        "Authorization": `Bearer ${stripeKey}`
      }
    }
  );

  console.log("[get_account_status] Stripe API response status:", v1Response.status);

  if (!v1Response.ok) {
    console.log("[get_account_status] Stripe API error, returning cached status");
    // If account not found, return cached status from database
    return new Response(JSON.stringify({
      connected: !!org.stripe_account_id,
      status: org.stripe_account_status || "pending",
      payout_method: org.payout_method || "manual",
      charges_enabled: org.stripe_account_status === "active",
      payouts_enabled: org.stripe_account_status === "active",
      business_name: "",
      api_version: "cached"
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const account = await v1Response.json();

  // v1 account status logic
  const chargesEnabled = account.charges_enabled;
  const payoutsEnabled = account.payouts_enabled;
  const businessName = account.business_profile?.name || "";

  let status = "pending";
  if (chargesEnabled && payoutsEnabled) {
    status = "active";
  } else if (account.details_submitted) {
    status = "restricted";
  }

  if (status !== org.stripe_account_status) {
    console.log("[get_account_status] Updating status from", org.stripe_account_status, "to", status);
    await supabase
      .from("organizations")
      .update({
        stripe_account_status: status
      })
      .eq("id", organization_id);
  }

  const finalResponse = {
    connected: true,
    status,
    payout_method: org.payout_method,
    charges_enabled: chargesEnabled,
    payouts_enabled: payoutsEnabled,
    business_name: businessName,
    api_version: "v1"
  };

  console.log("[get_account_status] Returning successful response:", finalResponse);

  return new Response(JSON.stringify(finalResponse), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Disconnect Stripe account
 */
async function handleDisconnectAccount(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { organization_id } = params;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({
      error: "Only admins can disconnect Stripe"
    }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  await supabase
    .from("organizations")
    .update({
      stripe_account_id: null,
      stripe_account_status: "not_connected",
      stripe_connected_at: null,
      payout_method: "manual"
    })
    .eq("id", organization_id);

  return new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Update organization payout method
 */
async function handleUpdatePayoutMethod(
  supabase: any,
  user: any,
  params: any,
  corsHeaders: any
) {
  const { organization_id, payout_method } = params;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || membership.role !== "admin") {
    return new Response(JSON.stringify({
      error: "Only admins can change payout method"
    }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  await supabase
    .from("organizations")
    .update({
      payout_method
    })
    .eq("id", organization_id);

  return new Response(JSON.stringify({
    success: true,
    payout_method
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Create a tokenized bank account for an employee
 */
async function handleCreateBankAccount(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { organization_id, bank_account_token } = params;

  // Verify membership
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership) {
    return new Response(JSON.stringify({
      error: "Not a member of this organization"
    }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Get or create Stripe customer
  let customerId: string;
  const { data: existing } = await supabase
    .from("employee_bank_accounts")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .limit(1)
    .single();

  if (existing?.stripe_customer_id) {
    customerId = existing.stripe_customer_id;
  } else {
    const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        "email": user.email,
        "metadata[user_id]": user.id
      })
    });

    if (!customerResponse.ok) {
      return new Response(JSON.stringify({
        error: "Failed to create payment profile"
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }

    const customer = await customerResponse.json();
    customerId = customer.id;
  }

  // Attach bank account token
  const bankResponse = await fetch(
    `https://api.stripe.com/v1/customers/${customerId}/sources`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        "source": bank_account_token
      })
    }
  );

  if (!bankResponse.ok) {
    const error = await bankResponse.text();
    console.error("Bank account error:", error);
    return new Response(JSON.stringify({
      error: "Failed to add bank account"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const bankAccount = await bankResponse.json();

  // Check if first account
  const { count } = await supabase
    .from("employee_bank_accounts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("organization_id", organization_id);

  const isFirst = (count || 0) === 0;

  // Save to database
  const { data: saved, error: saveError } = await supabase
    .from("employee_bank_accounts")
    .insert({
      user_id: user.id,
      organization_id,
      stripe_bank_account_id: bankAccount.id,
      stripe_customer_id: customerId,
      bank_name: bankAccount.bank_name,
      account_holder_name: bankAccount.account_holder_name,
      last_four: bankAccount.last4,
      is_default: isFirst,
      verification_status: "pending"
    })
    .select()
    .single();

  if (saveError) {
    return new Response(JSON.stringify({
      error: "Failed to save bank account"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    bank_account: {
      id: saved.id,
      bank_name: bankAccount.bank_name,
      last_four: bankAccount.last4,
      is_default: isFirst
    }
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Verify bank account with micro-deposits
 */
async function handleVerifyBankAccount(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { bank_account_id, amounts } = params;

  const { data: bankAccount } = await supabase
    .from("employee_bank_accounts")
    .select("stripe_bank_account_id, stripe_customer_id")
    .eq("id", bank_account_id)
    .eq("user_id", user.id)
    .single();

  if (!bankAccount) {
    return new Response(JSON.stringify({
      error: "Bank account not found"
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const verifyResponse = await fetch(
    `https://api.stripe.com/v1/customers/${bankAccount.stripe_customer_id}/sources/${bankAccount.stripe_bank_account_id}/verify`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        "amounts[0]": amounts[0].toString(),
        "amounts[1]": amounts[1].toString()
      })
    }
  );

  if (!verifyResponse.ok) {
    const error = await verifyResponse.json();
    return new Response(JSON.stringify({
      error: "Verification failed",
      message: error.error?.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  await supabase
    .from("employee_bank_accounts")
    .update({
      is_verified: true,
      verification_status: "verified",
      verified_at: new Date().toISOString()
    })
    .eq("id", bank_account_id);

  return new Response(JSON.stringify({
    success: true,
    verified: true
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Create a payout to an employee
 */
async function handleCreatePayout(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { organization_id, employee_user_id, amount_cents, expense_ids } = params;

  // Verify finance/admin role
  const { data: membership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organization_id)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .single();

  if (!membership || !['admin', 'finance'].includes(membership.role)) {
    return new Response(JSON.stringify({
      error: "Only finance or admin can create payouts"
    }), {
      status: 403,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Get org Stripe account
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_account_id, stripe_account_status")
    .eq("id", organization_id)
    .single();

  if (!org?.stripe_account_id || org.stripe_account_status !== "active") {
    return new Response(JSON.stringify({
      error: "Stripe account not active"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Get employee's bank account
  const { data: bankAccount } = await supabase
    .from("employee_bank_accounts")
    .select("id, stripe_customer_id, is_verified")
    .eq("user_id", employee_user_id)
    .eq("organization_id", organization_id)
    .eq("is_default", true)
    .single();

  if (!bankAccount) {
    return new Response(JSON.stringify({
      error: "Employee has no bank account"
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Create payout record
  const { data: payoutRecord, error: payoutError } = await supabase
    .from("payouts")
    .insert({
      organization_id,
      user_id: employee_user_id,
      bank_account_id: bankAccount.id,
      amount_cents,
      payout_method: "stripe_ach",
      status: "processing",
      expense_ids,
      initiated_by: user.id,
      initiated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (payoutError) {
    return new Response(JSON.stringify({
      error: "Failed to create payout"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  // Create Stripe payout
  const payoutResponse = await fetch("https://api.stripe.com/v1/payouts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Stripe-Account": org.stripe_account_id,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      "amount": amount_cents.toString(),
      "currency": "usd",
      "metadata[payout_id]": payoutRecord.id,
      "metadata[employee_id]": employee_user_id
    })
  });

  if (!payoutResponse.ok) {
    const error = await payoutResponse.json();
    await supabase
      .from("payouts")
      .update({
        status: "failed",
        failure_reason: error.error?.message,
        failed_at: new Date().toISOString()
      })
      .eq("id", payoutRecord.id);

    return new Response(JSON.stringify({
      error: "Payout failed",
      message: error.error?.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  const stripePayout = await payoutResponse.json();

  await supabase
    .from("payouts")
    .update({
      stripe_payout_id: stripePayout.id,
      status: "in_transit",
      estimated_arrival: new Date(stripePayout.arrival_date * 1000).toISOString()
    })
    .eq("id", payoutRecord.id);

  // Mark expenses as reimbursed
  if (expense_ids.length > 0) {
    await supabase
      .from("expenses")
      .update({
        status: "reimbursed",
        reimbursed_at: new Date().toISOString(),
        reimbursed_by: user.id
      })
      .in("id", expense_ids);
  }

  return new Response(JSON.stringify({
    success: true,
    payout: {
      id: payoutRecord.id,
      amount_cents,
      status: "in_transit",
      stripe_payout_id: stripePayout.id
    }
  }), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

/**
 * Get payout status
 */
async function handleGetPayoutStatus(
  supabase: any,
  user: any,
  stripeKey: string,
  params: any,
  corsHeaders: any
) {
  const { payout_id } = params;

  const { data: payout } = await supabase
    .from("payouts")
    .select("*")
    .eq("id", payout_id)
    .single();

  if (!payout) {
    return new Response(JSON.stringify({
      error: "Payout not found"
    }), {
      status: 404,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }

  return new Response(JSON.stringify(payout), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
