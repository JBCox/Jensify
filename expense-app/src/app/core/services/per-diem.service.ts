import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  PerDiemRate,
  TravelTrip,
  TravelTripDay,
  CreateTravelTripDto,
  UpdateTravelTripDto,
  UpdateTripDayDto,
  PerDiemLookupResult,
  TripPerDiemCalculation,
  TravelTripStatus,
  GSA_MEAL_DEDUCTION_PERCENTAGES,
  TRAVEL_DAY_MIE_PERCENTAGE
} from '../models/per-diem.model';

/**
 * Service for managing per diem rates and travel trips
 * Supports GSA-compliant per diem calculations
 */
@Injectable({
  providedIn: 'root'
})
export class PerDiemService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state for user's trips
  private _userTrips = signal<TravelTrip[]>([]);
  userTrips = this._userTrips.asReadonly();

  // Computed: active trips
  activeTrips = computed(() =>
    this._userTrips().filter(t => t.status === 'planned' || t.status === 'in_progress')
  );

  // Computed: total per diem for active trips
  totalActivePerDiem = computed(() =>
    this.activeTrips().reduce((sum, t) => sum + t.total_per_diem, 0)
  );

  // =============================================================================
  // PER DIEM RATES
  // =============================================================================

  /**
   * Get all per diem rates for the organization
   */
  getPerDiemRates(): Observable<PerDiemRate[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('per_diem_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .order('location', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PerDiemRate[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Look up per diem rate for a specific location
   */
  lookupRate(location: string, countryCode: string = 'US'): Observable<PerDiemLookupResult | null> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_per_diem_rate', {
        p_organization_id: organizationId,
        p_location: location,
        p_country_code: countryCode
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as PerDiemLookupResult | null;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new per diem rate
   */
  createRate(rate: Omit<PerDiemRate, 'id' | 'created_at' | 'updated_at' | 'organization_id'>): Observable<PerDiemRate> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('per_diem_rates')
        .insert({
          ...rate,
          organization_id: organizationId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Per diem rate created', 'PerDiemService', { location: rate.location });
        return data as PerDiemRate;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing per diem rate
   */
  updateRate(id: string, updates: Partial<PerDiemRate>): Observable<PerDiemRate> {
    return from(
      this.supabase.client
        .from('per_diem_rates')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Per diem rate updated', 'PerDiemService', { id });
        return data as PerDiemRate;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a per diem rate
   */
  deleteRate(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('per_diem_rates')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Per diem rate deleted', 'PerDiemService', { id });
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // TRAVEL TRIPS
  // =============================================================================

  /**
   * Get all travel trips for the current user
   */
  getMyTrips(): Observable<TravelTrip[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('travel_trips')
        .select(`
          *,
          travel_trip_days(*)
        `)
        .eq('user_id', userId)
        .order('start_date', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TravelTrip[];
      }),
      tap(trips => this._userTrips.set(trips)),
      catchError(this.handleError)
    );
  }

  /**
   * Get all travel trips for the organization (admin/finance)
   */
  getAllTrips(filters?: { status?: TravelTripStatus; userId?: string }): Observable<TravelTrip[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    let query = this.supabase.client
      .from('travel_trips')
      .select(`
        *,
        travel_trip_days(*),
        user:users!user_id(id, full_name, email)
      `)
      .eq('organization_id', organizationId)
      .order('start_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.userId) {
      query = query.eq('user_id', filters.userId);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TravelTrip[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single trip by ID
   */
  getTrip(tripId: string): Observable<TravelTrip> {
    return from(
      this.supabase.client
        .from('travel_trips')
        .select(`
          *,
          travel_trip_days(*),
          user:users!user_id(id, full_name, email)
        `)
        .eq('id', tripId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TravelTrip;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new travel trip
   * Per diem will be auto-calculated by database trigger
   */
  createTrip(trip: CreateTravelTripDto): Observable<TravelTrip> {
    const organizationId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('travel_trips')
        .insert({
          ...trip,
          organization_id: organizationId,
          user_id: userId,
          status: 'planned'
        })
        .select(`
          *,
          travel_trip_days(*)
        `)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Travel trip created', 'PerDiemService', { tripId: data.id });
        return data as TravelTrip;
      }),
      tap(() => this.getMyTrips().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Update a travel trip
   */
  updateTrip(trip: UpdateTravelTripDto): Observable<TravelTrip> {
    const { id, ...updates } = trip;

    return from(
      this.supabase.client
        .from('travel_trips')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select(`
          *,
          travel_trip_days(*)
        `)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Travel trip updated', 'PerDiemService', { tripId: id });
        return data as TravelTrip;
      }),
      tap(() => this.getMyTrips().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a travel trip
   */
  deleteTrip(tripId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('travel_trips')
        .delete()
        .eq('id', tripId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Travel trip deleted', 'PerDiemService', { tripId });
      }),
      tap(() => this.getMyTrips().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Update trip status
   */
  updateTripStatus(tripId: string, status: TravelTripStatus): Observable<TravelTrip> {
    return this.updateTrip({ id: tripId, status });
  }

  /**
   * Start a trip (set status to in_progress)
   */
  startTrip(tripId: string): Observable<TravelTrip> {
    return this.updateTripStatus(tripId, 'in_progress');
  }

  /**
   * Complete a trip
   */
  completeTrip(tripId: string, actualExpenses?: { lodging?: number; meals?: number }): Observable<TravelTrip> {
    return this.updateTrip({
      id: tripId,
      status: 'completed',
      actual_lodging_expense: actualExpenses?.lodging,
      actual_meal_expense: actualExpenses?.meals
    });
  }

  /**
   * Cancel a trip
   */
  cancelTrip(tripId: string): Observable<TravelTrip> {
    return this.updateTripStatus(tripId, 'cancelled');
  }

  // =============================================================================
  // TRIP DAYS
  // =============================================================================

  /**
   * Update a trip day (e.g., mark meals as provided)
   */
  updateTripDay(day: UpdateTripDayDto): Observable<TravelTripDay> {
    const { id, ...updates } = day;

    // Calculate adjusted M&IE if meal flags changed
    let adjustedMie: number | undefined;

    return from(
      this.supabase.client
        .from('travel_trip_days')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Trip day updated', 'PerDiemService', { dayId: id });
        return data as TravelTripDay;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Batch update multiple trip days
   */
  updateTripDays(days: UpdateTripDayDto[]): Observable<TravelTripDay[]> {
    const updates = days.map(day => {
      const { id, ...updates } = day;
      return this.supabase.client
        .from('travel_trip_days')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();
    });

    return from(Promise.all(updates)).pipe(
      map(results => {
        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          throw new Error(`Failed to update ${errors.length} trip days`);
        }
        return results.map(r => r.data as TravelTripDay);
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // CALCULATIONS
  // =============================================================================

  /**
   * Calculate per diem for a trip (uses database function)
   */
  calculateTripPerDiem(tripId: string): Observable<TripPerDiemCalculation> {
    return from(
      this.supabase.client.rpc('calculate_trip_per_diem', {
        p_trip_id: tripId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TripPerDiemCalculation;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Calculate meal deduction amount
   */
  calculateMealDeduction(mieRate: number, meal: 'breakfast' | 'lunch' | 'dinner'): number {
    return mieRate * GSA_MEAL_DEDUCTION_PERCENTAGES[meal];
  }

  /**
   * Calculate first/last day M&IE (75% of full rate)
   */
  calculateTravelDayMie(fullMieRate: number): number {
    return fullMieRate * TRAVEL_DAY_MIE_PERCENTAGE;
  }

  /**
   * Calculate adjusted M&IE for a day with provided meals
   */
  calculateAdjustedMie(
    mieRate: number,
    options: {
      isFirstOrLastDay?: boolean;
      breakfastProvided?: boolean;
      lunchProvided?: boolean;
      dinnerProvided?: boolean;
    }
  ): number {
    let rate = mieRate;

    // Apply first/last day reduction
    if (options.isFirstOrLastDay) {
      rate = this.calculateTravelDayMie(rate);
    }

    // Deduct provided meals
    if (options.breakfastProvided) {
      rate -= this.calculateMealDeduction(mieRate, 'breakfast');
    }
    if (options.lunchProvided) {
      rate -= this.calculateMealDeduction(mieRate, 'lunch');
    }
    if (options.dinnerProvided) {
      rate -= this.calculateMealDeduction(mieRate, 'dinner');
    }

    return Math.max(0, rate);
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize service - load user's trips
   */
  initialize(): void {
    this.getMyTrips().subscribe({
      error: (err) => this.logger.warn('Failed to load travel trips', 'PerDiemService', err)
    });
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('PerDiemService error', error, 'PerDiemService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
