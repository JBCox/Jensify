-- Email-based Expense Creation Migration
-- Allow users to submit expenses by emailing receipts

-- =============================================================================
-- EMAIL INBOX CONFIGURATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_inbox_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Inbox settings
  inbox_address TEXT NOT NULL, -- e.g., expenses@yourorg.jensify.com
  is_enabled BOOLEAN DEFAULT true,

  -- Processing settings
  auto_create_expense BOOLEAN DEFAULT true, -- Auto-create draft expense
  default_category TEXT, -- Default category for email expenses
  require_attachment BOOLEAN DEFAULT true, -- Must have receipt attachment

  -- Notification settings
  notify_on_receipt BOOLEAN DEFAULT true, -- Email user when processed
  notify_on_error BOOLEAN DEFAULT true, -- Email user on processing error

  -- Security
  allowed_sender_domains TEXT[], -- Restrict to specific domains
  require_verified_sender BOOLEAN DEFAULT false, -- Only process from verified emails

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_org_inbox UNIQUE (organization_id)
);

-- =============================================================================
-- USER EMAIL ALIASES
-- =============================================================================

-- Allow users to have multiple email addresses for submission
CREATE TABLE IF NOT EXISTS user_email_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  verified_at TIMESTAMP WITH TIME ZONE,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_email_alias UNIQUE (email, organization_id)
);

-- =============================================================================
-- INBOUND EMAILS LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS inbound_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Email details
  message_id TEXT NOT NULL, -- Email message ID for deduplication
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,

  -- Sender identification
  matched_user_id UUID REFERENCES users(id),

  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'rejected')),
  error_message TEXT,

  -- Results
  created_expense_id UUID REFERENCES expenses(id),
  created_receipt_id UUID REFERENCES receipts(id),

  -- Attachments
  attachment_count INT DEFAULT 0,

  -- Raw data
  raw_payload JSONB, -- Full webhook payload

  -- Audit
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT unique_message_id UNIQUE (message_id)
);

-- =============================================================================
-- EMAIL ATTACHMENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES inbound_emails(id) ON DELETE CASCADE,

  -- File info
  filename TEXT NOT NULL,
  content_type TEXT,
  file_size INT,
  storage_path TEXT, -- Supabase storage path

  -- Processing
  is_receipt BOOLEAN DEFAULT false, -- Identified as a receipt
  processed_receipt_id UUID REFERENCES receipts(id),

  -- OCR results
  ocr_status TEXT CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_result JSONB,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Match incoming email to user
