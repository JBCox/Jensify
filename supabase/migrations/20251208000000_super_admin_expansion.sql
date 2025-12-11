-- ============================================================================
-- SUPER ADMIN EXPANSION - Phase 1
-- ============================================================================
-- Creates 8 new tables for enhanced super admin functionality:
-- 1. platform_settings - Global configuration
-- 2. platform_announcements - System-wide notifications
-- 3. email_templates - Customizable email content
-- 4. impersonation_sessions - User impersonation audit trail
-- 5. platform_error_logs - Centralized error tracking
-- 6. scheduled_tasks - Cron job registry
-- 7. api_keys - API key management
-- 8. integration_health - External service monitoring

-- ============================================================================
-- 1. PLATFORM SETTINGS - Global Configuration
-- ============================================================================

CREATE TABLE platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('general', 'security', 'billing', 'features', 'email')),
  is_sensitive BOOLEAN DEFAULT false,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE platform_settings IS 'Global platform configuration settings (maintenance mode, signup toggles, etc.)';
COMMENT ON COLUMN platform_settings.key IS 'Unique setting key (e.g., maintenance_mode, signups_enabled)';
COMMENT ON COLUMN platform_settings.value IS 'JSONB value allowing flexible data structures';
COMMENT ON COLUMN platform_settings.is_sensitive IS 'If true, value should be masked in UI';

-- Insert default settings
INSERT INTO platform_settings (key, value, description, category) VALUES
('maintenance_mode', '{"enabled": false, "message": "", "scheduled_end": null}'::jsonb, 'Enable maintenance mode to block user access', 'general'),
('signups_enabled', '{"enabled": true, "require_invitation": false}'::jsonb, 'Control new user registration', 'general'),
('default_trial_days', '{"days": 14}'::jsonb, 'Default trial period for new paid subscriptions', 'billing'),
('platform_features', '{"beta_api": false, "new_dashboard": true}'::jsonb, 'Platform-wide feature flags', 'features');

-- ============================================================================
-- 2. PLATFORM ANNOUNCEMENTS - System-wide Notifications
-- ============================================================================

CREATE TABLE platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'critical', 'maintenance')),
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('all', 'paid', 'free', 'admins')),
  display_location TEXT DEFAULT 'banner' CHECK (display_location IN ('banner', 'modal', 'toast')),
  is_dismissible BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE platform_announcements IS 'System-wide announcements shown to users';
COMMENT ON COLUMN platform_announcements.type IS 'Announcement severity: info, warning, critical, maintenance';
COMMENT ON COLUMN platform_announcements.target_audience IS 'Who sees this: all, paid, free, admins';
COMMENT ON COLUMN platform_announcements.display_location IS 'Where to show: banner, modal, toast';

-- ============================================================================
-- 3. EMAIL TEMPLATES - Customizable Email Content
-- ============================================================================

CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  text_body TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE email_templates IS 'Customizable email templates with variable substitution';
COMMENT ON COLUMN email_templates.name IS 'Template identifier (e.g., welcome, payment_reminder)';
COMMENT ON COLUMN email_templates.variables IS 'Array of variable names for substitution (e.g., ["user_name", "org_name"])';

-- Insert default templates
INSERT INTO email_templates (name, subject, html_body, text_body, variables) VALUES
('welcome', 'Welcome to Expensed!', '<h1>Welcome {{user_name}}!</h1><p>Your organization {{org_name}} is ready.</p>', 'Welcome {{user_name}}! Your organization {{org_name}} is ready.', '["user_name", "org_name"]'::jsonb),
('payment_reminder', 'Payment Required - {{org_name}}', '<h1>Payment Required</h1><p>Your payment for {{org_name}} is overdue. <a href="{{invoice_url}}">Pay Now</a></p>', 'Payment required for {{org_name}}. Pay at: {{invoice_url}}', '["org_name", "invoice_url"]'::jsonb),
('trial_ending', 'Your trial ends in {{days}} days', '<h1>Trial Ending Soon</h1><p>Your {{org_name}} trial ends in {{days}} days. Upgrade to continue.</p>', 'Your {{org_name}} trial ends in {{days}} days.', '["org_name", "days"]'::jsonb);

-- ============================================================================
-- 4. IMPERSONATION SESSIONS - Audit Trail for User Impersonation
-- ============================================================================

