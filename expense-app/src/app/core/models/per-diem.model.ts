/**
 * Per Diem Rate record
 * Location-based daily allowance rates (following GSA guidelines)
 */
export interface PerDiemRate {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;

  /** Location identifier (city, state, or region) */
  location: string;
  /** Country code (ISO 3166-1 alpha-2) */
  country_code: string;

  /** Daily lodging allowance */
  lodging_rate: number;
  /** Daily meals & incidental expenses (M&IE) rate */
  mie_rate: number;
  /** Total daily rate (lodging + M&IE) */
  total_rate: number;

  /** Fiscal year these rates apply to */
  fiscal_year: number;
  /** Effective start date */
  effective_from: string;
  /** Effective end date (null = current) */
  effective_until?: string | null;

  /** Whether this is a standard rate or locality-specific */
  is_standard_rate: boolean;

  /** Audit fields */
  created_at: string;
  updated_at: string;
}

/**
 * Travel trip record
 * Tracks business travel with per diem calculations
 */
export interface TravelTrip {
  /** UUID primary key */
  id: string;
  /** Organization ID (tenant isolation) */
  organization_id: string;
  /** User who took the trip */
  user_id: string;

  /** Trip name/purpose */
  trip_name: string;
  /** Detailed trip description */
  description?: string;

  /** Primary destination city */
  destination_city: string;
  /** Destination state/province */
  destination_state?: string;
  /** Destination country code */
  destination_country: string;

  /** Trip start date */
  start_date: string;
  /** Trip end date */
  end_date: string;

  /** Total number of travel days */
  total_days: number;

  /** Calculated total lodging allowance */
  total_lodging_allowance: number;
  /** Calculated total M&IE allowance */
  total_mie_allowance: number;
  /** Calculated total per diem allowance */
  total_per_diem: number;

  /** Actual lodging expenses claimed */
  actual_lodging_expense?: number;
  /** Actual meal expenses claimed */
  actual_meal_expense?: number;

  /** Trip status */
  status: TravelTripStatus;

  /** Linked expense report ID */
  report_id?: string | null;

  /** Audit fields */
  created_at: string;
  updated_at: string;

  // Populated relations
  /** Trip days breakdown */
  travel_trip_days?: TravelTripDay[];
  /** User info */
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
}

/**
 * Trip status enum
 */
export type TravelTripStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

/**
 * Travel trip day record
 * Daily breakdown of per diem for a trip
 */
export interface TravelTripDay {
  /** UUID primary key */
  id: string;
  /** Parent trip ID */
  trip_id: string;

  /** Date of this travel day */
  travel_date: string;
  /** Day number within trip (1-based) */
  day_number: number;

  /** Location for this day (may differ from trip destination) */
  location?: string;

  /** Daily lodging allowance for this day */
  lodging_allowance: number;
  /** Daily M&IE allowance for this day */
  mie_allowance: number;

  /** First day of travel (75% M&IE) */
  is_first_day: boolean;
  /** Last day of travel (75% M&IE) */
  is_last_day: boolean;

  /** Breakfast provided (deduct from M&IE) */
  breakfast_provided: boolean;
  /** Lunch provided (deduct from M&IE) */
  lunch_provided: boolean;
  /** Dinner provided (deduct from M&IE) */
  dinner_provided: boolean;

  /** Adjusted M&IE after meal deductions */
  adjusted_mie?: number;

  /** Notes for this day */
  notes?: string;

  /** Audit fields */
  created_at: string;
  updated_at: string;
}

/**
 * DTO for creating a new travel trip
 */
export interface CreateTravelTripDto {
  trip_name: string;
  description?: string;
  destination_city: string;
  destination_state?: string;
  destination_country: string;
  start_date: string;
  end_date: string;
}

/**
 * DTO for updating a travel trip
 */
export interface UpdateTravelTripDto {
  id: string;
  trip_name?: string;
  description?: string;
  destination_city?: string;
  destination_state?: string;
  destination_country?: string;
  start_date?: string;
  end_date?: string;
  status?: TravelTripStatus;
  actual_lodging_expense?: number;
  actual_meal_expense?: number;
}

/**
 * DTO for updating a trip day (meal deductions)
 */
export interface UpdateTripDayDto {
  id: string;
  location?: string;
  breakfast_provided?: boolean;
  lunch_provided?: boolean;
  dinner_provided?: boolean;
  notes?: string;
}

/**
 * Per diem rate lookup result
 */
export interface PerDiemLookupResult {
  location: string;
  lodging_rate: number;
  mie_rate: number;
  total_rate: number;
  fiscal_year: number;
  is_standard_rate: boolean;
}

/**
 * Trip per diem calculation result
 */
export interface TripPerDiemCalculation {
  total_days: number;
  total_lodging: number;
  total_mie: number;
  total_per_diem: number;
  daily_breakdown: DailyPerDiemBreakdown[];
}

/**
 * Daily per diem breakdown
 */
export interface DailyPerDiemBreakdown {
  date: string;
  day_number: number;
  lodging: number;
  mie: number;
  adjustments: MealAdjustment[];
  adjusted_mie: number;
  total: number;
}

/**
 * Meal adjustment detail
 */
export interface MealAdjustment {
  meal: 'breakfast' | 'lunch' | 'dinner';
  deduction: number;
  reason: string;
}

/**
 * Per diem summary for dashboard
 */
export interface PerDiemSummary {
  total_trips: number;
  total_per_diem_claimed: number;
  total_actual_expenses: number;
  variance: number;
  average_daily_rate: number;
}

/**
 * GSA meal deduction percentages
 * Used to calculate deductions when meals are provided
 */
export const GSA_MEAL_DEDUCTION_PERCENTAGES = {
  breakfast: 0.20, // 20% of M&IE
  lunch: 0.30,     // 30% of M&IE
  dinner: 0.50     // 50% of M&IE
} as const;

/**
 * First/last day M&IE percentage
 * Per GSA guidelines, first and last day of travel = 75% M&IE
 */
export const TRAVEL_DAY_MIE_PERCENTAGE = 0.75;

/**
 * Status display configuration
 */
export const TRIP_STATUS_CONFIG: Record<TravelTripStatus, { label: string; color: string; icon: string }> = {
  planned: { label: 'Planned', color: 'primary', icon: 'event' },
  in_progress: { label: 'In Progress', color: 'accent', icon: 'flight_takeoff' },
  completed: { label: 'Completed', color: 'success', icon: 'check_circle' },
  cancelled: { label: 'Cancelled', color: 'warn', icon: 'cancel' }
};
