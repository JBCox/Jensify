import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, throwError, of } from 'rxjs';
import { map, catchError, tap, shareReplay } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  SupportedCurrency,
  ExchangeRate,
  CurrencyConversionResult,
  CurrencySummary,
  CreateExchangeRateDto,
  OrganizationCurrencySettings
} from '../models/currency.model';

/**
 * Service for managing currencies and exchange rates
 * Handles currency conversion, rate management, and organization settings
 */
@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Cache for currencies (rarely changes)
  private currenciesCache$: Observable<SupportedCurrency[]> | null = null;

  // Current organization's base currency (reactive)
  baseCurrency = signal<string>('USD');

  /**
   * Get all supported currencies
   */
  getSupportedCurrencies(): Observable<SupportedCurrency[]> {
    if (!this.currenciesCache$) {
      this.currenciesCache$ = from(
        this.supabase.client
          .from('supported_currencies')
          .select('*')
          .eq('is_active', true)
          .order('code', { ascending: true })
      ).pipe(
        map(({ data, error }) => {
          if (error) throw error;
          return (data || []) as SupportedCurrency[];
        }),
        shareReplay(1),
        catchError(this.handleError)
      );
    }
    return this.currenciesCache$;
  }

  /**
   * Get a single currency by code
   */
  getCurrency(code: string): Observable<SupportedCurrency | null> {
    return from(
      this.supabase.client
        .from('supported_currencies')
        .select('*')
        .eq('code', code)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) return null;
        return data as SupportedCurrency;
      }),
      catchError(() => of(null))
    );
  }

  /**
   * Get exchange rates for a specific date
   */
  getExchangeRates(date?: string): Observable<ExchangeRate[]> {
    const rateDate = date || new Date().toISOString().split('T')[0];

    return from(
      this.supabase.client
        .from('currency_exchange_rates')
        .select('*')
        .lte('rate_date', rateDate)
        .order('rate_date', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        // Get latest rate for each currency pair
        const latestRates = new Map<string, ExchangeRate>();
        for (const rate of (data || [])) {
          const key = `${rate.from_currency}-${rate.to_currency}`;
          if (!latestRates.has(key)) {
            latestRates.set(key, rate as ExchangeRate);
          }
        }
        return Array.from(latestRates.values());
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get exchange rate for a specific currency pair
   */
  getExchangeRate(fromCurrency: string, toCurrency: string, date?: string): Observable<number> {
    if (fromCurrency === toCurrency) {
      return of(1.0);
    }

    return from(
      this.supabase.client.rpc('get_exchange_rate', {
        p_from_currency: fromCurrency,
        p_to_currency: toCurrency,
        p_date: date || new Date().toISOString().split('T')[0]
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as number;
      }),
      catchError(() => of(1.0)) // Default to 1:1 on error
    );
  }

  /**
   * Convert an amount between currencies
   */
  convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    date?: string
  ): Observable<CurrencyConversionResult> {
    if (fromCurrency === toCurrency) {
      return of({
        original_amount: amount,
        original_currency: fromCurrency,
        converted_amount: amount,
        target_currency: toCurrency,
        exchange_rate: 1.0,
        rate_date: date || new Date().toISOString().split('T')[0]
      });
    }

    return from(
      this.supabase.client.rpc('convert_currency', {
        p_amount: amount,
        p_from_currency: fromCurrency,
        p_to_currency: toCurrency,
        p_date: date || new Date().toISOString().split('T')[0]
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        return {
          original_amount: amount,
          original_currency: fromCurrency,
          converted_amount: data as number,
          target_currency: toCurrency,
          exchange_rate: (data as number) / amount,
          rate_date: date || new Date().toISOString().split('T')[0]
        };
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create or update an exchange rate
   */
  setExchangeRate(rateData: CreateExchangeRateDto): Observable<ExchangeRate> {
    const data = {
      ...rateData,
      source: rateData.source || 'manual',
      rate_date: rateData.rate_date || new Date().toISOString().split('T')[0]
    };

    return from(
      this.supabase.client
        .from('currency_exchange_rates')
        .upsert(data, {
          onConflict: 'from_currency,to_currency,rate_date'
        })
        .select()
        .single()
    ).pipe(
      map(({ data: result, error }) => {
        if (error) throw error;
        this.logger.info('Exchange rate set', 'CurrencyService', { rate: result });
        return result as ExchangeRate;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get organization's currency settings
   */
  getOrganizationCurrencySettings(): Observable<OrganizationCurrencySettings> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('organizations')
        .select('base_currency, supported_currencies, auto_convert_currency')
        .eq('id', organizationId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const settings = {
          base_currency: data?.base_currency || 'USD',
          supported_currencies: data?.supported_currencies || ['USD'],
          auto_convert_currency: data?.auto_convert_currency ?? true
        };

        // Update the base currency signal
        this.baseCurrency.set(settings.base_currency);

        return settings;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Update organization's currency settings
   */
  updateOrganizationCurrencySettings(
    settings: Partial<OrganizationCurrencySettings>
  ): Observable<void> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('organizations')
        .update({
          ...settings,
          updated_at: new Date().toISOString()
        })
        .eq('id', organizationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        if (settings.base_currency) {
          this.baseCurrency.set(settings.base_currency);
        }
        this.logger.info('Currency settings updated', 'CurrencyService');
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get currency summary for the organization
   */
  getCurrencySummary(): Observable<CurrencySummary[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_currency_summary', {
        p_organization_id: organizationId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as CurrencySummary[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Format amount with currency
   */
  formatAmount(amount: number, currency: string, locale = 'en-US'): string {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  }

  /**
   * Get currency symbol
   */
  getCurrencySymbol(currency: string): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        currencyDisplay: 'symbol',
      })
        .formatToParts(1)
        .find(part => part.type === 'currency')?.value || currency;
    } catch {
      return currency;
    }
  }

  /**
   * Clear currencies cache (call when currencies are updated)
   */
  clearCache(): void {
    this.currenciesCache$ = null;
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('CurrencyService error', error, 'CurrencyService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
