import { ChangeDetectionStrategy, Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { TaxService } from '../../../core/services/tax.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  TaxRate,
  TaxCategory,
  TaxType,
  TAX_TYPE_CONFIG,
  COMMON_TAX_COUNTRIES,
  US_STATE_TAX_RATES,
  formatTaxRate
} from '../../../core/models/tax.model';

type DialogMode = 'closed' | 'add-rate' | 'edit-rate' | 'add-category' | 'edit-category';

@Component({
  selector: 'app-tax-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatDividerModule
  ],
  template: `
    <div class="tax-settings-container">
      <header class="page-header">
        <div class="header-content">
          <button mat-icon-button (click)="goBack()" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="header-text">
            <h1>Tax & VAT Settings</h1>
            <p>Configure tax rates and categories for expense tracking</p>
          </div>
        </div>
        <div class="header-actions">
          <button mat-stroked-button (click)="seedDefaults()" [disabled]="loading()">
            <mat-icon>auto_fix_high</mat-icon>
            Seed Default Rates
          </button>
        </div>
      </header>

      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon tax-rates">
              <mat-icon>percent</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ taxRates().length }}</span>
              <span class="summary-label">Tax Rates</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon active">
              <mat-icon>check_circle</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ activeRateCount() }}</span>
              <span class="summary-label">Active Rates</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon categories">
              <mat-icon>category</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ taxCategories().length }}</span>
              <span class="summary-label">Categories</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon countries">
              <mat-icon>public</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ uniqueCountries().length }}</span>
              <span class="summary-label">Countries</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Loading tax settings...</span>
        </div>
      } @else {
        <mat-tab-group animationDuration="200ms">
          <!-- Tax Rates Tab -->
          <mat-tab label="Tax Rates">
            <div class="tab-content">
              <div class="tab-header">
                <h2>Tax Rates by Jurisdiction</h2>
                <button mat-flat-button color="primary" (click)="openAddRateDialog()">
                  <mat-icon>add</mat-icon>
                  Add Tax Rate
                </button>
              </div>

              @if (taxRates().length === 0) {
                <div class="empty-state">
                  <mat-icon>percent</mat-icon>
                  <h3>No Tax Rates Configured</h3>
                  <p>Add tax rates for the jurisdictions where your employees incur expenses.</p>
                  <button mat-flat-button color="primary" (click)="openAddRateDialog()">
                    <mat-icon>add</mat-icon>
                    Add First Tax Rate
                  </button>
                </div>
              } @else {
                <div class="rates-table-container">
                  <table mat-table [dataSource]="taxRates()" class="rates-table">
                    <!-- Name Column -->
                    <ng-container matColumnDef="name">
                      <th mat-header-cell *matHeaderCellDef>Name</th>
                      <td mat-cell *matCellDef="let rate">
                        <div class="rate-name">
                          <span>{{ rate.name }}</span>
                          @if (!rate.is_active) {
                            <mat-chip class="inactive-chip">Inactive</mat-chip>
                          }
                        </div>
                      </td>
                    </ng-container>

                    <!-- Country Column -->
                    <ng-container matColumnDef="country">
                      <th mat-header-cell *matHeaderCellDef>Location</th>
                      <td mat-cell *matCellDef="let rate">
                        <div class="location-cell">
                          <span class="country">{{ getCountryName(rate.country_code) }}</span>
                          @if (rate.state_province) {
                            <span class="state">{{ rate.state_province }}</span>
                          }
                        </div>
                      </td>
                    </ng-container>

                    <!-- Type Column -->
                    <ng-container matColumnDef="type">
                      <th mat-header-cell *matHeaderCellDef>Type</th>
                      <td mat-cell *matCellDef="let rate">
                        <mat-chip [class]="'type-chip ' + rate.tax_type">
                          {{ getTaxTypeLabel(rate.tax_type) }}
                        </mat-chip>
                      </td>
                    </ng-container>

                    <!-- Rate Column -->
                    <ng-container matColumnDef="rate">
                      <th mat-header-cell *matHeaderCellDef>Rate</th>
                      <td mat-cell *matCellDef="let rate">
                        <span class="rate-value">{{ formatRate(rate.rate) }}</span>
                      </td>
                    </ng-container>

                    <!-- Recoverable Column -->
                    <ng-container matColumnDef="recoverable">
                      <th mat-header-cell *matHeaderCellDef>Recoverable</th>
                      <td mat-cell *matCellDef="let rate">
                        @if (rate.is_recoverable) {
                          <mat-icon class="recoverable-yes">check_circle</mat-icon>
                        } @else {
                          <mat-icon class="recoverable-no">cancel</mat-icon>
                        }
                      </td>
                    </ng-container>

                    <!-- Actions Column -->
                    <ng-container matColumnDef="actions">
                      <th mat-header-cell *matHeaderCellDef>Actions</th>
                      <td mat-cell *matCellDef="let rate">
                        <button mat-icon-button matTooltip="Edit" (click)="openEditRateDialog(rate)">
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button mat-icon-button matTooltip="Delete" (click)="deleteRate(rate)" class="delete-btn">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </td>
                    </ng-container>

                    <tr mat-header-row *matHeaderRowDef="rateColumns"></tr>
                    <tr mat-row *matRowDef="let row; columns: rateColumns;"></tr>
                  </table>
                </div>
              }
            </div>
          </mat-tab>

          <!-- Tax Categories Tab -->
          <mat-tab label="Tax Categories">
            <div class="tab-content">
              <div class="tab-header">
                <h2>Expense Tax Categories</h2>
                <button mat-flat-button color="primary" (click)="openAddCategoryDialog()">
                  <mat-icon>add</mat-icon>
                  Add Category
                </button>
              </div>

              @if (taxCategories().length === 0) {
                <div class="empty-state">
                  <mat-icon>category</mat-icon>
                  <h3>No Tax Categories</h3>
                  <p>Create categories to classify expenses by their tax treatment.</p>
                  <button mat-flat-button color="primary" (click)="openAddCategoryDialog()">
                    <mat-icon>add</mat-icon>
                    Add First Category
                  </button>
                </div>
              } @else {
                <div class="categories-grid">
                  @for (category of taxCategories(); track category.id) {
                    <mat-card class="category-card">
                      <mat-card-header>
                        <mat-icon mat-card-avatar [class.taxable]="category.is_taxable">
                          {{ category.is_taxable ? 'receipt' : 'receipt_long' }}
                        </mat-icon>
                        <mat-card-title>{{ category.name }}</mat-card-title>
                        <mat-card-subtitle>
                          Code: {{ category.code }}
                          @if (category.vat_code) {
                            | VAT: {{ category.vat_code }}
                          }
                        </mat-card-subtitle>
                      </mat-card-header>
                      <mat-card-content>
                        @if (category.description) {
                          <p class="category-description">{{ category.description }}</p>
                        }
                        <div class="category-details">
                          <mat-chip [class]="category.is_taxable ? 'taxable' : 'exempt'">
                            {{ category.is_taxable ? 'Taxable' : 'Tax Exempt' }}
                          </mat-chip>
                          @if (category.default_rate) {
                            <span class="default-rate">
                              Default: {{ formatRate(category.default_rate.rate) }}
                            </span>
                          }
                        </div>
                      </mat-card-content>
                      <mat-card-actions align="end">
                        <button mat-icon-button matTooltip="Edit" (click)="openEditCategoryDialog(category)">
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button mat-icon-button matTooltip="Delete" (click)="deleteCategory(category)" class="delete-btn">
                          <mat-icon>delete</mat-icon>
                        </button>
                      </mat-card-actions>
                    </mat-card>
                  }
                </div>
              }
            </div>
          </mat-tab>

          <!-- Reference Tab -->
          <mat-tab label="Tax Reference">
            <div class="tab-content reference-tab">
              <h2>Tax Type Reference</h2>
              <div class="reference-grid">
                @for (type of taxTypes; track type.key) {
                  <mat-card class="reference-card">
                    <mat-card-header>
                      <mat-icon mat-card-avatar>{{ getTaxTypeIcon(type.key) }}</mat-icon>
                      <mat-card-title>{{ type.label }}</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <p>{{ type.description }}</p>
                    </mat-card-content>
                  </mat-card>
                }
              </div>

              <mat-divider></mat-divider>

              <h2>US State Sales Tax Reference</h2>
              <div class="state-tax-grid">
                @for (state of usStateTaxes; track state.code) {
                  <div class="state-tax-item">
                    <span class="state-code">{{ state.code }}</span>
                    <span class="state-rate">{{ formatRate(state.rate) }}</span>
                  </div>
                }
              </div>
              <p class="reference-note">
                * State base rates only. Local jurisdictions may add additional taxes.
              </p>
            </div>
          </mat-tab>
        </mat-tab-group>
      }

      <!-- Rate Dialog -->
      @if (dialogMode() === 'add-rate' || dialogMode() === 'edit-rate') {
        <div class="dialog-overlay" (click)="closeDialog()" (keydown.escape)="closeDialog()" tabindex="-1" role="dialog" aria-modal="true">
          <div class="dialog-container" (click)="$event.stopPropagation()" (keydown.escape)="closeDialog()" role="document">
            <div class="dialog-header">
              <h2>{{ dialogMode() === 'add-rate' ? 'Add Tax Rate' : 'Edit Tax Rate' }}</h2>
              <button mat-icon-button (click)="closeDialog()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <form [formGroup]="rateForm" (ngSubmit)="saveRate()" class="dialog-form">
              <mat-form-field appearance="outline">
                <mat-label>Name</mat-label>
                <input matInput formControlName="name">
                <mat-hint>e.g., Texas Sales Tax</mat-hint>
              </mat-form-field>

              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Country</mat-label>
                  <mat-select formControlName="country_code">
                    @for (country of countries; track country.code) {
                      <mat-option [value]="country.code">{{ country.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>State/Province</mat-label>
                  <input matInput formControlName="state_province">
                  <mat-hint>e.g., TX - Leave blank for national rates</mat-hint>
                </mat-form-field>
              </div>

              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Tax Type</mat-label>
                  <mat-select formControlName="tax_type">
                    @for (type of taxTypes; track type.key) {
                      <mat-option [value]="type.key">{{ type.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Rate (%)</mat-label>
                  <input matInput type="number" formControlName="rate" step="0.01" min="0" max="100">
                  <mat-hint>Enter as percentage (e.g., 8.25 for 8.25%)</mat-hint>
                </mat-form-field>
              </div>

              <div class="toggle-row">
                <mat-slide-toggle formControlName="is_recoverable">
                  Recoverable (Business can claim back)
                </mat-slide-toggle>
                <mat-slide-toggle formControlName="is_compound">
                  Compound Tax (Applied on top of other taxes)
                </mat-slide-toggle>
              </div>

              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Effective From</mat-label>
                  <input matInput type="date" formControlName="effective_from">
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Effective Until</mat-label>
                  <input matInput type="date" formControlName="effective_until">
                  <mat-hint>Leave blank if currently active</mat-hint>
                </mat-form-field>
              </div>

              @if (dialogMode() === 'edit-rate') {
                <mat-slide-toggle formControlName="is_active" class="active-toggle">
                  Rate is Active
                </mat-slide-toggle>
              }

              <div class="dialog-actions">
                <button mat-stroked-button type="button" (click)="closeDialog()">Cancel</button>
                <button mat-flat-button color="primary" type="submit" [disabled]="rateForm.invalid || saving()">
                  @if (saving()) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    {{ dialogMode() === 'add-rate' ? 'Add Rate' : 'Save Changes' }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- Category Dialog -->
      @if (dialogMode() === 'add-category' || dialogMode() === 'edit-category') {
        <div class="dialog-overlay" (click)="closeDialog()" (keydown.escape)="closeDialog()" tabindex="-1" role="dialog" aria-modal="true">
          <div class="dialog-container" (click)="$event.stopPropagation()" (keydown.escape)="closeDialog()" role="document">
            <div class="dialog-header">
              <h2>{{ dialogMode() === 'add-category' ? 'Add Tax Category' : 'Edit Tax Category' }}</h2>
              <button mat-icon-button (click)="closeDialog()">
                <mat-icon>close</mat-icon>
              </button>
            </div>
            <form [formGroup]="categoryForm" (ngSubmit)="saveCategory()" class="dialog-form">
              <mat-form-field appearance="outline">
                <mat-label>Category Name</mat-label>
                <input matInput formControlName="name">
                <mat-hint>e.g., Standard Rate</mat-hint>
              </mat-form-field>

              <div class="form-row">
                <mat-form-field appearance="outline">
                  <mat-label>Code</mat-label>
                  <input matInput formControlName="code">
                  <mat-hint>e.g., STD - Short code for reports</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>VAT Code (Optional)</mat-label>
                  <input matInput formControlName="vat_code">
                  <mat-hint>e.g., S1</mat-hint>
                </mat-form-field>
              </div>

              <mat-form-field appearance="outline">
                <mat-label>Description</mat-label>
                <textarea matInput formControlName="description" rows="2"
                          placeholder="Describe when this category applies"></textarea>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Default Tax Rate</mat-label>
                <mat-select formControlName="default_rate_id">
                  <mat-option [value]="null">No default rate</mat-option>
                  @for (rate of taxRates(); track rate.id) {
                    <mat-option [value]="rate.id">{{ rate.name }} ({{ formatRate(rate.rate) }})</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-slide-toggle formControlName="is_taxable">
                Category is Taxable
              </mat-slide-toggle>

              @if (dialogMode() === 'edit-category') {
                <mat-slide-toggle formControlName="is_active" class="active-toggle">
                  Category is Active
                </mat-slide-toggle>
              }

              <div class="dialog-actions">
                <button mat-stroked-button type="button" (click)="closeDialog()">Cancel</button>
                <button mat-flat-button color="primary" type="submit" [disabled]="categoryForm.invalid || saving()">
                  @if (saving()) {
                    <mat-spinner diameter="20"></mat-spinner>
                  } @else {
                    {{ dialogMode() === 'add-category' ? 'Add Category' : 'Save Changes' }}
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .tax-settings-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .back-button {
      margin-top: 4px;
    }

    .header-text h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .header-text p {
      margin: 4px 0 0;
      color: var(--jensify-text-secondary, #666);
    }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-card {
      background: var(--jensify-surface, #fff);
    }

    .summary-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px !important;
    }

    .summary-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .summary-icon.tax-rates {
      background: rgba(255, 89, 0, 0.1);
      color: var(--jensify-primary, #ff5900);
    }

    .summary-icon.active {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .summary-icon.categories {
      background: rgba(33, 150, 243, 0.1);
      color: #2196f3;
    }

    .summary-icon.countries {
      background: rgba(156, 39, 176, 0.1);
      color: #9c27b0;
    }

    .summary-info {
      display: flex;
      flex-direction: column;
    }

    .summary-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .summary-label {
      font-size: 13px;
      color: var(--jensify-text-secondary, #666);
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      gap: 16px;
      color: var(--jensify-text-secondary, #666);
    }

    .tab-content {
      padding: 24px 0;
    }

    .tab-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .tab-header h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
    }

    .empty-state {
      text-align: center;
      padding: 64px 24px;
      background: var(--jensify-surface, #fff);
      border-radius: 12px;
      border: 2px dashed var(--jensify-border, #e0e0e0);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--jensify-text-secondary, #999);
      margin-bottom: 16px;
    }

    .empty-state h3 {
      font-size: 18px;
      margin: 0 0 8px;
    }

    .empty-state p {
      color: var(--jensify-text-secondary, #666);
      margin: 0 0 24px;
    }

    .rates-table-container {
      background: var(--jensify-surface, #fff);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .rates-table {
      width: 100%;
    }

    .rate-name {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .inactive-chip {
      font-size: 10px;
      min-height: 20px;
      padding: 0 8px;
    }

    .location-cell {
      display: flex;
      flex-direction: column;
    }

    .location-cell .country {
      font-weight: 500;
    }

    .location-cell .state {
      font-size: 12px;
      color: var(--jensify-text-secondary, #666);
    }

    .type-chip {
      font-size: 11px;
    }

    .type-chip.vat { background: #e3f2fd; color: #1565c0; }
    .type-chip.gst { background: #e8f5e9; color: #2e7d32; }
    .type-chip.sales_tax { background: #fff3e0; color: #ef6c00; }
    .type-chip.hst { background: #fce4ec; color: #c2185b; }
    .type-chip.exempt { background: #f3e5f5; color: #7b1fa2; }

    .rate-value {
      font-weight: 600;
      font-family: monospace;
      font-size: 14px;
    }

    .recoverable-yes {
      color: #4caf50;
    }

    .recoverable-no {
      color: #9e9e9e;
    }

    .delete-btn {
      color: #f44336;
    }

    .categories-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .category-card {
      background: var(--jensify-surface, #fff);
    }

    .category-card mat-card-header {
      padding-bottom: 8px;
    }

    .category-card mat-icon[mat-card-avatar] {
      background: rgba(255, 89, 0, 0.1);
      color: var(--jensify-primary, #ff5900);
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .category-card mat-icon[mat-card-avatar].taxable {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .category-description {
      color: var(--jensify-text-secondary, #666);
      font-size: 14px;
      margin-bottom: 12px;
    }

    .category-details {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .category-details .taxable {
      background: rgba(76, 175, 80, 0.1);
      color: #2e7d32;
    }

    .category-details .exempt {
      background: rgba(156, 39, 176, 0.1);
      color: #7b1fa2;
    }

    .default-rate {
      font-size: 13px;
      color: var(--jensify-text-secondary, #666);
    }

    .reference-tab h2 {
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 16px;
    }

    .reference-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }

    .reference-card {
      background: var(--jensify-surface-variant, #f5f5f5);
    }

    .reference-card mat-icon[mat-card-avatar] {
      background: var(--jensify-primary, #ff5900);
      color: white;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }

    .reference-card p {
      font-size: 13px;
      color: var(--jensify-text-secondary, #666);
      margin: 0;
    }

    mat-divider {
      margin: 32px 0;
    }

    .state-tax-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 12px;
      margin-bottom: 16px;
    }

    .state-tax-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--jensify-surface, #fff);
      border-radius: 8px;
      border: 1px solid var(--jensify-border, #e0e0e0);
    }

    .state-code {
      font-weight: 600;
      color: var(--jensify-primary, #ff5900);
    }

    .state-rate {
      font-family: monospace;
      font-size: 14px;
    }

    .reference-note {
      font-size: 12px;
      color: var(--jensify-text-secondary, #999);
      font-style: italic;
    }

    /* Dialog Styles */
    .dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 24px;
    }

    .dialog-container {
      background: var(--jensify-surface, #fff);
      border-radius: 16px;
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--jensify-border, #e0e0e0);
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    .dialog-form {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .dialog-form mat-form-field {
      width: 100%;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .toggle-row {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 8px 0;
    }

    .active-toggle {
      margin-top: 8px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--jensify-border, #e0e0e0);
      margin-top: 8px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .tax-settings-container {
        padding: 16px;
      }

      .page-header {
        flex-direction: column;
      }

      .header-actions {
        width: 100%;
      }

      .header-actions button {
        width: 100%;
      }

      .form-row {
        grid-template-columns: 1fr;
      }

      .tab-header {
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
      }

      .categories-grid,
      .reference-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaxSettingsComponent implements OnInit {
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private taxService = inject(TaxService);
  private notificationService = inject(NotificationService);

  // State
  loading = signal(true);
  saving = signal(false);
  dialogMode = signal<DialogMode>('closed');
  editingRate = signal<TaxRate | null>(null);
  editingCategory = signal<TaxCategory | null>(null);

  // Data from service
  taxRates = this.taxService.taxRates;
  taxCategories = this.taxService.taxCategories;

  // Computed values
  activeRateCount = computed(() => this.taxRates().filter(r => r.is_active).length);
  uniqueCountries = computed(() => {
    const countries = new Set(this.taxRates().map(r => r.country_code));
    return Array.from(countries);
  });

  // Table columns
  rateColumns = ['name', 'country', 'type', 'rate', 'recoverable', 'actions'];

  // Reference data
  countries = COMMON_TAX_COUNTRIES;
  taxTypes = Object.entries(TAX_TYPE_CONFIG).map(([key, value]) => ({
    key: key as TaxType,
    label: value.label,
    description: value.description
  }));
  usStateTaxes = Object.entries(US_STATE_TAX_RATES).map(([code, rate]) => ({ code, rate }));

  // Forms
  rateForm!: FormGroup;
  categoryForm!: FormGroup;

  ngOnInit(): void {
    this.initForms();
    this.loadData();
  }

  private initForms(): void {
    this.rateForm = this.fb.group({
      name: ['', Validators.required],
      country_code: ['US', Validators.required],
      state_province: [''],
      tax_type: ['sales_tax' as TaxType, Validators.required],
      rate: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
      is_recoverable: [false],
      is_compound: [false],
      effective_from: [new Date().toISOString().split('T')[0]],
      effective_until: [null],
      is_active: [true]
    });

    this.categoryForm = this.fb.group({
      name: ['', Validators.required],
      code: ['', Validators.required],
      description: [''],
      vat_code: [''],
      default_rate_id: [null],
      is_taxable: [true],
      is_active: [true]
    });
  }

  private loadData(): void {
    this.loading.set(true);

    this.taxService.getTaxRates().subscribe({
      next: () => {
        this.taxService.getTaxCategories().subscribe({
          next: () => this.loading.set(false),
          error: (_err) => {
            this.notificationService.showError('Failed to load tax categories');
            this.loading.set(false);
          }
        });
      },
      error: (_err) => {
        this.notificationService.showError('Failed to load tax rates');
        this.loading.set(false);
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  // Rate Dialog methods
  openAddRateDialog(): void {
    this.rateForm.reset({
      country_code: 'US',
      tax_type: 'sales_tax',
      rate: 0,
      is_recoverable: false,
      is_compound: false,
      effective_from: new Date().toISOString().split('T')[0],
      effective_until: null,
      is_active: true
    });
    this.editingRate.set(null);
    this.dialogMode.set('add-rate');
  }

  openEditRateDialog(rate: TaxRate): void {
    this.editingRate.set(rate);
    this.rateForm.patchValue({
      name: rate.name,
      country_code: rate.country_code,
      state_province: rate.state_province || '',
      tax_type: rate.tax_type,
      rate: rate.rate * 100, // Convert decimal to percentage
      is_recoverable: rate.is_recoverable,
      is_compound: rate.is_compound,
      effective_from: rate.effective_from,
      effective_until: rate.effective_until || null,
      is_active: rate.is_active
    });
    this.dialogMode.set('edit-rate');
  }

  saveRate(): void {
    if (this.rateForm.invalid) return;

    this.saving.set(true);
    const formValue = this.rateForm.value;
    const rateDecimal = formValue.rate / 100; // Convert percentage to decimal

    if (this.dialogMode() === 'add-rate') {
      this.taxService.createTaxRate({
        name: formValue.name,
        country_code: formValue.country_code,
        state_province: formValue.state_province || undefined,
        tax_type: formValue.tax_type,
        rate: rateDecimal,
        is_recoverable: formValue.is_recoverable,
        is_compound: formValue.is_compound,
        effective_from: formValue.effective_from,
        effective_until: formValue.effective_until || undefined
      }).subscribe({
        next: () => {
          this.notificationService.showSuccess('Tax rate created');
          this.closeDialog();
          this.saving.set(false);
        },
        error: (_err) => {
          this.notificationService.showError('Failed to create tax rate');
          this.saving.set(false);
        }
      });
    } else {
      const editingId = this.editingRate()?.id;
      if (!editingId) return;

      this.taxService.updateTaxRate({
        id: editingId,
        name: formValue.name,
        rate: rateDecimal,
        is_recoverable: formValue.is_recoverable,
        is_compound: formValue.is_compound,
        effective_until: formValue.effective_until || undefined,
        is_active: formValue.is_active
      }).subscribe({
        next: () => {
          this.notificationService.showSuccess('Tax rate updated');
          this.closeDialog();
          this.saving.set(false);
        },
        error: (_err) => {
          this.notificationService.showError('Failed to update tax rate');
          this.saving.set(false);
        }
      });
    }
  }

  deleteRate(rate: TaxRate): void {
    if (!confirm(`Delete tax rate "${rate.name}"?`)) return;

    this.taxService.deleteTaxRate(rate.id).subscribe({
      next: () => this.notificationService.showSuccess('Tax rate deleted'),
      error: () => this.notificationService.showError('Failed to delete tax rate')
    });
  }

  // Category Dialog methods
  openAddCategoryDialog(): void {
    this.categoryForm.reset({
      is_taxable: true,
      is_active: true,
      default_rate_id: null
    });
    this.editingCategory.set(null);
    this.dialogMode.set('add-category');
  }

  openEditCategoryDialog(category: TaxCategory): void {
    this.editingCategory.set(category);
    this.categoryForm.patchValue({
      name: category.name,
      code: category.code,
      description: category.description || '',
      vat_code: category.vat_code || '',
      default_rate_id: category.default_rate_id || null,
      is_taxable: category.is_taxable,
      is_active: category.is_active
    });
    this.dialogMode.set('edit-category');
  }

  saveCategory(): void {
    if (this.categoryForm.invalid) return;

    this.saving.set(true);
    const formValue = this.categoryForm.value;

    if (this.dialogMode() === 'add-category') {
      this.taxService.createTaxCategory({
        name: formValue.name,
        code: formValue.code,
        description: formValue.description || undefined,
        vat_code: formValue.vat_code || undefined,
        default_rate_id: formValue.default_rate_id || undefined,
        is_taxable: formValue.is_taxable
      }).subscribe({
        next: () => {
          this.notificationService.showSuccess('Tax category created');
          this.closeDialog();
          this.saving.set(false);
        },
        error: (_err) => {
          this.notificationService.showError('Failed to create tax category');
          this.saving.set(false);
        }
      });
    } else {
      const editingId = this.editingCategory()?.id;
      if (!editingId) return;

      this.taxService.updateTaxCategory({
        id: editingId,
        name: formValue.name,
        code: formValue.code,
        description: formValue.description || undefined,
        vat_code: formValue.vat_code || undefined,
        default_rate_id: formValue.default_rate_id,
        is_taxable: formValue.is_taxable,
        is_active: formValue.is_active
      }).subscribe({
        next: () => {
          this.notificationService.showSuccess('Tax category updated');
          this.closeDialog();
          this.saving.set(false);
        },
        error: (_err) => {
          this.notificationService.showError('Failed to update tax category');
          this.saving.set(false);
        }
      });
    }
  }

  deleteCategory(category: TaxCategory): void {
    if (!confirm(`Delete tax category "${category.name}"?`)) return;

    this.taxService.deleteTaxCategory(category.id).subscribe({
      next: () => this.notificationService.showSuccess('Tax category deleted'),
      error: () => this.notificationService.showError('Failed to delete tax category')
    });
  }

  closeDialog(): void {
    this.dialogMode.set('closed');
    this.editingRate.set(null);
    this.editingCategory.set(null);
  }

  seedDefaults(): void {
    if (!confirm('Seed default tax rates? This will add common tax rates for US states and VAT countries.')) return;

    this.loading.set(true);
    this.taxService.seedDefaultRates().subscribe({
      next: () => {
        this.notificationService.showSuccess('Default tax rates seeded');
        this.loading.set(false);
      },
      error: () => {
        this.notificationService.showError('Failed to seed default rates');
        this.loading.set(false);
      }
    });
  }

  // Helper methods
  formatRate(rate: number): string {
    return formatTaxRate(rate);
  }

  getCountryName(code: string): string {
    const country = this.countries.find(c => c.code === code);
    return country?.name || code;
  }

  getTaxTypeLabel(type: TaxType): string {
    return TAX_TYPE_CONFIG[type]?.label || type;
  }

  getTaxTypeIcon(type: TaxType): string {
    const icons: Record<TaxType, string> = {
      sales_tax: 'shopping_cart',
      vat: 'euro',
      gst: 'payments',
      hst: 'account_balance',
      pst: 'store',
      other: 'more_horiz',
      exempt: 'block',
      zero_rated: 'exposure_zero'
    };
    return icons[type] || 'percent';
  }
}
