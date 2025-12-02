-- Per Diem & Travel Allowances Migration
-- Provides daily flat-rate allowances for meals, lodging, and incidentals during travel

-- =============================================================================
-- PER DIEM RATES TABLE
-- =============================================================================

-- Table to store per diem rates by location
CREATE TABLE IF NOT EXISTS per_diem_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = system default

  -- Location
  country_code TEXT NOT NULL DEFAULT 'US',
  state_province TEXT, -- For US states
  city TEXT, -- Specific city rates
  location_name TEXT NOT NULL, -- Display name

  -- Daily rates
  meals_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  lodging_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  incidentals_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_rate NUMERIC(10,2) GENERATED ALWAYS AS (meals_rate + lodging_rate + incidentals_rate) STORED,

  -- Meal breakdown (optional, for itemized tracking)
  breakfast_rate NUMERIC(10,2),
  lunch_rate NUMERIC(10,2),
  dinner_rate NUMERIC(10,2),

  -- Rate period
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE, -- NULL = no end date

  -- Rate source
  source TEXT DEFAULT 'custom', -- 'gsa', 'custom', 'international'
  source_url TEXT, -- Link to official rate source

  -- Metadata
  currency TEXT DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  notes TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  -- Unique constraint for location + date range
  CONSTRAINT unique_per_diem_location UNIQUE NULLS NOT DISTINCT (organization_id, country_code, state_province, city, effective_from)
);

-- =============================================================================
-- TRAVEL TRIPS TABLE
-- =============================================================================

-- Table to track travel trips (business travel periods)
CREATE TABLE IF NOT EXISTS travel_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Trip details
  trip_name TEXT NOT NULL,
  description TEXT,
  purpose TEXT, -- Business purpose

  -- Dates
  departure_date DATE NOT NULL,
  return_date DATE NOT NULL,

  -- Locations
  destination_city TEXT NOT NULL,
  destination_state TEXT,
  destination_country TEXT NOT NULL DEFAULT 'US',

  -- Per diem configuration
  per_diem_rate_id UUID REFERENCES per_diem_rates(id),
  custom_meals_rate NUMERIC(10,2),
  custom_lodging_rate NUMERIC(10,2),
  custom_incidentals_rate NUMERIC(10,2),

  -- Calculated fields
  total_days INTEGER GENERATED ALWAYS AS (return_date - departure_date + 1) STORED,
  first_last_day_rate NUMERIC(5,2) DEFAULT 0.75, -- 75% for travel days

  -- Allowance totals (auto-calculated)
  total_meals_allowance NUMERIC(10,2),
  total_lodging_allowance NUMERIC(10,2),
  total_incidentals_allowance NUMERIC(10,2),
  total_per_diem NUMERIC(10,2),

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'completed')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id),

  -- Link to expense report
  report_id UUID REFERENCES expense_reports(id),

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- =============================================================================
-- TRAVEL TRIP DAYS TABLE
-- =============================================================================

-- Table to track individual days of a trip (for detailed per diem)
CREATE TABLE IF NOT EXISTS travel_trip_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  trip_date DATE NOT NULL,

  -- Day type
  day_type TEXT NOT NULL DEFAULT 'full' CHECK (day_type IN ('full', 'first', 'last', 'personal', 'no_per_diem')),

  -- Meals provided (reduces per diem)
  breakfast_provided BOOLEAN DEFAULT false,
  lunch_provided BOOLEAN DEFAULT false,
  dinner_provided BOOLEAN DEFAULT false,

  -- Per diem for this day
  meals_per_diem NUMERIC(10,2),
  lodging_per_diem NUMERIC(10,2),
  incidentals_per_diem NUMERIC(10,2),
  total_per_diem NUMERIC(10,2),

  -- Notes
  notes TEXT,

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  CONSTRAINT unique_trip_day UNIQUE (trip_id, trip_date)
);

-- =============================================================================
-- TRAVEL ALLOWANCE SETTINGS (per organization)
-- =============================================================================

