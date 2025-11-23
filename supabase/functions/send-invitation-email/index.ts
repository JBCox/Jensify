// Supabase Edge Function: send-invitation-email
// Sends invitation emails to users invited to join an organization

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins (production and development)
const ALLOWED_ORIGINS = [
  "https://bfudcugrarerqvvyfpoz.supabase.co", // Supabase project URL
  "https://yourapp.com",           // Production domain (when deployed)
  "https://www.yourapp.com",       // Production www domain (when deployed)
  "http://localhost:4200",         // Angular dev server
  "http://localhost:3000",         // Alternative dev port
];

/**
 * Get CORS headers with origin validation
 */
function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]; // Default to first allowed origin

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Credentials": "true",
  };
}

interface InvitationEmailRequest {
  invitation_id: string;
  email: string;
  token: string;
  organization_id: string;
}

interface Invitation {
  id: string;
  organization_id: string;
  invited_by: string;
  role: string;
  department?: string;
  expires_at: string;
  organization: {
    name: string;
  };
  inviter: {
    full_name: string;
  };
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ========================================================================
    // SECURITY: Verify authentication and authorization
    // ========================================================================

    // Get JWT from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Initialize Supabase client with user's JWT (not service role!)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") as string;
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth
      .getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        },
      );
    }

    // Get request body
    const { invitation_id, email, token: invitationToken, organization_id }:
      InvitationEmailRequest = await req.json();

    if (!invitation_id || !email || !invitationToken || !organization_id) {
      throw new Error("Missing required fields");
    }

    // Verify user is admin or manager of the organization
    const { data: membership, error: membershipError } = await supabaseClient
      .from("organization_members")
      .select("role, is_active")
      .eq("organization_id", organization_id)
      .eq("user_id", user.id)
      .single();

    if (membershipError || !membership || !membership.is_active) {
      return new Response(
        JSON.stringify({ error: "You are not a member of this organization" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }

    if (!["admin", "manager"].includes(membership.role)) {
      return new Response(
        JSON.stringify({
          error: "Only admins and managers can send invitations",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        },
      );
    }

    // Now use service role client to fetch invitation details (bypasses RLS for reading)
    const supabaseServiceKey = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    ) as string;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get invitation and organization details
    const { data: invitation, error: invitationError } = await supabase
      .from("invitations")
      .select(
        "*, organization:organizations!organization_id(*), inviter:users!invited_by(*)",
      )
      .eq("id", invitation_id)
      .single();

    if (invitationError || !invitation) {
      throw new Error("Invitation not found");
    }

    // Build invitation link
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:4200";
    const invitationLink = `${appUrl}/auth/accept-invitation?token=${token}`;

    // Prepare email content
    const emailSubject =
      `You're invited to join ${invitation.organization.name} on Jensify`;
    const emailHtml = generateEmailHtml(invitation, invitationLink);
    const emailText = generateEmailText(invitation, invitationLink);

    // Send email (using Resend, SendGrid, or your preferred service)
    // For now, this is a placeholder. You'll need to integrate with an email service
    const emailServiceApiKey = Deno.env.get("EMAIL_SERVICE_API_KEY");

    if (!emailServiceApiKey) {
      console.log(
        "Email service not configured. Invitation link:",
        invitationLink,
      );
      // Return success even if email service is not configured (for development)
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email service not configured (development mode)",
          invitationLink,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Example: Send via Resend (https://resend.com)
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${emailServiceApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Jensify Expenses <invitations@kanknot.com>",
        to: [email],
        subject: emailSubject,
        html: emailHtml,
        text: emailText,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      throw new Error(`Failed to send email: ${error}`);
    }

    const emailData = await emailResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailData.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error sending invitation email:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message || "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

/**
 * Generate HTML email content
 */
function generateEmailHtml(
  invitation: Invitation,
  invitationLink: string,
): string {
  const organizationName = invitation.organization?.name || "an organization";
  const inviterName = invitation.inviter?.full_name || "Your team";
  const role = invitation.role || "employee";
  const expiresAt = new Date(invitation.expires_at).toLocaleDateString();

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to ${organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background-color: #ff5900;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px;">You're Invited!</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #333333;">
                Hi there,
              </p>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.5; color: #333333;">
                ${inviterName} has invited you to join <strong>${organizationName}</strong> on Jensify,
                our expense management platform.
              </p>

              <table style="width: 100%; margin: 30px 0; background-color: #f9f9f9; border-radius: 8px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong>Your Role:</strong> ${role}</p>
                    ${
    invitation.department
      ? `<p style="margin: 0 0 10px; font-size: 14px; color: #666666;"><strong>Department:</strong> ${invitation.department}</p>`
      : ""
  }
                    <p style="margin: 0; font-size: 14px; color: #666666;"><strong>Expires:</strong> ${expiresAt}</p>
                  </td>
                </tr>
              </table>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${invitationLink}"
                   style="display: inline-block; padding: 14px 32px; background-color: #ff5900; color: #ffffff; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                  Accept Invitation
                </a>
              </div>

              <p style="margin: 20px 0 0; font-size: 14px; line-height: 1.5; color: #666666;">
                Or copy and paste this link into your browser:<br>
                <a href="${invitationLink}" style="color: #ff5900; word-break: break-all;">${invitationLink}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9f9f9; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; font-size: 12px; color: #999999; text-align: center;">
                This invitation will expire on ${expiresAt}. If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 10px 0 0; font-size: 12px; color: #999999; text-align: center;">
                © 2025 Jensify. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Generate plain text email content
 */
function generateEmailText(
  invitation: Invitation,
  invitationLink: string,
): string {
  const organizationName = invitation.organization?.name || "an organization";
  const inviterName = invitation.inviter?.full_name || "Your team";
  const role = invitation.role || "employee";
  const expiresAt = new Date(invitation.expires_at).toLocaleDateString();

  return `
You're Invited to Join ${organizationName}!

${inviterName} has invited you to join ${organizationName} on Jensify, our expense management platform.

Your Role: ${role}
${
    invitation.department
      ? `Department: ${invitation.department}\n`
      : ""
  }Expires: ${expiresAt}

To accept this invitation, visit:
${invitationLink}

This invitation will expire on ${expiresAt}. If you didn't expect this invitation, you can safely ignore this email.

© 2025 Jensify. All rights reserved.
  `.trim();
}