CREATE TABLE impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES super_admins(id),
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  target_org_id UUID REFERENCES organizations(id),
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  actions_taken JSONB DEFAULT '[]'::jsonb,
  ip_address INET,
  user_agent TEXT
);

COMMENT ON TABLE impersonation_sessions IS 'Audit trail for super admin user impersonation';
COMMENT ON COLUMN impersonation_sessions.reason IS 'Business justification for impersonation (required for compliance)';
COMMENT ON COLUMN impersonation_sessions.actions_taken IS 'Array of actions performed during session';

-- ============================================================================
-- 5. PLATFORM ERROR LOGS - Centralized Error Tracking
-- ============================================================================

CREATE TABLE platform_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL CHECK (error_type IN ('edge_function', 'webhook', 'auth', 'database', 'integration', 'other')),
  error_code TEXT,
  message TEXT NOT NULL,
  stack_trace TEXT,
  context JSONB,
  user_id UUID REFERENCES auth.users(id),
  organization_id UUID REFERENCES organizations(id),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE platform_error_logs IS 'Centralized error tracking for edge functions, webhooks, and integrations';
COMMENT ON COLUMN platform_error_logs.context IS 'Additional error context (request body, headers, etc.)';
COMMENT ON COLUMN platform_error_logs.severity IS 'Error severity for prioritization';

-- ============================================================================
-- 6. SCHEDULED TASKS - Cron Job Registry
-- ============================================================================

CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  cron_expression TEXT NOT NULL,
  function_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'running', 'skipped')),
  last_run_duration_ms INTEGER,
  last_error TEXT,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE scheduled_tasks IS 'Registry of scheduled tasks/cron jobs';
COMMENT ON COLUMN scheduled_tasks.cron_expression IS 'Cron expression (e.g., "0 0 1 * *" for monthly)';
COMMENT ON COLUMN scheduled_tasks.function_name IS 'Edge function to invoke';

-- Insert default scheduled tasks
INSERT INTO scheduled_tasks (name, description, cron_expression, function_name, is_enabled) VALUES
('reset_monthly_usage', 'Reset monthly receipt counters', '0 0 1 * *', 'reset-monthly-usage', true),
('check_expiring_trials', 'Send trial ending notifications', '0 9 * * *', 'check-expiring-trials', true),
('cleanup_expired_sessions', 'Remove expired auth sessions', '0 */6 * * *', 'cleanup-sessions', true),
('health_check_integrations', 'Check external service health', '*/15 * * * *', 'health-check', true);

-- ============================================================================
-- 7. API KEYS - API Key Management
-- ============================================================================

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes JSONB DEFAULT '["read"]'::jsonb,
  rate_limit INTEGER DEFAULT 1000,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE api_keys IS 'API key management for organization API access';
COMMENT ON COLUMN api_keys.key_prefix IS 'First 8 chars of key for display (e.g., "exp_live_")';
COMMENT ON COLUMN api_keys.key_hash IS 'Hashed key value (never store plaintext)';
COMMENT ON COLUMN api_keys.scopes IS 'Allowed scopes (e.g., ["read", "write", "admin"])';
COMMENT ON COLUMN api_keys.rate_limit IS 'Requests per hour';

-- ============================================================================
-- 8. INTEGRATION HEALTH - External Service Monitoring
-- ============================================================================

CREATE TABLE integration_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT CHECK (status IN ('healthy', 'degraded', 'down', 'unknown')) DEFAULT 'unknown',
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  consecutive_failures INTEGER DEFAULT 0,
  response_time_ms INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE integration_health IS 'Health monitoring for external integrations (Stripe, Google Vision, etc.)';
COMMENT ON COLUMN integration_health.consecutive_failures IS 'Counter for alerting on repeated failures';
COMMENT ON COLUMN integration_health.details IS 'Additional health check details (error messages, latency breakdown)';

-- Insert default integrations to track
INSERT INTO integration_health (service_name, display_name) VALUES
('stripe', 'Stripe Payments'),
('google_vision', 'Google Vision OCR'),
('google_maps', 'Google Maps API'),
('resend', 'Resend Email');

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_health ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Platform settings: only super admins
CREATE POLICY "Super admins can manage platform settings"
ON platform_settings FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

-- Announcements: super admins manage, all can read active ones
CREATE POLICY "Super admins can manage announcements"
ON platform_announcements FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "All users can read active announcements"
ON platform_announcements FOR SELECT
USING (is_active = true AND starts_at <= NOW() AND (ends_at IS NULL OR ends_at > NOW()));

