-- GPS Tracking Enhancement Migration
-- Adds support for real-time GPS tracking of mileage trips
-- Stores GPS coordinates (breadcrumbs) for accurate distance calculation

-- Add tracking_method to mileage_trips
ALTER TABLE mileage_trips
ADD COLUMN IF NOT EXISTS tracking_method TEXT DEFAULT 'manual' CHECK (tracking_method IN ('manual', 'gps_tracked'));

COMMENT ON COLUMN mileage_trips.tracking_method IS 'How the trip was tracked: manual (point-to-point) or gps_tracked (real-time GPS)';

-- Create trip_coordinates table for GPS breadcrumbs
CREATE TABLE IF NOT EXISTS trip_coordinates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES mileage_trips(id) ON DELETE CASCADE,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(6, 2), -- GPS accuracy in meters
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_coordinates_trip_id ON trip_coordinates(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_coordinates_recorded_at ON trip_coordinates(trip_id, recorded_at);

-- Comments for documentation
COMMENT ON TABLE trip_coordinates IS 'Stores GPS coordinates captured during real-time trip tracking';
COMMENT ON COLUMN trip_coordinates.trip_id IS 'Reference to the mileage trip';
COMMENT ON COLUMN trip_coordinates.latitude IS 'GPS latitude coordinate (decimal degrees)';
COMMENT ON COLUMN trip_coordinates.longitude IS 'GPS longitude coordinate (decimal degrees)';
COMMENT ON COLUMN trip_coordinates.accuracy IS 'GPS accuracy in meters (from browser geolocation API)';
COMMENT ON COLUMN trip_coordinates.recorded_at IS 'When this coordinate was captured during the trip';

-- Enable Row Level Security
ALTER TABLE trip_coordinates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trip_coordinates

-- Users can insert their own trip coordinates
CREATE POLICY "Users can insert own trip coordinates"
ON trip_coordinates FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM mileage_trips
    WHERE mileage_trips.id = trip_coordinates.trip_id
    AND mileage_trips.user_id = auth.uid()
  )
);

-- Users can read their own trip coordinates
CREATE POLICY "Users can read own trip coordinates"
ON trip_coordinates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM mileage_trips
    WHERE mileage_trips.id = trip_coordinates.trip_id
    AND mileage_trips.user_id = auth.uid()
  )
);

-- Users can delete their own trip coordinates (if trip is still draft)
CREATE POLICY "Users can delete own trip coordinates"
ON trip_coordinates FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM mileage_trips
    WHERE mileage_trips.id = trip_coordinates.trip_id
    AND mileage_trips.user_id = auth.uid()
    AND mileage_trips.status = 'draft'
  )
);

-- Finance and admin can view all trip coordinates
CREATE POLICY "Finance can view all trip coordinates"
ON trip_coordinates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('finance', 'admin')
  )
);

-- Helper function to calculate distance between two GPS coordinates (Haversine formula)
CREATE OR REPLACE FUNCTION calculate_gps_distance(
  lat1 DECIMAL,
  lon1 DECIMAL,
  lat2 DECIMAL,
  lon2 DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  earth_radius_miles CONSTANT DECIMAL := 3958.8; -- Earth radius in miles
  dlat DECIMAL;
  dlon DECIMAL;
  a DECIMAL;
  c DECIMAL;
BEGIN
  -- Haversine formula
  dlat := RADIANS(lat2 - lat1);
  dlon := RADIANS(lon2 - lon1);

  a := SIN(dlat/2) * SIN(dlat/2) +
       COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
       SIN(dlon/2) * SIN(dlon/2);

  c := 2 * ATAN2(SQRT(a), SQRT(1-a));

  RETURN earth_radius_miles * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_gps_distance IS 'Calculates distance in miles between two GPS coordinates using Haversine formula';

-- Helper function to calculate total distance from GPS coordinates
CREATE OR REPLACE FUNCTION calculate_trip_distance_from_coordinates(p_trip_id UUID)
RETURNS DECIMAL AS $$
DECLARE
  total_distance DECIMAL := 0;
  prev_lat DECIMAL;
  prev_lon DECIMAL;
  curr_lat DECIMAL;
  curr_lon DECIMAL;
  coord RECORD;
BEGIN
  -- Get all coordinates for the trip, ordered by time
  FOR coord IN
    SELECT latitude, longitude
    FROM trip_coordinates
    WHERE trip_id = p_trip_id
    ORDER BY recorded_at ASC
  LOOP
    IF prev_lat IS NOT NULL THEN
      -- Calculate distance from previous point to current point
      total_distance := total_distance + calculate_gps_distance(
        prev_lat, prev_lon, coord.latitude, coord.longitude
      );
    END IF;

    prev_lat := coord.latitude;
    prev_lon := coord.longitude;
  END LOOP;

  RETURN COALESCE(total_distance, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_trip_distance_from_coordinates IS 'Calculates total trip distance by summing distances between consecutive GPS coordinates';