-- Add travel settings to organizations
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS travel_settings JSONB DEFAULT '{
  "per_diem_enabled": true,
  "use_gsa_rates": true,
  "first_last_day_percentage": 75,
  "require_approval_for_custom_rates": true,
  "auto_create_expenses": true,
  "default_currency": "USD",
  "meal_deduction_rates": {
    "breakfast": 20,
    "lunch": 30,
    "dinner": 50
  }
}'::JSONB;

-- =============================================================================
-- SEED DEFAULT US GSA RATES (FY2024 samples)
-- =============================================================================

INSERT INTO per_diem_rates (
  organization_id, country_code, state_province, city, location_name,
  meals_rate, lodging_rate, incidentals_rate,
  breakfast_rate, lunch_rate, dinner_rate,
  source, effective_from
) VALUES
  -- Standard CONUS rate
  (NULL, 'US', NULL, NULL, 'Standard CONUS Rate',
   59, 107, 0, 13, 15, 31, 'gsa', '2024-01-01'),

  -- Major city rates
  (NULL, 'US', 'TX', 'Fort Worth', 'Fort Worth, TX',
   64, 139, 0, 14, 17, 33, 'gsa', '2024-01-01'),

  (NULL, 'US', 'TX', 'Dallas', 'Dallas, TX',
   74, 184, 0, 17, 18, 39, 'gsa', '2024-01-01'),

  (NULL, 'US', 'TX', 'Houston', 'Houston, TX',
   74, 205, 0, 17, 18, 39, 'gsa', '2024-01-01'),

  (NULL, 'US', 'TX', 'Austin', 'Austin, TX',
   74, 217, 0, 17, 18, 39, 'gsa', '2024-01-01'),

  (NULL, 'US', 'CA', 'San Francisco', 'San Francisco, CA',
   79, 361, 0, 18, 20, 41, 'gsa', '2024-01-01'),

  (NULL, 'US', 'CA', 'Los Angeles', 'Los Angeles, CA',
   79, 277, 0, 18, 20, 41, 'gsa', '2024-01-01'),

  (NULL, 'US', 'NY', 'New York City', 'New York City, NY',
   79, 379, 0, 18, 20, 41, 'gsa', '2024-01-01'),

  (NULL, 'US', 'DC', 'Washington', 'Washington, DC',
   79, 286, 0, 18, 20, 41, 'gsa', '2024-01-01'),

  (NULL, 'US', 'IL', 'Chicago', 'Chicago, IL',
   79, 261, 0, 18, 20, 41, 'gsa', '2024-01-01')

ON CONFLICT DO NOTHING;

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Function to get the applicable per diem rate for a location and date
CREATE OR REPLACE FUNCTION get_per_diem_rate(
  p_organization_id UUID,
  p_country_code TEXT,
  p_state TEXT,
  p_city TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  rate_id UUID,
  location_name TEXT,
  meals_rate NUMERIC,
  lodging_rate NUMERIC,
  incidentals_rate NUMERIC,
  total_rate NUMERIC,
  breakfast_rate NUMERIC,
  lunch_rate NUMERIC,
  dinner_rate NUMERIC,
  source TEXT
) AS $$
BEGIN
  -- Try to find most specific rate (org + city + state + country)
  RETURN QUERY
  SELECT
    r.id,
    r.location_name,
    r.meals_rate,
    r.lodging_rate,
    r.incidentals_rate,
    r.total_rate,
    r.breakfast_rate,
    r.lunch_rate,
    r.dinner_rate,
    r.source
  FROM per_diem_rates r
  WHERE r.is_active = true
    AND r.country_code = p_country_code
    AND r.effective_from <= p_date
    AND (r.effective_until IS NULL OR r.effective_until >= p_date)
    AND (
      -- Organization-specific rate
      (r.organization_id = p_organization_id AND r.city = p_city AND r.state_province = p_state)
      OR (r.organization_id = p_organization_id AND r.state_province = p_state AND r.city IS NULL)
      OR (r.organization_id = p_organization_id AND r.state_province IS NULL AND r.city IS NULL)
      -- System default rate
      OR (r.organization_id IS NULL AND r.city = p_city AND r.state_province = p_state)
      OR (r.organization_id IS NULL AND r.state_province = p_state AND r.city IS NULL)
      OR (r.organization_id IS NULL AND r.state_province IS NULL AND r.city IS NULL)
    )
  ORDER BY
    -- Prefer organization-specific rates
    CASE WHEN r.organization_id = p_organization_id THEN 0 ELSE 1 END,
    -- Prefer more specific locations
    CASE WHEN r.city IS NOT NULL THEN 0 WHEN r.state_province IS NOT NULL THEN 1 ELSE 2 END,
    -- Prefer most recent effective date
    r.effective_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to calculate per diem for a trip
