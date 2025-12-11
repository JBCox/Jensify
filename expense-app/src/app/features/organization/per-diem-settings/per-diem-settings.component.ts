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
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterModule } from '@angular/router';
import { PerDiemService } from '../../../core/services/per-diem.service';
import { NotificationService } from '../../../core/services/notification.service';
import { PerDiemRate } from '../../../core/models/per-diem.model';

@Component({
  selector: 'app-per-diem-settings',
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
            <h1 class="jensify-page-title">Per Diem & Travel Allowances</h1>
            <p class="jensify-page-subtitle">Configure per diem rates for business travel</p>
          </div>
        </div>
        <button mat-flat-button color="primary" (click)="showAddForm = true" [disabled]="showAddForm">
          <mat-icon>add</mat-icon>
          Add Rate
        </button>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else {
        <!-- GSA Info Card -->
        <mat-card class="jensify-card info-card">
          <mat-card-content>
            <div class="info-banner">
              <mat-icon>info</mat-icon>
              <div class="info-text">
                <strong>GSA Per Diem Rates</strong>
                <p>Per diem rates follow GSA guidelines. First and last travel days receive 75% of the M&IE rate. Meals provided by others should be deducted from the daily allowance.</p>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <!-- Add Rate Form -->
        @if (showAddForm) {
          <mat-card class="jensify-card form-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">add_location</mat-icon>
              <mat-card-title>Add Per Diem Rate</mat-card-title>
              <mat-card-subtitle>Configure rates for a specific location</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="rateForm" (ngSubmit)="addRate()">
                <div class="form-row">
                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Location</mat-label>
                    <input matInput formControlName="location">
                    <mat-icon matPrefix>location_on</mat-icon>
                    <mat-hint>e.g., New York, NY</mat-hint>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Country Code</mat-label>
                    <mat-select formControlName="country_code">
                      <mat-option value="US">United States</mat-option>
                      <mat-option value="CA">Canada</mat-option>
                      <mat-option value="GB">United Kingdom</mat-option>
                      <mat-option value="DE">Germany</mat-option>
                      <mat-option value="FR">France</mat-option>
                      <mat-option value="JP">Japan</mat-option>
                      <mat-option value="AU">Australia</mat-option>
                    </mat-select>
                  </mat-form-field>
                </div>

                <div class="form-row">
                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Lodging Rate (per night)</mat-label>
                    <input matInput formControlName="lodging_rate" type="number" step="0.01">
                    <span matTextPrefix>$&nbsp;</span>
                    <mat-icon matSuffix>hotel</mat-icon>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>M&IE Rate (per day)</mat-label>
                    <input matInput formControlName="mie_rate" type="number" step="0.01">
                    <span matTextPrefix>$&nbsp;</span>
                    <mat-icon matSuffix>restaurant</mat-icon>
                    <mat-hint>Meals & Incidental Expenses</mat-hint>
                  </mat-form-field>
                </div>

                <div class="form-row">
                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Fiscal Year</mat-label>
                    <mat-select formControlName="fiscal_year">
                      <mat-option [value]="2024">2024</mat-option>
                      <mat-option [value]="2025">2025</mat-option>
                      <mat-option [value]="2026">2026</mat-option>
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Effective From</mat-label>
                    <input matInput formControlName="effective_from" type="date">
                  </mat-form-field>
                </div>

                <div class="form-actions">
                  <button mat-stroked-button type="button" (click)="cancelAdd()">Cancel</button>
                  <button mat-flat-button color="primary" type="submit"
                          [disabled]="rateForm.invalid || saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      <ng-container><mat-icon>save</mat-icon> Save Rate</ng-container>
                    }
                  </button>
                </div>
              </form>
            </mat-card-content>
          </mat-card>
        }

        <!-- Per Diem Rates List -->
        <mat-card class="jensify-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="card-icon">payments</mat-icon>
            <mat-card-title>Per Diem Rates</mat-card-title>
            <mat-card-subtitle>{{ rates().length }} location(s) configured</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (rates().length === 0) {
              <div class="empty-state">
                <mat-icon>map</mat-icon>
                <h3>No Per Diem Rates</h3>
                <p>Add per diem rates for different locations to enable travel allowance calculations.</p>
              </div>
            } @else {
              <div class="rates-grid">
                @for (rate of rates(); track rate.id) {
                  <div class="rate-card">
                    <div class="rate-header">
                      <div class="rate-location">
                        <mat-icon>location_on</mat-icon>
                        <div>
                          <span class="location-name">{{ rate.location }}</span>
                          <span class="country-code">{{ rate.country_code }}</span>
                        </div>
                      </div>
                      <mat-chip-set>
                        @if (rate.is_standard_rate) {
                          <mat-chip>Standard</mat-chip>
                        } @else {
                          <mat-chip color="primary" highlighted>Locality</mat-chip>
                        }
                      </mat-chip-set>
                    </div>
                    <div class="rate-details">
                      <div class="rate-item">
                        <span class="rate-label">Lodging</span>
                        <span class="rate-value">{{ rate.lodging_rate | currency:'USD' }}/night</span>
                      </div>
                      <div class="rate-item">
                        <span class="rate-label">M&IE</span>
                        <span class="rate-value">{{ rate.mie_rate | currency:'USD' }}/day</span>
                      </div>
                      <div class="rate-item total">
                        <span class="rate-label">Total</span>
                        <span class="rate-value">{{ rate.total_rate | currency:'USD' }}/day</span>
                      </div>
                    </div>
                    <div class="rate-footer">
                      <span class="fiscal-year">FY {{ rate.fiscal_year }}</span>
                      <button mat-icon-button color="warn" (click)="deleteRate(rate)" matTooltip="Delete Rate">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- Meal Deduction Reference -->
        <mat-card class="jensify-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="card-icon ref-icon">restaurant_menu</mat-icon>
            <mat-card-title>Meal Deduction Guide</mat-card-title>
            <mat-card-subtitle>Standard GSA meal deductions when meals are provided</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <div class="deduction-grid">
              <div class="deduction-item">
                <mat-icon>free_breakfast</mat-icon>
                <div class="deduction-info">
                  <span class="meal-name">Breakfast</span>
                  <span class="deduction-percent">20% of M&IE</span>
                </div>
              </div>
              <div class="deduction-item">
                <mat-icon>lunch_dining</mat-icon>
                <div class="deduction-info">
                  <span class="meal-name">Lunch</span>
                  <span class="deduction-percent">30% of M&IE</span>
                </div>
              </div>
              <div class="deduction-item">
                <mat-icon>dinner_dining</mat-icon>
                <div class="deduction-info">
                  <span class="meal-name">Dinner</span>
                  <span class="deduction-percent">50% of M&IE</span>
                </div>
              </div>
              <div class="deduction-item travel-day">
                <mat-icon>flight_takeoff</mat-icon>
                <div class="deduction-info">
                  <span class="meal-name">First/Last Day</span>
                  <span class="deduction-percent">75% of M&IE</span>
                </div>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
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

    .info-card {
      margin-bottom: var(--jensify-spacing-lg, 1.5rem);
    }

    .info-banner {
      display: flex;
      align-items: flex-start;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-sm, 0.5rem);
      background: rgba(59, 130, 246, 0.1);
      border-radius: var(--jensify-radius-md, 8px);

      mat-icon {
        color: #3b82f6;
        flex-shrink: 0;
      }

      .info-text {
        strong {
          color: var(--jensify-text-strong, #1a1a1a);
        }

        p {
          margin: var(--jensify-spacing-xs, 0.25rem) 0 0;
          font-size: 0.875rem;
          color: var(--jensify-text-muted, #666);
        }
      }
    }

    .form-card {
      margin-bottom: var(--jensify-spacing-lg, 1.5rem);
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

    .ref-icon {
      background: #22c55e;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
      margin-bottom: var(--jensify-spacing-md, 1rem);
    }

    .form-field {
      width: 100%;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--jensify-spacing-sm, 0.5rem);
      padding-top: var(--jensify-spacing-md, 1rem);
    }

    .form-actions button {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-xs, 0.25rem);
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

    .rates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
    }

    .rate-card {
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);
      border: 1px solid var(--jensify-border-color, #e0e0e0);
    }

    .rate-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--jensify-spacing-md, 1rem);
    }

    .rate-location {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-sm, 0.5rem);

      mat-icon {
        color: var(--jensify-primary, #ff5900);
      }
    }

    .location-name {
      display: block;
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .country-code {
      font-size: 0.75rem;
      color: var(--jensify-text-muted, #666);
    }

    .rate-details {
      display: flex;
      flex-direction: column;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    .rate-item {
      display: flex;
      justify-content: space-between;
      padding: var(--jensify-spacing-xs, 0.25rem) 0;

      &.total {
        border-top: 1px solid var(--jensify-border-color, #e0e0e0);
        padding-top: var(--jensify-spacing-sm, 0.5rem);
        margin-top: var(--jensify-spacing-xs, 0.25rem);
      }
    }

    .rate-label {
      color: var(--jensify-text-muted, #666);
    }

    .rate-value {
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .rate-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: var(--jensify-spacing-md, 1rem);
      padding-top: var(--jensify-spacing-sm, 0.5rem);
      border-top: 1px solid var(--jensify-border-color, #e0e0e0);
    }

    .fiscal-year {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    .deduction-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
    }

    .deduction-item {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);

      mat-icon {
        color: var(--jensify-primary, #ff5900);
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      &.travel-day {
        background: rgba(59, 130, 246, 0.1);

        mat-icon {
          color: #3b82f6;
        }
      }
    }

    .deduction-info {
      display: flex;
      flex-direction: column;
    }

    .meal-name {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .deduction-percent {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    :host-context(.dark) {
      .info-text strong, .location-name, .rate-value, .meal-name {
        color: #fff;
      }

      .rate-card, .deduction-item {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
      }
    }

    @media (max-width: 767px) {
      .rates-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerDiemSettingsComponent implements OnInit {
  private perDiemService = inject(PerDiemService);
  private notificationService = inject(NotificationService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  rates = signal<PerDiemRate[]>([]);
  showAddForm = false;

  rateForm: FormGroup = this.fb.group({
    location: ['', Validators.required],
    country_code: ['US', Validators.required],
    lodging_rate: [0, [Validators.required, Validators.min(0)]],
    mie_rate: [0, [Validators.required, Validators.min(0)]],
    fiscal_year: [new Date().getFullYear(), Validators.required],
    effective_from: [new Date().toISOString().split('T')[0], Validators.required],
    is_standard_rate: [false],
  });

  ngOnInit(): void {
    this.loadRates();
  }

  loadRates(): void {
    this.perDiemService.getPerDiemRates().subscribe({
      next: (rates) => {
        this.rates.set(rates);
        this.loading.set(false);
      },
      error: () => {
        this.notificationService.showError('Failed to load per diem rates');
        this.loading.set(false);
      },
    });
  }

  addRate(): void {
    if (this.rateForm.invalid) return;

    this.saving.set(true);
    const formValue = this.rateForm.value;

    this.perDiemService.createRate({
      location: formValue.location,
      country_code: formValue.country_code,
      lodging_rate: formValue.lodging_rate,
      mie_rate: formValue.mie_rate,
      total_rate: formValue.lodging_rate + formValue.mie_rate,
      fiscal_year: formValue.fiscal_year,
      effective_from: formValue.effective_from,
      is_standard_rate: formValue.is_standard_rate,
    }).subscribe({
      next: () => {
        this.notificationService.showSuccess('Per diem rate added');
        this.showAddForm = false;
        this.rateForm.reset({
          country_code: 'US',
          fiscal_year: new Date().getFullYear(),
          effective_from: new Date().toISOString().split('T')[0],
        });
        this.loadRates();
      },
      error: () => {
        this.notificationService.showError('Failed to add per diem rate');
      },
      complete: () => this.saving.set(false),
    });
  }

  cancelAdd(): void {
    this.showAddForm = false;
    this.rateForm.reset({
      country_code: 'US',
      fiscal_year: new Date().getFullYear(),
      effective_from: new Date().toISOString().split('T')[0],
    });
  }

  deleteRate(rate: PerDiemRate): void {
    if (!confirm(`Delete per diem rate for ${rate.location}?`)) return;

    this.perDiemService.deleteRate(rate.id).subscribe({
      next: () => {
        this.notificationService.showSuccess('Per diem rate deleted');
        this.loadRates();
      },
      error: () => {
        this.notificationService.showError('Failed to delete per diem rate');
      },
    });
  }
}
