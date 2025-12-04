/**
 * Mileage Tracking Models
 * Interfaces for mileage trips, IRS rates, and related data structures
 * Updated: 2025-11-16 - Aligned with database schema
 */

export type MileageCategory = 'business' | 'medical' | 'charity' | 'moving';
export type MileageStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed';
export type TrackingMethod = 'manual' | 'start_stop' | 'full_gps';

/**
 * Mileage Trip Interface
 * Represents a single trip logged by an employee
 */
export interface MileageTrip {
  id: string;
  user_id: string;
  organization_id: string;

  // Trip Details
  trip_date: string; // ISO date string
  origin_address: string;
  destination_address: string;

  // Location coordinates (optional - for future GPS features)
  origin_lat?: number;
  origin_lng?: number;
  destination_lat?: number;
  destination_lng?: number;

  // Distance & Calculation
  distance_miles: number;
  is_round_trip: boolean;
  total_miles: number; // Generated in database
  tracking_method?: TrackingMethod; // How the trip was tracked (manual, start_stop, full_gps)
  start_timestamp?: string; // ISO timestamp when user clicked 'Start' (for start_stop verification)
  end_timestamp?: string; // ISO timestamp when user clicked 'Stop' (for start_stop verification)
  irs_rate: number;
  reimbursement_amount: number; // Generated in database

  // Distance modification tracking (for fraud prevention)
  original_gps_distance?: number; // Original distance calculated by GPS (null if manual entry)
  distance_manually_modified?: boolean; // True if distance was modified after GPS calculation
  distance_modified_at?: string; // ISO timestamp of when distance was modified
  distance_modification_reason?: string; // Optional reason for modification

  // Trip Purpose & Classification
  purpose?: string; // Optional for draft trips - required before submitting
  category: MileageCategory;
  department?: string;
  project_code?: string;

  // Integration
  expense_id?: string;

  // Workflow Status
  status: MileageStatus;
  submitted_at?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  reimbursed_at?: string;

  // Notes
  notes?: string;

  // Audit
  created_at: string;
  updated_at: string;
}

/**
 * IRS Mileage Rate Interface
 * Historical IRS standard mileage rates
 */
export interface IRSMileageRate {
  id: string;
  category: MileageCategory;
  rate: number; // e.g., 0.670 for $0.67/mile
  effective_date: string; // ISO date string
  end_date?: string; // ISO date string or null if currently active
  notes?: string;
  created_at: string;
}

/**
 * Create Mileage Trip DTO
 * Data required to create a new trip
 */
export interface CreateMileageTripDto {
  trip_date: string;
  origin_address: string;
  destination_address: string;
  distance_miles: number;
  is_round_trip: boolean;
  purpose?: string; // Optional for quick logging - required before submitting
  category?: MileageCategory; // Defaults to 'business'
  tracking_method?: TrackingMethod; // Defaults to 'manual'
  department?: string;
  project_code?: string;
  notes?: string;

  // Optional coordinates
  origin_lat?: number;
  origin_lng?: number;
  destination_lat?: number;
  destination_lng?: number;

  // GPS distance tracking (for fraud prevention)
  original_gps_distance?: number; // Set to distance_miles when tracking_method is 'start_stop' or 'full_gps'
  distance_modification_reason?: string; // Reason for modifying GPS-calculated distance
}

/**
 * Update Mileage Trip DTO
 * Fields that can be updated on a trip
 */
export interface UpdateMileageTripDto {
  trip_date?: string;
  origin_address?: string;
  destination_address?: string;
  distance_miles?: number;
  is_round_trip?: boolean;
  purpose?: string;
  category?: MileageCategory;
  department?: string;
  project_code?: string;
  notes?: string;
}

/**
 * Mileage Filter Options
 * For filtering trip lists
 */
export interface MileageFilterOptions {
  startDate?: string;
  endDate?: string;
  status?: MileageStatus | MileageStatus[];
  category?: MileageCategory | MileageCategory[];
  department?: string;
  userId?: string; // For managers/finance to filter by user
  hasExpense?: boolean; // Filter trips attached to expenses
  searchQuery?: string; // Search origin/destination/purpose
}

/**
 * Mileage Statistics
 * Summary statistics for reporting
 */
export interface MileageStats {
  totalTrips: number;
  totalMiles: number;
  totalReimbursement: number;
  tripsByStatus: {
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
    reimbursed: number;
  };
  tripsByCategory: {
    business: number;
    medical: number;
    charity: number;
    moving: number;
  };
}

/**
 * Mileage Rate Calculation Result
 * Result of IRS rate lookup
 */
export interface MileageRateCalculation {
  rate: number;
  totalMiles: number;
  reimbursementAmount: number;
  rateEffectiveDate: string;
  category: MileageCategory;
}

/**
 * Trip Validation Errors
 * Validation errors for trip creation/update
 */
export interface TripValidationErrors {
  trip_date?: string;
  origin_address?: string;
  destination_address?: string;
  distance_miles?: string;
  purpose?: string;
  general?: string;
}

/**
 * Trip Coordinate Interface
 * GPS breadcrumb for real-time trip tracking
 */
export interface TripCoordinate {
  id?: string;
  trip_id?: string;
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  recorded_at: string; // ISO timestamp
  created_at?: string;
}
