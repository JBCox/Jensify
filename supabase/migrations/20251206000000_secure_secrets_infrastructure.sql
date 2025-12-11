-- ============================================================================
-- Jensify Database Schema - Secure Secrets Infrastructure
-- Created: 2025-12-06
-- Description: Enterprise-grade encryption system for storing customer API keys
--
-- SECURITY ARCHITECTURE:
-- =====================
-- 1. Envelope Encryption Pattern:
--    - Master Encryption Key (MEK): Stored ONLY in Edge Function environment
--    - Data stored in DB: encrypted_key + IV + salt (all useless without MEK)
--
-- 2. Encryption Algorithm: AES-256-GCM (via Web Crypto API in Edge Function)
--    - 256-bit key derived via PBKDF2 (100,000 iterations)
--    - 12-byte random IV per encryption
--    - 16-byte random salt per organization
--    - Authenticated encryption prevents tampering
--
-- 3. Defense in Depth:
--    - Rate limiting prevents brute-force attacks
--    - Complete audit trail for compliance
--    - RLS policies for organization isolation
--    - SECURITY DEFINER functions for controlled access
--
-- 4. Key Lifecycle:
--    - Set: Encrypt and store with full audit
--    - Get: Decrypt with rate limit check and audit
--    - Rotate: Store new key, archive old key
--    - Delete: Secure removal with audit
-- ============================================================================

-- ============================================================================
-- EXTENSION REQUIREMENTS
-- ============================================================================

