import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { SuperAdminOrganizationSummary } from '../../../core/models/subscription.model';
import { ApplyDiscountDialogComponent, ApplyDiscountDialogResult } from './apply-discount-dialog.component';
import { PauseSubscriptionDialogComponent, PauseSubscriptionDialogResult } from './pause-subscription-dialog.component';

/**
 * Organization List Component (Super Admin)
 *
 * Displays all organizations with:
 * - Search and filtering
 * - Subscription status
 * - User counts
 * - MRR contribution
 *
 * IMPORTANT: Shows only billing data, no expense/receipt access
 */
@Component({
  selector: 'app-organization-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatPaginatorModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="org-list-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>All Organizations</h1>
          <p class="subtitle">{{ totalOrganizations() }} organizations on the platform</p>
        </div>
      </header>

      <!-- Filters -->
      <mat-card class="filter-card">
        <div class="filter-row">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search organizations</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearch()"
              placeholder="Search by name..."
            />
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Plan</mat-label>
            <mat-select [(ngModel)]="planFilter" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Plans</mat-option>
              <mat-option value="free">Free</mat-option>
              <mat-option value="starter">Starter</mat-option>
              <mat-option value="team">Team</mat-option>
              <mat-option value="business">Business</mat-option>
              <mat-option value="enterprise">Enterprise</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Status</mat-label>
            <mat-select [(ngModel)]="statusFilter" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Statuses</mat-option>
              <mat-option value="active">Active</mat-option>
              <mat-option value="past_due">Past Due</mat-option>
              <mat-option value="canceled">Canceled</mat-option>
              <mat-option value="trialing">Trialing</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </mat-card>

      <!-- Summary Stats -->
      <div class="stats-row">
        <div class="stat-chip">
          <mat-icon>business</mat-icon>
          <span>{{ stats().total }} total</span>
        </div>
        <div class="stat-chip paying">
          <mat-icon>paid</mat-icon>
          <span>{{ stats().paying }} paying</span>
        </div>
        <div class="stat-chip free">
          <mat-icon>savings</mat-icon>
          <span>{{ stats().free }} free</span>
        </div>
        <div class="stat-chip warning">
          <mat-icon>warning</mat-icon>
          <span>{{ stats().pastDue }} past due</span>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading organizations...</p>
        </div>
      } @else if (filteredOrganizations().length === 0) {
        <mat-card class="empty-card">
          <mat-icon>search_off</mat-icon>
          <h3>No organizations found</h3>
          <p>Try adjusting your search or filters</p>
        </mat-card>
      } @else {
        <mat-card class="table-card">
          <div class="table-container">
            <table class="org-table">
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Users</th>
                  <th>MRR</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (org of paginatedOrganizations(); track org.organization_id) {
                  <tr [routerLink]="[org.organization_id]" class="clickable-row">
                    <td class="org-cell">
                      <div class="org-info">
                        <span class="org-name">{{ org.organization_name }}</span>
                        <span class="org-email">{{ org.billing_email || 'No billing email' }}</span>
                      </div>
                    </td>
                    <td>
                      <mat-chip [class]="'plan-' + (org.plan_name || 'free')" size="small">
                        {{ org.plan_name || 'Free' | titlecase }}
                      </mat-chip>
                    </td>
                    <td>
                      <mat-chip [class]="'status-' + org.status" size="small">
                        @switch (org.status) {
                          @case ('active') {
                            <mat-icon>check_circle</mat-icon>
                            Active
                          }
                          @case ('past_due') {
                            <mat-icon>error</mat-icon>
                            Past Due
                          }
                          @case ('canceled') {
                            <mat-icon>cancel</mat-icon>
                            Canceled
                          }
                          @case ('trialing') {
                            <mat-icon>schedule</mat-icon>
                            Trial
                          }
                          @default {
                            {{ org.status || 'N/A' }}
                          }
                        }
                      </mat-chip>
                    </td>
                    <td class="user-count">
                      <mat-icon>people</mat-icon>
                      {{ org.user_count }}
                    </td>
                    <td class="mrr-cell">
                      {{ (org.mrr_cents || 0) / 100 | currency }}<span class="per-mo">/mo</span>
                    </td>
                    <td class="date-cell">
                      {{ org.created_at | date:'mediumDate' }}
                    </td>
                    <td class="actions-cell" (click)="$event.stopPropagation()">
                      <button mat-icon-button [matMenuTriggerFor]="actionMenu">
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #actionMenu="matMenu">
                        <button mat-menu-item [routerLink]="[org.organization_id]">
                          <mat-icon>visibility</mat-icon>
                          <span>View Details</span>
                        </button>
                        <button mat-menu-item (click)="applyDiscount(org)">
                          <mat-icon>discount</mat-icon>
                          <span>Apply Discount</span>
                        </button>
                        @if (org.status === 'active') {
                          <button mat-menu-item (click)="pauseSubscription(org)">
                            <mat-icon>pause</mat-icon>
                            <span>Pause Subscription</span>
                          </button>
                        }
                        @if (org.status === 'past_due') {
                          <button mat-menu-item (click)="sendReminder(org)">
                            <mat-icon>mail</mat-icon>
                            <span>Send Reminder</span>
                          </button>
                        }
                      </mat-menu>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <mat-paginator
            [length]="filteredOrganizations().length"
            [pageSize]="pageSize"
            [pageSizeOptions]="[10, 25, 50, 100]"
            (page)="onPageChange($event)"
            aria-label="Select page"
          ></mat-paginator>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .org-list-page {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }

    .back-button {
      margin-top: 4px;
    }

    .page-header h1 {
      font-size: 2rem;
      font-weight: 700;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .subtitle {
      font-size: 1rem;
      color: #666;
      margin: 0;
    }

    /* Filter Card */
    .filter-card {
      padding: 16px 24px;
      border-radius: 12px;
      margin-bottom: 16px;
    }

    .filter-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .search-field {
      flex: 2;
      min-width: 250px;
    }

    .filter-field {
      flex: 1;
      min-width: 150px;
    }

    ::ng-deep .filter-card .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }

    /* Stats Row */
    .stats-row {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .stat-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: white;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      color: #1a1a2e;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
    }

    .stat-chip mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #666;
    }

    .stat-chip.paying {
      background: #e8f5e9;
      color: #2e7d32;
    }

    .stat-chip.paying mat-icon {
      color: #4caf50;
    }

    .stat-chip.free {
      background: #e3f2fd;
      color: #1565c0;
    }

    .stat-chip.free mat-icon {
      color: #1976d2;
    }

    .stat-chip.warning {
      background: #ffebee;
      color: #c62828;
    }

    .stat-chip.warning mat-icon {
      color: #f44336;
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    /* Empty State */
    .empty-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px 24px;
      text-align: center;
      border-radius: 12px;
    }

    .empty-card mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #ccc;
      margin-bottom: 16px;
    }

    .empty-card h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .empty-card p {
      color: #666;
      margin: 0;
    }

    /* Table Card */
    .table-card {
      border-radius: 12px;
      overflow: hidden;
    }

    .table-container {
      overflow-x: auto;
    }

    .org-table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
    }

    .org-table th {
      text-align: left;
      padding: 16px 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .org-table td {
      padding: 16px 20px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: middle;
    }

    .clickable-row {
      cursor: pointer;
      transition: background 0.2s;
    }

    .clickable-row:hover {
      background: #fafafa;
    }

    .org-cell {
      min-width: 200px;
    }

    .org-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .org-name {
      font-weight: 600;
      color: #1a1a2e;
    }

    .org-email {
      font-size: 0.8rem;
      color: #999;
    }

    .user-count {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #666;
    }

    .user-count mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .mrr-cell {
      font-weight: 600;
      font-family: 'SF Mono', monospace;
      color: #1a1a2e;
    }

    .per-mo {
      font-weight: 400;
      color: #999;
      font-size: 0.8rem;
    }

    .date-cell {
      color: #666;
      font-size: 0.9rem;
    }

    .actions-cell {
      text-align: center;
    }

    /* Plan Chips */
    .plan-free {
      background: #f5f5f5 !important;
      color: #666 !important;
    }

    .plan-starter {
      background: #e3f2fd !important;
      color: #1565c0 !important;
    }

    .plan-team {
      background: #fff3e0 !important;
      color: #e65100 !important;
    }

    .plan-business {
      background: #f3e5f5 !important;
      color: #7b1fa2 !important;
    }

    .plan-enterprise {
      background: #1a1a2e !important;
      color: white !important;
    }

    /* Status Chips */
    .status-active {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-past_due {
      background: #ffebee !important;
      color: #c62828 !important;
    }

    .status-canceled {
      background: #f5f5f5 !important;
      color: #666 !important;
    }

    .status-trialing {
      background: #e3f2fd !important;
      color: #1565c0 !important;
    }

    mat-chip mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-right: 4px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .org-list-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .filter-row {
        flex-direction: column;
      }

      .search-field,
      .filter-field {
        width: 100%;
      }
    }
  `],
})
export class OrganizationListComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  loading = signal(true);
  organizations = signal<SuperAdminOrganizationSummary[]>([]);
  filteredOrganizations = signal<SuperAdminOrganizationSummary[]>([]);
  paginatedOrganizations = signal<SuperAdminOrganizationSummary[]>([]);
  totalOrganizations = signal(0);

  searchQuery = '';
  planFilter = '';
  statusFilter = '';
  pageIndex = 0;
  pageSize = 25;

  stats = signal({ total: 0, paying: 0, free: 0, pastDue: 0 });

  ngOnInit(): void {
    this.loadOrganizations();
  }

  private loadOrganizations(): void {
    this.superAdminService.getAllOrganizations({ limit: 1000 }).subscribe({
      next: ({ organizations, total }) => {
        this.organizations.set(organizations);
        this.totalOrganizations.set(total);
        this.calculateStats(organizations);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private calculateStats(orgs: SuperAdminOrganizationSummary[]): void {
    this.stats.set({
      total: orgs.length,
      paying: orgs.filter((o) => o.plan_name && o.plan_name !== 'free').length,
      free: orgs.filter((o) => !o.plan_name || o.plan_name === 'free').length,
      pastDue: orgs.filter((o) => o.status === 'past_due').length,
    });
  }

  onSearch(): void {
    this.pageIndex = 0;
    this.applyFilters();
  }

  onFilterChange(): void {
    this.pageIndex = 0;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = this.organizations();

    // Search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (org) =>
          org.organization_name.toLowerCase().includes(query) ||
          org.billing_email?.toLowerCase().includes(query)
      );
    }

    // Plan filter
    if (this.planFilter) {
      filtered = filtered.filter((org) => {
        if (this.planFilter === 'free') {
          return !org.plan_name || org.plan_name === 'free';
        }
        return org.plan_name === this.planFilter;
      });
    }

    // Status filter
    if (this.statusFilter) {
      filtered = filtered.filter((org) => org.subscription_status === this.statusFilter);
    }

    this.filteredOrganizations.set(filtered);
    this.updatePagination();
  }

  private updatePagination(): void {
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.paginatedOrganizations.set(this.filteredOrganizations().slice(start, end));
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updatePagination();
  }

  applyDiscount(org: SuperAdminOrganizationSummary): void {
    const dialogRef = this.dialog.open(ApplyDiscountDialogComponent, {
      data: {
        organizationName: org.organization_name,
        organizationId: org.organization_id,
        currentDiscount: undefined, // Could be fetched if available
      },
      width: '450px',
    });

    dialogRef.afterClosed().subscribe((result: ApplyDiscountDialogResult | undefined) => {
      if (result) {
        this.superAdminService
          .applyDiscount({
            organization_id: org.organization_id,
            discount_percent: result.discount_percent,
            reason: result.reason,
            duration: result.duration,
            duration_months: result.duration_months,
          })
          .subscribe({
            next: () => {
              this.snackBar.open(
                `${result.discount_percent}% discount applied to ${org.organization_name}`,
                'Close',
                { duration: 3000 }
              );
              this.loadOrganizations();
            },
            error: (err) => {
              this.snackBar.open(
                `Failed to apply discount: ${err.message || 'Unknown error'}`,
                'Close',
                { duration: 5000, panelClass: 'error-snackbar' }
              );
            },
          });
      }
    });
  }

  pauseSubscription(org: SuperAdminOrganizationSummary): void {
    const dialogRef = this.dialog.open(PauseSubscriptionDialogComponent, {
      data: {
        organizationName: org.organization_name,
        organizationId: org.organization_id,
        currentPlan: org.plan_name,
      },
      width: '450px',
    });

    dialogRef.afterClosed().subscribe((result: PauseSubscriptionDialogResult | undefined) => {
      if (result) {
        this.superAdminService.pauseSubscription(org.organization_id, result.reason).subscribe({
          next: () => {
            const resumeText = result.pause_type === 'scheduled' && result.resume_date
              ? ` (scheduled to resume on ${result.resume_date.toLocaleDateString()})`
              : '';
            this.snackBar.open(
              `Subscription paused for ${org.organization_name}${resumeText}`,
              'Close',
              { duration: 3000 }
            );
            this.loadOrganizations();
          },
          error: (err) => {
            this.snackBar.open(
              `Failed to pause subscription: ${err.message || 'Unknown error'}`,
              'Close',
              { duration: 5000, panelClass: 'error-snackbar' }
            );
          },
        });
      }
    });
  }

  sendReminder(org: SuperAdminOrganizationSummary): void {
    this.superAdminService.sendPaymentReminder(org.organization_id).subscribe({
      next: () => {
        this.snackBar.open(
          `Payment reminder sent to ${org.billing_email || org.organization_name}`,
          'Close',
          { duration: 3000 }
        );
      },
      error: () => {
        this.snackBar.open(
          `Failed to send reminder. Email functionality may not be configured.`,
          'Close',
          { duration: 5000, panelClass: 'error-snackbar' }
        );
      },
    });
  }
}
