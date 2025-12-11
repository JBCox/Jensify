import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  inject,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

export type BannerType = 'warning' | 'critical' | 'exceeded';

/**
 * Usage Limit Banner Component
 *
 * Displays a banner when users are approaching or have exceeded
 * their usage limits (e.g., receipts per month on Free plan).
 *
 * Banner types:
 * - warning: 70-89% of limit used
 * - critical: 90-99% of limit used
 * - exceeded: 100% or more (limit reached)
 *
 * Usage:
 * <app-usage-limit-banner
 *   resource="receipts"
 *   [used]="8"
 *   [limit]="10"
 *   [dismissible]="true"
 * ></app-usage-limit-banner>
 */
@Component({
  selector: 'app-usage-limit-banner',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!dismissed() && shouldShow()) {
      <div class="usage-banner" [class]="bannerType()">
        <div class="banner-content">
          <div class="banner-icon">
            <mat-icon>{{ bannerIcon() }}</mat-icon>
          </div>

          <div class="banner-text">
            <div class="banner-header">
              <strong>{{ bannerTitle() }}</strong>
              <span class="usage-count">{{ used }}/{{ limit }} {{ resource }}</span>
            </div>

            <mat-progress-bar
              mode="determinate"
              [value]="usagePercent()"
              [class]="bannerType()"
            ></mat-progress-bar>

            <p class="banner-message">{{ bannerMessage() }}</p>
          </div>

          <div class="banner-actions">
            <button mat-flat-button color="primary" (click)="onUpgrade()">
              <mat-icon>rocket_launch</mat-icon>
              @if (bannerType() === 'exceeded') {
                Upgrade Now
              } @else {
                Upgrade
              }
            </button>
          </div>

          @if (dismissible && bannerType() !== 'exceeded') {
            <button
              mat-icon-button
              class="dismiss-btn"
              (click)="onDismiss()"
              aria-label="Dismiss"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .usage-banner {
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    /* Banner Types */
    .usage-banner.warning {
      background: #fff8e1;
      border: 1px solid #ffcc02;
    }

    .usage-banner.critical {
      background: #fff3e0;
      border: 1px solid #ff9800;
    }

    .usage-banner.exceeded {
      background: #ffebee;
      border: 1px solid #f44336;
    }

    /* Content Layout */
    .banner-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    /* Icon */
    .banner-icon {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .warning .banner-icon {
      background: #fff8e1;
      color: #f9a825;
    }

    .critical .banner-icon {
      background: #fff3e0;
      color: #ef6c00;
    }

    .exceeded .banner-icon {
      background: #ffebee;
      color: #c62828;
    }

    .banner-icon mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    /* Text */
    .banner-text {
      flex: 1;
      min-width: 0;
    }

    .banner-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .banner-header strong {
      font-size: 0.9rem;
      color: #1a1a2e;
    }

    .usage-count {
      font-size: 0.8rem;
      font-weight: 600;
      font-family: 'SF Mono', monospace;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.05);
    }

    /* Progress Bar */
    ::ng-deep .usage-banner mat-progress-bar {
      height: 6px;
      border-radius: 3px;
      margin-bottom: 8px;
    }

    ::ng-deep .usage-banner.warning .mdc-linear-progress__bar-inner {
      border-color: #f9a825;
    }

    ::ng-deep .usage-banner.critical .mdc-linear-progress__bar-inner {
      border-color: #ef6c00;
    }

    ::ng-deep .usage-banner.exceeded .mdc-linear-progress__bar-inner {
      border-color: #c62828;
    }

    .banner-message {
      font-size: 0.8rem;
      color: #666;
      margin: 0;
    }

    /* Actions */
    .banner-actions button {
      font-weight: 600;
      white-space: nowrap;
    }

    .dismiss-btn {
      flex-shrink: 0;
      color: #999;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .banner-content {
        flex-wrap: wrap;
      }

      .banner-icon {
        display: none;
      }

      .banner-text {
        width: 100%;
      }

      .banner-actions {
        width: 100%;
        margin-top: 8px;
      }

      .banner-actions button {
        width: 100%;
      }

      .dismiss-btn {
        position: absolute;
        top: 4px;
        right: 4px;
      }

      .usage-banner {
        position: relative;
      }
    }
  `],
})
export class UsageLimitBannerComponent {
  private router = inject(Router);

  @Input() resource = 'items';
  @Input() used = 0;
  @Input() limit = 10;
  @Input() dismissible = true;

  @Output() dismiss = new EventEmitter<void>();
  @Output() upgrade = new EventEmitter<void>();

  dismissed = signal(false);

  usagePercent = computed(() => {
    if (this.limit === 0) return 100;
    return Math.min((this.used / this.limit) * 100, 100);
  });

  bannerType = computed((): BannerType => {
    const percent = this.usagePercent();
    if (percent >= 100) return 'exceeded';
    if (percent >= 90) return 'critical';
    return 'warning';
  });

  shouldShow = computed(() => {
    return this.usagePercent() >= 70;
  });

  bannerIcon = computed(() => {
    switch (this.bannerType()) {
      case 'exceeded':
        return 'error';
      case 'critical':
        return 'warning';
      default:
        return 'info';
    }
  });

  bannerTitle = computed(() => {
    switch (this.bannerType()) {
      case 'exceeded':
        return `${this.resource} limit reached`;
      case 'critical':
        return `Almost at ${this.resource} limit`;
      default:
        return `Approaching ${this.resource} limit`;
    }
  });

  bannerMessage = computed(() => {
    const remaining = Math.max(0, this.limit - this.used);
    switch (this.bannerType()) {
      case 'exceeded':
        return `Upgrade to continue using OCR for receipts. Current usage won't be affected.`;
      case 'critical':
        return `Only ${remaining} ${this.resource} remaining this month. Upgrade for unlimited.`;
      default:
        return `You've used ${this.used} of ${this.limit} ${this.resource}. Upgrade for unlimited.`;
    }
  });

  onDismiss(): void {
    this.dismissed.set(true);
    this.dismiss.emit();
  }

  onUpgrade(): void {
    this.upgrade.emit();
    this.router.navigate(['/organization/billing/plans']);
  }
}