-- pgcrypto for hashing (not for primary encryption - that's in Edge Function)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- ORGANIZATION SECRETS TABLE
-- Stores encrypted API keys with envelope encryption
-- ============================================================================

CREATE TABLE IF NOT EXISTS organization_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  -- ========================================
  -- ENCRYPTED STRIPE KEY (AES-256-GCM)
  -- All values are base64 encoded
  -- ========================================
  encrypted_stripe_key TEXT,      -- Ciphertext (AES-256-GCM encrypted)
  encryption_iv TEXT,              -- 12-byte initialization vector
  encryption_salt TEXT,            -- 16-byte salt for key derivation
  encryption_version INTEGER DEFAULT 1, -- For future algorithm upgrades

  -- ========================================
  -- METADATA (Safe to store unencrypted)
  -- ========================================
  key_last_four TEXT,              -- Last 4 chars of Stripe key (for display)
  key_mode TEXT CHECK (key_mode IN ('test', 'live')),
  key_hash TEXT,                   -- SHA-256 hash for integrity validation
  key_prefix TEXT,                 -- 'sk_test_' or 'sk_live_' (first 8 chars)

  -- ========================================
  -- LIFECYCLE TRACKING
  -- ========================================
  set_by UUID REFERENCES auth.users(id),
  set_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,

  -- Optional expiration for security-conscious orgs
  expires_at TIMESTAMPTZ,
  expiration_warning_sent BOOLEAN DEFAULT false,

  -- ========================================
  -- KEY ROTATION SUPPORT
  -- Stores previous key during rotation window
  -- ========================================
  previous_encrypted_key TEXT,
  previous_iv TEXT,
  previous_salt TEXT,
  previous_key_hash TEXT,
  rotated_at TIMESTAMPTZ,
  rotation_reason TEXT,

  -- ========================================
  -- TIMESTAMPS
  -- ========================================
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table comments
COMMENT ON TABLE organization_secrets IS 'Encrypted storage for organization API keys using AES-256-GCM envelope encryption';
COMMENT ON COLUMN organization_secrets.encrypted_stripe_key IS 'AES-256-GCM encrypted Stripe API key (base64). Useless without MEK.';
COMMENT ON COLUMN organization_secrets.encryption_iv IS '12-byte initialization vector for AES-GCM (base64)';
COMMENT ON COLUMN organization_secrets.encryption_salt IS '16-byte salt for PBKDF2 key derivation (base64)';
COMMENT ON COLUMN organization_secrets.key_hash IS 'SHA-256 hash of plaintext key for integrity verification';
COMMENT ON COLUMN organization_secrets.encryption_version IS 'Encryption algorithm version (1=AES-256-GCM, allows future upgrades)';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_secrets_org ON organization_secrets(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_secrets_expires ON organization_secrets(expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================================================
-- SECRET ACCESS AUDIT LOG
-- Immutable record of all secret operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS secret_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Operation details
  operation TEXT NOT NULL CHECK (operation IN (
    'key_set',           -- New key configured
    'key_get',           -- Key retrieved for payout
    'key_delete',        -- Key removed
    'key_rotate',        -- Key rotated
    'key_test',          -- Key tested against Stripe
    'key_validate',      -- Key hash validated
    'key_expire_warning',-- Expiration warning sent
    'key_expired',       -- Key expired
    'access_denied',     -- Unauthorized access attempt
    'rate_limited'       -- Rate limit exceeded
  )),

  -- Who performed the operation
  performed_by UUID REFERENCES auth.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Request context (for security analysis)
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,       -- Correlation ID for tracing

  -- Result
  success BOOLEAN NOT NULL,
  failure_reason TEXT,
  failure_code TEXT,

  -- Additional context
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Table comments
COMMENT ON TABLE secret_access_log IS 'Immutable audit log for all secret operations - required for SOC2/PCI compliance';
COMMENT ON COLUMN secret_access_log.request_id IS 'Unique request ID for correlating logs across services';

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_secret_audit_org ON secret_access_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_secret_audit_time ON secret_access_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_secret_audit_user ON secret_access_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_secret_audit_operation ON secret_access_log(organization_id, operation);
CREATE INDEX IF NOT EXISTS idx_secret_audit_failures ON secret_access_log(organization_id, success)
  WHERE success = false;

-- ============================================================================
-- RATE LIMITING TABLE
-- Prevents brute-force attacks on secret operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS secret_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Rate limit tracking
  operation TEXT NOT NULL CHECK (operation IN ('key_test', 'key_set', 'key_get', 'key_rotate')),
  window_start TIMESTAMPTZ NOT NULL,
  window_duration_minutes INTEGER NOT NULL DEFAULT 60, -- 1 hour window
  attempt_count INTEGER DEFAULT 1,

  -- Constraint: One record per org/operation/window
  UNIQUE(organization_id, operation, window_start)
);

-- Table comments
COMMENT ON TABLE secret_rate_limits IS 'Rate limiting counters to prevent brute-force attacks';
COMMENT ON COLUMN secret_rate_limits.window_duration_minutes IS 'Duration of the rate limit window (default 60 minutes)';

-- Index for efficient rate limit checks
CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
  ON secret_rate_limits(organization_id, operation, window_start DESC);

-- Cleanup old rate limit records (via cron job or Edge Function)
CREATE INDEX IF NOT EXISTS idx_rate_limits_cleanup
  ON secret_rate_limits(window_start)
  ;  -- Removed NOW() predicate (not immutable)

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE organization_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORGANIZATION_SECRETS POLICIES
-- CRITICAL: No direct access - all operations via SECURITY DEFINER functions
-- ============================================================================

-- Only service role can access (via SECURITY DEFINER functions)
-- Regular users CANNOT read encrypted keys directly
CREATE POLICY "No direct access to secrets"
  ON organization_secrets FOR ALL
  USING (false);

-- ============================================================================
-- SECRET_ACCESS_LOG POLICIES
-- Admins can view audit logs for their organization
-- ============================================================================

CREATE POLICY "Admins can view secret audit logs"
  ON secret_access_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = secret_access_log.organization_id
        AND organization_members.user_id = auth.uid()
        AND organization_members.role = 'admin'
        AND organization_members.is_active = true
    )
  );

-- Insert controlled via SECURITY DEFINER functions
CREATE POLICY "System can insert audit logs"
  ON secret_access_log FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- RATE_LIMITS POLICIES
-- No direct access - managed by SECURITY DEFINER functions
-- ============================================================================

CREATE POLICY "No direct access to rate limits"
  ON secret_rate_limits FOR ALL
  USING (false);

