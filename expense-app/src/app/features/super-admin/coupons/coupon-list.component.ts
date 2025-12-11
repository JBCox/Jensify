import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { CouponCode } from '../../../core/models/subscription.model';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

/**
 * Coupon List Component (Super Admin)
 *
 * Manages promotional coupon codes:
 * - View all coupons
 * - Create new coupons
 * - Deactivate coupons
 * - See redemption stats
 */
@Component({
  selector: 'app-coupon-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="coupon-page">
      <header class="page-header">
        <button mat-icon-button routerLink="../" class="back-button">
          <mat-icon>arrow_back</mat-icon>
        </button>
        <div class="header-content">
          <h1>Coupon Codes</h1>
          <p class="subtitle">Manage promotional discounts and offers</p>
        </div>
        <button mat-flat-button color="primary" routerLink="new">
          <mat-icon>add</mat-icon>
          Create Coupon
        </button>
      </header>

      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-card">
          <mat-icon>local_offer</mat-icon>
          <div class="stat-content">
            <span class="stat-value">{{ stats().total }}</span>
            <span class="stat-label">Total Coupons</span>
          </div>
        </div>
        <div class="stat-card active">
          <mat-icon>check_circle</mat-icon>
          <div class="stat-content">
            <span class="stat-value">{{ stats().active }}</span>
            <span class="stat-label">Active</span>
          </div>
        </div>
        <div class="stat-card">
          <mat-icon>redeem</mat-icon>
          <div class="stat-content">
            <span class="stat-value">{{ stats().totalRedemptions }}</span>
            <span class="stat-label">Redemptions</span>
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Loading coupons...</p>
        </div>
      } @else if (coupons().length === 0) {
        <mat-card class="empty-card">
          <mat-icon>local_offer</mat-icon>
          <h3>No coupons yet</h3>
          <p>Create your first coupon to offer discounts to customers</p>
          <button mat-flat-button color="primary" routerLink="new">
            <mat-icon>add</mat-icon>
            Create Coupon
          </button>
        </mat-card>
      } @else {
        <mat-card class="table-card">
          <div class="table-container">
            <table class="coupon-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Discount</th>
                  <th>Type</th>
                  <th>Redemptions</th>
                  <th>Valid Until</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (coupon of coupons(); track coupon.id) {
                  <tr [class.inactive]="!coupon.is_active">
                    <td class="code-cell">
                      <code>{{ coupon.code }}</code>
                      <button
                        mat-icon-button
                        class="copy-btn"
                        (click)="copyCode(coupon.code)"
                        matTooltip="Copy code"
                      >
                        <mat-icon>content_copy</mat-icon>
                      </button>
                    </td>
                    <td class="discount-cell">
                      @if (coupon.discount_type === 'percent') {
                        <span class="discount-value">{{ coupon.discount_value }}%</span>
                        <span class="discount-type">off</span>
                      } @else {
                        <span class="discount-value">{{ coupon.discount_value / 100 | currency }}</span>
                        <span class="discount-type">off</span>
                      }
                    </td>
                    <td>
                      <mat-chip size="small" [class]="'type-' + getAppliesTo(coupon)">
                        {{ getAppliesTo(coupon) | titlecase }}
                      </mat-chip>
                    </td>
                    <td class="redemptions-cell">
                      <span class="redemptions-count">{{ coupon.redemption_count || 0 }}</span>
                      @if (coupon.max_redemptions) {
                        <span class="redemptions-max">/ {{ coupon.max_redemptions }}</span>
                      }
                    </td>
                    <td class="date-cell">
                      @if (coupon.expires_at) {
                        {{ coupon.expires_at | date:'mediumDate' }}
                        @if (isExpired(coupon)) {
                          <mat-icon class="expired-icon" matTooltip="Expired">warning</mat-icon>
                        }
                      } @else {
                        <span class="no-expiry">Never</span>
                      }
                    </td>
                    <td>
                      <mat-chip [class]="coupon.is_active ? 'status-active' : 'status-inactive'" size="small">
                        {{ coupon.is_active ? 'Active' : 'Inactive' }}
                      </mat-chip>
                    </td>
                    <td class="actions-cell">
                      <button mat-icon-button [matMenuTriggerFor]="actionMenu">
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #actionMenu="matMenu">
                        <button mat-menu-item (click)="copyCode(coupon.code)">
                          <mat-icon>content_copy</mat-icon>
                          <span>Copy Code</span>
                        </button>
                        @if (coupon.is_active) {
                          <button mat-menu-item (click)="deactivateCoupon(coupon)">
                            <mat-icon>block</mat-icon>
                            <span>Deactivate</span>
                          </button>
                        }
                      </mat-menu>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .coupon-page {
      padding: 24px;
      max-width: 1200px;
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

    /* Stats */
    .stats-row {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 24px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .stat-card mat-icon {
      font-size: 24px;
      color: #666;
    }

    .stat-card.active mat-icon {
      color: #4caf50;
    }

    .stat-content {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #666;
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
      margin: 0 0 24px;
    }

    /* Table */
    .table-card {
      border-radius: 12px;
      overflow: hidden;
    }

    .table-container {
      overflow-x: auto;
    }

    .coupon-table {
      width: 100%;
      border-collapse: collapse;
    }

    .coupon-table th {
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

    .coupon-table td {
      padding: 16px 20px;
      border-bottom: 1px solid #f0f0f0;
      vertical-align: middle;
    }

    .coupon-table tr.inactive {
      opacity: 0.6;
    }

    .code-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .code-cell code {
      font-size: 1rem;
      font-weight: 600;
      background: #f5f5f5;
      padding: 6px 12px;
      border-radius: 6px;
      color: #1a1a2e;
    }

    .copy-btn {
      width: 32px;
      height: 32px;
    }

    .copy-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .discount-cell {
      white-space: nowrap;
    }

    .discount-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ff5900;
    }

    .discount-type {
      color: #666;
      margin-left: 4px;
    }

    .type-all_plans {
      background: #e3f2fd !important;
      color: #1565c0 !important;
    }

    .type-first_month {
      background: #f3e5f5 !important;
      color: #7b1fa2 !important;
    }

    .type-annual_only {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .redemptions-cell {
      font-family: monospace;
    }

    .redemptions-count {
      font-weight: 600;
      color: #1a1a2e;
    }

    .redemptions-max {
      color: #999;
    }

    .date-cell {
      color: #666;
      white-space: nowrap;
    }

    .expired-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #f57c00;
      margin-left: 4px;
      vertical-align: middle;
    }

    .no-expiry {
      color: #999;
      font-style: italic;
    }

    .status-active {
      background: #e8f5e9 !important;
      color: #2e7d32 !important;
    }

    .status-inactive {
      background: #f5f5f5 !important;
      color: #666 !important;
    }

    .actions-cell {
      text-align: center;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .coupon-page {
        padding: 16px;
      }

      .page-header {
        flex-wrap: wrap;
      }

      .page-header h1 {
        font-size: 1.5rem;
      }

      .stats-row {
        flex-direction: column;
      }

      .stat-card {
        flex: 1;
      }
    }
  `],
})
export class CouponListComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private dialog = inject(MatDialog);

  loading = signal(true);
  coupons = signal<CouponCode[]>([]);
  stats = signal({ total: 0, active: 0, totalRedemptions: 0 });

  ngOnInit(): void {
    this.loadCoupons();
  }

  private loadCoupons(): void {
    this.superAdminService.getAllCoupons().subscribe({
      next: (coupons) => {
        this.coupons.set(coupons);
        this.calculateStats(coupons);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private calculateStats(coupons: CouponCode[]): void {
    this.stats.set({
      total: coupons.length,
      active: coupons.filter((c) => c.is_active).length,
      totalRedemptions: coupons.reduce((sum, c) => sum + (c.redemption_count || 0), 0),
    });
  }

  isExpired(coupon: CouponCode): boolean {
    if (!coupon.expires_at) return false;
    return new Date(coupon.expires_at) < new Date();
  }

  copyCode(code: string): void {
    navigator.clipboard.writeText(code);
  }

  deactivateCoupon(coupon: CouponCode): void {
    const dialogData: ConfirmDialogData = {
      title: 'Deactivate Coupon',
      message: `Deactivate coupon "${coupon.code}"? This cannot be undone.`,
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'block',
      iconColor: '#f57c00',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.superAdminService.deactivateCoupon(coupon.id).subscribe({
          next: () => this.loadCoupons(),
        });
      }
    });
  }

  getAppliesTo(coupon: CouponCode): string {
    // applies_to is string[] but we need a string for display
    if (Array.isArray(coupon.applies_to)) {
      return coupon.applies_to.join(', ') || 'all_plans';
    }
    return (coupon.applies_to as unknown as string) || 'all_plans';
  }
}
