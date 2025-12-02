import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { CurrencyService } from '../../../core/services/currency.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SupportedCurrency, ExchangeRate, COMMON_CURRENCIES, OrganizationCurrencySettings } from '../../../core/models/currency.model';

@Component({
  selector: 'app-currency-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatTooltipModule,
    CurrencyPipe,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <button mat-icon-button routerLink="/admin" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1 class="jensify-page-title">Multi-Currency Settings</h1>
            <p class="jensify-page-subtitle">Configure currencies and exchange rates for your organization</p>
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else {
        <!-- Organization Settings -->
        <mat-card class="jensify-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="card-icon">settings</mat-icon>
            <mat-card-title>Organization Currency Settings</mat-card-title>
            <mat-card-subtitle>Configure how currencies are handled</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="settingsForm" (ngSubmit)="saveSettings()">
              <div class="form-row">
                <mat-form-field appearance="outline" class="form-field">
                  <mat-label>Base Currency</mat-label>
                  <mat-select formControlName="base_currency">
                    @for (currency of commonCurrencies; track currency.code) {
                      <mat-option [value]="currency.code">
                        {{ currency.symbol }} {{ currency.code }} - {{ currency.name }}
                      </mat-option>
                    }
                  </mat-select>
                  <mat-hint>All expenses will be converted to this currency for reporting</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline" class="form-field">
                  <mat-label>Supported Currencies</mat-label>
                  <mat-select formControlName="supported_currencies" multiple>
                    @for (currency of commonCurrencies; track currency.code) {
                      <mat-option [value]="currency.code">
                        {{ currency.symbol }} {{ currency.code }}
                      </mat-option>
                    }
                  </mat-select>
                  <mat-hint>Currencies employees can use for expenses</mat-hint>
                </mat-form-field>
              </div>

              <div class="toggle-row">
                <mat-slide-toggle formControlName="auto_convert_currency" color="primary">
                  <div class="toggle-content">
                    <span class="toggle-label">Auto-Convert to Base Currency</span>
                    <span class="toggle-description">Automatically convert expense amounts to the base currency</span>
                  </div>
                </mat-slide-toggle>
              </div>

              <div class="form-actions">
                <button mat-flat-button color="primary" type="submit"
                        [disabled]="settingsForm.invalid || saving()">
                  @if (saving()) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    <ng-container><mat-icon>save</mat-icon> Save Settings</ng-container>
                  }
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>

        <!-- Exchange Rates -->
        <mat-card class="jensify-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="card-icon rates-icon">currency_exchange</mat-icon>
            <mat-card-title>Exchange Rates</mat-card-title>
            <mat-card-subtitle>Current exchange rates relative to {{ settingsForm.value.base_currency }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (showRateForm) {
              <form [formGroup]="rateForm" (ngSubmit)="addRate()" class="rate-form">
                <mat-form-field appearance="outline">
                  <mat-label>From Currency</mat-label>
                  <mat-select formControlName="from_currency">
                    @for (currency of commonCurrencies; track currency.code) {
                      <mat-option [value]="currency.code">{{ currency.code }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-icon class="arrow">arrow_forward</mat-icon>

                <mat-form-field appearance="outline">
                  <mat-label>To Currency</mat-label>
                  <mat-select formControlName="to_currency">
                    @for (currency of commonCurrencies; track currency.code) {
                      <mat-option [value]="currency.code">{{ currency.code }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Rate</mat-label>
                  <input matInput formControlName="rate" type="number" step="0.0001">
                  <mat-hint>1 from = rate to</mat-hint>
                </mat-form-field>

                <div class="rate-actions">
                  <button mat-stroked-button type="button" (click)="showRateForm = false">Cancel</button>
                  <button mat-flat-button color="primary" type="submit" [disabled]="rateForm.invalid">Add Rate</button>
                </div>
              </form>
            } @else {
              <button mat-stroked-button (click)="showRateForm = true" class="add-rate-btn">
                <mat-icon>add</mat-icon>
                Add Manual Rate
              </button>
            }

            @if (exchangeRates().length > 0) {
              <div class="rates-list">
                @for (rate of exchangeRates(); track rate.id) {
                  <div class="rate-item">
                    <div class="rate-pair">
                      <span class="currency-code">{{ rate.from_currency }}</span>
                      <mat-icon>arrow_forward</mat-icon>
                      <span class="currency-code">{{ rate.to_currency }}</span>
                    </div>
                    <div class="rate-value">
                      <span class="rate-number">{{ rate.rate | number:'1.4-4' }}</span>
                      <mat-chip [matTooltip]="'Source: ' + rate.source">
                        {{ rate.source }}
                      </mat-chip>
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="empty-state">
                <mat-icon>currency_exchange</mat-icon>
                <h3>No Exchange Rates</h3>
                <p>Add manual exchange rates or rates will be calculated at 1:1</p>
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Currency Summary -->
        @if (currencySummary().length > 0) {
          <mat-card class="jensify-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon summary-icon">analytics</mat-icon>
              <mat-card-title>Currency Usage Summary</mat-card-title>
              <mat-card-subtitle>How currencies are used across expenses</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="summary-grid">
                @for (summary of currencySummary(); track summary.currency) {
                  <div class="summary-item">
                    <div class="summary-currency">
                      <span class="currency-symbol">{{ summary.currency_symbol }}</span>
                      <span class="currency-code">{{ summary.currency }}</span>
                    </div>
                    <div class="summary-stats">
                      <div class="stat">
                        <span class="stat-value">{{ summary.expense_count }}</span>
                        <span class="stat-label">Expenses</span>
                      </div>
                      <div class="stat">
                        <span class="stat-value">{{ summary.total_original_amount | currency:summary.currency:'symbol':'1.0-0' }}</span>
                        <span class="stat-label">Original</span>
                      </div>
                      <div class="stat">
                        <span class="stat-value">{{ summary.total_converted_amount | currency:settingsForm.value.base_currency:'symbol':'1.0-0' }}</span>
                        <span class="stat-label">Converted</span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            </mat-card-content>
          </mat-card>
        }
      }
    </div>
  `,
  styles: [`
    .jensify-header-content {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .back-button {
      margin-left: calc(-1 * var(--jensify-spacing-sm, 0.5rem));
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: var(--jensify-spacing-xl, 2rem);
    }

    .card-icon {
      background: var(--jensify-primary, #ff5900);
      color: white;
      border-radius: var(--jensify-radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
    }

    .rates-icon {
      background: #3b82f6;
    }

    .summary-icon {
      background: #22c55e;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
      margin-bottom: var(--jensify-spacing-md, 1rem);
    }

    .form-field {
      width: 100%;
    }

    .toggle-row {
      margin-bottom: var(--jensify-spacing-lg, 1.5rem);
    }

    .toggle-content {
      display: flex;
      flex-direction: column;
      margin-left: var(--jensify-spacing-sm, 0.5rem);
    }

    .toggle-label {
      font-weight: 500;
    }

    .toggle-description {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--jensify-spacing-md, 1rem);
    }

    .form-actions button {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    .rate-form {
      display: flex;
      align-items: flex-start;
      gap: var(--jensify-spacing-md, 1rem);
      flex-wrap: wrap;
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);
      margin-bottom: var(--jensify-spacing-md, 1rem);

      .arrow {
        margin-top: 1rem;
        color: var(--jensify-text-muted, #999);
      }

      mat-form-field {
        flex: 1;
        min-width: 120px;
      }
    }

    .rate-actions {
      display: flex;
      gap: var(--jensify-spacing-sm, 0.5rem);
      align-self: center;
    }

    .add-rate-btn {
      margin-bottom: var(--jensify-spacing-md, 1rem);
    }

    .rates-list {
      display: flex;
      flex-direction: column;
      gap: var(--jensify-spacing-sm, 0.5rem);
    }

    .rate-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);
    }

    .rate-pair {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-sm, 0.5rem);

      mat-icon {
        color: var(--jensify-text-muted, #999);
      }
    }

    .currency-code {
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .rate-value {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .rate-number {
      font-family: monospace;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--jensify-primary, #ff5900);
    }

    .empty-state {
      text-align: center;
      padding: var(--jensify-spacing-xl, 2rem);
      color: var(--jensify-text-muted, #666);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
      }

      h3 {
        margin: var(--jensify-spacing-md, 1rem) 0 var(--jensify-spacing-xs, 0.25rem);
      }

      p {
        margin: 0;
      }
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
    }

    .summary-item {
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);
    }

    .summary-currency {
      display: flex;
      align-items: baseline;
      gap: var(--jensify-spacing-sm, 0.5rem);
      margin-bottom: var(--jensify-spacing-sm, 0.5rem);
    }

    .currency-symbol {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--jensify-primary, #ff5900);
    }

    .summary-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--jensify-spacing-sm, 0.5rem);
    }

    .stat {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--jensify-text-muted, #666);
    }

    :host-context(.dark) {
      .currency-code, .stat-value {
        color: #fff;
      }

      .rate-item, .summary-item, .rate-form {
        background: rgba(255, 255, 255, 0.05);
      }
    }

    @media (max-width: 767px) {
      .rate-form {
        flex-direction: column;

        .arrow {
          transform: rotate(90deg);
          align-self: center;
          margin: 0;
        }

        mat-form-field {
          width: 100%;
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CurrencySettingsComponent implements OnInit {
  private currencyService = inject(CurrencyService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  exchangeRates = signal<ExchangeRate[]>([]);
  currencySummary = signal<any[]>([]);
  showRateForm = false;

  commonCurrencies = COMMON_CURRENCIES;

  settingsForm: FormGroup = this.fb.group({
    base_currency: ['USD', Validators.required],
    supported_currencies: [['USD'], Validators.required],
    auto_convert_currency: [true],
  });

  rateForm: FormGroup = this.fb.group({
    from_currency: ['', Validators.required],
    to_currency: ['', Validators.required],
    rate: [1, [Validators.required, Validators.min(0.0001)]],
  });

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      // Load organization settings
      this.currencyService.getOrganizationCurrencySettings().subscribe({
        next: (settings) => {
          this.settingsForm.patchValue({
            base_currency: settings.base_currency,
            supported_currencies: settings.supported_currencies,
            auto_convert_currency: settings.auto_convert_currency,
          });
        },
        error: (err) => console.error('Error loading settings:', err),
      });

      // Load exchange rates
      this.currencyService.getExchangeRates().subscribe({
        next: (rates) => this.exchangeRates.set(rates),
        error: (err) => console.error('Error loading rates:', err),
      });

      // Load currency summary
      this.currencyService.getCurrencySummary().subscribe({
        next: (summary) => this.currencySummary.set(summary),
        error: (err) => console.error('Error loading summary:', err),
      });
    } finally {
      this.loading.set(false);
    }
  }

  saveSettings(): void {
    if (this.settingsForm.invalid) return;

    this.saving.set(true);
    const settings: Partial<OrganizationCurrencySettings> = this.settingsForm.value;

    this.currencyService.updateOrganizationCurrencySettings(settings).subscribe({
      next: () => {
        this.notificationService.showSuccess('Currency settings saved');
        this.saving.set(false);
      },
      error: (err) => {
        console.error('Error saving settings:', err);
        this.notificationService.showError('Failed to save settings');
        this.saving.set(false);
      },
    });
  }

  addRate(): void {
    if (this.rateForm.invalid) return;

    const { from_currency, to_currency, rate } = this.rateForm.value;

    this.currencyService.setExchangeRate({
      from_currency,
      to_currency,
      rate,
      source: 'manual',
    }).subscribe({
      next: () => {
        this.notificationService.showSuccess('Exchange rate added');
        this.showRateForm = false;
        this.rateForm.reset();
        this.loadData();
      },
      error: (err) => {
        console.error('Error adding rate:', err);
        this.notificationService.showError('Failed to add exchange rate');
      },
    });
  }
}
