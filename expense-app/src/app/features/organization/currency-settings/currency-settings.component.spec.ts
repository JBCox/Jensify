import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { CurrencySettingsComponent } from './currency-settings.component';
import { CurrencyService } from '../../../core/services/currency.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ExchangeRate, OrganizationCurrencySettings } from '../../../core/models/currency.model';

describe('CurrencySettingsComponent', () => {
  let component: CurrencySettingsComponent;
  let fixture: ComponentFixture<CurrencySettingsComponent>;
  let currencyServiceMock: jasmine.SpyObj<CurrencyService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;

  const mockSettings: OrganizationCurrencySettings = {
    base_currency: 'USD',
    supported_currencies: ['USD', 'EUR', 'GBP'],
    auto_convert_currency: true
  };

  const mockExchangeRate: ExchangeRate = {
    id: 'rate-1',
    from_currency: 'EUR',
    to_currency: 'USD',
    rate: 1.0853,
    source: 'manual',
    rate_date: '2025-01-01',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockCurrencySummary = [
    {
      currency: 'USD',
      currency_name: 'US Dollar',
      currency_symbol: '$',
      expense_count: 10,
      total_original_amount: 1000,
      total_converted_amount: 1000
    },
    {
      currency: 'EUR',
      currency_name: 'Euro',
      currency_symbol: '€',
      expense_count: 5,
      total_original_amount: 500,
      total_converted_amount: 542.65
    }
  ];

  beforeEach(async () => {
    currencyServiceMock = jasmine.createSpyObj('CurrencyService', [
      'getOrganizationCurrencySettings',
      'updateOrganizationCurrencySettings',
      'getExchangeRates',
      'setExchangeRate',
      'getCurrencySummary'
    ]);

    notificationServiceMock = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    // Default return values
    currencyServiceMock.getOrganizationCurrencySettings.and.returnValue(of(mockSettings));
    currencyServiceMock.updateOrganizationCurrencySettings.and.returnValue(of(undefined));
    currencyServiceMock.getExchangeRates.and.returnValue(of([mockExchangeRate]));
    currencyServiceMock.setExchangeRate.and.returnValue(of(mockExchangeRate));
    currencyServiceMock.getCurrencySummary.and.returnValue(of(mockCurrencySummary));

    await TestBed.configureTestingModule({
      imports: [
        CurrencySettingsComponent,
        BrowserAnimationsModule,
        ReactiveFormsModule
      ],
      providers: [
        { provide: CurrencyService, useValue: currencyServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CurrencySettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load currency settings on init', async () => {
    await component.loadData();
    expect(currencyServiceMock.getOrganizationCurrencySettings).toHaveBeenCalled();
    expect(currencyServiceMock.getExchangeRates).toHaveBeenCalled();
    expect(currencyServiceMock.getCurrencySummary).toHaveBeenCalled();
    expect(component.loading()).toBe(false);
  });

  it('should populate settings form with loaded data', async () => {
    await component.loadData();
    expect(component.settingsForm.value.base_currency).toBe('USD');
    expect(component.settingsForm.value.supported_currencies).toEqual(['USD', 'EUR', 'GBP']);
    expect(component.settingsForm.value.auto_convert_currency).toBe(true);
  });

  it('should populate exchange rates signal', async () => {
    await component.loadData();
    expect(component.exchangeRates().length).toBe(1);
    expect(component.exchangeRates()[0]).toEqual(mockExchangeRate);
  });

  it('should populate currency summary signal', async () => {
    await component.loadData();
    expect(component.currencySummary().length).toBe(2);
    expect(component.currencySummary()[0].currency).toBe('USD');
  });

  it('should save settings successfully', () => {
    component.settingsForm.patchValue({
      base_currency: 'EUR',
      supported_currencies: ['EUR', 'USD'],
      auto_convert_currency: false
    });

    component.saveSettings();

    expect(component.saving()).toBe(true);
    setTimeout(() => {
      expect(currencyServiceMock.updateOrganizationCurrencySettings).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Currency settings saved');
      expect(component.saving()).toBe(false);
    });
  });

  it('should not save settings if form is invalid', () => {
    component.settingsForm.patchValue({ base_currency: '' });
    component.saveSettings();
    expect(currencyServiceMock.updateOrganizationCurrencySettings).not.toHaveBeenCalled();
  });

  it('should handle save settings error', () => {
    currencyServiceMock.updateOrganizationCurrencySettings.and.returnValue(
      throwError(() => new Error('Save failed'))
    );

    component.saveSettings();

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to save settings');
      expect(component.saving()).toBe(false);
    });
  });

  it('should add exchange rate successfully', () => {
    component.showRateForm = true;
    component.rateForm.patchValue({
      from_currency: 'GBP',
      to_currency: 'USD',
      rate: 1.27
    });

    component.addRate();

    setTimeout(() => {
      expect(currencyServiceMock.setExchangeRate).toHaveBeenCalledWith({
        from_currency: 'GBP',
        to_currency: 'USD',
        rate: 1.27,
        source: 'manual'
      });
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Exchange rate added');
      expect(component.showRateForm).toBe(false);
    });
  });

  it('should not add rate if form is invalid', () => {
    component.rateForm.patchValue({ from_currency: '' });
    component.addRate();
    expect(currencyServiceMock.setExchangeRate).not.toHaveBeenCalled();
  });

  it('should reset rate form after successful add', () => {
    component.rateForm.patchValue({
      from_currency: 'GBP',
      to_currency: 'USD',
      rate: 1.27
    });

    component.addRate();

    setTimeout(() => {
      expect(component.rateForm.value.from_currency).toBe('');
      expect(component.rateForm.value.to_currency).toBe('');
      expect(component.rateForm.value.rate).toBe(1);
    });
  });

  it('should handle add rate error', () => {
    currencyServiceMock.setExchangeRate.and.returnValue(
      throwError(() => new Error('Add failed'))
    );

    component.rateForm.patchValue({
      from_currency: 'GBP',
      to_currency: 'USD',
      rate: 1.27
    });

    component.addRate();

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to add exchange rate');
    });
  });

  it('should toggle rate form visibility', () => {
    expect(component.showRateForm).toBe(false);
    component.showRateForm = true;
    expect(component.showRateForm).toBe(true);
  });

  it('should have common currencies available', () => {
    expect(component.commonCurrencies.length).toBeGreaterThan(0);
    expect(component.commonCurrencies[0].code).toBeDefined();
    expect(component.commonCurrencies[0].name).toBeDefined();
    expect(component.commonCurrencies[0].symbol).toBeDefined();
  });

  it('should initialize with default form values', () => {
    expect(component.settingsForm.value.base_currency).toBe('USD');
    expect(component.settingsForm.value.supported_currencies).toEqual(['USD']);
    expect(component.settingsForm.value.auto_convert_currency).toBe(true);
  });

  it('should initialize rate form with default values', () => {
    expect(component.rateForm.value.from_currency).toBe('');
    expect(component.rateForm.value.to_currency).toBe('');
    expect(component.rateForm.value.rate).toBe(1);
  });

  it('should handle load settings error', () => {
    currencyServiceMock.getOrganizationCurrencySettings.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    spyOn(console, 'error');
    component.loadData();

    setTimeout(() => {
      expect(console.error).toHaveBeenCalledWith('Error loading settings:', jasmine.any(Error));
      expect(component.loading()).toBe(false);
    });
  });

  it('should handle load exchange rates error', () => {
    currencyServiceMock.getExchangeRates.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    spyOn(console, 'error');
    component.loadData();

    setTimeout(() => {
      expect(console.error).toHaveBeenCalledWith('Error loading rates:', jasmine.any(Error));
    });
  });

  it('should handle load currency summary error', () => {
    currencyServiceMock.getCurrencySummary.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    spyOn(console, 'error');
    component.loadData();

    setTimeout(() => {
      expect(console.error).toHaveBeenCalledWith('Error loading summary:', jasmine.any(Error));
    });
  });

  it('should set loading to false even if errors occur', async () => {
    currencyServiceMock.getOrganizationCurrencySettings.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    await component.loadData();
    expect(component.loading()).toBe(false);
  });
});