-- Email templates: super admins only
CREATE POLICY "Super admins can manage email templates"
ON email_templates FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

-- Impersonation sessions: super admins only
CREATE POLICY "Super admins can manage impersonation sessions"
ON impersonation_sessions FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

-- Error logs: super admins only
CREATE POLICY "Super admins can view error logs"
ON platform_error_logs FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

-- Scheduled tasks: super admins only
CREATE POLICY "Super admins can manage scheduled tasks"
ON scheduled_tasks FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

-- API keys: org admins can manage their own, super admins can see all
CREATE POLICY "Super admins can view all API keys"
ON api_keys FOR SELECT
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Super admins can manage all API keys"
ON api_keys FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

CREATE POLICY "Org admins can manage their API keys"
ON api_keys FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active = true
  )
);

-- Integration health: super admins only
CREATE POLICY "Super admins can manage integration health"
ON integration_health FOR ALL
USING (EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid() AND is_active = true));

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX idx_platform_settings_key ON platform_settings(key);
CREATE INDEX idx_platform_settings_category ON platform_settings(category);
CREATE INDEX idx_announcements_active ON platform_announcements(is_active, starts_at, ends_at);
CREATE INDEX idx_announcements_audience ON platform_announcements(target_audience) WHERE is_active = true;
CREATE INDEX idx_email_templates_name ON email_templates(name);
CREATE INDEX idx_impersonation_admin ON impersonation_sessions(super_admin_id);
CREATE INDEX idx_impersonation_target ON impersonation_sessions(target_user_id);
CREATE INDEX idx_impersonation_org ON impersonation_sessions(target_org_id);
CREATE INDEX idx_error_logs_severity ON platform_error_logs(severity, is_resolved);
CREATE INDEX idx_error_logs_created ON platform_error_logs(created_at DESC);
CREATE INDEX idx_error_logs_type ON platform_error_logs(error_type);
CREATE INDEX idx_error_logs_org ON platform_error_logs(organization_id);
CREATE INDEX idx_scheduled_tasks_enabled ON scheduled_tasks(is_enabled) WHERE is_enabled = true;
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_integration_health_status ON integration_health(status);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function: Log platform error
CREATE OR REPLACE FUNCTION log_platform_error(
  p_error_type TEXT,
  p_message TEXT,
  p_severity TEXT DEFAULT 'medium',
  p_context JSONB DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_organization_id UUID DEFAULT NULL
) RETURNS UUID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_error_id UUID;
BEGIN
  INSERT INTO platform_error_logs (
    error_type,
    message,
    severity,
    context,
    stack_trace,
    error_code,
    user_id,
    organization_id
  )
  VALUES (
    p_error_type,
    p_message,
    p_severity,
    p_context,
    p_stack_trace,
    p_error_code,
    p_user_id,
    p_organization_id
  )
  RETURNING id INTO v_error_id;

  RETURN v_error_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_platform_error IS 'Helper function to log platform errors from edge functions and webhooks';

-- Function: Update scheduled task status
CREATE OR REPLACE FUNCTION update_scheduled_task_status(
  p_task_name TEXT,
  p_status TEXT,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error TEXT DEFAULT NULL
) RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE scheduled_tasks
  SET
    last_run_at = NOW(),
    last_run_status = p_status,
    last_run_duration_ms = p_duration_ms,
    last_error = p_error
  WHERE name = p_task_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_scheduled_task_status IS 'Update scheduled task execution status';

-- Function: Record impersonation action
CREATE OR REPLACE FUNCTION record_impersonation_action(
  p_session_id UUID,
  p_action TEXT,
  p_details JSONB DEFAULT NULL
) RETURNS VOID 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actions JSONB;
  v_new_action JSONB;
BEGIN
  -- Build action record
  v_new_action := jsonb_build_object(
    'action', p_action,
    'timestamp', NOW(),
    'details', p_details
  );

  -- Get existing actions
  SELECT actions_taken INTO v_actions
  FROM impersonation_sessions
  WHERE id = p_session_id;

  -- Append new action
  v_actions := COALESCE(v_actions, '[]'::jsonb) || v_new_action;

  -- Update session
  UPDATE impersonation_sessions
  SET actions_taken = v_actions
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_impersonation_action IS 'Record action performed during impersonation session';

-- ============================================================================
-- UPDATED SUPER ADMIN PERMISSIONS STRUCTURE
-- ============================================================================

