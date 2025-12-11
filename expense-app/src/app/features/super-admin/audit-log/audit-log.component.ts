import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { SubscriptionAuditLog } from '../../../core/models/subscription.model';

/**
 * Audit Log Component (Super Admin)
 *
 * Shows complete history of billing actions:
 * - Subscription changes
 * - Payments received/failed
 * - Refunds issued
 * - Discounts applied
 * - Admin actions
 */
@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatPaginatorModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="audit-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Audit Log</h1>
          <p class="subtitle">Complete history of billing and subscription actions</p>
        </div>
        <div class="header-actions">
          <button
            mat-stroked-button
            (click)="exportToCsv()"
            [disabled]="filteredLogs().length === 0"
            matTooltip="Export filtered logs to CSV"
          >
            <mat-icon>download</mat-icon>
            Export CSV
          </button>
        </div>
      </header>

      <!-- Filters -->
      <mat-card class="filter-card">
        <div class="filter-row">
          <mat-form-field appearance="outline" class="filter-field">
            <mat-label>Action Type</mat-label>
            <mat-select [(ngModel)]="actionFilter" (ngModelChange)="onFilterChange()">
              <mat-option value="">All Actions</mat-option>
              <mat-option value="subscription_created">Subscription Created</mat-option>
              <mat-option value="subscription_updated">Subscription Updated</mat-option>
              <mat-option value="subscription_canceled">Subscription Canceled</mat-option>
              <mat-option value="subscription_paused">Subscription Paused</mat-option>
              <mat-option value="subscription_resumed">Subscription Resumed</mat-option>
              <mat-option value="payment_received">Payment Received</mat-option>
              <mat-option value="payment_failed">Payment Failed</mat-option>
              <mat-option value="refund_issued">Refund Issued</mat-option>
              <mat-option value="coupon_applied">Coupon Applied</mat-option>
              <mat-option value="coupon_created">Coupon Created</mat-option>
              <mat-option value="discount_applied">Discount Applied</mat-option>
              <mat-option value="plan_changed">Plan Changed</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Search by organization</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              [(ngModel)]="searchQuery"
              (ngModelChange)="onFilterChange()"
              placeholder="Organization name..."
            />
          </mat-form-field>
        </div>

        <div class="filter-row date-row">
          <mat-form-field appearance="outline" class="date-field">
            <mat-label>From Date</mat-label>
            <input
              matInput
              [matDatepicker]="startPicker"
              [(ngModel)]="startDate"
              (ngModelChange)="onFilterChange()"
            />
            <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
            <mat-datepicker #startPicker></mat-datepicker>
          </mat-form-field>

          <mat-form-field appearance="outline" class="date-field">
            <mat-label>To Date</mat-label>
            <input
              matInput
              [matDatepicker]="endPicker"
              [(ngModel)]="endDate"
              (ngModelChange)="onFilterChange()"
            />
            <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
            <mat-datepicker #endPicker></mat-datepicker>
          </mat-form-field>

          <button
            mat-stroked-button
            (click)="clearFilters()"
            class="clear-btn"
            [disabled]="!hasActiveFilters()"
          >
            <mat-icon>clear</mat-icon>
            Clear Filters
          </button>
        </div>

        <div class="filter-summary" *ngIf="hasActiveFilters()">
          <mat-icon>filter_list</mat-icon>
          <span>
            Showing {{ filteredLogs().length }} of {{ logs().length }} entries
            @if (actionFilter) {
              | Action: {{ formatAction(actionFilter) }}
            }
            @if (startDate || endDate) {
              | Date range active
            }
          </span>
        </div>
      </mat-card>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading audit log...</p>
        </div>
      } @else if (filteredLogs().length === 0) {
        <mat-card class="empty-card">
          <mat-icon>history</mat-icon>
          <h3>No entries found</h3>
          <p>There are no audit log entries matching your criteria</p>
        </mat-card>
      } @else {
        <mat-card class="log-card">
          <div class="log-list">
            @for (log of paginatedLogs(); track log.id) {
              <div class="log-entry">
                <div class="log-icon" [class]="getActionClass(log.action)">
                  <mat-icon>{{ getActionIcon(log.action) }}</mat-icon>
                </div>

                <div class="log-content">
                  <div class="log-header">
                    <span class="log-action">{{ formatAction(log.action) }}</span>
                    <mat-chip size="small" [class]="getActionClass(log.action)">
                      {{ getActionCategory(log.action) }}
                    </mat-chip>
                  </div>

                  @if (log.organization_name) {
                    <div class="log-org">
                      <mat-icon>business</mat-icon>
                      {{ log.organization_name }}
                    </div>
                  }

                  @if (log.details) {
                    <div class="log-details">
                      {{ formatDetails(log.details) }}
                    </div>
                  }

                  <div class="log-meta">
                    <span class="log-time">
                      <mat-icon>schedule</mat-icon>
                      {{ log.created_at | date:'medium' }}
                    </span>
                    @if (log.performed_by) {
                      <span class="log-actor">
                        <mat-icon>person</mat-icon>
                        {{ log.performed_by }}
                      </span>
                    }
                  </div>
                </div>

                @if (log.amount_cents) {
                  <div class="log-amount" [class.refund]="log.action.includes('refund')">
                    {{ log.action.includes('refund') ? '-' : '+' }}{{ log.amount_cents / 100 | currency }}
                  </div>
                }
              </div>
            }
          </div>

          <mat-paginator
            [length]="filteredLogs().length"
            [pageSize]="pageSize"
            [pageSizeOptions]="[25, 50, 100]"
            (page)="onPageChange($event)"
          ></mat-paginator>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .audit-page {
      padding: 24px;
      max-width: 1000px;
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

    .header-content {
      flex: 1;
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

    .header-actions {
      margin-top: 4px;
    }

    .header-actions button mat-icon {
      margin-right: 4px;
    }

    /* Filters */
    .filter-card {
      padding: 16px 24px;
      border-radius: 12px;
      margin-bottom: 24px;
    }

    .filter-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .filter-row:last-child {
      margin-bottom: 0;
    }

    .filter-field {
      flex: 1;
    }

    .search-field {
      flex: 2;
    }

    .date-row {
      align-items: center;
    }

    .date-field {
      flex: 1;
      max-width: 200px;
    }

    .clear-btn {
      height: 40px;
    }

    .clear-btn mat-icon {
      margin-right: 4px;
    }

    .filter-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #e3f2fd;
      border-radius: 8px;
      font-size: 0.85rem;
      color: #1565c0;
      margin-top: 16px;
    }

    .filter-summary mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    ::ng-deep .filter-card .mat-mdc-form-field-subscript-wrapper {
      display: none;
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

    /* Empty */
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

    /* Log Card */
    .log-card {
      border-radius: 12px;
      overflow: hidden;
    }

    .log-list {
      padding: 0;
    }

    .log-entry {
      display: flex;
      gap: 16px;
      padding: 20px 24px;
      border-bottom: 1px solid #f0f0f0;
      transition: background 0.2s;
    }

    .log-entry:hover {
      background: #fafafa;
    }

    .log-entry:last-child {
      border-bottom: none;
    }

    .log-icon {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      background: #f5f5f5;
    }

    .log-icon mat-icon {
      font-size: 22px;
      width: 22px;
      height: 22px;
      color: #666;
    }

    .log-icon.payment {
      background: #e8f5e9;
    }

    .log-icon.payment mat-icon {
      color: #4caf50;
    }

    .log-icon.refund {
      background: #ffebee;
    }

    .log-icon.refund mat-icon {
      color: #f44336;
    }

    .log-icon.subscription {
      background: #e3f2fd;
    }

    .log-icon.subscription mat-icon {
      color: #1976d2;
    }

    .log-icon.coupon {
      background: #fff3e0;
    }

    .log-icon.coupon mat-icon {
      color: #ff5900;
    }

    .log-content {
      flex: 1;
      min-width: 0;
    }

    .log-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .log-action {
      font-weight: 600;
      color: #1a1a2e;
    }

    .log-header mat-chip {
      font-size: 0.7rem;
    }

    .log-header mat-chip.payment {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .log-header mat-chip.refund {
      background: #ffebee !important;
      color: #c62828 !important;
    }

    .log-header mat-chip.subscription {
      background: #e3f2fd !important;
      color: #1565c0 !important;
    }

    .log-header mat-chip.coupon {
      background: #fff3e0 !important;
      color: #e65100 !important;
    }

    .log-org {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.9rem;
      color: #1a1a2e;
      margin-bottom: 6px;
    }

    .log-org mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #666;
    }

    .log-details {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 8px;
      padding: 8px 12px;
      background: #f9f9f9;
      border-radius: 6px;
    }

    .log-meta {
      display: flex;
      gap: 16px;
      font-size: 0.8rem;
      color: #999;
    }

    .log-meta span {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .log-meta mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .log-amount {
      font-size: 1.1rem;
      font-weight: 700;
      font-family: 'SF Mono', monospace;
      color: #4caf50;
      align-self: center;
    }

    .log-amount.refund {
      color: #f44336;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .audit-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .filter-row {
        flex-direction: column;
      }

      .log-entry {
        flex-wrap: wrap;
      }

      .log-amount {
        width: 100%;
        text-align: right;
        margin-top: 8px;
      }
    }
  `],
})
export class AuditLogComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private snackBar = inject(MatSnackBar);

  loading = signal(true);
  logs = signal<SubscriptionAuditLog[]>([]);
  filteredLogs = signal<SubscriptionAuditLog[]>([]);
  paginatedLogs = signal<SubscriptionAuditLog[]>([]);

  actionFilter = '';
  searchQuery = '';
  startDate: Date | null = null;
  endDate: Date | null = null;
  pageIndex = 0;
  pageSize = 25;

  ngOnInit(): void {
    this.loadLogs();
  }

  private loadLogs(): void {
    this.superAdminService.getAuditLog({ limit: 500 }).subscribe({
      next: (logs) => {
        this.logs.set(logs);
        this.applyFilters();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  onFilterChange(): void {
    this.pageIndex = 0;
    this.applyFilters();
  }

  private applyFilters(): void {
    let filtered = this.logs();

    if (this.actionFilter) {
      filtered = filtered.filter((log) => log.action === this.actionFilter);
    }

    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (log) => log.organization_name?.toLowerCase().includes(query)
      );
    }

    // Date range filtering
    if (this.startDate) {
      const start = new Date(this.startDate);
      start.setHours(0, 0, 0, 0);
      filtered = filtered.filter((log) => new Date(log.created_at) >= start);
    }

    if (this.endDate) {
      const end = new Date(this.endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter((log) => new Date(log.created_at) <= end);
    }

    this.filteredLogs.set(filtered);
    this.updatePagination();
  }

  hasActiveFilters(): boolean {
    return !!(this.actionFilter || this.searchQuery || this.startDate || this.endDate);
  }

  clearFilters(): void {
    this.actionFilter = '';
    this.searchQuery = '';
    this.startDate = null;
    this.endDate = null;
    this.pageIndex = 0;
    this.applyFilters();
  }

  exportToCsv(): void {
    const logs = this.filteredLogs();
    if (logs.length === 0) return;

    // Create CSV headers
    const headers = [
      'Date/Time',
      'Action',
      'Category',
      'Organization',
      'Amount',
      'Performed By',
      'Details',
    ];

    // Create CSV rows
    const rows = logs.map((log) => [
      new Date(log.created_at).toISOString(),
      this.formatAction(log.action),
      this.getActionCategory(log.action),
      log.organization_name || 'N/A',
      log.amount_cents ? `$${(log.amount_cents / 100).toFixed(2)}` : '',
      log.performed_by || 'System',
      log.details ? this.formatDetails(log.details).replace(/"/g, '""') : '', // Escape quotes
    ]);

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `audit-log-${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.snackBar.open(
      `Exported ${logs.length} audit log entries to CSV`,
      'Close',
      { duration: 3000 }
    );
  }

  private updatePagination(): void {
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.paginatedLogs.set(this.filteredLogs().slice(start, end));
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updatePagination();
  }

  getActionIcon(action: string): string {
    const icons: Record<string, string> = {
      subscription_created: 'add_circle',
      subscription_updated: 'edit',
      subscription_canceled: 'cancel',
      subscription_paused: 'pause_circle',
      subscription_resumed: 'play_circle',
      payment_received: 'paid',
      payment_failed: 'error',
      refund_issued: 'money_off',
      coupon_applied: 'local_offer',
      coupon_created: 'add_circle',
      plan_changed: 'swap_horiz',
      discount_applied: 'discount',
    };
    return icons[action] || 'info';
  }

  getActionClass(action: string): string {
    if (action.includes('payment') && !action.includes('failed')) return 'payment';
    if (action.includes('refund')) return 'refund';
    if (action.includes('subscription') || action.includes('plan')) return 'subscription';
    if (action.includes('coupon') || action.includes('discount')) return 'coupon';
    return '';
  }

  getActionCategory(action: string): string {
    if (action.includes('payment') || action.includes('refund')) return 'Payment';
    if (action.includes('subscription') || action.includes('plan')) return 'Subscription';
    if (action.includes('coupon') || action.includes('discount')) return 'Discount';
    return 'System';
  }

  formatAction(action: string): string {
    return action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  formatDetails(details: string | Record<string, unknown>): string {
    if (!details) return '';
    if (typeof details === 'string') return details;
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
  }
}
