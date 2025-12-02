-- ============================================================================
-- FIX MISSING TABLES AND VIEWS
-- Created: 2024-11-30
-- This migration adds missing tables/views that were causing 404 errors:
-- - gl_codes table
-- - expense_categories table
-- - expense_categories_with_gl view
-- - notifications table
-- - notification_preferences table
-- ============================================================================

-- ============================================================================
-- GL CODES TABLE
-- General Ledger codes that expense categories can be mapped to
-- ============================================================================

CREATE TABLE IF NOT EXISTS gl_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique code per organization
    CONSTRAINT gl_codes_org_code_unique UNIQUE (organization_id, code)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_gl_codes_org_id ON gl_codes(organization_id);
CREATE INDEX IF NOT EXISTS idx_gl_codes_active ON gl_codes(organization_id, is_active);

-- RLS policies for gl_codes
ALTER TABLE gl_codes ENABLE ROW LEVEL SECURITY;

-- Members can view GL codes in their organization
CREATE POLICY "Members can view org gl codes"
    ON gl_codes FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Admins and Finance can create GL codes
CREATE POLICY "Admins and Finance can create gl codes"
    ON gl_codes FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
            AND is_active = true
            AND role IN ('admin', 'finance')
        )
    );

-- Admins and Finance can update GL codes
CREATE POLICY "Admins and Finance can update gl codes"
    ON gl_codes FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
            AND is_active = true
            AND role IN ('admin', 'finance')
        )
    );

-- Only Admins can delete GL codes
CREATE POLICY "Admins can delete gl codes"
    ON gl_codes FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
            AND is_active = true
            AND role = 'admin'
        )
    );

-- ============================================================================
-- EXPENSE CATEGORIES TABLE
-- Custom expense categories that can be created/configured by admins
-- ============================================================================

CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    gl_code_id UUID REFERENCES gl_codes(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    requires_receipt BOOLEAN NOT NULL DEFAULT true,
    requires_description BOOLEAN NOT NULL DEFAULT false,
    max_amount DECIMAL(12,2),
    icon VARCHAR(50) NOT NULL DEFAULT 'receipt',
    color VARCHAR(7) NOT NULL DEFAULT '#FF5900',
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Unique name per organization
    CONSTRAINT expense_categories_org_name_unique UNIQUE (organization_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expense_categories_org_id ON expense_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_active ON expense_categories(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_expense_categories_display_order ON expense_categories(organization_id, display_order);

-- RLS policies for expense_categories
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Members can view categories in their organization
CREATE POLICY "Members can view org expense categories"
    ON expense_categories FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid() AND is_active = true
        )
    );

-- Admins can create categories
CREATE POLICY "Admins can create expense categories"
    ON expense_categories FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
            AND is_active = true
            AND role = 'admin'
        )
    );

-- Admins can update categories
CREATE POLICY "Admins can update expense categories"
    ON expense_categories FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
            AND is_active = true
            AND role = 'admin'
        )
    );

-- Admins can delete categories
CREATE POLICY "Admins can delete expense categories"
    ON expense_categories FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM organization_members
            WHERE user_id = auth.uid()
            AND is_active = true
            AND role = 'admin'
        )
    );

-- ============================================================================
-- EXPENSE CATEGORIES WITH GL VIEW
-- Joins expense categories with GL code information
-- ============================================================================

CREATE OR REPLACE VIEW expense_categories_with_gl AS
SELECT
    ec.id,
    ec.organization_id,
    ec.name,
    ec.description,
    ec.gl_code_id,
    ec.is_active,
    ec.requires_receipt,
    ec.requires_description,
    ec.max_amount,
    ec.icon,
    ec.color,
    ec.display_order,
    ec.created_by,
    ec.created_at,
    ec.updated_at,
    -- Joined GL code fields
    gc.code AS gl_code,
    gc.name AS gl_code_name,
    gc.description AS gl_code_description
FROM expense_categories ec
LEFT JOIN gl_codes gc ON ec.gl_code_id = gc.id;