CREATE OR REPLACE FUNCTION calculate_trip_per_diem(p_trip_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_trip RECORD;
  v_rate RECORD;
  v_total_meals NUMERIC := 0;
  v_total_lodging NUMERIC := 0;
  v_total_incidentals NUMERIC := 0;
  v_current_date DATE;
  v_day_type TEXT;
  v_day_meals NUMERIC;
  v_day_lodging NUMERIC;
  v_day_incidentals NUMERIC;
  v_first_last_pct NUMERIC;
BEGIN
  -- Get trip details
  SELECT * INTO v_trip
  FROM travel_trips
  WHERE id = p_trip_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Trip not found');
  END IF;

  -- Get per diem rate
  SELECT * INTO v_rate
  FROM get_per_diem_rate(
    v_trip.organization_id,
    v_trip.destination_country,
    v_trip.destination_state,
    v_trip.destination_city,
    v_trip.departure_date
  );

  -- Use custom rates if specified
  IF v_trip.custom_meals_rate IS NOT NULL THEN
    v_rate.meals_rate := v_trip.custom_meals_rate;
  END IF;
  IF v_trip.custom_lodging_rate IS NOT NULL THEN
    v_rate.lodging_rate := v_trip.custom_lodging_rate;
  END IF;
  IF v_trip.custom_incidentals_rate IS NOT NULL THEN
    v_rate.incidentals_rate := v_trip.custom_incidentals_rate;
  END IF;

  -- Get first/last day percentage
  v_first_last_pct := COALESCE(v_trip.first_last_day_rate, 0.75);

  -- Delete existing trip days and recalculate
  DELETE FROM travel_trip_days WHERE trip_id = p_trip_id;

  -- Calculate per diem for each day
  v_current_date := v_trip.departure_date;
  WHILE v_current_date <= v_trip.return_date LOOP
    -- Determine day type
    IF v_current_date = v_trip.departure_date THEN
      v_day_type := 'first';
    ELSIF v_current_date = v_trip.return_date THEN
      v_day_type := 'last';
    ELSE
      v_day_type := 'full';
    END IF;

    -- Calculate day rates
    IF v_day_type IN ('first', 'last') THEN
      v_day_meals := v_rate.meals_rate * v_first_last_pct;
      v_day_incidentals := v_rate.incidentals_rate * v_first_last_pct;
    ELSE
      v_day_meals := v_rate.meals_rate;
      v_day_incidentals := v_rate.incidentals_rate;
    END IF;
    v_day_lodging := v_rate.lodging_rate;

    -- Insert trip day
    INSERT INTO travel_trip_days (
      trip_id, trip_date, day_type,
      meals_per_diem, lodging_per_diem, incidentals_per_diem,
      total_per_diem
    ) VALUES (
      p_trip_id, v_current_date, v_day_type,
      v_day_meals, v_day_lodging, v_day_incidentals,
      v_day_meals + v_day_lodging + v_day_incidentals
    );

    -- Accumulate totals
    v_total_meals := v_total_meals + v_day_meals;
    v_total_lodging := v_total_lodging + v_day_lodging;
    v_total_incidentals := v_total_incidentals + v_day_incidentals;

    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;

  -- Update trip totals
  UPDATE travel_trips
  SET
    total_meals_allowance = v_total_meals,
    total_lodging_allowance = v_total_lodging,
    total_incidentals_allowance = v_total_incidentals,
    total_per_diem = v_total_meals + v_total_lodging + v_total_incidentals,
    per_diem_rate_id = v_rate.rate_id,
    updated_at = now()
  WHERE id = p_trip_id;

  RETURN jsonb_build_object(
    'trip_id', p_trip_id,
    'total_days', v_trip.total_days,
    'meals_allowance', v_total_meals,
    'lodging_allowance', v_total_lodging,
    'incidentals_allowance', v_total_incidentals,
    'total_per_diem', v_total_meals + v_total_lodging + v_total_incidentals,
    'rate_source', v_rate.source,
    'location', v_rate.location_name
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGER: AUTO-CALCULATE PER DIEM ON TRIP CHANGES
-- =============================================================================

CREATE OR REPLACE FUNCTION auto_calculate_trip_per_diem()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate per diem when trip dates or destination change
  IF TG_OP = 'UPDATE' AND (
    OLD.departure_date != NEW.departure_date OR
    OLD.return_date != NEW.return_date OR
    OLD.destination_city != NEW.destination_city OR
    OLD.destination_state IS DISTINCT FROM NEW.destination_state OR
    OLD.destination_country != NEW.destination_country OR
    OLD.custom_meals_rate IS DISTINCT FROM NEW.custom_meals_rate OR
    OLD.custom_lodging_rate IS DISTINCT FROM NEW.custom_lodging_rate OR
    OLD.custom_incidentals_rate IS DISTINCT FROM NEW.custom_incidentals_rate
  ) THEN
    PERFORM calculate_trip_per_diem(NEW.id);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM calculate_trip_per_diem(NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER travel_trip_per_diem_trigger
  AFTER INSERT OR UPDATE ON travel_trips
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_trip_per_diem();

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Enable RLS
ALTER TABLE per_diem_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_trip_days ENABLE ROW LEVEL SECURITY;

-- Per diem rates: viewable by authenticated users
CREATE POLICY "Per diem rates viewable by org members"
  ON per_diem_rates FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL -- System defaults
    OR organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Per diem rates: admins can manage
CREATE POLICY "Admins can manage per diem rates"
  ON per_diem_rates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role = 'admin'
      AND (organization_id = per_diem_rates.organization_id OR per_diem_rates.organization_id IS NULL)
    )
  );

-- Travel trips: users can manage their own
CREATE POLICY "Users can view own travel trips"
  ON travel_trips FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance', 'manager')
      AND organization_id = travel_trips.organization_id
    )
  );

CREATE POLICY "Users can create own travel trips"
  ON travel_trips FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own travel trips"
  ON travel_trips FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND role IN ('admin', 'finance')
      AND organization_id = travel_trips.organization_id
    )
  );

-- Travel trip days: same as trips
CREATE POLICY "Trip days follow trip permissions"
  ON travel_trip_days FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM travel_trips t
      WHERE t.id = travel_trip_days.trip_id
      AND (
        t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM users
          WHERE id = auth.uid()
          AND role IN ('admin', 'finance', 'manager')
          AND organization_id = t.organization_id
        )
      )
    )
  );

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_per_diem_rates_location
  ON per_diem_rates(country_code, state_province, city);

CREATE INDEX IF NOT EXISTS idx_per_diem_rates_org
  ON per_diem_rates(organization_id);

CREATE INDEX IF NOT EXISTS idx_travel_trips_user
  ON travel_trips(user_id);

CREATE INDEX IF NOT EXISTS idx_travel_trips_org
  ON travel_trips(organization_id);

CREATE INDEX IF NOT EXISTS idx_travel_trips_dates
  ON travel_trips(departure_date, return_date);

CREATE INDEX IF NOT EXISTS idx_travel_trip_days_trip
  ON travel_trip_days(trip_id);
