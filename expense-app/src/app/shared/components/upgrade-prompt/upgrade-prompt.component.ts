import {
  Component,
  ChangeDetectionStrategy,
  inject,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface UpgradePromptData {
  feature: string;
  description: string;
  icon?: string;
  requiredPlan?: 'starter' | 'team' | 'business' | 'enterprise';
  benefits?: string[];
}

/**
 * Upgrade Prompt Component
 *
 * Shown when a user on the Free plan tries to access a paid feature.
 * Can be used as:
 * - Dialog (via MatDialog.open)
 * - Inline component (via selector)
 *
 * Features:
 * - Shows what feature is locked
 * - Lists benefits of upgrading
 * - CTA to pricing page
 */
@Component({
  selector: 'app-upgrade-prompt',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="upgrade-prompt" [class.dialog-mode]="isDialog">
      <!-- Close Button (Dialog mode) -->
      @if (isDialog) {
        <button mat-icon-button class="close-btn" (click)="onClose()">
          <mat-icon>close</mat-icon>
        </button>
      }

      <!-- Icon -->
      <div class="prompt-icon">
        <mat-icon>{{ data.icon || 'lock' }}</mat-icon>
      </div>

      <!-- Content -->
      <h2>{{ data.feature }}</h2>
      <p class="description">{{ data.description }}</p>

      <!-- Benefits -->
      @if (data.benefits && data.benefits.length > 0) {
        <ul class="benefits">
          @for (benefit of data.benefits; track benefit) {
            <li>
              <mat-icon>check_circle</mat-icon>
              {{ benefit }}
            </li>
          }
        </ul>
      }

      <!-- Plan Badge -->
      @if (data.requiredPlan) {
        <div class="required-plan">
          Available on
          <span class="plan-badge">{{ data.requiredPlan | titlecase }}</span>
          and above
        </div>
      }

      <!-- CTA -->
      <div class="actions">
        <button
          mat-flat-button
          color="primary"
          class="upgrade-btn"
          (click)="onUpgrade()"
        >
          <mat-icon>rocket_launch</mat-icon>
          Upgrade Now
        </button>
        <button mat-stroked-button (click)="onViewPlans()">
          Compare Plans
        </button>
      </div>

      <!-- Note -->
      <p class="note">
        <mat-icon>info</mat-icon>
        Free 14-day trial for all paid plans. No credit card required.
      </p>
    </div>
  `,
  styles: [`
    .upgrade-prompt {
      padding: 32px;
      text-align: center;
      max-width: 400px;
      position: relative;
    }

    .upgrade-prompt.dialog-mode {
      padding: 40px;
    }

    .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      color: #666;
    }

    /* Icon */
    .prompt-icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #fff5f0, #ffe0cc);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }

    .prompt-icon mat-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #ff5900;
    }

    /* Content */
    h2 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1a1a2e;
      margin: 0 0 8px;
    }

    .description {
      font-size: 1rem;
      color: #666;
      margin: 0 0 20px;
      line-height: 1.5;
    }

    /* Benefits */
    .benefits {
      list-style: none;
      padding: 0;
      margin: 0 0 20px;
      text-align: left;
    }

    .benefits li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      font-size: 0.9rem;
      color: #333;
    }

    .benefits mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #4caf50;
    }

    /* Required Plan */
    .required-plan {
      font-size: 0.875rem;
      color: #666;
      margin-bottom: 20px;
    }

    .plan-badge {
      display: inline-block;
      background: linear-gradient(135deg, #ff5900, #ff7a33);
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.8rem;
      margin: 0 4px;
    }

    /* Actions */
    .actions {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }

    .upgrade-btn {
      padding: 14px 24px;
      font-size: 1rem;
      font-weight: 600;
      border-radius: 8px;
    }

    /* Note */
    .note {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 0.8rem;
      color: #999;
      margin: 0;
    }

    .note mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    /* Responsive */
    @media (max-width: 480px) {
      .upgrade-prompt {
        padding: 24px 16px;
      }

      h2 {
        font-size: 1.25rem;
      }
    }
  `],
})
export class UpgradePromptComponent {
  private router = inject(Router);
  private dialogRef = inject(MatDialogRef<UpgradePromptComponent>, { optional: true });
  private dialogData = inject<UpgradePromptData>(MAT_DIALOG_DATA, { optional: true });

  @Input() data: UpgradePromptData = {
    feature: 'Premium Feature',
    description: 'Upgrade your plan to access this feature.',
  };

  @Output() upgrade = new EventEmitter<void>();
  @Output() viewPlans = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  get isDialog(): boolean {
    return !!this.dialogRef;
  }

  constructor() {
    // If opened as dialog, use dialog data
    if (this.dialogData) {
      this.data = this.dialogData;
    }
  }

  onUpgrade(): void {
    this.upgrade.emit();
    if (this.dialogRef) {
      this.dialogRef.close('upgrade');
    }
    this.router.navigate(['/organization/billing/plans']);
  }

  onViewPlans(): void {
    this.viewPlans.emit();
    if (this.dialogRef) {
      this.dialogRef.close('view-plans');
    }
    this.router.navigate(['/pricing']);
  }

  onClose(): void {
    this.dismissed.emit();
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }
}
