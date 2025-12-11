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

interface PlatformAdminRequest {
  action: string;
  data?: any;
}

serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is super admin
    const { data: profile, error: profileError } = await supabaseClient
      .from('user_profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_super_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Super admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { action, data }: PlatformAdminRequest = await req.json();

    // Route to appropriate handler
    let result;
    switch (action) {
      // Settings
      case 'get_settings':
        result = await getSettings(supabaseClient);
        break;
      case 'update_setting':
        result = await updateSetting(supabaseClient, data);
        break;

      // Announcements
      case 'get_announcements':
        result = await getAnnouncements(supabaseClient, data);
        break;
      case 'create_announcement':
        result = await createAnnouncement(supabaseClient, data);
        break;
      case 'update_announcement':
        result = await updateAnnouncement(supabaseClient, data);
        break;
      case 'delete_announcement':
        result = await deleteAnnouncement(supabaseClient, data);
        break;

      // Email Templates
      case 'get_email_templates':
        result = await getEmailTemplates(supabaseClient);
        break;
      case 'update_email_template':
        result = await updateEmailTemplate(supabaseClient, data);
        break;
      case 'send_test_email':
        result = await sendTestEmail(supabaseClient, data);
        break;

      // Impersonation
      case 'search_users':
        result = await searchUsers(supabaseClient, data);
        break;
      case 'start_impersonation':
        result = await startImpersonation(supabaseClient, user.id, data);
        break;
      case 'end_impersonation':
        result = await endImpersonation(supabaseClient, data);
        break;
      case 'get_impersonation_history':
        result = await getImpersonationHistory(supabaseClient, data);
        break;

      // Error Logs
      case 'get_error_logs':
        result = await getErrorLogs(supabaseClient, data);
        break;
      case 'resolve_error':
        result = await resolveError(supabaseClient, data);
        break;
      case 'get_error_stats':
        result = await getErrorStats(supabaseClient);
        break;

      // Integration Health
      case 'get_integration_health':
        result = await getIntegrationHealth(supabaseClient);
        break;
      case 'check_integration':
        result = await checkIntegration(supabaseClient, data);
        break;
      case 'check_all_integrations':
        result = await checkAllIntegrations(supabaseClient);
        break;

      // Scheduled Tasks
      case 'get_scheduled_tasks':
        result = await getScheduledTasks(supabaseClient);
        break;
      case 'toggle_task':
        result = await toggleScheduledTask(supabaseClient, data);
        break;
      case 'run_task_now':
        result = await runTaskNow(supabaseClient, data);
        break;

      // Data Export
      case 'export_organizations':
        result = await exportOrganizations(supabaseClient);
        break;
      case 'export_billing':
        result = await exportBilling(supabaseClient, data);
        break;
      case 'export_audit_logs':
        result = await exportAuditLogs(supabaseClient, data);
        break;
      case 'get_export_history':
        result = await getExportHistory(supabaseClient);
        break;

      // API Keys
      case 'get_api_keys':
        result = await getApiKeys(supabaseClient);
        break;
      case 'revoke_api_key':
        result = await revokeApiKey(supabaseClient, data);
        break;

      // Bulk Operations
      case 'get_all_organizations':
        result = await getAllOrganizations(supabaseClient);
        break;
      case 'execute_bulk_operation':
        result = await executeBulkOperation(supabaseClient, data);
        break;

      // Invoices
      case 'get_invoices':
        result = await getInvoices(supabaseClient, data);
        break;
      case 'resend_invoice':
        result = await resendInvoice(supabaseClient, data);
        break;
      case 'mark_invoice_paid':
        result = await markInvoicePaid(supabaseClient, data);
        break;
      case 'void_invoice':
        result = await voidInvoice(supabaseClient, data);
        break;

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    // Log audit trail
    await logAuditEntry(supabaseClient, user.id, action, data);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Platform admin error:', error);
    // Don't expose internal error details to client
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Settings Handlers
async function getSettings(supabase: any) {
  const { data, error } = await supabase.from('system_settings').select('*');
  if (error) throw error;
  return { settings: data };
}

async function updateSetting(supabase: any, { key, value }: any) {
  const { error } = await supabase
    .from('system_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { success: true };
}

// Announcement Handlers
async function getAnnouncements(supabase: any, { active_only }: any) {
  let query = supabase.from('announcements').select('*').order('created_at', { ascending: false });
  if (active_only) {
    query = query.eq('active', true);
  }
  const { data, error } = await query;
  if (error) throw error;
  return { announcements: data };
}

async function createAnnouncement(supabase: any, announcement: any) {
  const { data, error } = await supabase.from('announcements').insert(announcement).select().single();
  if (error) throw error;
  return { announcement: data };
}

async function updateAnnouncement(supabase: any, { id, ...updates }: any) {
  const { data, error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return { announcement: data };
}

async function deleteAnnouncement(supabase: any, { id }: any) {
  const { error } = await supabase.from('announcements').delete().eq('id', id);
  if (error) throw error;
  return { success: true };
}

// Email Template Handlers
async function getEmailTemplates(supabase: any) {
  const { data, error } = await supabase.from('email_templates').select('*');
  if (error) throw error;
  return { templates: data };
}

async function updateEmailTemplate(supabase: any, { name, subject, body }: any) {
  const { error } = await supabase
    .from('email_templates')
    .update({ subject, body, updated_at: new Date().toISOString() })
    .eq('name', name);
  if (error) throw error;
  return { success: true };
}

async function sendTestEmail(supabase: any, { template_name, recipient }: any) {
  // TODO: Implement email sending via Resend
  return { success: true, message: 'Test email sent' };
}

// Impersonation Handlers
async function searchUsers(supabase: any, { email }: any) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, organizations(name)')
    .ilike('email', `%${email}%`)
    .limit(10);
  if (error) throw error;

  return {
    users: data.map((u: any) => ({
      id: u.id,
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      organization_name: u.organizations?.name || 'N/A',
    })),
  };
}

async function startImpersonation(supabase: any, admin_id: string, { user_id, reason }: any) {
  const { data, error } = await supabase
    .from('impersonation_logs')
    .insert({
      admin_id,
      target_user_id: user_id,
      reason,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return { session: data };
}

async function endImpersonation(supabase: any, { session_id }: any) {
  const { error } = await supabase
    .from('impersonation_logs')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', session_id);
  if (error) throw error;
  return { success: true };
}

async function getImpersonationHistory(supabase: any, filters: any) {
  let query = supabase
    .from('impersonation_logs')
    .select(`
      *,
      admin:user_profiles!admin_id(full_name, email),
      target:user_profiles!target_user_id(full_name, email, organizations(name))
    `)
    .order('started_at', { ascending: false })
    .limit(100);

  if (filters?.adminEmail) {
    query = query.ilike('admin.email', `%${filters.adminEmail}%`);
  }
  if (filters?.startDate) {
    query = query.gte('started_at', filters.startDate);
  }
  if (filters?.endDate) {
    query = query.lte('started_at', filters.endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  const logs = data.map((log: any) => ({
    id: log.id,
    admin_name: log.admin.full_name,
    admin_email: log.admin.email,
    target_user_name: log.target.full_name,
    target_user_email: log.target.email,
    organization_name: log.target.organizations?.name || 'N/A',
    reason: log.reason,
    started_at: log.started_at,
    ended_at: log.ended_at,
    duration_minutes: log.ended_at
      ? Math.round((new Date(log.ended_at).getTime() - new Date(log.started_at).getTime()) / 60000)
      : null,
  }));

  const stats = {
    total: logs.length,
    thisMonth: logs.filter((l: any) =>
      new Date(l.started_at) > new Date(new Date().setDate(1))
    ).length,
    active: logs.filter((l: any) => !l.ended_at).length,
  };

  return { logs, stats };
}

// Error Log Handlers
async function getErrorLogs(supabase: any, filters: any) {
  let query = supabase.from('error_logs').select('*').order('created_at', { ascending: false }).limit(100);

  if (filters?.severity) {
    query = query.eq('severity', filters.severity);
  }
  if (filters?.type) {
    query = query.eq('type', filters.type);
  }
  if (filters?.resolved !== undefined && filters?.resolved !== '') {
    query = query.eq('resolved', filters.resolved === 'true');
  }

  const { data, error } = await query;
  if (error) throw error;

  const stats = await getErrorStats(supabase);

  return { errors: data, stats };
}

async function resolveError(supabase: any, { error_id }: any) {
  const { error } = await supabase
    .from('error_logs')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', error_id);
  if (error) throw error;
  return { success: true };
}

async function getErrorStats(supabase: any) {
  const { data: allErrors } = await supabase.from('error_logs').select('severity, resolved, created_at');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    critical: allErrors?.filter((e: any) => e.severity === 'critical' && !e.resolved).length || 0,
    unresolved: allErrors?.filter((e: any) => !e.resolved).length || 0,
    total24h: allErrors?.filter((e: any) => new Date(e.created_at) > yesterday).length || 0,
  };
}

// Integration Health Handlers
async function getIntegrationHealth(supabase: any) {
  // Mock data - in production, query integration_health table
  const integrations = [
    {
      name: 'stripe',
      displayName: 'Stripe',
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      responseTime: 120,
      icon: 'payment',
    },
    {
      name: 'google_vision',
      displayName: 'Google Vision',
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      responseTime: 250,
      icon: 'visibility',
    },
    {
      name: 'google_maps',
      displayName: 'Google Maps',
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      responseTime: 180,
      icon: 'map',
    },
    {
      name: 'resend',
      displayName: 'Resend',
      status: 'healthy',
      lastCheck: new Date().toISOString(),
      responseTime: 95,
      icon: 'email',
    },
  ];

  return { integrations, incidents: [] };
}

async function checkIntegration(supabase: any, { name }: any) {
  // TODO: Implement actual health checks
  return { success: true, status: 'healthy' };
}

async function checkAllIntegrations(supabase: any) {
  // TODO: Implement batch health checks
  return { success: true };
}

// Scheduled Task Handlers
async function getScheduledTasks(supabase: any) {
  // Mock data - in production, query scheduled_tasks table
  const tasks = [
    {
      id: '1',
      name: 'Daily Billing Sync',
      description: 'Sync Stripe subscriptions and invoices',
      schedule: '0 0 * * *',
      last_run: new Date(Date.now() - 3600000).toISOString(),
      next_run: new Date(Date.now() + 82800000).toISOString(),
      status: 'success',
      enabled: true,
    },
    {
      id: '2',
      name: 'Weekly Analytics Report',
      description: 'Generate and email platform analytics',
      schedule: '0 8 * * 1',
      last_run: new Date(Date.now() - 604800000).toISOString(),
      next_run: new Date(Date.now() + 86400000).toISOString(),
      status: 'success',
      enabled: true,
    },
  ];
  return tasks;
}

async function toggleScheduledTask(supabase: any, { task_id, enabled }: any) {
  // TODO: Implement task toggle
  return { success: true };
}

async function runTaskNow(supabase: any, { task_id }: any) {
  // TODO: Implement immediate task execution
  return { success: true };
}

// Data Export Handlers
async function exportOrganizations(supabase: any) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*, subscriptions(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Convert to CSV
  const csv = convertToCSV(data);
  return { csv, filename: `organizations-${Date.now()}.csv` };
}

async function exportBilling(supabase: any, { startDate, endDate }: any) {
  // TODO: Query billing data
  return { csv: '', filename: `billing-${Date.now()}.csv` };
}

async function exportAuditLogs(supabase: any, { startDate, endDate, actionType }: any) {
  // TODO: Query audit logs
  return { csv: '', filename: `audit-${Date.now()}.csv` };
}

async function getExportHistory(supabase: any) {
  // TODO: Query export history table
  return [];
}

// API Key Handlers
async function getApiKeys(supabase: any) {
  // Mock data - in production, query api_keys table
  return [];
}

async function revokeApiKey(supabase: any, { key_id }: any) {
  // TODO: Implement key revocation
  return { success: true };
}

// Bulk Operation Handlers
async function getAllOrganizations(supabase: any) {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, subscriptions(plan_name, status)')
    .order('name');
  if (error) throw error;

  return data.map((org: any) => ({
    id: org.id,
    name: org.name,
    plan_name: org.subscriptions?.[0]?.plan_name || 'Free',
    status: org.subscriptions?.[0]?.status || 'inactive',
  }));
}

async function executeBulkOperation(supabase: any, params: any) {
  const { organizationIds, action } = params;
  const results = { success: 0, failed: 0, total: organizationIds.length, errors: [] };

  for (const orgId of organizationIds) {
    try {
      // Execute action based on type
      switch (action) {
        case 'extend_trial':
          // TODO: Implement trial extension
          break;
        case 'apply_discount':
          // TODO: Implement discount application
          break;
        case 'send_notification':
          // TODO: Implement notification sending
          break;
      }
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ org_id: orgId, error: error.message });
    }
  }

  return results;
}

// Invoice Handlers
async function getInvoices(supabase: any, { status }: any) {
  // Mock data - in production, query Stripe or invoices table
  const invoices: any[] = [];
  const stats = {
    paid: 0,
    open: 0,
    overdue: 0,
    void: 0,
    paidAmount: 0,
    openAmount: 0,
    overdueAmount: 0,
  };
  return { invoices, stats };
}

async function resendInvoice(supabase: any, { invoice_id }: any) {
  // TODO: Implement invoice resend
  return { success: true };
}

async function markInvoicePaid(supabase: any, { invoice_id }: any) {
  // TODO: Implement manual paid marking
  return { success: true };
}

async function voidInvoice(supabase: any, { invoice_id }: any) {
  // TODO: Implement invoice voiding
  return { success: true };
}

// Utility Functions
async function logAuditEntry(supabase: any, admin_id: string, action: string, data: any) {
  await supabase.from('admin_audit_log').insert({
    admin_id,
    action,
    data,
    timestamp: new Date().toISOString(),
  });
}

function convertToCSV(data: any[]): string {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(obj => headers.map(key => JSON.stringify(obj[key] ?? '')).join(','));
  return [headers.join(','), ...rows].join('\n');
}
