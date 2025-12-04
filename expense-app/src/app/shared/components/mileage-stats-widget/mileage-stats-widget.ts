import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonModule } from '@angular/material/button';
import { Subject, takeUntil } from 'rxjs';
import { MileageService } from '../../../core/services/mileage.service';
import { MileageStats } from '../../../core/models/mileage.model';

/**
 * Mileage Statistics Widget Component
 * Displays summary statistics for mileage trips with date filtering
 */
@Component({
  selector: 'app-mileage-stats-widget',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatButtonModule
  ],
  template: `
    <mat-card class="stats-widget">
      <mat-card-header>
        <mat-card-title>
          <div class="header-content">
            <div class="title-row">
              <mat-icon>analytics</mat-icon>
              <h3>Mileage Statistics</h3>
            </div>
            @if (dateRange()) {
              <span class="date-range">{{ dateRange() }}</span>
            }
          </div>
        </mat-card-title>
      </mat-card-header>

      <mat-card-content>
        @if (loading()) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Loading statistics...</p>
          </div>
        } @else if (error()) {
          <div class="error-container">
            <mat-icon>error</mat-icon>
            <p>{{ error() }}</p>
            <button mat-button color="primary" (click)="loadStats()">Retry</button>
          </div>
        } @else if (stats()) {
          <div class="stats-grid">
            <!-- Total Trips -->
            <div class="stat-card primary">
              <mat-icon>directions_car</mat-icon>
              <div class="stat-content">
                <span class="stat-value">{{ stats()!.totalTrips }}</span>
                <span class="stat-label">{{ stats()!.totalTrips === 1 ? 'Trip' : 'Trips' }}</span>
              </div>
            </div>

            <!-- Total Miles -->
            <div class="stat-card accent">
              <mat-icon>straighten</mat-icon>
              <div class="stat-content">
                <span class="stat-value">{{ stats()!.totalMiles.toFixed(1) }}</span>
                <span class="stat-label">Miles</span>
              </div>
            </div>

            <!-- Total Reimbursement -->
            <div class="stat-card success">
              <mat-icon>attach_money</mat-icon>
              <div class="stat-content">
                <span class="stat-value">{{ formatCurrency(stats()!.totalReimbursement) }}</span>
                <span class="stat-label">Reimbursement</span>
              </div>
            </div>

            <!-- Average Trip -->
            <div class="stat-card info">
              <mat-icon>timeline</mat-icon>
              <div class="stat-content">
                <span class="stat-value">{{ averageTripDistance().toFixed(1) }}</span>
                <span class="stat-label">Avg Miles/Trip</span>
              </div>
            </div>
          </div>

          <!-- Breakdown Sections -->
          @if (showBreakdown) {
            <div class="breakdowns">
              <!-- Status Breakdown -->
              <div class="breakdown-section">
                <h4>By Status</h4>
                <div class="breakdown-items">
                  @for (status of statusBreakdown(); track status.key) {
                    <div class="breakdown-item">
                      <span class="breakdown-label">{{ getStatusLabel(status.key) }}</span>
                      <span class="breakdown-value">{{ status.count }}</span>
                    </div>
                  }
                </div>
              </div>

              <!-- Category Breakdown -->
              <div class="breakdown-section">
                <h4>By Category</h4>
                <div class="breakdown-items">
                  @for (category of categoryBreakdown(); track category.key) {
                    <div class="breakdown-item">
                      <span class="breakdown-label">{{ getCategoryLabel(category.key) }}</span>
                      <span class="breakdown-value">{{ category.count }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .stats-widget {
      margin-bottom: 16px;
    }

    .header-content {
      width: 100%;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;

      mat-icon {
        color: var(--jensify-primary, #ff5900);
      }

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
    }

    .date-range {
      display: block;
      margin-top: 4px;
      font-size: 0.85rem;
      color: var(--jensify-text-muted, #666);
    }

    .loading-container,
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px;
      gap: 12px;

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--jensify-error, #d32f2f);
      }

      p {
        margin: 0;
        color: var(--jensify-text-muted, #666);
      }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }

    .stat-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-radius: 8px;
      background: var(--jensify-surface, #f5f5f5);
      transition: transform 0.2s, box-shadow 0.2s;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
      }

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }

      &.primary mat-icon {
        color: var(--jensify-primary, #ff5900);
      }

      &.accent mat-icon {
        color: var(--jensify-accent, #0066cc);
      }

      &.success mat-icon {
        color: var(--jensify-success, #4caf50);
      }

      &.info mat-icon {
        color: var(--jensify-info, #2196f3);
      }
    }

    .stat-content {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      line-height: 1;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .stat-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--jensify-text-muted, #666);
      font-weight: 500;
    }

    .breakdowns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--jensify-border, #e0e0e0);
    }

    .breakdown-section {
      h4 {
        margin: 0 0 12px 0;
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--jensify-text-strong, #1a1a1a);
      }
    }

    .breakdown-items {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .breakdown-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: var(--jensify-surface-light, #fafafa);
      border-radius: 4px;
    }

    .breakdown-label {
      font-size: 0.85rem;
      color: var(--jensify-text, #333);
    }

    .breakdown-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--jensify-primary, #ff5900);
    }

    /* Mobile responsive */
    @media (max-width: 640px) {
      .stats-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .stat-card {
        flex-direction: column;
        text-align: center;
        gap: 8px;
      }

      .breakdowns {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class MileageStatsWidgetComponent implements OnInit, OnDestroy {
  @Input() startDate?: string; // ISO date string
  @Input() endDate?: string;   // ISO date string
  @Input() showBreakdown = true; // Show status/category breakdowns

  loading = signal<boolean>(false);
  error = signal<string>('');
  stats = signal<MileageStats | null>(null);

  // Computed values
  averageTripDistance = computed(() => {
    const s = this.stats();
    if (!s || s.totalTrips === 0) return 0;
    return s.totalMiles / s.totalTrips;
  });

  statusBreakdown = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return Object.entries(s.tripsByStatus)
      .filter(([_, count]) => count > 0)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  });

  categoryBreakdown = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return Object.entries(s.tripsByCategory)
      .filter(([_, count]) => count > 0)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  });

  dateRange = computed(() => {
    if (!this.startDate && !this.endDate) return '';
    if (this.startDate && this.endDate) {
      return `${this.formatDate(this.startDate)} - ${this.formatDate(this.endDate)}`;
    }
    if (this.startDate) return `From ${this.formatDate(this.startDate)}`;
    if (this.endDate) return `Until ${this.formatDate(this.endDate)}`;
    return '';
  });

  private destroy$ = new Subject<void>();
  private mileageService = inject(MileageService);

  ngOnInit(): void {
    this.loadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadStats(): void {
    this.loading.set(true);
    this.error.set('');

    this.mileageService.getStats(this.startDate, this.endDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message || 'Failed to load statistics');
          this.loading.set(false);
        }
      });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Draft',
      submitted: 'Submitted',
      approved: 'Approved',
      rejected: 'Rejected',
      reimbursed: 'Reimbursed'
    };
    return labels[status] || status;
  }

  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      business: 'Business',
      medical: 'Medical',
      charity: 'Charity',
      moving: 'Moving'
    };
    return labels[category] || category;
  }
}
