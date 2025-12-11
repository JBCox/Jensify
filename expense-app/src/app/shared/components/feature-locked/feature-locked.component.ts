import { Component, ChangeDetectionStrategy, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Feature Locked Component
 *
 * An overlay component that covers UI elements that are locked
 * for Free tier users. Can be placed over cards, sections, or
 * entire pages.
 *
 * Usage:
 * <div class="feature-container">
 *   <app-feature-locked
 *     *ngIf="!hasAccess"
 *     feature="GPS Mileage Tracking"
 *     description="Automatically track and calculate mileage for reimbursement"
 *     icon="gps_fixed"
 *   ></app-feature-locked>
 *   <app-mileage-tracker></app-mileage-tracker>
 * </div>
 */
@Component({
  selector: 'app-feature-locked',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="feature-locked-overlay" [class.blur-background]="blurBackground">
      <div class="locked-content">
        <div class="lock-icon">
          <mat-icon>{{ icon }}</mat-icon>
          <div class="lock-badge">
            <mat-icon>lock</mat-icon>
          </div>
        </div>

        <h3>{{ feature }}</h3>
        <p>{{ description }}</p>

        <button mat-flat-button color="primary" (click)="onUpgrade()">
          <mat-icon>rocket_launch</mat-icon>
          Upgrade to Unlock
        </button>

        <a class="learn-more" routerLink="/pricing">
          Compare all plans <mat-icon>arrow_forward</mat-icon>
        </a>
      </div>
    </div>
  `,
  styles: [`
    .feature-locked-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.95);
      z-index: 10;
      border-radius: inherit;
    }

    .feature-locked-overlay.blur-background {
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(4px);
    }

    .locked-content {
      text-align: center;
      padding: 32px;
      max-width: 320px;
    }

    /* Lock Icon */
    .lock-icon {
      position: relative;
      width: 72px;
      height: 72px;
      margin: 0 auto 20px;
    }

    .lock-icon > mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #ccc;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    .lock-badge {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: linear-gradient(135deg, #ff5900, #ff7a33);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(255, 89, 0, 0.3);
    }

    .lock-badge mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: white;
    }

    /* Content */
    h3 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 8px;
    }

    p {
      font-size: 0.9rem;
      color: #666;
      margin: 0 0 20px;
      line-height: 1.5;
    }

    button {
      padding: 12px 24px;
      font-weight: 600;
      border-radius: 8px;
    }

    .learn-more {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      margin-top: 16px;
      font-size: 0.85rem;
      color: #ff5900;
      text-decoration: none;
      font-weight: 500;
    }

    .learn-more mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .learn-more:hover {
      text-decoration: underline;
    }

    /* Animation */
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.05); }
    }

    .lock-badge {
      animation: pulse 2s ease-in-out infinite;
    }
  `],
})
export class FeatureLockedComponent {
  private router = inject(Router);

  @Input() feature = 'Premium Feature';
  @Input() description = 'Upgrade your plan to access this feature.';
  @Input() icon = 'star';
  @Input() blurBackground = false;

  onUpgrade(): void {
    this.router.navigate(['/organization/billing/plans']);
  }
}