CREATE OR REPLACE FUNCTION match_email_to_user(
  p_email TEXT,
  p_organization_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Try to match by primary email
  SELECT id INTO v_user_id
  FROM users
  WHERE LOWER(email) = LOWER(p_email)
    AND (p_organization_id IS NULL OR organization_id = p_organization_id)
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RETURN v_user_id;
  END IF;

  -- Try to match by alias
  SELECT user_id INTO v_user_id
  FROM user_email_aliases
  WHERE LOWER(email) = LOWER(p_email)
    AND is_verified = true
    AND (p_organization_id IS NULL OR organization_id = p_organization_id)
  LIMIT 1;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Get inbox config for organization
CREATE OR REPLACE FUNCTION get_inbox_config(p_inbox_address TEXT)
RETURNS TABLE (
  organization_id UUID,
  auto_create_expense BOOLEAN,
  default_category TEXT,
  require_attachment BOOLEAN,
  allowed_sender_domains TEXT[],
  require_verified_sender BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    eic.organization_id,
    eic.auto_create_expense,
    eic.default_category,
    eic.require_attachment,
    eic.allowed_sender_domains,
    eic.require_verified_sender
  FROM email_inbox_config eic
  WHERE LOWER(eic.inbox_address) = LOWER(p_inbox_address)
    AND eic.is_enabled = true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Process inbound email (called by Edge Function)
CREATE OR REPLACE FUNCTION process_inbound_email(
  p_email_id UUID,
  p_user_id UUID,
  p_organization_id UUID,
  p_expense_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_expense_id UUID;
  v_receipt_id UUID;
  v_config RECORD;
BEGIN
  -- Get inbox config
  SELECT * INTO v_config
  FROM email_inbox_config
  WHERE organization_id = p_organization_id;

  -- Create expense if auto-create is enabled
  IF v_config.auto_create_expense AND p_expense_data IS NOT NULL THEN
    INSERT INTO expenses (
      organization_id,
      user_id,
      merchant,
      amount,
      currency,
      category,
      expense_date,
      notes,
      status
    ) VALUES (
      p_organization_id,
      p_user_id,
      COALESCE(p_expense_data->>'merchant', 'Email Receipt'),
      COALESCE((p_expense_data->>'amount')::DECIMAL, 0),
      COALESCE(p_expense_data->>'currency', 'USD'),
      COALESCE(p_expense_data->>'category', v_config.default_category, 'miscellaneous'),
      COALESCE((p_expense_data->>'date')::DATE, CURRENT_DATE),
      COALESCE(p_expense_data->>'notes', 'Created from email'),
      'draft'
    )
    RETURNING id INTO v_expense_id;
  END IF;

  -- Update email record
  UPDATE inbound_emails
  SET
    status = 'processed',
    matched_user_id = p_user_id,
    created_expense_id = v_expense_id,
    processed_at = now()
  WHERE id = p_email_id;

  RETURN v_expense_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark email as failed
CREATE OR REPLACE FUNCTION mark_email_failed(
  p_email_id UUID,
  p_error TEXT
)
RETURNS void AS $$
BEGIN
  UPDATE inbound_emails
  SET
    status = 'failed',
    error_message = p_error,
    processed_at = now()
  WHERE id = p_email_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's unique submission email
CREATE OR REPLACE FUNCTION get_user_submission_email(
  p_user_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_org_id UUID;
  v_inbox TEXT;
  v_user_code TEXT;
BEGIN
  -- Get user's org
  SELECT organization_id INTO v_org_id
  FROM users WHERE id = p_user_id;

  -- Get inbox address
  SELECT inbox_address INTO v_inbox
  FROM email_inbox_config
  WHERE organization_id = v_org_id AND is_enabled = true;

  IF v_inbox IS NULL THEN
    RETURN NULL;
  END IF;

  -- Generate unique code (first 8 chars of user ID)
  v_user_code := SUBSTRING(p_user_id::TEXT, 1, 8);

  -- Format: expenses+userid@domain.com
  RETURN REPLACE(v_inbox, '@', '+' || v_user_code || '@');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================================================
-- EMAIL PROCESSING STATS VIEW
-- =============================================================================

CREATE OR REPLACE VIEW email_processing_stats AS
SELECT
  organization_id,
  COUNT(*) AS total_emails,
  COUNT(CASE WHEN status = 'processed' THEN 1 END) AS processed_count,
  COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_count,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
  COUNT(CASE WHEN created_expense_id IS NOT NULL THEN 1 END) AS expenses_created,
  AVG(EXTRACT(EPOCH FROM (processed_at - received_at))) AS avg_processing_time_seconds
FROM inbound_emails
WHERE organization_id IS NOT NULL
GROUP BY organization_id;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE email_inbox_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_email_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- Inbox config: viewable by all org members, editable by admin
CREATE POLICY "Inbox config viewable by org members"
  ON email_inbox_config FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Inbox config editable by admin"
  ON email_inbox_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
      AND organization_id = email_inbox_config.organization_id
    )
  );

-- User email aliases
CREATE POLICY "Users can view own email aliases"
  ON user_email_aliases FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage own email aliases"
  ON user_email_aliases FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Inbound emails: viewable by matched user or admin
CREATE POLICY "Users can view own inbound emails"
  ON inbound_emails FOR SELECT
  TO authenticated
  USING (
    matched_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = inbound_emails.organization_id
    )
  );

-- Email attachments: viewable if can view parent email
CREATE POLICY "Users can view own email attachments"
  ON email_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inbound_emails ie
      WHERE ie.id = email_attachments.email_id
      AND (
        ie.matched_user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role IN ('admin', 'finance')
          AND organization_id = ie.organization_id
        )
      )
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_email_inbox_org ON email_inbox_config(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_inbox_address ON email_inbox_config(LOWER(inbox_address));

CREATE INDEX IF NOT EXISTS idx_user_email_aliases_user ON user_email_aliases(user_id);
CREATE INDEX IF NOT EXISTS idx_user_email_aliases_email ON user_email_aliases(LOWER(email));

CREATE INDEX IF NOT EXISTS idx_inbound_emails_org ON inbound_emails(organization_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_user ON inbound_emails(matched_user_id);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails(status);
CREATE INDEX IF NOT EXISTS idx_inbound_emails_received ON inbound_emails(received_at);

CREATE INDEX IF NOT EXISTS idx_email_attachments_email ON email_attachments(email_id);
