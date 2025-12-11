-- ============================================================================
-- Prevent Circular Delegations
-- Created: 2025-12-10
-- Description: Add check to prevent circular delegation chains (A->B, B->A)
-- Security Issue: HIGH - Could cause infinite loops in approval/delegation logic
-- ============================================================================

BEGIN;

-- =============================================================================
-- UPDATE CREATE_DELEGATION FUNCTION
-- =============================================================================

-- Drop and recreate the function with circular delegation check
CREATE OR REPLACE FUNCTION create_delegation(
  p_organization_id UUID,
  p_delegator_id UUID,
  p_delegate_id UUID,
  p_scope TEXT DEFAULT 'all',
  p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT now(),
  p_valid_until TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delegation_id UUID;
  v_circular_exists BOOLEAN;
BEGIN
  -- Cannot delegate to yourself
  IF p_delegator_id = p_delegate_id THEN
    RAISE EXCEPTION 'Cannot delegate to yourself';
  END IF;

  -- Check for circular delegation (B already delegates to A)
  -- This prevents A->B when B->A already exists
  SELECT EXISTS (
    SELECT 1
    FROM expense_delegations
    WHERE delegator_id = p_delegate_id
      AND delegate_id = p_delegator_id
      AND organization_id = p_organization_id
      AND is_active = true
      AND (valid_until IS NULL OR valid_until >= now())
  ) INTO v_circular_exists;

  IF v_circular_exists THEN
    RAISE EXCEPTION 'Circular delegation not allowed: % already delegates to %',
      p_delegate_id, p_delegator_id;
  END IF;

  -- Check for longer circular chains (A->B->C->A)
  -- Using recursive CTE to detect cycles
  WITH RECURSIVE delegation_chain AS (
    -- Start from the proposed delegate
    SELECT delegate_id, delegator_id, 1 as depth
    FROM expense_delegations
    WHERE delegator_id = p_delegate_id
      AND organization_id = p_organization_id
      AND is_active = true
      AND (valid_until IS NULL OR valid_until >= now())

    UNION ALL

    -- Follow the chain
    SELECT ed.delegate_id, ed.delegator_id, dc.depth + 1
    FROM expense_delegations ed
    JOIN delegation_chain dc ON ed.delegator_id = dc.delegate_id
    WHERE ed.organization_id = p_organization_id
      AND ed.is_active = true
      AND (ed.valid_until IS NULL OR ed.valid_until >= now())
      AND dc.depth < 10  -- Prevent infinite loops during check
  )
  SELECT EXISTS (
    SELECT 1 FROM delegation_chain
    WHERE delegate_id = p_delegator_id
  ) INTO v_circular_exists;

  IF v_circular_exists THEN
    RAISE EXCEPTION 'Circular delegation chain detected. This delegation would create a cycle.';
  END IF;

  -- Insert or update delegation
  INSERT INTO expense_delegations (
    organization_id,
    delegator_id,
    delegate_id,
    scope,
    valid_from,
    valid_until,
    notes,
    created_by,
    is_active
  ) VALUES (
    p_organization_id,
    p_delegator_id,
    p_delegate_id,
    p_scope,
    p_valid_from,
    p_valid_until,
    p_notes,
    p_created_by,
    true
  )
  ON CONFLICT (delegator_id, delegate_id, organization_id)
  DO UPDATE SET
    scope = EXCLUDED.scope,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    notes = EXCLUDED.notes,
    is_active = true,
    updated_at = now()
  RETURNING id INTO v_delegation_id;

  -- Log the action
  INSERT INTO delegation_audit_log (delegation_id, action, actor_id, details)
  VALUES (v_delegation_id, 'created', p_created_by, jsonb_build_object(
    'scope', p_scope,
    'valid_until', p_valid_until
  ));

  RETURN v_delegation_id;
END;
$$;

-- =============================================================================
-- ADD DATABASE CONSTRAINT (defense in depth)
-- =============================================================================

-- Create a trigger to prevent circular delegations at DB level
CREATE OR REPLACE FUNCTION check_circular_delegation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_circular_exists BOOLEAN;
BEGIN
  -- Skip if delegation is being deactivated
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  -- Check direct circular reference
  SELECT EXISTS (
    SELECT 1
    FROM expense_delegations
    WHERE delegator_id = NEW.delegate_id
      AND delegate_id = NEW.delegator_id
      AND organization_id = NEW.organization_id
      AND is_active = true
      AND id != NEW.id
      AND (valid_until IS NULL OR valid_until >= now())
  ) INTO v_circular_exists;

  IF v_circular_exists THEN
    RAISE EXCEPTION 'Circular delegation not allowed';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists and recreate
DROP TRIGGER IF EXISTS prevent_circular_delegation_trigger ON expense_delegations;
CREATE TRIGGER prevent_circular_delegation_trigger
  BEFORE INSERT OR UPDATE ON expense_delegations
  FOR EACH ROW
  EXECUTE FUNCTION check_circular_delegation();

-- =============================================================================
-- VERIFICATION
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Circular Delegation Prevention Applied!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Added: Direct circular check (A->B when B->A exists)';
  RAISE NOTICE 'Added: Chain circular check (A->B->C->A)';
  RAISE NOTICE 'Added: Database trigger as defense in depth';
  RAISE NOTICE 'Added: SECURITY DEFINER SET search_path for all functions';
  RAISE NOTICE '========================================';
END $$;

COMMIT;
