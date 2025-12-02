import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  Vendor,
  VendorAlias,
  VendorContact,
  VendorDocument,
  VendorSpendingSummary,
  VendorStats,
  VendorNeedingW9,
  CreateVendorDto,
  UpdateVendorDto,
  CreateVendorContactDto,
  CreateVendorAliasDto,
  VendorFilters,
  VendorStatus
} from '../models/vendor.model';

/**
 * Service for managing vendors/merchants
 * Supports vendor tracking, categorization, and 1099 reporting
 */
@Injectable({
  providedIn: 'root'
})
export class VendorService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state
  private _vendors = signal<Vendor[]>([]);
  vendors = this._vendors.asReadonly();

  // Computed: active vendors only
  activeVendors = computed(() => this._vendors().filter(v => v.status === 'active'));

  // Computed: preferred vendors
  preferredVendors = computed(() => this._vendors().filter(v => v.is_preferred));

  // Computed: vendors count
  vendorCount = computed(() => this._vendors().length);

  // =============================================================================
  // VENDORS CRUD
  // =============================================================================

  /**
   * Get all vendors for the organization
   */
  getVendors(filters?: VendorFilters): Observable<Vendor[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    let query = this.supabase.client
      .from('vendors')
      .select(`
        *,
        aliases:vendor_aliases(*),
        contacts:vendor_contacts(*),
        documents:vendor_documents(*)
      `)
      .eq('organization_id', organizationId)
      .order('name', { ascending: true });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.is_preferred !== undefined) {
      query = query.eq('is_preferred', filters.is_preferred);
    }
    if (filters?.business_type) {
      query = query.eq('business_type', filters.business_type);
    }
    if (filters?.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Vendor[];
      }),
      tap(vendors => this._vendors.set(vendors)),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single vendor by ID
   */
  getVendor(vendorId: string): Observable<Vendor> {
    return from(
      this.supabase.client
        .from('vendors')
        .select(`
          *,
          aliases:vendor_aliases(*),
          contacts:vendor_contacts(*),
          documents:vendor_documents(*)
        `)
        .eq('id', vendorId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as Vendor;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create a new vendor
   */
  createVendor(vendor: CreateVendorDto): Observable<Vendor> {
    const organizationId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('vendors')
        .insert({
          ...vendor,
          organization_id: organizationId,
          created_by: userId,
          status: 'active'
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Vendor created', 'VendorService', { vendorId: data.id });
        return data as Vendor;
      }),
      tap(() => this.getVendors().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Update a vendor
   */
  updateVendor(vendor: UpdateVendorDto): Observable<Vendor> {
    const { id, ...updates } = vendor;

    return from(
      this.supabase.client
        .from('vendors')
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
        this.logger.info('Vendor updated', 'VendorService', { vendorId: id });
        return data as Vendor;
      }),
      tap(() => this.getVendors().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a vendor
   */
  deleteVendor(vendorId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('vendors')
        .delete()
        .eq('id', vendorId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Vendor deleted', 'VendorService', { vendorId });
      }),
      tap(() => this.getVendors().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Update vendor status
   */
  updateVendorStatus(vendorId: string, status: VendorStatus): Observable<Vendor> {
    return this.updateVendor({ id: vendorId, status });
  }

  /**
   * Toggle preferred status
   */
  togglePreferred(vendorId: string, isPreferred: boolean): Observable<Vendor> {
    return this.updateVendor({ id: vendorId, is_preferred: isPreferred });
  }

  /**
   * Mark W-9 as on file
   */
  markW9OnFile(vendorId: string, onFile: boolean): Observable<Vendor> {
    return this.updateVendor({ id: vendorId, is_w9_on_file: onFile });
  }

  // =============================================================================
  // VENDOR ALIASES
  // =============================================================================

  /**
   * Add an alias for a vendor
   */
  addAlias(alias: CreateVendorAliasDto): Observable<VendorAlias> {
    return from(
      this.supabase.client
        .from('vendor_aliases')
        .insert(alias)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Vendor alias added', 'VendorService', { alias: alias.alias });
        return data as VendorAlias;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Remove an alias
   */
  removeAlias(aliasId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('vendor_aliases')
        .delete()
        .eq('id', aliasId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // VENDOR CONTACTS
  // =============================================================================

  /**
   * Add a contact to a vendor
   */
  addContact(contact: CreateVendorContactDto): Observable<VendorContact> {
    return from(
      this.supabase.client
        .from('vendor_contacts')
        .insert(contact)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Vendor contact added', 'VendorService', { name: contact.name });
        return data as VendorContact;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update a contact
   */
  updateContact(contactId: string, updates: Partial<VendorContact>): Observable<VendorContact> {
    return from(
      this.supabase.client
        .from('vendor_contacts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as VendorContact;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Remove a contact
   */
  removeContact(contactId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('vendor_contacts')
        .delete()
        .eq('id', contactId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // VENDOR MATCHING
  // =============================================================================

  /**
   * Match a merchant name to an existing vendor
   */
  matchVendor(merchantName: string): Observable<string | null> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('match_vendor_for_merchant', {
        p_organization_id: organizationId,
        p_merchant_name: merchantName
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as string | null;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // VENDOR STATS & REPORTING
  // =============================================================================

  /**
   * Get vendor statistics
   */
  getVendorStats(startDate?: string, endDate?: string): Observable<VendorStats[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_vendor_stats', {
        p_organization_id: organizationId,
        p_start_date: startDate || null,
        p_end_date: endDate || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as VendorStats[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get vendors needing W-9 for 1099 reporting
   */
  getVendorsNeedingW9(threshold = 600): Observable<VendorNeedingW9[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_vendors_needing_w9', {
        p_organization_id: organizationId,
        p_threshold: threshold
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as VendorNeedingW9[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get spending summary for all vendors
   */
  getSpendingSummary(): Observable<VendorSpendingSummary[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('vendor_spending_summary')
        .select('*')
        .eq('organization_id', organizationId)
        .order('total_spent', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as VendorSpendingSummary[];
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize service - load vendors
   */
  initialize(): void {
    this.getVendors().subscribe({
      error: (err) => this.logger.warn('Failed to load vendors', 'VendorService', err)
    });
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('VendorService error', error, 'VendorService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