-- ============================================================================
-- NOTIFICATIONS TABLE
-- Stores user notifications for the app
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('info', 'success', 'warning', 'error')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('smartscan', 'receipt', 'approval', 'reimbursement', 'expense', 'report', 'budget', 'system')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    action_url VARCHAR(500),
    action_data JSONB DEFAULT '{}'::jsonb,
    read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org_id ON notifications(organization_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS policies for notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    USING (user_id = auth.uid());

-- Users can create notifications for themselves (or system can create)
CREATE POLICY "Users can create own notifications"
    ON notifications FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own notifications (mark as read, etc.)
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    USING (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    USING (user_id = auth.uid());

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- Stores user notification preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    smartscan_enabled BOOLEAN NOT NULL DEFAULT true,
    receipt_enabled BOOLEAN NOT NULL DEFAULT true,
    approval_enabled BOOLEAN NOT NULL DEFAULT true,
    reimbursement_enabled BOOLEAN NOT NULL DEFAULT true,
    expense_enabled BOOLEAN NOT NULL DEFAULT true,
    report_enabled BOOLEAN NOT NULL DEFAULT true,
    budget_enabled BOOLEAN NOT NULL DEFAULT true,
    system_enabled BOOLEAN NOT NULL DEFAULT true,
    show_toast BOOLEAN NOT NULL DEFAULT true,
    play_sound BOOLEAN NOT NULL DEFAULT false,
    email_digest BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for notification_preferences
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user_id ON notification_preferences(user_id);

-- RLS policies for notification_preferences
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only view their own preferences
CREATE POLICY "Users can view own notification preferences"
    ON notification_preferences FOR SELECT
    USING (user_id = auth.uid());

-- Users can create their own preferences
CREATE POLICY "Users can create own notification preferences"
    ON notification_preferences FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own preferences
CREATE POLICY "Users can update own notification preferences"
    ON notification_preferences FOR UPDATE
    USING (user_id = auth.uid());

-- ============================================================================
-- HELPER FUNCTION: Mark all notifications as read
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE notifications
    SET read = true, read_at = now()
    WHERE user_id = auth.uid() AND read = false;
END;
$$;

-- ============================================================================
-- AUTO-UPDATE TIMESTAMPS TRIGGERS
-- ============================================================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to gl_codes
DROP TRIGGER IF EXISTS update_gl_codes_updated_at ON gl_codes;
CREATE TRIGGER update_gl_codes_updated_at
    BEFORE UPDATE ON gl_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to expense_categories
DROP TRIGGER IF EXISTS update_expense_categories_updated_at ON expense_categories;
CREATE TRIGGER update_expense_categories_updated_at
    BEFORE UPDATE ON expense_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to notification_preferences
DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DEFAULT CATEGORIES FOR EXISTING ORGANIZATIONS
-- ============================================================================

-- Insert default expense categories for organizations that don't have any
INSERT INTO expense_categories (organization_id, name, description, icon, color, display_order, requires_receipt, requires_description)
SELECT
    o.id,
    c.name,
    c.description,
    c.icon,
    c.color,
    c.display_order,
    c.requires_receipt,
    c.requires_description
FROM organizations o
CROSS JOIN (VALUES
    ('Fuel', 'Gas and fuel expenses for vehicles', 'local_gas_station', '#FF5900', 1, true, false),
    ('Lodging', 'Hotel and accommodation expenses', 'hotel', '#2196F3', 2, true, false),
    ('Individual Meals', 'Personal meal expenses while traveling', 'restaurant', '#4CAF50', 3, true, false),
    ('Team Meals', 'Group or team meal expenses', 'groups', '#9C27B0', 4, true, true),
    ('Airfare', 'Flight and airline expenses', 'flight', '#00BCD4', 5, true, false),
    ('Ground Transportation', 'Taxi, Uber, rental car expenses', 'directions_car', '#FF9800', 6, true, false),
    ('Office Supplies', 'Office supplies and equipment', 'business_center', '#607D8B', 7, true, false),
    ('Software', 'Software and subscription expenses', 'computer', '#3F51B5', 8, true, false),
    ('Miscellaneous', 'Other business expenses', 'receipt_long', '#795548', 9, true, true)
) AS c(name, description, icon, color, display_order, requires_receipt, requires_description)
WHERE NOT EXISTS (
    SELECT 1 FROM expense_categories ec WHERE ec.organization_id = o.id
)
ON CONFLICT DO NOTHING;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;
