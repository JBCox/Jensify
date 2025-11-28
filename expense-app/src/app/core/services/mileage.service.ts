import { Injectable, inject } from '@angular/core';
import { Observable, from, map, catchError, throwError } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import {
  MileageTrip,
  IRSMileageRate,
  CreateMileageTripDto,
  UpdateMileageTripDto,
  MileageFilterOptions,
  MileageStats,
  MileageRateCalculation,
  MileageCategory,
  MileageStatus,
  TripCoordinate
} from '../models/mileage.model';

/**
 * MileageService
 * Handles all mileage tracking operations including trip CRUD, IRS rate lookups,
 * and reimbursement calculations.
 */
@Injectable({
  providedIn: 'root'
})
export class MileageService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Get all trips for the current user with optional filters
   */
  getMyTrips(filters?: MileageFilterOptions): Observable<MileageTrip[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      (async () => {
        let query = this.supabase.client
          .from('mileage_trips')
          .select('*')
          .eq('user_id', userId)
          .order('trip_date', { ascending: false });

        query = this.applyFilters(query, filters);

        const { data, error } = await query;
        if (error) throw error;
        return data as MileageTrip[];
      })()
    ).pipe(catchError(this.handleError));
  }

  /**
   * Get all trips in the organization (for managers/finance)
   */
  getAllTrips(filters?: MileageFilterOptions): Observable<MileageTrip[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      (async () => {
        let query = this.supabase.client
          .from('mileage_trips')
          .select('*')
          .eq('organization_id', organizationId)
          .order('trip_date', { ascending: false });

        query = this.applyFilters(query, filters);

        const { data, error} = await query;
        if (error) throw error;
        return data as MileageTrip[];
      })()
    ).pipe(catchError(this.handleError));
  }

  /**
   * Get a single trip by ID
   */
  getTripById(id: string): Observable<MileageTrip> {
    return from(
      this.supabase.client
        .from('mileage_trips')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as MileageTrip;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new mileage trip
   */
  createTrip(tripDto: CreateMileageTripDto): Observable<MileageTrip> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      (async () => {
        const category = tripDto.category || 'business';
        const irsRate = await this.fetchIRSRate(category, tripDto.trip_date);

        const tripData = {
          ...tripDto,
          user_id: userId,
          organization_id: organizationId,
          category,
          irs_rate: irsRate,
          status: 'draft' as MileageStatus
        };

        const { data, error } = await this.supabase.client
          .from('mileage_trips')
          .insert(tripData)
          .select()
          .single();

        if (error) throw error;
        return data as MileageTrip;
      })()
    ).pipe(catchError(this.handleError));
  }

  /**
   * Update an existing trip
   */
  updateTrip(id: string, updates: UpdateMileageTripDto): Observable<MileageTrip> {
    return from(
      (async () => {
        const updateData: any = { ...updates };

        if (updates.trip_date || updates.category) {
          const { data: currentTrip } = await this.supabase.client
            .from('mileage_trips')
            .select('trip_date, category')
            .eq('id', id)
            .single();

          const tripDate = updates.trip_date || currentTrip?.trip_date;
          const category = updates.category || currentTrip?.category;

          if (tripDate && category) {
            const newRate = await this.fetchIRSRate(category as MileageCategory, tripDate);
            updateData.irs_rate = newRate;
          }
        }

        const { data, error } = await this.supabase.client
          .from('mileage_trips')
          .update(updateData)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return data as MileageTrip;
      })()
    ).pipe(catchError(this.handleError));
  }

  /**
   * Delete a trip
   */
  deleteTrip(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('mileage_trips')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get GPS coordinates for a trip
   */
  getTripCoordinates(tripId: string): Observable<TripCoordinate[]> {
    return from(
      this.supabase.client
        .from('trip_coordinates')
        .select('*')
        .eq('trip_id', tripId)
        .order('recorded_at', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TripCoordinate[];
      }),
      catchError(this.handleError)
    );
  }

  // ============================================================================
  // WORKFLOW OPERATIONS
  // ============================================================================

  submitTrip(id: string): Observable<MileageTrip> {
    return from(
      this.supabase.client
        .from('mileage_trips')
        .update({
          status: 'submitted',
          submitted_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as MileageTrip;
      }),
      catchError(this.handleError)
    );
  }

  approveTrip(id: string): Observable<MileageTrip> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('mileage_trips')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by: userId
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as MileageTrip;
      }),
      catchError(this.handleError)
    );
  }

  rejectTrip(id: string, reason: string): Observable<MileageTrip> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('mileage_trips')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by: userId,
          rejection_reason: reason
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as MileageTrip;
      }),
      catchError(this.handleError)
    );
  }

  markAsReimbursed(id: string): Observable<MileageTrip> {
    return from(
      this.supabase.client
        .from('mileage_trips')
        .update({
          status: 'reimbursed',
          reimbursed_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as MileageTrip;
      }),
      catchError(this.handleError)
    );
  }

  // ============================================================================
  // IRS RATE OPERATIONS
  // ============================================================================

  getCurrentRate(category: MileageCategory = 'business'): Observable<IRSMileageRate> {
    return this.getRate(category, new Date().toISOString().split('T')[0]);
  }

  getRate(category: MileageCategory, date: string): Observable<IRSMileageRate> {
    return from(
      this.supabase.client
        .from('irs_mileage_rates')
        .select('*')
        .eq('category', category)
        .lte('effective_date', date)
        .or(`end_date.is.null,end_date.gte.${date}`)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as IRSMileageRate;
      }),
      catchError(this.handleError)
    );
  }

  calculateReimbursement(
    distanceMiles: number,
    isRoundTrip: boolean,
    category: MileageCategory = 'business',
    tripDate?: string
  ): Observable<MileageRateCalculation> {
    const date = tripDate || new Date().toISOString().split('T')[0];

    return this.getRate(category, date).pipe(
      map(rateData => {
        const totalMiles = isRoundTrip ? distanceMiles * 2 : distanceMiles;
        const reimbursementAmount = totalMiles * rateData.rate;

        return {
          rate: rateData.rate,
          totalMiles,
          reimbursementAmount: Math.round(reimbursementAmount * 100) / 100,
          rateEffectiveDate: rateData.effective_date,
          category
        };
      })
    );
  }

  // ============================================================================
  // EXPENSE INTEGRATION
  // ============================================================================

  /**
   * Convert a mileage trip to an expense record
   * Uses organization's custom rate if configured, otherwise IRS rate
   * The expense can then be added to expense reports
   */
  convertTripToExpense(tripId: string): Observable<string> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.rpc('convert_trip_to_expense', {
        p_trip_id: tripId,
        p_user_id: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as string; // expense_id
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get the effective mileage rate for the current organization
   * Returns custom rate if configured, otherwise IRS rate
   */
  getOrganizationMileageRate(tripDate?: string): Observable<{
    rate: number;
    source: 'custom' | 'irs';
    irs_rate: number;
  }> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    const date = tripDate || new Date().toISOString().split('T')[0];

    return from(
      this.supabase.client.rpc('get_org_mileage_rate', {
        p_organization_id: organizationId,
        p_trip_date: date,
        p_category: 'business'
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as { rate: number; source: 'custom' | 'irs'; irs_rate: number };
      }),
      catchError(this.handleError)
    );
  }

  // ============================================================================
  // STATISTICS
  // ============================================================================

  getStats(startDate?: string, endDate?: string): Observable<MileageStats> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      (async () => {
        let query = this.supabase.client
          .from('mileage_trips')
          .select('*')
          .eq('user_id', userId);

        if (startDate) query = query.gte('trip_date', startDate);
        if (endDate) query = query.lte('trip_date', endDate);

        const { data, error } = await query;
        if (error) throw error;

        const trips = data as MileageTrip[];

        return {
          totalTrips: trips.length,
          totalMiles: trips.reduce((sum, trip) => sum + trip.total_miles, 0),
          totalReimbursement: trips.reduce((sum, trip) => sum + trip.reimbursement_amount, 0),
          tripsByStatus: {
            draft: trips.filter(t => t.status === 'draft').length,
            submitted: trips.filter(t => t.status === 'submitted').length,
            approved: trips.filter(t => t.status === 'approved').length,
            rejected: trips.filter(t => t.status === 'rejected').length,
            reimbursed: trips.filter(t => t.status === 'reimbursed').length,
          },
          tripsByCategory: {
            business: trips.filter(t => t.category === 'business').length,
            medical: trips.filter(t => t.category === 'medical').length,
            charity: trips.filter(t => t.category === 'charity').length,
            moving: trips.filter(t => t.category === 'moving').length,
          }
        };
      })()
    ).pipe(catchError(this.handleError));
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private async fetchIRSRate(category: MileageCategory, date: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('irs_mileage_rates')
      .select('rate')
      .eq('category', category)
      .lte('effective_date', date)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;
    if (!data) throw new Error(`No IRS rate found for ${category} on ${date}`);
    return data.rate;
  }

  private applyFilters(query: any, filters?: MileageFilterOptions): any {
    if (!filters) return query;

    if (filters.startDate) query = query.gte('trip_date', filters.startDate);
    if (filters.endDate) query = query.lte('trip_date', filters.endDate);
    if (filters.status) {
      query = Array.isArray(filters.status)
        ? query.in('status', filters.status)
        : query.eq('status', filters.status);
    }
    if (filters.category) {
      query = Array.isArray(filters.category)
        ? query.in('category', filters.category)
        : query.eq('category', filters.category);
    }
    if (filters.department) query = query.eq('department', filters.department);
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.hasExpense !== undefined) {
      query = filters.hasExpense
        ? query.not('expense_id', 'is', null)
        : query.is('expense_id', null);
    }
    if (filters.searchQuery) {
      query = query.or(
        `origin_address.ilike.%${filters.searchQuery}%,destination_address.ilike.%${filters.searchQuery}%,purpose.ilike.%${filters.searchQuery}%`
      );
    }

    return query;
  }

  private handleError(error: any): Observable<never> {
    console.error('MileageService Error:', error);
    return throwError(() => error);
  }
}
