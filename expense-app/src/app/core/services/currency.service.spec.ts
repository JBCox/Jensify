import { TestBed } from '@angular/core/testing';
import { CurrencyService } from './currency.service';
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

describe('CurrencyService', () => {
  let service: CurrencyService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';

  const mockCurrency: SupportedCurrency = {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimal_places: 2,
    is_active: true,
    created_at: '2024-01-01T10:00:00Z'
  };

  const mockCurrencies: SupportedCurrency[] = [
    mockCurrency,
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      decimal_places: 2,
      is_active: true,
      created_at: '2024-01-01T10:00:00Z'
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      decimal_places: 2,
      is_active: true,
      created_at: '2024-01-01T10:00:00Z'
    }
  ];

  const mockExchangeRate: ExchangeRate = {
    id: 'rate-1',
    from_currency: 'USD',
    to_currency: 'EUR',
    rate: 0.92,
    source: 'api',
    rate_date: '2024-01-01',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockExchangeRates: ExchangeRate[] = [
    mockExchangeRate,
    {
      ...mockExchangeRate,
      id: 'rate-2',
      to_currency: 'GBP',
      rate: 0.79
    }
  ];

  const mockCurrencySettings: OrganizationCurrencySettings = {
    base_currency: 'USD',
    supported_currencies: ['USD', 'EUR', 'GBP'],
    auto_convert_currency: true
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
      }
    });

    const organizationSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrgId
    });

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error'
    ]);

    TestBed.configureTestingModule({
      providers: [
        CurrencyService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(CurrencyService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have default base currency of USD', () => {
    expect(service.baseCurrency()).toBe('USD');
  });

  describe('getSupportedCurrencies', () => {
    it('should return supported currencies', (done) => {
      const mockResponse = { data: mockCurrencies, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getSupportedCurrencies().subscribe({
        next: (currencies) => {
          expect(currencies).toEqual(mockCurrencies);
          expect(eqSpy).toHaveBeenCalledWith('is_active', true);
          expect(orderSpy).toHaveBeenCalledWith('code', { ascending: true });
          done();
        },
        error: done.fail
      });
    });

    it('should cache currencies after first call', (done) => {
      const mockResponse = { data: mockCurrencies, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      // First call
      service.getSupportedCurrencies().subscribe({
        next: () => {
          // Second call should use cache
          service.getSupportedCurrencies().subscribe({
            next: (currencies) => {
              expect(currencies).toEqual(mockCurrencies);
              // from() should only be called once due to caching
              expect(supabaseServiceSpy.client.from).toHaveBeenCalledTimes(1);
              done();
            },
            error: done.fail
          });
        },
        error: done.fail
      });
    });
  });

  describe('getCurrency', () => {
    it('should return a single currency by code', (done) => {
      const mockResponse = { data: mockCurrency, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getCurrency('USD').subscribe({
        next: (currency) => {
          expect(currency).toEqual(mockCurrency);
          expect(eqSpy).toHaveBeenCalledWith('code', 'USD');
          done();
        },
        error: done.fail
      });
    });

    it('should return null for non-existent currency', (done) => {
      const mockError = { message: 'Not found' };
      const mockResponse = { data: null, error: mockError };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getCurrency('XYZ').subscribe({
        next: (currency) => {
          expect(currency).toBeNull();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getExchangeRates', () => {
    it('should return exchange rates for a date', (done) => {
      const mockResponse = { data: mockExchangeRates, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const lteSpy = jasmine.createSpy('lte').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ lte: lteSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExchangeRates('2024-01-01').subscribe({
        next: (rates) => {
          expect(rates.length).toBeGreaterThan(0);
          expect(lteSpy).toHaveBeenCalledWith('rate_date', '2024-01-01');
          done();
        },
        error: done.fail
      });
    });

    it('should use current date if none provided', (done) => {
      const mockResponse = { data: mockExchangeRates, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const lteSpy = jasmine.createSpy('lte').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ lte: lteSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getExchangeRates().subscribe({
        next: () => {
          const today = new Date().toISOString().split('T')[0];
          expect(lteSpy).toHaveBeenCalledWith('rate_date', today);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getExchangeRate', () => {
    it('should return 1.0 for same currency', (done) => {
      service.getExchangeRate('USD', 'USD').subscribe({
        next: (rate) => {
          expect(rate).toBe(1.0);
          // Should not call RPC for same currency
          expect(supabaseServiceSpy.client.rpc).not.toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should return exchange rate from RPC', (done) => {
      const mockResponse = { data: 0.92, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getExchangeRate('USD', 'EUR', '2024-01-01').subscribe({
        next: (rate) => {
          expect(rate).toBe(0.92);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_exchange_rate', {
            p_from_currency: 'USD',
            p_to_currency: 'EUR',
            p_date: '2024-01-01'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return 1.0 on error', (done) => {
      const mockError = { message: 'Rate not found' };
      const mockResponse = { data: null, error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getExchangeRate('USD', 'XYZ').subscribe({
        next: (rate) => {
          expect(rate).toBe(1.0);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('convertAmount', () => {
    it('should return same amount for same currency', (done) => {
      service.convertAmount(100, 'USD', 'USD').subscribe({
        next: (result) => {
          expect(result.original_amount).toBe(100);
          expect(result.converted_amount).toBe(100);
          expect(result.exchange_rate).toBe(1.0);
          expect(result.original_currency).toBe('USD');
          expect(result.target_currency).toBe('USD');
          done();
        },
        error: done.fail
      });
    });

    it('should convert amount using RPC', (done) => {
      const mockConvertedAmount = 92;
      const mockResponse = { data: mockConvertedAmount, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.convertAmount(100, 'USD', 'EUR', '2024-01-01').subscribe({
        next: (result) => {
          expect(result.original_amount).toBe(100);
          expect(result.converted_amount).toBe(92);
          expect(result.exchange_rate).toBe(0.92);
          expect(result.original_currency).toBe('USD');
          expect(result.target_currency).toBe('EUR');
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('convert_currency', {
            p_amount: 100,
            p_from_currency: 'USD',
            p_to_currency: 'EUR',
            p_date: '2024-01-01'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should handle conversion errors', (done) => {
      const mockError = { message: 'Conversion failed' };
      const mockResponse = { data: null, error: mockError };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.convertAmount(100, 'USD', 'XYZ').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('setExchangeRate', () => {
    const rateData: CreateExchangeRateDto = {
      from_currency: 'USD',
      to_currency: 'EUR',
      rate: 0.93
    };

    it('should create/update exchange rate', (done) => {
      const mockResponse = { data: mockExchangeRate, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const upsertSpy = jasmine.createSpy('upsert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        upsert: upsertSpy
      }) as any;

      service.setExchangeRate(rateData).subscribe({
        next: (rate) => {
          expect(rate).toEqual(mockExchangeRate);
          expect(upsertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            from_currency: 'USD',
            to_currency: 'EUR',
            rate: 0.93,
            source: 'manual'
          }), { onConflict: 'from_currency,to_currency,rate_date' });
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getOrganizationCurrencySettings', () => {
    it('should return organization currency settings', (done) => {
      const mockResponse = { data: mockCurrencySettings, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getOrganizationCurrencySettings().subscribe({
        next: (settings) => {
          expect(settings.base_currency).toBe('USD');
          expect(settings.supported_currencies).toContain('EUR');
          expect(settings.auto_convert_currency).toBe(true);
          expect(service.baseCurrency()).toBe('USD');
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getOrganizationCurrencySettings().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should provide defaults for missing data', (done) => {
      const mockResponse = { data: {}, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getOrganizationCurrencySettings().subscribe({
        next: (settings) => {
          expect(settings.base_currency).toBe('USD');
          expect(settings.supported_currencies).toEqual(['USD']);
          expect(settings.auto_convert_currency).toBe(true);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('updateOrganizationCurrencySettings', () => {
    it('should update organization currency settings', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updateOrganizationCurrencySettings({ base_currency: 'EUR' }).subscribe({
        next: () => {
          expect(service.baseCurrency()).toBe('EUR');
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.updateOrganizationCurrencySettings({ base_currency: 'EUR' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getCurrencySummary', () => {
    it('should return currency summary', (done) => {
      const mockSummary: CurrencySummary[] = [
        {
          currency: 'USD',
          currency_name: 'US Dollar',
          currency_symbol: '$',
          expense_count: 50,
          total_original_amount: 5000,
          total_converted_amount: 5000
        },
        {
          currency: 'EUR',
          currency_name: 'Euro',
          currency_symbol: '€',
          expense_count: 10,
          total_original_amount: 1000,
          total_converted_amount: 1085
        }
      ];
      const mockResponse = { data: mockSummary, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getCurrencySummary().subscribe({
        next: (summary) => {
          expect(summary).toEqual(mockSummary);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_currency_summary', {
            p_organization_id: mockOrgId
          });
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getCurrencySummary().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('formatAmount', () => {
    it('should format USD correctly', () => {
      const result = service.formatAmount(100.50, 'USD');
      expect(result).toBe('$100.50');
    });

    it('should format EUR correctly', () => {
      const result = service.formatAmount(100.50, 'EUR', 'en-US');
      expect(result).toBe('€100.50');
    });

    it('should handle invalid currency gracefully', () => {
      const result = service.formatAmount(100.50, 'INVALID');
      expect(result).toContain('INVALID');
      expect(result).toContain('100.50');
    });
  });

  describe('getCurrencySymbol', () => {
    it('should return USD symbol', () => {
      const result = service.getCurrencySymbol('USD');
      expect(result).toBe('$');
    });

    it('should return EUR symbol', () => {
      const result = service.getCurrencySymbol('EUR');
      expect(result).toBe('€');
    });

    it('should return GBP symbol', () => {
      const result = service.getCurrencySymbol('GBP');
      expect(result).toBe('£');
    });

    it('should return code for invalid currency', () => {
      const result = service.getCurrencySymbol('XYZ');
      expect(result).toBe('XYZ');
    });
  });

  describe('clearCache', () => {
    it('should clear the currencies cache', (done) => {
      const mockResponse = { data: mockCurrencies, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      // First call
      service.getSupportedCurrencies().subscribe({
        next: () => {
          // Clear cache
          service.clearCache();

          // Second call should make new request
          service.getSupportedCurrencies().subscribe({
            next: () => {
              // from() should be called twice now
              expect(supabaseServiceSpy.client.from).toHaveBeenCalledTimes(2);
              done();
            },
            error: done.fail
          });
        },
        error: done.fail
      });
    });
  });
});
