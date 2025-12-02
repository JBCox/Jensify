import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  TaxRate,
  TaxCategory,
  CreateTaxRateDto,
  UpdateTaxRateDto,
  CreateTaxCategoryDto,
  UpdateTaxCategoryDto,
  TaxReportRow,
  TaxReportFilters,
  TaxLookupResult,
  TaxSummary,
  TaxType
} from '../models/tax.model';

/**
 * Service for managing tax rates, categories, and reporting
 * Supports multiple tax types: VAT, GST, Sales Tax, etc.
 */
@Injectable({
  providedIn: 'root'
})
export class TaxService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state
  private _taxRates = signal<TaxRate[]>([]);
  private _taxCategories = signal<TaxCategory[]>([]);

  taxRates = this._taxRates.asReadonly();
  taxCategories = this._taxCategories.asReadonly();

  // Computed: active rates only
  activeTaxRates = computed(() => this._taxRates().filter(r => r.is_active));

  // Computed: rates by country
  ratesByCountry = computed(() => {
    const grouped: Record<string, TaxRate[]> = {};
    for (const rate of this._taxRates()) {
      if (!grouped[rate.country_code]) {
        grouped[rate.country_code] = [];
      }
      grouped[rate.country_code].push(rate);
    }
    return grouped;
  });

  // =============================================================================
  // TAX RATES
  // =============================================================================

  /**
   * Get all tax rates for the organization
   */
  getTaxRates(): Observable<TaxRate[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('tax_rates')
        .select('*')
        .eq('organization_id', organizationId)
        .order('country_code', { ascending: true })
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TaxRate[];
      }),
      tap(rates => this._taxRates.set(rates)),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single tax rate by ID
   */
  getTaxRate(rateId: string): Observable<TaxRate> {
    return from(
      this.supabase.client
        .from('tax_rates')
        .select('*')
        .eq('id', rateId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TaxRate;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new tax rate
   */
  createTaxRate(rate: CreateTaxRateDto): Observable<TaxRate> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('tax_rates')
        .insert({
          ...rate,
          organization_id: organizationId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Tax rate created', 'TaxService', { name: rate.name });
        return data as TaxRate;
      }),
      tap(() => this.getTaxRates().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing tax rate
   */
  updateTaxRate(rate: UpdateTaxRateDto): Observable<TaxRate> {
    const { id, ...updates } = rate;

    return from(
      this.supabase.client
        .from('tax_rates')
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
        this.logger.info('Tax rate updated', 'TaxService', { id });
        return data as TaxRate;
      }),
      tap(() => this.getTaxRates().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a tax rate
   */
  deleteTaxRate(rateId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('tax_rates')
        .delete()
        .eq('id', rateId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Tax rate deleted', 'TaxService', { id: rateId });
      }),
      tap(() => this.getTaxRates().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Lookup applicable tax rate for a jurisdiction
   */
  lookupTaxRate(
    countryCode: string,
    stateProvince?: string,
    taxType: TaxType = 'sales_tax',
    date?: Date
  ): Observable<TaxLookupResult | null> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_applicable_tax_rate', {
        p_organization_id: organizationId,
        p_country_code: countryCode,
        p_state_province: stateProvince || null,
        p_tax_type: taxType,
        p_date: date ? date.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) return null;
        return data[0] as TaxLookupResult;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // TAX CATEGORIES
  // =============================================================================

  /**
   * Get all tax categories for the organization
   */
  getTaxCategories(): Observable<TaxCategory[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('tax_categories')
        .select(`
          *,
          default_rate:default_rate_id(*)
        `)
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TaxCategory[];
      }),
      tap(categories => this._taxCategories.set(categories)),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new tax category
   */
  createTaxCategory(category: CreateTaxCategoryDto): Observable<TaxCategory> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('tax_categories')
        .insert({
          ...category,
          organization_id: organizationId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Tax category created', 'TaxService', { name: category.name });
        return data as TaxCategory;
      }),
      tap(() => this.getTaxCategories().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Update an existing tax category
   */
  updateTaxCategory(category: UpdateTaxCategoryDto): Observable<TaxCategory> {
    const { id, ...updates } = category;

    return from(
      this.supabase.client
        .from('tax_categories')
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
        this.logger.info('Tax category updated', 'TaxService', { id });
        return data as TaxCategory;
      }),
      tap(() => this.getTaxCategories().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a tax category
   */
  deleteTaxCategory(categoryId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('tax_categories')
        .delete()
        .eq('id', categoryId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Tax category deleted', 'TaxService', { id: categoryId });
      }),
      tap(() => this.getTaxCategories().subscribe()),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // TAX REPORTING
  // =============================================================================

  /**
   * Get tax report for a date range
   */
  getTaxReport(filters: TaxReportFilters): Observable<TaxReportRow[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_tax_report', {
        p_organization_id: organizationId,
        p_start_date: filters.start_date,
        p_end_date: filters.end_date,
        p_group_by: filters.group_by || 'tax_type'
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TaxReportRow[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get tax summary for dashboard
   */
  getTaxSummary(startDate: string, endDate: string): Observable<TaxSummary> {
    return this.getTaxReport({
      start_date: startDate,
      end_date: endDate,
      group_by: 'tax_type'
    }).pipe(
      map(rows => {
        const summary: TaxSummary = {
          total_tax_paid: 0,
          total_recoverable: 0,
          total_non_recoverable: 0,
          by_type: {}
        };

        for (const row of rows) {
          summary.total_tax_paid += row.total_tax;
          summary.total_recoverable += row.recoverable_tax;
          summary.total_non_recoverable += row.non_recoverable_tax;
          summary.by_type[row.group_key] = row.total_tax;
        }

        return summary;
      })
    );
  }

  // =============================================================================
  // SEED DEFAULT RATES
  // =============================================================================

  /**
   * Seed default tax rates for the organization
   */
  seedDefaultRates(): Observable<void> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('seed_default_tax_rates', {
        p_organization_id: organizationId
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Default tax rates seeded', 'TaxService');
      }),
      tap(() => {
        this.getTaxRates().subscribe();
        this.getTaxCategories().subscribe();
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize service - load tax rates and categories
   */
  initialize(): void {
    this.getTaxRates().subscribe({
      error: (err) => this.logger.warn('Failed to load tax rates', 'TaxService', err)
    });
    this.getTaxCategories().subscribe({
      error: (err) => this.logger.warn('Failed to load tax categories', 'TaxService', err)
    });
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('TaxService error', error, 'TaxService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
