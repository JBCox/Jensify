import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { SubscriptionPlan, PlanFeatures } from '../../../core/models/subscription.model';
import { LoggerService } from '../../../core/services/logger.service';

/**
 * Plan List Component
 * Displays all subscription plans with their features and pricing
 */
@Component({
  selector: 'app-plan-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './plan-list.component.html',
  styles: [`
    .plan-list-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-left h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: white;
    }

    .subtitle {
      margin: 4px 0 0;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .loading-container, .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      text-align: center;
      gap: 16px;
    }

    .loading-container p, .error-container p {
      color: rgba(255, 255, 255, 0.7);
    }

    .error-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #f44336;
    }

    .table-card {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .plans-table {
      width: 100%;
    }

    .plans-table th {
      color: rgba(255, 255, 255, 0.7);
      font-weight: 500;
      background: transparent;
    }

    .plans-table td {
      color: white;
      border-bottom-color: rgba(255, 255, 255, 0.1);
    }

    .plan-name {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .plan-name strong {
      font-weight: 500;
    }

    .plan-description {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .price {
      font-weight: 500;
      color: #ff5900;
    }

    .price-detail {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .user-limit {
      color: rgba(255, 255, 255, 0.9);
    }

    .features-list {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: help;
    }

    .feature-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: rgba(255, 255, 255, 0.3);
    }

    .feature-icon.enabled {
      color: #4caf50;
    }

    .feature-count {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.5);
      margin-left: 8px;
    }

    .status-chips {
      display: flex;
      gap: 8px;
    }

    .status-chip {
      font-size: 0.7rem;
      min-height: 22px;
      padding: 4px 8px;
    }

    .status-chip.active {
      background: rgba(76, 175, 80, 0.2);
      color: #4caf50;
    }

    .status-chip.inactive {
      background: rgba(244, 67, 54, 0.2);
      color: #f44336;
    }

    .status-chip.public {
      background: rgba(33, 150, 243, 0.2);
      color: #2196f3;
    }

    .status-chip.private {
      background: rgba(255, 152, 0, 0.2);
      color: #ff9800;
    }

    .plan-row:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 24px;
      text-align: center;
      gap: 16px;
    }

    .empty-state mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: rgba(255, 255, 255, 0.3);
    }

    .empty-state p {
      color: rgba(255, 255, 255, 0.5);
    }
  `],
})
export class PlanListComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  isLoading = signal(true);
  error = signal<string | null>(null);
  plans = signal<SubscriptionPlan[]>([]);

  displayedColumns = [
    'name',
    'monthly_price',
    'annual_price',
    'user_limit',
    'features',
    'status',
    'actions',
  ];

  ngOnInit(): void {
    this.loadPlans();
  }

  private loadPlans(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.superAdminService.getAllPlans()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (plans) => {
          this.plans.set(plans);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.logger.error('Failed to load plans', err as Error, 'PlanListComponent.loadPlans');
          this.error.set('Failed to load subscription plans');
          this.isLoading.set(false);
        }
      });
  }

  refreshPlans(): void {
    this.loadPlans();
  }

  formatPrice(cents: number): string {
    if (cents === 0) return 'Free';
    return `$${(cents / 100).toFixed(2)}`;
  }

  formatUserLimit(plan: SubscriptionPlan): string {
    const min = plan.min_users;
    const max = plan.max_users;
    if (max === null) return `${min}+`;
    if (min === max) return `${min}`;
    return `${min}-${max}`;
  }

  getFeatureCount(features: PlanFeatures): number {
    let count = 0;
    if (features.stripe_payouts_enabled) count++;
    if (features.api_access_enabled) count++;
    if (features.mileage_gps_enabled) count++;
    if (features.multi_level_approval) count++;
    return count;
  }

  getFeaturesTooltip(features: PlanFeatures): string {
    const enabled: string[] = [];
    if (features.stripe_payouts_enabled) enabled.push('Stripe Payouts');
    if (features.api_access_enabled) enabled.push('API Access');
    if (features.mileage_gps_enabled) enabled.push('GPS Tracking');
    if (features.multi_level_approval) enabled.push('Multi-Level Approval');

    const support = `Support: ${features.support_level}`;
    const receipts = features.receipts_per_month
      ? `${features.receipts_per_month} receipts/month`
      : 'Unlimited receipts';

    return [...enabled, receipts, support].join('\n');
  }
}