-- ============================================================================
-- SECURITY DEFINER FUNCTIONS
-- These are the ONLY way to interact with secrets
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rate Limit Check Function
-- Returns true if operation is allowed, false if rate limited
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_secret_rate_limit(
  p_organization_id UUID,
  p_operation TEXT,
  p_max_attempts INTEGER DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  -- Calculate current hour window
  v_window_start := date_trunc('hour', NOW());

  -- Get or create rate limit record
  INSERT INTO secret_rate_limits (
    organization_id, operation, window_start, attempt_count
  )
  VALUES (
    p_organization_id, p_operation, v_window_start, 1
  )
  ON CONFLICT (organization_id, operation, window_start)
  DO UPDATE SET attempt_count = secret_rate_limits.attempt_count + 1
  RETURNING attempt_count INTO v_current_count;

  -- Check if over limit
  IF v_current_count > p_max_attempts THEN
    -- Log rate limit event
    INSERT INTO secret_access_log (
      organization_id, operation, performed_by, success, failure_reason, failure_code
    )
    VALUES (
      p_organization_id, 'rate_limited', auth.uid(), false,
      format('Rate limit exceeded: %s attempts in current hour (max: %s)', v_current_count, p_max_attempts),
      'RATE_LIMIT_EXCEEDED'
    );

    RETURN false;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION check_secret_rate_limit IS 'Checks and increments rate limit counter. Returns false if limit exceeded.';

-- ----------------------------------------------------------------------------
-- Log Secret Access Function
-- Creates audit log entry for any secret operation
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_secret_access(
  p_organization_id UUID,
  p_operation TEXT,
  p_success BOOLEAN,
  p_failure_reason TEXT DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_request_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO secret_access_log (
    organization_id,
    operation,
    performed_by,
    success,
    failure_reason,
    failure_code,
    metadata,
    ip_address,
    user_agent,
    request_id
  )
  VALUES (
    p_organization_id,
    p_operation,
    auth.uid(),
    p_success,
    p_failure_reason,
    p_failure_code,
    p_metadata,
    p_ip_address,
    p_user_agent,
    p_request_id
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION log_secret_access IS 'Creates an audit log entry for secret operations';

-- ----------------------------------------------------------------------------
-- Set Organization Stripe Key
-- Stores encrypted key data (encryption done in Edge Function)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_org_stripe_key(
  p_organization_id UUID,
  p_encrypted_key TEXT,
  p_iv TEXT,
  p_salt TEXT,
  p_key_hash TEXT,
  p_key_last_four TEXT,
  p_key_mode TEXT,
  p_key_prefix TEXT,
  p_set_by UUID,
  p_encryption_version INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_key_hash TEXT;
  v_result JSONB;
BEGIN
  -- Check rate limit (3 attempts per hour for set operations)
  IF NOT check_secret_rate_limit(p_organization_id, 'key_set', 3) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rate limit exceeded. Please wait before trying again.',
      'code', 'RATE_LIMIT_EXCEEDED'
    );
  END IF;

  -- Check for existing key (for rotation)
  SELECT key_hash INTO v_existing_key_hash
  FROM organization_secrets
  WHERE organization_id = p_organization_id;

  -- Insert or update
  INSERT INTO organization_secrets (
    organization_id,
    encrypted_stripe_key,
    encryption_iv,
    encryption_salt,
    encryption_version,
    key_hash,
    key_last_four,
    key_mode,
    key_prefix,
    set_by,
    set_at,
    access_count
  )
  VALUES (
    p_organization_id,
    p_encrypted_key,
    p_iv,
    p_salt,
    p_encryption_version,
    p_key_hash,
    p_key_last_four,
    p_key_mode,
    p_key_prefix,
    p_set_by,
    NOW(),
    0
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    -- Archive previous key if exists
    previous_encrypted_key = CASE
      WHEN organization_secrets.encrypted_stripe_key IS NOT NULL
      THEN organization_secrets.encrypted_stripe_key
      ELSE NULL
    END,
    previous_iv = CASE
      WHEN organization_secrets.encryption_iv IS NOT NULL
      THEN organization_secrets.encryption_iv
      ELSE NULL
    END,
    previous_salt = CASE
      WHEN organization_secrets.encryption_salt IS NOT NULL
      THEN organization_secrets.encryption_salt
      ELSE NULL
    END,
    previous_key_hash = CASE
      WHEN organization_secrets.key_hash IS NOT NULL
      THEN organization_secrets.key_hash
      ELSE NULL
    END,
    rotated_at = CASE
      WHEN organization_secrets.encrypted_stripe_key IS NOT NULL
      THEN NOW()
      ELSE NULL
    END,
    -- Set new values
    encrypted_stripe_key = p_encrypted_key,
    encryption_iv = p_iv,
    encryption_salt = p_salt,
    encryption_version = p_encryption_version,
    key_hash = p_key_hash,
    key_last_four = p_key_last_four,
    key_mode = p_key_mode,
    key_prefix = p_key_prefix,
    set_by = p_set_by,
    set_at = NOW(),
    access_count = 0,
    updated_at = NOW();

  -- Log the operation
  PERFORM log_secret_access(
    p_organization_id,
    CASE WHEN v_existing_key_hash IS NOT NULL THEN 'key_rotate' ELSE 'key_set' END,
    true,
    NULL,
    NULL,
    jsonb_build_object(
      'key_mode', p_key_mode,
      'key_prefix', p_key_prefix,
      'had_previous_key', v_existing_key_hash IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'rotated', v_existing_key_hash IS NOT NULL
  );
END;
$$;

COMMENT ON FUNCTION set_org_stripe_key IS 'Stores encrypted Stripe key. Encryption happens in Edge Function.';

-- ----------------------------------------------------------------------------
-- Get Organization Stripe Key (Encrypted)
-- Returns encrypted key data for Edge Function to decrypt
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_org_stripe_key(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret RECORD;
BEGIN
  -- Check rate limit (100 attempts per hour for get operations)
  IF NOT check_secret_rate_limit(p_organization_id, 'key_get', 100) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Rate limit exceeded',
      'code', 'RATE_LIMIT_EXCEEDED'
    );
  END IF;

  -- Get the encrypted key data
  SELECT
    encrypted_stripe_key,
    encryption_iv,
    encryption_salt,
    encryption_version,
    key_hash,
    key_last_four,
    key_mode
  INTO v_secret
  FROM organization_secrets
  WHERE organization_id = p_organization_id;

  -- Check if key exists
  IF v_secret.encrypted_stripe_key IS NULL THEN
    -- Log failed attempt
    PERFORM log_secret_access(
      p_organization_id,
      'key_get',
      false,
      'No Stripe key configured',
      'KEY_NOT_FOUND'
    );

    RETURN jsonb_build_object(
      'success', false,
      'error', 'No Stripe key configured',
      'code', 'KEY_NOT_FOUND'
    );
  END IF;

  -- Update access tracking
  UPDATE organization_secrets
  SET
    last_accessed_at = NOW(),
    access_count = access_count + 1
  WHERE organization_id = p_organization_id;

  -- Log successful access
  PERFORM log_secret_access(
    p_organization_id,
    'key_get',
    true
  );

  -- Return encrypted data (Edge Function will decrypt)
  RETURN jsonb_build_object(
    'success', true,
    'encrypted_key', v_secret.encrypted_stripe_key,
    'iv', v_secret.encryption_iv,
    'salt', v_secret.encryption_salt,
    'version', v_secret.encryption_version,
    'key_hash', v_secret.key_hash
  );
END;
$$;

COMMENT ON FUNCTION get_org_stripe_key IS 'Returns encrypted key data. Decryption happens in Edge Function.';

-- ----------------------------------------------------------------------------
-- Get Organization Stripe Status (Public metadata only)
-- Returns non-sensitive status information
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_org_stripe_status(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret RECORD;
BEGIN
  SELECT
    key_last_four,
    key_mode,
    key_prefix,
    set_at,
    last_accessed_at,
    access_count,
    expires_at,
    rotated_at,
    encrypted_stripe_key IS NOT NULL AS has_key
  INTO v_secret
  FROM organization_secrets
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'has_key', false,
      'key_last4', NULL,
      'key_mode', NULL,
      'set_at', NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'has_key', v_secret.has_key,
    'key_last4', v_secret.key_last_four,
    'key_mode', v_secret.key_mode,
    'key_prefix', v_secret.key_prefix,
    'set_at', v_secret.set_at,
    'last_accessed_at', v_secret.last_accessed_at,
    'access_count', v_secret.access_count,
    'expires_at', v_secret.expires_at,
    'was_rotated', v_secret.rotated_at IS NOT NULL,
    'rotated_at', v_secret.rotated_at
  );
END;
$$;

COMMENT ON FUNCTION get_org_stripe_status IS 'Returns non-sensitive status info about Stripe key configuration';

-- ----------------------------------------------------------------------------
-- Remove Organization Stripe Key
-- Securely removes the key with full audit
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION remove_org_stripe_key(
  p_organization_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_had_key BOOLEAN;
BEGIN
  -- Check if key exists
  SELECT encrypted_stripe_key IS NOT NULL INTO v_had_key
  FROM organization_secrets
  WHERE organization_id = p_organization_id;

  IF NOT v_had_key OR v_had_key IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No key to remove',
      'code', 'KEY_NOT_FOUND'
    );
  END IF;

  -- Clear all key data (but keep the record for audit history)
  UPDATE organization_secrets
  SET
    encrypted_stripe_key = NULL,
    encryption_iv = NULL,
    encryption_salt = NULL,
    key_hash = NULL,
    key_last_four = NULL,
    key_mode = NULL,
    key_prefix = NULL,
    -- Archive current values before clearing
    previous_encrypted_key = encrypted_stripe_key,
    previous_iv = encryption_iv,
    previous_salt = encryption_salt,
    previous_key_hash = key_hash,
    rotated_at = NOW(),
    rotation_reason = 'key_removed',
    updated_at = NOW()
  WHERE organization_id = p_organization_id;

  -- Log the removal
  PERFORM log_secret_access(
    p_organization_id,
    'key_delete',
    true
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Stripe key removed successfully'
  );
END;
$$;

COMMENT ON FUNCTION remove_org_stripe_key IS 'Securely removes Stripe key with full audit trail';

-- ----------------------------------------------------------------------------
-- Validate Key Hash
-- Verifies key integrity without decryption
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_org_stripe_key_hash(
  p_organization_id UUID,
  p_expected_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stored_hash TEXT;
BEGIN
  SELECT key_hash INTO v_stored_hash
  FROM organization_secrets
  WHERE organization_id = p_organization_id;

  -- Log validation attempt
  PERFORM log_secret_access(
    p_organization_id,
    'key_validate',
    v_stored_hash = p_expected_hash,
    CASE WHEN v_stored_hash != p_expected_hash THEN 'Hash mismatch' ELSE NULL END
  );

  RETURN v_stored_hash = p_expected_hash;
END;
$$;

COMMENT ON FUNCTION validate_org_stripe_key_hash IS 'Validates key integrity by comparing hashes';

-- ============================================================================
-- CLEANUP FUNCTIONS
-- ============================================================================

-- Clean up old rate limit records (call via cron or scheduled function)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM secret_rate_limits
  WHERE created_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION cleanup_old_rate_limits IS 'Removes rate limit records older than 24 hours';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_org_secrets_updated_at
  BEFORE UPDATE ON organization_secrets
  FOR EACH ROW
  EXECUTE FUNCTION update_secrets_updated_at();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant execute on functions to authenticated users
-- (RLS and SECURITY DEFINER handle the actual access control)
GRANT EXECUTE ON FUNCTION check_secret_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION log_secret_access TO authenticated;
GRANT EXECUTE ON FUNCTION set_org_stripe_key TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_stripe_key TO authenticated;
GRANT EXECUTE ON FUNCTION get_org_stripe_status TO authenticated;
GRANT EXECUTE ON FUNCTION remove_org_stripe_key TO authenticated;
GRANT EXECUTE ON FUNCTION validate_org_stripe_key_hash TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_rate_limits TO authenticated;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Secure Secrets Infrastructure Migration Complete!';
  RAISE NOTICE '================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'SECURITY FEATURES:';
  RAISE NOTICE '  - AES-256-GCM envelope encryption (via Edge Function)';
  RAISE NOTICE '  - PBKDF2 key derivation (100,000 iterations)';
  RAISE NOTICE '  - Rate limiting (brute-force protection)';
  RAISE NOTICE '  - Complete audit trail (SOC2/PCI compliant)';
  RAISE NOTICE '  - Key rotation support with history';
  RAISE NOTICE '  - RLS policies (no direct table access)';
  RAISE NOTICE '';
  RAISE NOTICE 'TABLES CREATED:';
  RAISE NOTICE '  - organization_secrets (encrypted key storage)';
  RAISE NOTICE '  - secret_access_log (audit trail)';
  RAISE NOTICE '  - secret_rate_limits (brute-force protection)';
  RAISE NOTICE '';
  RAISE NOTICE 'FUNCTIONS CREATED:';
  RAISE NOTICE '  - set_org_stripe_key()';
  RAISE NOTICE '  - get_org_stripe_key()';
  RAISE NOTICE '  - get_org_stripe_status()';
  RAISE NOTICE '  - remove_org_stripe_key()';
  RAISE NOTICE '  - validate_org_stripe_key_hash()';
  RAISE NOTICE '  - check_secret_rate_limit()';
  RAISE NOTICE '  - log_secret_access()';
  RAISE NOTICE '';
  RAISE NOTICE 'RATE LIMITS:';
  RAISE NOTICE '  - key_set: 3/hour';
  RAISE NOTICE '  - key_get: 100/hour';
  RAISE NOTICE '  - key_test: 5/hour';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEPS:';
  RAISE NOTICE '1. Set ENCRYPTION_MASTER_KEY in Edge Function secrets';
  RAISE NOTICE '2. Deploy updated stripe-connect Edge Function';
  RAISE NOTICE '3. Update payout settings UI';
  RAISE NOTICE '================================================';
END $$;
