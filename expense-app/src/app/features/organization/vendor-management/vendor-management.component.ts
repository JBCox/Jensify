import { ChangeDetectionStrategy, Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { VendorService } from '../../../core/services/vendor.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  Vendor,
  VendorStatus,
  VendorBusinessType,
  PaymentMethod,
  VendorNeedingW9,
  VENDOR_STATUS_CONFIG,
  BUSINESS_TYPE_CONFIG,
  PAYMENT_METHOD_CONFIG,
  IRS_1099_THRESHOLD
} from '../../../core/models/vendor.model';

type DialogMode = 'closed' | 'add' | 'edit' | 'view';

@Component({
  selector: 'app-vendor-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
    MatMenuModule,
    MatBadgeModule,
    MatDividerModule,
    CurrencyPipe,
  ],
  template: `
    <div class="vendor-management-container">
      <header class="page-header">
        <div class="header-content">
          <button mat-icon-button (click)="goBack()" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="header-text">
            <h1>Vendor Management</h1>
            <p>Track vendors, manage relationships, and prepare 1099 reporting</p>
          </div>
        </div>
        <div class="header-actions">
          <button mat-flat-button color="primary" (click)="openAddDialog()">
            <mat-icon>add</mat-icon>
            Add Vendor
          </button>
        </div>
      </header>

      <!-- Summary Cards -->
      <div class="summary-cards">
        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon total">
              <mat-icon>store</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ vendors().length }}</span>
              <span class="summary-label">Total Vendors</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon active">
              <mat-icon>check_circle</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ activeCount() }}</span>
              <span class="summary-label">Active</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card">
          <mat-card-content>
            <div class="summary-icon preferred">
              <mat-icon>star</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ preferredCount() }}</span>
              <span class="summary-label">Preferred</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="summary-card" [class.alert]="w9AlertCount() > 0">
          <mat-card-content>
            <div class="summary-icon w9">
              <mat-icon>warning</mat-icon>
            </div>
            <div class="summary-info">
              <span class="summary-value">{{ w9AlertCount() }}</span>
              <span class="summary-label">Need W-9</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Loading vendors...</span>
        </div>
      } @else {
        <!-- Search & Filters -->
        <mat-card class="filters-card">
          <mat-card-content>
            <div class="filters-row">
              <mat-form-field appearance="outline" class="search-field">
                <mat-label>Search vendors</mat-label>
                <mat-icon matPrefix>search</mat-icon>
                <input matInput [(ngModel)]="searchTerm" (ngModelChange)="filterVendors()" placeholder="Search by name...">
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Status</mat-label>
                <mat-select [(ngModel)]="statusFilter" (selectionChange)="filterVendors()">
                  <mat-option value="">All Statuses</mat-option>
                  @for (status of statusOptions; track status.value) {
                    <mat-option [value]="status.value">{{ status.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-slide-toggle [(ngModel)]="preferredOnly" (change)="filterVendors()">
                Preferred Only
              </mat-slide-toggle>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-tab-group animationDuration="200ms">
          <!-- Vendors List Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>store</mat-icon>
              Vendors ({{ filteredVendors().length }})
            </ng-template>
            <div class="tab-content">
              @if (filteredVendors().length === 0) {
                <div class="empty-state">
                  <mat-icon>store</mat-icon>
                  <h3>No Vendors Found</h3>
                  <p>{{ searchTerm || statusFilter || preferredOnly ? 'Try adjusting your filters' : 'Add your first vendor to get started' }}</p>
                  @if (!searchTerm && !statusFilter && !preferredOnly) {
                    <button mat-flat-button color="primary" (click)="openAddDialog()">
                      <mat-icon>add</mat-icon>
                      Add First Vendor
                    </button>
                  }
                </div>
              } @else {
                <div class="vendors-grid">
                  @for (vendor of filteredVendors(); track vendor.id) {
                    <mat-card class="vendor-card" (click)="openViewDialog(vendor)">
                      <mat-card-header>
                        <div class="vendor-avatar" mat-card-avatar>
                          {{ getInitials(vendor.name) }}
                        </div>
                        <mat-card-title>
                          {{ vendor.display_name || vendor.name }}
                          @if (vendor.is_preferred) {
                            <mat-icon class="preferred-icon" matTooltip="Preferred Vendor">star</mat-icon>
                          }
                        </mat-card-title>
                        <mat-card-subtitle>
                          @if (vendor.default_category) {
                            {{ vendor.default_category }}
                          } @else {
                            No category
                          }
                        </mat-card-subtitle>
                      </mat-card-header>
                      <mat-card-content>
                        <div class="vendor-details">
                          @if (vendor.email) {
                            <div class="detail-row">
                              <mat-icon>email</mat-icon>
                              <span>{{ vendor.email }}</span>
                            </div>
                          }
                          @if (vendor.phone) {
                            <div class="detail-row">
                              <mat-icon>phone</mat-icon>
                              <span>{{ vendor.phone }}</span>
                            </div>
                          }
                          @if (vendor.city) {
                            <div class="detail-row">
                              <mat-icon>location_on</mat-icon>
                              <span>{{ vendor.city }}{{ vendor.state_province ? ', ' + vendor.state_province : '' }}</span>
                            </div>
                          }
                        </div>
                        <div class="vendor-badges">
                          <mat-chip [class]="'status-' + vendor.status">
                            {{ getStatusLabel(vendor.status) }}
                          </mat-chip>
                          @if (vendor.is_w9_on_file) {
                            <mat-chip class="w9-chip">W-9 On File</mat-chip>
                          }
                          @if (vendor.business_type) {
                            <mat-chip class="type-chip">{{ getBusinessTypeLabel(vendor.business_type) }}</mat-chip>
                          }
                        </div>
                      </mat-card-content>
                      <mat-card-actions align="end">
                        <button mat-icon-button matTooltip="Edit" (click)="openEditDialog(vendor); $event.stopPropagation()">
                          <mat-icon>edit</mat-icon>
                        </button>
                        <button mat-icon-button [matMenuTriggerFor]="vendorMenu" (click)="$event.stopPropagation()">
                          <mat-icon>more_vert</mat-icon>
                        </button>
                        <mat-menu #vendorMenu="matMenu">
                          <button mat-menu-item (click)="togglePreferred(vendor)">
                            <mat-icon>{{ vendor.is_preferred ? 'star_border' : 'star' }}</mat-icon>
                            {{ vendor.is_preferred ? 'Remove Preferred' : 'Mark Preferred' }}
                          </button>
                          <button mat-menu-item (click)="toggleW9(vendor)">
                            <mat-icon>description</mat-icon>
                            {{ vendor.is_w9_on_file ? 'Remove W-9' : 'Mark W-9 On File' }}
                          </button>
                          <mat-divider></mat-divider>
                          <button mat-menu-item (click)="updateStatus(vendor, 'active')" [disabled]="vendor.status === 'active'">
                            <mat-icon>check_circle</mat-icon>
                            Set Active
                          </button>
                          <button mat-menu-item (click)="updateStatus(vendor, 'inactive')" [disabled]="vendor.status === 'inactive'">
                            <mat-icon>pause_circle</mat-icon>
                            Set Inactive
                          </button>
                          <button mat-menu-item (click)="updateStatus(vendor, 'blocked')" [disabled]="vendor.status === 'blocked'">
                            <mat-icon>block</mat-icon>
                            Block Vendor
                          </button>
                          <mat-divider></mat-divider>
                          <button mat-menu-item class="delete-item" (click)="deleteVendor(vendor)">
                            <mat-icon>delete</mat-icon>
                            Delete
                          </button>
                        </mat-menu>
                      </mat-card-actions>
                    </mat-card>
                  }
                </div>
              }
            </div>
          </mat-tab>

          <!-- W-9 / 1099 Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon>description</mat-icon>
              1099 Tracking
              @if (w9AlertCount() > 0) {
                <span class="badge">{{ w9AlertCount() }}</span>
              }
            </ng-template>
            <div class="tab-content">
              <div class="info-banner">
                <mat-icon>info</mat-icon>
                <div>
                  <strong>IRS 1099-NEC Requirement</strong>
                  <p>Vendors paid {{ IRS_THRESHOLD | currency:'USD':'symbol':'1.0-0' }} or more in a calendar year require a W-9 form for 1099 reporting.</p>
                </div>
              </div>

              @if (vendorsNeedingW9().length === 0) {
                <div class="empty-state success">
                  <mat-icon>check_circle</mat-icon>
                  <h3>All Clear!</h3>
                  <p>All vendors above the {{ IRS_THRESHOLD | currency:'USD':'symbol':'1.0-0' }} threshold have W-9 forms on file.</p>
                </div>
              } @else {
                <div class="w9-list">
                  @for (item of vendorsNeedingW9(); track item.vendor_id) {
                    <mat-card class="w9-card">
                      <mat-card-content>
                        <div class="w9-info">
                          <span class="vendor-name">{{ item.vendor_name }}</span>
                          <span class="total-paid">{{ item.total_paid | currency }}</span>
                        </div>
                        <div class="w9-actions">
                          <button mat-flat-button color="primary" (click)="markW9Received(item.vendor_id)">
                            <mat-icon>check</mat-icon>
                            W-9 Received
                          </button>
                        </div>
                      </mat-card-content>
                    </mat-card>
                  }
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      }

      <!-- Add/Edit Vendor Dialog -->
      @if (dialogMode() !== 'closed') {
        <div class="dialog-overlay" (click)="closeDialog()" (keydown.escape)="closeDialog()" tabindex="-1" role="dialog" aria-modal="true">
          <div class="dialog-container dialog-large" (click)="$event.stopPropagation()" (keydown.escape)="closeDialog()" role="document">
            <div class="dialog-header">
              <h2>
                @switch (dialogMode()) {
                  @case ('add') { Add New Vendor }
                  @case ('edit') { Edit Vendor }
                  @case ('view') { Vendor Details }
                }
              </h2>
              <button mat-icon-button (click)="closeDialog()">
                <mat-icon>close</mat-icon>
              </button>
            </div>

            @if (dialogMode() === 'view' && selectedVendor()) {
              <div class="dialog-content view-mode">
                <div class="view-header">
                  <div class="vendor-avatar large">{{ getInitials(selectedVendor()!.name) }}</div>
                  <div class="view-title">
                    <h3>{{ selectedVendor()!.display_name || selectedVendor()!.name }}</h3>
                    <div class="view-badges">
                      <mat-chip [class]="'status-' + selectedVendor()!.status">
                        {{ getStatusLabel(selectedVendor()!.status) }}
                      </mat-chip>
                      @if (selectedVendor()!.is_preferred) {
                        <mat-chip class="preferred">Preferred</mat-chip>
                      }
                      @if (selectedVendor()!.is_w9_on_file) {
                        <mat-chip class="w9-chip">W-9 On File</mat-chip>
                      }
                    </div>
                  </div>
                </div>

                <div class="view-sections">
                  <div class="view-section">
                    <h4>Contact Information</h4>
                    <div class="view-grid">
                      @if (selectedVendor()!.email) {
                        <div class="view-item">
                          <mat-icon>email</mat-icon>
                          <span>{{ selectedVendor()!.email }}</span>
                        </div>
                      }
                      @if (selectedVendor()!.phone) {
                        <div class="view-item">
                          <mat-icon>phone</mat-icon>
                          <span>{{ selectedVendor()!.phone }}</span>
                        </div>
                      }
                      @if (selectedVendor()!.website) {
                        <div class="view-item">
                          <mat-icon>language</mat-icon>
                          <a [href]="selectedVendor()!.website" target="_blank">{{ selectedVendor()!.website }}</a>
                        </div>
                      }
                    </div>
                  </div>

                  @if (selectedVendor()!.address_line1) {
                    <div class="view-section">
                      <h4>Address</h4>
                      <p class="address">
                        {{ selectedVendor()!.address_line1 }}<br>
                        @if (selectedVendor()!.address_line2) {
                          {{ selectedVendor()!.address_line2 }}<br>
                        }
                        {{ selectedVendor()!.city }}, {{ selectedVendor()!.state_province }} {{ selectedVendor()!.postal_code }}
                      </p>
                    </div>
                  }

                  <div class="view-section">
                    <h4>Business Details</h4>
                    <div class="view-grid">
                      @if (selectedVendor()!.business_type) {
                        <div class="view-item">
                          <span class="label">Type:</span>
                          <span>{{ getBusinessTypeLabel(selectedVendor()!.business_type!) }}</span>
                        </div>
                      }
                      @if (selectedVendor()!.tax_id) {
                        <div class="view-item">
                          <span class="label">Tax ID:</span>
                          <span>{{ maskTaxId(selectedVendor()!.tax_id!) }}</span>
                        </div>
                      }
                      @if (selectedVendor()!.payment_terms) {
                        <div class="view-item">
                          <span class="label">Payment Terms:</span>
                          <span>{{ selectedVendor()!.payment_terms }}</span>
                        </div>
                      }
                      @if (selectedVendor()!.preferred_payment_method) {
                        <div class="view-item">
                          <span class="label">Payment Method:</span>
                          <span>{{ getPaymentMethodLabel(selectedVendor()!.preferred_payment_method!) }}</span>
                        </div>
                      }
                    </div>
                  </div>

                  @if (selectedVendor()!.notes) {
                    <div class="view-section">
                      <h4>Notes</h4>
                      <p>{{ selectedVendor()!.notes }}</p>
                    </div>
                  }

                  @if (selectedVendor()!.aliases && selectedVendor()!.aliases!.length > 0) {
                    <div class="view-section">
                      <h4>Aliases (for merchant matching)</h4>
                      <div class="aliases-list">
                        @for (alias of selectedVendor()!.aliases; track alias.id) {
                          <mat-chip>{{ alias.alias }}</mat-chip>
                        }
                      </div>
                    </div>
                  }
                </div>

                <div class="dialog-actions">
                  <button mat-stroked-button (click)="closeDialog()">Close</button>
                  <button mat-flat-button color="primary" (click)="openEditDialog(selectedVendor()!)">
                    <mat-icon>edit</mat-icon>
                    Edit Vendor
                  </button>
                </div>
              </div>
            } @else {
              <form [formGroup]="vendorForm" (ngSubmit)="saveVendor()" class="dialog-form">
                <div class="form-section">
                  <h4>Basic Information</h4>
                  <div class="form-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Vendor Name</mat-label>
                      <input matInput formControlName="name">
                      <mat-hint>Company or individual name</mat-hint>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Display Name (Optional)</mat-label>
                      <input matInput formControlName="display_name">
                      <mat-hint>Friendly display name</mat-hint>
                    </mat-form-field>
                  </div>
                  <mat-form-field appearance="outline">
                    <mat-label>Description</mat-label>
                    <textarea matInput formControlName="description" rows="2"></textarea>
                    <mat-hint>What does this vendor provide?</mat-hint>
                  </mat-form-field>
                </div>

                <div class="form-section">
                  <h4>Contact Information</h4>
                  <div class="form-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Email</mat-label>
                      <input matInput formControlName="email" type="email">
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Phone</mat-label>
                      <input matInput formControlName="phone">
                    </mat-form-field>
                  </div>
                  <mat-form-field appearance="outline">
                    <mat-label>Website</mat-label>
                    <input matInput formControlName="website">
                    <mat-hint>e.g., https://example.com</mat-hint>
                  </mat-form-field>
                </div>

                <div class="form-section">
                  <h4>Address</h4>
                  <mat-form-field appearance="outline">
                    <mat-label>Address Line 1</mat-label>
                    <input matInput formControlName="address_line1">
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Address Line 2</mat-label>
                    <input matInput formControlName="address_line2">
                  </mat-form-field>
                  <div class="form-row three-col">
                    <mat-form-field appearance="outline">
                      <mat-label>City</mat-label>
                      <input matInput formControlName="city">
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>State/Province</mat-label>
                      <input matInput formControlName="state_province">
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Postal Code</mat-label>
                      <input matInput formControlName="postal_code">
                    </mat-form-field>
                  </div>
                </div>

                <div class="form-section">
                  <h4>Business Details</h4>
                  <div class="form-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Business Type</mat-label>
                      <mat-select formControlName="business_type">
                        <mat-option [value]="null">Not specified</mat-option>
                        @for (type of businessTypes; track type.key) {
                          <mat-option [value]="type.key">{{ type.label }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Tax ID (EIN/SSN)</mat-label>
                      <input matInput formControlName="tax_id">
                      <mat-hint>e.g., XX-XXXXXXX - For 1099 reporting</mat-hint>
                    </mat-form-field>
                  </div>
                  <div class="form-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Default Category</mat-label>
                      <input matInput formControlName="default_category">
                      <mat-hint>e.g., Office Supplies</mat-hint>
                    </mat-form-field>
                    <mat-form-field appearance="outline">
                      <mat-label>Payment Terms</mat-label>
                      <input matInput formControlName="payment_terms">
                      <mat-hint>e.g., Net 30</mat-hint>
                    </mat-form-field>
                  </div>
                  <mat-form-field appearance="outline">
                    <mat-label>Preferred Payment Method</mat-label>
                    <mat-select formControlName="preferred_payment_method">
                      <mat-option [value]="null">Not specified</mat-option>
                      @for (method of paymentMethods; track method.key) {
                        <mat-option [value]="method.key">{{ method.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                </div>

                <div class="form-section">
                  <h4>Notes</h4>
                  <mat-form-field appearance="outline">
                    <mat-label>Internal Notes</mat-label>
                    <textarea matInput formControlName="notes" rows="3"></textarea>
                  </mat-form-field>
                </div>

                <div class="toggle-section">
                  <mat-slide-toggle formControlName="is_preferred">
                    Preferred Vendor
                  </mat-slide-toggle>
                  <mat-slide-toggle formControlName="is_w9_on_file">
                    W-9 On File
                  </mat-slide-toggle>
                </div>

                <div class="dialog-actions">
                  <button mat-stroked-button type="button" (click)="closeDialog()">Cancel</button>
                  <button mat-flat-button color="primary" type="submit" [disabled]="vendorForm.invalid || saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      {{ dialogMode() === 'add' ? 'Add Vendor' : 'Save Changes' }}
                    }
                  </button>
                </div>
              </form>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .vendor-management-container {
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
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-card {
      background: var(--jensify-surface, #fff);
    }

    .summary-card.alert {
      border: 2px solid #f44336;
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

    .summary-icon.total { background: rgba(255, 89, 0, 0.1); color: var(--jensify-primary, #ff5900); }
    .summary-icon.active { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
    .summary-icon.preferred { background: rgba(255, 193, 7, 0.1); color: #ffc107; }
    .summary-icon.w9 { background: rgba(244, 67, 54, 0.1); color: #f44336; }

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

    .filters-card {
      margin-bottom: 24px;
    }

    .filters-row {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }

    .search-field {
      flex: 1;
      min-width: 250px;
    }

    mat-tab-group {
      background: var(--jensify-surface, #fff);
      border-radius: 12px;
    }

    .tab-content {
      padding: 24px;
    }

    .empty-state {
      text-align: center;
      padding: 64px 24px;
      background: var(--jensify-surface-variant, #f5f5f5);
      border-radius: 12px;
    }

    .empty-state.success mat-icon {
      color: #4caf50;
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

    .vendors-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }

    .vendor-card {
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .vendor-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .vendor-avatar {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: var(--jensify-primary, #ff5900);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      font-size: 14px;
    }

    .vendor-avatar.large {
      width: 64px;
      height: 64px;
      font-size: 20px;
    }

    .preferred-icon {
      color: #ffc107;
      font-size: 18px;
      vertical-align: middle;
      margin-left: 4px;
    }

    .vendor-details {
      margin-bottom: 12px;
    }

    .detail-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--jensify-text-secondary, #666);
      margin-bottom: 4px;
    }

    .detail-row mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .vendor-badges {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .vendor-badges mat-chip {
      font-size: 11px;
    }

    .status-active { background: rgba(76, 175, 80, 0.1) !important; color: #2e7d32 !important; }
    .status-inactive { background: rgba(158, 158, 158, 0.1) !important; color: #616161 !important; }
    .status-blocked { background: rgba(244, 67, 54, 0.1) !important; color: #c62828 !important; }
    .w9-chip { background: rgba(33, 150, 243, 0.1) !important; color: #1565c0 !important; }
    .type-chip { background: rgba(156, 39, 176, 0.1) !important; color: #7b1fa2 !important; }
    .preferred { background: rgba(255, 193, 7, 0.1) !important; color: #f57f17 !important; }

    .delete-item {
      color: #f44336;
    }

    .badge {
      background: #f44336;
      color: white;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 11px;
      margin-left: 8px;
    }

    .info-banner {
      display: flex;
      gap: 12px;
      padding: 16px;
      background: rgba(33, 150, 243, 0.1);
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .info-banner mat-icon {
      color: #1976d2;
    }

    .info-banner strong {
      display: block;
      margin-bottom: 4px;
    }

    .info-banner p {
      margin: 0;
      font-size: 14px;
      color: var(--jensify-text-secondary, #666);
    }

    .w9-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .w9-card mat-card-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px !important;
    }

    .w9-info {
      display: flex;
      flex-direction: column;
    }

    .w9-info .vendor-name {
      font-weight: 500;
    }

    .w9-info .total-paid {
      font-size: 14px;
      color: var(--jensify-text-secondary, #666);
    }

    /* Dialog */
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
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
    }

    .dialog-container.dialog-large {
      max-width: 700px;
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid var(--jensify-border, #e0e0e0);
      position: sticky;
      top: 0;
      background: var(--jensify-surface, #fff);
      z-index: 1;
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    .dialog-content.view-mode {
      padding: 24px;
    }

    .view-header {
      display: flex;
      gap: 16px;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--jensify-border, #e0e0e0);
    }

    .view-title h3 {
      margin: 0 0 8px;
      font-size: 22px;
    }

    .view-badges {
      display: flex;
      gap: 8px;
    }

    .view-sections {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .view-section h4 {
      font-size: 14px;
      font-weight: 600;
      color: var(--jensify-text-secondary, #666);
      margin: 0 0 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .view-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }

    .view-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .view-item mat-icon {
      color: var(--jensify-text-secondary, #666);
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .view-item .label {
      font-weight: 500;
      color: var(--jensify-text-secondary, #666);
    }

    .address {
      margin: 0;
      line-height: 1.6;
    }

    .aliases-list {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .dialog-form {
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-section {
      margin-bottom: 16px;
    }

    .form-section h4 {
      font-size: 14px;
      font-weight: 600;
      color: var(--jensify-text-secondary, #666);
      margin: 0 0 12px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .form-row.three-col {
      grid-template-columns: 2fr 1fr 1fr;
    }

    .dialog-form mat-form-field {
      width: 100%;
    }

    .toggle-section {
      display: flex;
      gap: 24px;
      padding: 16px 0;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding-top: 16px;
      border-top: 1px solid var(--jensify-border, #e0e0e0);
      margin-top: 8px;
    }

    @media (max-width: 768px) {
      .vendor-management-container {
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

      .filters-row {
        flex-direction: column;
        align-items: stretch;
      }

      .search-field {
        min-width: unset;
      }

      .vendors-grid {
        grid-template-columns: 1fr;
      }

      .form-row,
      .form-row.three-col {
        grid-template-columns: 1fr;
      }

      .toggle-section {
        flex-direction: column;
        gap: 12px;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VendorManagementComponent implements OnInit {
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private vendorService = inject(VendorService);
  private notificationService = inject(NotificationService);

  // State
  loading = signal(true);
  saving = signal(false);
  dialogMode = signal<DialogMode>('closed');
  selectedVendor = signal<Vendor | null>(null);

  // Filters
  searchTerm = '';
  statusFilter: VendorStatus | '' = '';
  preferredOnly = false;

  // Data
  vendors = this.vendorService.vendors;
  filteredVendors = signal<Vendor[]>([]);
  vendorsNeedingW9 = signal<VendorNeedingW9[]>([]);

  // Computed
  activeCount = computed(() => this.vendors().filter(v => v.status === 'active').length);
  preferredCount = computed(() => this.vendors().filter(v => v.is_preferred).length);
  w9AlertCount = computed(() => this.vendorsNeedingW9().length);

  // Constants
  IRS_THRESHOLD = IRS_1099_THRESHOLD;

  // Options
  statusOptions = Object.entries(VENDOR_STATUS_CONFIG).map(([value, config]) => ({
    value: value as VendorStatus,
    label: config.label
  }));

  businessTypes = Object.entries(BUSINESS_TYPE_CONFIG).map(([key, value]) => ({
    key: key as VendorBusinessType,
    label: value.label
  }));

  paymentMethods = Object.entries(PAYMENT_METHOD_CONFIG).map(([key, value]) => ({
    key: key as PaymentMethod,
    label: value.label
  }));

  // Form
  vendorForm!: FormGroup;

  ngOnInit(): void {
    this.initForm();
    this.loadData();
  }

  private initForm(): void {
    this.vendorForm = this.fb.group({
      name: ['', Validators.required],
      display_name: [''],
      description: [''],
      email: ['', Validators.email],
      phone: [''],
      website: [''],
      address_line1: [''],
      address_line2: [''],
      city: [''],
      state_province: [''],
      postal_code: [''],
      business_type: [null],
      tax_id: [''],
      default_category: [''],
      payment_terms: [''],
      preferred_payment_method: [null],
      notes: [''],
      is_preferred: [false],
      is_w9_on_file: [false]
    });
  }

  private loadData(): void {
    this.loading.set(true);

    this.vendorService.getVendors().subscribe({
      next: (vendors) => {
        this.filteredVendors.set(vendors);
        this.loadW9Alerts();
      },
      error: () => {
        this.notificationService.showError('Failed to load vendors');
        this.loading.set(false);
      }
    });
  }

  private loadW9Alerts(): void {
    this.vendorService.getVendorsNeedingW9().subscribe({
      next: (vendors) => {
        this.vendorsNeedingW9.set(vendors);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  filterVendors(): void {
    let filtered = [...this.vendors()];

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.name.toLowerCase().includes(term) ||
        v.display_name?.toLowerCase().includes(term)
      );
    }

    if (this.statusFilter) {
      filtered = filtered.filter(v => v.status === this.statusFilter);
    }

    if (this.preferredOnly) {
      filtered = filtered.filter(v => v.is_preferred);
    }

    this.filteredVendors.set(filtered);
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  openAddDialog(): void {
    this.vendorForm.reset({
      is_preferred: false,
      is_w9_on_file: false
    });
    this.selectedVendor.set(null);
    this.dialogMode.set('add');
  }

  openEditDialog(vendor: Vendor): void {
    this.selectedVendor.set(vendor);
    this.vendorForm.patchValue({
      name: vendor.name,
      display_name: vendor.display_name || '',
      description: vendor.description || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      website: vendor.website || '',
      address_line1: vendor.address_line1 || '',
      address_line2: vendor.address_line2 || '',
      city: vendor.city || '',
      state_province: vendor.state_province || '',
      postal_code: vendor.postal_code || '',
      business_type: vendor.business_type || null,
      tax_id: vendor.tax_id || '',
      default_category: vendor.default_category || '',
      payment_terms: vendor.payment_terms || '',
      preferred_payment_method: vendor.preferred_payment_method || null,
      notes: vendor.notes || '',
      is_preferred: vendor.is_preferred,
      is_w9_on_file: vendor.is_w9_on_file
    });
    this.dialogMode.set('edit');
  }

  openViewDialog(vendor: Vendor): void {
    this.selectedVendor.set(vendor);
    this.dialogMode.set('view');
  }

  closeDialog(): void {
    this.dialogMode.set('closed');
    this.selectedVendor.set(null);
  }

  saveVendor(): void {
    if (this.vendorForm.invalid) return;

    this.saving.set(true);
    const formValue = this.vendorForm.value;

    if (this.dialogMode() === 'add') {
      this.vendorService.createVendor(formValue).subscribe({
        next: () => {
          this.notificationService.showSuccess('Vendor created');
          this.closeDialog();
          this.saving.set(false);
          this.filterVendors();
        },
        error: () => {
          this.notificationService.showError('Failed to create vendor');
          this.saving.set(false);
        }
      });
    } else {
      const vendorId = this.selectedVendor()?.id;
      if (!vendorId) return;

      this.vendorService.updateVendor({ id: vendorId, ...formValue }).subscribe({
        next: () => {
          this.notificationService.showSuccess('Vendor updated');
          this.closeDialog();
          this.saving.set(false);
          this.filterVendors();
        },
        error: () => {
          this.notificationService.showError('Failed to update vendor');
          this.saving.set(false);
        }
      });
    }
  }

  deleteVendor(vendor: Vendor): void {
    if (!confirm(`Delete vendor "${vendor.name}"? This cannot be undone.`)) return;

    this.vendorService.deleteVendor(vendor.id).subscribe({
      next: () => {
        this.notificationService.showSuccess('Vendor deleted');
        this.filterVendors();
      },
      error: () => this.notificationService.showError('Failed to delete vendor')
    });
  }

  togglePreferred(vendor: Vendor): void {
    this.vendorService.togglePreferred(vendor.id, !vendor.is_preferred).subscribe({
      next: () => this.notificationService.showSuccess(vendor.is_preferred ? 'Removed from preferred' : 'Marked as preferred'),
      error: () => this.notificationService.showError('Failed to update vendor')
    });
  }

  toggleW9(vendor: Vendor): void {
    this.vendorService.markW9OnFile(vendor.id, !vendor.is_w9_on_file).subscribe({
      next: () => {
        this.notificationService.showSuccess(vendor.is_w9_on_file ? 'W-9 removed' : 'W-9 marked on file');
        this.loadW9Alerts();
      },
      error: () => this.notificationService.showError('Failed to update vendor')
    });
  }

  updateStatus(vendor: Vendor, status: VendorStatus): void {
    this.vendorService.updateVendorStatus(vendor.id, status).subscribe({
      next: () => this.notificationService.showSuccess(`Status updated to ${status}`),
      error: () => this.notificationService.showError('Failed to update status')
    });
  }

  markW9Received(vendorId: string): void {
    this.vendorService.markW9OnFile(vendorId, true).subscribe({
      next: () => {
        this.notificationService.showSuccess('W-9 marked as received');
        this.loadW9Alerts();
      },
      error: () => this.notificationService.showError('Failed to update vendor')
    });
  }

  // Helper methods
  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  }

  getStatusLabel(status: VendorStatus): string {
    return VENDOR_STATUS_CONFIG[status]?.label || status;
  }

  getBusinessTypeLabel(type: VendorBusinessType): string {
    return BUSINESS_TYPE_CONFIG[type]?.label || type;
  }

  getPaymentMethodLabel(method: PaymentMethod): string {
    return PAYMENT_METHOD_CONFIG[method]?.label || method;
  }

  maskTaxId(taxId: string): string {
    if (taxId.length < 4) return taxId;
    return '***-**-' + taxId.slice(-4);
  }
}
