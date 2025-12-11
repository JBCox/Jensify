import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { SubscriptionService } from '../../../core/services/subscription.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { SubscriptionInvoice } from '../../../core/models/subscription.model';

/**
 * Invoice History Component
 *
 * Displays complete invoice history with:
 * - Sortable table view
 * - Download PDF links
 * - Status indicators
 * - Pagination
 */
@Component({
  selector: 'app-invoice-history',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatMenuModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="invoice-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Invoice History</h1>
          <p class="subtitle">View and download your billing invoices</p>
        </div>
      </header>

      <mat-card class="invoice-card">
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="48"></mat-spinner>
            <p>Loading invoices...</p>
          </div>
        } @else if (invoices().length === 0) {
          <div class="empty-state">
            <mat-icon>receipt_long</mat-icon>
            <h3>No invoices yet</h3>
            <p>Your invoices will appear here after your first payment.</p>
            <button mat-stroked-button routerLink="../plans">
              <mat-icon>upgrade</mat-icon>
              View Plans
            </button>
          </div>
        } @else {
          <!-- Summary Stats -->
          <div class="invoice-summary">
            <div class="stat-card">
              <mat-icon>receipt</mat-icon>
              <div class="stat-info">
                <span class="stat-value">{{ invoices().length }}</span>
                <span class="stat-label">Total Invoices</span>
              </div>
            </div>
            <div class="stat-card">
              <mat-icon>payments</mat-icon>
              <div class="stat-info">
                <span class="stat-value">{{ totalPaid() | currency }}</span>
                <span class="stat-label">Total Paid</span>
              </div>
            </div>
            <div class="stat-card">
              <mat-icon>calendar_today</mat-icon>
              <div class="stat-info">
                <span class="stat-value">{{ lastPaymentDate() | date:'mediumDate' }}</span>
                <span class="stat-label">Last Payment</span>
              </div>
            </div>
          </div>

          <!-- Invoice Table -->
          <div class="invoice-table-container">
            <table class="invoice-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice #</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (invoice of paginatedInvoices(); track invoice.id) {
                  <tr>
                    <td class="date-cell">
                      <span class="date">{{ invoice.invoice_date | date:'mediumDate' }}</span>
                      <span class="time">{{ invoice.invoice_date | date:'shortTime' }}</span>
                    </td>
                    <td class="invoice-number">
                      <code>{{ getInvoiceNumber(invoice) }}</code>
                    </td>
                    <td class="description">
                      {{ invoice.description || 'Subscription payment' }}
                    </td>
                    <td class="amount">
                      {{ invoice.amount_cents / 100 | currency }}
                    </td>
                    <td class="status">
                      <mat-chip [class]="'status-' + invoice.status" size="small">
                        @switch (invoice.status) {
                          @case ('paid') {
                            <mat-icon>check_circle</mat-icon>
                            Paid
                          }
                          @case ('pending') {
                            <mat-icon>schedule</mat-icon>
                            Pending
                          }
                          @case ('failed') {
                            <mat-icon>error</mat-icon>
                            Failed
                          }
                          @default {
                            {{ invoice.status }}
                          }
                        }
                      </mat-chip>
                    </td>
                    <td class="actions">
                      <button mat-icon-button [matMenuTriggerFor]="actionMenu">
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #actionMenu="matMenu">
                        @if (invoice.invoice_pdf_url) {
                          <a mat-menu-item [href]="invoice.invoice_pdf_url" target="_blank">
                            <mat-icon>download</mat-icon>
                            <span>Download PDF</span>
                          </a>
                        }
                        @if (invoice.hosted_invoice_url) {
                          <a mat-menu-item [href]="invoice.hosted_invoice_url" target="_blank">
                            <mat-icon>open_in_new</mat-icon>
                            <span>View in Stripe</span>
                          </a>
                        }
                        <button mat-menu-item (click)="copyInvoiceId(invoice)">
                          <mat-icon>content_copy</mat-icon>
                          <span>Copy Invoice ID</span>
                        </button>
                      </mat-menu>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Pagination -->
          @if (invoices().length > pageSize) {
            <mat-paginator
              [length]="invoices().length"
              [pageSize]="pageSize"
              [pageSizeOptions]="[10, 25, 50]"
              (page)="onPageChange($event)"
              aria-label="Select page"
            ></mat-paginator>
          }
        }
      </mat-card>

      <!-- Help Section -->
      <div class="help-section">
        <h3>Need help with billing?</h3>
        <p>
          Contact our support team at
          <a href="mailto:billing@expensed.app">billing&#64;expensed.app</a>
          for questions about invoices, refunds, or payment issues.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .invoice-page {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 32px;
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

    .invoice-card {
      border-radius: 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      overflow: hidden;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: #666;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px 24px;
      text-align: center;
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #ccc;
      margin-bottom: 16px;
    }

    .empty-state h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .empty-state p {
      color: #666;
      margin: 0 0 24px;
    }

    /* Summary Stats */
    .invoice-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      padding: 24px;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
    }

    .stat-card mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: #ff5900;
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .stat-label {
      font-size: 0.75rem;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Invoice Table */
    .invoice-table-container {
      overflow-x: auto;
    }

    .invoice-table {
      width: 100%;
      border-collapse: collapse;
    }

    .invoice-table th {
      text-align: left;
      padding: 16px 24px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      background: #fafafa;
      border-bottom: 1px solid #e0e0e0;
    }

    .invoice-table td {
      padding: 16px 24px;
      border-bottom: 1px solid #f0f0f0;
      color: #1a1a2e;
    }

    .invoice-table tr:last-child td {
      border-bottom: none;
    }

    .invoice-table tr:hover td {
      background: #fafafa;
    }

    .date-cell {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .date-cell .date {
      font-weight: 500;
    }

    .date-cell .time {
      font-size: 0.75rem;
      color: #999;
    }

    .invoice-number code {
      font-family: 'SF Mono', 'Consolas', monospace;
      font-size: 0.875rem;
      background: #f5f5f5;
      padding: 4px 8px;
      border-radius: 4px;
      color: #666;
    }

    .description {
      color: #666;
    }

    .amount {
      font-weight: 600;
      font-family: 'SF Mono', 'Consolas', monospace;
    }

    .status mat-chip {
      font-size: 0.75rem;
      font-weight: 500;
    }

    .status mat-chip mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-right: 4px;
    }

    .status-paid {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-pending {
      background: #fff3e0 !important;
      color: #e65100 !important;
    }

    .status-failed {
      background: #ffebee !important;
      color: #c62828 !important;
    }

    .actions {
      text-align: center;
    }

    /* Pagination */
    ::ng-deep .mat-mdc-paginator {
      border-top: 1px solid #e0e0e0;
    }

    /* Help Section */
    .help-section {
      margin-top: 32px;
      padding: 24px;
      background: #f5f5f5;
      border-radius: 12px;
      text-align: center;
    }

    .help-section h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 8px;
      color: #1a1a2e;
    }

    .help-section p {
      color: #666;
      margin: 0;
    }

    .help-section a {
      color: #ff5900;
      text-decoration: none;
      font-weight: 500;
    }

    .help-section a:hover {
      text-decoration: underline;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .invoice-page {
        padding: 16px;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .invoice-summary {
        grid-template-columns: 1fr;
      }

      .invoice-table th,
      .invoice-table td {
        padding: 12px 16px;
      }

      .description {
        display: none;
      }
    }
  `],
})
export class InvoiceHistoryComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private organizationService = inject(OrganizationService);

  // State
  loading = signal(true);
  invoices = signal<SubscriptionInvoice[]>([]);
  pageIndex = 0;
  pageSize = 10;

  paginatedInvoices = signal<SubscriptionInvoice[]>([]);

  ngOnInit(): void {
    this.loadInvoices();
  }

  private loadInvoices(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      this.loading.set(false);
      return;
    }

    this.subscriptionService.getInvoices(orgId, 100).subscribe({
      next: (invoices) => {
        this.invoices.set(invoices);
        this.updatePaginatedInvoices();
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private updatePaginatedInvoices(): void {
    const start = this.pageIndex * this.pageSize;
    const end = start + this.pageSize;
    this.paginatedInvoices.set(this.invoices().slice(start, end));
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.updatePaginatedInvoices();
  }

  totalPaid(): number {
    return this.invoices()
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.amount_cents, 0) / 100;
  }

  lastPaymentDate(): Date | null {
    const paidInvoices = this.invoices().filter((inv) => inv.status === 'paid');
    if (paidInvoices.length === 0) return null;
    return new Date(paidInvoices[0].invoice_date);
  }

  getInvoiceNumber(invoice: SubscriptionInvoice): string {
    if (invoice.stripe_invoice_id) {
      return invoice.stripe_invoice_id.slice(-8).toUpperCase();
    }
    return invoice.id.slice(-8).toUpperCase();
  }

  copyInvoiceId(invoice: SubscriptionInvoice): void {
    const id = invoice.stripe_invoice_id || invoice.id;
    navigator.clipboard.writeText(id);
  }
}
