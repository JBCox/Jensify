import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Allowed origins for CORS - explicit list for security
const ALLOWED_ORIGINS = [
  'https://expensed.app',
  'https://www.expensed.app',
  'https://bfudcugrarerqvvyfpoz.supabase.co',
  'http://localhost:4200', // Development only
];

function getCorsHeaders(origin: string | null): Record<string, string> {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
}

// Test account emails - passwords are stored in Supabase Secrets
const TEST_ACCOUNTS = [
  'testadmin@e2etest.com',
  'testfinance@e2etest.com',
  'testmanager@e2etest.com',
  'testemployee@e2etest.com',
];

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authorization - require admin API key or super admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // This function requires the service role key (set in Supabase secrets)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify user is super admin before allowing password updates
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is super admin
    const { data: profile } = await supabaseClient
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return new Response(
        JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get test passwords from environment (secure storage)
    const testPasswords: Record<string, string> = {
      'testadmin@e2etest.com': Deno.env.get('TEST_ADMIN_PASSWORD') ?? '',
      'testfinance@e2etest.com': Deno.env.get('TEST_FINANCE_PASSWORD') ?? '',
      'testmanager@e2etest.com': Deno.env.get('TEST_MANAGER_PASSWORD') ?? '',
      'testemployee@e2etest.com': Deno.env.get('TEST_EMPLOYEE_PASSWORD') ?? '',
    };

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const email of TEST_ACCOUNTS) {
      const password = testPasswords[email];
      if (!password) {
        results.push({ email, success: false, error: 'Password not configured in secrets' });
        continue;
      }

      try {
        // Get user by email
        const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();

        if (listError) {
          results.push({ email, success: false, error: 'Failed to list users' });
          continue;
        }

        const targetUser = users.users.find(u => u.email === email);

        if (!targetUser) {
          results.push({ email, success: false, error: 'User not found' });
          continue;
        }

        // Update password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
          targetUser.id,
          { password }
        );

        if (updateError) {
          results.push({ email, success: false, error: 'Failed to update password' });
        } else {
          results.push({ email, success: true });
        }
      } catch (err) {
        results.push({ email, success: false, error: 'Internal error' });
      }
    }

    // SECURITY: Never return passwords in response
    return new Response(
      JSON.stringify({
        message: 'Password update complete',
        results,
        // Passwords are NOT returned - check Supabase Secrets for values
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    // Don't expose internal error details
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