-- Add new permission columns to super_admins table
-- (Assumes super_admins table exists from previous migration 20251207000000_subscription_system.sql)

DO $$
BEGIN
  -- Update permissions JSONB to include new fields
  -- This updates the default permissions structure
  -- Existing records will need manual migration if they exist
  EXECUTE 'COMMENT ON TABLE super_admins IS ''Super admin users with platform-level permissions. Permissions now include: view_organizations, manage_subscriptions, issue_refunds, create_coupons, view_analytics, manage_super_admins, manage_settings, manage_announcements, manage_email_templates, impersonate_users, view_error_logs, manage_plans, manage_api_keys, export_data, delete_organizations, bulk_operations''';
END $$;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View: Active announcements for current user
CREATE OR REPLACE VIEW active_announcements AS
SELECT
  a.id,
  a.title,
  a.message,
  a.type,
  a.target_audience,
  a.display_location,
  a.is_dismissible,
  a.starts_at,
  a.ends_at
FROM platform_announcements a
WHERE
  a.is_active = true
  AND a.starts_at <= NOW()
  AND (a.ends_at IS NULL OR a.ends_at > NOW());

COMMENT ON VIEW active_announcements IS 'Currently active announcements visible to users';

-- View: Error log summary
CREATE OR REPLACE VIEW error_log_summary AS
SELECT
  error_type,
  severity,
  COUNT(*) as error_count,
  COUNT(*) FILTER (WHERE is_resolved = false) as unresolved_count,
  MAX(created_at) as last_occurrence
FROM platform_error_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY error_type, severity
ORDER BY unresolved_count DESC, error_count DESC;

COMMENT ON VIEW error_log_summary IS 'Error log statistics for the last 7 days';

-- View: Integration health dashboard
CREATE OR REPLACE VIEW integration_health_dashboard AS
SELECT
  service_name,
  display_name,
  status,
  last_check_at,
  last_success_at,
  consecutive_failures,
  response_time_ms,
  CASE
    WHEN last_check_at IS NULL THEN 'Never checked'
    WHEN last_check_at < NOW() - INTERVAL '1 hour' THEN 'Stale'
    ELSE 'Current'
  END as check_freshness
FROM integration_health
ORDER BY
  CASE status
    WHEN 'down' THEN 1
    WHEN 'degraded' THEN 2
    WHEN 'unknown' THEN 3
    WHEN 'healthy' THEN 4
  END,
  service_name;

COMMENT ON VIEW integration_health_dashboard IS 'Integration health status with freshness indicators';

-- ============================================================================
-- GRANTS (Security)
-- ============================================================================

-- Revoke public access to all new tables (RLS will control access)
REVOKE ALL ON platform_settings FROM public;
REVOKE ALL ON platform_announcements FROM public;
REVOKE ALL ON email_templates FROM public;
REVOKE ALL ON impersonation_sessions FROM public;
REVOKE ALL ON platform_error_logs FROM public;
REVOKE ALL ON scheduled_tasks FROM public;
REVOKE ALL ON api_keys FROM public;
REVOKE ALL ON integration_health FROM public;

-- Grant authenticated users SELECT on views
GRANT SELECT ON active_announcements TO authenticated;
GRANT SELECT ON integration_health_dashboard TO authenticated;

-- Grant anon users SELECT on active_announcements (for public status page)
GRANT SELECT ON active_announcements TO anon;

-- ============================================================================
-- AUDIT TRIGGERS (Optional - for tracking changes to sensitive tables)
-- ============================================================================

-- Trigger: Track platform_settings changes
CREATE OR REPLACE FUNCTION audit_platform_settings()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log change to subscription_audit_log
  INSERT INTO subscription_audit_log (
    action,
    action_details,
    performed_by,
    is_super_admin,
    is_system
  ) VALUES (
    'platform_setting_changed',
    jsonb_build_object(
      'key', NEW.key,
      'old_value', OLD.value,
      'new_value', NEW.value,
      'category', NEW.category
    ),
    auth.uid(),
    true,
    false
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_platform_settings_update
AFTER UPDATE ON platform_settings
FOR EACH ROW
WHEN (OLD.value IS DISTINCT FROM NEW.value)
EXECUTE FUNCTION audit_platform_settings();

COMMENT ON TRIGGER on_platform_settings_update ON platform_settings IS 'Audit trail for platform settings changes';
